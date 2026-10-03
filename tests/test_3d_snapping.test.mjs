import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestPointOnSegmentToRay,
  project3DToScreen,
  find3DSnapPoint
} from '../static/building.js';

test('3D Snapping: closestPointOnSegmentToRay calculates exact closest point and distance', () => {
  // Segment along X from (0, 2, 3) to (4, 2, 3)
  const segA = { x: 0, y: 2, z: 3 };
  const segB = { x: 4, y: 2, z: 3 };

  // Ray starting at (2, 0, 3) pointing in +Y direction (2, 1, 0)
  const rayOrigin = { x: 2, y: 0, z: 3 };
  const rayDir = { x: 0, y: 1, z: 0 };

  const res = closestPointOnSegmentToRay(rayOrigin, rayDir, segA, segB);
  assert.ok(res, 'Result should exist');
  assert.equal(res.point.x, 2, 'Closest X should be 2');
  assert.equal(res.point.y, 2, 'Closest Y should be 2');
  assert.equal(res.point.z, 3, 'Closest Z should be 3');
  assert.ok(res.dist < 1e-6, 'Perpendicular distance should be 0');
  assert.equal(res.param, 0.5, 'Param should be 0.5 (midpoint)');
});

test('3D Snapping: project3DToScreen projects 3D point to screen coordinates', () => {
  // Mock camera that maps [-5, 5] linearly to NDC [-1, 1]
  const mockCamera = {
    project: (v) => ({
      x: v.x / 5,
      y: v.y / 5,
      z: 0.5
    })
  };
  const width = 1000, height = 800;
  // Point at (0, 0, 0) -> NDC (0, 0) -> Screen (500, 400)
  const projCenter = project3DToScreen({ x: 0, y: 0, z: 0 }, mockCamera, width, height);
  assert.equal(projCenter.screenX, 500);
  assert.equal(projCenter.screenY, 400);
  assert.equal(projCenter.inFront, true);

  // Point at (5, 5, 0) -> NDC (1, 1) -> Screen (1000, 0)
  const projCorner = project3DToScreen({ x: 5, y: 5, z: 0 }, mockCamera, width, height);
  assert.equal(projCorner.screenX, 1000);
  assert.equal(projCorner.screenY, 0);
});

test('3D Snapping: find3DSnapPoint snaps to Node (Endpoint) within pixel tolerance', () => {
  const mockCamera = {
    project: (v) => ({
      x: v.x / 10,
      y: v.y / 10,
      z: 0.5
    })
  };
  const width = 1000, height = 800;
  // Node N1 at (2, 2, 3) -> NDC (0.2, 0.2) -> Screen: (1.2 * 500 = 600, (1 - 0.2) * 400 = 320)
  const nodes = [
    { id: 'N1', x: 2, y: 2, z: 3 },
    { id: 'N2', x: 8, y: 8, z: 0 }
  ];
  const members = [];

  // Pointer at (605, 322) -> distance hypot(5, 2) ~ 5.38px <= 22px tolerance
  const snap = find3DSnapPoint({
    screenX: 605,
    screenY: 322,
    viewportWidth: width,
    viewportHeight: height,
    camera: mockCamera,
    nodes,
    members
  });

  assert.ok(snap, 'Snap should be detected');
  assert.equal(snap.type, 'node');
  assert.equal(snap.node.id, 'N1');
  assert.equal(snap.color, '#10b981');
  assert.equal(snap.point.x, 2);
  assert.equal(snap.point.y, 2);
  assert.equal(snap.point.z, 3);
});

test('3D Snapping: find3DSnapPoint snaps to Member Midpoint if not on node', () => {
  const mockCamera = {
    project: (v) => ({
      x: v.x / 10,
      y: v.y / 10,
      z: 0.5
    })
  };
  const width = 1000, height = 800;
  // N1 at (0, 0, 0), N2 at (4, 0, 0) -> Midpoint at (2, 0, 0)
  // Screen of midpoint: NDC (0.2, 0) -> Screen: (600, 400)
  const nodes = [
    { id: 'N1', x: 0, y: 0, z: 0 },
    { id: 'N2', x: 4, y: 0, z: 0 }
  ];
  const members = [
    { id: 'M1', i: 'N1', j: 'N2' }
  ];

  // Pointer at (598, 402) -> distance hypot(-2, 2) ~ 2.82px <= 18px tolerance
  // Note: N1 screen is (500, 400) (dist 98px > 22px), N2 screen is (700, 400) (dist 102px > 22px)
  const snap = find3DSnapPoint({
    screenX: 598,
    screenY: 402,
    viewportWidth: width,
    viewportHeight: height,
    camera: mockCamera,
    nodes,
    members
  });

  assert.ok(snap, 'Midpoint snap should be detected');
  assert.equal(snap.type, 'midpoint');
  assert.equal(snap.member.id, 'M1');
  assert.equal(snap.color, '#06b6d4');
  assert.equal(snap.point.x, 2);
  assert.equal(snap.point.y, 0);
  assert.equal(snap.point.z, 0);
});

test('3D Snapping: find3DSnapPoint snaps to Ground Plane with Grid Step', () => {
  // Ray pointing downward from (2.12, 3.89, 5) straight to Z=0
  const ray = {
    origin: { x: 2.12, y: 3.89, z: 5 },
    direction: { x: 0, y: 0, z: -1 }
  };

  const snap = find3DSnapPoint({
    screenX: 50,
    screenY: 50,
    viewportWidth: 1000,
    viewportHeight: 800,
    camera: null,
    nodes: [],
    members: [],
    ray,
    curElev: 0,
    gridStep: 1.0,
    useGrid: true
  });

  assert.ok(snap, 'Ground grid snap should be detected');
  assert.equal(snap.type, 'grid');
  // (2.12, 3.89) rounded to 1.0 step -> (2.0, 4.0, 0.0)
  assert.equal(snap.point.x, 2.0);
  assert.equal(snap.point.y, 4.0);
  assert.equal(snap.point.z, 0.0);
});
