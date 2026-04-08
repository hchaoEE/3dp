source $::env(SCRIPTS_DIR)/load.tcl
load_design 3_1_place_gp_skip_io.odb 2_floorplan.sdc "Starting io placement"

if {[info exists ::env(FLOORPLAN_DEF)]} {  
    puts "Skipping IO placement as DEF file was used to initialize floorplan."  
} else {  
    # Determine which die we're running based on DESIGN_CONFIG
    set is_bottom_die [string match "*bottom_die*" $::env(DESIGN_CONFIG)]
    
    if {$is_bottom_die} {
        set die_name "bottom"
    } else {
        set die_name "top"
    }
    
    # Source 3D IO placement script (handles both interconnect and non-interconnect signals)
    set io_3d_tcl [file join $::env(RESULTS_DIR) io_placement_${die_name}.tcl]
    if {[file exists $io_3d_tcl]} {
        puts "Sourcing 3D IO placement script: $io_3d_tcl"
        source $io_3d_tcl
    } else {
        puts "Warning: 3D IO placement script not found: $io_3d_tcl"
        
        # Fallback to default placement if no generated script
        if {[info exists ::env(IO_CONSTRAINTS)]} {  
            source $::env(IO_CONSTRAINTS)  
            if {[info exists ::env(MOTHER_PIN_GEN)]} {  
                source $::env(MOTHER_PIN_GEN)  
            }  
        } else {  
            place_pins -hor_layer $::env(IO_PLACER_H)  -ver_layer $::env(IO_PLACER_V) {*}$::env(PLACE_PINS_ARGS)  
        }
    }
}
#source $::env(SCRIPTS_DIR)/io_placement_bottom.tcl

if {![info exists save_checkpoint] || $save_checkpoint} {
  write_def $::env(RESULTS_DIR)/3_2_place_iop.def
  write_db $::env(RESULTS_DIR)/3_2_place_iop.odb
}

# Extract DEF info to JSON
set def_file $::env(RESULTS_DIR)/3_2_place_iop.def
set json_file $::env(RESULTS_DIR)/3_2_place_iop.fp.json
puts "Extracting DEF info from $def_file"
exec python3 $::env(SCRIPTS_DIR)/extract_def_info.py $def_file $json_file

