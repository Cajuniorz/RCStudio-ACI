import assert from 'node:assert/strict';
import {stationForceKN, forceRangeKN, peakForceStation} from '../static/heatmap.js';

const m={id:'M1',length:3,samples:[
 {x:0,N:-10,Vy:0,Vz:0},
 {x:1.5,N:-15,Vy:3,Vz:4},
 {x:3,N:-20,Vy:0,Vz:0}
]};
assert.equal(stationForceKN(m,0),10);
assert.equal(stationForceKN(m,.5),Math.hypot(15,3,4));
assert.equal(stationForceKN(m,1),20);
assert.equal(stationForceKN(m,.25),Math.hypot(12.5,1.5,2));
assert.deepEqual(peakForceStation(m),{x:3,t:1,forceKN:20});
assert.deepEqual(forceRangeKN([{id:'M1'}],{M1:m}),{min:10,max:20},'range spans the real station values instead of assuming a zero floor');

const r={id:'M2',length:2,samples:[{x:0,N:4,Vy:0,Vz:0},{x:2,N:4,Vy:0,Vz:0}]};
assert.equal(stationForceKN(r,.1),4,'constant axial roof force is constant; no fake gradient');
assert.deepEqual(peakForceStation(r),{x:0,t:0,forceKN:4},'ties choose member i');
assert.equal(stationForceKN({samples:[{x:0,N:1,Vy:NaN,Vz:0}],length:1},0),null,'invalid sample must not paint');
assert.equal(peakForceStation({samples:[],length:2}),null);
assert.equal(forceRangeKN([{id:'M1'}],{}),null,'no result means no heatmap');
assert.equal(forceRangeKN([{id:'M1'}],{M1:{samples:[{x:0,N:0,Vy:0,Vz:0}],length:1}}).max,0);
console.log('PASS: station forces interpolate, invalid/missing results fail closed, peak position and range are consistent.');

// --- scale-selection API (0.5.6): keys, per-member range and per-group range ---
import {stationValueKN,memberRangeKN,rangeKN,rangeByGroupKN,peakStation,memberGroupOf,GROUP_LABELS} from '../static/heatmap.js';

const beam={id:'B1',kind:'beam',length:4,samples:[
 {x:0,N:0,Vy:12,Vz:0,Mz:0},
 {x:2,N:0,Vy:0,Vz:0,Mz:30},
 {x:4,N:0,Vy:-12,Vz:0,Mz:0}
]};
const col={id:'C1',kind:'column',length:3,samples:[
 {x:0,N:-500,Vy:2,Vz:0,Mz:1},
 {x:3,N:-100,Vy:0,Vz:0,Mz:0}
]};
const purlin={id:'P1',kind:'roof',roofRole:'purlin',length:5,samples:[
 {x:0,N:-6,Vy:1,Vz:0,Mz:2},
 {x:5,N:-18,Vy:1,Vz:0,Mz:9}
]};

assert.equal(stationValueKN(beam,0.5,'Mz'),30,'Mz interpolates to midspan peak');
assert.equal(Math.round(stationValueKN(beam,0.25,'Vy')*100)/100,6,'Vy interpolates linearly');
assert.equal(stationValueKN(col,0,'N'),500,'axial absolute value at i');
assert.equal(stationValueKN(beam,0.5,'resultant'),0,'resultant is the vector magnitude, not a sum of components');
assert.deepEqual(memberRangeKN(purlin,'N'),{min:6,max:18},'member range covers its own span');
assert.deepEqual(memberRangeKN(purlin,'Mz'),{min:2,max:9});
assert.equal(peakStation(col,'N').value,500,'peak picks the largest station');
assert.equal(peakStation(col,'N').t,0);
assert.equal(peakStation(purlin,'Mz').t,1);

const members=[beam,col,purlin];
const results={B1:beam,C1:col,P1:purlin};
const global=rangeKN(members,results,'N');
assert.equal(global.max,500,'global range is dominated by the column');
assert.equal(global.min,0,'global range starts at zero');
const groups=rangeByGroupKN(members,results,'N',memberGroupOf);
assert.equal(groups.column.max,500);
assert.equal(groups.roof.max,18,'roof members get their own scale instead of being flattened by columns');
assert.equal(groups.beam.max,0);
assert.equal(groups.beam.min,0);
assert.equal(memberGroupOf({kind:'roof',roofRole:'purlin'}),'roof');
assert.equal(GROUP_LABELS.roof,'หลังคา/แป');
assert.equal(rangeKN(members,{},'N'),null,'no results means no scale');
assert.equal(rangeByGroupKN(members,{},'N',memberGroupOf),null);
assert.equal(memberRangeKN({samples:[{x:0,N:NaN,Vy:0,Vz:0}],length:1},'N'),null,'invalid samples fail closed');
assert.equal(stationValueKN(beam,2,'N'),0,'t is a normalised fraction and is clamped to 0..1');
assert.equal(stationValueKN(beam,NaN,'N'),null,'non-finite t fails closed');
assert.equal(stationValueKN(beam,0.5,'bogus'),null,'unknown key fails closed');
console.log('PASS: keys, per-member range, per-group range, peak and fail-closed guards');
