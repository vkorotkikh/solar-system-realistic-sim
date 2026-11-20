#!/usr/bin/env python3
"""JPL Small-Body Database query parameters for the pinned Phase 1 asteroid population.

Shared by build_asteroid_phase1_dataset.py and capture_catalog_sources.py. The
legacy --dry-run preview that lived here is retired; use
scripts/build_asteroid_phase1_dataset.py for validated offline preview or
explicit --write publication.
"""

from __future__ import annotations

import json
import sys

SBDB_API_URL = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
SBDB_FIELDS = "spkid,full_name,H,diameter,albedo,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T"


def phase1_query_params() -> dict[str, str]:
    return {
        "fields": SBDB_FIELDS, "sb-kind": "a", "sb-class": "MBA,IMB,OMB",
        "sort": "-diameter,spkid", "limit": "100000", "full-prec": "true",
        "sb-cdata": json.dumps({"AND": ["a|GE|2", "a|LE|3.5", "diameter|GT|0"]}, separators=(",", ":")),
    }


if __name__ == "__main__":
    sys.exit("The legacy SBDB preview is retired. Use: "
             "python3 scripts/build_asteroid_phase1_dataset.py --offline --check")
