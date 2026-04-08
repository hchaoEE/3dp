FROM openroad/orfs:latest
RUN ln -s /OpenROAD-flow-scripts/tools /tools
cat > ~/.config/pip/pip.conf << EOF
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
trusted-host = pypi.tuna.tsinghua.edu.cn
EOF