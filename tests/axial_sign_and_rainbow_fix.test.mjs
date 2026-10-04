import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Standard Three.js setHSL implementation
function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [r, g, b];
}

function getRainbowRGB(val, min, max) {
  if (!Number.isFinite(val) || max <= min) return [0.37, 0.8, 0.73];
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return hslToRgb((1.0 - t) * (240 / 360), 1.0, 0.5);
}

test('static/app.js: uses numeric c.setHSL without string parsing regex', () => {
  const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');
  assert.ok(!appJs.includes('new THREE.Color(`hsl(${hue}'), 'Must not use template string hsl() regex');
  assert.ok(appJs.includes('c.setHSL((1.0 - t) * (240 / 360), 1.0, 0.5);'), 'Must use numeric setHSL');
});

test('static/app.js: enforces minimum scale floor for signed keys', () => {
  const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');
  assert.ok(appJs.includes("if (key === 'N') A = Math.max(A, 5.0);"), 'Must clamp axial N scale to at least 5.0 kN');
});

test('getRainbowRGB: peak value does not turn white due to scientific notation', () => {
  // Peak value where floating point produces 1 - 1e-12
  const val = 0.9420673989788939;
  const max = 0.9420673989789103;
  const rgb = getRainbowRGB(val, -max, max);

  // Must be bright red (r close to 1, g close to 0, b close to 0)
  assert(rgb[0] > 0.99, `Red component should be ~1, got ${rgb[0]}`);
  assert(rgb[1] < 0.05, `Green component should be ~0, got ${rgb[1]}`);
  assert(rgb[2] < 0.05, `Blue component should be ~0, got ${rgb[2]}`);
  // Crucially, must NOT be pure white [1, 1, 1]
  assert.notDeepEqual(rgb, [1, 1, 1], 'Color must never fall back to white for peak member!');
});

test('getRainbowRGB: compression is blue, zero is green, tension is red', () => {
  const maxForce = 50.0;
  // Compression (negative force)
  const rgbComp = getRainbowRGB(-maxForce, -maxForce, maxForce);
  assert(rgbComp[2] > 0.99, 'Compression (-max) must be pure blue');
  assert(rgbComp[0] < 0.05, 'Compression should have no red');

  // Zero force
  const rgbZero = getRainbowRGB(0, -maxForce, maxForce);
  assert(rgbZero[1] > 0.99, 'Zero force must be pure green');

  // Tension (positive force)
  const rgbTens = getRainbowRGB(maxForce, -maxForce, maxForce);
  assert(rgbTens[0] > 0.99, 'Tension (+max) must be pure red');
  assert(rgbTens[2] < 0.05, 'Tension should have no blue');
});

test('Axial force scale floor prevents micro-forces from saturating to red', () => {
  const microForce = 0.942; // kN (incidental beam force)
  const rawMax = 0.942;
  const clampedScale = Math.max(rawMax, 5.0); // 5.0 kN engineering noise floor
  const rgbClamped = getRainbowRGB(microForce, -clampedScale, clampedScale);

  // On a scale of [-5.0, 5.0], +0.942 kN is t = 5.942 / 10 = 0.594 (light green/yellow-green)
  // Green component must remain dominant, not red!
  assert(rgbClamped[1] > 0.8, `Green should remain high for micro force, got ${rgbClamped[1]}`);
  assert(rgbClamped[0] < 0.5, `Red should be low for micro force, got ${rgbClamped[0]}`);
});
