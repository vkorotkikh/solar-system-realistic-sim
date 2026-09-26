"""Explicit full-sphere magnetogram pixel centers and cell areas.

mu is sin(latitude) = cos(colatitude). Row order is supplied, never guessed
from field values. Longitude centers increase uniformly through one period.
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np


EQUAL_AREA = "equal-area-sine-latitude-v1"
UNIFORM_COLATITUDE = "uniform-colatitude-v1"
RowOrder = Literal["north_to_south", "south_to_north"]


def _size(value: int) -> int:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, np.integer)) or value < 1:
        raise ValueError("grid dimensions must be positive integers")
    return int(value)


@dataclass(frozen=True, eq=False)
class MagnetogramGrid:
    mu: np.ndarray
    phi_rad: np.ndarray
    row_order: RowOrder
    convention: str

    def __post_init__(self):
        mu = np.asarray(self.mu, dtype=np.float64)
        phi = np.asarray(self.phi_rad, dtype=np.float64)
        if any(a.ndim != 1 or not a.size or not np.all(np.isfinite(a)) for a in (mu, phi)):
            raise ValueError("coordinates must be nonempty finite one-dimensional arrays")
        if np.any(abs(mu) >= 1):
            raise ValueError("mu must contain cell centers strictly between -1 and 1")
        if self.row_order not in ("north_to_south", "south_to_north"):
            raise ValueError("unsupported row_order")
        if self.convention == EQUAL_AREA:
            expected = 1 - 2 * (np.arange(mu.size) + 0.5) / mu.size
        elif self.convention == UNIFORM_COLATITUDE:
            expected = np.cos((np.arange(mu.size) + 0.5) * np.pi / mu.size)
        else:
            raise ValueError("unsupported grid convention")
        if self.row_order == "south_to_north":
            expected = expected[::-1]
        if not np.allclose(mu, expected, rtol=0, atol=1e-12):
            raise ValueError("mu centers do not match the declared geometry and row order")
        if not np.allclose(np.diff(phi), 2 * np.pi / phi.size, rtol=0, atol=1e-12):
            raise ValueError("longitude must uniformly sample a full period without a duplicate endpoint")
        # Immutable bytes backing prevents callers from re-enabling WRITEABLE.
        object.__setattr__(self, "mu", np.frombuffer(mu.tobytes(), dtype=np.float64))
        object.__setattr__(self, "phi_rad", np.frombuffer(phi.tobytes(), dtype=np.float64))

    @property
    def mu_edges(self) -> np.ndarray:
        """Latitude cell boundaries in the same order as the rows."""
        n = self.mu.size
        edges = (np.linspace(1, -1, n + 1) if self.convention == EQUAL_AREA
                 else np.cos(np.linspace(0, np.pi, n + 1)))
        return edges if self.row_order == "north_to_south" else edges[::-1]

    @property
    def area_weights(self) -> np.ndarray:
        """Exact strip widths dmu (common longitude width omitted)."""
        return np.abs(np.diff(self.mu_edges))

    def validate_map(self, br_map) -> np.ndarray:
        values = np.asarray(br_map, dtype=np.float64)
        if values.shape != (self.mu.size, self.phi_rad.size) or not np.all(np.isfinite(values)):
            raise ValueError("magnetogram must be finite and match its explicit grid shape")
        return values


def equal_area_sine_latitude_grid(
    n_lat: int, n_lon: int, row_order: RowOrder = "north_to_south",
) -> MagnetogramGrid:
    n_lat, n_lon = _size(n_lat), _size(n_lon)
    mu = 1 - 2 * (np.arange(n_lat) + 0.5) / n_lat
    if row_order == "south_to_north":
        mu = mu[::-1]
    return MagnetogramGrid(mu, np.arange(n_lon) * 2 * np.pi / n_lon, row_order, EQUAL_AREA)


def uniform_colatitude_grid(
    n_lat: int, n_lon: int, row_order: RowOrder = "north_to_south",
) -> MagnetogramGrid:
    n_lat, n_lon = _size(n_lat), _size(n_lon)
    mu = np.cos((np.arange(n_lat) + 0.5) * np.pi / n_lat)
    if row_order == "south_to_north":
        mu = mu[::-1]
    return MagnetogramGrid(mu, np.arange(n_lon) * 2 * np.pi / n_lon, row_order, UNIFORM_COLATITUDE)
