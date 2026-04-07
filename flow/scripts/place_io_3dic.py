#!/usr/bin/env python3
"""
Place IO pins for F2F 3D IC design.
Generates TCL commands and location files for pin placement.

Two methods:
1. Array placement: Random placement within edge regions (based on 3_1_place_gp_skip_io.def)
2. Wire length optimization: Free placement minimizing wire length (based on 3_2_place_iop.def)

F2F (Face-to-Face) mirror rule: x_top = die_width - x_bottom
"""

import argparse
import json
import os
import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass
class Pin:
    """Represents a pin in DEF file."""
    name: str
    direction: str  # INPUT, OUTPUT, INOUT
    layer: str
    shape: Tuple[int, int, int, int]  # (x1, y1, x2, y2) relative to pin origin
    x: Optional[int] = None  # PLACED/FIXED x coordinate (None if not placed)
    y: Optional[int] = None  # PLACED/FIXED y coordinate
    use: str = "SIGNAL"
    net: Optional[str] = None  # Connected net name


@dataclass
class Net:
    """Represents a net in DEF file."""
    name: str
    pins: List[str] = field(default_factory=list)  # Connected pin names
    components: List[str] = field(default_factory=list)  # Connected component instances


@dataclass
class Component:
    """Represents a component instance in DEF file."""
    name: str
    cell_type: str
    x: int
    y: int
    orientation: str


@dataclass
class DefInfo:
    """Parsed DEF information."""
    design_name: str = ""
    die_area: Tuple[int, int, int, int] = (0, 0, 0, 0)  # (x1, y1, x2, y2)
    units: int = 2000  # MICRONS
    pins: Dict[str, Pin] = field(default_factory=dict)
    nets: Dict[str, Net] = field(default_factory=dict)
    components: Dict[str, Component] = field(default_factory=dict)


# ============================================================================
# DEF Parsing Functions
# ============================================================================

def parse_def_file(def_path: str) -> DefInfo:
    """Parse DEF file and extract pins, nets, and components."""
    info = DefInfo()

    with open(def_path, 'r') as f:
        content = f.read()

    # Extract design name
    design_match = re.search(r'DESIGN\s+(\S+)\s*;', content)
    if design_match:
        info.design_name = design_match.group(1)

    # Extract units
    units_match = re.search(r'UNITS\s+DISTANCE\s+MICRONS\s+(\d+)\s*;', content)
    if units_match:
        info.units = int(units_match.group(1))

    # Extract die area
    diearea_match = re.search(r'DIEAREA\s*\(\s*(\d+)\s+(\d+)\s*\)\s*\(\s*(\d+)\s+(\d+)\s*\)', content)
    if diearea_match:
        info.die_area = (
            int(diearea_match.group(1)),
            int(diearea_match.group(2)),
            int(diearea_match.group(3)),
            int(diearea_match.group(4))
        )

    # Parse PINS section
    pins_section = re.search(r'PINS\s+(\d+)\s*;(.*?)END\s+PINS', content, re.DOTALL)
    if pins_section:
        info.pins = parse_pins_section(pins_section.group(2))

    # Parse NETS section
    nets_section = re.search(r'NETS\s+(\d+)\s*;(.*?)END\s+NETS', content, re.DOTALL)
    if nets_section:
        info.nets = parse_nets_section(nets_section.group(2))

    # Parse COMPONENTS section (for wire length optimization)
    comp_section = re.search(r'COMPONENTS\s+(\d+)\s*;(.*?)END\s+COMPONENTS', content, re.DOTALL)
    if comp_section:
        info.components = parse_components_section(comp_section.group(2))

    return info


def parse_pins_section(pins_text: str) -> Dict[str, Pin]:
    """Parse PINS section from DEF file."""
    pins = {}

    # Split by semicolon to get individual pin blocks
    pin_blocks = re.split(r';\s*', pins_text)

    for block in pin_blocks:
        if not block.strip() or not block.strip().startswith('-'):
            continue

        # Extract pin name
        name_match = re.match(r'-\s+(\S+)', block.strip())
        if not name_match:
            continue

        pin_name = name_match.group(1)

        # Extract direction
        direction = "INOUT"
        if "+ DIRECTION" in block:
            dir_match = re.search(r'\+\s+DIRECTION\s+(\w+)', block)
            if dir_match:
                direction = dir_match.group(1)

        # Extract USE
        use = "SIGNAL"
        if "+ USE" in block:
            use_match = re.search(r'\+\s+USE\s+(\w+)', block)
            if use_match:
                use = use_match.group(1)

        # Extract NET
        net = None
        if "+ NET" in block:
            net_match = re.search(r'\+\s+NET\s+(\S+)', block)
            if net_match:
                net = net_match.group(1)

        # Extract LAYER and shape
        layer = ""
        shape = (0, 0, 0, 0)
        layer_match = re.search(r'\+\s+LAYER\s+(\S+)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', block)
        if layer_match:
            layer = layer_match.group(1)
            shape = (
                int(layer_match.group(2)),
                int(layer_match.group(3)),
                int(layer_match.group(4)),
                int(layer_match.group(5))
            )

        # Extract PLACED or FIXED coordinates
        x, y = None, None
        placed_match = re.search(r'\+\s+(PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', block)
        if placed_match:
            x = int(placed_match.group(2))
            y = int(placed_match.group(3))

        pins[pin_name] = Pin(
            name=pin_name,
            direction=direction,
            layer=layer,
            shape=shape,
            x=x,
            y=y,
            use=use,
            net=net
        )

    return pins


def parse_nets_section(nets_text: str) -> Dict[str, Net]:
    """Parse NETS section from DEF file."""
    nets = {}

    # Split by semicolon to get individual net blocks
    net_blocks = re.split(r';\s*', nets_text)

    for block in net_blocks:
        if not block.strip() or not block.strip().startswith('-'):
            continue

        # Extract net name
        name_match = re.match(r'-\s+(\S+)', block.strip())
        if not name_match:
            continue

        net_name = name_match.group(1)

        # Extract connected pins (PIN keyword)
        connected_pins = []
        for pin_match in re.finditer(r'\(\s*(\S+)\s+PIN\s+\)', block):
            connected_pins.append(pin_match.group(1))

        # Extract connected components
        connected_comps = []
        for comp_match in re.finditer(r'\(\s*(\S+)\s+(\S+)\s+\)', block):
            if comp_match.group(2) != 'PIN':  # Not a pin, it's a component instance
                connected_comps.append(comp_match.group(1))

        nets[net_name] = Net(
            name=net_name,
            pins=connected_pins,
            components=connected_comps
        )

    return nets


def parse_components_section(comp_text: str) -> Dict[str, Component]:
    """Parse COMPONENTS section from DEF file."""
    components = {}

    # Pattern for component: - name cell_type + PLACED/FIXED (x y) orientation ;
    comp_pattern = r'-\s+(\S+)\s+(\S+)\s+.*?\+\s+(PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+(\w+)\s*;'

    for match in re.finditer(comp_pattern, comp_text, re.DOTALL):
        comp_name = match.group(1)
        cell_type = match.group(2)
        x = int(match.group(4))
        y = int(match.group(5))
        orientation = match.group(6)

        components[comp_name] = Component(
            name=comp_name,
            cell_type=cell_type,
            x=x,
            y=y,
            orientation=orientation
        )

    return components


# ============================================================================
# Signal Group Functions
# ============================================================================

def get_interconnect_signals(bottom_pins: Dict[str, Pin], top_pins: Dict[str, Pin]) -> List[str]:
    """Find signal names that exist in both dies (interconnect signals)."""
    bottom_names = set(bottom_pins.keys())
    top_names = set(top_pins.keys())
    return sorted(list(bottom_names & top_names))


def group_signals_by_pattern(signals: List[str], patterns: Dict[str, str]) -> Dict[str, List[str]]:
    """Group signals by regex pattern.

    Args:
        signals: List of signal names
        patterns: Dict mapping group_name to regex pattern

    Returns:
        Dict mapping group_name to list of matching signal names
    """
    groups = {name: [] for name in patterns}

    for sig in signals:
        for group_name, pattern in patterns.items():
            if re.match(pattern, sig):
                groups[group_name].append(sig)
                break  # Assign to first matching group

    return groups


# ============================================================================
# F2F Mirror Functions
# ============================================================================

def mirror_x_for_top_die(x: int, die_width: int) -> int:
    """Apply F2F horizontal mirror for top die.

    In F2F stacking, the top die is flipped horizontally when viewed from above.
    """
    return die_width - x


def mirror_position_for_top_die(x: int, y: int, die_width: int) -> Tuple[int, int]:
    """Mirror position for F2F top die."""
    return (mirror_x_for_top_die(x, die_width), y)


# ============================================================================
# Method 1: Array Placement (Random within Edge Regions)
# ============================================================================

def check_pin_spacing(
    pos: Tuple[int, int],
    placed_positions: Dict[str, Tuple[int, int]],
    min_spacing: int
) -> bool:
    """Check if position has enough spacing from all placed pins.

    Args:
        pos: Position to check (x, y)
        placed_positions: Dict of already placed pins {name: (x, y)}
        min_spacing: Minimum spacing required in DEF units

    Returns:
        True if position violates spacing constraint (too close to another pin)
    """
    x1, y1 = pos

    for other_name, other_pos in placed_positions.items():
        x2, y2 = other_pos
        # Calculate Manhattan distance between pin centers
        distance = abs(x1 - x2) + abs(y1 - y2)
        # For edge placement, check if on same edge and distance
        if distance < min_spacing:
            return True

    return False


def generate_array_placement(
    signals: List[str],
    die_width: int,
    die_height: int,
    config: Dict,
    random_seed: Optional[int] = None
) -> Dict[str, Tuple[int, int]]:
    """Generate array placement for signals within edge regions.

    Args:
        signals: List of signal names to place
        die_width: Die width in DEF units
        die_height: Die height in DEF units
        config: Placement configuration with signal groups and regions
        random_seed: Optional random seed for reproducibility

    Returns:
        Dict mapping signal name to (x, y) position
    """
    if random_seed is not None:
        random.seed(random_seed)

    # Default signal group patterns (from io.tcl)
    default_patterns = {
        "writedata": r"writedata.*",
        "dataadr": r"dataadr.*",
        "mem": r"(ce_mem|we_mem).*",
        "inter_dmem": r"inter_dmem.*",
        "core_ctrl": r"(reset|instr|valid|memwrite|suspend|ready|pc).*",
    }

    patterns = config.get("signal_patterns", default_patterns)

    # Group signals
    signal_groups = group_signals_by_pattern(signals, patterns)

    # Default region configuration (in um, will convert to DEF units)
    # Region format: (x1_um, y1_um, x2_um, y2_um, edge)
    default_regions = {
        "writedata": {"edge": "top", "region_um": (20, 20, 1180, 40)},
        "dataadr": {"edge": "bottom", "region_um": (20, 960, 1180, 980)},
        "mem": {"edge": "left", "region_um": (20, 20, 40, 980)},
        "inter_dmem": {"edge": "right", "region_um": (1100, 20, 1180, 980)},
        "core_ctrl": {"edge": "top", "region_um": (20, 20, 1180, 400)},
    }

    regions = config.get("regions", default_regions)
    pitch_um = config.get("pitch_um", 10)
    margin_um = config.get("margin_um", 20)

    # Minimum spacing between pins (configurable, default 5um)
    min_spacing_um = config.get("min_spacing_um", 5)

    # Convert to DEF units (assuming 2000 units per micron)
    units_per_micron = 2000
    pitch = pitch_um * units_per_micron
    margin = margin_um * units_per_micron
    min_spacing = min_spacing_um * units_per_micron

    placements = {}

    for group_name, group_signals in signal_groups.items():
        if not group_signals:
            continue

        region_config = regions.get(group_name, regions.get("writedata"))
        edge = region_config["edge"]
        x1, y1, x2, y2 = region_config["region_um"]

        # Convert to DEF units
        x1_def = x1 * units_per_micron
        y1_def = y1 * units_per_micron
        x2_def = x2 * units_per_micron
        y2_def = y2 * units_per_micron

        # Generate available positions based on edge
        available_positions = []

        if edge == "top":
            for x in range(x1_def, x2_def, pitch):
                available_positions.append((x, y1_def))
        elif edge == "bottom":
            for x in range(x1_def, x2_def, pitch):
                available_positions.append((x, y1_def))
        elif edge == "left":
            for y in range(y1_def, y2_def, pitch):
                available_positions.append((x1_def, y))
        elif edge == "right":
            for y in range(y1_def, y2_def, pitch):
                available_positions.append((x1_def, y))

        # Randomly assign positions with spacing constraint
        random.shuffle(available_positions)

        group_placements = {}
        for sig in sorted(group_signals):
            placed = False
            for pos in available_positions:
                # Check spacing against all placed pins (including other groups)
                if not check_pin_spacing(pos, placements, min_spacing):
                    group_placements[sig] = pos
                    placements[sig] = pos
                    available_positions.remove(pos)
                    placed = True
                    break

            if not placed:
                # Not enough positions with spacing constraint, use last available with offset
                pos = available_positions[-1] if available_positions else (margin, margin)
                # Find a valid position with offset
                offset = 0
                while not placed:
                    test_pos = pos
                    if edge in ["top", "bottom"]:
                        test_pos = (pos[0] + offset, pos[1])
                    else:
                        test_pos = (pos[0], pos[1] + offset)

                    if not check_pin_spacing(test_pos, placements, min_spacing):
                        group_placements[sig] = test_pos
                        placements[sig] = test_pos
                        placed = True
                    else:
                        offset += pitch

    return placements


# ============================================================================
# Method 2: Wire Length Optimization (Free Placement)
# ============================================================================

def calculate_wire_length(
    pin_pos: Tuple[int, int],
    connected_positions: List[Tuple[int, int]]
) -> int:
    """Calculate total Manhattan distance to connected positions."""
    total = 0
    for pos in connected_positions:
        total += abs(pin_pos[0] - pos[0]) + abs(pin_pos[1] - pos[1])
    return total


def check_overlap(
    pos: Tuple[int, int],
    pin_size: Tuple[int, int],
    placed_positions: Dict[str, Tuple[int, int]],
    placed_sizes: Dict[str, Tuple[int, int]],
    min_spacing: int
) -> bool:
    """Check if position overlaps with any placed pin.

    Returns True if there is an overlap.
    """
    x1, y1 = pos
    w1, h1 = pin_size

    for other_name, other_pos in placed_positions.items():
        x2, y2 = other_pos
        w2, h2 = placed_sizes.get(other_name, pin_size)

        # Check if rectangles overlap (with spacing margin)
        if not (x1 + w1 + min_spacing < x2 or x2 + w2 + min_spacing < x1 or
                y1 + h1 + min_spacing < y2 or y2 + h2 + min_spacing < y1):
            return True

    return False


def get_connected_positions(
    pin_name: str,
    def_info: DefInfo
) -> List[Tuple[int, int]]:
    """Get positions of pins/components connected to this pin.

    For interconnect pins, we want to find the internal connections
    (to components or other internal pins).
    """
    positions = []

    pin = def_info.pins.get(pin_name)
    if not pin or not pin.net:
        return positions

    net = def_info.nets.get(pin.net)
    if not net:
        return positions

    # Get positions of connected pins (excluding the pin itself)
    for connected_pin_name in net.pins:
        if connected_pin_name == pin_name:
            continue
        connected_pin = def_info.pins.get(connected_pin_name)
        if connected_pin and connected_pin.x is not None and connected_pin.y is not None:
            positions.append((connected_pin.x, connected_pin.y))

    # Get positions of connected components
    for comp_name in net.components:
        comp = def_info.components.get(comp_name)
        if comp:
            positions.append((comp.x, comp.y))

    return positions


def optimize_pin_position(
    pin_name: str,
    connected_positions: List[Tuple[int, int]],
    die_width: int,
    die_height: int,
    placed_positions: Dict[str, Tuple[int, int]],
    placed_sizes: Dict[str, Tuple[int, int]],
    pin_size: Tuple[int, int],
    min_spacing: int,
    pitch: int,
    margin: int
) -> Optional[Tuple[int, int]]:
    """Find optimal position minimizing wire length, avoiding overlap."""

    if not connected_positions:
        # No connections, place at center
        return (die_width // 2, die_height // 2)

    best_pos = None
    min_length = float('inf')

    # Search entire die area
    for x in range(margin, die_width - margin, pitch):
        for y in range(margin, die_height - margin, pitch):
            # Check overlap
            if check_overlap((x, y), pin_size, placed_positions, placed_sizes, min_spacing):
                continue

            # Calculate wire length
            length = calculate_wire_length((x, y), connected_positions)
            if length < min_length:
                min_length = length
                best_pos = (x, y)

    return best_pos


def generate_optimized_placement(
    signals: List[str],
    bottom_def: DefInfo,
    top_def: DefInfo,
    config: Dict
) -> Tuple[Dict[str, Tuple[int, int]], Dict[str, Tuple[int, int]]]:
    """Generate optimized placement for minimum wire length.

    Returns:
        Tuple of (bottom_placements, top_placements)
    """
    die_width = bottom_def.die_area[2]
    die_height = bottom_def.die_area[3]

    pitch = config.get("pitch", 10000)  # 5um in DEF units
    margin = config.get("margin", 40000)  # 20um in DEF units

    # Minimum spacing between pins (configurable, default 5um = 10000 DEF units)
    min_spacing_um = config.get("min_spacing_um", 5)
    min_spacing = min_spacing_um * 2000  # Convert to DEF units

    # Pin sizes (from existing DEF files)
    bottom_pin_size = (4000, 4000)  # 2um x 2um
    top_pin_size = (880, 2560)  # 0.44um x 1.28um

    # Sort signals by number of connections (more connections = higher priority)
    signal_connections = {}
    for sig in signals:
        positions = get_connected_positions(sig, bottom_def)
        signal_connections[sig] = len(positions)

    sorted_signals = sorted(signals, key=lambda s: -signal_connections.get(s, 0))

    bottom_placements = {}
    top_placements = {}
    bottom_sizes = {}
    top_sizes = {}

    for sig in sorted_signals:
        # Get connected positions for this pin
        connected_positions = get_connected_positions(sig, bottom_def)

        # Optimize bottom die position
        bottom_pos = optimize_pin_position(
            sig,
            connected_positions,
            die_width,
            die_height,
            bottom_placements,
            bottom_sizes,
            bottom_pin_size,
            min_spacing,
            pitch,
            margin
        )

        if bottom_pos:
            bottom_placements[sig] = bottom_pos
            bottom_sizes[sig] = bottom_pin_size

            # Mirror for top die
            top_pos = mirror_position_for_top_die(bottom_pos[0], bottom_pos[1], die_width)
            top_placements[sig] = top_pos
            top_sizes[sig] = top_pin_size

    return bottom_placements, top_placements


# ============================================================================
# Output Functions
# ============================================================================

def write_tcl_commands(
    placements: Dict[str, Tuple[int, int]],
    output_path: str,
    die_name: str,
    pin_size: Tuple[int, int],
    layer: str = "Bonding_layer"
):
    """Write TCL commands for pin placement.

    Args:
        placements: Dict mapping pin name to (x, y) position
        output_path: Output TCL file path
        die_name: Die name for comments
        pin_size: (width, height) in DEF units
        layer: Layer name for placement
    """
    with open(output_path, 'w') as f:
        f.write(f"# IO Placement for {die_name}\n")
        f.write(f"# Generated by place_io_3dic.py\n")
        f.write(f"# Total pins: {len(placements)}\n\n")

        f.write(f"source $::env(SCRIPTS_DIR)/util.tcl\n\n")

        for pin_name, (x, y) in sorted(placements.items()):
            f.write(f"place_pin -layer {layer} ")
            f.write(f"-pin_size {{{pin_size[0]} {pin_size[1]}}} ")
            f.write(f"-pin_name {pin_name} ")
            f.write(f"-location {{{x} {y}}}\n")

        f.write("\n")


def write_location_files(
    placements: Dict[str, Tuple[int, int]],
    output_dir: str,
    signal_patterns: Dict[str, str]
):
    """Write location files for compatibility with pad_placer.tcl.

    Args:
        placements: Dict mapping pin name to (x, y) position
        output_dir: Output directory
        signal_patterns: Dict mapping group name to regex pattern
    """
    # Group signals
    signal_groups = group_signals_by_pattern(list(placements.keys()), signal_patterns)

    # File name mapping
    file_mapping = {
        "writedata": "writedata_loca.txt",
        "dataadr": "dataadr_loca.txt",
        "mem": "e_mem_loca.txt",
        "inter_dmem": "inter_dmem_loca.txt",
    }

    for group_name, signals in signal_groups.items():
        if not signals or group_name not in file_mapping:
            continue

        output_path = os.path.join(output_dir, file_mapping[group_name])

        with open(output_path, 'w') as f:
            for sig in sorted(signals, key=lambda s: int(re.search(r'\d+', s).group() if re.search(r'\d+', s) else 0)):
                if sig in placements:
                    x, y = placements[sig]
                    f.write(f"{x} {y}\n")


def write_json_summary(
    bottom_placements: Dict[str, Tuple[int, int]],
    top_placements: Dict[str, Tuple[int, int]],
    output_path: str,
    die_width: int,
    die_height: int
):
    """Write JSON summary of pin placements."""
    summary = {
        "die_width": die_width,
        "die_height": die_height,
        "total_pins": len(bottom_placements),
        "bottom_placements": {k: list(v) for k, v in bottom_placements.items()},
        "top_placements": {k: list(v) for k, v in top_placements.items()},
    }

    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)


# ============================================================================
# Main Function
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Place IO pins for F2F 3D IC design"
    )
    parser.add_argument(
        "--method",
        choices=["array", "optimize"],
        required=True,
        help="Placement method: array (random within regions) or optimize (wire length)"
    )
    parser.add_argument(
        "--bottom_def",
        required=True,
        help="Path to bottom die DEF file"
    )
    parser.add_argument(
        "--top_def",
        required=True,
        help="Path to top die DEF file"
    )
    parser.add_argument(
        "--output_dir",
        required=True,
        help="Output directory for TCL and location files"
    )
    parser.add_argument(
        "--config",
        help="Optional JSON configuration file"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for array placement (default: 42)"
    )
    parser.add_argument(
        "--min_spacing_um",
        type=float,
        default=5.0,
        help="Minimum spacing between pins in microns (default: 5.0)"
    )

    args = parser.parse_args()

    # Load config if provided
    config = {}
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            config = json.load(f)

    # Override config with command line argument for min_spacing_um
    if "min_spacing_um" not in config:
        config["min_spacing_um"] = args.min_spacing_um

    print(f"Minimum pin spacing: {config['min_spacing_um']} um")

    # Parse DEF files
    print(f"Parsing bottom die DEF: {args.bottom_def}")
    bottom_def = parse_def_file(args.bottom_def)
    print(f"  Design: {bottom_def.design_name}")
    print(f"  Die area: {bottom_def.die_area}")
    print(f"  Pins: {len(bottom_def.pins)}")
    print(f"  Nets: {len(bottom_def.nets)}")

    print(f"Parsing top die DEF: {args.top_def}")
    top_def = parse_def_file(args.top_def)
    print(f"  Design: {top_def.design_name}")
    print(f"  Die area: {top_def.die_area}")
    print(f"  Pins: {len(top_def.pins)}")

    # Find interconnect signals
    signals = get_interconnect_signals(bottom_def.pins, top_def.pins)
    print(f"Interconnect signals: {len(signals)}")

    die_width = bottom_def.die_area[2]
    die_height = bottom_def.die_area[3]

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # Signal patterns for grouping
    signal_patterns = config.get("signal_patterns", {
        "writedata": r"writedata.*",
        "dataadr": r"dataadr.*",
        "mem": r"(ce_mem|we_mem).*",
        "inter_dmem": r"inter_dmem.*",
    })

    if args.method == "array":
        print("Running array placement...")
        bottom_placements = generate_array_placement(
            signals, die_width, die_height, config, args.seed
        )
        top_placements = {
            sig: mirror_position_for_top_die(pos[0], pos[1], die_width)
            for sig, pos in bottom_placements.items()
        }

    elif args.method == "optimize":
        print("Running wire length optimization...")
        bottom_placements, top_placements = generate_optimized_placement(
            signals, bottom_def, top_def, config
        )

    print(f"Placed {len(bottom_placements)} pins")

    # Pin sizes
    bottom_pin_size = config.get("bottom_pin_size", (4000, 4000))
    top_pin_size = config.get("top_pin_size", (880, 2560))

    # Write TCL files
    bottom_tcl_path = os.path.join(args.output_dir, "io_placement_bottom.tcl")
    top_tcl_path = os.path.join(args.output_dir, "io_placement_top.tcl")

    write_tcl_commands(
        bottom_placements, bottom_tcl_path,
        "bottom_die", bottom_pin_size
    )
    print(f"Written: {bottom_tcl_path}")

    write_tcl_commands(
        top_placements, top_tcl_path,
        "top_die", top_pin_size
    )
    print(f"Written: {top_tcl_path}")

    # Write location files
    write_location_files(bottom_placements, args.output_dir, signal_patterns)
    print(f"Written location files to: {args.output_dir}")

    # Write JSON summary
    json_path = os.path.join(args.output_dir, "pin_placement_summary.json")
    write_json_summary(bottom_placements, top_placements, json_path, die_width, die_height)
    print(f"Written: {json_path}")

    print("Done!")


if __name__ == "__main__":
    main()