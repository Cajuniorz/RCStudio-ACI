import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// 1. Verify HTML elements for Sprint 1
console.log('Testing Sprint 1 HTML elements...');
assert(html.includes('id="modeSwitcher"'), 'Mode switcher element missing');
assert(html.includes('id="btnModeClassic"'), 'Classic mode button missing');
assert(html.includes('id="btnModeBuild"'), 'Build mode button missing');
assert(html.includes('โหมด Classic'), 'Classic mode label missing');
assert(html.includes('โหมด Build (3D)'), 'Build mode label missing');

// Floating Quick Tool Palette
assert(html.includes('id="buildToolPalette"'), 'buildToolPalette missing');
assert(html.includes('id="toolBuildSelect"'), 'toolBuildSelect missing');
assert(html.includes('id="toolBuildLine"'), 'toolBuildLine missing');
assert(html.includes('id="toolBuildNode"'), 'toolBuildNode missing');
assert(html.includes('id="toolBuildSlab"'), 'toolBuildSlab missing');
assert(html.includes('id="toolBuildWall"'), 'toolBuildWall missing');
assert(html.includes('id="toolBuildJoin"'), 'toolBuildJoin missing');
assert(html.includes('id="toolBuildPull"'), 'toolBuildPull missing');
assert(html.includes('id="toolBuildSettings"'), 'toolBuildSettings missing');

// Custom Context Menu
assert(html.includes('id="customContextMenu"'), 'customContextMenu missing');
assert(html.includes('data-action="Select"'), 'Context menu Select action missing');
assert(html.includes('data-action="Line"'), 'Context menu Line action missing');
assert(html.includes('data-action="Node"'), 'Context menu Node action missing');
assert(html.includes('data-action="Slab"'), 'Context menu Slab action missing');
assert(html.includes('data-action="Wall"'), 'Context menu Wall action missing');
assert(html.includes('data-action="Join"'), 'Context menu Join action missing');
assert(html.includes('data-action="Pull"'), 'Context menu Pull action missing');
assert(html.includes('data-action="Toggle2D3D"'), 'Context menu Toggle2D3D action missing');
assert(html.includes('data-action="ToggleDiagram"'), 'Context menu ToggleDiagram action missing');
assert(html.includes('data-action="Analyze"'), 'Context menu Analyze action missing');
assert(html.includes('data-action="settings"'), 'Context menu settings action missing');

// Shortcut Manager Dialog
assert(html.includes('id="shortcutManagerDialog"'), 'shortcutManagerDialog missing');
assert(html.includes('id="shortcutTableBody"'), 'shortcutTableBody missing');
assert(html.includes('id="resetShortcutsBtn"'), 'resetShortcutsBtn missing');
assert(html.includes('id="saveShortcutsBtn"'), 'saveShortcutsBtn missing');
assert(html.includes('id="closeShortcutDialog"'), 'closeShortcutDialog missing');
assert(html.includes('รีเซ็ตค่าเริ่มต้น'), 'Reset button text missing');

// 2. Verify CSS styles for Sprint 1
console.log('Testing Sprint 1 CSS styles...');
assert(css.includes('.mode-switcher'), '.mode-switcher CSS rule missing');
assert(css.includes('.mode-btn'), '.mode-btn CSS rule missing');
assert(css.includes('.build-tool-palette'), '.build-tool-palette CSS rule missing');
assert(css.includes('.build-palette-btn'), '.build-palette-btn CSS rule missing');
assert(css.includes('.custom-context-menu'), '.custom-context-menu CSS rule missing');
assert(css.includes('.ctx-item'), '.ctx-item CSS rule missing');
assert(css.includes('.shortcut-manager-dialog'), '.shortcut-manager-dialog CSS rule missing');
assert(css.includes('.shortcut-table'), '.shortcut-table CSS rule missing');
assert(css.includes('.shortcut-record-btn'), '.shortcut-record-btn CSS rule missing');

// 3. Verify JavaScript logic in app.js
console.log('Testing Sprint 1 JS logic in app.js...');
assert(appJs.includes('configureControlsForMode'), 'configureControlsForMode function missing');
assert(appJs.includes('setMode'), 'setMode function missing');
assert(appJs.includes('showContextMenu'), 'showContextMenu function missing');
assert(appJs.includes('hideContextMenu'), 'hideContextMenu function missing');
assert(appJs.includes('DEFAULT_SHORTCUTS'), 'DEFAULT_SHORTCUTS missing');
assert(appJs.includes('formatShortcutDisplay'), 'formatShortcutDisplay missing');
assert(appJs.includes('eventToKeyCombo'), 'eventToKeyCombo missing');
assert(appJs.includes('matchesShortcut'), 'matchesShortcut missing');
assert(appJs.includes('executeShortcutAction'), 'executeShortcutAction missing');
assert(appJs.includes('openShortcutManager'), 'openShortcutManager missing');
assert(appJs.includes('closeShortcutManager'), 'closeShortcutManager missing');
assert(appJs.includes('resetShortcuts'), 'resetShortcuts missing');
assert(appJs.includes('renderShortcutTable'), 'renderShortcutTable missing');

// Check OrbitControls configuration
assert(appJs.includes('controls.mouseButtons={LEFT:-1,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:-1}'), 'Build mode mouse buttons not configured correctly');
assert(appJs.includes('controls.zoomToCursor=true'), 'zoomToCursor not enabled in Build mode');
assert(appJs.includes('controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN}'), 'Classic mode mouse buttons not preserved');
assert(appJs.includes('controls.zoomToCursor=false'), 'zoomToCursor not disabled in Classic mode');

// Check event preventDefault on canvas contextmenu
assert(appJs.includes("$('canvas').addEventListener('contextmenu'"), 'canvas contextmenu listener missing');
assert(appJs.includes("renderer.domElement.addEventListener('mousedown'"), 'middle click mousedown listener missing');

// 4. Test pure helper functions (extracted from app.js)
console.log('Testing pure shortcut helper logic...');
function formatShortcutDisplay(key) {
  if (!key) return '—';
  if (key === ' ' || key.toLowerCase() === 'space') return 'Space';
  if (key.toLowerCase() === 'delete') return 'Delete';
  return key.split('+').map(part => {
    const lower = part.toLowerCase();
    if (lower === 'ctrl') return 'Ctrl';
    if (lower === 'shift') return 'Shift';
    if (lower === 'alt') return 'Alt';
    if (lower === ' ') return 'Space';
    return part.length === 1 ? part.toUpperCase() : part;
  }).join('+');
}

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
    return (event.key === ' ' || event.code === 'Space') && !event.ctrlKey && !event.altKey && !event.metaKey;
  }
  const str = shortcutStr.trim();
  if (str.toLowerCase() === 'delete') {
    return (event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.altKey && !event.metaKey;
  }
  const combo = eventToKeyCombo(event);
  if (!combo) return false;
  return combo.toLowerCase() === str.toLowerCase();
}

// Test key formats
assert(formatShortcutDisplay(' ') === 'Space', 'Space display format failed');
assert(formatShortcutDisplay('l') === 'L', 'L display format failed');
assert(formatShortcutDisplay('Ctrl+a') === 'Ctrl+A', 'Ctrl+a display format failed');
assert(formatShortcutDisplay('Ctrl+e') === 'Ctrl+E', 'Ctrl+e display format failed');
assert(formatShortcutDisplay('Delete') === 'Delete', 'Delete display format failed');

// Test matchesShortcut
assert(matchesShortcut({ key: ' ', code: 'Space', ctrlKey: false, altKey: false, metaKey: false }, ' '), 'Space shortcut matching failed');
assert(matchesShortcut({ key: 'l', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'l'), 'l shortcut matching failed');
assert(matchesShortcut({ key: 'L', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'l'), 'L case-insensitive matching failed');
assert(matchesShortcut({ key: 'a', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }, 'Ctrl+a'), 'Ctrl+a matching failed');
assert(matchesShortcut({ key: 'A', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }, 'Ctrl+a'), 'Ctrl+A matching failed');
assert(matchesShortcut({ key: 'e', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }, 'Ctrl+e'), 'Ctrl+e matching failed');
assert(matchesShortcut({ key: 'Delete', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'Delete'), 'Delete matching failed');
assert(matchesShortcut({ key: 'Backspace', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'Delete'), 'Backspace matching delete failed');

// Negative matching tests
assert(!matchesShortcut({ key: 'l', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }, 'l'), 'Ctrl+L should not match plain l');
assert(!matchesShortcut({ key: 'a', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }, 'Ctrl+a'), 'Plain a should not match Ctrl+a');

console.log('PASS: All Sprint 1 tests passed successfully!');
