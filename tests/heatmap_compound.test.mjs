import test from 'node:test';
import assert from 'node:assert/strict';
import { stationValueKN, rangeKN, memberRangeKN } from '../static/heatmap.js';

// Z-up beam under gravity: all bending in My / shear in Vz, Mz = Vy = 0.
const zupBeam = { length: 4, samples: [0, 1, 2, 3, 4].map(x => ({ x, N: 0, Vy: 0, Vz: 10 - 5 * x, Mz: 0, My: -20 + 5 * x })) };

test('compound M key follows the governing bending plane (Z-up beam is not "zero force")', () => {
  assert.equal(stationValueKN(zupBeam, 0, 'Mz'), 0);          // single-axis key sees nothing (the old bug)
  assert.equal(stationValueKN(zupBeam, 0, 'M'), 20);
  assert.equal(stationValueKN(zupBeam, 0.5, 'M'), 10 * 0 + Math.abs(-20 + 5 * 2));
  assert.ok(rangeKN([{ id: 'B' }], { B: zupBeam }, 'M').max > 0);
});

test('compound V key picks Vz for Z-up and Vy for Y-up beams', () => {
  assert.equal(stationValueKN(zupBeam, 0, 'V'), 10);
  const yup = { length: 2, samples: [{ x: 0, N: 0, Vy: 7, Vz: 0, Mz: 3, My: 0 }, { x: 2, N: 0, Vy: -7, Vz: 0, Mz: 3, My: 0 }] };
  assert.equal(stationValueKN(yup, 0, 'V'), 7);
  assert.deepEqual(memberRangeKN(yup, 'M'), { min: 3, max: 3 });
});

test('compound key interpolates per component, never magnitudes', () => {
  const m = { length: 2, samples: [{ x: 0, N: 0, Vy: 0, Vz: 0, Mz: 10, My: 0 }, { x: 2, N: 0, Vy: 0, Vz: 0, Mz: -10, My: 0 }] };
  assert.equal(stationValueKN(m, 0.5, 'M'), 0);
});

import { stationSignedKN, dominantComponent, isSignedKey } from '../static/heatmap.js';

test('signed station value is continuous through zero (no false cold spot / "V" of colour)', () => {
  // column moment +8 -> 0 -> -8 along its length
  const col = { length: 3, samples: [0, 1, 2, 3].map(x => ({ x, N: -100, Vy: 0, Vz: 0, Mz: 0, My: 8 - (16 / 3) * x })) };
  assert.equal(isSignedKey('M'), true);
  assert.equal(dominantComponent(col, 'M'), 'My');
  const v = [0, 0.25, 0.5, 0.75, 1].map(t => stationSignedKN(col, t, 'M'));
  assert.ok(Math.abs(v[0] - 8) < 1e-9 && Math.abs(v[4] + 8) < 1e-9);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] < v[i - 1], 'strictly decreasing, sign kept');
  // magnitude key folds the sign - this is exactly what produced the "V" shape
  assert.ok(stationValueKN(col, 0.5, 'M') < stationValueKN(col, 0, 'M'));
});

test('signed key keeps compression negative and uses one dominant component per member', () => {
  const m = { length: 2, samples: [{ x: 0, N: -50, Vy: 1, Vz: 9, Mz: 2, My: 0 }, { x: 2, N: -50, Vy: 1, Vz: -9, Mz: 2, My: 0 }] };
  assert.equal(stationSignedKN(m, 0.5, 'N'), -50);
  assert.equal(dominantComponent(m, 'V'), 'Vz');
  assert.equal(stationSignedKN(m, 0, 'V'), 9);
  assert.equal(stationSignedKN(m, 1, 'V'), -9);
  assert.equal(stationSignedKN(m, 0.5, 'resultant'), null);
});
