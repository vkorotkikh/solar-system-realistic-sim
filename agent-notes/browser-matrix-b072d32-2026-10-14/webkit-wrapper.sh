#!/bin/sh
SOLAR_WEBKIT_DIR=/home/nomad/.cache/ms-playwright/webkit-2370/minibrowser-wpe
export WEBKIT_EXEC_PATH="$SOLAR_WEBKIT_DIR/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$SOLAR_WEBKIT_DIR/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$SOLAR_WEBKIT_DIR/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1
export LD_LIBRARY_PATH="$SOLAR_WEBKIT_DIR/lib:$SOLAR_WEBKIT_DIR/sys/lib:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu/blas:/tmp/solar-frame-lifecycle-webkit-20261014/root/usr/lib/x86_64-linux-gnu/lapack"
exec "$SOLAR_WEBKIT_DIR/bin/MiniBrowser" "$@"
