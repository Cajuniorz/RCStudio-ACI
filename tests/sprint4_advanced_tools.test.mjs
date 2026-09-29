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

import {
  findContinuousBeamChain,
  calculateWallUDL,
  classifyConnectedMembers
} from '../static/building.js';

test('Sprint 4: Continuous Beam Chain Detection (J)', () => {
  const nodes = [
    { id: 'N1', x: 0, y: 0, z: 3 },
    { id: 'N2', x: 4, y: 0, z: 3 },
    { id: 'N3', x: 8, y: 0, z: 3 }
  ];
  const members = [
    { id: 'M1', i: 'N1', j: 'N2', kind: 'beam' },
    { id: 'M2', i: 'N2', j: 'N3', kind: 'beam' },
    { id: 'M3', i: 'N1', j: 'N3', kind: 'beam' }
  ];

  const chain = findContinuousBeamChain(members, ['M1', 'M2'], nodes);
  assert.ok(chain, 'Should detect chain between M1 and M2');
  assert.equal(chain.valid, true);
  assert.deepEqual(chain.sharedNodes, ['N2']);
});

test('Sprint 4: Wall UDL Calculation (P)', () => {
  const udl = calculateWallUDL(2.8, 180);
  // 180 * 2.8 * 9.80665 / 1000 ≈ 4.94 kN/m
  assert.ok(udl >= 4.5 && udl <= 5.5, `UDL should be approx 4.94 kN/m, got ${udl}`);
});

test('Sprint 4: Node Connected Members Classification (Q)', () => {
  const nodes = [
    { id: 'N1', x: 0, y: 0, z: 3 },
    { id: 'N_col', x: 0, y: 0, z: 0 },
    { id: 'N_beamX', x: 4, y: 0, z: 3 },
    { id: 'N_beamY', x: 0, y: 5, z: 3 }
  ];
  const members = [
    { id: 'C1', i: 'N_col', j: 'N1', kind: 'column' },
    { id: 'B1', i: 'N1', j: 'N_beamX', kind: 'beam' },
    { id: 'B2', i: 'N1', j: 'N_beamY', kind: 'beam' }
  ];

  const classified = classifyConnectedMembers('N1', members, nodes);
  assert.equal(classified.length, 3);
  
  const col = classified.find(c => c.axis === 'z');
  assert.ok(col, 'Should find Z column');
  assert.equal(col.member.id, 'C1');

  const bx = classified.find(c => c.axis === 'x');
  assert.ok(bx, 'Should find X beam');
  assert.equal(bx.member.id, 'B1');

  const by = classified.find(c => c.axis === 'y');
  assert.ok(by, 'Should find Y beam');
  assert.equal(by.member.id, 'B2');
});

test('Sprint 4: HTML Elements for Join & Pull Dialogs', () => {
  assert.ok(html.includes('id="joinBeamsDialog"'), 'joinBeamsDialog missing from index.html');
  assert.ok(html.includes('id="pullNodeMenu"'), 'pullNodeMenu missing from index.html');
});

test('Sprint 4: App.js Advanced Tools Integration (R, P, J, Q)', () => {
  assert.ok(appJs.includes('commitBuildSlab'), 'commitBuildSlab missing from app.js');
  assert.ok(appJs.includes('commitBuildWall'), 'commitBuildWall missing from app.js');
  assert.ok(appJs.includes('executeJoinBeams'), 'executeJoinBeams missing from app.js');
  assert.ok(appJs.includes('openPullNodeMenu'), 'openPullNodeMenu missing from app.js');
});
