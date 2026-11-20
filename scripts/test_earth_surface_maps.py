"""Tests for scripts/build_earth_surface_maps.py: its encoding and slope maths."""
import hashlib
from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_earth_surface_maps as maps  # noqa: E402


def lat_centres(rows):
    return 90 - (np.arange(rows) + 0.5) * 180 / rows


def lon_centres(cols):
    return (np.arange(cols) + 0.5) * 360 / cols - 180


def test_flat_ground_encodes_to_exactly_128():
    zero = np.zeros((4, 8))
    rgb = maps.encode_slopes(zero, zero)
    assert rgb.dtype == np.uint8 and rgb.shape == (4, 8, 3)
    assert (rgb[..., :2] == 128).all() and (rgb[..., 2] == 0).all()


@pytest.mark.parametrize('g', [0.001, -0.001, 0.01, -0.01, 0.5, -0.5])
def test_companded_slopes_survive_8_bits(g):
    field = np.full((64, 64), g)
    decoded = maps.decode_slope(maps.encode_slopes(field, field)[..., 0])
    # Dither keeps the mean; companding keeps each pixel within its own size
    # (a linear 8-bit code would be off by up to 0.0078, eight times 0.001).
    assert decoded.mean() == pytest.approx(g, rel=0.05)
    assert np.abs(decoded - g).max() <= abs(g)


def test_eastward_ramp_gives_its_true_slope():
    rows, cols = 64, 128
    lat = lat_centres(rows)
    height = np.tile(1000.0 * lon_centres(cols), (rows, 1))  # 1 km per degree east
    ge, gn = maps.slopes(height, np.zeros((rows, cols), bool), lat)
    row, col = rows // 2, cols // 2
    expected = 1000.0 / (maps.R_EARTH * np.cos(np.radians(lat[row])) * np.radians(1))
    assert ge[row, col] == pytest.approx(expected, rel=1e-9)
    assert gn[row, col] == 0


def test_northward_ramp_gives_its_true_slope():
    rows, cols = 64, 128
    lat = lat_centres(rows)
    height = np.tile((1000.0 * lat)[:, None], (1, cols))  # 1 km per degree north
    ge, gn = maps.slopes(height, np.zeros((rows, cols), bool), lat)
    assert gn[rows // 2, 5] == pytest.approx(1000.0 / (maps.R_EARTH * np.radians(1)), rel=1e-9)
    assert ge[rows // 2, 5] == 0


def test_longitude_wraps_at_the_antimeridian():
    rows, cols = 8, 256
    lat = lat_centres(rows)
    lon = np.radians(lon_centres(cols))
    height = np.tile(1000.0 * np.sin(lon), (rows, 1))
    ge, _ = maps.slopes(height, np.zeros((rows, cols), bool), lat)
    row = rows // 2
    analytic = 1000.0 * np.cos(lon) / (maps.R_EARTH * np.cos(np.radians(lat[row])))
    assert ge[row, 0] == pytest.approx(analytic[0], rel=1e-3)
    assert ge[row, -1] == pytest.approx(analytic[-1], rel=1e-3)


def test_sea_floor_does_not_leak_into_a_flat_coast():
    rows, cols = 32, 64
    height = np.zeros((rows, cols))
    water = np.zeros((rows, cols), bool)
    water[:, 32:] = True
    height[:, 32:] = -4000.0
    ge, gn = maps.slopes(height, water, lat_centres(rows))
    assert (ge == 0).all() and (gn == 0).all()


def test_coastal_pixels_average_the_sea_surface_not_the_sea_floor():
    fine = np.full((6, 12), -4000.0)
    fine[:, :6] = 100.0  # land on the west half, deep sea on the east
    coarse = maps.relief_heights(fine, 5, 2)  # 12 -> 5 columns mixes land and sea in one pixel
    assert coarse.min() >= 0 and coarse.max() <= 100 + 1e-9  # weights round in the last bit


def test_slopes_are_zero_near_the_poles():
    rows, cols = 720, 64  # quarter-degree rows
    lat = lat_centres(rows)
    height = np.tile(np.arange(cols) * 10.0, (rows, 1)) + lat[:, None] * 50.0
    ge, gn = maps.slopes(height, np.zeros((rows, cols), bool), lat)
    polar = np.abs(lat) > 89.5
    assert polar.any()
    assert (ge[polar] == 0).all() and (gn[polar] == 0).all()
    assert (gn[~polar] != 0).all()


def test_water_mask_fills_land_holes_lakes_and_ice_shelves():
    square = lambda x0, y0, x1, y1: [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    land = [[square(-10, -10, 10, 10), square(-3, -3, 3, 3)]]  # a continent with an inland sea
    lakes = [[square(5, 5, 8, 8)]]
    shelves = [[square(-60, -80, -40, -70)]]
    mask = maps.rasterize_water(land, lakes, shelves, 360, 180)
    at = lambda lon, lat: mask[int(90 - lat), int(lon + 180)]
    assert mask.dtype == np.uint8 and mask.shape == (180, 360)
    assert at(-150.5, 0.5) == 255  # open ocean
    assert at(-7.5, 0.5) == 0  # land
    assert at(0.5, 0.5) == 255  # inland sea (hole in the land)
    assert at(6.5, 6.5) == 255  # lake
    assert at(-50.5, -74.5) == 0  # ice shelf


def shipped(name):
    from PIL import Image
    with Image.open(maps.OUT / maps.OUTPUTS[name]) as image:
        return np.asarray(image)


def pixel(image, lat, lon):
    rows, cols = image.shape[:2]
    return min(int((90 - lat) / 180 * rows), rows - 1), int((lon + 180) / 360 * cols) % cols


def box(image, south, north, west, east):
    (r1, c0), (r0, c1) = pixel(image, south, west), pixel(image, north, east)
    return image[r0:r1 + 1, c0:c1 + 1]


@pytest.mark.parametrize('place, lat, lon, expected', [
    ('open Pacific', 0, -160, 255),
    ('Lake Superior', 47.7, -87.5, 255),
    ('Caspian Sea', 42, 50.5, 255),
    ('Sahara', 23, 12, 0),
    ('Ross Ice Shelf', -81.5, -175, 0),
])
def test_shipped_water_mask_polarity(place, lat, lon, expected):
    water = shipped('water')
    assert water.shape == (maps.HEIGHT, maps.WIDTH)
    assert water[pixel(water, lat, lon)] == expected, place


def test_shipped_colour_lines_up_with_the_water_mask():
    colour = shipped('colour').astype(float)
    assert colour.shape == (maps.HEIGHT, maps.WIDTH, 3)
    pacific = box(colour, -0.5, 0.5, -160.5, -159.5).mean(axis=(0, 1))
    sahara = box(colour, 22.5, 23.5, 11.5, 12.5).mean(axis=(0, 1))
    assert pacific[2] > pacific[0]  # blue sea where the mask says water
    assert sahara[0] > sahara[2] + 40  # sand where it says land; a flip or 180 deg shift fails


def test_shipped_relief_is_flat_on_water_and_at_the_poles():
    normal = shipped('normal')
    assert normal.shape == (maps.HEIGHT, maps.WIDTH, 3)
    assert (box(normal, -5, 5, -130, -110)[..., :2] == 128).all()  # open sea, no islands
    polar = np.abs(maps.lat_centres(maps.HEIGHT)) > maps.POLAR_CAP_DEG
    assert (normal[polar][..., :2] == 128).all()


def test_shipped_relief_faces_the_right_way():
    normal = shipped('normal')
    himalaya = maps.decode_slope(box(normal, 26.8, 27.8, 84, 88)[..., 1])
    andes = maps.decode_slope(box(normal, -24, -18, -70.5, -67.5)[..., 0])
    assert himalaya.mean() > 0.01  # the range rises northward from the Ganges plain
    assert andes.mean() > 0.005  # and eastward from the Pacific coast


def test_every_source_pin_is_in_the_source_register():
    register = (maps.ROOT / 'docs/data/distribution-sources.json').read_text()
    for name, (_path, size, sha256, url) in maps.INPUTS.items():
        assert sha256 in register and url in register, name


def test_an_input_that_changed_stops_the_build(tmp_path):
    path = tmp_path / 'source.bin'
    path.write_bytes(b'abc')
    maps.check_input(path, 3, hashlib.sha256(b'abc').hexdigest())
    with pytest.raises(ValueError, match='source.bin'):
        maps.check_input(path, 3, '0' * 64)
    with pytest.raises(ValueError, match='source.bin'):
        maps.check_input(path, 4, hashlib.sha256(b'abc').hexdigest())


def test_coast_uses_the_inland_neighbour_with_the_right_sign():
    rows, cols = 32, 64
    lat = lat_centres(rows)
    water = np.zeros((rows, cols), bool)
    water[:, 32:] = True
    height = np.where(water, -4000.0, 10.0 * (32 - np.arange(cols)))  # land rises westward
    ge, _ = maps.slopes(height, water, lat)
    step = maps.R_EARTH * np.cos(np.radians(lat)) * 2 * np.pi / cols
    assert ge[:, 31] == pytest.approx(-10.0 / step)  # (h[31] - h[30]) / step, never the sea floor


def test_build_writes_nothing_when_an_input_is_missing(tmp_path):
    out = tmp_path / 'out'
    with pytest.raises(ValueError):
        maps.build(tmp_path / 'no-downloads', out)
    assert not out.exists()
