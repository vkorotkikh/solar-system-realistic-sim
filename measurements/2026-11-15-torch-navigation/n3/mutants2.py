[
 ("            rank(jd for jd in (grid[k] + offset for offset in range(1 - step, step)) if lo <= jd <= hi)", "            rank(jd for jd in (grid[k] + offset for offset in range(0, step)) if lo <= jd <= hi)"),
 ("            rank(jd for jd in (grid[k] + offset for offset in range(1 - step, step)) if lo <= jd <= hi)", "            rank(jd for jd in (grid[k] + offset for offset in range(1 - step, 1)) if lo <= jd <= hi)"),
 ('        elif found_a_way_out:\n            message = f"No way back to {origin.name} was found within the stay range."\n', ""),
 ("    if grid[-1] < hi:\n        grid.append(hi)\n", ""),
]
