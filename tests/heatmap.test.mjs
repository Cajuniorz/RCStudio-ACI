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
assert.deepEqual(forceRangeKN([{id:'M1'}],{M1:m}),{min:0,max:20});

const r={id:'M2',length:2,samples:[{x:0,N:4,Vy:0,Vz:0},{x:2,N:4,Vy:0,Vz:0}]};
assert.equal(stationForceKN(r,.1),4,'constant axial roof force is constant; no fake gradient');
assert.deepEqual(peakForceStation(r),{x:0,t:0,forceKN:4},'ties choose member i');
assert.equal(stationForceKN({samples:[{x:0,N:1,Vy:NaN,Vz:0}],length:1},0),null,'invalid sample must not paint');
assert.equal(peakForceStation({samples:[],length:2}),null);
assert.equal(forceRangeKN([{id:'M1'}],{}),null,'no result means no heatmap');
assert.equal(forceRangeKN([{id:'M1'}],{M1:{samples:[{x:0,N:0,Vy:0,Vz:0}],length:1}}).max,0);
console.log('PASS: station forces interpolate, invalid/missing results fail closed, peak position and range are consistent.');
