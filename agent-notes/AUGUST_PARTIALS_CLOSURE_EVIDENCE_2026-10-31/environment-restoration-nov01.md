# WebKit runtime restoration — 2026-11-01

**Restored and smoke-tested:** Playwright 1.64.0's existing WebKit build 2370
(engine 27.2) on Ubuntu 24.04.4 LTS, amd64. No system packages, repository
configuration, product source, or original cached browser files were changed.
Full browser qualification remains parent-owned.

## Cause and restored dependencies

The first full-matrix log,
`agent-notes/AUGUST_PARTIALS_CLOSURE_EVIDENCE_2026-10-31/browser-final-nov01.txt`,
reported 39 WebKit launches blocked by missing host libraries. The prior
isolated dependency root lived in `/tmp` and did not survive the reboot.

Restored 31 official Ubuntu Noble packages under
`/home/nomad/.cache/solar-webkit-noble-20261101/root`. The October 30 dependency
manifest supplied exact package/version/hash pins. Twenty-five `.deb` files
survived in October 14 worktree artifacts; every reused and downloaded package
was checked against the SHA-256 value in current local `apt-cache show`
metadata before extraction. Six remaining packages were downloaded with
`apt-get download` from the configured `archive.ubuntu.com/ubuntu` repository:

- `libcairo-script-interpreter2=1.18.0-3build1`
- `libgraphene-1.0-0=1.10.8-3build2`
- `libgtk-4-1=4.14.5+ds-0ubuntu0.10`
- `libsecret-1-0=0.21.4-1build3`
- `libsoup-3.0-0=3.4.4-5ubuntu0.9`
- `libx264-164=2:0.164.3108+git31e19f9-1`

Only `dpkg-deb -x` extraction was used; no package install, upgrade, sudo,
APT-source modification, or system linker-cache change was needed. The cache
contains `manifest.json`, `package-specs.txt`, `SHA256SUMS`,
`all-package-uris.txt`, `apt-policy.txt`, and `download.log`, recording all 31
packages, reused file locations, official package URLs, and hashes.

## Runtime qualification

- `ldd` inspected 13 distinct GTK/WPE executables and bundled shared libraries
  with the bundled and extracted library paths: **zero missing dependencies**.
  Per-file results are `ldd-gtk.json` and `ldd-wpe.json` in the cache.
- Explicit `ctypes.CDLL` loads of `libGLESv2.so.2` and `libx264.so.164` passed.
- A real headless WebKit 27.2 launch passed DOM button interaction, Canvas2D
  pixel readback `[23,45,67,255]`, and screenshot capture. The final smoke used
  an explicit isolated launcher with **no global host-validation skip flag,
  browser-cache override, or LD_LIBRARY_PATH environment override**. Its script,
  output, and image are `smoke.mjs`, `smoke.log`, and `smoke.png` in the cache.
- Discovery through the temporary config matched the repository config:
  **the same 170 selected cases across all four projects**. The two JSON
  discovery outputs are retained in the cache. No tests were excluded or
  assertions changed for this environment restoration.

## Why an isolated launcher/config is needed

The downloaded MiniBrowser shell wrapper overwrites `LD_LIBRARY_PATH`, so
setting only an outer environment variable loses the extracted dependencies.
The isolated launcher at
`/home/nomad/.cache/solar-webkit-noble-20261101/browsers/webkit-2370/pw_run.sh`
uses the original GTK/WPE executables, injected bundle, and inspector resources,
and supplies the original bundled library directories followed by the extracted
Ubuntu directory. It preserves the normal headless/WPE selection.

Playwright's normal dynamic-library presence preflight consults only
`/sbin/ldconfig -p` for GLES/x264. It still reports those as absent despite
successful isolated `dlopen`. An initial diagnostic smoke therefore used
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; that global flag is **not needed
for the final full-matrix recipe**. Instead the temporary config imports the
repository config and sets an explicit executable path only for WebKit, whose
runtime dependencies were independently verified above. Chromium, Chromium tab
zoom, and Firefox retain their original definitions and normal host validation.
Absolute test/output/server paths preserve the repository config's behavior
when loaded from the cache directory.

## Full-matrix command

Run from `/home/nomad/ai/projects/worktrees/solar-close-partials-20261031`, after
the parent releases the browser slot:

```bash
env -u PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS \
  -u PLAYWRIGHT_BROWSERS_PATH -u LD_LIBRARY_PATH \
  PATH="/home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin:$PATH" \
  UI_TEST_PORT=4187 \
  /home/nomad/.npm/_npx/f4985f1adc097c41/node_modules/node/bin/node \
  node_modules/playwright/cli.js test \
  --config=/home/nomad/.cache/solar-webkit-noble-20261101/playwright.config.ts
```

The wrapper supplies the extracted library path itself. The repository's
browser projects, matching rules, test timeouts, worker count, launch arguments,
WebGL settings, and web-server command remain intact.

To reconstruct the extracted root from the recorded pins and official repos:

```bash
webkit_runtime=/home/nomad/.cache/solar-webkit-noble-20261101
mkdir -p "$webkit_runtime/debs" "$webkit_runtime/root"
cd "$webkit_runtime/debs"
xargs -a "$webkit_runtime/package-specs.txt" apt-get download
sha256sum -c "$webkit_runtime/SHA256SUMS"
for package in ./*.deb; do
  dpkg-deb -x "$package" "$webkit_runtime/root"
done
```

## Separate wrong-port failure

After libraries were restored, the parent's first WebKit project run used port
4190. This port is blocked by WebKit. Independently inspected the first two
`test-results/4190/*/trace.zip` files; both contain the console message:
`Not allowed to use restricted network port 4190: http://127.0.0.1:4190/`.
The parent stopped that run and selected port 4187. This was an environment
port-selection failure before application navigation, not a product regression
or renewed dependency failure. Do not use port 4190 in the qualification recipe.

No further browser jobs were launched by this agent after the parent reserved
the runtime for full qualification. Its eventual full-matrix result must be
reported separately from the successful restoration smoke above.
