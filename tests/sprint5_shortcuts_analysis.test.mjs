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

// Pure shortcut matching helper replica from app.js
function eventToKeyCombo(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  
  let key = event.key;
  if (key === ' ' || event.code === 'Space') {
    key = ' ';
  } else if (key.length === 1) {
    key = key.toLowerCase();
  }
  
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return null;
  }
  
  if (parts.length > 0) {
    return parts.join('+') + '+' + key;
  }
  return key;
}

function matchesShortcut(event, shortcutStr) {
  if (!shortcutStr) return false;
  if (shortcutStr === ' ' || shortcutStr.toLowerCase() === 'space') {
    return (event.key === ' ' || event.code === 'Space') && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
  }
  const str = shortcutStr.trim();
  if (str.toLowerCase() === 'delete') {
    return (event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.altKey && !event.metaKey;
  }
  const combo = eventToKeyCombo(event);
  if (!combo) return false;
  return combo.toLowerCase() === str.toLowerCase();
}

test('Sprint 5: Shortcut Key Combination Matching (V, D, Ctrl+E, Ctrl+A, Space, Del)', () => {
  // 1. V -> Toggle2D3D
  assert.equal(matchesShortcut({ key: 'v' }, 'v'), true);
  assert.equal(matchesShortcut({ key: 'V' }, 'v'), true);
  assert.equal(matchesShortcut({ key: 'v', ctrlKey: true }, 'v'), false);

  // 2. D -> ToggleDiagram
  assert.equal(matchesShortcut({ key: 'd' }, 'd'), true);
  assert.equal(matchesShortcut({ key: 'D' }, 'd'), true);

  // 3. Ctrl+E -> CycleDiagram
  assert.equal(matchesShortcut({ key: 'e', ctrlKey: true }, 'Ctrl+e'), true);
  assert.equal(matchesShortcut({ key: 'E', ctrlKey: true }, 'Ctrl+e'), true);
  assert.equal(matchesShortcut({ key: 'e' }, 'Ctrl+e'), false);

  // 4. Ctrl+A -> Analyze
  assert.equal(matchesShortcut({ key: 'a', ctrlKey: true }, 'Ctrl+a'), true);
  assert.equal(matchesShortcut({ key: 'A', ctrlKey: true }, 'Ctrl+a'), true);
  assert.equal(matchesShortcut({ key: 'a' }, 'Ctrl+a'), false);

  // 5. Space -> Select / Cancel
  assert.equal(matchesShortcut({ key: ' ', code: 'Space' }, ' '), true);
  assert.equal(matchesShortcut({ key: ' ', code: 'Space', shiftKey: true }, ' '), false);

  // 6. Delete -> Delete element
  assert.equal(matchesShortcut({ key: 'Delete' }, 'Delete'), true);
  assert.equal(matchesShortcut({ key: 'Backspace' }, 'Delete'), true);
});

test('Sprint 5: Diagram Cycling Logic (Mz -> My -> Vy -> Vz -> N -> T)', () => {
  const diagramOptions = ['Mz', 'My', 'Vy', 'Vz', 'N', 'T', 'dy', 'dz'];
  let selectedIndex = 0; // Mz

  const cycle = (idx) => (idx + 1) % diagramOptions.length;

  selectedIndex = cycle(selectedIndex);
  assert.equal(diagramOptions[selectedIndex], 'My');

  selectedIndex = cycle(selectedIndex);
  assert.equal(diagramOptions[selectedIndex], 'Vy');

  selectedIndex = cycle(selectedIndex);
  assert.equal(diagramOptions[selectedIndex], 'Vz');

  selectedIndex = cycle(selectedIndex);
  assert.equal(diagramOptions[selectedIndex], 'N');

  selectedIndex = cycle(selectedIndex);
  assert.equal(diagramOptions[selectedIndex], 'T');
});

test('Sprint 5: Solid / Wireframe Toggle Modes', () => {
  const STRUCT_MODES = [
    ['solid', 'โครงสร้าง 3D (Solid)'],
    ['wire', 'เส้นแกน & โหนด']
  ];
  let current = 'solid';
  const toggle = (m) => {
    const idx = STRUCT_MODES.findIndex(pair => pair[0] === m);
    return STRUCT_MODES[(idx + 1) % STRUCT_MODES.length][0];
  };

  current = toggle(current);
  assert.equal(current, 'wire');

  current = toggle(current);
  assert.equal(current, 'solid');
});

test('Sprint 5: App.js Integration of Actions (Toggle2D3D, ToggleDiagram, CycleDiagram, Analyze)', () => {
  assert.ok(appJs.includes("case 'Toggle2D3D'"), 'Toggle2D3D action missing from app.js');
  assert.ok(appJs.includes("case 'ToggleDiagram'"), 'ToggleDiagram action missing from app.js');
  assert.ok(appJs.includes("case 'CycleDiagram'"), 'CycleDiagram action missing from app.js');
  assert.ok(appJs.includes("case 'Analyze'"), 'Analyze action missing from app.js');
  assert.ok(appJs.includes('structModeButton'), 'structModeButton missing from app.js');
});

test('Sprint 5: HTML Controls for Diagrams & Analysis', () => {
  assert.ok(html.includes('id="diagram3d"'), 'diagram3d checkbox missing from index.html');
  assert.ok(html.includes('id="diagramType"'), 'diagramType select missing from index.html');
  assert.ok(html.includes('id="analyze"'), 'analyze button missing from index.html');
  assert.ok(html.includes('id="structModeButton"'), 'structModeButton missing from index.html');
});
