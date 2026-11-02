#!/usr/bin/env bash
set -euo pipefail
webkit_bundle=/home/nomad/.cache/ms-playwright/webkit-2370/minibrowser-gtk
if [[ "$*" == *--headless* ]]; then
  webkit_bundle=/home/nomad/.cache/ms-playwright/webkit-2370/minibrowser-wpe
fi
export WEBKIT_EXEC_PATH="$webkit_bundle/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$webkit_bundle/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$webkit_bundle/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1
export LD_LIBRARY_PATH="$webkit_bundle/lib:$webkit_bundle/sys/lib:/home/nomad/.cache/solar-webkit-noble-20261101/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$webkit_bundle/bin/MiniBrowser" "$@"
