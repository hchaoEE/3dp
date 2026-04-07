FROM openroad/orfs:latest
RUN ln -s /OpenROAD-flow-scripts/tools /tools
COPY 3dp /Flow