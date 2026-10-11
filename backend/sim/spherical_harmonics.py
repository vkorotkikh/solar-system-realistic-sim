"""Schmidt quasi-normalized real harmonic basis without Condon-Shortley phase.

Pbar_l^m(mu) = sqrt((2-delta_m0) (l-m)!/(l+m)!) P_l^m(mu),
where the unnormalized P has no phase. Theta is colatitude in [0, pi].
"""

from __future__ import annotations

import math

import numpy as np


HARMONIC_CONVENTION_VERSION = "schmidt-quasi-normalized-no-cs-v1"


def schmidt_legendre(lmax: int, mu) -> dict[tuple[int, int], np.ndarray]:
    """Return values through lmax, retaining the shape of mu (including scalars)."""
    return schmidt_legendre_with_theta_derivative(lmax, mu)[0]


def schmidt_legendre_with_theta_derivative(
    lmax: int, mu,
) -> tuple[dict[tuple[int, int], np.ndarray], dict[tuple[int, int], np.ndarray]]:
    """Return values and analytic d/dtheta, including the exact pole limits.

    Only finite mu in [-1, 1] and integer degrees 0..64 are accepted.
    Differentiating the recurrence avoids division by sin(theta) at the poles.
    """
    if isinstance(lmax, (bool, np.bool_)) or not isinstance(lmax, (int, np.integer)) or not 0 <= lmax <= 64:
        raise ValueError("lmax must be an integer in [0, 64]")
    mu = np.asarray(mu, dtype=np.float64)
    if not np.all(np.isfinite(mu)) or np.any(abs(mu) > 1):
        raise ValueError("mu must be finite and in [-1, 1]")
    scalar = mu.ndim == 0
    # Keep one recurrence, but avoid NumPy scalar temporaries in scalar tracing.
    if scalar:
        mu = float(mu)
        sin_theta = math.sqrt((1 - mu) * (1 + mu))
        values = {(0, 0): 1.0}
        derivatives = {(0, 0): 0.0}
    else:
        sin_theta = np.sqrt((1 - mu) * (1 + mu))
        values = {(0, 0): np.ones_like(mu)}
        derivatives = {(0, 0): np.zeros_like(mu)}
    for l in range(1, lmax + 1):
        diagonal = 1.0 if l == 1 else math.sqrt((2 * l - 1) / (2 * l))
        previous = values[(l - 1, l - 1)]
        dprevious = derivatives[(l - 1, l - 1)]
        values[(l, l)] = diagonal * sin_theta * previous
        derivatives[(l, l)] = diagonal * (mu * previous + sin_theta * dprevious)

        subdiagonal = math.sqrt(2 * l - 1)
        values[(l, l - 1)] = subdiagonal * mu * previous
        derivatives[(l, l - 1)] = subdiagonal * (-sin_theta * previous + mu * dprevious)
        for m in range(l - 1):
            denominator = l * l - m * m
            a = (2 * l - 1) / math.sqrt(denominator)
            b = math.sqrt(((l - 1)**2 - m * m) / denominator)
            values[(l, m)] = a * mu * values[(l - 1, m)] - b * values[(l - 2, m)]
            derivatives[(l, m)] = (
                a * (-sin_theta * values[(l - 1, m)] + mu * derivatives[(l - 1, m)])
                - b * derivatives[(l - 2, m)]
            )
    if scalar:
        return ({key: np.asarray(value) for key, value in values.items()},
                {key: np.asarray(value) for key, value in derivatives.items()})
    return values, derivatives


def schmidt_azimuthal_factor(m: int, mu, value, theta_derivative) -> np.ndarray | float:
    """Return m*Pbar/sin(theta) using the same mu and basis as the recurrence.

    At either pole only m=1 survives, with Pbar/sin(theta) = dPbar/dtheta / mu.
    This also handles angles so small that their cosine rounds to exactly +/-1.
    Inputs are validated by the shared basis before this evaluator helper is used.
    """
    if isinstance(mu, float):
        if m == 0:
            return 0.0
        sin_theta = math.sqrt((1 - mu) * (1 + mu))
        if sin_theta == 0:
            return theta_derivative * mu if m == 1 else 0.0
        return m * value / sin_theta
    mu = np.asarray(mu, dtype=np.float64)
    result = np.zeros_like(mu)
    if m == 0:
        return result
    sin_theta = np.sqrt((1 - mu) * (1 + mu))
    np.divide(m * np.asarray(value), sin_theta, out=result, where=sin_theta != 0)
    if m == 1:
        result = np.where(sin_theta == 0, np.asarray(theta_derivative) * mu, result)
    return result
