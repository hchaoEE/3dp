echo "Begin Hardening Process"
#export DESIGN_CONFIG=designs/180_180/bottom_die/config.mk
#export DESIGN_CONFIG=designs/130_180/riscv32i_3d/config.mk
export DESIGN_CONFIG=designs/180_180/bottom_die/config.mk
make
#make do-5_3_route
echo "Finish harden the bottom die"
sleep 2
#export DESIGN_CONFIG=designs/180_180/top_die/config.mk
#export DESIGN_CONFIG=designs/130_180/fakeram4/config.mk
export DESIGN_CONFIG=designs/180_180/top_die/config.mk
make
echo "ALL Finished"
