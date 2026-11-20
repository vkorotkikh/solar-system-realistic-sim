# 2026-11-20: does Earth's cloud shell lose pixels to the depth buffer far out?

Branch measured: `feat/earth-nasa-imagery`. Its cloud shell is a sphere 10 km above the
ground that writes no depth but is depth-tested against it. In realistic scale the near plane
is 0.00035 x the camera range, so with a 24-bit depth buffer one depth step near Earth is about
range / 5900: 11 km at 10 Earth radii, 65 km at 60. Beyond about 10 radii the 10 km lift is
under one step. A /review reader derived that clouds could then speckle. The 2026-11-19 stills
at 20 and 60 radii could not settle it, because Earth is only 80 and 25 px wide there.

## Method

`cloud-depth.mjs` (headless, real GPU through `lib/headless-gpu.mjs`) sets realistic scale,
pauses at 2026-03-20 15:00 UTC (subsolar point at 45 W) and places the camera 10, 20, 40 and
60 radii out over the equator at 45 W and 40 W. It narrows the field of view so Earth fills 80%
of the frame height. The clip planes, and so the depth resolution, stay those of the distance.
Each view is drawn as:

- **A**: clouds as the served branch ships them.
- **B**: clouds with the depth test off. This is the reference: no front-facing point of a
  sphere around the globe can be behind it, and the shell draws front faces only.
- **C**: control, with the shell lowered to 1 km and no offset, to show the method can see a
  depth problem.
- **D**: no clouds, to count the pixels that carry cloud.

`OFFSETS=1,2,4,8,f1u2` (the run below) adds variants drawn like A with depth offset units -1,
-2, -4 and -8, and factor -1 with units -2.
`analyze.py` counts the pixels inside 95% of the disk where a variant differs from B by more
than 2 levels.

## Run

```
node measurements/2026-11-20-earth-cloud-depth/cloud-depth.mjs http://127.0.0.1:5193/ <out dir>
python -I measurements/2026-11-20-earth-cloud-depth/analyze.py <out dir>
```

Serve the branch with `node_modules/.bin/vite --host 127.0.0.1 --port 5193 --strictPort` in its
checkout. Each run writes four to nine 2 MB PNGs per view. Only the frames below are kept here.

## Results (ANGLE over D3D12, RTX 5090)

Before the fix (`output-analysis-before.txt`), the shell had no offset, and in A the ground cut
**triangular holes** in the clouds (`evidence-before/holes-60R-and-10R.png`: A, B and the
lost-pixel map at 60 and 10 radii). Each view has about 287,000 to 291,000 cloud pixels.

| View | A lost | C lost (control) | units -1 | units -2 | units -4 / -8 / f1u2 |
|---|---|---|---|---|---|
| 10 R | 7,354 to 8,902 (3%) | 174,000 to 182,000 | 0 | 0 | 0 |
| 20 R | 39,055 to 42,654 (14%) | 181,000 | 3 to 71 | 0 | 0 |
| 40 R | 57,370 to 65,647 (21%) | 176,000 to 179,000 | 40 to 67 | 0 | 0 |
| 60 R | 76,955 to 85,534 (28%) | 179,000 to 180,000 | 371 to 614 | 0 | 0 |

The branch now gives the shell `polygonOffset: true, polygonOffsetUnits: -4`: twice the
smallest offset that closed every hole here, as margin for other GPUs and depth formats. In
eye distance, 4 steps is about 44 km at 10 radii and 260 km at 60, still below the 400 km of
low-orbit satellites drawn in front of Earth. After the fix (`output-analysis-after.txt`,
`evidence-after/views.json` records the served offset), A loses **0** pixels in all eight
views, and the control still loses about 180,000 per view.

Not measured: other GPUs or depth formats, the enlarged scale mode (its near plane is fixed, so
a far view there is a different case), and motion. A still frame shows the same failures that
would flicker.
