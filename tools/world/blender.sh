#!/bin/sh
# Runs Blender headless. Override the binary with BLENDER=/path/to/blender.
exec "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" "$@"
