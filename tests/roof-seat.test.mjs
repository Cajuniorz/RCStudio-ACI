import assert from 'node:assert/strict';
import {roofSeatElevation} from '../static/building.js';

// RC roof beam centerline 9 m; 450 mm deep RC beam and 125 mm steel eaves.
const seat=roofSeatElevation(9,0.45,0.125);
assert.equal(seat,9.2875);
assert.ok(seat-0.125/2 >= 9+0.45/2,'steel eaves underside must clear RC roof beam top');
assert.throws(()=>roofSeatElevation(9,0,0.125),/depth/i);
console.log('PASS: roof eaves are seated on RC beam, not inside it.');
