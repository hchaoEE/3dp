#!/usr/bin/env python3
"""
Extract die size, macro placements, and bonding layer shapes from DEF file.
Outputs JSON file with extracted information.
"""

import sys
import json
import re
import os
from datetime import datetime
from pathlib import Path


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
    
    # Extract die size from DIEAREA
    diearea_match = re.search(r'DIEAREA\s*\(\s*(\d+)\s+(\d+)\s*\)\s*\(\s*(\d+)\s+(\d+)\s*\)', content)
    if diearea_match:
        info["die_size"] = {
            "x1": int(diearea_match.group(1)),
            "y1": int(diearea_match.group(2)),
            "x2": int(diearea_match.group(3)),
            "y2": int(diearea_match.group(4))
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
            x = int(match.group(3))
            y = int(match.group(4))
            orientation = match.group(5)
            
            # Get cell size
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
        # Parse each pin
        # Pattern for pin with LAYER and PLACED/FIXED
        pin_blocks = re.findall(r'-\s+(\S+)\s+.*?;\s*(?=\n\s*-|\nEND\s+PINS|\Z)', pins_text, re.DOTALL)
        for pin_block in pin_blocks:
            # Check if it has Bonding_layer
            if "Bonding_layer" in pin_block or "BondingLayer" in pin_block:
                pin_name = re.search(r'-\s+(\S+)', pin_block).group(1)
                
                # Extract layer coordinates
                layer_match = re.search(r'\+\s+LAYER\s+(\S+)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', pin_block)
                if layer_match:
                    layer_name = layer_match.group(1)
                    shape_x1 = int(layer_match.group(2))
                    shape_y1 = int(layer_match.group(3))
                    shape_x2 = int(layer_match.group(4))
                    shape_y2 = int(layer_match.group(5))
                    
                    # Extract placement
                    placed_match = re.search(r'\+\s+(?:PLACED|FIXED)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)', pin_block)
                    if placed_match:
                        placed_x = int(placed_match.group(1))
                        placed_y = int(placed_match.group(2))
                        
                        # Calculate actual coordinates
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
        start = int(match.group(2))
        num_tracks = int(match.group(3))
        step = int(match.group(4))
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
    
    # Load cell sizes
    flow_home = Path(def_path).parent.parent.parent.parent
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



if __name__ == "__main__":
    main()
