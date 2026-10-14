"""Bounded exact Schmidt/no-CS PFSS evaluation, with no sampled-field cache.

Only three adjacent harmonic degrees and their theta derivatives are retained.
Orders and positions are vectorized; the sole recurrence loop is over degree.
All requested modes are evaluated, including at the photosphere and poles.
"""
from __future__ import annotations

import math

import numpy as np


MAX_COEFFICIENT_DEGREE = 90
FIELD_BATCH_POINTS = 1024


def schmidt_latitude_design(degree, order, mu):
    """One order's projection design, retaining O(latitude_count * degree) values."""
    if isinstance(degree, (bool, np.bool_)) or not isinstance(degree, (int, np.integer)) or not 0 <= degree <= MAX_COEFFICIENT_DEGREE:
        raise ValueError("PFSS degree must be an integer in [0, 90]")
    mu = np.asarray(mu, dtype=float)
    if mu.ndim != 1 or not np.isfinite(mu).all() or np.any(abs(mu) > 1):
        raise ValueError("latitude design requires finite one-dimensional mu in [-1, 1]")
    st = np.sqrt((1 - mu) * (1 + mu))
    diagonal = 1.0
    for k in range(2, order + 1):
        diagonal *= math.sqrt((2*k - 1) / (2*k))
    design = np.empty((len(mu), degree - order + 1))
    design[:, 0] = diagonal * st**order
    if order < degree:
        design[:, 1] = math.sqrt(2*order + 1) * mu * design[:, 0]
    for l in range(order + 2, degree + 1):
        denominator = l*l - order*order
        a = (2*l - 1) / math.sqrt(denominator)
        b = math.sqrt(((l - 1)**2 - order*order) / denominator)
        design[:, l-order] = a * mu * design[:, l-order-1] - b * design[:, l-order-2]
    return design


class StreamingPFSS:
    def __init__(self, g, h, degree, source_radius):
        if isinstance(degree, (bool, np.bool_)) or not isinstance(degree, (int, np.integer)) or not 0 <= degree <= MAX_COEFFICIENT_DEGREE:
            raise ValueError("PFSS degree must be an integer in [0, 90]")
        self.degree = int(degree)
        self.rss = float(source_radius)
        if not math.isfinite(self.rss) or self.rss <= 1:
            raise ValueError("PFSS source radius must be finite and greater than 1")
        self.g, self.h = np.zeros((2, degree + 1, degree + 1))
        for source, target in ((g, self.g), (h, self.h)):
            source = np.asarray(source, dtype=float)
            rows, cols = min(len(source), degree + 1), min(source.shape[1], degree + 1)
            target[:rows, :cols] = source[:rows, :cols]
        self.orders = np.arange(degree + 1)
        self.a, self.b = np.zeros((2, degree + 1, degree + 1))
        for l in range(2, degree + 1):
            m = self.orders[:l-1]
            denominator = l*l - m*m
            self.a[l, :l-1] = (2*l - 1) / np.sqrt(denominator)
            self.b[l, :l-1] = np.sqrt(((l - 1)**2 - m*m) / denominator)
        l = self.orders
        self.denominators = l + 1 + l * self.rss**(-2*l - 1)

    def evaluate(self, r, theta, phi):
        r, theta, phi = np.broadcast_arrays(r, theta, phi)
        shape = r.shape
        flat = [v.ravel() for v in (r, theta, phi)]
        result = np.empty((3, r.size))
        for start in range(0, r.size, FIELD_BATCH_POINTS):
            stop = min(start + FIELD_BATCH_POINTS, r.size)
            result[:, start:stop] = self._chunk(*(v[start:stop] for v in flat))
        return tuple(component.reshape(shape) for component in result)

    def _chunk(self, r, theta, phi):
        mu = np.cos(theta)
        st = np.sqrt((1 - mu) * (1 + mu))
        cosine = np.cos(self.orders[:, None] * phi)
        sine = np.sin(self.orders[:, None] * phi)
        p2, p1, p = np.zeros((3, self.degree + 1, len(r)))
        d2, d1, dp = np.zeros((3, self.degree + 1, len(r)))
        p1[0] = 1
        br, bt, bp = np.zeros((3, len(r)))
        inverse = 1 / r
        radial = inverse**3
        reflected = np.full_like(r, self.rss**-3)
        reflected_ratio = r / self.rss**2
        poles = st == 0
        for l in range(1, self.degree + 1):
            a, b = self.a[l, :l-1, None], self.b[l, :l-1, None]
            p[:l-1] = a * mu * p1[:l-1] - b * p2[:l-1]
            dp[:l-1] = a * (-st * p1[:l-1] + mu * d1[:l-1]) - b * d2[:l-1]
            diagonal = 1 if l == 1 else math.sqrt((2*l - 1) / (2*l))
            p[l] = diagonal * st * p1[l-1]
            dp[l] = diagonal * (mu * p1[l-1] + st * d1[l-1])
            subdiagonal = math.sqrt(2*l - 1)
            p[l-1] = subdiagonal * mu * p1[l-1]
            dp[l-1] = subdiagonal * (-st * p1[l-1] + mu * d1[l-1])
            gh = self.g[l, :l+1, None] * cosine[:l+1] + self.h[l, :l+1, None] * sine[:l+1]
            dgh = -self.g[l, :l+1, None] * sine[:l+1] + self.h[l, :l+1, None] * cosine[:l+1]
            radial_factor = ((l + 1) * radial + l * reflected) / self.denominators[l]
            tangent_factor = -(radial - reflected) / self.denominators[l]
            br += radial_factor * np.sum(p[:l+1] * gh, axis=0)
            bt += tangent_factor * np.sum(dp[:l+1] * gh, axis=0)
            azimuthal = np.sum(self.orders[:l+1, None] * p[:l+1] * dgh, axis=0)
            np.divide(azimuthal, st, out=azimuthal, where=~poles)
            azimuthal[poles] = dp[1, poles] * mu[poles] * dgh[1, poles]
            bp += tangent_factor * azimuthal
            radial *= inverse
            reflected *= reflected_ratio
            p2, p1, p = p1, p, p2
            d2, d1, dp = d1, dp, d2
        return br, bt, bp
