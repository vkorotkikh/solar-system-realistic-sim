from pathlib import Path
import subprocess,sys
snapshot=Path(sys.argv[1]).resolve();dest=Path(__file__).resolve().parent
entry=dest/f'frontend-{snapshot.name}.mjs';bundle=dest/f'frontend-{snapshot.name}.bundle.mjs'
entry.write_text((dest/'probe_frontend.template.mjs').read_text().replace('__SNAPSHOT__',str(snapshot)))
subprocess.run([str(snapshot/'node_modules/.bin/esbuild'),str(entry),'--bundle','--platform=node','--format=esm',f'--outfile={bundle}'],check=True)
with (dest/f'frontend-{snapshot.name}.json').open('w') as f:subprocess.run(['node',str(bundle)],stdout=f,check=True)
