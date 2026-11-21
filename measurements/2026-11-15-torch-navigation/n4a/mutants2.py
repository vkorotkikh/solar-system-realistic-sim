[
 ("            if not low < step < high:\n                step = 0.5 * (low + high)\n", ""),
 ("coarse = np.unique(np.r_[np.arange(0, len(times), 10), len(times) - 1])", "coarse = np.arange(0, len(times), 10)"),
 ("owner = np.clip(np.searchsorted(coarse, np.arange(len(times)), side=\"right\") - 1, 0, len(coarse) - 2)", "owner = np.clip(np.searchsorted(coarse, np.arange(len(times)), side=\"right\") - 1, 0, len(coarse) - 1)"),
]
