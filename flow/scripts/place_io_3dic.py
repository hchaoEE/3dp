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


def get_all_pins(bottom_pins: Dict[str, Pin], top_pins: Dict[str, Pin]) -> Tuple[set, set]:
    """Get all pin names from both dies."""
    bottom_names = set(bottom_pins.keys())
    top_names = set(top_pins.keys())
    return bottom_names, top_names


def get_non_interconnect_signals(bottom_pins: Dict[str, Pin], top_pins: Dict[str, Pin]) -> Tuple[List[str], List[str]]:
    """
    Find signal names that exist in only one die (non-interconnect signals).

    Returns:
        Tuple of (bottom_only_signals, top_only_signals)
    """
    bottom_names = set(bottom_pins.keys())
    top_names = set(top_pins.keys())

    bottom_only = sorted(list(bottom_names - top_names))
    top_only = sorted(list(top_names - bottom_names))

    return bottom_only, top_only


def get_edge_for_signal(signal: str) -> str:
    """Determine edge placement based on signal name pattern.

    Args:
        signal: Signal name

    Returns:
        Edge name: "top", "bottom", "left", or "right"
    """
    # Core control signals -> top edge
    if re.match(r'(reset|instr|valid|memwrite|suspend|ready|pc).*', signal):
        return "top"
    # writedata signals -> top edge
    elif re.match(r'writedata.*', signal):
        return "top"
    # dataadr signals -> bottom edge
    elif re.match(r'dataadr.*', signal):
        return "bottom"
    # mem signals -> left edge
    elif re.match(r'(ce_mem|we_mem).*', signal):
        return "left"
    # inter_dmem signals -> right edge
    elif re.match(r'inter_dmem.*', signal):
        return "right"
    # Default -> left edge
    else:
        return "left"


def generate_edge_placement_for_signals(
    signals: List[str],
    pins: Dict[str, Pin],
    die_width: int,
    die_height: int,
    config: Dict,
    edge: str = "bottom",
    random_seed: Optional[int] = None
) -> Dict[str, Tuple[int, int]]:
    """
    Generate placement for non-interconnect signals on a specific edge.

    Args:
        signals: List of signal names to place
        pins: Dictionary of all pins
        die_width: Die width in DEF units
        die_height: Die height in DEF units
        config: Placement configuration
        edge: Edge to place pins on (top, bottom, left, right)
        random_seed: Optional random seed

    Returns:
        Dict mapping signal name to (x, y) position
    """
    if random_seed is not None:
        random.seed(random_seed)

    if not signals:
        return {}

    # Configuration
    # Margin should be at least 40um (20um core-to-die spacing + 20um pin margin)
    margin_um = config.get("margin_um", 40)
    pitch_um = config.get("pitch_um", 10)
    min_spacing_um = config.get("min_spacing_um", 5)

    # Convert to DEF units (assuming 2000 units per micron)
    units_per_micron = 2000
    margin = int(margin_um * units_per_micron)
    pitch = int(pitch_um * units_per_micron)
    min_spacing = int(min_spacing_um * units_per_micron)

    placements = {}
    placed_positions = []  # List of (x, y, pin_size)

    # Default pin size in DEF units (0.44 microns * 2000 = 880)
    default_pin_size = (880, 2560)

    # Generate available positions on the specified edge
    available_positions = []

    if edge == "top":
        y = die_height - margin
        for x in range(margin, die_width - margin, pitch):
            available_positions.append((x, y))
    elif edge == "bottom":
        y = margin
        for x in range(margin, die_width - margin, pitch):
            available_positions.append((x, y))
    elif edge == "left":
        x = margin
        for y in range(margin, die_height - margin, pitch):
            available_positions.append((x, y))
    elif edge == "right":
        x = die_width - margin
        for y in range(margin, die_height - margin, pitch):
            available_positions.append((x, y))

    # Shuffle for randomness
    random.shuffle(available_positions)

    # Place signals with strict spacing check (check for actual overlap)
    # Note: place_pin uses center coordinates, so we need to account for pin_size/2
    for sig in signals:
        pin = pins.get(sig)
        if not pin:
            continue

        # Get pin size (default to 2.0 x 2.0 microns)
        pin_width, pin_height = default_pin_size
        pin_half_w = pin_width // 2
        pin_half_h = pin_height // 2

        placed = False
        for pos in available_positions[:]:
            x, y = pos
            # Check for overlap with existing pins
            overlap = False
            for placed_x, placed_y, placed_w, placed_h in placed_positions:
                # Check if rectangles overlap
                # Pin 1: center at (x, y), extends from (x - half_w, y - half_h) to (x + half_w, y + half_h)
                # Pin 2: center at (placed_x, placed_y), extends similarly
                x1_min, x1_max = x - pin_half_w, x + pin_half_w
                y1_min, y1_max = y - pin_half_h, y + pin_half_h
                x2_min, x2_max = placed_x - placed_w // 2, placed_x + placed_w // 2
                y2_min, y2_max = placed_y - placed_h // 2, placed_y + placed_h // 2

                # Check for overlap with margin
                margin_def = min_spacing
                if (x1_max + margin_def > x2_min and x1_min - margin_def < x2_max and
                    y1_max + margin_def > y2_min and y1_min - margin_def < y2_max):
                    overlap = True
                    break

            if not overlap:
                placements[sig] = pos
                placed_positions.append((x, y, pin_width, pin_height))
                available_positions.remove(pos)
                placed = True
                break

        if not placed and available_positions:
            # Fallback: use last available position
            pos = available_positions.pop()
            placements[sig] = pos
            placed_positions.append((pos[0], pos[1], pin_width, pin_height))

    return placements


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
    min_spacing: int,
    pin_size: Tuple[int, int] = (880, 2560)
) -> bool:
    """Check if position has enough spacing from all placed pins.

    Args:
        pos: Position to check (x, y)
        placed_positions: Dict of already placed pins {name: (x, y)}
        min_spacing: Minimum spacing required in DEF units
        pin_size: (width, height) of pins in DEF units (default 4000x4000 = 2x2 um)

    Returns:
        True if position violates spacing constraint (too close to another pin)
    """
    x1, y1 = pos
    pin_width, pin_height = pin_size

    for other_name, other_pos in placed_positions.items():
        x2, y2 = other_pos

        # Calculate bounding boxes for both pins (including spacing margin)
        # Pin 1: from (x1 - pin_width/2, y1 - pin_height/2) to (x1 + pin_width/2, y1 + pin_height/2)
        # Pin 2: from (x2 - pin_width/2, y2 - pin_height/2) to (x2 + pin_width/2, y2 + pin_height/2)
        # With additional min_spacing margin

        x1_min = x1 - pin_width // 2 - min_spacing
        x1_max = x1 + pin_width // 2 + min_spacing
        y1_min = y1 - pin_height // 2 - min_spacing
        y1_max = y1 + pin_height // 2 + min_spacing

        x2_min = x2 - pin_width // 2 - min_spacing
        x2_max = x2 + pin_width // 2 + min_spacing
        y2_min = y2 - pin_height // 2 - min_spacing
        y2_max = y2 + pin_height // 2 + min_spacing

        # Check for overlap (if bounding boxes overlap, pins are too close)
        if (x1_max > x2_min and x1_min < x2_max and
            y1_max > y2_min and y1_min < y2_max):
            return True

    return False


def generate_array_placement(
    signals: List[str],
    die_width: int,
    die_height: int,
    config: Dict,
    random_seed: Optional[int] = None
) -> Dict[str, Tuple[int, int]]:
    """Generate array placement for signals anywhere on the die.

    Args:
        signals: List of signal names to place
        die_width: Die width in DEF units
        die_height: Die height in DEF units
        config: Placement configuration
        random_seed: Optional random seed for reproducibility

    Returns:
        Dict mapping signal name to (x, y) position
    """
    if random_seed is not None:
        random.seed(random_seed)

    # Configuration
    margin_um = config.get("margin_um", 40)
    min_spacing_um = config.get("min_spacing_um", 5)

    # Convert to DEF units (assuming 2000 units per micron)
    units_per_micron = 2000
    margin = margin_um * units_per_micron
    min_spacing = min_spacing_um * units_per_micron

    # Default pin size in DEF units (0.44 x 1.28 microns * 2000)
    default_pin_size = (880, 2560)

    # Bonding_layer track pitch from DEF: 1800 DEF units (0.9um)
    track_pitch = 1800
    # Track offset from DEF: 1800 DEF units
    track_offset = 1800

    placements = {}

    # Handle special signals with fixed positions (in microns, will convert to DEF units)
    # ready -> (20, 20), valid -> (20, 25)
    special_positions = {}
    units_per_micron = 2000
    for sig in signals:
        if re.match(r'ready$', sig):
            special_positions[sig] = (int(20 * units_per_micron), int(20 * units_per_micron))
        elif re.match(r'valid$', sig):
            special_positions[sig] = (int(20 * units_per_micron), int(25 * units_per_micron))

    # Place special signals first
    for sig, pos in special_positions.items():
        placements[sig] = pos
        print(f"  Placed {sig} at fixed position ({pos[0]/units_per_micron}, {pos[1]/units_per_micron})")

    # Generate all available positions aligned to Bonding_layer tracks
    available_positions = []
    for x in range(track_offset, die_width - margin, track_pitch):
        for y in range(track_offset, die_height - margin, track_pitch):
            available_positions.append((x, y))

    # Remove positions that are too close to special positions
    for special_pos in special_positions.values():
        available_positions = [
            pos for pos in available_positions
            if not check_pin_spacing(pos, {sig: special_pos for sig in special_positions}, min_spacing, default_pin_size)
        ]

    # Shuffle for randomness
    random.shuffle(available_positions)

    # Place remaining signals with spacing check
    for sig in sorted(signals):
        # Skip if already placed (special signals)
        if sig in placements:
            continue

        placed = False
        for pos in available_positions[:]:
            if not check_pin_spacing(pos, placements, min_spacing, default_pin_size):
                placements[sig] = pos
                available_positions.remove(pos)
                placed = True
                break

        if not placed:
            # Fallback: generate new position with systematic search on tracks
            for x in range(track_offset, die_width - margin, track_pitch):
                for y in range(track_offset, die_height - margin, track_pitch):
                    test_pos = (x, y)
                    if test_pos not in placements.values():
                        if not check_pin_spacing(test_pos, placements, min_spacing, default_pin_size):
                            placements[sig] = test_pos
                            placed = True
                            break
                if placed:
                    break

            if not placed:
                print(f"Warning: Could not place signal {sig}")

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

    # Pin sizes - both dies use 0.44um x 1.28um
    bottom_pin_size = (880, 2560)  # 0.44um x 1.28um
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
    layer: str = "Bonding_layer",
    units: int = 2000
):
    """Write TCL commands for pin placement.

    Args:
        placements: Dict mapping pin name to (x, y) position
        output_path: Output TCL file path
        die_name: Die name for comments
        pin_size: (width, height) in DEF units
        layer: Layer name for placement
        units: DEF units per micron (default 2000)
    """
    with open(output_path, 'w') as f:
        f.write(f"# IO Placement for {die_name}\n")
        f.write(f"# Generated by place_io_3dic.py\n")
        f.write(f"# Total pins: {len(placements)}\n")
        f.write(f"# Units: {units} DEF units per micron\n\n")

        f.write(f"source $::env(SCRIPTS_DIR)/util.tcl\n\n")

        for pin_name, (x, y) in sorted(placements.items()):
            # Convert DEF units to microns for TCL command
            # Round to nearest 5um multiple
            x_microns = round((x / units) / 5) * 5
            y_microns = round((y / units) / 5) * 5
            width_microns = pin_size[0] / units
            height_microns = pin_size[1] / units

            f.write(f"place_pin -layer {layer} ")
            f.write(f"-pin_size {{{width_microns} {height_microns}}} ")
            f.write(f"-pin_name {pin_name} ")
            f.write(f"-location {{{x_microns} {y_microns}}}\n")

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
        help="Output directory for bottom die TCL and location files"
    )
    parser.add_argument(
        "--top_output_dir",
        help="Output directory for top die TCL files (default: same as output_dir)"
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

    # Find interconnect signals (signals present in both dies)
    signals = get_interconnect_signals(bottom_def.pins, top_def.pins)
    print(f"Interconnect signals: {len(signals)}")

    # Find non-interconnect signals (signals present in only one die)
    bottom_only_signals, top_only_signals = get_non_interconnect_signals(bottom_def.pins, top_def.pins)
    print(f"Bottom-only signals: {len(bottom_only_signals)}")
    print(f"Top-only signals: {len(top_only_signals)}")

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
        # Place all bottom die signals (both interconnect and non-interconnect)
        all_bottom_signals = signals + bottom_only_signals
        print(f"Running array placement for {len(all_bottom_signals)} bottom signals...")
        bottom_placements = generate_array_placement(
            all_bottom_signals, die_width, die_height, config, args.seed
        )

        # Mirror positions for top die (only for interconnect signals)
        top_placements = {}
        for sig in signals:
            if sig in bottom_placements:
                pos = bottom_placements[sig]
                top_placements[sig] = mirror_position_for_top_die(pos[0], pos[1], die_width)

        # Place top-only signals if any
        if top_only_signals:
            print(f"Placing {len(top_only_signals)} top-only signals...")
            top_only_placements = generate_array_placement(
                top_only_signals, die_width, die_height, config, args.seed + 1
            )
            for sig, pos in top_only_placements.items():
                top_placements[sig] = mirror_position_for_top_die(pos[0], pos[1], die_width)

    elif args.method == "optimize":
        print("Running wire length optimization...")
        bottom_placements, top_placements = generate_optimized_placement(
            signals, bottom_def, top_def, config
        )

        # For optimize method, also place non-interconnect signals by edge
        print("Placing non-interconnect signals by edge...")

        # Group bottom-only signals by edge
        bottom_by_edge = {"top": [], "bottom": [], "left": [], "right": []}
        for sig in bottom_only_signals:
            edge = get_edge_for_signal(sig)
            bottom_by_edge[edge].append(sig)

        # Place bottom-only signals by edge
        for edge, sig_list in bottom_by_edge.items():
            if sig_list:
                print(f"  Placing {len(sig_list)} bottom signals on {edge} edge...")
                placements = generate_edge_placement_for_signals(
                    sig_list, bottom_def.pins, die_width, die_height,
                    config, edge=edge, random_seed=args.seed
                )
                bottom_placements.update(placements)

        # Group top-only signals by edge
        top_by_edge = {"top": [], "bottom": [], "left": [], "right": []}
        for sig in top_only_signals:
            edge = get_edge_for_signal(sig)
            top_by_edge[edge].append(sig)

        # Place top-only signals by edge
        for edge, sig_list in top_by_edge.items():
            if sig_list:
                print(f"  Placing {len(sig_list)} top signals on {edge} edge...")
                placements = generate_edge_placement_for_signals(
                    sig_list, top_def.pins, die_width, die_height,
                    config, edge=edge, random_seed=args.seed
                )
                for sig, pos in placements.items():
                    top_placements[sig] = mirror_position_for_top_die(pos[0], pos[1], die_width)

    # Check for any unplaced pins and place them
    bottom_all_pins, top_all_pins = get_all_pins(bottom_def.pins, top_def.pins)

    # Find unplaced pins in bottom die
    bottom_unplaced = bottom_all_pins - set(bottom_placements.keys())
    if bottom_unplaced:
        print(f"Placing {len(bottom_unplaced)} additional bottom pins...")
        additional_bottom = generate_edge_placement_for_signals(
            sorted(list(bottom_unplaced)), bottom_def.pins, die_width, die_height,
            config, edge="bottom", random_seed=args.seed + 1
        )
        bottom_placements.update(additional_bottom)

    # Find unplaced pins in top die
    top_unplaced = top_all_pins - set(top_placements.keys())
    if top_unplaced:
        print(f"Placing {len(top_unplaced)} additional top pins...")
        additional_top = generate_edge_placement_for_signals(
            sorted(list(top_unplaced)), top_def.pins, die_width, die_height,
            config, edge="top", random_seed=args.seed + 1
        )
        # Mirror positions for top die
        for sig, pos in additional_top.items():
            top_placements[sig] = mirror_position_for_top_die(pos[0], pos[1], die_width)

    print(f"Total placed pins - bottom: {len(bottom_placements)}, top: {len(top_placements)}")

    # Pin sizes (in DEF units)
    # bottom_die uses 2um x 2um (4000 x 4000 DEF units)
    # top_die uses 0.44um x 1.28um (880 x 2560 DEF units)
    bottom_pin_size = config.get("bottom_pin_size", (4000, 4000))
    top_pin_size = config.get("top_pin_size", (880, 2560))

    # Get units from DEF file (default 2000)
    units = bottom_def.units

    # Determine top output directory
    top_output_dir = args.top_output_dir if args.top_output_dir else args.output_dir

    # Write TCL files (coordinates will be converted to microns)
    bottom_tcl_path = os.path.join(args.output_dir, "io_placement_bottom.tcl")
    top_tcl_path = os.path.join(top_output_dir, "io_placement_top.tcl")

    write_tcl_commands(
        bottom_placements, bottom_tcl_path,
        "bottom_die", bottom_pin_size,
        units=units
    )
    print(f"Written: {bottom_tcl_path}")

    write_tcl_commands(
        top_placements, top_tcl_path,
        "top_die", top_pin_size,
        units=units
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