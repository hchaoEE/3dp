source $::env(SCRIPTS_DIR)/load.tcl
load_design 2_4_floorplan_macro.odb 1_synth.sdc "Starting tapcell"

if {[info exist ::env(TAPCELL_TCL)]} {
  source $::env(TAPCELL_TCL)
}

if {![info exists save_checkpoint] || $save_checkpoint} {
  write_def $::env(RESULTS_DIR)/2_5_floorplan_tapcell.def
  write_db $::env(RESULTS_DIR)/2_5_floorplan_tapcell.odb
}

# Extract DEF info to JSON
set def_file $::env(RESULTS_DIR)/2_5_floorplan_tapcell.def
set json_file $::env(RESULTS_DIR)/2_5_floorplan_tapcell.fp.json
puts "Extracting DEF info from $def_file"
exec python3 $::env(SCRIPTS_DIR)/extract_def_info.py $def_file $json_file
