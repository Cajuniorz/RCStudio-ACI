import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const html = readFileSync(join(__dirname, '../static/index.html'), 'utf8');
const css = readFileSync(join(__dirname, '../static/style.css'), 'utf8');
const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');

// 1. Math Helper: Ray to 3D Line Closest Point
function projectRayToAxisLine(rayOrigin, rayDir, lineStart, axis) {
  const u = axis === 'x' ? { x: 1, y: 0, z: 0 } :
            axis === 'y' ? { x: 0, y: 1, z: 0 } :
                           { x: 0, y: 0, z: 1 };
  const w = {
    x: rayOrigin.x - lineStart.x,
    y: rayOrigin.y - lineStart.y,
    z: rayOrigin.z - lineStart.z
  };
  const b = rayDir.x * u.x + rayDir.y * u.y + rayDir.z * u.z;
  const d = rayDir.x * w.x + rayDir.y * w.y + rayDir.z * w.z;
  const e = u.x * w.x + u.y * w.y + u.z * w.z;
  const D = 1 - b * b;
  if (Math.abs(D) < 1e-6) return null;
  const t = (e - b * d) / D;
  return {
    x: lineStart.x + t * u.x,
    y: lineStart.y + t * u.y,
    z: lineStart.z + t * u.z,
    dist: Math.abs(t)
  };
}

// 2. Direct Dimension Input calculation
function computeEndpointFromDimension(start, currentPoint, axisLock, targetLength) {
  let dir = { x: currentPoint.x - start.x, y: currentPoint.y - start.y, z: currentPoint.z - start.z };
  if (axisLock === 'x') {
    const sign = dir.x >= 0 ? 1 : -1;
    return { x: start.x + targetLength * sign, y: start.y, z: start.z };
  } else if (axisLock === 'y') {
    const sign = dir.y >= 0 ? 1 : -1;
    return { x: start.x, y: start.y + targetLength * sign, z: start.z };
  } else if (axisLock === 'z') {
    const sign = dir.z >= 0 ? 1 : -1;
    return { x: start.x, y: start.y, z: start.z + targetLength * sign };
  }
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 1e-6) {
    return { x: start.x + targetLength, y: start.y, z: start.z };
  }
  return {
    x: start.x + (dir.x / len) * targetLength,
    y: start.y + (dir.y / len) * targetLength,
    z: start.z + (dir.z / len) * targetLength
  };
}

// 3. Multi-Selection Logic Helper
function updateMultiSelection(selectedList, hit, isCtrl, isShift) {
  if (!hit) {
    if (!isCtrl && !isShift) return [];
    return [...selectedList];
  }
  const index = selectedList.findIndex(s => s.kind === hit.kind && s.id === hit.id);
  if (isCtrl && isShift) {
    return selectedList.filter((_, i) => i !== index);
  } else if (isCtrl) {
    if (index === -1) {
      return [...selectedList, hit];
    }
    return [...selectedList];
  }
  return [hit];
}

test('Sprint 3: 3D Ray-Axis Projection Math', () => {
  const start = { x: 2, y: 3, z: 0 };
  const rayOrigin = { x: 5, y: 3, z: 10 };
  const rayDir = { x: 0, y: 0, z: -1 };
  
  const ptX = projectRayToAxisLine(rayOrigin, rayDir, start, 'x');
  assert.ok(ptX, 'Should find projection on X axis');
  assert.equal(Math.round(ptX.x), 5);
  assert.equal(Math.round(ptX.y), 3);
  assert.equal(Math.round(ptX.z), 0);
  assert.equal(Math.round(ptX.dist), 3);

  const rayOriginY = { x: 10, y: 7, z: 0 };
  const rayDirY = { x: -1, y: 0, z: 0 };
  const ptY = projectRayToAxisLine(rayOriginY, rayDirY, start, 'y');
  assert.ok(ptY, 'Should find projection on Y axis');
  assert.equal(Math.round(ptY.x), 2);
  assert.equal(Math.round(ptY.y), 7);
  assert.equal(Math.round(ptY.z), 0);
  assert.equal(Math.round(ptY.dist), 4);

  const rayOriginZ = { x: 2, y: 8, z: 4 };
  const rayDirZ = { x: 0, y: -1, z: 0 };
  const ptZ = projectRayToAxisLine(rayOriginZ, rayDirZ, start, 'z');
  assert.ok(ptZ, 'Should find projection on Z axis');
  assert.equal(Math.round(ptZ.x), 2);
  assert.equal(Math.round(ptZ.y), 3);
  assert.equal(Math.round(ptZ.z), 4);
  assert.equal(Math.round(ptZ.dist), 4);
});

test('Sprint 3: Direct Dimension Input (VCB) Calculation', () => {
  const start = { x: 0, y: 0, z: 0 };
  
  const endX = computeEndpointFromDimension(start, { x: 2.1, y: 0.5, z: 0 }, 'x', 4.5);
  assert.deepEqual(endX, { x: 4.5, y: 0, z: 0 });

  const endY = computeEndpointFromDimension(start, { x: 0.2, y: -1.2, z: 0 }, 'y', 5.0);
  assert.deepEqual(endY, { x: 0, y: -5.0, z: 0 });

  const endZ = computeEndpointFromDimension(start, { x: 0, y: 0, z: 2.0 }, 'z', 3.6);
  assert.deepEqual(endZ, { x: 0, y: 0, z: 3.6 });
});

test('Sprint 3: Multi-Selection (Single, Ctrl+Click, Ctrl+Shift+Click, Deselect)', () => {
  let list = [];
  const m1 = { kind: 'members', id: 'M1' };
  const m2 = { kind: 'members', id: 'M2' };
  const m3 = { kind: 'members', id: 'M3' };

  list = updateMultiSelection(list, m1, false, false);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'M1');

  list = updateMultiSelection(list, m2, true, false);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(x => x.id), ['M1', 'M2']);

  list = updateMultiSelection(list, m3, true, false);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(x => x.id), ['M1', 'M2', 'M3']);

  list = updateMultiSelection(list, m2, true, true);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(x => x.id), ['M1', 'M3']);

  list = updateMultiSelection(list, null, false, false);
  assert.equal(list.length, 0);
});

test('Sprint 3: HTML & CSS Elements for Measurement Box', () => {
  assert.ok(html.includes('id="buildMeasurementBox"'), 'buildMeasurementBox missing from index.html');
  assert.ok(html.includes('id="buildMeasurementInput"'), 'buildMeasurementInput missing from index.html');
  assert.ok(css.includes('.build-measurement-box'), 'CSS for build-measurement-box missing');
});

test('Sprint 3: App.js 3D Build Line & Node Tools Logic', () => {
  assert.ok(appJs.includes('selectedList'), 'selectedList multi-selection tracking missing from app.js');
  assert.ok(appJs.includes('buildDrawState'), 'buildDrawState drawing state machine missing from app.js');
  assert.ok(appJs.includes('projectRayToAxisLine'), 'projectRayToAxisLine 3D projection missing from app.js');
});
