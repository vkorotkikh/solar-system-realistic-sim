#!/usr/bin/env node
/**
 * Headless Puppeteer test: screenshot the Sun in normal and realistic scale modes.
 * Captures two screenshots for visual comparison.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = '/home/nomad/.gemini/antigravity/brain/b69ca357-c4ff-4b6a-aa1b-8ffbd8e89ca9';

(async () => {
    console.log('[Test] Launching headless browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--use-gl=swiftshader',  // Software WebGL for headless
            '--window-size=1280,800'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Collect console messages for diagnostics
    const consoleMsgs = [];
    page.on('console', msg => {
        consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        consoleMsgs.push(`[PAGE_ERROR] ${err.message}`);
    });

    console.log('[Test] Navigating to http://localhost:5173 ...');
    try {
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
        console.error('[Test] Navigation failed:', e.message);
        await browser.close();
        process.exit(1);
    }

    // Wait for Three.js to render
    console.log('[Test] Waiting 8s for initial render...');
    await new Promise(r => setTimeout(r, 8000));

    // Screenshot 1: Normal scale
    const normalPath = path.join(ARTIFACT_DIR, 'screenshot_normal_scale.png');
    await page.screenshot({ path: normalPath, fullPage: false });
    console.log(`[Test] Screenshot saved: ${normalPath}`);

    // Find and click the "Realistic scale" toggle
    console.log('[Test] Looking for Realistic scale toggle...');
    const toggleClicked = await page.evaluate(() => {
        // Try finding the checkbox by ID or label
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
            if (label.textContent?.toLowerCase().includes('realistic')) {
                const input = label.querySelector('input') || document.getElementById(label.htmlFor);
                if (input) {
                    input.click();
                    return `Clicked: ${label.textContent.trim()}`;
                }
            }
        }
        // Try direct input search
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        for (const input of inputs) {
            const nearby = input.parentElement?.textContent || '';
            if (nearby.toLowerCase().includes('realistic')) {
                input.click();
                return `Clicked checkbox near: ${nearby.trim().substring(0, 60)}`;
            }
        }
        // Try by ID
        const byId = document.getElementById('toggle-realistic-scale')
            || document.getElementById('toggleRealisticScale')
            || document.getElementById('realistic-scale');
        if (byId) {
            byId.click();
            return `Clicked by id: ${byId.id}`;
        }
        return null;
    });

    if (toggleClicked) {
        console.log(`[Test] Toggle result: ${toggleClicked}`);
    } else {
        console.log('[Test] WARNING: Could not find Realistic scale toggle!');
        // List all checkboxes for debugging
        const allCheckboxes = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input[type="checkbox"]')).map(el => ({
                id: el.id,
                name: el.name,
                parent: el.parentElement?.textContent?.trim()?.substring(0, 80)
            }));
        });
        console.log('[Test] Available checkboxes:', JSON.stringify(allCheckboxes, null, 2));
    }

    // Wait for re-render after toggle
    console.log('[Test] Waiting 5s for realistic scale render...');
    await new Promise(r => setTimeout(r, 5000));

    // Screenshot 2: Realistic scale
    const realisticPath = path.join(ARTIFACT_DIR, 'screenshot_realistic_scale.png');
    await page.screenshot({ path: realisticPath, fullPage: false });
    console.log(`[Test] Screenshot saved: ${realisticPath}`);

    // Analyze pixel data around the center of the screen (where the Sun should be)
    const centerAnalysis = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { error: 'No canvas found' };

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            // For WebGL canvas, try reading pixels via WebGL
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return { error: 'No rendering context' };

            const w = canvas.width;
            const h = canvas.height;
            const cx = Math.floor(w / 2);
            const cy = Math.floor(h / 2);
            const sampleSize = 20;
            const pixels = new Uint8Array(sampleSize * sampleSize * 4);

            gl.readPixels(cx - sampleSize / 2, cy - sampleSize / 2, sampleSize, sampleSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            let totalR = 0, totalG = 0, totalB = 0, darkCount = 0;
            const numPixels = sampleSize * sampleSize;
            for (let i = 0; i < numPixels; i++) {
                const r = pixels[i * 4];
                const g = pixels[i * 4 + 1];
                const b = pixels[i * 4 + 2];
                totalR += r; totalG += g; totalB += b;
                if (r < 30 && g < 30 && b < 30) darkCount++;
            }

            return {
                canvasSize: `${w}x${h}`,
                avgR: Math.round(totalR / numPixels),
                avgG: Math.round(totalG / numPixels),
                avgB: Math.round(totalB / numPixels),
                darkPixelPercent: Math.round((darkCount / numPixels) * 100),
                sampleCenter: `${cx},${cy}`
            };
        }
        return { error: 'Got 2D context on WebGL canvas' };
    });

    console.log('[Test] Center pixel analysis (realistic mode):', JSON.stringify(centerAnalysis, null, 2));

    // Print relevant console messages
    const relevantMsgs = consoleMsgs.filter(m =>
        m.includes('error') || m.includes('Error') || m.includes('warn') ||
        m.includes('Asteroid') || m.includes('GPU') || m.includes('scale') ||
        m.includes('WebGL')
    );
    if (relevantMsgs.length > 0) {
        console.log('\n[Test] Relevant console messages:');
        relevantMsgs.slice(0, 20).forEach(m => console.log(`  ${m}`));
    }

    await browser.close();
    console.log('\n[Test] Done! Check screenshots in artifact directory.');
})();
