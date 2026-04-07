#!/usr/bin/env python3
"""
Parallel flow runner for 3D IC design.
Runs bottom_die and top_die simultaneously from 1_1, with dependency:
top_die's 3_2_place_iop depends on bottom_die's 3_2_place_iop completion.
"""

import subprocess
import threading
import time
import os
import sys
from pathlib import Path
from dataclasses import dataclass

FLOW_HOME = Path(__file__).parent.resolve()
BOTTOM_CONFIG = "designs/180_180/bottom_die/config.mk"
TOP_CONFIG = "designs/180_180/top_die/config.mk"
FLOW_VARIANT = "withoutcluster"

# Timeout for waiting bottom_die 3_2 completion (seconds)
DEPENDENCY_TIMEOUT = 600


@dataclass
class RunResult:
    """Result of a flow run."""
    name: str
    exit_code: int
    failed_at: str = None


class FlowRunner:
    """Runner for a single design flow."""

    def __init__(self, name: str, config_path: str):
        self.name = name
        self.config_path = config_path
        self.env = os.environ.copy()
        self.env["DESIGN_CONFIG"] = config_path
        self.process = None

    def run_make(self, target: str = None) -> subprocess.Popen:
        """Run make with optional target."""
        cmd = ["make"]
        if target:
            cmd.append(target)

        self.process = subprocess.Popen(
            cmd,
            cwd=FLOW_HOME,
            env=self.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        return self.process

    def wait_for_process(self) -> int:
        """Wait for process to complete and return exit code."""
        if self.process:
            return self.process.wait()
        return -1

    def stream_output(self, prefix: str = ""):
        """Stream process output with prefix."""
        if self.process and self.process.stdout:
            for line in self.process.stdout:
                print(f"[{prefix}] {line.rstrip()}")


def run_make_targets(runner: FlowRunner, targets: list, die_name: str,
                     signal_event: threading.Event = None,
                     signal_after: str = None,
                     stop_event: threading.Event = None) -> RunResult:
    """
    Run a list of make targets.

    Args:
        runner: FlowRunner instance
        targets: List of make targets to run
        die_name: Name of the die for logging
        signal_event: Event to signal after specific target
        signal_after: Target name after which to signal
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    for target in targets:
        # Check for early termination
        if stop_event and stop_event.is_set():
            print(f"[{die_name}] Stopped due to other die failure")
            return RunResult(name=die_name, exit_code=-1, failed_at="early_stop")

        process = runner.run_make(target)
        runner.stream_output(die_name)
        exit_code = runner.wait_for_process()

        if exit_code != 0:
            print(f"[{die_name}] Failed at {target}")
            return RunResult(name=die_name, exit_code=exit_code, failed_at=target)

        # Signal event if specified target is completed
        if signal_event and signal_after and target == signal_after:
            print(f"[{die_name}] {target} completed. Signaling...")
            signal_event.set()

    return RunResult(name=die_name, exit_code=0)


def get_flow_targets():
    """Get the complete list of flow targets."""
    return {
        "synth": [
            "synth",
        ],
        "floorplan": [
            "do-2_1_floorplan",
            "do-2_2_floorplan_io",
            "do-2_3_floorplan_tdms",
            "do-2_4_floorplan_macro",
            "do-2_5_floorplan_tapcell",
            "do-2_6_floorplan_pdn",
            "do-2_floorplan",
        ],
        "place_before_3_2": [
            "do-3_1_place_gp_skip_io",
        ],
        "place_3_2": [
            "do-3_2_place_iop",
        ],
        "place_after_3_2": [
            "do-3_3_place_gp",
            "do-3_4_place_resized",
            "do-3_5_place_dp",
            "do-3_place",
            "do-3_place.sdc",
        ],
        "cts": [
            "do-4_1_cts",
            "do-4_cts",
        ],
        "route": [
            "do-5_1_grt",
            "do-5_2_fillcell",
            "do-5_3_route",
            "do-5_route",
            "do-5_route.sdc",
        ],
        "finish": [
            "do-6_1_fill",
            "do-6_1_fill.sdc",
            "do-6_final.sdc",
            "do-6_report",
            "do-gds",
            "elapsed",
        ],
    }


def get_full_flow_targets() -> list:
    """Get the complete list of all flow targets in order."""
    targets = get_flow_targets()
    return (
        targets["synth"] +
        targets["floorplan"] +
        targets["place_before_3_2"] +
        targets["place_3_2"] +
        targets["place_after_3_2"] +
        targets["cts"] +
        targets["route"] +
        targets["finish"]
    )


def run_bottom_die(signal_event: threading.Event, stop_event: threading.Event) -> RunResult:
    """
    Run bottom_die flow completely, signaling 3_2 completion.

    Args:
        signal_event: Event to signal after 3_2 completion
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    runner = FlowRunner("bottom_die", BOTTOM_CONFIG)
    print(f"[bottom_die] Starting full flow...")

    targets = get_flow_targets()

    # Run synthesis
    result = run_make_targets(
        runner, targets["synth"], "bottom_die",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run floorplan
    result = run_make_targets(
        runner, targets["floorplan"], "bottom_die",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run place before 3_2
    result = run_make_targets(
        runner, targets["place_before_3_2"], "bottom_die",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run 3_2 and signal completion
    result = run_make_targets(
        runner, targets["place_3_2"], "bottom_die",
        signal_event=signal_event,
        signal_after="do-3_2_place_iop",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        # Signal failure so top_die doesn't wait forever
        signal_event.set()
        stop_event.set()
        return result

    # Run remaining steps
    remaining = targets["place_after_3_2"] + targets["cts"] + targets["route"] + targets["finish"]
    result = run_make_targets(runner, remaining, "bottom_die", stop_event=stop_event)

    if result.exit_code == 0:
        print(f"[bottom_die] Flow completed successfully!")
    else:
        stop_event.set()
    return result


def run_top_die(signal_event: threading.Event, stop_event: threading.Event) -> RunResult:
    """
    Run top_die flow, waiting for bottom_die 3_2 completion before 3_2.

    Args:
        signal_event: Event to wait for bottom 3_2 completion
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    runner = FlowRunner("top_die", TOP_CONFIG)
    print(f"[top_die] Starting full flow...")

    targets = get_flow_targets()

    # Run synthesis
    result = run_make_targets(
        runner, targets["synth"], "top_die",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run floorplan and place before 3_2
    phase1 = targets["floorplan"] + targets["place_before_3_2"]
    result = run_make_targets(runner, phase1, "top_die", stop_event=stop_event)
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Wait for bottom_die's 3_2 completion
    print(f"[top_die] Reached 3_1. Waiting for bottom_die's 3_2_place_iop...")
    if not signal_event.wait(timeout=DEPENDENCY_TIMEOUT):
        print(f"[top_die] Timeout waiting for bottom_die 3_2_place_iop!")
        stop_event.set()
        return RunResult(name="top_die", exit_code=-1, failed_at="dependency_timeout")

    # Check if bottom failed
    if stop_event.is_set():
        print(f"[top_die] bottom_die failed, stopping...")
        return RunResult(name="top_die", exit_code=-1, failed_at="dependency_failed")

    print(f"[top_die] bottom_die's 3_2_place_iop completed. Continuing...")

    # Run 3_2 for top_die
    result = run_make_targets(runner, targets["place_3_2"], "top_die", stop_event=stop_event)
    if result.exit_code != 0:
        return result

    # Run remaining steps
    remaining = targets["place_after_3_2"] + targets["cts"] + targets["route"] + targets["finish"]
    result = run_make_targets(runner, remaining, "top_die", stop_event=stop_event)

    if result.exit_code == 0:
        print(f"[top_die] Flow completed successfully!")
    return result


def run_parallel() -> int:
    """Run both flows in parallel with dependency management."""
    # Create events for this run
    bottom_3_2_completed = threading.Event()
    stop_event = threading.Event()

    print("=" * 60)
    print("Starting parallel 3D IC flow execution")
    print("=" * 60)
    print(f"bottom_die config: {BOTTOM_CONFIG}")
    print(f"top_die config: {TOP_CONFIG}")
    print(f"Dependency: top_die 3_2_place_iop waits for bottom_die 3_2_place_iop")
    print(f"Timeout: {DEPENDENCY_TIMEOUT}s")
    print("=" * 60)

    # Results storage
    results = {"bottom": None, "top": None}

    def bottom_thread_func():
        results["bottom"] = run_bottom_die(bottom_3_2_completed, stop_event)

    def top_thread_func():
        results["top"] = run_top_die(bottom_3_2_completed, stop_event)

    # Create and start threads
    bottom_thread = threading.Thread(target=bottom_thread_func)
    top_thread = threading.Thread(target=top_thread_func)

    bottom_thread.start()
    top_thread.start()

    # Wait for both to complete
    bottom_thread.join()
    top_thread.join()

    # Print results
    print("=" * 60)
    print("Flow execution completed")
    print("=" * 60)

    for die, result in [("bottom_die", results["bottom"]), ("top_die", results["top"])]:
        if result:
            status = "SUCCESS" if result.exit_code == 0 else "FAILED"
            failed_at = f" at {result.failed_at}" if result.failed_at else ""
            print(f"[{die}] {status}{failed_at} (exit code: {result.exit_code})")
        else:
            print(f"[{die}] No result")

    print("=" * 60)

    # Return the worst exit code
    exit_codes = [r.exit_code for r in [results["bottom"], results["top"]] if r]
    return max(exit_codes) if exit_codes else 0


def run_sequential():
    """Run flows sequentially (bottom first, then top)."""
    # Create events for this run
    bottom_3_2_completed = threading.Event()
    stop_event = threading.Event()

    print("=" * 60)
    print("Starting sequential 3D IC flow execution")
    print("=" * 60)

    # Run bottom_die first
    print("\n[Phase 1] Running bottom_die...")
    bottom_result = run_bottom_die(bottom_3_2_completed, stop_event)

    if bottom_result.exit_code != 0:
        print(f"[bottom_die] Failed at {bottom_result.failed_at}, skipping top_die")
        return bottom_result.exit_code

    # Run top_die after bottom completes
    print("\n[Phase 2] Running top_die...")
    top_result = run_top_die(bottom_3_2_completed, stop_event)

    print("=" * 60)
    print(f"bottom_die: exit code {bottom_result.exit_code}")
    print(f"top_die: exit code {top_result.exit_code}")
    print("=" * 60)

    return max(bottom_result.exit_code, top_result.exit_code)


def run_single_die(die_name: str) -> int:
    """Run a single die flow."""
    config = BOTTOM_CONFIG if die_name == "bottom" else TOP_CONFIG
    runner = FlowRunner(die_name + "_die", config)

    print(f"[{die_name}_die] Starting full flow...")
    print("=" * 60)

    all_targets = get_full_flow_targets()

    result = run_make_targets(runner, all_targets, die_name + "_die")

    if result.exit_code == 0:
        print(f"[{die_name}_die] Flow completed successfully!")
    else:
        print(f"[{die_name}_die] Failed at {result.failed_at}")

    return result.exit_code


def clean_die(name: str, config_path: str) -> int:
    """Clean the specified die's build artifacts."""
    runner = FlowRunner(name, config_path)
    print(f"[{name}] Cleaning build artifacts...")

    process = runner.run_make("clean_all")
    runner.stream_output(name)
    exit_code = runner.wait_for_process()

    if exit_code == 0:
        print(f"[{name}] Clean completed successfully!")
    else:
        print(f"[{name}] Clean failed with exit code {exit_code}")

    return exit_code


def clean_all() -> int:
    """Clean both dies."""
    print("=" * 60)
    print("Cleaning all dies")
    print("=" * 60)

    bottom_exit = clean_die("bottom_die", BOTTOM_CONFIG)
    top_exit = clean_die("top_die", TOP_CONFIG)

    print("=" * 60)
    print(f"bottom_die clean exit code: {bottom_exit}")
    print(f"top_die clean exit code: {top_exit}")
    print("=" * 60)

    return max(bottom_exit, top_exit)


def main():
    """Main entry point."""
    import argparse

    global DEPENDENCY_TIMEOUT

    parser = argparse.ArgumentParser(description="Run 3D IC design flow")
    parser.add_argument(
        "--mode",
        choices=["parallel", "sequential"],
        default="parallel",
        help="Execution mode: parallel (default) or sequential"
    )
    parser.add_argument(
        "--die",
        choices=["bottom", "top", "both"],
        default="both",
        help="Which die to run: bottom, top, or both (default)"
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean build artifacts instead of running flow"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEPENDENCY_TIMEOUT,
        help=f"Timeout for dependency wait in seconds (default: {DEPENDENCY_TIMEOUT})"
    )

    args = parser.parse_args()

    # Set global timeout
    DEPENDENCY_TIMEOUT = args.timeout

    # Handle clean mode
    if args.clean:
        if args.die == "bottom":
            return clean_die("bottom_die", BOTTOM_CONFIG)
        elif args.die == "top":
            return clean_die("top_die", TOP_CONFIG)
        else:
            return clean_all()

    # Handle run mode
    if args.die == "bottom":
        return run_single_die("bottom")
    elif args.die == "top":
        return run_single_die("top")
    else:
        if args.mode == "parallel":
            return run_parallel()
        else:
            return run_sequential()


if __name__ == "__main__":
    sys.exit(main())