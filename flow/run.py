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


def run_python_script(
    script_path: str,
    args: list,
    die_name: str,
    stop_event: threading.Event = None
) -> RunResult:
    """
    Run a Python script with arguments.

    Args:
        script_path: Path to Python script
        args: List of arguments to pass to script
        die_name: Name of the die for logging
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    # Check for early termination
    if stop_event and stop_event.is_set():
        print(f"[{die_name}] Stopped due to other die failure")
        return RunResult(name=die_name, exit_code=-1, failed_at="early_stop")

    cmd = ["python3", script_path] + args
    print(f"[{die_name}] Running: {' '.join(cmd)}")

    process = subprocess.Popen(
        cmd,
        cwd=FLOW_HOME,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Stream output
    if process.stdout:
        for line in process.stdout:
            print(f"[{die_name}] {line.rstrip()}")

    exit_code = process.wait()

    if exit_code != 0:
        print(f"[{die_name}] Python script failed: {script_path}")
        return RunResult(name=die_name, exit_code=exit_code, failed_at=f"python:{script_path}")

    return RunResult(name=die_name, exit_code=0)


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


def get_def_path(die_name: str) -> str:
    """Get the path to the DEF file for a die."""
    return str(FLOW_HOME / "results" / "180_180" / die_name / FLOW_VARIANT / "3_1_place_gp_skip_io.def")


def run_io_placement_2d(
    die_name: str,
    def_file: str,
    output_dir: str,
    stop_event: threading.Event = None
) -> RunResult:
    """
    Run place_io_2d.py to generate 2D IO placement TCL script.

    Args:
        die_name: Name of the die for logging (bottom_die or top_die)
        def_file: Path to DEF file (3_1_place_gp_skip_io.def)
        output_dir: Output directory for generated TCL files
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    script_path = str(FLOW_HOME / "scripts" / "place_io_2d.py")

    # Extract short die name (bottom or top)
    short_name = "bottom" if "bottom" in die_name else "top"

    args = [
        "--def_file", def_file,
        "--output_dir", output_dir,
        "--die_name", short_name,
        "--seed", "42",
        "--pitch_um", "10.0",
        "--margin_um", "20.0",
        "--min_spacing_um", "5.0"
    ]

    return run_python_script(script_path, args, die_name, stop_event)


def run_io_placement_3d(
    die_name: str,
    bottom_def: str,
    top_def: str,
    output_dir: str,
    top_output_dir: str = None,
    stop_event: threading.Event = None
) -> RunResult:
    """
    Run place_io_3dic.py to generate 3D IO placement TCL scripts.

    Args:
        die_name: Name of the die for logging
        bottom_def: Path to bottom die DEF file
        top_def: Path to top die DEF file
        output_dir: Output directory for bottom die generated TCL files
        top_output_dir: Output directory for top die generated TCL files
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    script_path = str(FLOW_HOME / "scripts" / "place_io_3dic.py")

    args = [
        "--method", "array",
        "--bottom_def", bottom_def,
        "--top_def", top_def,
        "--output_dir", output_dir,
        "--seed", "42",
        "--min_spacing_um", "5.0"
    ]

    if top_output_dir:
        args.extend(["--top_output_dir", top_output_dir])

    return run_python_script(script_path, args, die_name, stop_event)


def run_die_phase1(
    die_name: str,
    config_path: str,
    completed_event: threading.Event,
    stop_event: threading.Event
) -> RunResult:
    """
    Run Phase 1: synthesis -> floorplan -> 3_1_place_gp_skip_io.

    Args:
        die_name: Name of the die (bottom_die or top_die)
        config_path: Path to design config
        completed_event: Event to signal after 3_1 completion
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    runner = FlowRunner(die_name, config_path)
    print(f"[{die_name}] Starting Phase 1 (synth -> floorplan -> 3_1)...")

    targets = get_flow_targets()

    # Run synthesis
    result = run_make_targets(
        runner, targets["synth"], die_name,
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run floorplan
    result = run_make_targets(
        runner, targets["floorplan"], die_name,
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run 3_1_place_gp_skip_io
    result = run_make_targets(
        runner, targets["place_before_3_2"], die_name,
        signal_event=completed_event,
        signal_after="do-3_1_place_gp_skip_io",
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    print(f"[{die_name}] Phase 1 completed (3_1_place_gp_skip_io done)")
    return result


def run_die_phase2(
    die_name: str,
    config_path: str,
    stop_event: threading.Event
) -> RunResult:
    """
    Run Phase 2: 3_2_place_iop -> remaining steps.

    Args:
        die_name: Name of the die (bottom_die or top_die)
        config_path: Path to design config
        stop_event: Event to check for early termination

    Returns:
        RunResult with exit code and failure info
    """
    runner = FlowRunner(die_name, config_path)
    print(f"[{die_name}] Starting Phase 2 (3_2_place_iop -> finish)...")

    targets = get_flow_targets()

    # Run 3_2_place_iop
    result = run_make_targets(
        runner, targets["place_3_2"], die_name,
        stop_event=stop_event
    )
    if result.exit_code != 0:
        stop_event.set()
        return result

    # Run remaining steps
    remaining = targets["place_after_3_2"] + targets["cts"] + targets["route"] + targets["finish"]
    result = run_make_targets(runner, remaining, die_name, stop_event=stop_event)

    if result.exit_code == 0:
        print(f"[{die_name}] Phase 2 completed successfully!")
    else:
        stop_event.set()

    return result


def run_parallel() -> int:
    """Run both flows in parallel with 3-phase execution."""
    # Create events for this run
    bottom_3_1_completed = threading.Event()
    top_3_1_completed = threading.Event()
    stop_event = threading.Event()

    print("=" * 60)
    print("Starting parallel 3D IC flow execution")
    print("=" * 60)
    print(f"bottom_die config: {BOTTOM_CONFIG}")
    print(f"top_die config: {TOP_CONFIG}")
    print(f"Flow: Phase1 (3_1) -> Python IO placement -> Phase2 (3_2 -> finish)")
    print(f"Timeout: {DEPENDENCY_TIMEOUT}s")
    print("=" * 60)

    # =========================================================================
    # Phase 1: Run both dies up to 3_1_place_gp_skip_io concurrently
    # =========================================================================
    print("\n[Phase 1] Running both dies up to 3_1_place_gp_skip_io...")
    print("-" * 60)

    phase1_results = {"bottom": None, "top": None}

    def bottom_phase1_thread():
        phase1_results["bottom"] = run_die_phase1(
            "bottom_die", BOTTOM_CONFIG, bottom_3_1_completed, stop_event
        )

    def top_phase1_thread():
        phase1_results["top"] = run_die_phase1(
            "top_die", TOP_CONFIG, top_3_1_completed, stop_event
        )

    # Start Phase 1 threads
    bottom_thread = threading.Thread(target=bottom_phase1_thread)
    top_thread = threading.Thread(target=top_phase1_thread)

    bottom_thread.start()
    top_thread.start()

    # Wait for both to complete Phase 1
    bottom_thread.join()
    top_thread.join()

    # Check Phase 1 results
    if phase1_results["bottom"].exit_code != 0:
        print(f"[ERROR] bottom_die failed in Phase 1 at {phase1_results['bottom'].failed_at}")
        return phase1_results["bottom"].exit_code

    if phase1_results["top"].exit_code != 0:
        print(f"[ERROR] top_die failed in Phase 1 at {phase1_results['top'].failed_at}")
        return phase1_results["top"].exit_code

    print("\n[Phase 1] Both dies completed 3_1_place_gp_skip_io successfully")

    # =========================================================================
    # Phase 2: Run Python script for IO placement (sequential, only once)
    # =========================================================================
    print("\n[Phase 2] Running IO placement Python script...")
    print("-" * 60)

    bottom_def = get_def_path("bottom_die")
    top_def = get_def_path("top_die")
    output_dir = str(FLOW_HOME / "results" / "180_180" / "bottom_die" / FLOW_VARIANT)
    top_output_dir = str(FLOW_HOME / "results" / "180_180" / "top_die" / FLOW_VARIANT)

    # Run 3D IO placement (handles both interconnect and non-interconnect signals)
    result = run_io_placement_3d(
        "flow", bottom_def, top_def, output_dir, top_output_dir, stop_event
    )

    if result.exit_code != 0:
        print(f"[ERROR] 3D IO placement Python script failed!")
        return result.exit_code

    print("[Phase 2] IO placement TCL scripts generated successfully")

    # =========================================================================
    # Phase 3: Run both dies from 3_2_place_iop to finish concurrently
    # =========================================================================
    print("\n[Phase 3] Running both dies from 3_2_place_iop to finish...")
    print("-" * 60)

    phase2_results = {"bottom": None, "top": None}

    def bottom_phase2_thread():
        phase2_results["bottom"] = run_die_phase2(
            "bottom_die", BOTTOM_CONFIG, stop_event
        )

    def top_phase2_thread():
        phase2_results["top"] = run_die_phase2(
            "top_die", TOP_CONFIG, stop_event
        )

    # Start Phase 3 threads
    bottom_thread = threading.Thread(target=bottom_phase2_thread)
    top_thread = threading.Thread(target=top_phase2_thread)

    bottom_thread.start()
    top_thread.start()

    # Wait for both to complete Phase 3
    bottom_thread.join()
    top_thread.join()

    # Print final results
    print("\n" + "=" * 60)
    print("Flow execution completed")
    print("=" * 60)

    for die, result in [("bottom_die", phase2_results["bottom"]), ("top_die", phase2_results["top"])]:
        if result:
            status = "SUCCESS" if result.exit_code == 0 else "FAILED"
            failed_at = f" at {result.failed_at}" if result.failed_at else ""
            print(f"[{die}] {status}{failed_at} (exit code: {result.exit_code})")
        else:
            print(f"[{die}] No result")

    print("=" * 60)

    # Return the worst exit code
    exit_codes = [r.exit_code for r in [phase2_results["bottom"], phase2_results["top"]] if r]
    return max(exit_codes) if exit_codes else 0


def run_sequential():
    """Run flows sequentially with 3-phase execution."""
    stop_event = threading.Event()

    print("=" * 60)
    print("Starting sequential 3D IC flow execution")
    print("=" * 60)
    print(f"Flow: Phase1 (3_1) -> Python IO placement -> Phase2 (3_2 -> finish)")
    print("=" * 60)

    # =========================================================================
    # Phase 1: Run bottom_die up to 3_1_place_gp_skip_io
    # =========================================================================
    print("\n[Phase 1a] Running bottom_die up to 3_1_place_gp_skip_io...")
    print("-" * 60)

    bottom_dummy_event = threading.Event()
    bottom_phase1_result = run_die_phase1(
        "bottom_die", BOTTOM_CONFIG, bottom_dummy_event, stop_event
    )

    if bottom_phase1_result.exit_code != 0:
        print(f"[ERROR] bottom_die failed in Phase 1 at {bottom_phase1_result.failed_at}")
        return bottom_phase1_result.exit_code

    # =========================================================================
    # Phase 1: Run top_die up to 3_1_place_gp_skip_io
    # =========================================================================
    print("\n[Phase 1b] Running top_die up to 3_1_place_gp_skip_io...")
    print("-" * 60)

    top_dummy_event = threading.Event()
    top_phase1_result = run_die_phase1(
        "top_die", TOP_CONFIG, top_dummy_event, stop_event
    )

    if top_phase1_result.exit_code != 0:
        print(f"[ERROR] top_die failed in Phase 1 at {top_phase1_result.failed_at}")
        return top_phase1_result.exit_code

    print("\n[Phase 1] Both dies completed 3_1_place_gp_skip_io successfully")

    # =========================================================================
    # Phase 2: Run Python script for IO placement
    # =========================================================================
    print("\n[Phase 2] Running IO placement Python script...")
    print("-" * 60)

    bottom_def = get_def_path("bottom_die")
    top_def = get_def_path("top_die")
    output_dir = str(FLOW_HOME / "results" / "180_180" / "bottom_die" / FLOW_VARIANT)
    top_output_dir = str(FLOW_HOME / "results" / "180_180" / "top_die" / FLOW_VARIANT)

    # Run 3D IO placement (handles both interconnect and non-interconnect signals)
    result = run_io_placement_3d(
        "flow", bottom_def, top_def, output_dir, top_output_dir, stop_event
    )

    if result.exit_code != 0:
        print(f"[ERROR] 3D IO placement Python script failed!")
        return result.exit_code

    print("[Phase 2] IO placement TCL scripts generated successfully")

    # =========================================================================
    # Phase 3: Run both dies from 3_2_place_iop to finish (bottom first, then top)
    # =========================================================================
    print("\n[Phase 3a] Running bottom_die from 3_2_place_iop to finish...")
    print("-" * 60)

    bottom_phase2_result = run_die_phase2(
        "bottom_die", BOTTOM_CONFIG, stop_event
    )

    if bottom_phase2_result.exit_code != 0:
        print(f"[ERROR] bottom_die failed in Phase 2 at {bottom_phase2_result.failed_at}")
        return bottom_phase2_result.exit_code

    print("\n[Phase 3b] Running top_die from 3_2_place_iop to finish...")
    print("-" * 60)

    top_phase2_result = run_die_phase2(
        "top_die", TOP_CONFIG, stop_event
    )

    if top_phase2_result.exit_code != 0:
        print(f"[ERROR] top_die failed in Phase 2 at {top_phase2_result.failed_at}")
        return top_phase2_result.exit_code

    print("\n" + "=" * 60)
    print("Flow execution completed")
    print("=" * 60)
    print(f"bottom_die: exit code {bottom_phase2_result.exit_code}")
    print(f"top_die: exit code {top_phase2_result.exit_code}")
    print("=" * 60)

    return max(bottom_phase2_result.exit_code, top_phase2_result.exit_code)


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

    # Clean up generated fp.json and fp.png files
    die_short_name = "bottom_die" if "bottom" in name else "top_die"
    results_dir = FLOW_HOME / "results" / "180_180" / die_short_name / FLOW_VARIANT

    if results_dir.exists():
        for pattern in ["*.fp.json", "*.fp.png"]:
            for file_path in results_dir.glob(pattern):
                try:
                    file_path.unlink()
                    print(f"[{name}] Removed: {file_path.name}")
                except OSError as e:
                    print(f"[{name}] Failed to remove {file_path.name}: {e}")

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