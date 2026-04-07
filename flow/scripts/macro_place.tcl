source $::env(SCRIPTS_DIR)/load.tcl
load_design 2_3_floorplan_tdms.odb 1_synth.sdc "Starting macro placement"

source $::env(SCRIPTS_DIR)/macro_place_util.tcl

if {![info exists save_checkpoint] || $save_checkpoint} {
  write_def $::env(RESULTS_DIR)/2_4_floorplan_macro.def
  write_db $::env(RESULTS_DIR)/2_4_floorplan_macro.odb
}

# Extract DEF info to JSON
set def_file $::env(RESULTS_DIR)/2_4_floorplan_macro.def
set json_file $::env(RESULTS_DIR)/2_4_floorplan_macro.fp.json
puts "Extracting DEF info from $def_file"
exec python3 $::env(SCRIPTS_DIR)/extract_def_info.py $def_file $json_file
