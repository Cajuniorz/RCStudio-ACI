import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../static/vendor/three.module.js';

test('OrbitControls: has cursor-pivot properties and rotation logic', () => {
  const file = fs.readFileSync(path.join(process.cwd(), 'static/vendor/OrbitControls.js'), 'utf8');
  assert(file.includes('this.getPivotPoint = null;'), 'getPivotPoint property missing');
  assert(file.includes('this._currentOrbitPivot = null;'), '_currentOrbitPivot property missing');
  assert(file.includes('if ( this._currentOrbitPivot ) {'), 'Cursor-pivot rotation branch missing in OrbitControls');
});

test('OrbitControls: cursor-pivot rotation maintains invariant screen position of hit point', () => {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(20, -10, 15);
  const pivot = new THREE.Vector3(6, 4, 3);
  camera.lookAt(pivot);
  camera.updateMatrixWorld();

  const screenBefore = pivot.clone().project(camera);

  // Rotate yaw around global Z (camera.up)
  const angleX = 0.08;
  const qYaw = new THREE.Quaternion().setFromAxisAngle(camera.up.clone().normalize(), angleX);
  const offset = camera.position.clone().sub(pivot);
  offset.applyQuaternion(qYaw);
  camera.position.copy(pivot).add(offset);
  camera.quaternion.premultiply(qYaw);

  // Rotate pitch around camera local X
  const angleY = 0.05;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(right, angleY);
  const offset2 = camera.position.clone().sub(pivot);
  offset2.applyQuaternion(qPitch);
  camera.position.copy(pivot).add(offset2);
  camera.quaternion.premultiply(qPitch);

  camera.updateMatrixWorld();
  const screenAfter = pivot.clone().project(camera);

  const diff = Math.hypot(screenAfter.x - screenBefore.x, screenAfter.y - screenBefore.y);
  assert(diff < 1e-12, 'Screen projection changed: ' + diff);
});

test('app.js: getOrbitPivotPoint is defined and hooked into bindControls', () => {
  const appJs = fs.readFileSync(path.join(process.cwd(), 'static/app.js'), 'utf8');
  assert(appJs.includes('function getOrbitPivotPoint(event)'), 'getOrbitPivotPoint function missing in app.js');
  assert(appJs.includes('controls.getPivotPoint=getOrbitPivotPoint'), 'controls.getPivotPoint binding missing in bindControls');
  assert(appJs.includes('group.children.length'), 'group.children check missing in getOrbitPivotPoint');
});
