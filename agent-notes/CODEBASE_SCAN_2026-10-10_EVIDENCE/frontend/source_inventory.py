import hashlib,json,re,sys
from pathlib import Path
root=Path(sys.argv[1]); out=Path(sys.argv[2]); seen=set()
def visit(path):
    if path in seen or not path.is_file() or path.suffix not in ('.ts','.css'): return
    seen.add(path)
    for item in re.findall(r'''(?:from\s*|import\s*\(|new URL\(\s*)['"](\.[^'"]+)['"]''',path.read_text()):
        p=path.parent/item
        for candidate in (p,p.with_suffix('.ts'),p/'index.ts'):
            if candidate.is_file(): visit(candidate); break
visit(root/'src/main.ts')
files=sorted(set((root/'src/frontend').rglob('*.ts'))|set((root/'src/workers').rglob('*.ts'))|{root/'src/main.ts',root/'src/sunController.ts',root/'src/style.css',root/'index.html',root/'src/textures.ts'})
rows=[{'path':str(p.relative_to(root)),'lines':len(p.read_text().splitlines()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bootstrap_import_reachable_including_types':p in seen} for p in files]
out.write_text(json.dumps({'note':'Lexical local import/worker URL traversal includes type-only edges; inventory is not a claim every line or execution path was tested. .test.ts files are inventory only; root runs suites.','files':rows},indent=2))
