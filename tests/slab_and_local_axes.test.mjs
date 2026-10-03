import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const appJsPath = path.join(root, 'static', 'app.js');
const indexHtmlPath = path.join(root, 'static', 'index.html');
const projectV2Path = path.join(root, 'project_v2.py');
const designRc25Path = path.join(root, 'design_rc25.py');

test('Slab System: HTML controls and UI options', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  
  // SOG slab option in builder
  assert.match(html, /<option value="ground_slab">/, 'Should contain ground_slab option in building slab types');
  
  // Slab display mode selector in toolbar
  assert.match(html, /id="slabDisplayMode"/, 'Should contain slabDisplayMode selector');
  assert.match(html, /value="solid"/, 'Should have solid slab display mode');
  assert.match(html, /value="glass"/, 'Should have glass slab display mode');
  assert.match(html, /value="wire"/, 'Should have wire slab display mode');
  assert.match(html, /value="hide"/, 'Should have hide slab display mode');

  // Engineering local axes diagram options in diagramType
  assert.match(html, /value="major_M"/, 'Should have major_M diagram option');
  assert.match(html, /value="minor_M"/, 'Should have minor_M diagram option');
  assert.match(html, /value="major_V"/, 'Should have major_V diagram option');
  assert.match(html, /value="minor_V"/, 'Should have minor_V diagram option');
  assert.match(html, /value="vert_d"/, 'Should have vert_d diagram option');
  assert.match(html, /value="lat_d"/, 'Should have lat_d diagram option');
});

test('Slab System & Local Axes: Python backend validation and design', () => {
  const pyProject = fs.readFileSync(projectV2Path, 'utf8');
  assert.match(pyProject, /'ground_slab'/, 'project_v2 FLOOR_TYPES should include ground_slab');
  assert.match(pyProject, /slab\['mode'\] == 'ground_slab'/, 'project_v2 should check ground_slab during load transfer');

  const pyDesign = fs.readFileSync(designRc25Path, 'utf8');
  assert.match(pyDesign, /def design_ground_slab\(/, 'design_rc25 should implement design_ground_slab');
  assert.match(pyDesign, /ACI 360R-10/, 'design_ground_slab should reference ACI 360R-10');
  assert.match(pyDesign, /stype == 'ground_slab'/, 'design_all should route ground_slab to design_ground_slab');
});

test('Slab System: 3D Solid Geometry and Load Elements in app.js', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Solid concrete extrusion with thickness
  assert.match(appJs, /ExtrudeGeometry/, 'app.js should use ExtrudeGeometry for physical slab thickness');
  assert.match(appJs, /EdgesGeometry/, 'app.js should create crisp bevel/edge lines on slabs');
  assert.match(appJs, /slabDisplayMode/, 'app.js should respect slabDisplayMode');

  // Area load element visualization
  assert.match(appJs, /ArrowHelper/, 'app.js should render physical pressure arrows for slab loads');
  assert.match(appJs, /totalLoadKNm2/, 'app.js should compute total area load');
  assert.match(appJs, /badgeText/, 'app.js should build load badge for slabs');

  // 3D Local Axis Gizmo for selected member
  assert.match(appJs, /makeAxisArrow/, 'app.js should render 3D local axis arrows');
  assert.match(appJs, /makeAxisArrow\(axX, 0xef4444, 'x_L'\)/, 'app.js should render local x arrow');
  assert.match(appJs, /makeAxisArrow\(axY, 0x22c55e, 'y_L'\)/, 'app.js should render local y arrow');
  assert.match(appJs, /makeAxisArrow\(axZ, 0x38bdf8, 'z_L'\)/, 'app.js should render local z arrow');
});

test('Local vs Global Axes UX: Diagram mapping in app.js', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // drawDiagram mapping of engineering terms
  assert.match(appJs, /selKey === 'major_M'|selType === 'major_M'/, 'drawDiagram should map major_M');
  assert.match(appJs, /selKey === 'minor_M'|selType === 'minor_M'/, 'drawDiagram should map minor_M');
  assert.match(appJs, /selKey === 'major_V'|selType === 'major_V'/, 'drawDiagram should map major_V');
  assert.match(appJs, /selKey === 'minor_V'|selType === 'minor_V'/, 'drawDiagram should map minor_V');
  assert.match(appJs, /selKey === 'vert_d'/, 'drawDiagram should map vert_d');
  assert.match(appJs, /selKey === 'lat_d'/, 'drawDiagram should map lat_d');

  // SOG table rendering in renderDesignTable
  assert.match(appJs, /isGround\?['"]พื้นวางบนดิน \(SOG\)['"]/, 'renderDesignTable should format SOG ground slabs');
});
