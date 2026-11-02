import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import rawMoons from '../data/moons.json';
import { createSolarSystemCatalog } from './catalog';

describe('active moon identity and physical radius integrity', () => {
  it('contains 423 distinct source identities and only the newer Puck solution', () => {
    expect(rawMoons).toHaveLength(423);
    expect(new Set(rawMoons.map(m => `${m.planet}:${m.iauCode}`)).size).toBe(423);
    expect(rawMoons.filter(m => m.iauCode === '715').map(m => m.id)).toEqual([388]);
    expect(createSolarSystemCatalog().bodies.filter(b => b.name === 'Puck')).toHaveLength(1);
  });

  it('keeps unknown physics nullable while providing finite display estimates', () => {
    const moons = createSolarSystemCatalog().bodies.filter(b => b.type === 'moon');
    expect(moons.filter(b => b.radiusKm !== null)).toHaveLength(46);
    for (const moon of moons) {
      expect(moon.displayRadiusAu).toBeGreaterThan(0);
      // The pinned table reports mean radius, not equatorial/polar dimensions.
      expect(moon.equatorialRadiusKm).toBeNull();
      expect(moon.polarRadiusKm).toBeNull();
      if (moon.radiusKm === null) {
        expect(moon.realRadiusAu).toBeNull();
        expect(moon.equatorialRadiusKm).toBeNull();
        expect(moon.polarRadiusKm).toBeNull();
      } else {
        expect(moon.radiusProvenance?.sourceUrl).toBe('https://ssd.jpl.nasa.gov/sats/phys_par/');
        expect(moon.radiusProvenance?.reference).toBeTruthy();
        expect(moon.radiusProvenance?.definition).toContain('equivalent volume');
      }
    }
    expect(moons.find(b => b.name === 'Hydra')?.radiusKm).toBe(18.5);
    expect(moons.find(b => b.name === 'Callirrhoe')?.radiusKm).toBeNull();
  });

  it('the actual main info path displays Unknown and scaling keeps an unknown-radius marker finite', () => {
    const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
    const declarations: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && ['updateBodyInfoPanel', 'bodyBaseRadiusAu'].includes(node.name?.text ?? '')) {
        declarations.push(node.getText(file));
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    const javascript = ts.transpileModule(declarations.join('\n'), {}).outputText;
    const body = createSolarSystemCatalog().bodies.find(b => b.name === 'Callirrhoe')!;
    const dom = Object.fromEntries(['bodyInfo', 'bodyInfoName', 'bodyInfoType', 'bodyInfoRadius', 'bodyInfoPeriod'].map(key => [key, { dataset: {}, textContent: '' }]));
    const result = Function('dom', 'bodyById', 'simState', 'updateBodyInfoDistance', `${javascript};updateBodyInfoPanel('${body.id}'); return bodyBaseRadiusAu(bodyById.get('${body.id}'));`)(
      dom, new Map([[body.id, body]]), { useRealisticScale: true }, () => {},
    );
    expect(dom.bodyInfoRadius.textContent).toBe('Unknown');
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});
