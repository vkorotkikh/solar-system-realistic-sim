import { describe, expect, it } from 'vitest';
import { createMagneticFieldLinesFromPFSS } from './solarMagnetics';

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
