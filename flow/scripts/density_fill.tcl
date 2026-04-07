source $::env(SCRIPTS_DIR)/load.tcl
load_design 5_route.odb 5_route.sdc "Starting density fill"

set_propagated_clock [all_clocks]

density_fill -rules $::env(FILL_CONFIG)

write_def $::env(RESULTS_DIR)/6_1_fill.def
write_db $::env(RESULTS_DIR)/6_1_fill.odb
write_verilog $::env(RESULTS_DIR)/6_1_fill.v

# Extract DEF info to JSON
set def_file $::env(RESULTS_DIR)/6_1_fill.def
set json_file $::env(RESULTS_DIR)/6_1_fill.fp.json
puts "Extracting DEF info from $def_file"
exec python3 $::env(SCRIPTS_DIR)/extract_def_info.py $def_file $json_file
