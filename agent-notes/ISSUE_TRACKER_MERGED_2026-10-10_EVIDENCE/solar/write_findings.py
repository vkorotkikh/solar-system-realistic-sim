"""Writes findings.jsonl for SCN-001..011, 036, 041, 042, 048, 050, 051 at main 68c3f85. Evidence files sit beside it."""
import json, sys
from pathlib import Path
out = Path(sys.argv[1])
PROBE = "PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python agent-notes/ISSUE_TRACKER_MERGED_2026-10-10_EVIDENCE/solar/probe_solar_head.py $PWD  (output: probe_solar_head_68c3f85.json)"
INTEG = "PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python agent-notes/ISSUE_TRACKER_MERGED_2026-10-10_EVIDENCE/solar/integration_probe_head.py $PWD  (output: integration_probe_head_68c3f85.json)"
F = []
def add(**k): F.append(k)

add(id="SCN-001", claim="Tracker 10-10: RESOLVED on main (P2=-.125/P3=-.4375 at mu=.5, overlap ~1.28e-14, quadrupole reconstruction; mutation gate passes). Closure: preserve independent harmonic/pole/field gates.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/sim/pfss_magnetogram.py","lines":"166-168","quote":"def _associated_legendre(lmax, cos_theta): \"\"\"Legacy delegate for the shared Schmidt quasi-normalized basis.\"\"\" return schmidt_legendre(lmax, cos_theta)"},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"171-210","quote":"decompose_spherical_harmonics(... grid: MagnetogramGrid ...) area-weighted least squares, condition-number gate"}],
    probe={"command":PROBE,"result":"basis: P2_at_half=-0.125, P3_at_half=-0.4375, P0_P2_integral=1.2786e-14; quadrupole g21=0.999999999999998, other_max_abs=2.0e-15, photosphere_Br=0.7499999999999977 (expected .75); dipole_trace states match analytic, max boundary residual 2.2e-16"},
    fixing_commit="1a6fcaa fix(pfss): unify the normalized harmonic basis (2026-09-26); grid weighting 70af7c8", fix_size="none", fix_files=[],
    notes="pfss_magnetogram.py is byte-identical to e7de6cc at HEAD (git diff --quiet). Nothing in PR #1/#3/#4/#5 touched it.", confidence="high")

add(id="SCN-002", claim="Tracker 10-10: RESOLVED on main (original NumPy dtype crash removed; valid frozen 180x360 FITS parses). Closure: use a valid parser-to-source-status fixture; float64 admission defect is SCN-051.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/sim/gong_magnetogram.py","lines":"760-767","quote":"hdu.verify_checksum() ... header_metadata = _validate_header_metadata(header, filename); native_bunit, gauss_factor = _validate_unit(header); wcs_metadata, grid = _validate_wcs(header, ...); scaled = np.asarray(hdu.data, dtype=np.float64)"},
                   {"file":"backend/sim/gong_magnetogram.py","lines":"(whole file)","quote":"grep newbyteorder -> no matches; pixels come from astropy hdu.data"}],
    probe={"command":PROBE,"result":"fits: shape [180,360], first_pixel_gauss 0.25, grid_area_sum 12.566370614 (=4pi), row_order south_to_north, read_only true"},
    fixing_commit="401c28d feat(solar): validate GONG FITS and WCS provenance (2026-09-26)", fix_size="none", fix_files=[],
    notes="File unchanged since e7de6cc. Residual float64 round-trip is SCN-051.", confidence="high")

add(id="SCN-003", claim="Tracker 10-10: RESOLVED on main (explicit grid contract: WCS, orientation, exact area weights, weighted decomposition). Closure: preserve fixture orientation/area/harmonic gates; real observed accuracy unverified.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/sim/magnetogram_grid.py","lines":"25-83","quote":"class MagnetogramGrid: row_order: RowOrder ... def area_weights ... def validate_map ... def equal_area_sine_latitude_grid(n_lat, n_lon, row_order=...)"},
                   {"file":"backend/sim/gong_magnetogram.py","lines":"516-558","quote":"_close_deg(_number(header,'CRVAL1'), (long0+180)%360, 'CRVAL1') ... CTYPE1A == 'CRN-CEA' ... def _validate_wcs(header, long0) -> tuple[GongWcsMetadata, MagnetogramGrid]"},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"171-210","quote":"decompose_spherical_harmonics(br_map, lmax, *, grid: MagnetogramGrid, ...): sqrt_weight = np.sqrt(grid.area_weights); weighted = design * sqrt_weight[:, None]"}],
    probe={"command":PROBE,"result":"fits.row_order=south_to_north, grid_area_sum=4pi; analytic l=2,m=1 Schmidt map recovered g21=0.999999999999998 with other coefficients <=2e-15"},
    fixing_commit="70af7c8 fix(pfss): honor sine-latitude magnetogram geometry (2026-09-26)", fix_size="none", fix_files=[],
    notes="Unchanged since e7de6cc. Observed-runtime accuracy against real GONG pixels remains unverified (no provider access).", confidence="high")

add(id="SCN-004", claim="Tracker 10-10: OPEN/OBS narrower residual on main: bytes/redirects/framing/gzip/body reads bounded, but blocking header parsing and DNS resolution exceed the total acquisition deadline (50 ms budget -> ~404 ms drip headers, ~201 ms delayed resolver). Closure: bounded completion/resource recovery for DNS, headers, bodies and cancellation.",
    verdict_head="PRESENT",
    evidence_head=[{"file":"backend/sim/solar_realtime_data.py","lines":"1027-1035","quote":"def _open_response(self, request, *, timeout_s): opener = urllib.request.build_opener(_NoRedirectHandler()); return opener.open(request, timeout=max(timeout_s, 1e-6))"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"1194-1199","quote":"response = self._open_response(request, timeout_s=self._remaining_acquisition_time(deadline_monotonic)); try: self._remaining_acquisition_time(deadline_monotonic)  # deadline only re-checked after open returns"},
                   {"file":"backend/server.py","lines":"3013-3042","quote":"solar_realtime_data(...) runs via executor=_solar_realtime_executor, timeout_seconds=SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS -> 'solar_realtime_timeout' (thread not killed)"},
                   {"file":"backend/tests/test_solar_realtime_data_transport.py","lines":"589,630","quote":"test_redirect_chain_shares_one_absolute_acquisition_deadline; test_slow_drip_reads_receive_remaining_budget_and_stop_at_deadline (body drip only; no header/DNS test)"}],
    probe={"command":PROBE,"result":"realtime_drip_headers: budget 0.05 s, elapsed 0.4033 s, error acquisition_deadline; realtime_delayed_dns: budget 0.05 s, elapsed 0.2011 s, URLError; gong_drip_body: 0.4023 s read_timeout (offline path)"},
    fixing_commit=None, fix_size="small-to-medium", fix_files=["backend/sim/solar_realtime_data.py (_open_response/_request_bytes: run opener.open under a deadline, e.g. resolve DNS first with a bounded helper and parse headers on a socket with an absolute deadline, or run the open in a daemon thread and abandon/close the socket on expiry)","backend/tests/test_solar_realtime_data_transport.py (header-drip and delayed-resolver cases)"],
    notes="solar_realtime_data.py unchanged since e7de6cc; identical observation reproduced at HEAD. Realistic fix: wrap opener.open in a worker thread with a sock-closing timeout (urllib has no absolute header deadline), plus bounded socket.getaddrinfo. Larger if cancellation/permit-recovery of the executor thread is also required.", confidence="high")

add(id="SCN-005", claim="Tracker 10-10: OPEN/CODE+browser OBS on main: realtime/physics polling separated, process containment, compatible deadlines, but no shipped UI consumes getSolarDeliveryStatus (refused backend still shows 'Live simulation'). Closure: visible provenance/state plus real production-budget dev/preview delivery.",
    verdict_head="PARTIAL",
    evidence_head=[{"file":"index.html","lines":"397,401","quote":"id=\"status-solar\" ... <span id=\"status-solar-announcer\" class=\"visually-hidden\" role=\"status\"></span>"},
                   {"file":"src/main.ts","lines":"129-130,263,273-277","quote":"statusSolar: elementById('status-solar') ... onSolarDataStatus: (status) => { renderSolarDataStatus(dom.statusSolar, status); if (solarDataAnnouncer.observe(status) && status.state !== 'backend') console.warn(...) }"},
                   {"file":"src/frontend/features/solar/solarDataStatus.ts","lines":"14-27,156,207","quote":"export type SolarDataSourceState = 'connecting' | 'backend' | 'stale' | 'error'; describeSolarDataStatus(...); renderSolarDataStatus(element, status)"},
                   {"file":"src/sunController.ts","lines":"199-215,412,418,704","quote":"function publishSolarDataStatus() { const status = describeSolarDataStatus({...}); onSolarDataStatus?.(status); } called after every refresh attempt and image load"},
                   {"file":"src/frontend/features/solar/solarPhysicsClient.ts","lines":"9-11","quote":"SOLAR_PHYSICS_POLL_INTERVAL_MS = 30_000; SOLAR_PHYSICS_REQUEST_TIMEOUT_MS = 20_000; SOLAR_PHYSICS_ERROR_BACKOFF_MS = 30_000"},
                   {"file":"src/frontend/features/solar/solarRealtimeClient.ts","lines":"12","quote":"SOLAR_REALTIME_POLL_INTERVAL_MS = 120_000"}],
    probe={"command":"npx vitest run src/frontend/features/solar/solarDataStatus.test.ts src/sunController.test.ts src/frontend/features/solar/solarPhysicsClient.test.ts  (log: vitest_solar_status_68c3f85.log)","result":"3 files, 74 tests passed (24 + 39 + 11)"},
    fixing_commit="82dd139 fix(ui): show when the Sun falls back to the procedural model (PR #4 fix/solar-data-status-notice, merged 50d6a10); follow-ups 3889c84, 56fa7a2, 7c791dc, 4065b05", fix_size="large (remaining part is a measurement gate, not code)", fix_files=["(no code) a recorded five-minute dev/preview browser delivery run at the production 18 s budget against a real backend; backend/tests/conftest.py:68-89 still raises content-test budgets to 60 s"],
    notes="The 'no shipped UI' residual is closed by PR #4. The production-budget delivery gate (cold compute vs 20 s client / 19 s server cap) is CANNOT-VERIFY here: needs a browser and a live backend run; not measured in this verification. Old 4.094 s timing is historical.", confidence="high for the UI half; n/a for the delivery gate")

add(id="SCN-006", claim="Tracker 10-10: RESOLVED on main (localhost and 127.0.0.1:4173 preflights pass; 5173 passes). Closure: preserve origin tests; verify configured deployment separately.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/server.py","lines":"450-453","quote":"\"http://localhost:5173\", \"http://127.0.0.1:5173\", \"http://localhost:4173\", \"http://127.0.0.1:4173\","}],
    probe={"command":INTEG,"result":"OPTIONS /solar/physics: localhost:4173 -> 200 allow-origin http://localhost:4173; 127.0.0.1:4173 -> 200; localhost:5173 -> 200; https://untrusted.invalid -> 400, no allow-origin"},
    fixing_commit="5182128 fix(security): allow local Vite preview origin (2026-09-26)", fix_size="none", fix_files=[],
    notes="server.py unchanged since e7de6cc. Real deployment origin configuration not inspected (SCN-048).", confidence="high")

add(id="SCN-007", claim="Tracker 10-10: RESOLVED on main (50 rotating XFF/key values collapse to one transport identity: 36 admitted/14 rejected; bounded stores; trusted proxies). Closure: preserve authenticated/trusted transport policy, caps and eviction.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/server.py","lines":"1594-1657","quote":"def _client_identity(request, *, config=None): ... authenticated subject first ... if not forwarded_header_valid or not forwarded_for or peer_address is None or not _address_in_trusted_proxy_networks(peer_address, active_config): return f\"peer:{peer_identity}\" ... right-to-left walk selects first non-trusted address"},
                   {"file":"backend/server.py","lines":"358-364,396,956-957,1381,1731-1737","quote":"max_identities: int = 4_096 ... SOLAR_RATE_LIMIT_MAX_IDENTITIES = _load_bounded_env_int(...) ... _solar_physics_rate_locks: OrderedDict[str, deque[float]] (LRU, bounded)"}],
    probe={"command":INTEG,"result":"identity.xff: accepted 36, rejected 14, rate_store_entries 1, client_identity_count 1; identity.key: identical (36/14/1/1)"},
    fixing_commit="0789e08 fix(solar): harden endpoint admission (2026-09-26)", fix_size="none", fix_files=[],
    notes="server.py unchanged since e7de6cc.", confidence="high")

add(id="SCN-008", claim="Tracker 10-10: RESOLVED for /solar/physics on main (rejects +-1e30 before compute; JDTDB bounded to J2000+-200 Julian years). Explicitly not generalized to /solar/realtime/aia-tile (SCN-048).",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/server.py","lines":"892-902","quote":"SOLAR_PHYSICS_JD_HALF_RANGE_DAYS = _load_bounded_env_float('SOLAR_PHYSICS_JD_HALF_RANGE_DAYS', 200.0*365.25, min_value=365.25, max_value=200.0*365.25); SOLAR_PHYSICS_JD_MIN = J2000_JD - ...; SOLAR_PHYSICS_JD_MAX = J2000_JD + ..."},
                   {"file":"backend/server.py","lines":"3297-3312","quote":"epoch_jd = _resolve_jd_tdb_query(jd_tdb, jd, default_to_now=True); if not (SOLAR_PHYSICS_JD_MIN <= epoch_jd <= SOLAR_PHYSICS_JD_MAX): raise HTTPException(400, {'code': 'jd_out_of_range', ...})"},
                   {"file":"backend/server.py","lines":"3088-3089 (aia-tile)","quote":"epoch_jd_tdb = _resolve_jd_tdb_query(jd_tdb, jd, default_to_now=False)  # resolver checks finiteness only; no range check on this route"}],
    probe={"command":INTEG,"result":"GET /solar/physics jd=2451545 -> 200, admitted to compute stub; jd=1e30 -> 400 jd_out_of_range, not admitted; jd=-1e30 -> 400 jd_out_of_range, not admitted; message '[2378495.0, 2524595.0] JDTDB'"},
    fixing_commit="57ad971 R3 Layer 2: bound the work one /solar/physics request can buy (2026-08-24); test d5895bd", fix_size="small (if extending to aia-tile)", fix_files=["backend/server.py (solar_realtime_aia_tile: apply a declared provider date-range check after _resolve_jd_tdb_query)"],
    notes="server.py unchanged since e7de6cc. AIA-tile historical-date bound remains absent, tracked under SCN-048 by the tracker's own scoping.", confidence="high")

add(id="SCN-009", claim="Tracker 10-10: RESOLVED by explicit disable/fallback on main (stale input leaves .8 unchanged, applied=false, disabled_unvalidated). Closure: independently validated epoch/provenance policy before enabling.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/sim/solar_physics.py","lines":"390-425","quote":"_apply_realtime_forcing(...): assimilation = {... 'applied': False, 'blend_weight': 0.0, 'observed_input_status': 'not_requested' if synthetic else 'disabled_unvalidated'}; if forcing_key == 'hybrid': assimilation['fallback_reason'] = 'disabled_unvalidated'; return synthetic_activity, assimilation, None"}],
    probe={"command":PROBE,"result":"stale_forcing: activity 0.8 (unchanged), assimilation.applied false, blend_weight 0.0, effective_mode synthetic, observed_input_status disabled_unvalidated, wind_override null"},
    fixing_commit="9655458 fix(solar): fail closed on unvalidated GONG input (2026-09-26)", fix_size="none (large if validated assimilation is wanted)", fix_files=["backend/sim/solar_physics.py (_apply_realtime_forcing) only if assimilation is to be re-enabled with an epoch/provenance policy"],
    notes="Safe disabling, not validated assimilation. solar_physics.py changes since e7de6cc (0ea15f8, a91ce42) do not touch this path.", confidence="high")

add(id="SCN-010", claim="Tracker 10-10: OPEN/OBS on main: aggregate failure snapshot cached for the normal 300 s TTL despite 4.5 s failure-backoff; SWPC recovery at +5/+299 s suppressed, retried only at +301 s. Closure: gate failed/partial snapshots, bounded retry and source age independently; preserve SILSO LKG.",
    verdict_head="PRESENT",
    evidence_head=[{"file":"backend/sim/solar_realtime_data.py","lines":"388-389","quote":"if not isinstance(swpc_status, Mapping) or swpc_status.get('ok') is not True: return self.cache_ttl_s"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"630-646","quote":"snapshot = self._fetch_snapshot(requested_jd_tdb) ... cache_lifetime_s = self._snapshot_cache_lifetime_s(snapshot, ...); self._snapshot_cache[key] = (completed_monotonic + cache_lifetime_s, snapshot)"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"2583-2638","quote":"except Exception as exc: snapshot['source_status']['swpc'] = {'ok': False, ...}  (same for silso, sdo_aia) ... return snapshot  # failures become ordinary cached snapshots"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"209,1531","quote":"self.singleflight_error_backoff_s = 4.5  # applies only to raised exceptions, not to returned failure snapshots"}],
    probe={"command":PROBE,"result":"outage_cache: swpc_acquisitions [[swpc,100.0],[swpc,401]]; swpc_ok_at_0_5_299_301_seconds [false,false,false,true]; ttl_seconds 300.0; declared_failure_backoff_seconds 4.5"},
    fixing_commit=None, fix_size="small", fix_files=["backend/sim/solar_realtime_data.py (_snapshot_cache_lifetime_s: return a short failure lifetime, e.g. singleflight_error_backoff_s, when any required source_status.ok is False / snapshot is partial, instead of cache_ttl_s)","backend/tests/test_solar_realtime_data_cache.py (outage -> recovery before TTL for fully failed and partially failed snapshots)"],
    notes="File unchanged since e7de6cc; identical clock-driven observation reproduced at HEAD. Existing tests (lines 566-669) cover only exception-path backoff.", confidence="high")

add(id="SCN-011", claim="Tracker 10-10: RESOLVED on main (backend canonicalizes AIA dates to UTC before frontend Date.parse; tests pass). Closure: preserve canonical UTC ingestion and cross-timezone freshness tests.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/sim/solar_realtime_data.py","lines":"2311-2333","quote":"_canonical_aia_image_date(cls, value): for date_format in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%SZ'): ... parsed = candidate.replace(tzinfo=timezone.utc) ... return cls._canonical_utc_time_tag(parsed)"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"2417-2429","quote":"image_date = self._canonical_aia_image_date(payload.get('date')) ... 'image_date': image_date"},
                   {"file":"src/frontend/features/solar/solarObservationTexture.ts","lines":"77-79","quote":"function asFreshnessProxy(imageDate: unknown) { ... const parsedMs = Date.parse(imageDate);  // now receives '...Z' strings"},
                   {"file":"backend/tests/test_solar_realtime_data_cache.py","lines":"~1180-1219","quote":"test_aia_metadata_is_canonicalized_before_snapshot_cache: 'date': '2026-09-27 12:34:56' -> channel['image_date'] == '2026-09-27T12:34:56Z'"}],
    probe={"command":"PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python -m pytest -q backend/tests/test_solar_realtime_data_cache.py -k 'image_date or utc or aia'  (log: pytest_realtime_cache_aia_utc_68c3f85.log)","result":"38 passed, 32 deselected"},
    fixing_commit="af027c2 Harden solar realtime integration (2026-09-27)", fix_size="none", fix_files=[],
    notes="Frontend still calls Date.parse (unchanged file), but the input it receives is canonical 'Z' UTC, so browser TZ no longer affects it. No frontend cross-TZ test with a fixed clock was found; adding one is optional hardening.", confidence="high")

add(id="SCN-036", claim="Tracker 10-10: RESOLVED on main (authenticated network profile, bounded message handling, per-subject admission alongside global ownership; tests pass). Residual (multiple valid subjects can fill all slots; multi-worker; long-lived load) moved to SCN-047/048.",
    verdict_head="RESOLVED",
    evidence_head=[{"file":"backend/server.py","lines":"860-870","quote":"WS_SIM_CONNECTION_LIMIT = _load_env_int('WS_SIM_CONNECTION_LIMIT', 4, min_value=1); WS_SIM_PER_SUBJECT_CONNECTION_HARD_MAX = 8; WS_SIM_PER_SUBJECT_CONNECTION_LIMIT = min(configured, ...)"},
                   {"file":"backend/server.py","lines":"1921-1944","quote":"_try_acquire_ws_sim_slot(authenticated_subject=None): if not _acquire_nonblocking(_ws_sim_connection_guard): return None; if authenticated_subject is not None and subject_connections >= WS_SIM_PER_SUBJECT_CONNECTION_LIMIT: release; return None"},
                   {"file":"backend/server.py","lines":"2007-2013","quote":"_network_websocket_subject(websocket): if SOLAR_SECURITY_CONFIG.profile != 'network': return None; return _authenticated_api_subject_from_scope(...)"},
                   {"file":"backend/tests/test_ws_resource_contract.py","lines":"153,451","quote":"test_websocket_admission_preserves_global_cap_with_per_subject_fairness; test_network_websocket_releases_the_exact_subject_lease_on_failure"}],
    probe={"command":"PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python -m pytest -q backend/tests/test_ws_resource_contract.py  (log: pytest_ws_resource_contract_68c3f85.log)","result":"35 passed"},
    fixing_commit="735a2cc fix(security): enforce websocket subject fairness (2026-09-26)", fix_size="none (as scoped)", fix_files=[],
    notes="Per-subject cap applies only in the 'network' profile (anonymous local profile has subject None and only the global cap). Multi-subject exhaustion and multi-worker remain SCN-047/048 by the tracker's own scoping.", confidence="high")

add(id="SCN-041", claim="Tracker 10-10 §6 VERIFY queue: main evaluates radial fields at exact r=1/r_ss boundaries and labels output wsa_inspired_v1; formula mutant killed. Remaining: independent observed/reference speed-map calibration and topology/coverage acceptance.",
    verdict_head="CANNOT-VERIFY",
    evidence_head=[{"file":"backend/sim/pfss_magnetogram.py","lines":"56","quote":"WSA_MODEL_VERSION = \"wsa_inspired_v1\""},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"535-541","quote":"_wsa_velocity: \"Evaluate the repository's unvalidated wsa_inspired_v1 relation. This is deliberately not labelled as the operational WSA model ... docs/adr/0004-wsa-inspired-semantics.md\""},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"803-829","quote":"br_photosphere = sum(photosphere_fields * photosphere_vectors); br_source_surface[open] = sum(open_fields * open_unit); fs_val[valid_radial] = (1/r_ss)**2 * |br_photosphere| / |br_source_surface|"}],
    probe=None,
    fixing_commit="8fd45d5 fix(solar): make WSA-inspired output scientifically explicit (2026-09-26) for the formula/label; calibration not a code fix", fix_size="large (needs an external reference speed map / oracle, not a code change)", fix_files=["backend/sim/pfss_magnetogram.py (only if calibration constants change)","backend/tests (new reference-case tests)"],
    notes="Code state at HEAD identical to what the 10-10 audit inspected (file unchanged). Scientific calibration against observed/reference WSA speed maps requires external data not in the repo and is out of scope for an offline probe; the honest 'wsa_inspired_v1' label is in place.", confidence="high that the label/formula are as described; calibration unverified")

add(id="SCN-042", claim="Tracker 10-10 §6 VERIFY queue: Hathaway error split to SCN-050; stale forcing to SCN-009; main disables unvalidated inference; both backend PFSS and Parker are Z-up. Remaining: separate coordinate/rotation/projection oracles.",
    verdict_head="PARTIAL",
    evidence_head=[{"file":"backend/sim/solar_physics.py","lines":"88-93","quote":"# Snodgrass & Ulrich (1990) sidereal photospheric Doppler profile (deg/day). deg_per_day = 14.713 - 2.396*sin2 - 1.787*sin2*sin2"},
                   {"file":"backend/sim/solar_physics.py","lines":"1094","quote":"\"differential_rotation_model\": \"snodgrass_ulrich_1990\",  (was snodgrass_1983_like)"},
                   {"file":"backend/sim/solar_physics.py","lines":"17,1082","quote":"CARRINGTON_ROTATION_DAYS = 27.2753 ... \"jd_time_scale\": \"TDB\""},
                   {"file":"backend/tests","lines":"(grep)","quote":"no test references 'differential_rotation_model' or 'snodgrass_ulrich_1990'"}],
    probe={"command":"PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python -m pytest -q backend/tests/test_solar_physics_model.py  (log: pytest_solar_physics_model_68c3f85.log)","result":"18 passed in 59.94 s"},
    fixing_commit="a91ce42 fix(solar): label the differential rotation as Snodgrass & Ulrich 1990 (PR #3); 0ea15f8 for the Hathaway part (SCN-050)", fix_size="large (frame/projection oracles)", fix_files=["backend/sim/solar_physics.py (frame conventions)","src/frontend/features/solar/solarMagnetics.ts, sunVisuals.ts, src/sunController.ts (Y-up/Z-up handling; PR #5 cc804a2 moved poles onto the spin axis but did not add a backend/frontend frame oracle)","new coordinate/rotation/projection tests"],
    notes="Label correction verified by reading the diff; coefficients 14.713/-2.396/-1.787 are the Snodgrass & Ulrich 1990 values. Rotation/projection/frame correspondence between backend Z-up output and the frontend remains unverified (needs an oracle, not available offline). Label has no pinning test.", confidence="medium")

add(id="SCN-048", claim="Tracker 10-10 §6 VERIFY queue: main migrated NOAA to RTSW 1-minute products with quality/age/skew checks; no fresh live upstream HTTP status or real deployment/proxy/auth configuration established; AIA historical-date coverage bound separately.",
    verdict_head="CANNOT-VERIFY",
    evidence_head=[{"file":"backend/sim/solar_realtime_data.py","lines":"115-123","quote":"NOAA_WIND_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'; NOAA_MAG_URL = '.../rtsw_mag_1m.json'; SILSO_DAILY_URL = 'https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv'; HELIOVIEWER_* = 'https://api.helioviewer.org/v2/...'"},
                   {"file":"backend/sim/solar_realtime_data.py","lines":"1852","quote":"\"schema\": {\"name\": \"noaa_swpc_rtsw_context\", \"version\": 2}"},
                   {"file":"backend/server.py","lines":"3063-3089","quote":"@app.get('/solar/realtime/aia-tile') ... epoch_jd_tdb = _resolve_jd_tdb_query(jd_tdb, jd, default_to_now=False)  # finiteness only; no provider date-range bound"}],
    probe=None,
    fixing_commit=None, fix_size="small for the AIA-tile date bound; the rest is an operational measurement, not code", fix_files=["backend/server.py (solar_realtime_aia_tile: reject epochs outside the Helioviewer/AIA archive window with a typed 400)","deployment config review (out of repo)"],
    notes="Live HTTP status of the configured endpoints and real deployment/proxy/auth cannot be measured under the no-network rule. Code-level facts at HEAD: RTSW 1-minute endpoints present (unchanged since e7de6cc); AIA-tile route still has no epoch range check.", confidence="high for code facts; live status unverified")

add(id="SCN-050", claim="Tracker 10-10 (new, P2, all tips): Hathaway normalization divides by the c=0 peak b*sqrt(3/2)=66.14 months instead of the true 58.39-month peak for c=.71; clamp yields a flat 1.0 plateau over ~51.03-66.13 months. 'The frontend fallback uses the same historical normalization and also needs review.' Closure: normalize at the actual parameterized maximum (or document clipping); gate derivative zero, peak value and shape.",
    verdict_head="PARTIAL",
    evidence_head=[{"file":"backend/sim/solar_physics.py","lines":"138-161","quote":"@lru_cache def _hathaway_peak_months(b, c): # exp(s)*(3-2s) = 3c ... bisect ... return b*sqrt(s); HATHAWAY_PEAK_MONTHS = _hathaway_peak_months(); _hathaway_normalized: t_peak = _hathaway_peak_months(b, c)"},
                   {"file":"backend/tests/test_solar_physics_model.py","lines":"69-83","quote":"test_hathaway_envelope_peaks_at_exactly_one_at_its_true_maximum: HATHAWAY_PEAK_MONTHS == approx(58.39); sum(v >= 1.0-1e-12) <= 1"},
                   {"file":"src/sunController.ts","lines":"111-116","quote":"function hathawayNormalized(tMonths) { const tPeak = HATHAWAY_B * Math.sqrt(1.5); const peak = hathawayRaw(tPeak); ... return Math.max(0, Math.min(1, hathawayRaw(tMonths) / peak)); }  // c=0 peak still used"},
                   {"file":"src/sunController.ts","lines":"118-126,540-545","quote":"fallbackSolarActivityFromJulianDate -> hathawayNormalized(tMonths); const fallbackActivity = fallbackSolarActivityFromJulianDate(julianDate); ... ?? fallbackActivity  (reachable: PR #5 f1eff8c made the fallback the drawn activity when backend data is missing)"}],
    probe={"command":"backend: "+PROBE+" ; frontend: node agent-notes/ISSUE_TRACKER_MERGED_2026-10-10_EVIDENCE/solar/probe_frontend_hathaway_head.mjs (verbatim copy of sunController.ts:98-116; output probe_frontend_hathaway_head_68c3f85.json)","result":"backend: plateau_sample_count 0, clamped_plateau_month_range null, max_normalized 0.99999999997, argmax_month 58.39, HATHAWAY_PEAK_MONTHS 58.3897591257; pytest test_solar_physics_model.py 18 passed. frontend: normalization_peak_month 66.136, true peak 58.39, unclamped_overshoot_ratio 1.03433, clamped_plateau_month_range [51.03, 66.13], plateau_sample_count 1511"},
    fixing_commit="backend: 0ea15f8 fix(solar): normalise the Hathaway cycle at its true maximum (PR #3). frontend: none; PR #5 (fix/solar-display-truth) touched sunController.ts seven times but left hathawayNormalized unchanged (git diff e7de6cc..HEAD shows no change to lines 111-116)",
    fix_size="small", fix_files=["src/sunController.ts (hathawayNormalized: compute tPeak by the same bisection of exp(s)*(3-2s)=3c, or hard-code HATHAWAY_PEAK_MONTHS = 58.3897591257 with a comment)","src/sunController.test.ts (pin peak month and no plateau)"],
    notes="Backend half RESOLVED and tested. Frontend fallback still PRESENT and now actively drawn whenever the backend activity index is missing (connecting/error states), so the 15-month plateau is visible in the procedural Sun. PR #3 body explicitly deferred this to the display-truth branch, which did not pick it up.", confidence="high")

add(id="SCN-051", claim="Tracker 10-10 (new, P2, main only, latent/offline): gong_magnetogram._balance_flux subtracts an admissible roundoff monopole; pfss_magnetogram reconstructs raw FITS bytes from the balanced field and demands the original SHA256; a parser-accepted 180x360 float64 fixture with ~1e-13 G mean and a 1e-30 pixel raises 'snapshot native header fields are inconsistent' at PFSS admission. Closure: parser->solver round trips for supported BITPIX/scaling/unit combinations while tampered artifacts stay rejected.",
    verdict_head="PRESENT",
    evidence_head=[{"file":"backend/sim/gong_magnetogram.py","lines":"688-711","quote":"_balance_flux: mean = signed/(4pi); balanced = np.asarray(field_gauss, dtype=np.float64) - mean ... removed_mean_g=mean"},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"1806-1822","quote":"scaled = (np.asarray(field, dtype=np.float64) + removed_mean_g) / gauss_conversion_factor; raw = (scaled - bzero) / bscale; ... data_bytes = np.asarray(raw, dtype=dtype, order='C').tobytes()"},
                   {"file":"backend/sim/pfss_magnetogram.py","lines":"1644-1647","quote":"or hashlib.sha256(reconstructed_fits).hexdigest() != provenance.expanded_fits_sha256: raise ValueError('snapshot native header fields are inconsistent')"}],
    probe={"command":PROBE,"result":"accepted_float_snapshot_rejected_by_pfss: fits_parser_accepted true, bitpix -64, removed_mean_gauss 9.997249770134203e-14, pfss_validation_error ValueError 'snapshot native header fields are inconsistent'"},
    fixing_commit=None, fix_size="small-to-medium", fix_files=["backend/sim/gong_magnetogram.py (carry the original raw pixel bytes or their SHA in the snapshot provenance so PFSS can verify identity without inverting the float subtraction) or backend/sim/pfss_magnetogram.py (_validate_observed_snapshot_contract: verify the raw-bytes hash recorded by the parser instead of reconstructing bytes from balanced floats; keep header tamper checks)","backend/tests/test_gong_magnetogram*.py / test_pfss_* (round-trip for BITPIX -64 with tiny pixels and allowed monopole removal)"],
    notes="Both files unchanged since e7de6cc; identical reproduction at HEAD. Latent: observed GONG runtime is disabled on main, so no shipped request path reaches it today. Error message is also misleading (it is a pixel round-trip mismatch, not a header inconsistency).", confidence="high")

with out.open("w") as fh:
    for f in F:
        fh.write(json.dumps(f, ensure_ascii=False) + "\n")
print(f"wrote {len(F)} findings to {out}")
