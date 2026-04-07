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


def load_macro_names(flow_home):
    """Load macro names from LEF files in designs/gf180sram folder."""
    macro_names = set()
    
    # Look for macro LEF files in designs/gf180sram
    macro_lef_dir = Path(flow_home) / "designs" / "gf180sram"
    if macro_lef_dir.exists():
        for lef_file in macro_lef_dir.glob("*.lef"):
            try:
                with open(lef_file, 'r') as f:
                    content = f.read()
                # Extract MACRO names
                for match in re.finditer(r'MACRO\s+(\S+)', content):
                    macro_names.add(match.group(1))
            except Exception as e:
                print(f"Warning: Could not read {lef_file}: {e}")
    else:
        # Try alternative path
        alt_dir = Path(flow_home).parent / "designs" / "gf180sram"
        if alt_dir.exists():
            for lef_file in alt_dir.glob("*.lef"):
                try:
                    with open(lef_file, 'r') as f:
                        content = f.read()
                    for match in re.finditer(r'MACRO\s+(\S+)', content):
                        macro_names.add(match.group(1))
                except Exception as e:
                    print(f"Warning: Could not read {lef_file}: {e}")
    
    return macro_names


def parse_def_file(def_path, macro_names=None):
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
    
    # Load macro names if not provided
    if macro_names is None:
        flow_home = Path(def_path).parent.parent.parent.parent
        macro_names = load_macro_names(flow_home)
    
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
            
            comp_info = {
                "name": comp_name,
                "type": comp_type,
                "x": x,
                "y": y,
                "orientation": orientation
            }
            
            # Check if it's a macro or stdcell
            if comp_type in macro_names:
                info["macros"].append(comp_info)
            else:
                info["stdcells"].append(comp_info)
    
    # Extract bonding layer shapes from PINS section
    pins_section = re.search(r'PINS\s+\d+\s*;(.*?)END\s+PINS', content, re.DOTALL)
    if pins_section:
        pins_text = pins_section.group(1)
        # Parse each pin that has Bonding_layer
        pin_pattern = r'-\s+(\S+)\s+.*?\+\s+LAYER\s+(Bonding_layer|BondingLayer|bonding|BONDING)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\).*?\+\s+PLACED\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+(\S+)'
        for match in re.finditer(pin_pattern, pins_text, re.DOTALL):
            pin_name = match.group(1)
            layer_name = match.group(2)
            shape_x1 = int(match.group(3))
            shape_y1 = int(match.group(4))
            shape_x2 = int(match.group(5))
            shape_y2 = int(match.group(6))
            placed_x = int(match.group(7))
            placed_y = int(match.group(8))
            
            # Calculate actual shape coordinates based on placement
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
        
        # Avoid duplicates
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
        # Change from .def to .fp.json
        base_path = str(Path(def_path).with_suffix(''))
        json_path = base_path + ".fp.json"
    
    # Load macro names from LEF files
    flow_home = Path(def_path).parent.parent.parent.parent
    macro_names = load_macro_names(flow_home)
    print(f"Loaded {len(macro_names)} macro types from LEF files")
    
    print(f"Parsing DEF file: {def_path}")
    info = parse_def_file(def_path, macro_names)
    
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
