#!/usr/bin/env bash
# Builds and tests in the WSL filesystem: cargo on /mnt/c is several times slower.
# Usage (from Windows): wsl -d Ubuntu -- bash -lc '/mnt/c/work/pritok/scripts/wsl-test.sh [cargo test args]'
set -euo pipefail

SRC=/mnt/c/work/pritok
DST="$HOME/pritok-build"

mkdir -p "$DST/target/deploy"
rsync -a --delete --exclude target --exclude .git --exclude node_modules "$SRC/" "$DST/"
cp "$SRC/target/deploy/pritok-keypair.json" "$DST/target/deploy/"

cd "$DST"
anchor build 2>&1 | grep -E "^(error|warning: unused)" -A12 || true
test -f target/deploy/pritok.so
cp target/deploy/pritok.so "$SRC/target/deploy/pritok.so"
cargo test -p pritok "$@" 2>&1 | grep -vE "^\s+(Compiling|Downloaded|Downloading|Finished|Running)|^warning|^\s+(=|\||-->)|^\s*$"
