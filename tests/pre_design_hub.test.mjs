import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  THAI_WALL_MATERIALS,
  THAI_FLOOR_SDL,
  THAI_ROOF_MATERIALS,
  THAI_LIVE_LOADS,
  THAI_CONCRETE_PRESETS,
  THAI_REBAR_GRADES,
  computeWallUDL_KNm,
  computeFloorDeadLoad_KNm2
} from '../static/thai_standards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const html = readFileSync(join(__dirname, '../static/index.html'), 'utf8');
const css = readFileSync(join(__dirname, '../static/style.css'), 'utf8');
const appJs = readFileSync(join(__dirname, '../static/app.js'), 'utf8');

test('Pre-Design Setup Hub: HTML Tab Navigation & 4 Panels', () => {
  // Navigation tabs
  assert.ok(html.includes('id="setupNav"'), 'setupNav element missing');
  assert.ok(html.includes('data-tab="setup-project"'), 'Tab 1 button missing');
  assert.ok(html.includes('data-tab="setup-materials"'), 'Tab 2 button missing');
  assert.ok(html.includes('data-tab="setup-grids"'), 'Tab 3 button missing');
  assert.ok(html.includes('data-tab="setup-wizard"'), 'Tab 4 button missing');

  // Panels
  assert.ok(html.includes('id="panelSetupProject"'), 'panelSetupProject missing');
  assert.ok(html.includes('id="panelSetupMaterials"'), 'panelSetupMaterials missing');
  assert.ok(html.includes('id="panelSetupGrids"'), 'panelSetupGrids missing');
  assert.ok(html.includes('id="panelSetupWizard"'), 'panelSetupWizard missing');
});

test('Pre-Design Setup Hub: Presets & Live Calculator Elements', () => {
  // Tab 1 Project & Design Basis
  assert.ok(html.includes('id="occupancyType"'), 'occupancyType dropdown missing');
  assert.ok(html.includes('id="occupancyLLBadge"'), 'occupancyLLBadge missing');
  assert.ok(html.includes('id="concretePresetSelect"'), 'concretePresetSelect missing');
  assert.ok(html.includes('id="rebarMainSelect"'), 'rebarMainSelect missing');
  assert.ok(html.includes('id="rebarStirrupSelect"'), 'rebarStirrupSelect missing');
  assert.ok(html.includes('id="designFc"'), 'designFc input missing');
  assert.ok(html.includes('id="designFy"'), 'designFy input missing');
  assert.ok(html.includes('id="designFyt"'), 'designFyt input missing');

  // Tab 2 Materials & Loads Library
  assert.ok(html.includes('id="activeExtWall"'), 'activeExtWall dropdown missing');
  assert.ok(html.includes('id="activeIntWall"'), 'activeIntWall dropdown missing');
  assert.ok(html.includes('id="wallHeightCalcInput"'), 'wallHeightCalcInput missing');
  assert.ok(html.includes('id="wallDensityCalcInput"'), 'wallDensityCalcInput missing');
  assert.ok(html.includes('id="wallUDLResult"'), 'wallUDLResult missing');
  assert.ok(html.includes('id="activeFloorFinish"'), 'activeFloorFinish dropdown missing');
  assert.ok(html.includes('id="activeCeiling"'), 'activeCeiling dropdown missing');
  assert.ok(html.includes('id="floorSDLResult"'), 'floorSDLResult missing');
  assert.ok(html.includes('id="activeRoofCovering"'), 'activeRoofCovering dropdown missing');
  assert.ok(html.includes('id="resetMaterialsToStd"'), 'resetMaterialsToStd button missing');

  // Tab 3 Grids
  assert.ok(html.includes('id="gridCountX"'), 'gridCountX missing');
  assert.ok(html.includes('id="gridSpacingX"'), 'gridSpacingX missing');
  assert.ok(html.includes('id="generatePlanGrid"'), 'generatePlanGrid missing');
  assert.ok(html.includes('id="openGridEditor"'), 'openGridEditor missing');

  // Tab 4 Building Wizard with Exterior Walls
  assert.ok(html.includes('id="bldExtWallCheck"'), 'bldExtWallCheck checkbox missing');
  assert.ok(html.includes('id="bldExtWallSelect"'), 'bldExtWallSelect dropdown missing');
  assert.ok(html.includes('id="btnGenerateFullBuilding"'), 'btnGenerateFullBuilding missing');
});

test('Pre-Design Setup Hub: CSS Styles', () => {
  assert.ok(css.includes('.setup-nav'), '.setup-nav style missing');
  assert.ok(css.includes('.setup-nav-btn'), '.setup-nav-btn style missing');
  assert.ok(css.includes('.setup-panel'), '.setup-panel style missing');
  assert.ok(css.includes('.setup-card'), '.setup-card style missing');
  assert.ok(css.includes('.live-calc-box'), '.live-calc-box style missing');
  assert.ok(css.includes('.live-calc-val'), '.live-calc-val style missing');
  assert.ok(css.includes('.badge-thai'), '.badge-thai style missing');
});

test('Pre-Design Setup Hub: App.js Logic Integration', () => {
  assert.ok(appJs.includes('initSetupHub'), 'initSetupHub function missing in app.js');
  assert.ok(appJs.includes('THAI_WALL_MATERIALS'), 'THAI_WALL_MATERIALS not used in app.js');
  assert.ok(appJs.includes('THAI_LIVE_LOADS'), 'THAI_LIVE_LOADS not used in app.js');
  assert.ok(appJs.includes('computeWallUDL_KNm'), 'computeWallUDL_KNm not imported/used');
  assert.ok(appJs.includes('computeFloorDeadLoad_KNm2'), 'computeFloorDeadLoad_KNm2 not imported/used');
  assert.ok(appJs.includes('switchSetupTab'), 'switchSetupTab missing on window.app');
  assert.ok(appJs.includes('hasExteriorWalls'), 'hasExteriorWalls missing in generateFullBuilding');
});

test('Pre-Design Setup Hub: Math Computations for Thai Standards', () => {
  // 1. Lightweight AAC block wall 7.5cm (90 kg/m²), 2.8m high:
  // 2.8 * 90 = 252 kg/m => 252 * 0.00980665 = 2.471 kN/m
  const aacUDL = computeWallUDL_KNm(2.8, 90);
  assert.strictEqual(Number(aacUDL.toFixed(2)), 2.47);

  // 2. Mon half-brick wall (180 kg/m²), 3.0m high:
  // 3.0 * 180 = 540 kg/m => 540 * 0.00980665 = 5.295 kN/m
  const monUDL = computeWallUDL_KNm(3.0, 180);
  assert.strictEqual(Number(monUDL.toFixed(2)), 5.30);

  // 3. Tile finish (60 kg/m²) + Gypsum ceiling & MEP (30 kg/m²) = 90 kg/m² => 0.88 kN/m²
  const sdl = computeFloorDeadLoad_KNm2('tile_screed', 'ceiling_gypsum_mep');
  assert.strictEqual(Number(sdl.toFixed(2)), 0.88);

  // 4. Residential live load (150 kg/m²) => 1.47 kN/m²
  const resLL = ((THAI_LIVE_LOADS.residential.ll_kgm2 || THAI_LIVE_LOADS.residential.live_kgm2) * 0.00980665);
  assert.strictEqual(Number(resLL.toFixed(2)), 1.47);
});
