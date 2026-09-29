import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  ARROW_AXIS_LOCKS,
  getAxisLockFromKey,
  getMemberLocalAxes,
  migrateToZUp,
  warehouseModel,
  threeStoryBuilding
} from '../static/building.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const html = readFileSync(join(__dirname, '../static/index.html'), 'utf8');
const css = readFileSync(join(__dirname, '../static/style.css'), 'utf8');
const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function approx(a, b, tol = 1e-5) {
  return Math.abs(a - b) <= tol;
}

function dot(u, v) {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function length(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function cross(u, v) {
  return [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]
  ];
}

console.log('Testing Sprint 2: Z-Up Coordinate System Migration (SketchUp Style)...');

// 1. Arrow Keys Axis Locking (SketchUp Standard)
console.log('1. Testing Arrow Keys Axis Locking...');
assert(ARROW_AXIS_LOCKS.ArrowRight === 'x', 'ArrowRight must lock X axis');
assert(ARROW_AXIS_LOCKS.ArrowLeft === 'y', 'ArrowLeft must lock Y axis');
assert(ARROW_AXIS_LOCKS.ArrowUp === 'z', 'ArrowUp must lock Z axis');
assert(ARROW_AXIS_LOCKS.ArrowDown === null, 'ArrowDown must unlock axes (null)');

assert(getAxisLockFromKey('ArrowRight') === 'x', 'getAxisLockFromKey(ArrowRight) -> x');
assert(getAxisLockFromKey('ArrowLeft') === 'y', 'getAxisLockFromKey(ArrowLeft) -> y');
assert(getAxisLockFromKey('ArrowUp') === 'z', 'getAxisLockFromKey(ArrowUp) -> z');
assert(getAxisLockFromKey('ArrowDown') === null, 'getAxisLockFromKey(ArrowDown) -> null');
assert(getAxisLockFromKey('x') === 'x', 'getAxisLockFromKey(x) -> x');
assert(getAxisLockFromKey('X') === 'x', 'getAxisLockFromKey(X) -> x');
assert(getAxisLockFromKey('y') === 'y', 'getAxisLockFromKey(y) -> y');
assert(getAxisLockFromKey('Y') === 'y', 'getAxisLockFromKey(Y) -> y');
assert(getAxisLockFromKey('z') === 'z', 'getAxisLockFromKey(z) -> z');
assert(getAxisLockFromKey('Z') === 'z', 'getAxisLockFromKey(Z) -> z');
assert(getAxisLockFromKey('a') === undefined, 'getAxisLockFromKey(a) -> undefined');
assert(getAxisLockFromKey(null) === undefined, 'getAxisLockFromKey(null) -> undefined');

// 2. Member Local Axes with Z as Vertical Reference
console.log('2. Testing Member Local Axes in Z-Up System...');
{
  // 2.1 Vertical column along Z
  const colA = { x: 0, y: 0, z: 0 };
  const colB = { x: 0, y: 0, z: 4.0 };
  const colAxes = getMemberLocalAxes(colA, colB, 0);

  assert(approx(colAxes.L, 4.0), 'Column length must be 4.0');
  // Local x along member length (Z axis)
  assert(approx(colAxes.x[0], 0) && approx(colAxes.x[1], 0) && approx(colAxes.x[2], 1), 'Column local x must be along +Z [0, 0, 1]');
  // Local y along Y
  assert(approx(colAxes.y[0], 0) && approx(colAxes.y[1], 1) && approx(colAxes.y[2], 0), 'Column local y must be along +Y [0, 1, 0]');
  // Local z along -X (since z = cross(x, y) = [0,0,1] x [0,1,0] = [-1,0,0])
  assert(approx(colAxes.z[0], -1) && approx(colAxes.z[1], 0) && approx(colAxes.z[2], 0), 'Column local z must be along -X [-1, 0, 0]');

  // Check orthonormal basis: norm=1, dot=0
  assert(approx(length(colAxes.x), 1), 'Col x unit length');
  assert(approx(length(colAxes.y), 1), 'Col y unit length');
  assert(approx(length(colAxes.z), 1), 'Col z unit length');
  assert(approx(dot(colAxes.x, colAxes.y), 0), 'Col x.y == 0');
  assert(approx(dot(colAxes.y, colAxes.z), 0), 'Col y.z == 0');
  assert(approx(dot(colAxes.z, colAxes.x), 0), 'Col z.x == 0');

  // 2.2 Horizontal beam in X direction at elevation Z = 4.0
  const beamXA = { x: 0, y: 0, z: 4.0 };
  const beamXB = { x: 6.0, y: 0, z: 4.0 };
  const beamXAxes = getMemberLocalAxes(beamXA, beamXB, 0);

  assert(approx(beamXAxes.L, 6.0), 'Beam X length must be 6.0');
  // Local x along +X
  assert(approx(beamXAxes.x[0], 1) && approx(beamXAxes.x[1], 0) && approx(beamXAxes.x[2], 0), 'Beam X local x must be [1, 0, 0]');
  // Local z is vertical reference [0, 0, 1]
  assert(approx(beamXAxes.z[0], 0) && approx(beamXAxes.z[1], 0) && approx(beamXAxes.z[2], 1), 'Beam X local z must be vertical [0, 0, 1]');
  // Local y = cross(z, x) = [0,0,1] x [1,0,0] = [0,1,0]
  assert(approx(beamXAxes.y[0], 0) && approx(beamXAxes.y[1], 1) && approx(beamXAxes.y[2], 0), 'Beam X local y must be [0, 1, 0]');

  // 2.3 Horizontal beam in Y direction at elevation Z = 4.0
  const beamYA = { x: 0, y: 0, z: 4.0 };
  const beamYB = { x: 0, y: 5.0, z: 4.0 };
  const beamYAxes = getMemberLocalAxes(beamYA, beamYB, 0);

  assert(approx(beamYAxes.L, 5.0), 'Beam Y length must be 5.0');
  // Local x along +Y
  assert(approx(beamYAxes.x[0], 0) && approx(beamYAxes.x[1], 1) && approx(beamYAxes.x[2], 0), 'Beam Y local x must be [0, 1, 0]');
  // Local z is vertical reference [0, 0, 1]
  assert(approx(beamYAxes.z[0], 0) && approx(beamYAxes.z[1], 0) && approx(beamYAxes.z[2], 1), 'Beam Y local z must be vertical [0, 0, 1]');
  // Local y = cross(z, x) = [0,0,1] x [0,1,0] = [-1,0,0]
  assert(approx(beamYAxes.y[0], -1) && approx(beamYAxes.y[1], 0) && approx(beamYAxes.y[2], 0), 'Beam Y local y must be [-1, 0, 0]');
}

// 3. Testing Legacy Y-Up to Z-Up Migration (migrateToZUp)
console.log('3. Testing migrateToZUp Migration...');
{
  const legacyModel = {
    schemaVersion: 2,
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, restraints: [true, true, true, false, false, false] },
      { id: 'N2', x: 6, y: 3.5, z: 4, restraints: [false, false, false, false, false, false] }
    ],
    members: [
      { id: 'M1', i: 'N1', j: 'N2', kind: 'column', b: 0.25, h: 0.35 }
    ],
    nodalLoads: [
      { node: 'N2', case: 'D', fx: 0, fy: -10, fz: 5, mx: 0, my: 2, mz: -3 }
    ],
    memberLoads: [
      { member: 'M1', case: 'D', axes: 'local', qx: 0, qy: -8, qz: 2 }
    ],
    gridLines: {
      x: [{ label: '1', value: 0 }, { label: '2', value: 6 }],
      z: [{ label: 'A', value: 0 }, { label: 'B', value: 4 }]
    },
    foundations: [
      { id: 'F1', nodes: ['N1'], bx: 1.5, bz: 1.5, depth: 0.5 }
    ]
  };

  const migrated = migrateToZUp(legacyModel);
  assert(migrated.coordinateSystem === 'z-up', 'Migrated model must have coordinateSystem: z-up');

  // Nodes: (x, y, z) -> (x, z, y)
  // N1: (0, 0, 0) -> (0, 0, 0)
  assert(migrated.nodes[0].x === 0 && migrated.nodes[0].y === 0 && migrated.nodes[0].z === 0, 'N1 coordinates correct');
  // N2: (6, 3.5, 4) -> (6, 4, 3.5)
  assert(migrated.nodes[1].x === 6 && migrated.nodes[1].y === 4 && migrated.nodes[1].z === 3.5, 'N2 coordinates: y and z swapped');

  // Nodal loads: fy <-> fz, my <-> mz
  assert(migrated.nodalLoads[0].fy === 5 && migrated.nodalLoads[0].fz === -10, 'Nodal loads fy/fz swapped');
  assert(migrated.nodalLoads[0].my === -3 && migrated.nodalLoads[0].mz === 2, 'Nodal loads my/mz swapped');

  // Member loads: qy <-> qz
  assert(migrated.memberLoads[0].qy === 2 && migrated.memberLoads[0].qz === -8, 'Member loads qy/qz swapped');

  // Gridlines: z mapped to y
  assert(migrated.gridLines.y.length === 2, 'gridLines.y populated from old z');
  assert(migrated.gridLines.y[1].value === 4, 'gridLines.y values preserved');

  // Foundations: by populated from bz
  assert(migrated.foundations[0].by === 1.5, 'Foundation by populated from bz');

  // Idempotency: migrating already Z-up model returns same data without re-swapping
  const reMigrated = migrateToZUp(migrated);
  assert(reMigrated.nodes[1].y === 4 && reMigrated.nodes[1].z === 3.5, 'migrateToZUp is idempotent');
}

// 4. Warehouse & 3-Story Building Models in Z-Up
console.log('4. Testing Z-Up Warehouse and 3-Story Building Generation...');
{
  const wh = warehouseModel();
  assert(wh.coordinateSystem === 'z-up', 'Warehouse model must declare coordinateSystem: z-up');
  // Base nodes at z = 0
  const baseNodes = wh.nodes.filter(n => n.z === 0);
  assert(baseNodes.length >= 8, 'Warehouse ground nodes at z = 0');
  for (const bn of baseNodes) {
    assert(bn.restraints.every(Boolean), 'Ground nodes restrained');
  }
  // Roof / eave nodes elevated in +Z
  const topNodes = wh.nodes.filter(n => n.z > 0);
  assert(topNodes.length > 0, 'Roof nodes at Z > 0');

  // Grid lines in X and Y
  assert(wh.gridLines.x.length === 2, 'Warehouse has X gridlines');
  assert(wh.gridLines.y.length === 4, 'Warehouse has Y gridlines (bays)');

  const bld = threeStoryBuilding();
  assert(bld.coordinateSystem === 'z-up', 'Three-story building must declare coordinateSystem: z-up');
  const storyHeights = [...new Set(bld.nodes.map(n => Math.round(n.z * 100) / 100))].sort((a, b) => a - b);
  assert(storyHeights.includes(0), 'Building ground at Z = 0');
  assert(storyHeights.length >= 4, 'Building has ground + 3 elevated stories');
}

// 5. HTML, CSS, and app.js UI Integration
console.log('5. Testing UI, CSS, and Camera Integration...');
{
  // CSS styles for axis locking badges
  assert(css.includes('.axis-lock-badge'), 'CSS .axis-lock-badge exists');
  assert(css.includes('.axis-lock-badge.lock-x'), 'CSS .lock-x exists');
  assert(css.includes('.axis-lock-badge.lock-y'), 'CSS .lock-y exists');
  assert(css.includes('.axis-lock-badge.lock-z'), 'CSS .lock-z exists');

  // HTML badge and button elements
  assert(html.includes('id="axisLockBadge"'), 'HTML axisLockBadge element exists');
  assert(html.includes('id="planBeamLockX"'), 'HTML planBeamLockX button exists');
  assert(html.includes('id="planBeamLockY"'), 'HTML planBeamLockY button exists');

  // app.js Three.js Cameras configuration
  assert(appJs.includes('camera.up.set(0,0,1)'), 'PerspectiveCamera up vector set to (0, 0, 1) [Z-Up]');
  assert(appJs.includes('camera.up.set(0,1,0)'), 'Plan OrthographicCamera up vector set to (0, 1, 0) [looking down -Z]');
  assert(appJs.includes('gridHelper.rotation.x=Math.PI/2'), 'GridHelper rotated to X-Y ground plane');

  // app.js Arrow keys and locking wiring
  assert(appJs.includes('getAxisLockFromKey'), 'app.js imports and uses getAxisLockFromKey');
  assert(appJs.includes('setBeamAxisLock'), 'app.js implements setBeamAxisLock');
  assert(appJs.includes('planBeamLockY'), 'app.js wires planBeamLockY button');

  // BoxGeometry for members
  assert(appJs.includes('BoxGeometry(secH,axes.L,secB'), 'BoxGeometry dimensions orient secH along local vertical z');

  // SketchUp drag colors (X=Red, Y=Green)
  assert(appJs.includes('0xef4444'), 'SketchUp Red (0xef4444) used for X axis');
  assert(appJs.includes('0x22c55e'), 'SketchUp Green (0x22c55e) used for Y axis');
}

console.log('PASS: All Sprint 2 Z-up coordinate system tests passed successfully!');
