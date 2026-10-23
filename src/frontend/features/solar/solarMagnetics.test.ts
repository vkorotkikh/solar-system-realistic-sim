import { describe, expect, it } from 'vitest';
import { Line, Vector3 } from 'three';
import {
    createMagneticFieldLines,
    createMagneticFieldLinesFromPFSS
} from './solarMagnetics';

const ENLARGED_SUN_AU = 0.24599820128898311;
const REALISTIC_SUN_AU = 696_340 / 149_597_870.7;

function vertex(line: Line, index: number): Vector3 {
    const position = line.geometry.getAttribute('position');
    return new Vector3(position.getX(index), position.getY(index), position.getZ(index));
}

describe('PFSS topology display', () => {
    const arc = [[1, 0, 0], [2, 0, 0]];
    it('skips indeterminate lines and uses explicit state over the legacy flag', () => {
        const group = createMagneticFieldLinesFromPFSS({ lines: [
            { state: 'indeterminate', is_open: false, arc },
            { state: 'open', is_open: false, polarity: 1, arc },
            { state: 'closed', is_open: true, arc }
        ] }, 1, 0);
        expect(group.children.map(line => line.userData.isOpen)).toEqual([true, false]);
    });
    it('preserves legacy boolean payloads without state', () => {
        const group = createMagneticFieldLinesFromPFSS({ lines: [
            { is_open: true, polarity: 1, arc }, { is_open: false, arc }
        ] }, 1, 0);
        expect(group.children.map(line => line.userData.isOpen)).toEqual([true, false]);
    });
});

describe('magnetic coronal height mapping (B029)', () => {
    it('compresses only height above an enlarged Sun while preserving procedural directions', () => {
        const enlarged = createMagneticFieldLines(ENLARGED_SUN_AU, 0.5, { numLines: 24 });
        const realistic = createMagneticFieldLines(REALISTIC_SUN_AU, 0.5, { numLines: 24 });

        expect(enlarged.children).toHaveLength(realistic.children.length);
        expect(enlarged.children.length).toBeGreaterThan(0);

        let maxEnlargedRadius = 0;
        let maxRealisticSolarRadii = 0;
        for (let lineIndex = 0; lineIndex < enlarged.children.length; lineIndex += 1) {
            const enlargedLine = enlarged.children[lineIndex] as Line;
            const realisticLine = realistic.children[lineIndex] as Line;
            const enlargedPositions = enlargedLine.geometry.getAttribute('position');
            const realisticPositions = realisticLine.geometry.getAttribute('position');
            expect(enlargedPositions.count).toBe(realisticPositions.count);

            for (let pointIndex = 0; pointIndex < enlargedPositions.count; pointIndex += 1) {
                const enlargedPoint = vertex(enlargedLine, pointIndex);
                const realisticPoint = vertex(realisticLine, pointIndex);
                expect(enlargedPoint.toArray().every(Number.isFinite)).toBe(true);
                expect(realisticPoint.toArray().every(Number.isFinite)).toBe(true);

                const realisticSolarRadii = realisticPoint.length() / REALISTIC_SUN_AU;
                const expectedEnlargedRadius = ENLARGED_SUN_AU
                    * (1 + (realisticSolarRadii - 1) * 0.15);
                expect(enlargedPoint.length()).toBeCloseTo(expectedEnlargedRadius, 6);
                expect(
                    enlargedPoint.clone().normalize().distanceTo(realisticPoint.clone().normalize())
                ).toBeLessThan(2e-6);

                maxEnlargedRadius = Math.max(maxEnlargedRadius, enlargedPoint.length());
                maxRealisticSolarRadii = Math.max(maxRealisticSolarRadii, realisticSolarRadii);
            }

            expect(vertex(enlargedLine, 0).length()).toBeCloseTo(ENLARGED_SUN_AU, 6);
            expect(vertex(realisticLine, 0).length()).toBeCloseTo(REALISTIC_SUN_AU, 8);
        }

        expect(maxRealisticSolarRadii).toBeGreaterThanOrEqual(2.5);
        expect(maxRealisticSolarRadii).toBeLessThan(2.56);
        expect(maxEnlargedRadius).toBeGreaterThan(0.3);
        expect(maxEnlargedRadius).toBeLessThan(0.305);
    });

    it('keeps the wrapper PFSS branch on its existing single radial mapping', () => {
        const physicsState = {
            pfss_field_lines: {
                source: 'test-fixture',
                lines: [{ state: 'open', polarity: 1, arc: [[1, 0, 0], [2.5, 0, 0], [0, 2, 0]] }]
            }
        };
        const enlarged = createMagneticFieldLines(ENLARGED_SUN_AU, 0.5, { physicsState });
        const realistic = createMagneticFieldLines(REALISTIC_SUN_AU, 0.5, { physicsState });
        const enlargedLine = enlarged.children[0] as Line;
        const realisticLine = realistic.children[0] as Line;

        expect(enlarged.userData.isDataDriven).toBe(true);
        expect(vertex(enlargedLine, 0).toArray()).toEqual([
            expect.closeTo(0.24599820128898311, 6), 0, 0
        ]);
        expect(vertex(enlargedLine, 1).toArray()).toEqual([
            expect.closeTo(0.30134779657900435, 6), 0, 0
        ]);
        expect(vertex(enlargedLine, 2).toArray()).toEqual([
            0, expect.closeTo(0.28289793148233056, 6), 0
        ]);
        expect(vertex(realisticLine, 1).length()).toBeCloseTo(2.5 * REALISTIC_SUN_AU, 8);
    });
});
