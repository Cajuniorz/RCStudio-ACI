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
