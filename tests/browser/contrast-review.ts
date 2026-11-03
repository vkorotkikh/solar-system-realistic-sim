import { expect, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults } from 'axe-core';

/** Retain axe's raw finding, then independently resolve its known modal-stack ambiguity.
 * Axe 4.11 compares complete stacks beneath each text line before stopping at
 * an opaque ancestor. Different hidden hint children behind the modal produce
 * elmPartiallyObscuring even though neither can paint through the panel.
 */
export async function assertTextContrastReviewed(page: Page, info: TestInfo, state: string, results: AxeResults) {
  for (const rule of results.incomplete.filter(rule => rule.id === 'color-contrast')) {
    for (const node of rule.nodes) {
      expect(node.target, `${state}: unexpected unresolved contrast target`).toEqual(['.subtitle']);
      expect(node.any.map(check => check.data?.messageKey), `${state}: unexpected contrast ambiguity`).toEqual(['elmPartiallyObscuring']);
      await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal', 'true');
      const observation = await page.locator('.subtitle').evaluate(element => {
        const parse = (value: string) => {
          const values = value.match(/[\d.]+/g)!.map(Number);
          return [values[0], values[1], values[2], values[3] ?? 1];
        };
        const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
        const foreground = parse(getComputedStyle(element).color);
        const layers = [];
        let background: number[] | null = null;
        let surface: DOMRect | null = null;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const color = parse(style.backgroundColor);
          layers.push({ selector: ancestor.id || ancestor.className || ancestor.tagName,
            image: style.backgroundImage, opacity: style.opacity, filter: style.filter, blend: style.mixBlendMode,
            color: style.backgroundColor });
          if (color[3] === 1) { background = color; surface = ancestor.getBoundingClientRect(); break; }
          if (color[3] !== 0) break; // Partial alpha requires a separate disposition.
        }
        const range = document.createRange(); range.selectNodeContents(element);
        const lines = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => {
          const points = [[rect.left + .5, rect.top + .5], [rect.right - .5, rect.top + .5],
            [rect.left + .5, rect.bottom - .5], [rect.right - .5, rect.bottom - .5],
            [rect.left + rect.width / 2, rect.top + rect.height / 2]];
          return { rect: rect.toJSON(), coveredByOpaqueSurface: Boolean(surface && rect.left >= surface.left && rect.right <= surface.right && rect.top >= surface.top && rect.bottom <= surface.bottom),
            unobscured: points.every(([x, y]) => {
              const top = document.elementFromPoint(x, y);
              return top === element || (top !== null && element.contains(top));
            }) };
        });
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = background ? luminance(background) : null;
        return { foreground, background, layers, lines,
          contrast: backgroundLuminance === null ? null : (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05) };
      });
      await info.attach(`contrast-disposition-${state}-subtitle`, { body: JSON.stringify({
        rule: rule.id, target: node.target, rawReason: node.any[0].data, method: 'Opaque ancestor bounds, all text-line corner/center hit tests, WCAG sRGB relative luminance; no tolerance', observation,
      }, null, 2), contentType: 'application/json' });
      expect(observation.foreground[3]).toBe(1);
      expect(observation.background?.[3]).toBe(1);
      for (const layer of observation.layers) {
        expect(layer.image).toBe('none'); expect(layer.opacity).toBe('1');
        expect(layer.filter).toBe('none'); expect(layer.blend).toBe('normal');
      }
      expect(observation.lines.length).toBeGreaterThan(0);
      for (const line of observation.lines) {
        expect(line.coveredByOpaqueSurface).toBe(true);
        expect(line.unobscured).toBe(true);
      }
      expect(observation.contrast).toBeGreaterThanOrEqual(4.5);
    }
  }
}
