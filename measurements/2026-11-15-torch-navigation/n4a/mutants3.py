[
 ("            shift = 0.5 * (before - after) / bend  # in rows, from the nearest row", "            shift = 0.0"),
 ("            shift = 0.5 * (before - after) / bend  # in rows, from the nearest row", "            shift = 0.5 * (after - before) / bend"),
 ('return {"au": float(math.sqrt(max(here - 0.25 * (before - after) * shift, 0.0))),', 'return {"au": float(math.sqrt(max(here, 0.0))),'),
 ("    if 0 < row < len(times) - 1:\n", "    if 0 <= row < len(times) - 1:\n"),
 ('"jd": float(times[row] + shift * (times[row + 1] - times[row]))}', '"jd": float(times[row])}'),
 ("times, squared = path[:, 0], (path[:, 1:] ** 2).sum(axis=1)", "times, squared = path[:, 0], np.linalg.norm(path[:, 1:], axis=1)"),
]
