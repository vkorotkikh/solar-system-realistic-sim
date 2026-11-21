import sys
from multiprocessing import Pool
from exp2 import run
from det import *
if __name__ == "__main__":
    tasks = []
    for (a, b) in (("earth","jupiter"), ("earth","mercury")):
        for g in (1.0, 0.3):
            for day in range(0, 3650, 2):
                tasks.append((a, b, g, float(day), 0.1))
    for g in (0.1, 3.0, 10.0):
        for day in range(0, 3650, 4):
            tasks.append(("earth", "mars", g, float(day), 0.1))
    t = time.time()
    with Pool(8) as p: res = p.map(run, tasks, chunksize=8)
    json.dump(res, open("exp2b.json", "w"))
    print("done", len(res), time.time() - t)
