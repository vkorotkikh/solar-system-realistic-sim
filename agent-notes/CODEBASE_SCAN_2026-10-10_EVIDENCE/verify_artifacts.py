"""Verify audit source identity and retained links; generate evidence inventory.

Run from the original repository root after probes have finished. This verifies
documentation/evidence, not the correctness of the audited application.
"""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parent.parent
REPORT = EVIDENCE.parent / 'CODEBASE_SCAN_AND_ISSUE_TRACKER_2026-10-10.md'
branches = json.loads((EVIDENCE / 'branches.json').read_text())
inventories = []
for branch in branches['snapshots']:
    raw = subprocess.check_output(
        ['git', 'ls-tree', '-rz', branch['commit']], cwd=ROOT)
    extensions, top_levels = Counter(), Counter()
    changed, missing, total = [], [], 0
    for record in raw.split(b'\0'):
        if not record:
            continue
        metadata, name_raw = record.split(b'\t', 1)
        mode, kind, expected = metadata.decode().split()
        name = os.fsdecode(name_raw)
        if kind != 'blob':
            continue
        total += 1
        extensions[Path(name).suffix or '[no extension]'] += 1
        top_levels[name.split('/')[0] if '/' in name else '[root files]'] += 1
        path = Path(branch['path']) / name
        if not path.exists() and not path.is_symlink():
            missing.append(name)
            continue
        contents = os.fsencode(os.readlink(path)) if mode == '120000' else path.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(contents)).encode() + b'\0' + contents).hexdigest()
        if actual != expected:
            changed.append(name)
    inventories.append({
        'label': branch['label'], 'commit': branch['commit'], 'tree': branch['tree'],
        'tracked_blobs': total, 'by_extension': dict(sorted(extensions.items())),
        'by_top_level': dict(sorted(top_levels.items())),
        'changed_snapshot_tracked_files': changed, 'missing_snapshot_tracked_files': missing,
    })

report = REPORT.read_text()
old_rows = re.findall(r'^\| SCN-(\d{3}) ·', report, re.M)
new_sections = re.findall(r'^### SCN-(\d{3}) ·', report, re.M)
assert old_rows == [f'{i:03}' for i in range(1, 50)], old_rows
assert new_sections == [f'{i:03}' for i in range(50, 65)], new_sections
resolved = sum('RESOLVED:' in line or 'RESOLVED by ' in line
               for line in report.splitlines() if line.startswith('| SCN-'))
assert resolved == 10, resolved

bad_links = []
documents = [REPORT, EVIDENCE / 'README.md']
for document in documents:
    for target in re.findall(r'\]\(([^)]+)\)', document.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        path = target.split('#', 1)[0]
        if not (document.parent / path).exists() and path not in ('inventory.json', 'MANIFEST.sha256'):
            # The root report links those generated outputs through its evidence directory.
            if not path.endswith(('/inventory.json', '/MANIFEST.sha256')):
                bad_links.append({'document': str(document.relative_to(ROOT)), 'target': target})

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
tracked_diff = subprocess.check_output(['git', 'diff', '--name-only'], cwd=ROOT, text=True).splitlines()
staged_diff = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=ROOT, text=True).splitlines()
out = {
    'meaning': 'Full tracked-file inventory and blob identity, not a claim of line coverage.',
    'branches': inventories,
    'tracker': {'stable_ids': 64, 'old_reconciled': 49, 'new_entries': 15,
                'verification_queues': 9, 'main_ci_scoped_closures': resolved,
                'main_ci_open_entries': 45, 'trajectory_open_entries': 54,
                'union_open_entries': 55},
    'workspace_head_unchanged': head == branches['workspace_head'],
    'tracked_worktree_diff': tracked_diff, 'staged_diff': staged_diff,
    'broken_main_report_or_guide_links': bad_links,
}
(EVIDENCE / 'inventory.json').write_text(json.dumps(out, indent=2) + '\n')
assert not bad_links, bad_links
assert head == branches['workspace_head']
assert not tracked_diff and not staged_diff, (tracked_diff, staged_diff)
assert all(not b['changed_snapshot_tracked_files'] and not b['missing_snapshot_tracked_files']
           for b in inventories), inventories

hash_lines = []
for path in sorted(EVIDENCE.rglob('*')):
    if not path.is_file() or path.name == 'MANIFEST.sha256' or '__pycache__' in path.parts:
        continue
    hash_lines.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(EVIDENCE)}')
(EVIDENCE / 'MANIFEST.sha256').write_text('\n'.join(hash_lines) + '\n')
print(json.dumps({'inventory': str(EVIDENCE / 'inventory.json'),
                  'retained_hashed_files': len(hash_lines), 'verification': 'passed'}, indent=2))
