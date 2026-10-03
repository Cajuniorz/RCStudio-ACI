import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THAI_WALL_MATERIALS,
  THAI_FLOOR_SDL,
  THAI_ROOF_MATERIALS,
  THAI_LIVE_LOADS,
  THAI_CONCRETE_PRESETS,
  THAI_REBAR_GRADES,
  computeWallUDL_KNm,
  computeFloorDeadLoad_KNm2,
  kgm2ToKNm2,
  knm2ToKgm2,
  kscToMpa,
  mpaToKsc
} from '../static/thai_standards.js';

test('Thai Standards: Wall materials catalogue constants', () => {
  assert.equal(THAI_WALL_MATERIALS.mon_half.density_kgm2, 180);
  assert.equal(THAI_WALL_MATERIALS.mon_full.density_kgm2, 360);
  assert.equal(THAI_WALL_MATERIALS.aac_75.density_kgm2, 90);
  assert.equal(THAI_WALL_MATERIALS.aac_100.density_kgm2, 120);
  assert.equal(THAI_WALL_MATERIALS.gypsum_light.density_kgm2, 30);
});

test('Thai Standards: Ministerial Regulation No. 6 Live Loads', () => {
  assert.equal(THAI_LIVE_LOADS.residential.ll_kgm2, 150);
  assert.equal(THAI_LIVE_LOADS.office.ll_kgm2, 250);
  assert.equal(THAI_LIVE_LOADS.commercial_school.ll_kgm2, 300);
  assert.equal(THAI_LIVE_LOADS.assembly_stairs.ll_kgm2, 400);
  assert.equal(THAI_LIVE_LOADS.heavy_warehouse.ll_kgm2, 500);
});

test('Thai Standards: Wall UDL calculation formula', () => {
  // 180 kg/m2 * 2.8m * 9.80665 / 1000 = 4.94255 kN/m -> ~4.943 kN/m
  const udlMon = computeWallUDL_KNm(2.8, 180);
  assert.equal(udlMon, 4.943);

  // AAC 75: 90 kg/m2 * 3.0m * 9.80665 / 1000 = 2.648 kN/m
  const udlAac = computeWallUDL_KNm(3.0, 90);
  assert.equal(udlAac, 2.648);
});

test('Thai Standards: Floor Dead Load calculation', () => {
  // 0.12m * 2400 = 288 kg/m2 = 2.824 kN/m2
  // finish: 60 kg/m2 = 0.588 kN/m2
  // ceiling: 15 kg/m2 = 0.147 kN/m2
  // total = 3.560 kN/m2
  const loads = computeFloorDeadLoad_KNm2(0.12, 60, 15, 2400);
  assert.equal(loads.selfWeightKNm2, 2.824);
  assert.equal(loads.sdlKNm2, 0.735);
  assert.equal(loads.totalDeadKNm2, 3.560);
});

test('Thai Standards: Units conversion helpers', () => {
  assert.equal(kscToMpa(240), 23.54);
  assert.equal(Math.round(mpaToKsc(23.54)), 240);
  assert.equal(kgm2ToKNm2(150), 1.471);
  assert.equal(Math.round(knm2ToKgm2(1.471)), 150);
});
