#!/usr/bin/env bash
# Assemble the publishable driftwatch-mcp package from the shared engine.
#
# Only the MCP surface ships: engine, sources, lib, mcp. The HTTP API, x402
# layer, and jobs actor stay out -- they would drag in express, viem, and the
# whole @x402 tree for no benefit to someone installing an editor plugin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/packages/driftwatch-mcp"

rm -rf "$PKG/src"
mkdir -p "$PKG/src"/{engine,lib,sources,mcp}

cp "$ROOT/src/engine/"{delta,extract,pkgcheck,synth,types}.ts  "$PKG/src/engine/"
cp "$ROOT/src/lib/"{config,db,jsoncache,log}.ts                "$PKG/src/lib/"
cp "$ROOT/src/sources/"{changelog,github,http,osv,registry}.ts "$PKG/src/sources/"
# Copy the whole mcp/ surface rather than naming files. Extracting render.ts
# out of server.ts on 2026-08-23 silently broke this build, because the script
# still copied only server.ts -- tsc then failed on the missing import. An
# explicit list is a trap for a directory that gains files.
cp "$ROOT/src/mcp/"*.ts                                        "$PKG/src/mcp/"

echo "assembled $(find "$PKG/src" -name '*.ts' | wc -l | tr -d ' ') source files"
