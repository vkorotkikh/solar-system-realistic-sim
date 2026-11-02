# Solar rotation and display scope

Both the synthetic active-region model and the surface shader now adopt
`omega(latitude) = A + B sin²(latitude) + C sin⁴(latitude)` with coefficients
`(14.713, -2.396, -1.787)` degrees per day, **sidereal**. This approximates the
Doppler-residual feature-tracking fit in Snodgrass & Ulrich (1990), *The
Astrophysical Journal* 351:309–316, [Table 1, DOI 10.1086/168467](https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S).
The table reports `(2.972, -0.484, -0.361)` microradians per second; conversion
with `86400 × 180 / pi × 10^-6` gives approximately
`(14.712456, -2.395972, -1.787078)` degrees per day. The adopted tuple lies within
the source's printed precision and uncertainties. The source distinguishes
Doppler-feature, magnetic-feature and spectroscopic profiles; they are not
interchangeable calibrations of plasma or sunspot velocities.

The adoption is an explicit empirical choice for synthetic features. Backend
state metadata publishes its tuple, reference and frame; its equatorial and
polar periods are calculated from that tuple (about 24.4682 and 34.1880 days).
The shader gets the same tuple through a material uniform. The IAU Sun's rigid
orientation and Carrington bookkeeping are separate coordinate conventions;
the differential fit does not replace them.

The owner-approved decorative clock is retained. The shader uses the fit's
latitude dependence with perceptually scaled time. Particle streams and flare
lifetimes are also illustrative time-lapse; their apparent velocities do not
integrate physical km/s over simulated days. Pause, reverse and reduced-motion
suppression continue to freeze this decorative animation. Backend features
still evolve at requested JDTDB, independently of the decorative clock.

The corona shell is an **illustrative glow bounded at four displayed Sun
radii** at either scale. Its analytic radial brightness profile is not a measured
coronal edge, calibrated radiance or a statement that the corona physically ends
there. A material/mesh scope descriptor records this, and the Sun controls state
that the glow and eruption time-lapse are illustrative.

At realistic scale, geometric feature coordinates in solar-radius units use
the physical Sun radius. At the enlarged scale, heights above the displayed
surface retain the existing 15% compression. Particle brightness boosts remain
illustrative at either scale. The Parker spiral keeps physical AU distances and
clips inside an enlarged Sun. None of these display choices promotes the
observational gates, which remain separately qualified and fail closed.

The stream alpha map, smaller particles, upload storage, bounds and controller
texture disposal from the 2026-10-31 eruption repair remain intact; see
[the eruption-modeling record](solar-eruption-modeling.md).
