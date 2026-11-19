#!/usr/bin/env python3
"""Build Earth's four surface maps from pinned NASA, NOAA and Natural Earth downloads.

Offline and deterministic. Every input is checked against its byte count and SHA-256
before anything is written, and two runs give byte-identical files:

  earth_albedo_bmng_200408_8192.jpg  NASA Blue Marble: Next Generation, August 2004 base map,
                                     Lanczos-resampled from NASA's 21600 x 10800 original
  earth_water_ne10m_8192.png         255 = water: Natural Earth 1:10m land (its holes, such as
                                     the Caspian, are water), lakes, and Antarctic ice shelves
                                     (not water); rasterized at twice the size, then averaged
  earth_normal_etopo2022_8192.png    surface slopes from NOAA ETOPO 2022 60" (ice surface) on
                                     land and ice only: R = east, G = north, square-root
                                     companded and dithered, 128 = flat (see encode_slopes)
  earth_clouds_bmng_2048.jpg         NASA Blue Marble clouds, copied byte for byte

Needs numpy, SciPy and Pillow, plus h5py to read the ETOPO netCDF-4 file. h5py is not a
project dependency: run this from a throwaway venv, with the downloads at the paths in INPUTS:

  python -I scripts/build_earth_surface_maps.py --inputs DIR [--out public/textures/surfaces]
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw
from scipy import sparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/textures/surfaces'
WIDTH, HEIGHT = 8192, 4096
R_EARTH = 6_371_008.8  # IUGG mean radius, metres
POLAR_CAP_DEG = 89.5  # poleward of this the longitude step is under ~43 m; slopes are set to 0
DITHER_SEED = 20261118

_NASA = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/'
_NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
# name: (path under --inputs, bytes, SHA-256, source URL); pinned on 2026-11-18.
INPUTS = {
    'colour': ('bmng/world.200408.3x21600x10800.jpg', 21_206_743,
               '926be7253be90a1fd57071a33afbfe7a712a2dfe0d5b5b4602bc5dfbcfdc2c89',
               _NASA + 'images/bmng/bmng-base/august/world.200408.3x21600x10800.jpg'),
    'clouds': ('clouds/cloud_combined_2048.jpg', 829_367,
               'daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793',
               _NASA + 'content-feature/bluemarble/images/cloud_combined_2048.jpg'),
    'etopo': ('etopo/ETOPO_2022_v1_60s_N90W180_surface.nc', 478_290_125,
              '74bbc5c23e85188d93f0beba8116babf69e1a8f160e8dc9f053bf8df01b197b6',
              'https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/'
              '60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc'),
    'land': ('ne/ne_10m_land.geojson', 10_157_965,
             '1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416',
             _NE + 'ne_10m_land.geojson'),
    'lakes': ('ne/ne_10m_lakes.geojson', 5_043_554,
              '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9',
              _NE + 'ne_10m_lakes.geojson'),
    'shelves': ('ne/ne_10m_antarctic_ice_shelves_polys.geojson', 561_580,
                '8f9bf62368695f5664b5fcd9bc0e2baea66da295aea014ce0e9cf510f209898d',
                _NE + 'ne_10m_antarctic_ice_shelves_polys.geojson'),
}
OUTPUTS = {
    'colour': 'earth_albedo_bmng_200408_8192.jpg',
    'normal': 'earth_normal_etopo2022_8192.png',
    'water': 'earth_water_ne10m_8192.png',
    'clouds': 'earth_clouds_bmng_2048.jpg',
}


def check_input(path, size, sha256):
    """Stop unless the file has exactly the pinned bytes."""
    path = Path(path)
    actual = path.stat().st_size if path.exists() else None
    if actual != size:
        raise ValueError(f'{path.name}: expected {size} bytes, found {actual}')
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    if digest.hexdigest() != sha256:
        raise ValueError(f'{path.name}: SHA-256 {digest.hexdigest()} is not the pinned {sha256}')


def _encode(g, rng):
    s = np.sign(g) * np.sqrt(np.minimum(np.abs(g), 1.0))
    dither = np.where(g != 0, rng.random(g.shape) - 0.5, 0.0)
    return np.clip(128 + np.round(127 * s + dither), 1, 255).astype(np.uint8)


def encode_slopes(ge, gn, seed=DITHER_SEED):
    """Pack east and north slopes (metres per metre) into RGB bytes.

    byte = 128 + round(127 * s + d), s = sign(g) * sqrt(min(|g|, 1)), d a fixed-seed dither
    in [-0.5, 0.5) applied only where g is nonzero, so 128 is exactly flat. Linear 8 bits would
    step by 0.0078 (0.45 deg) and band the gentle ice-sheet margins near the day/night line.
    """
    rng = np.random.default_rng(seed)
    rgb = np.zeros(np.shape(ge) + (3,), np.uint8)
    rgb[..., 0] = _encode(np.asarray(ge, float), rng)
    rgb[..., 1] = _encode(np.asarray(gn, float), rng)
    return rgb


def decode_slope(byte):
    """Inverse of encode_slopes for one channel: the shader does the same sum."""
    s = (np.asarray(byte, float) - 128) / 127
    return np.sign(s) * s * s


def _derivative(height, land, ahead, behind, ahead_ok, behind_ok, step):
    # Central where both neighbours are land or ice, one-sided where one is, so the sea floor
    # never shades the coast; zero on water.
    g = np.where(ahead_ok & behind_ok, (ahead - behind) / (2 * step), 0.0)
    g = np.where(ahead_ok & ~behind_ok, (ahead - height) / step, g)
    g = np.where(behind_ok & ~ahead_ok, (height - behind) / step, g)
    return np.where(land, g, 0.0)


def slopes(height, water, lat_deg):
    """East and north slopes of a north-up, cell-registered height grid (metres).

    `water` marks pixels with no relief shading; `lat_deg` is each row's centre latitude.
    Longitude wraps at 180 deg; rows poleward of POLAR_CAP_DEG are flat.
    """
    height = np.asarray(height, float)
    lat_deg = np.asarray(lat_deg, float)
    rows, cols = height.shape
    land = ~np.asarray(water, bool)
    east_step = R_EARTH * np.cos(np.radians(lat_deg))[:, None] * (2 * np.pi / cols)
    north_step = R_EARTH * np.pi / rows
    ge = _derivative(height, land, np.roll(height, -1, 1), np.roll(height, 1, 1),
                     np.roll(land, -1, 1), np.roll(land, 1, 1), east_step)
    none = np.zeros((1, cols), bool)
    north = np.vstack([height[:1], height[:-1]])  # the row above is further north
    south = np.vstack([height[1:], height[-1:]])
    gn = _derivative(height, land, north, south, np.vstack([none, land[:-1]]),
                     np.vstack([land[1:], none]), north_step)
    polar = np.abs(lat_deg) > POLAR_CAP_DEG
    ge[polar] = 0.0
    gn[polar] = 0.0
    return ge, gn


def _fill(layer, polygon, holes):
    """OR one polygon (exterior minus holes) into an 'L' layer, independent of draw order."""
    sx, sy = layer.width / 360, layer.height / 180
    rings = [[((lon + 180) * sx, (90 - lat) * sy) for lon, lat, *_ in ring] for ring in polygon]
    xs = [x for x, _ in rings[0]]
    ys = [y for _, y in rings[0]]
    x0, y0 = max(int(np.floor(min(xs))), 0), max(int(np.floor(min(ys))), 0)
    x1, y1 = min(int(np.ceil(max(xs))) + 1, layer.width), min(int(np.ceil(max(ys))) + 1, layer.height)
    if x1 <= x0 or y1 <= y0:
        return
    tile = Image.new('L', (x1 - x0, y1 - y0), 0)
    draw = ImageDraw.Draw(tile)
    draw.polygon([(x - x0, y - y0) for x, y in rings[0]], fill=255)
    for ring in rings[1:] if holes else []:
        draw.polygon([(x - x0, y - y0) for x, y in ring], fill=0)
    box = (x0, y0, x1, y1)
    layer.paste(ImageChops.lighter(layer.crop(box), tile), box)


def _layer(polygons, size, holes):
    layer = Image.new('L', size, 0)
    for polygon in polygons:
        _fill(layer, polygon, holes)
    return np.asarray(layer) > 127


def rasterize_water(land, lakes, shelves, width, height, supersample=2):
    """255 = water: not land (holes in land are water), or a lake (islands in lakes are not);
    never an ice shelf. Drawn at `supersample` times the size, then box-averaged, so coasts
    are antialiased. Each argument is a list of GeoJSON polygons: [exterior, *holes] rings."""
    size = (width * supersample, height * supersample)
    water = (~_layer(land, size, True) | _layer(lakes, size, True)) & ~_layer(shelves, size, False)
    hi = Image.fromarray(np.where(water, 255, 0).astype(np.uint8), 'L')
    return np.asarray(hi.resize((width, height), Image.BOX), dtype=np.uint8)


def _polygons(path):
    polygons = []
    for feature in json.loads(Path(path).read_text())['features']:
        geometry = feature['geometry']
        polygons.extend([geometry['coordinates']] if geometry['type'] == 'Polygon'
                        else geometry['coordinates'])
    return polygons


def _area_weights(n_in, n_out):
    """Sparse (n_out, n_in) matrix: each coarse cell is the area mean of the fine cells it covers."""
    rows, cols, values = [], [], []
    for out in range(n_out):
        a, b = out / n_out, (out + 1) / n_out
        for i in range(int(np.floor(a * n_in)), min(int(np.ceil(b * n_in)), n_in)):
            overlap = min(b, (i + 1) / n_in) - max(a, i / n_in)
            if overlap > 0:
                rows.append(out)
                cols.append(i)
                values.append(overlap * n_out)
    return sparse.csr_matrix((values, (rows, cols)), shape=(n_out, n_in))


def area_resample(grid, width, height):
    """Area-weighted mean of a cell-registered grid onto a coarser one, in float64."""
    grid = np.asarray(grid, float)
    across = _area_weights(grid.shape[1], width) @ grid.T  # (width, rows)
    return _area_weights(grid.shape[0], height) @ across.T  # (height, width)


def lat_centres(rows):
    return 90 - (np.arange(rows) + 0.5) * 180 / rows


def read_etopo(path):
    """ETOPO 2022 surface heights, north-up, after checking the file's own grid registration."""
    import h5py  # only the build needs it; the tests do not
    with h5py.File(path, 'r') as data:
        lat, lon = data['lat'][:], data['lon'][:]
        z = data['z'][:].astype(float)
    rows, cols = z.shape
    if not (np.allclose(lat, -90 + (np.arange(rows) + 0.5) * 180 / rows)
            and np.allclose(lon, -180 + (np.arange(cols) + 0.5) * 360 / cols)):
        raise ValueError('ETOPO grid is not cell-registered south-up from 180 W; the maps would not line up')
    if (z <= -99_999).any() or not np.isfinite(z).all():
        raise ValueError('ETOPO has fill values; this build does not expect any')
    return np.flipud(z)


def _write(path, save):
    temp = path.with_name(path.name + '.tmp')
    save(temp)
    os.replace(temp, path)


def build(inputs, out=OUT):
    inputs, out = Path(inputs), Path(out)
    for name, (relative, size, sha256, _url) in INPUTS.items():  # all checks before any write
        check_input(inputs / relative, size, sha256)
    path = lambda name: inputs / INPUTS[name][0]
    out.mkdir(parents=True, exist_ok=True)
    Image.MAX_IMAGE_PIXELS = None  # the BMNG original is 233 Mpx

    water = rasterize_water(_polygons(path('land')), _polygons(path('lakes')),
                            _polygons(path('shelves')), WIDTH, HEIGHT)
    _write(out / OUTPUTS['water'], lambda p: Image.fromarray(water, 'L').save(p, 'PNG', optimize=True))

    height = area_resample(read_etopo(path('etopo')), WIDTH, HEIGHT)
    ge, gn = slopes(height, water > 127, lat_centres(HEIGHT))
    rgb = encode_slopes(ge, gn)
    _write(out / OUTPUTS['normal'], lambda p: Image.fromarray(rgb, 'RGB').save(p, 'PNG', optimize=True))

    with Image.open(path('colour')) as colour:
        resized = colour.convert('RGB').resize((WIDTH, HEIGHT), Image.LANCZOS)
    _write(out / OUTPUTS['colour'],
           lambda p: resized.save(p, 'JPEG', quality=92, subsampling=0, optimize=True))

    _write(out / OUTPUTS['clouds'], lambda p: shutil.copyfile(path('clouds'), p))
    return {name: out / file for name, file in OUTPUTS.items()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--inputs', required=True, help='directory holding the downloads at the INPUTS paths')
    parser.add_argument('--out', default=str(OUT), help=f'output directory (default {OUT})')
    args = parser.parse_args(argv)
    for name, file in build(args.inputs, args.out).items():
        print(f'{name}: {file} {file.stat().st_size} bytes {hashlib.sha256(file.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    sys.exit(main())
