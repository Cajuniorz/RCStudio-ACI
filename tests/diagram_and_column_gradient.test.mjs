import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { findContinuousColumnStack, getContinuousColumnStackValue, threeStoryBuilding } from '../static/building.js';
import { stationValueKN, rangeKN } from '../static/heatmap.js';

test('findContinuousColumnStack identifies multi-storey column runs at the same plan coordinates', () => {
  const p = threeStoryBuilding();
  // Find column from ground to floor 1 (N1 at 0,0,0 to N7 at 0,0,3)
  const baseCol = p.members.find(m => m.kind === 'column' && (m.i === 'N1' || m.j === 'N1'));
  assert.ok(baseCol, 'Should find base column at N1');

  const stack = findContinuousColumnStack(p.members, baseCol.id, p.nodes);
  assert.equal(stack.length, 3, 'A 3-storey building column must have 3 stacked storeys');

  // Verify all columns in stack are at x=0, y=0
  for (const col of stack) {
    const ni = p.nodes.find(n => n.id === col.i);
    const nj = p.nodes.find(n => n.id === col.j);
    assert.equal(ni.x, 0);
    assert.equal(ni.y, 0);
    assert.equal(nj.x, 0);
    assert.equal(nj.y, 0);
  }

  // Verify stack is sorted from lowest Z to highest Z
  const zLevels = stack.map(col => {
    const ni = p.nodes.find(n => n.id === col.i);
    const nj = p.nodes.find(n => n.id === col.j);
    return Math.min(ni.z, nj.z);
  });
  assert.deepEqual(zLevels, [0, 3, 6], 'Column stack must be sorted from foundation upward');
});

test('Continuous column stack shares continuous range across storeys (not chunky single-storey scales)', () => {
  const p = threeStoryBuilding();
  const stack = findContinuousColumnStack(p.members, 'M1', p.nodes);

  // Synthetic analysis result for 3 storeys of column under gravity
  const mockResults = {
    [stack[0].id]: {
      length: 3,
      samples: [
        { x: 0, N: -300, Vy: 0, Vz: 0, Mz: 15, My: 0 },
        { x: 1.5, N: -285, Vy: 0, Vz: 0, Mz: 2, My: 0 },
        { x: 3, N: -270, Vy: 0, Vz: 0, Mz: 18, My: 0 }
      ]
    },
    [stack[1].id]: {
      length: 3,
      samples: [
        { x: 0, N: -190, Vy: 0, Vz: 0, Mz: 14, My: 0 },
        { x: 1.5, N: -180, Vy: 0, Vz: 0, Mz: 1, My: 0 },
        { x: 3, N: -170, Vy: 0, Vz: 0, Mz: 16, My: 0 }
      ]
    },
    [stack[2].id]: {
      length: 3,
      samples: [
        { x: 0, N: -90, Vy: 0, Vz: 0, Mz: 12, My: 0 },
        { x: 1.5, N: -80, Vy: 0, Vz: 0, Mz: 0.5, My: 0 },
        { x: 3, N: -70, Vy: 0, Vz: 0, Mz: 14, My: 0 }
      ]
    }
  };

  const stackRange = rangeKN(stack, mockResults, 'N');
  assert.equal(stackRange.min, 70, 'Minimum axial load is at roof');
  assert.equal(stackRange.max, 300, 'Maximum axial load is at base foundation');

  // When all 3 columns share this scale, the column from ground to roof has a smooth gradient
  // rather than jumping abruptly at floor slabs
  assert.ok(stackRange.max > stackRange.min);
});

test('App.js includes station-dependent getMemberDC and floorTransfers absolute value check', () => {
  const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');

  // Verify getMemberDC accepts station t
  assert.ok(appJs.includes('function getMemberDC(m, active, t = null)'), 'getMemberDC must accept station t');
  assert.ok(appJs.includes('function getMemberStationForces(memberResult, t)'), 'getMemberStationForces must exist');

  // Verify floorTransfers checks Math.abs of tributary load
  assert.ok(appJs.includes('Math.abs(isZUp?(ft.qzKNm||ft.qyKNm||0):(ft.qyKNm||0))'), 'floorTransfers must check Math.abs(q) for downward negative loads');

  // Verify diagGlobal includes N and T
  assert.ok(appJs.includes('const diagGlobal={M:0,V:0,N:0,T:0}'), 'diagGlobal must track M, V, N, and T');

  // Verify wireframe mode supports vertexColors gradient
  assert.ok(appJs.includes('const nWireSegs=20;'), 'Wireframe mode must build segmented lines with vertexColors');

  // Verify appJs integrates getContinuousColumnStackValue
  assert.ok(appJs.includes('getContinuousColumnStackValue({'), 'appJs must call getContinuousColumnStackValue for columns');
});

test('getContinuousColumnStackValue provides exact C0 continuity at floor joints and smooth cascading gradient down column', () => {
  const p = threeStoryBuilding();
  const stack = findContinuousColumnStack(p.members, 'M1', p.nodes);
  assert.equal(stack.length, 3, 'Must have 3 storeys');

  // Simulation of axial force in 3 storeys:
  // Storey 0 (ground): N = -300 kN
  // Storey 1 (mid):    N = -200 kN
  // Storey 2 (top):    N = -100 kN
  const mockN = {
    [stack[0].id]: -300,
    [stack[1].id]: -200,
    [stack[2].id]: -100
  };

  const evalMemberStation = (mem, memT) => mockN[mem.id];

  // Evaluate values at bottom, mid, and top of each storey
  const c0_bot = getContinuousColumnStackValue({ stack, memberId: stack[0].id, t: 0.0, nodes: p.nodes, evalMemberStation });
  const c0_mid = getContinuousColumnStackValue({ stack, memberId: stack[0].id, t: 0.5, nodes: p.nodes, evalMemberStation });
  const c0_top = getContinuousColumnStackValue({ stack, memberId: stack[0].id, t: 1.0, nodes: p.nodes, evalMemberStation });

  const c1_bot = getContinuousColumnStackValue({ stack, memberId: stack[1].id, t: 0.0, nodes: p.nodes, evalMemberStation });
  const c1_mid = getContinuousColumnStackValue({ stack, memberId: stack[1].id, t: 0.5, nodes: p.nodes, evalMemberStation });
  const c1_top = getContinuousColumnStackValue({ stack, memberId: stack[1].id, t: 1.0, nodes: p.nodes, evalMemberStation });

  const c2_bot = getContinuousColumnStackValue({ stack, memberId: stack[2].id, t: 0.0, nodes: p.nodes, evalMemberStation });
  const c2_mid = getContinuousColumnStackValue({ stack, memberId: stack[2].id, t: 0.5, nodes: p.nodes, evalMemberStation });
  const c2_top = getContinuousColumnStackValue({ stack, memberId: stack[2].id, t: 1.0, nodes: p.nodes, evalMemberStation });

  // 1. Foundation base load
  assert.equal(c0_bot, -300, 'Ground foundation value must be -300');

  // 2. Floor 1 Joint Continuity: c0_top MUST EQUAL c1_bot exactly!
  assert.equal(c0_top, -250, 'Joint 1 value should be average of -300 and -200 = -250');
  assert.equal(c1_bot, -250, 'Joint 1 value from upper column must match joint value exactly');
  assert.equal(Math.abs(c0_top - c1_bot), 0, 'Floor 1 joint must have zero discontinuity / zero seam');

  // 3. Floor 2 Joint Continuity: c1_top MUST EQUAL c2_bot exactly!
  assert.equal(c1_top, -150, 'Joint 2 value should be average of -200 and -100 = -150');
  assert.equal(c2_bot, -150, 'Joint 2 value from roof column must match joint value exactly');
  assert.equal(Math.abs(c1_top - c2_bot), 0, 'Floor 2 joint must have zero discontinuity / zero seam');

  // 4. Roof load
  assert.equal(c2_top, -100, 'Roof top value must be -100');

  // 5. Monotonic cascading gradient from roof (-100) down to foundation (-300)
  assert.ok(c2_top > c2_mid && c2_mid > c2_bot, 'Top storey must gradient smoothly');
  assert.ok(c1_top > c1_mid && c1_mid > c1_bot, 'Mid storey must gradient smoothly');
  assert.ok(c0_top > c0_mid && c0_mid > c0_bot, 'Base storey must gradient smoothly');
  assert.equal(c0_mid, -275);
  assert.equal(c1_mid, -200);
  assert.equal(c2_mid, -125);
});
