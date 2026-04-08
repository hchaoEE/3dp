#!/usr/bin/env python3
"""
Extract die size, macro placements, and bonding layer shapes from DEF file.
Outputs JSON file with extracted information and generates visualization.
"""

import sys
import json
import re
import os
from datetime import datetime
from pathlib import Path

# Try to import matplotlib for visualization
try:
    import matplotlib
    matplotlib.use('Agg')  # Use non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("Warning: matplotlib not available, skipping visualization generation")


def load_cell_sizes(flow_home):
    """Load cell sizes from LEF files."""
    cell_sizes = {}
    
    # Load stdcell LEF
    stdcell_lef = Path(flow_home) / "platforms" / "180_180" / "lef" / "gf180mcu_5LM_1TM_9K_9t_sc.lef"
    if stdcell_lef.exists():
        with open(stdcell_lef, 'r') as f:
            content = f.read()
        # Extract MACRO sizes
        for match in re.finditer(r'MACRO\s+(\S+)\s+.*?SIZE\s+([\d.]+)\s+BY\s+([\d.]+)', content, re.DOTALL):
            cell_name = match.group(1)
            width = float(match.group(2)) * 1000  # Convert to DEF units (MICRONS)
            height = float(match.group(3)) * 1000
            cell_sizes[cell_name] = {"width": width, "height": height}
    
    # Load macro LEF files
    macro_lef_dir = Path(flow_home) / "designs" / "gf180sram"
    if macro_lef_dir.exists():
        for lef_file in macro_lef_dir.glob("*.lef"):
            try:
                with open(lef_file, 'r') as f:
                    content = f.read()
                for match in re.finditer(r'MACRO\s+(\S+)\s+.*?SIZE\s+([\d.]+)\s+BY\s+([\d.]+)', content, re.DOTALL):
                    cell_name = match.group(1)
                    width = float(match.group(2)) * 1000
                    height = float(match.group(3)) * 1000
                    cell_sizes[cell_name] = {"width": width, "height": height}
            except Exception as e:
                print(f"Warning: Could not read {lef_file}: {e}")
    
    return cell_sizes


def parse_def_file(def_path, cell_sizes=None):
    """Parse DEF file and extract relevant information."""
    info = {
        "die_size": None,
        "stdcells": [],
        "macros": [],
        "bonding_layers": [],
        "units": 2000,  # Default units per micron
        "timestamp": datetime.now().isoformat()
    }

    if not Path(def_path).exists():
        print(f"Error: DEF file not found: {def_path}")
        return info

    # Load cell sizes if not provided
    if cell_sizes is None:
        flow_home = Path(def_path).parent.parent.parent.parent
        cell_sizes = load_cell_sizes(flow_home)
        print(f"Loaded {len(cell_sizes)} cell sizes from LEF files")

    with open(def_path, 'r') as f:
        content = f.read()

    # Extract UNITS from DEF file
    units_match = re.search(r'UNITS\s+DISTANCE\s+MICRONS\s+(\d+)\s*;', content)
    if units_match:
        info["units"] = int(units_match.group(1))
        print(f"DEF units: {info['units']} per micron")

    units = info["units"]

    # Extract die size from DIEAREA
    diearea_match = re.search(r'DIEAREA\s*\(\s*(\d+)\s+(\d+)\s*\)\s*\(\s*(\d+)\s+(\d+)\s*\)', content)
    if diearea_match:
        info["die_size"] = {
            "x1": int(diearea_match.group(1)) / units,
            "y1": int(diearea_match.group(2)) / units,
            "x2": int(diearea_match.group(3)) / units,
            "y2": int(diearea_match.group(4)) / units
        }
    
    # Extract components from COMPONENTS section
    components_section = re.search(r'COMPONENTS\s+\d+\s*;(.*?)END\s+COMPONENTS', content, re.DOTALL)
    if components_section:
        comp_text = components_section.group(1)
        # Parse each component (handle both PLACED and FIXED)
        comp_pattern = r'-\s+(\S+)\s+(\S+)\s+.*?\+\s+(?:PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+(\S+)'
        for match in re.finditer(comp_pattern, comp_text):
            comp_name = match.group(1)
            comp_type = match.group(2)
            x = int(match.group(3)) / units
            y = int(match.group(4)) / units
            orientation = match.group(5)

            # Get cell size (already in microns from LEF)
            size = cell_sizes.get(comp_type, {"width": 0, "height": 0})
            width = size["width"]
            height = size["height"]

            # Calculate x2, y2 based on orientation
            if orientation in ["N", "S", "FN", "FS"]:
                x2 = x + width
                y2 = y + height
            else:  # Rotated 90 or 270 degrees
                x2 = x + height
                y2 = y + width

            comp_info = {
                "name": comp_name,
                "type": comp_type,
                "x1": x,
                "y1": y,
                "x2": x2,
                "y2": y2
            }

            # Check if it's a macro or stdcell
            if comp_type in cell_sizes and "sram" in comp_type.lower():
                info["macros"].append(comp_info)
            else:
                info["stdcells"].append(comp_info)
    
    # Extract bonding layer shapes from PINS section
    pins_section = re.search(r'PINS\s+\d+\s*;(.*?)END\s+PINS', content, re.DOTALL)
    if pins_section:
        pins_text = pins_section.group(1)
        # Parse each pin block (ends with ;)
        pin_pattern = r'-\s+(\S+)\s+.*?;'
        for pin_match in re.finditer(pin_pattern, pins_text, re.DOTALL):
            pin_block = pin_match.group(0)
            # Check if it has Bonding_layer
            if "Bonding_layer" in pin_block:
                pin_name = re.search(r'-\s+(\S+)', pin_block).group(1)

                # Extract layer coordinates
                layer_match = re.search(r'\+\s+LAYER\s+(\S+)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', pin_block)
                if layer_match:
                    layer_name = layer_match.group(1)
                    shape_x1 = int(layer_match.group(2)) / units
                    shape_y1 = int(layer_match.group(3)) / units
                    shape_x2 = int(layer_match.group(4)) / units
                    shape_y2 = int(layer_match.group(5)) / units

                    # Extract placement
                    placed_match = re.search(r'\+\s+(?:PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', pin_block)
                    if placed_match:
                        placed_x = int(placed_match.group(1)) / units
                        placed_y = int(placed_match.group(2)) / units

                        # Calculate actual coordinates (already in microns)
                        actual_x1 = placed_x + shape_x1
                        actual_y1 = placed_y + shape_y1
                        actual_x2 = placed_x + shape_x2
                        actual_y2 = placed_y + shape_y2

                        info["bonding_layers"].append({
                            "pin_name": pin_name,
                            "layer": layer_name,
                            "source": "pins",
                            "shape": {
                                "x1": actual_x1,
                                "y1": actual_y1,
                                "x2": actual_x2,
                                "y2": actual_y2
                            }
                        })
    
    # Also extract bonding layer information from TRACKS
    seen_tracks = set()
    bonding_layer_pattern = r'TRACKS\s+([XY])\s+(\d+)\s+DO\s+(\d+)\s+STEP\s+(\d+)\s+LAYER\s+(Bonding_layer|BondingLayer|bonding|BONDING)\s*;'
    for match in re.finditer(bonding_layer_pattern, content):
        direction = match.group(1)
        start = int(match.group(2)) / units
        num_tracks = int(match.group(3))
        step = int(match.group(4)) / units
        layer_name = match.group(5)

        track_key = (layer_name, direction, start, num_tracks, step)
        if track_key not in seen_tracks:
            seen_tracks.add(track_key)
            info["bonding_layers"].append({
                "layer": layer_name,
                "source": "tracks",
                "direction": direction,
                "start": start,
                "num_tracks": num_tracks,
                "step": step
            })
    
    return info


def plot_def_layout(info, output_path, title="DEF Layout"):
    """
    Plot the DEF layout and save to file.

    Args:
        info: Dictionary containing die_size, stdcells, macros, bonding_layers
        output_path: Path to save the plot (e.g., .png file)
        title: Title for the plot
    """
    if not MATPLOTLIB_AVAILABLE:
        print("Matplotlib not available, skipping plot generation")
        return

    # Use a smaller figure size and lower DPI to save memory
    fig, ax = plt.subplots(figsize=(10, 10))

    # Set title
    ax.set_title(title, fontsize=12, fontweight='bold')

    # Plot die area
    if info.get("die_size"):
        die = info["die_size"]
        die_width = die["x2"] - die["x1"]
        die_height = die["y2"] - die["y1"]
        die_rect = patches.Rectangle(
            (die["x1"], die["y1"]), die_width, die_height,
            linewidth=2, edgecolor='black', facecolor='none', label='Die Area'
        )
        ax.add_patch(die_rect)

        # Set axis limits with some margin
        margin = max(die_width, die_height) * 0.05
        ax.set_xlim(die["x1"] - margin, die["x2"] + margin)
        ax.set_ylim(die["y1"] - margin, die["y2"] + margin)

    # Plot macros (SRAMs) - limit to reasonable number
    macros = info.get("macros", [])
    for macro in macros[:100]:  # Limit to 100 macros
        width = macro["x2"] - macro["x1"]
        height = macro["y2"] - macro["y1"]
        rect = patches.Rectangle(
            (macro["x1"], macro["y1"]), width, height,
            linewidth=1, edgecolor='blue', facecolor='lightblue', alpha=0.7
        )
        ax.add_patch(rect)

    # Plot stdcells using scatter plot (much more memory efficient)
    stdcells = info.get("stdcells", [])
    total_stdcells = len(stdcells)

    if total_stdcells > 0:
        # Sample stdcells to avoid memory issues
        max_stdcells_to_plot = 2000
        if total_stdcells > max_stdcells_to_plot:
            sample_step = total_stdcells // max_stdcells_to_plot
            stdcells = stdcells[::sample_step]

        # Extract center points for scatter plot
        x_centers = [(s["x1"] + s["x2"]) / 2 for s in stdcells]
        y_centers = [(s["y1"] + s["y2"]) / 2 for s in stdcells]

        # Use scatter plot with small markers
        ax.scatter(x_centers, y_centers, s=1, c='lightgray', alpha=0.5, label=f'Stdcells ({total_stdcells})')

    # Plot bonding layers - limit to reasonable number
    bonding_layers = info.get("bonding_layers", [])
    for bond in bonding_layers[:200]:  # Limit to 200 bonding layers
        if "shape" in bond:
            shape = bond["shape"]
            width = shape["x2"] - shape["x1"]
            height = shape["y2"] - shape["y1"]
            rect = patches.Rectangle(
                (shape["x1"], shape["y1"]), width, height,
                linewidth=1, edgecolor='red', facecolor='yellow', alpha=0.8
            )
            ax.add_patch(rect)

    # Set labels and aspect ratio
    ax.set_xlabel('X (DEF units)', fontsize=10)
    ax.set_ylabel('Y (DEF units)', fontsize=10)
    ax.set_aspect('equal')

    # Add legend
    legend_elements = [
        patches.Patch(facecolor='none', edgecolor='black', linewidth=2, label='Die Area'),
        patches.Patch(facecolor='lightblue', edgecolor='blue', label=f'Macros ({len(info.get("macros", []))})'),
        patches.Patch(facecolor='lightgray', edgecolor='gray', label=f'Stdcells ({total_stdcells})'),
        patches.Patch(facecolor='yellow', edgecolor='red', label=f'Bonding Layers ({len(info.get("bonding_layers", []))})'),
    ]
    ax.legend(handles=legend_elements, loc='upper right', fontsize=8)

    # Add grid
    ax.grid(True, alpha=0.3, linestyle='--')

    # Save figure with lower DPI to save memory
    try:
        plt.savefig(output_path, dpi=100, bbox_inches='tight')
        print(f"Layout plot saved to: {output_path}")
    except Exception as e:
        print(f"Warning: Failed to save plot: {e}")
    finally:
        plt.close(fig)
        # Force garbage collection
        import gc
        gc.collect()


def main():
    if len(sys.argv) < 2:
        print("Usage: extract_def_info.py <def_file> [output_json]")
        sys.exit(1)
    
    def_path = sys.argv[1]
    
    # Default output path: same as DEF but with .fp.json extension
    if len(sys.argv) >= 3:
        json_path = sys.argv[2]
    else:
        base_path = str(Path(def_path).with_suffix(''))
        json_path = base_path + ".fp.json"
    
    # Load cell sizes - flow_home is the 'flow' directory
    def_path_obj = Path(def_path).resolve()
    # Navigate up until we find the 'flow' directory
    flow_home = def_path_obj
    while flow_home.name != "flow" and flow_home.parent != flow_home:
        flow_home = flow_home.parent
    
    # If we didn't find 'flow', use the parent of results
    if flow_home.name != "flow":
        flow_home = def_path_obj.parent.parent.parent.parent
    
    cell_sizes = load_cell_sizes(flow_home)
    print(f"Loaded {len(cell_sizes)} cell sizes from LEF files")
    
    print(f"Parsing DEF file: {def_path}")
    info = parse_def_file(def_path, cell_sizes)
    
    # Write JSON output
    with open(json_path, 'w') as f:
        json.dump(info, f, indent=2)
    
    print(f"Extracted info written to: {json_path}")
    print(f"  - Die size: {info['die_size']}")
    print(f"  - Stdcells: {len(info['stdcells'])}")
    print(f"  - Macros: {len(info['macros'])}")
    print(f"  - Bonding layers: {len(info['bonding_layers'])}")

    # Generate visualization plot
    if MATPLOTLIB_AVAILABLE:
        # Generate plot path: same as JSON but with .png extension
        plot_path = str(Path(json_path).with_suffix('')) + ".fp.png"

        # Get stage name from filename for title
        stage_name = Path(def_path).stem
        plot_title = f"{stage_name} Layout"

        try:
            plot_def_layout(info, plot_path, title=plot_title)
        except Exception as e:
            print(f"Warning: Failed to generate plot: {e}")


if __name__ == "__main__":
    main()
