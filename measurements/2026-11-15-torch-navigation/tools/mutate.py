"""Mutation check: apply one change at a time to a source file, run test files, expect a failure, restore.

Usage: python -B mutate.py <source file> "<test file> [<test file> ...]" <backup path> <mutants file>
The mutants file holds a Python list of (old text, new text) pairs; each old text must occur exactly once.
Run it from the repository root of the worktree under test.
"""
import pathlib, shutil, subprocess, sys
source, tests, backup = pathlib.Path(sys.argv[1]), sys.argv[2], pathlib.Path(sys.argv[3])
mutants = eval(pathlib.Path(sys.argv[4]).read_text())
shutil.copyfile(source, backup)
original = source.read_text()
survived = []
try:
    for number, (old, new) in enumerate(mutants, start=1):
        assert original.count(old) == 1, f"mutant {number}: target text found {original.count(old)} times: {old!r}"
        source.write_text(original.replace(old, new))
        run = subprocess.run([sys.executable, "-B", "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", *tests.split()],
                             capture_output=True, text=True)
        tail = run.stdout.strip().splitlines()[-1] if run.stdout.strip() else run.stderr.strip()[-200:]
        killed = run.returncode != 0
        print(f"{'killed  ' if killed else 'SURVIVED'} {number:2d}: {old.strip()[:70]!r} -> {new.strip()[:50]!r}   [{tail[:90]}]", flush=True)
        if not killed:
            survived.append(number)
finally:
    shutil.copyfile(backup, source)
assert source.read_text() == original
print(f"{len(mutants) - len(survived)} of {len(mutants)} killed; survived: {survived}")
