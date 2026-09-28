import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {unit,toDisplay,toCanonical} from './units.js';
import {catalogs,memberRecord,slabRecord,foundationRecord,blankProject,roofSeatElevation} from './building.js';
import {groupLevels,nearestPlanNode,validateMemberEndpoints,planNodeDraft,snapPlanPoint,splitBeamAtDistance} from './plan.js';

const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
const KEY='rcstudio-v1', dofs=['DX','DY','DZ','RX','RY','RZ'];
let model, result=null, designResult=null, revision=0, tab='nodes', selected=null, history=[], busy=false;
let viewMode='3d',planLevelY=null,activeTool='select',beamDrag=null,pointerStart=null;
const PLAN_LEVEL_TOLERANCE=1e-5;
const memberDraft={b:.25,h:.45};
const empty=blankProject;
const nextId=(prefix,rows)=>{let i=1;while(rows.some(r=>r.id===prefix+i))i++;return prefix+i;};
const num=value=>value.trim()===''?null:Number(value);
const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function status(message,type=''){$('status').textContent=message;$('status').className=type;}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(model));$('saveStatus').textContent='บันทึกอัตโนมัติแล้ว · '+new Date().toLocaleTimeString('th-TH')+' · ควรเก็บไฟล์สำรอง';}catch{$('saveStatus').textContent='บันทึกอัตโนมัติไม่ได้ กรุณาบันทึกไฟล์';}}
function mutate(fn){cancelInteraction(false);const previous=clone(model);fn();const caps={nodes:500,members:1000,nodalLoads:1000,memberLoads:1000,combinations:16,slabs:100,foundations:100};if(Object.entries(caps).some(([key,max])=>model[key].length>max)||model.name.length>120||model.combinations.some(c=>c.name.length>120)||[...model.slabs,...model.foundations].some(e=>e.note.length>500)){model=previous;render();status('เกินขีดจำกัด: 500 โหนด / 1000 สมาชิก / 1000 แรงต่อประเภท / 16 ชุดน้ำหนัก / ชื่อ 120 ตัวอักษร','error');return;}history.push(previous);if(history.length>40)history.shift();revision++;result=null;status('โมเดลเปลี่ยนแล้ว · ต้องวิเคราะห์ใหม่');persist();render();}
function options(select,values,current){select.replaceChildren();for(const v of values){const option=el('option',v);option.value=v;select.append(option);}if(values.includes(current))select.value=current;}
function grid(sx=4,sz=4,nx=1,nz=1,height=3,floors=1,withLoads=false){
 const p=empty();p.name=withLoads?'ตัวอย่างศึกษา · อาคาร 1 ชั้น':'กริดอาคารใหม่';p.selfWeight=true;
 const ids=new Map();for(let f=0;f<=floors;f++)for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const id='N'+(p.nodes.length+1);ids.set(`${ix},${iz},${f}`,id);p.nodes.push({id,x:ix*sx,y:f*height,z:iz*sz,restraints:Array(6).fill(f===0)});
 }
 const add=(i,j,column)=>p.members.push({...memberRecord('M'+(p.members.length+1),i,j,column?'column':'beam'),b:column?.3:.25,h:column?.3:.45});
 for(let f=1;f<=floors;f++)for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const n=ids.get(`${ix},${iz},${f}`);add(ids.get(`${ix},${iz},${f-1}`),n,true);
  if(ix<nx)add(n,ids.get(`${ix+1},${iz},${f}`),false);
  if(iz<nz)add(n,ids.get(`${ix},${iz+1},${f}`),false);
 }
 if(withLoads){for(const m of p.members){const a=p.nodes.find(n=>n.id===m.i),b=p.nodes.find(n=>n.id===m.j);if(a.y===b.y)p.memberLoads.push({member:m.id,case:'L',qx:0,qy:-5,qz:0});}}
 return p;
}

function addRoofGable(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel) {
 const totalX = nx * sx;
 const totalZ = nz * sz;
 const zMid = totalZ / 2.0;
 const yRoof = floors * height;
 const yAs = roofSeatElevation(yRoof, 0.45, 0.125);
 const slope = roof_h / (zMid > 0 ? zMid : 2.0);
 const yTip = yAs - overhang * slope;
 const yRidge = yAs + roof_h;

 const asColNodes = new Map();
 for (let iz = 0; iz <= nz; iz++) {
  for (let ix = 0; ix <= nx; ix++) {
   const topCol = ids.get(`${ix},${iz},${floors}`);
   const asNid = 'N' + (p.nodes.length + 1);
   asColNodes.set(`${ix},${iz}`, asNid);
   p.nodes.push({ id: asNid, x: Math.round(ix * sx * 1000) / 1000, y: Math.round(yAs * 1000) / 1000, z: Math.round(iz * sz * 1000) / 1000, restraints: Array(6).fill(false) });
   addSteel(topCol, asNid, 0.125, 0.125, 2.5e-3, 5e-6, 5e-6, 1e-7, 'AS');
  }
 }

 const rafDivisions = 5;
 const numRaf = nx * rafDivisions + 1;
 const dxRaf = totalX / (numRaf - 1);

 const asLeftNodes = [];
 const asRightNodes = [];
 const ridgeNodes = [];
 const purlinLNodes = [];
 const purlinRNodes = [];
 const tipLNodes = [];
 const tipRNodes = [];

 for (let k = 0; k < numRaf; k++) {
  const x = Math.round(k * dxRaf * 1000) / 1000;
  const isCol = (k % rafDivisions === 0);
  const ix = Math.floor(k / rafDivisions);

  let asL;
  if (isCol && asColNodes.has(`${ix},0`)) {
   asL = asColNodes.get(`${ix},0`);
  } else {
   asL = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: asL, x, y: Math.round(yAs * 1000) / 1000, z: 0, restraints: Array(6).fill(false) });
  }
  asLeftNodes.push(asL);

  let asR;
  if (isCol && asColNodes.has(`${ix},${nz}`)) {
   asR = asColNodes.get(`${ix},${nz}`);
  } else {
   asR = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: asR, x, y: Math.round(yAs * 1000) / 1000, z: Math.round(totalZ * 1000) / 1000, restraints: Array(6).fill(false) });
  }
  asRightNodes.push(asR);

  const tipL = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: tipL, x, y: Math.round(yTip * 1000) / 1000, z: Math.round(-overhang * 1000) / 1000, restraints: Array(6).fill(false) });
  tipLNodes.push(tipL);

  const tipR = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: tipR, x, y: Math.round(yTip * 1000) / 1000, z: Math.round((totalZ + overhang) * 1000) / 1000, restraints: Array(6).fill(false) });
  tipRNodes.push(tipR);

  const pl = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: pl, x, y: Math.round((yAs + 0.5 * roof_h) * 1000) / 1000, z: Math.round((0.5 * zMid) * 1000) / 1000, restraints: Array(6).fill(false) });
  purlinLNodes.push(pl);

  const pr = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: pr, x, y: Math.round((yAs + 0.5 * roof_h) * 1000) / 1000, z: Math.round((totalZ - 0.5 * zMid) * 1000) / 1000, restraints: Array(6).fill(false) });
  purlinRNodes.push(pr);

  const rg = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: rg, x, y: Math.round(yRidge * 1000) / 1000, z: Math.round(zMid * 1000) / 1000, restraints: Array(6).fill(false) });
  ridgeNodes.push(rg);

  addSteel(tipL, asL, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(asL, pl, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(pl, rg, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');

  addSteel(rg, pr, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(pr, asR, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(asR, tipR, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');

  if (isCol) {
   const dMid = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: dMid, x, y: Math.round(yAs * 1000) / 1000, z: Math.round(zMid * 1000) / 1000, restraints: Array(6).fill(false) });
   addSteel(asL, dMid, 0.08, 0.10, 1.2e-3, 1.0e-6, 2.5e-6, 3e-8, 'AS');
   addSteel(dMid, asR, 0.08, 0.10, 1.2e-3, 1.0e-6, 2.5e-6, 3e-8, 'AS');
   addSteel(dMid, rg, 0.08, 0.08, 1.4e-3, 1.2e-6, 1.2e-6, 4e-8, 'kingpost');
  }
 }

 for (let k = 0; k < numRaf - 1; k++) {
  addSteel(asLeftNodes[k], asLeftNodes[k + 1], 0.10, 0.125, 1.8e-3, 1.8e-6, 4.0e-6, 5e-8, 'AS');
  addSteel(asRightNodes[k], asRightNodes[k + 1], 0.10, 0.125, 1.8e-3, 1.8e-6, 4.0e-6, 5e-8, 'AS');
 }

 for (let k = 0; k < numRaf - 1; k++) {
  addSteel(ridgeNodes[k], ridgeNodes[k + 1], 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'ridge');
 }

 for (let k = 0; k < numRaf - 1; k++) {
  const pL = addSteel(purlinLNodes[k], purlinLNodes[k + 1], 0.05, 0.10, 7e-4, 6e-7, 1.8e-6, 4e-8, 'purlin');
  p.memberLoads.push({ member: pL, case: 'D', axes: 'local', qx: 0, qy: -0.25, qz: 0 });
  p.memberLoads.push({ member: pL, case: 'L', axes: 'local', qx: 0, qy: -0.35, qz: 0 });

  const pR = addSteel(purlinRNodes[k], purlinRNodes[k + 1], 0.05, 0.10, 7e-4, 6e-7, 1.8e-6, 4e-8, 'purlin');
  p.memberLoads.push({ member: pR, case: 'D', axes: 'local', qx: 0, qy: -0.25, qz: 0 });
  p.memberLoads.push({ member: pR, case: 'L', axes: 'local', qx: 0, qy: -0.35, qz: 0 });

  addSteel(tipLNodes[k], tipLNodes[k + 1], 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
  addSteel(tipRNodes[k], tipRNodes[k + 1], 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
 }
}

function addRoofHip(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel) {
 const totalX = nx * sx;
 const totalZ = nz * sz;
 const zMid = totalZ / 2.0;
 const yRoof = floors * height;
 const yAs = roofSeatElevation(yRoof, 0.45, 0.125);
 const yRidge = yAs + roof_h;

 const hipIndent = Math.min(zMid, totalX / 3.0);
 const xApex1 = Math.round(hipIndent * 1000) / 1000;
 const xApex2 = Math.round((totalX - hipIndent) * 1000) / 1000;
 const slope = roof_h / (zMid > 0 ? zMid : 2.0);
 const yTip = yAs - overhang * slope;

 const a1Id = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: a1Id, x: xApex1, y: Math.round(yRidge * 1000) / 1000, z: Math.round(zMid * 1000) / 1000, restraints: Array(6).fill(false) });
 const a2Id = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: a2Id, x: xApex2, y: Math.round(yRidge * 1000) / 1000, z: Math.round(zMid * 1000) / 1000, restraints: Array(6).fill(false) });

 if (xApex1 !== xApex2) {
  addSteel(a1Id, a2Id, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'ridge');
 }

 const asColNodes = new Map();
 for (let iz = 0; iz <= nz; iz++) {
  for (let ix = 0; ix <= nx; ix++) {
   const topCol = ids.get(`${ix},${iz},${floors}`);
   const asNid = 'N' + (p.nodes.length + 1);
   asColNodes.set(`${ix},${iz}`, asNid);
   p.nodes.push({ id: asNid, x: Math.round(ix * sx * 1000) / 1000, y: Math.round(yAs * 1000) / 1000, z: Math.round(iz * sz * 1000) / 1000, restraints: Array(6).fill(false) });
   addSteel(topCol, asNid, 0.125, 0.125, 2.5e-3, 5e-6, 5e-6, 1e-7, 'AS');
  }
 }

 const tip0 = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: tip0, x: Math.round(-overhang * 1000) / 1000, y: Math.round(yTip * 1000) / 1000, z: Math.round(-overhang * 1000) / 1000, restraints: Array(6).fill(false) });
 const tip1 = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: tip1, x: Math.round(-overhang * 1000) / 1000, y: Math.round(yTip * 1000) / 1000, z: Math.round((totalZ + overhang) * 1000) / 1000, restraints: Array(6).fill(false) });
 const tip2 = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: tip2, x: Math.round((totalX + overhang) * 1000) / 1000, y: Math.round(yTip * 1000) / 1000, z: Math.round(-overhang * 1000) / 1000, restraints: Array(6).fill(false) });
 const tip3 = 'N' + (p.nodes.length + 1);
 p.nodes.push({ id: tip3, x: Math.round((totalX + overhang) * 1000) / 1000, y: Math.round(yTip * 1000) / 1000, z: Math.round((totalZ + overhang) * 1000) / 1000, restraints: Array(6).fill(false) });

 const c0 = asColNodes.get('0,0');
 const c1 = asColNodes.get(`0,${nz}`);
 const c2 = asColNodes.get(`${nx},0`);
 const c3 = asColNodes.get(`${nx},${nz}`);

 addSteel(tip0, c0, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');
 addSteel(c0, a1Id, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');

 addSteel(tip1, c1, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');
 addSteel(c1, a1Id, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');

 addSteel(tip2, c2, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');
 addSteel(c2, a2Id, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');

 addSteel(tip3, c3, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');
 addSteel(c3, a2Id, 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'hip');

 const rafDivisions = 5;
 const numRaf = nx * rafDivisions + 1;
 const dxRaf = totalX / (numRaf - 1);
 const asLNodes = [], asRNodes = [];

 for (let k = 0; k < numRaf; k++) {
  const x = Math.round(k * dxRaf * 1000) / 1000;
  const isCol = (k % rafDivisions === 0);
  const ix = Math.floor(k / rafDivisions);

  let asL = (isCol && asColNodes.has(`${ix},0`)) ? asColNodes.get(`${ix},0`) : null;
  if (!asL) {
   asL = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: asL, x, y: Math.round(yAs * 1000) / 1000, z: 0, restraints: Array(6).fill(false) });
  }
  asLNodes.push(asL);

  let asR = (isCol && asColNodes.has(`${ix},${nz}`)) ? asColNodes.get(`${ix},${nz}`) : null;
  if (!asR) {
   asR = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: asR, x, y: Math.round(yAs * 1000) / 1000, z: Math.round(totalZ * 1000) / 1000, restraints: Array(6).fill(false) });
  }
  asRNodes.push(asR);

  if (k > 0 && k < numRaf - 1) {
   const tL = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: tL, x, y: Math.round(yTip * 1000) / 1000, z: Math.round(-overhang * 1000) / 1000, restraints: Array(6).fill(false) });
   const tR = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: tR, x, y: Math.round(yTip * 1000) / 1000, z: Math.round((totalZ + overhang) * 1000) / 1000, restraints: Array(6).fill(false) });

   const targetApex = (x <= totalX / 2.0) ? a1Id : a2Id;
   addSteel(tL, asL, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
   addSteel(asL, targetApex, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
   addSteel(tR, asR, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
   addSteel(asR, targetApex, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  }
 }

 for (let k = 0; k < numRaf - 1; k++) {
  addSteel(asLNodes[k], asLNodes[k + 1], 0.10, 0.125, 1.8e-3, 1.8e-6, 4.0e-6, 5e-8, 'AS');
  addSteel(asRNodes[k], asRNodes[k + 1], 0.10, 0.125, 1.8e-3, 1.8e-6, 4.0e-6, 5e-8, 'AS');
 }

 addSteel(tip0, tip1, 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
 addSteel(tip1, tip3, 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
 addSteel(tip3, tip2, 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
 addSteel(tip2, tip0, 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
}

function addRoofLeanTo(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel) {
 const totalX = nx * sx;
 const totalZ = nz * sz;
 const yRoof = floors * height;
 const yAsLow = roofSeatElevation(yRoof, 0.45, 0.125);
 const yHigh = yAsLow + roof_h;
 const slope = roof_h / (totalZ > 0 ? totalZ : 4.0);
 const yTipHigh = yHigh + overhang * slope;
 const yTipLow = yAsLow - overhang * slope;

 const colHighNodes = new Map();
 const colLowNodes = new Map();
 for (let ix = 0; ix <= nx; ix++) {
  const topColLow = ids.get(`${ix},${nz},${floors}`);
  const asLowNid = 'N' + (p.nodes.length + 1);
  colLowNodes.set(ix, asLowNid);
  p.nodes.push({ id: asLowNid, x: Math.round(ix * sx * 1000) / 1000, y: Math.round(yAsLow * 1000) / 1000, z: Math.round(totalZ * 1000) / 1000, restraints: Array(6).fill(false) });
  addSteel(topColLow, asLowNid, 0.125, 0.125, 2.5e-3, 5e-6, 5e-6, 1e-7, 'AS');

  const topColHigh = ids.get(`${ix},0,${floors}`);
  const asHighNid = 'N' + (p.nodes.length + 1);
  colHighNodes.set(ix, asHighNid);
  p.nodes.push({ id: asHighNid, x: Math.round(ix * sx * 1000) / 1000, y: Math.round(yHigh * 1000) / 1000, z: 0, restraints: Array(6).fill(false) });
  addSteel(topColHigh, asHighNid, 0.08, 0.08, 1.4e-3, 1.2e-6, 1.2e-6, 4e-8, 'kingpost');
 }

 const rafDivisions = 5;
 const numRaf = nx * rafDivisions + 1;
 const dxRaf = totalX / (numRaf - 1);

 const highRidgeNodes = [], midPurlinNodes = [], lowAsNodes = [];
 const tipHighNodes = [], tipLowNodes = [];

 for (let k = 0; k < numRaf; k++) {
  const x = Math.round(k * dxRaf * 1000) / 1000;
  const isCol = (k % rafDivisions === 0);
  const ix = Math.floor(k / rafDivisions);

  let highId = (isCol && colHighNodes.has(ix)) ? colHighNodes.get(ix) : null;
  if (!highId) {
   highId = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: highId, x, y: Math.round(yHigh * 1000) / 1000, z: 0, restraints: Array(6).fill(false) });
  }
  highRidgeNodes.push(highId);

  let lowId = (isCol && colLowNodes.has(ix)) ? colLowNodes.get(ix) : null;
  if (!lowId) {
   lowId = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: lowId, x, y: Math.round(yAsLow * 1000) / 1000, z: Math.round(totalZ * 1000) / 1000, restraints: Array(6).fill(false) });
  }
  lowAsNodes.push(lowId);

  const tipHighId = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: tipHighId, x, y: Math.round(yTipHigh * 1000) / 1000, z: Math.round(-overhang * 1000) / 1000, restraints: Array(6).fill(false) });
  tipHighNodes.push(tipHighId);

  const purlinMidId = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: purlinMidId, x, y: Math.round((yAsLow + 0.5 * roof_h) * 1000) / 1000, z: Math.round(0.5 * totalZ * 1000) / 1000, restraints: Array(6).fill(false) });
  midPurlinNodes.push(purlinMidId);

  const tipLowId = 'N' + (p.nodes.length + 1);
  p.nodes.push({ id: tipLowId, x, y: Math.round(yTipLow * 1000) / 1000, z: Math.round((totalZ + overhang) * 1000) / 1000, restraints: Array(6).fill(false) });
  tipLowNodes.push(tipLowId);

  addSteel(tipHighId, highId, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(highId, purlinMidId, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(purlinMidId, lowId, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
  addSteel(lowId, tipLowId, 0.08, 0.125, 1.4e-3, 1.2e-6, 3.5e-6, 4e-8, 'rafter');
 }

 for (let k = 0; k < numRaf - 1; k++) {
  addSteel(highRidgeNodes[k], highRidgeNodes[k + 1], 0.10, 0.15, 1.6e-3, 1.5e-6, 5.0e-6, 6e-8, 'ridge');
  addSteel(lowAsNodes[k], lowAsNodes[k + 1], 0.10, 0.125, 1.8e-3, 1.8e-6, 4.0e-6, 5e-8, 'AS');
 }

 for (let k = 0; k < numRaf - 1; k++) {
  const pMid = addSteel(midPurlinNodes[k], midPurlinNodes[k + 1], 0.05, 0.10, 7e-4, 6e-7, 1.8e-6, 4e-8, 'purlin');
  p.memberLoads.push({ member: pMid, case: 'D', axes: 'local', qx: 0, qy: -0.25, qz: 0 });
  p.memberLoads.push({ member: pMid, case: 'L', axes: 'local', qx: 0, qy: -0.35, qz: 0 });

  addSteel(tipHighNodes[k], tipHighNodes[k + 1], 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
  addSteel(tipLowNodes[k], tipLowNodes[k + 1], 0.03, 0.15, 6e-4, 4e-7, 1.2e-6, 3e-8, 'purlin');
 }
}

function generateFullBuilding(opts = {}) {
 const sx = opts.sx ?? 4.5;
 const sz = opts.sz ?? 4.0;
 const nx = opts.nx ?? 2;
 const nz = opts.nz ?? 1;
 const height = opts.height ?? 3.0;
 const floors = opts.floors ?? 3;
 const roofStyle = opts.roofStyle ?? 'gable';
 const overhang = opts.overhang ?? 0.90;
 const slabType = opts.slabType ?? 'two_way';
 const hasStaircase = opts.hasStaircase ?? true;
 const footingType = opts.footingType ?? 'pile_cap';

 const p = empty();
 const roofStyleNames = { gable: 'ทรงจั่ว', hip: 'ทรงปั้นหยา', lean_to: 'ทรงโมเดิร์น' };
 const slabTypeNames = { two_way: 'พื้นสองทาง', one_way: 'พื้นทางเดียว' };
 p.name = `อาคาร คสล. ${floors} ชั้น (${roofStyleNames[roofStyle]||'จั่ว'} + ${slabTypeNames[slabType]||'พื้นสองทาง'} + บันได คสล. + เสาเข็ม)`;
 p.selfWeight = true;
 p.designBasis = { fc_mpa: 23.5, fy_mpa: 392, fyt_mpa: 235, cover_mm: 40, agg_mm: 20, stirrup_mm: 9, fy_steel_mpa: 245 };
 p.combinations = [{ name: 'U1', D: 1.4, L: 0, W: 0 }, { name: 'U2', D: 1.2, L: 1.6, W: 0 }, { name: 'Service', D: 1.0, L: 1.0, W: 0 }];
 p.stairs = [];

 const ids = new Map();
 for (let f = 0; f <= floors; f++) {
  for (let iz = 0; iz <= nz; iz++) {
   for (let ix = 0; ix <= nx; ix++) {
    const id = 'N' + (p.nodes.length + 1);
    ids.set(`${ix},${iz},${f}`, id);
    p.nodes.push({ id, x: Math.round(ix * sx * 1000) / 1000, y: Math.round(f * height * 1000) / 1000, z: Math.round(iz * sz * 1000) / 1000, restraints: Array(6).fill(f === 0) });
   }
  }
 }

 for (let iz = 0; iz <= nz; iz++) {
  for (let ix = 0; ix <= nx; ix++) {
   const baseNode = ids.get(`${ix},${iz},0`);
   if (footingType === 'pile_cap') {
    p.foundations.push({
     ...foundationRecord('F' + (p.foundations.length + 1)),
     type: 'pile_cap', nodes: [baseNode], bx: 1.4, bz: 1.4, depth: 0.5, embedment: 1.2,
     qa: 200, pileCount: 4, pileCapacity: 250, pileLength: 12.0, mode: 'ideal_support',
     note: 'ฐานหัวเสาเข็ม 4 ต้น ∅0.25m ลึก 12m'
    });
   } else {
    p.foundations.push({
     ...foundationRecord('F' + (p.foundations.length + 1)),
     type: 'isolated', nodes: [baseNode], bx: 1.5, bz: 1.5, depth: 0.45, embedment: 1.0,
     qa: 150, pileCount: 0, mode: 'ideal_support', note: 'ฐานแผ่เดี่ยว คสล. 1.5×1.5 m'
    });
   }
  }
 }

 const beamsX = new Map(), beamsZ = new Map();
 const addRC = (i, j, kind, b, h, roofRole = null) => {
  const id = 'M' + (p.members.length + 1);
  p.members.push({ ...memberRecord(id, i, j, kind), b, h, sectionType: 'rc_rect', roofRole, behavior: 'frame' });
  return id;
 };
 const addSteel = (i, j, b, h, A, Iy, Iz, J, roofRole = 'rafter') => {
  const id = 'M' + (p.members.length + 1);
  p.members.push({ ...memberRecord(id, i, j, 'roof'), b, h, sectionType: 'steel_custom', A, Iy, Iz, J, roofRole, roofType: roofStyle, behavior: 'frame' });
  return id;
 };

 for (let f = 1; f <= floors; f++) {
  const isRoof = (f === floors);
  const colB = (f === 1) ? 0.35 : 0.30, colH = (f === 1) ? 0.35 : 0.30;
  const beamB = 0.25, beamH = 0.45;

  for (let iz = 0; iz <= nz; iz++) {
   for (let ix = 0; ix <= nx; ix++) {
    addRC(ids.get(`${ix},${iz},${f - 1}`), ids.get(`${ix},${iz},${f}`), 'column', colB, colH);
   }
  }

  for (let iz = 0; iz <= nz; iz++) {
   for (let ix = 0; ix < nx; ix++) {
    const mid = addRC(ids.get(`${ix},${iz},${f}`), ids.get(`${ix + 1},${iz},${f}`), 'beam', beamB, beamH, null);
    beamsX.set(`${ix},${iz},${f}`, mid);
    if (isRoof) {
     p.memberLoads.push({ member: mid, case: 'D', axes: 'local', qx: 0, qy: -1.0, qz: 0 });
     p.memberLoads.push({ member: mid, case: 'L', axes: 'local', qx: 0, qy: -0.6, qz: 0 });
    }
   }
  }

  for (let ix = 0; ix <= nx; ix++) {
   for (let iz = 0; iz < nz; iz++) {
    const mid = addRC(ids.get(`${ix},${iz},${f}`), ids.get(`${ix},${iz + 1},${f}`), 'beam', beamB, beamH, null);
    beamsZ.set(`${ix},${iz},${f}`, mid);
    if (isRoof) {
     p.memberLoads.push({ member: mid, case: 'D', axes: 'local', qx: 0, qy: -1.0, qz: 0 });
     p.memberLoads.push({ member: mid, case: 'L', axes: 'local', qx: 0, qy: -0.6, qz: 0 });
    }
   }
  }
 }

 // Intermediate Slabs
 for (let f = 1; f < floors; f++) {
  for (let ix = 0; ix < nx; ix++) {
   for (let iz = 0; iz < nz; iz++) {
    const sid = 'S' + (p.slabs.length + 1);
    const c0 = ids.get(`${ix},${iz},${f}`);
    const c1 = ids.get(`${ix + 1},${iz},${f}`);
    const c2 = ids.get(`${ix + 1},${iz + 1},${f}`);
    const c3 = ids.get(`${ix},${iz + 1},${f}`);

    const sup1 = beamsX.get(`${ix},${iz},${f}`);
    const sup2 = beamsX.get(`${ix},${iz + 1},${f}`);
    const sup3 = beamsZ.get(`${ix},${iz},${f}`);
    const sup4 = beamsZ.get(`${ix + 1},${iz},${f}`);

    if (slabType === 'two_way') {
     p.slabs.push({
      ...slabRecord(sid),
      nodes: [c0, c1, c2, c3],
      type: 'two_way',
      thickness: 0.12,
      weightMode: 'volume',
      dead: 1.0,
      live: 2.0,
      mode: 'two_way_load',
      support1: sup1,
      support2: sup2,
      support3: sup3,
      support4: sup4,
      note: `พื้น คสล. สองทาง (Two-Way) ชั้น ${f + 1} หนา 12cm`
     });
    } else {
     p.slabs.push({
      ...slabRecord(sid),
      nodes: [c0, c1, c2, c3],
      type: 'one_way',
      thickness: 0.12,
      weightMode: 'volume',
      dead: 1.0,
      live: 2.0,
      mode: 'one_way_load',
      support1: sup1,
      support2: sup2,
      note: `พื้น คสล. ทางเดียว ชั้น ${f + 1} หนา 12cm`
     });
    }
   }
  }
 }

 // RC Staircase if selected
 if (hasStaircase) {
  for (let f = 1; f < floors; f++) {
   const yBottom = (f - 1) * height;
   const yMid = yBottom + height / 2.0;
   const landZ = sz / 2.0;
   const nL1 = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: nL1, x: 0, y: Math.round(yMid * 1000) / 1000, z: Math.round(landZ * 1000) / 1000, restraints: Array(6).fill(false) });
   const nL2 = 'N' + (p.nodes.length + 1);
   p.nodes.push({ id: nL2, x: 1.2, y: Math.round(yMid * 1000) / 1000, z: Math.round(landZ * 1000) / 1000, restraints: Array(6).fill(false) });

   // Landing beam (คานชานพัก - ST)
   addRC(nL1, nL2, 'beam', 0.20, 0.40, 'ST');

   // Flight stringers / inclined waist slab elements
   const bottomNode = ids.get(`0,0,${f - 1}`);
   const topNode = ids.get(`0,${nz},${f}`);
   addRC(bottomNode, nL1, 'beam', 0.20, 0.35, 'ST');
   addRC(nL2, topNode, 'beam', 0.20, 0.35, 'ST');

   p.stairs.push({
    id: 'ST' + (p.stairs.length + 1),
    span: sz,
    width: 1.2,
    thickness: 0.15,
    riser: 0.175,
    tread: 0.25,
    live: 3.0,
    label: `ST${f}`
   });
  }
 }

 // Steel Roof Structure
 const roof_h = 1.5;
 if (roofStyle === 'hip') {
  addRoofHip(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel);
 } else if (roofStyle === 'lean_to') {
  addRoofLeanTo(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel);
 } else {
  addRoofGable(p, ids, nx, nz, sx, sz, height, floors, roof_h, overhang, addSteel);
 }

 return p;
}

function threeStoryBuilding(sx=4.5,sz=4.0,nx=2,nz=1,height=3.0){
 return generateFullBuilding({ sx, sz, nx, nz, height, floors: 3, roofStyle: 'gable', overhang: 0.90, slabType: 'two_way', hasStaircase: true, footingType: 'pile_cap' });
}

function warehouse(spanX=12,bayZ=5,numBaysZ=3,colH=4.5,trussH=1.8,panels=4,centerCol=false){
 const p=empty();p.name='อาคารโรงงาน + โครงถักเหล็ก ACI';p.selfWeight=true;
 p.designBasis={fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9,fy_steel_mpa:245};
 p.combinations=[{name:'U1',D:1.4,L:0,W:0},{name:'U2',D:1.2,L:1.6,W:0},{name:'Service',D:1,L:1,W:0}];
 const totalPanels=panels*2,dx=spanX/totalPanels,nodeMap=new Map();
 const getNode=(key,x,y,z,isBase=false)=>{
  if(nodeMap.has(key))return nodeMap.get(key);
  const id='N'+(p.nodes.length+1);
  p.nodes.push({id,x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000,z:Math.round(z*1000)/1000,restraints:Array(6).fill(isBase)});
  nodeMap.set(key,id);return id;
 };
 const addRC=(i,j,kind,b,h)=>{const id='M'+(p.members.length+1);p.members.push({...memberRecord(id,i,j,kind),b,h,sectionType:'rc_rect',behavior:'frame'});return id;};
 const addSteel=(i,j,A=0.0016,Iy=1.5e-6,Iz=1.5e-6,J=1e-7)=>{const id='M'+(p.members.length+1);p.members.push({...memberRecord(id,i,j,'roof'),sectionType:'steel_custom',A,Iy,Iz,J,roofType:'custom',behavior:'frame'});return id;};
 for(let iz=0;iz<=numBaysZ;iz++){
  const z=iz*bayZ;
  const bL=getNode(`bL_${iz}`,0,0,z,true),tL=getNode(`tL_${iz}`,0,colH,z,false);addRC(bL,tL,'column',0.35,0.35);
  const bR=getNode(`bR_${iz}`,spanX,0,z,true),tR=getNode(`tR_${iz}`,spanX,colH,z,false);addRC(bR,tR,'column',0.35,0.35);
  let bC,tC;if(centerCol){bC=getNode(`bC_${iz}`,spanX/2,0,z,true);tC=getNode(`tC_${iz}`,spanX/2,colH,z,false);addRC(bC,tC,'column',0.35,0.35);}
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bL],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bR],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  if(centerCol)p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bC],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  const botNodes=[],topNodes=[];
  for(let k=0;k<=totalPanels;k++){
   const x=k*dx;
   let botId=k===0?tL:k===totalPanels?tR:centerCol&&k===panels?tC:getNode(`tr_bot_${iz}_${k}`,x,colH,z,false);botNodes.push(botId);
   const pitchFactor=1.0-Math.abs(2*k/totalPanels-1.0);
   const yTop=colH+(k===0||k===totalPanels?0:trussH*pitchFactor);
   let topId=k===0?tL:k===totalPanels?tR:getNode(`tr_top_${iz}_${k}`,x,yTop,z,false);topNodes.push(topId);
   if(k>0&&k<totalPanels){
    p.nodalLoads.push({node:topId,case:'D',fx:0,fy:-2.5,fz:0,mx:0,my:0,mz:0});
    p.nodalLoads.push({node:topId,case:'L',fx:0,fy:-4.0,fz:0,mx:0,my:0,mz:0});
   }
  }
  for(let k=0;k<totalPanels;k++)addSteel(botNodes[k],botNodes[k+1],0.0016,1.5e-6,1.5e-6,1e-7);
  for(let k=0;k<totalPanels;k++)if(topNodes[k]!==topNodes[k+1])addSteel(topNodes[k],topNodes[k+1],0.0018,2e-6,2e-6,1.2e-7);
  for(let k=1;k<totalPanels;k++){
   if(botNodes[k]!==topNodes[k])addSteel(botNodes[k],topNodes[k],0.0010,8e-7,8e-7,5e-8);
   if(k<panels)addSteel(botNodes[k],topNodes[k+1],0.0010,8e-7,8e-7,5e-8);
   else if(k>panels)addSteel(botNodes[k],topNodes[k-1],0.0010,8e-7,8e-7,5e-8);
  }
 }
 for(let iz=0;iz<numBaysZ;iz++){
  addRC(getNode(`tL_${iz}`),getNode(`tL_${iz+1}`),'beam',0.25,0.45);
  addRC(getNode(`tR_${iz}`),getNode(`tR_${iz+1}`),'beam',0.25,0.45);
  if(centerCol)addRC(getNode(`tC_${iz}`),getNode(`tC_${iz+1}`),'beam',0.25,0.45);
  for(let k=1;k<totalPanels;k++){
   const p0=getNode(`tr_top_${iz}_${k}`),p1=getNode(`tr_top_${iz+1}_${k}`);
   if(p0&&p1&&p0!==p1)addSteel(p0,p1,0.0008,5e-7,5e-7,5e-8);
  }
 }
 return p;
}


// A local, self-contained viewer. Global Y is up in both renderer and solver.
const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(42,1,.01,10000),controls;
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));$('canvas').append(renderer.domElement);
let saved3D={position:new THREE.Vector3(11,9,13),target:new THREE.Vector3(2,1.5,2)},planFrustumHeight=12;
function bindControls(target,position,up){controls?.dispose();controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enableRotate=viewMode!=='plan';controls.enabled=!(viewMode==='plan'&&activeTool==='beam');if(up)camera.up.copy(up);camera.position.copy(position);camera.lookAt(target);controls.target.copy(target);controls.update();}
bindControls(saved3D.target,saved3D.position);
scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,10,6);scene.add(light);
const gridHelper=new THREE.GridHelper(40,40,0x395776,0x24384e);scene.add(gridHelper);scene.add(new THREE.AxesHelper(1.5));let group=new THREE.Group();scene.add(group);
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
function resizeViewport(){const {width,height}=$('canvas').getBoundingClientRect(),w=Math.max(1,width),h=Math.max(1,height);renderer.setSize(w,h);if(camera.isPerspectiveCamera)camera.aspect=w/h;else{const aspect=w/h;camera.left=-planFrustumHeight*aspect/2;camera.right=planFrustumHeight*aspect/2;camera.top=planFrustumHeight/2;camera.bottom=-planFrustumHeight/2;}camera.updateProjectionMatrix();}
new ResizeObserver(resizeViewport).observe($('canvas'));
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
function labelSprite(text, width=280, height=64, fontSize=24){
 const c=document.createElement('canvas');c.width=width;c.height=height;
 const ctx=c.getContext('2d');ctx.font=`bold ${fontSize}px sans-serif`;
 ctx.fillStyle='#d2e3f6';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(text,width/2,height/2);
 const texture=new THREE.CanvasTexture(c);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));
 sprite.scale.set((width/250)*0.7,(height/64)*0.23,1);return sprite;
}

let cachedMemberMarks=new Map(),cachedFoundationMarks=new Map(),cachedSlabMarks=new Map(),cachedMarkRev=-1;
function computeMarks(){
 if(cachedMarkRev===revision&&cachedMemberMarks.size===model.members.length)return;
 cachedMarkRev=revision;
 cachedMemberMarks.clear();
 cachedFoundationMarks.clear();
 cachedSlabMarks.clear();
 const nodeMap=new Map(model.nodes.map(n=>[n.id,n]));
 const groups=new Map();
 for(const item of model.members){
  const kind=item.kind||'beam';let prefix='M';
  const role=item.roofRole||item.role;
  if(role==='rafter'||role==='RAF')prefix='RAF';
  else if(role==='ridge'||role==='OK')prefix='OK';
  else if(role==='purlin'||role==='P')prefix='P';
  else if(role==='eave'||role==='AS')prefix='AS';
  else if(kind==='column')prefix='C';
  else if(kind==='beam')prefix='B';
  else if(kind==='roof'||item.sectionType==='steel_custom'){
   prefix='R';
   const ni=nodeMap.get(item.i),nj=nodeMap.get(item.j);
   if(ni&&nj){
    const dx=Math.abs(nj.x-ni.x),dy=Math.abs(nj.y-ni.y),dz=Math.abs(nj.z-ni.z);
    if(dz>0.1&&dx<0.1&&dy<0.1)prefix='P';
    else if(dy>0.05&&dx<0.1&&dz>0.1)prefix='RAF';
    else if(dy>0.05&&dx>0.1)prefix='TC';
    else if(dy<0.05&&dx>0.1)prefix='BC';
    else if(dx<0.1&&dy>0.1)prefix='W';
    else prefix='W';
   }
  }
  const b=item.b?Math.round(item.b*1000):0;
  const h=item.h?Math.round(item.h*1000):0;
  const a=item.A?Math.round(item.A*1e4):0;
  const key=`${prefix}_${b}_${h}_${a}`;
  if(!groups.has(key))groups.set(key,{prefix,b,h,a,ids:[]});
  groups.get(key).ids.push(item.id);
 }
 const sortedKeys=Array.from(groups.keys()).sort();
 const counters={};
 for(const k of sortedKeys){
  const grp=groups.get(k);
  counters[grp.prefix]=(counters[grp.prefix]||0)+1;
  const lbl=`${grp.prefix}${counters[grp.prefix]}`;
  for(const mid of grp.ids)cachedMemberMarks.set(mid,lbl);
 }
 const fGroups=new Map();
 for(const item of (model.foundations||[])){
  const bx=Math.round((item.bx||1)*1000);
  const bz=Math.round((item.bz||1)*1000);
  const d=Math.round((item.depth||0.4)*1000);
  const pCount=item.pileCount||(item.type==='pile_cap'?4:0);
  const type=item.type||'isolated';
  const key=`${bx}_${bz}_${d}_${pCount}_${type}`;
  if(!fGroups.has(key))fGroups.set(key,[]);
  fGroups.get(key).push(item.id);
 }
 const sortedFKeys=Array.from(fGroups.keys()).sort();
 let fCount=0;
 for(const k of sortedFKeys){
  fCount++;
  const flbl=`F${fCount}`;
  for(const fid of fGroups.get(k))cachedFoundationMarks.set(fid,flbl);
 }
 const sGroups=new Map();
 for(const item of (model.slabs||[])){
  const th=Math.round((item.thickness||0.12)*1000);
  const d=Math.round((item.dead||1)*10);
  const l=Math.round((item.live||2)*10);
  const key=`${th}_${d}_${l}`;
  if(!sGroups.has(key))sGroups.set(key,[]);
  sGroups.get(key).push(item.id);
 }
 const sortedSKeys=Array.from(sGroups.keys()).sort();
 let sCount=0;
 for(const k of sortedSKeys){
  sCount++;
  const slbl=`S${sCount}`;
  for(const sid of sGroups.get(k))cachedSlabMarks.set(sid,slbl);
 }
}
function getMemberMark(m){if(!m)return '';if(designResult?.labels?.[m.id])return designResult.labels[m.id];computeMarks();return cachedMemberMarks.get(m.id)||m.id;}
function getFoundationMark(f){if(!f)return '';if(designResult?.labels?.[f.id])return designResult.labels[f.id];if(designResult?.footings?.[f.id]?.label)return designResult.footings[f.id].label;computeMarks();return cachedFoundationMarks.get(f.id)||f.id;}
function getSlabMark(s){if(!s)return '';if(designResult?.labels?.[s.id])return designResult.labels[s.id];if(designResult?.slabs?.[s.id]?.label)return designResult.slabs[s.id].label;computeMarks();return cachedSlabMarks.get(s.id)||s.id;}
function line(points,color){const g=new THREE.BufferGeometry().setFromPoints(points);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color}));group.add(l);return l;}
function getMemberLocalAxes(a,b,rotationDeg=0){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,L=Math.hypot(dx,dy,dz);
 if(L<1e-6)return{x:[1,0,0],y:[0,1,0],z:[0,0,1],L:0};
 let x=[dx/L,dy/L,dz/L],y,z;
 const isVert=Math.abs(dx)<1e-5&&Math.abs(dz)<1e-5,isHoriz=Math.abs(dy)<1e-5;
 if(isVert){
  if(dy>0){y=[-1,0,0];z=[0,0,1];}else{y=[1,0,0];z=[0,0,1];}
 }else if(isHoriz){
  const yt=[0,1,0];
  z=[x[1]*yt[2]-x[2]*yt[1],x[2]*yt[0]-x[0]*yt[2],x[0]*yt[1]-x[1]*yt[0]];
  const mz=Math.hypot(...z);z=[z[0]/mz,z[1]/mz,z[2]/mz];
  y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  const my=Math.hypot(...y);y=[y[0]/my,y[1]/my,y[2]/my];
 }else{
  const proj=[dx,0,dz];
  if(dy>0)z=[proj[1]*x[2]-proj[2]*x[1],proj[2]*x[0]-proj[0]*x[2],proj[0]*x[1]-proj[1]*x[0]];
  else z=[x[1]*proj[2]-x[2]*proj[1],x[2]*proj[0]-x[0]*proj[2],x[0]*proj[1]-x[1]*proj[0]];
  const mz=Math.hypot(...z);z=[z[0]/mz,z[1]/mz,z[2]/mz];
  y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  const my=Math.hypot(...y);y=[y[0]/my,y[1]/my,y[2]/my];
 }
 if(rotationDeg!==0){
  const rad=rotationDeg*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const dotYX=y[0]*x[0]+y[1]*x[1]+y[2]*x[2],crXY=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  const ry=[y[0]*c+crXY[0]*s+x[0]*dotYX*(1-c),y[1]*c+crXY[1]*s+x[1]*dotYX*(1-c),y[2]*c+crXY[2]*s+x[2]*dotYX*(1-c)];
  const dotZX=z[0]*x[0]+z[1]*x[1]+z[2]*x[2],crXZ=[x[1]*z[2]-x[2]*z[1],x[2]*z[0]-x[0]*z[2],x[0]*z[1]-x[1]*z[0]];
  const rz=[z[0]*c+crXZ[0]*s+x[0]*dotZX*(1-c),z[1]*c+crXZ[1]*s+x[1]*dotZX*(1-c),z[2]*c+crXZ[2]*s+x[2]*dotZX*(1-c)];
  y=ry;z=rz;
 }
 return{x,y,z,L};
}
const planLevels=()=>groupLevels(model.nodes,PLAN_LEVEL_TOLERANCE);
function choosePlanLevel(levels){let best=levels[0],bestCount=-1;for(const level of levels){const ids=new Set(level.nodes.map(node=>node.id));const count=model.members.filter(member=>ids.has(member.i)&&ids.has(member.j)&&member.kind==='beam').length+model.slabs.filter(slab=>slab.nodes.length>=3&&slab.nodes.every(id=>ids.has(id))).length*2;if(count>bestCount){best=level;bestCount=count;}}return best?.y??null;}
function renderPlanControls(){const levels=planLevels(),select=$('planLevel'),previous=planLevelY;select.replaceChildren();for(const level of levels){const option=el('option',level.label);option.value=String(level.y);select.append(option);}if(levels.length){const custom=Number.isFinite(previous)&&!levels.some(level=>Math.abs(level.y-previous)<=PLAN_LEVEL_TOLERANCE);if(custom){const option=el('option',`ระดับอิสระ · Y ${Number(previous.toFixed(3))} m`);option.value=String(previous);select.append(option);}else if(!levels.some(level=>Math.abs(level.y-(previous??NaN))<=PLAN_LEVEL_TOLERANCE))planLevelY=choosePlanLevel(levels);const level=levels.find(item=>Math.abs(item.y-planLevelY)<=PLAN_LEVEL_TOLERANCE);if(level)planLevelY=level.y;select.value=String(planLevelY);}else if(!Number.isFinite(planLevelY))planLevelY=null;select.disabled=!levels.length&&planLevelY===null;select.hidden=viewMode!=='plan';$('planElevation').hidden=viewMode!=='plan';$('setPlanElevation').hidden=viewMode!=='plan';$('planTools').hidden=viewMode!=='plan';$('labelToggle').hidden=viewMode==='plan';$('deformedToggle').hidden=viewMode==='plan';if($('localAxesToggle'))$('localAxesToggle').hidden=viewMode==='plan';if($('diagram3dToggle'))$('diagram3dToggle').hidden=viewMode==='plan';$('view3d').classList.toggle('active',viewMode==='3d');$('viewPlan').classList.toggle('active',viewMode==='plan');$('planSelectTool').classList.toggle('active',activeTool==='select');$('planNodeTool').classList.toggle('active',activeTool==='node');$('planBeamTool').classList.toggle('active',activeTool==='beam');$('viewHint').textContent=viewMode==='plan'?'ผัง X–Z · ระดับ '+(levels.find(item=>item.y===planLevelY)?.label??`Y ${fmt(planLevelY)} m`):'ลากหมุน · ล้อเมาส์ซูม · คลิกเลือก';if(viewMode==='plan'&&previous!==planLevelY){cancelInteraction(false);fitPlan();}}
function cancelInteraction(redraw=true){pointerStart=null;beamDrag=null;$('beamHint').textContent='';if(controls)controls.enabled=!(viewMode==='plan'&&activeTool==='beam');if(redraw&&model)drawModel();}
function setPlanTool(tool){cancelInteraction(false);activeTool=tool;if(controls)controls.enabled=!(viewMode==='plan'&&activeTool==='beam');renderPlanControls();drawModel();}
function fitPlan(){const all=model.nodes.filter(node=>[node.x,node.y,node.z].every(Number.isFinite)),levelNodes=all.filter(node=>planLevelY!==null&&Math.abs(node.y-planLevelY)<=PLAN_LEVEL_TOLERANCE),nodes=levelNodes.length?levelNodes:all;const minX=nodes.length?Math.min(...nodes.map(n=>n.x)):0,maxX=nodes.length?Math.max(...nodes.map(n=>n.x)):10,minZ=nodes.length?Math.min(...nodes.map(n=>n.z)):0,maxZ=nodes.length?Math.max(...nodes.map(n=>n.z)):10,minY=nodes.length?Math.min(...nodes.map(n=>n.y)):0,maxY=nodes.length?Math.max(...nodes.map(n=>n.y)):0,center=new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2),aspect=Math.max(1,$('canvas').clientWidth)/Math.max(1,$('canvas').clientHeight);planFrustumHeight=Math.max(maxZ-minZ,(maxX-minX)/aspect,1)*1.5;const distance=Math.max(20,maxY-minY+10);camera=new THREE.OrthographicCamera(-planFrustumHeight*aspect/2,planFrustumHeight*aspect/2,planFrustumHeight/2,-planFrustumHeight/2,.1,10000);bindControls(center,new THREE.Vector3(center.x,center.y+distance,center.z),new THREE.Vector3(0,0,-1));gridHelper.position.y=planLevelY??0;resizeViewport();}
function setViewMode(mode){if(mode===viewMode)return;cancelInteraction(false);activeTool='select';if(viewMode==='3d'){saved3D={position:camera.position.clone(),target:controls.target.clone()};}viewMode=mode;renderPlanControls();if(mode==='plan')fitPlan();else{camera=new THREE.PerspectiveCamera(42,1,.01,10000);bindControls(saved3D.target,saved3D.position);gridHelper.position.y=0;resizeViewport();}drawModel();}
function planPointerPoint(event){const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height||planLevelY===null)return null;pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-planLevelY),new THREE.Vector3());}
function snapPlanNode(event){const point=planPointerPoint(event);if(!point)return null;const zoom=camera.isOrthographicCamera?camera.zoom:1,threshold=planFrustumHeight/Math.max(.01,zoom)/Math.max(1,renderer.domElement.clientHeight)*18;return nearestPlanNode(model.nodes,point.x,point.z,planLevelY,PLAN_LEVEL_TOLERANCE,threshold);}
function commitPlanNode(point,event){const useSnap=$('planSnap').checked&&!event?.altKey;const pixelTolerance=planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18;const placed=useSnap?snapPlanPoint(point,model.nodes,planLevelY,1,Math.min(.25,pixelTolerance)):point;const draft=planNodeDraft(model.nodes,placed,nextId('N',model.nodes));if(!draft.ok)return status(draft.reason,'error');const before=revision;mutate(()=>{model.nodes.push(draft.node);selected={kind:'nodes',id:draft.node.id};tab='nodes';});if(revision!==before)status(`วางโหนด ${draft.node.id} ที่ X ${fmt(draft.node.x)}, Y ${fmt(draft.node.y)}, Z ${fmt(draft.node.z)} m${useSnap?' · ดูดกริด/แนวโหนดเดิม':''} · ยังไม่เชื่อมสมาชิก`);}
function commitReferenceNode(memberId,fromNodeId,distance){
 const plan=splitBeamAtDistance(model,memberId,fromNodeId,distance,nextId('N',model.nodes),nextId('M',model.members));
 if(!plan.ok)return status(plan.reason,'error');
 const before=revision;
 mutate(()=>{const idx=model.members.findIndex(m=>m.id===memberId);model.nodes.push(plan.node);model.members.splice(idx,1,...plan.members);model.memberLoads=model.memberLoads.filter(load=>load.member!==memberId).concat(plan.memberLoads);selected={kind:'nodes',id:plan.node.id};tab='nodes';});
 if(revision!==before)status(`สร้าง ${plan.node.id} ห่างจาก ${fromNodeId} ${fmt(distance)} m บนคาน ${memberId} · แบ่งคานเป็น ${plan.members.map(m=>m.id).join(' / ')} แล้ว · ต้องวิเคราะห์ใหม่`);
}
function commitPlanBeam(startId,endId){const validation=validateMemberEndpoints(model.nodes,model.members,startId,endId,{levelY:planLevelY,levelTolerance:PLAN_LEVEL_TOLERANCE,disallowIntervening:true});if(!validation.ok)return status(validation.reason,'error');const b=memberDraft.b,h=memberDraft.h;if(!Number.isFinite(b)||!Number.isFinite(h)||b<.01||h<.01)return status('กรอกขนาด b และ h ของคานให้มากกว่า 0.01 m','error');const before=revision;mutate(()=>{const member=memberRecord(nextId('M',model.members),startId,endId,'beam');member.b=b;member.h=h;model.members.push(member);selected={kind:'members',id:member.id};tab=memberTab(member);});if(revision!==before)status(`เพิ่มคาน ${startId} → ${endId} แล้ว · ต้องวิเคราะห์ใหม่`);}
renderer.domElement.addEventListener('pointerdown',event=>{if(viewMode==='plan'&&activeTool==='beam'){event.preventDefault();const start=snapPlanNode(event);if(!start){$('beamHint').textContent='เริ่มลากจากโหนดที่ระดับนี้';return;}beamDrag={startId:start.node.id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,started:false,world:new THREE.Vector3(start.node.x,planLevelY,start.node.z),endId:null};renderer.domElement.setPointerCapture(event.pointerId);$('beamHint').textContent=`จาก ${beamDrag.startId} · ลากไปยังโหนดปลาย`;drawModel();return;}pointerStart=[event.clientX,event.clientY];});
renderer.domElement.addEventListener('pointermove',event=>{if(viewMode==='plan'&&activeTool==='node'&&!beamDrag){const point=planPointerPoint(event),snapped=$('planSnap').checked&&!event.altKey&&point?snapPlanPoint(point,model.nodes,planLevelY,1,Math.min(.25,planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18)):point;$('beamHint').textContent=snapped?`X ${fmt(snapped.x)} · Z ${fmt(snapped.z)} m${$('planSnap').checked&&!event.altKey?' · ดูดกริด':''}`:'';return;}if(!beamDrag||event.pointerId!==beamDrag.pointerId)return;if(Math.hypot(event.clientX-beamDrag.x,event.clientY-beamDrag.y)>4)beamDrag.started=true;const point=planPointerPoint(event),snap=snapPlanNode(event);beamDrag.endId=snap?.node.id??null;beamDrag.world=snap?new THREE.Vector3(snap.node.x,planLevelY,snap.node.z):point;const suffix=beamDrag.endId?` · ถึง ${beamDrag.endId}`:' · ปลายต้องจับโหนด';$('beamHint').textContent=`${beamDrag.startId} → ${beamDrag.endId??'…'}${suffix}`;drawModel();});
renderer.domElement.addEventListener('pointerup',event=>{if(beamDrag&&event.pointerId===beamDrag.pointerId){const drag=beamDrag,end=snapPlanNode(event);beamDrag=null;$('beamHint').textContent='';if(drag.started){if(!end)status('ปลายคานต้องจับโหนดที่ระดับเดียวกัน','error');else commitPlanBeam(drag.startId,end.node.id);}drawModel();return;}if(!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>4){pointerStart=null;return;}pointerStart=null;if(viewMode==='plan'&&activeTool==='node'){const point=planPointerPoint(event);if(point)commitPlanNode(point,event);else status('เลือกระดับชั้นก่อนวางโหนด','error');return;}const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const allHits=ray.intersectObjects(group.children,true),hit=viewMode==='plan'?(allHits.find(item=>['nodes','members'].includes(item.object.userData.kind))||allHits.find(item=>['slabs','foundations'].includes(item.object.userData.kind))):allHits.find(item=>item.object.userData.kind);selected=hit?hit.object.userData:null;if(selected?.kind==='members'){$('resultMember').value=selected.id;drawDiagram();}renderSelection();drawModel();renderTable();});
renderer.domElement.addEventListener('pointercancel',()=>cancelInteraction());
function drawModel(){
 updateHeatmapLegend();
 if($('localAxesBadge'))$('localAxesBadge').style.display=(viewMode==='plan'||($('localAxes')&&!$('localAxes').checked))?'none':'flex';
 scene.remove(group);group.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});group=new THREE.Group();scene.add(group);
 const visibleNodeIds=viewMode==='plan'?new Set(model.nodes.filter(n=>Math.abs(n.y-planLevelY)<=PLAN_LEVEL_TOLERANCE).map(n=>n.id)):null;gridHelper.position.y=viewMode==='plan'?(planLevelY??0):0;
 const pos=new Map(model.nodes.filter(n=>[n.x,n.y,n.z].every(Number.isFinite)).map(n=>[n.id,new THREE.Vector3(n.x,n.y,n.z)]));const active=result?.combinations[$('resultCombo').value];
 const cm = $('colorMode')?.value || 'default';
 let cmMin = 0, cmMax = 1;
 if (cm === 'utilization') {
  cmMin = 0; cmMax = 1;
 } else if (cm === 'load') {
  let maxL = 0;
  for (const m of model.members) {
   const bd = getMemberLoadBreakdown(m);
   if (bd) {
    if (bd.type === 'column') maxL = Math.max(maxL, quantity(bd.axialMaxKN, 'force'));
    else if (bd.type === 'beam') maxL = Math.max(maxL, quantity(bd.totalQyKNm, 'line'));
    else maxL = Math.max(maxL, quantity(Math.abs(bd.axialKN), 'force'));
   }
  }
  cmMin = 0; cmMax = maxL > 0 ? maxL : 1000;
 } else if (['Mz', 'Vy', 'N'].includes(cm)) {
  const vals = [];
  if (active?.members) {
   for (const m of model.members) {
    const s = active.members[m.id]?.samples;
    if (s) {
     for (const pt of s) {
      const v = (cm === 'N') ? Math.abs(pt.N) : Math.abs(pt[cm]);
      if (Number.isFinite(v)) vals.push(quantity(v, cm === 'Mz' ? 'moment' : 'force'));
     }
    }
   }
  }
  if (vals.length) {
   cmMin = Math.min(...vals);
   cmMax = Math.max(...vals);
  }
  if (cmMax <= cmMin) cmMax = cmMin + 10;
 }
 const visibleMembers=new Set();for(const m of model.members){if(visibleNodeIds&&(!visibleNodeIds.has(m.i)||!visibleNodeIds.has(m.j)))continue;const a=pos.get(m.i),b=pos.get(m.j);if(!a||!b||a.distanceTo(b)<1e-6)continue;visibleMembers.add(m.id);
  const highlight=selected?.kind==='members'&&selected.id===m.id;
  const axes=getMemberLocalAxes(a,b,m.rotation||0);
  const secB=(m.kind==='roof'||m.sectionType==='steel_custom')?0.08:Math.max(0.08,m.b||0.25);
  const secH=(m.kind==='roof'||m.sectionType==='steel_custom')?0.08:Math.max(0.08,m.h||0.35);
  const nSegments=(cm!=='default')?40:1;
  const boxGeo=new THREE.BoxGeometry(secB,axes.L,secH,1,nSegments,1);
  let memberMat;
  if(cm==='default'){
   const memberColor=highlight?0xffbe66:m.kind==='roof'?0xe0a75f:m.kind==='column'?0x80d7c7:0x5fcbbb;
   memberMat=new THREE.MeshStandardMaterial({color:memberColor,metalness:.1,roughness:.5});
  }else{
   const posAttr=boxGeo.attributes.position;
   const colorArr=new Float32Array(posAttr.count*3);
   for(let vi=0;vi<posAttr.count;vi++){
    const yVal=posAttr.getY(vi);
    const t=axes.L>1e-6?Math.max(0,Math.min(1,(yVal+axes.L/2)/axes.L)):0;
    const rgb=getMemberStationRGB(m,t,cm,cmMin,cmMax,active);
    colorArr[vi*3]=rgb[0];colorArr[vi*3+1]=rgb[1];colorArr[vi*3+2]=rgb[2];
   }
   boxGeo.setAttribute('color',new THREE.BufferAttribute(colorArr,3));
   memberMat=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.1,roughness:.5});
  }
  const mesh=new THREE.Mesh(boxGeo,memberMat);
  const rotMat=new THREE.Matrix4();
  rotMat.makeBasis(new THREE.Vector3(...axes.z),new THREE.Vector3(...axes.x),new THREE.Vector3(...axes.y));
  mesh.quaternion.setFromRotationMatrix(rotMat);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.userData={kind:'members',id:m.id};group.add(mesh);
  if(highlight){
   const boxOutline=new THREE.BoxHelper(mesh,0xffbe66);
   group.add(boxOutline);
  }
  const showAxes=$('localAxes')?$('localAxes').checked:true;
  if(showAxes||highlight){
   const triadOrigin=a.clone().lerp(b,0.35);
   const tLen=Math.min(0.65,Math.max(0.25,axes.L*0.22));
   const hl=tLen*0.3,hw=tLen*0.16;
   group.add(new THREE.ArrowHelper(new THREE.Vector3(...axes.x),triadOrigin,tLen,0xef4444,hl,hw));
   group.add(new THREE.ArrowHelper(new THREE.Vector3(...axes.y),triadOrigin,tLen*0.85,0x22c55e,hl*0.85,hw*0.85));
   group.add(new THREE.ArrowHelper(new THREE.Vector3(...axes.z),triadOrigin,tLen*0.85,0x3b82f6,hl*0.85,hw*0.85));
  }
  if(active&&$('diagram3d')?.checked&&viewMode!=='plan'){
   const memRes=active.members[m.id];
   if(memRes&&memRes.samples&&memRes.samples.length>=2){
    const diagKey=(cm==='Vy'||$('diagramType')?.value==='Vy')?'Vy':'Mz';
    const diagMax=Math.max(...memRes.samples.map(s=>Math.abs(s[diagKey])),0);
    if(diagMax>1e-4){
     const peakH=Math.min(0.65,Math.max(0.18,axes.L*0.22));
     const dScale=peakH/diagMax;
     const dirY=new THREE.Vector3(...axes.y);
     const ribbonVerts=[],ribbonColors=[],linePts=[];
     for(let k=0;k<memRes.samples.length;k++){
      const frac=k/(memRes.samples.length-1);
      const pBase=a.clone().lerp(b,frac);
      const sVal=memRes.samples[k][diagKey];
      const pDiag=pBase.clone().addScaledVector(dirY,sVal*dScale);
      linePts.push(pDiag);
      if(k<memRes.samples.length-1){
       const fracNext=(k+1)/(memRes.samples.length-1);
       const pBaseNext=a.clone().lerp(b,fracNext);
       const sValNext=memRes.samples[k+1][diagKey];
       const pDiagNext=pBaseNext.clone().addScaledVector(dirY,sValNext*dScale);
       const rgbA=getRainbowRGB(Math.abs(sVal),0,diagMax);
       const rgbB=getRainbowRGB(Math.abs(sValNext),0,diagMax);
       ribbonVerts.push(pBase.x,pBase.y,pBase.z,pDiag.x,pDiag.y,pDiag.z,pDiagNext.x,pDiagNext.y,pDiagNext.z);
       ribbonColors.push(rgbA[0],rgbA[1],rgbA[2],rgbA[0],rgbA[1],rgbA[2],rgbB[0],rgbB[1],rgbB[2]);
       ribbonVerts.push(pBase.x,pBase.y,pBase.z,pDiagNext.x,pDiagNext.y,pDiagNext.z,pBaseNext.x,pBaseNext.y,pBaseNext.z);
       ribbonColors.push(rgbA[0],rgbA[1],rgbA[2],rgbB[0],rgbB[1],rgbB[2],rgbB[0],rgbB[1],rgbB[2]);
      }
     }
     const ribGeo=new THREE.BufferGeometry();
     ribGeo.setAttribute('position',new THREE.Float32BufferAttribute(ribbonVerts,3));
     ribGeo.setAttribute('color',new THREE.Float32BufferAttribute(ribbonColors,3));
     const ribMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.55,depthWrite:false});
     group.add(new THREE.Mesh(ribGeo,ribMat));
     const lineMat=new THREE.LineBasicMaterial({color:diagKey==='Mz'?0x38bdf8:0xfbbf24});
     const lineGeo=new THREE.BufferGeometry().setFromPoints(linePts);
     group.add(new THREE.Line(lineGeo,lineMat));
     line([a,linePts[0]],0x64748b);
     line([b,linePts[linePts.length-1]],0x64748b);
     if(diagMax>0.05){
      let kPeak=0,peakVal=0;
      for(let k=0;k<memRes.samples.length;k++){
       const av=Math.abs(memRes.samples[k][diagKey]);
       if(av>peakVal){peakVal=av;kPeak=k;}
      }
      const uKey=diagKey==='Mz'?'moment':'force';
      const label=labelSprite(`${diagKey}=${fmt(quantity(peakVal,uKey),1)} ${unitLabel(uKey)}`);
      label.scale.set(.65,.22,1);
      label.position.copy(linePts[kPeak]).addScaledVector(dirY,.12);
      group.add(label);
     }
    }
   }
  }
  if($('labels').checked){
   const mark=getMemberMark(m);
   const label=labelSprite(`${mark} (${m.id})`);
   label.position.copy(a).lerp(b,0.5).add(new THREE.Vector3(0,(secH/2)+0.15,0));
   group.add(label);
  }
  if(active&&$('deformed').checked){const da=active.nodes[m.i].displacement,db=active.nodes[m.j].displacement;line([a.clone().add(new THREE.Vector3(...da.slice(0,3)).multiplyScalar(100)),b.clone().add(new THREE.Vector3(...db.slice(0,3)).multiplyScalar(100))],0xffb861);}
 }
 for(const n of model.nodes){if(visibleNodeIds&&!visibleNodeIds.has(n.id))continue;const p=pos.get(n.id);if(!p)continue;const mesh=new THREE.Mesh(new THREE.SphereGeometry(.05,10,10),new THREE.MeshStandardMaterial({color:selected?.kind==='nodes'&&selected.id===n.id?0xffbe66:0xd8edf9}));mesh.position.copy(p);mesh.userData={kind:'nodes',id:n.id};group.add(mesh);
  if(n.restraints.some(Boolean)){const support=new THREE.Mesh(new THREE.ConeGeometry(.22,.28,4),new THREE.MeshStandardMaterial({color:0x6885a6,transparent:true,opacity:.7}));support.position.copy(p).add(new THREE.Vector3(0,-.2,0));group.add(support);}
  if($('labels').checked){const label=labelSprite(n.id);label.position.copy(p).add(new THREE.Vector3(.12,.24,0));group.add(label);}
 }
 // Point Loads (Nodal)
 for(const load of model.nodalLoads){
  if(visibleNodeIds&&!visibleNodeIds.has(load.node))continue;
  const p=pos.get(load.node);
  if(!p)continue;
  const v=new THREE.Vector3(load.fx,load.fy,load.fz);
  const pVal=v.length();
  if(pVal>1e-6){
   const d=v.clone().normalize();
   const arrowLen=0.85;
   group.add(new THREE.ArrowHelper(d,p.clone().sub(d.clone().multiplyScalar(arrowLen)),arrowLen,0xef4444,0.22,0.12));
   const badge=labelSprite(`P = ${fmt(quantity(pVal,'force'),1)} ${unitLabel('force')} (${load.case})`,260,60,22);
   badge.scale.set(0.65,0.22,1);
   badge.position.copy(p).sub(d.clone().multiplyScalar(arrowLen+0.16));
   group.add(badge);
  }
 }
 // Uniform Distributed Loads (UDL)
 for(const load of model.memberLoads){
  if(visibleNodeIds&&!visibleMembers.has(load.member))continue;
  const m=model.members.find(m=>m.id===load.member);
  if(!m)continue;
  const a=pos.get(m.i),b=pos.get(m.j);
  if(!a||!b)continue;
  const L=a.distanceTo(b);
  if(L<1e-6)continue;
  let v;
  if(load.axes==='local'){
   const ax=getMemberLocalAxes(a,b,m.rotation||0);
   v=new THREE.Vector3(ax.x[0]*load.qx+ax.y[0]*load.qy+ax.z[0]*load.qz,ax.x[1]*load.qx+ax.y[1]*load.qy+ax.z[1]*load.qz,ax.x[2]*load.qx+ax.y[2]*load.qy+ax.z[2]*load.qz);
  }else{
   v=new THREE.Vector3(load.qx,load.qy,load.qz);
  }
  const qVal=v.length();
  if(qVal<1e-6)continue;
  const dirLoad=v.clone().normalize();
  const dirBox=dirLoad.clone().negate();
  const boxH=Math.min(0.65,Math.max(0.35,L*0.12));
  const topA=a.clone().addScaledVector(dirBox,boxH);
  const topB=b.clone().addScaledVector(dirBox,boxH);

  // Rectangular wireframe frame lines
  line([topA,topB],0xf59e0b);
  line([a,topA],0xf59e0b);
  line([b,topB],0xf59e0b);
  line([a,b],0xd97706);

  // Shaded quad
  const quadGeo=new THREE.BufferGeometry();
  const quadVerts=[
   a.x,a.y,a.z, topA.x,topA.y,topA.z, topB.x,topB.y,topB.z,
   a.x,a.y,a.z, topB.x,topB.y,topB.z, b.x,b.y,b.z
  ];
  quadGeo.setAttribute('position',new THREE.Float32BufferAttribute(quadVerts,3));
  quadGeo.computeVertexNormals();
  const quadMat=new THREE.MeshBasicMaterial({color:0xfbbf24,transparent:true,opacity:0.22,side:THREE.DoubleSide,depthWrite:false});
  group.add(new THREE.Mesh(quadGeo,quadMat));

  // Downward arrows inside the box
  const numArrows=Math.max(4,Math.min(8,Math.round(L*1.5)));
  for(let i=0;i<numArrows;i++){
   const t=(i+0.5)/numArrows;
   const pTop=topA.clone().lerp(topB,t);
   const pBeam=a.clone().lerp(b,t);
   const arrLen=pTop.distanceTo(pBeam);
   const hl=Math.min(arrLen*0.35,0.14);
   group.add(new THREE.ArrowHelper(dirLoad,pTop,arrLen,0xf59e0b,hl,hl*0.6));
  }

  // Badge with load in kg/m and case
  const badge=labelSprite(`q = ${fmt(quantity(qVal,'line'),1)} ${unitLabel('line')} (${load.case})`,280,60,22);
  badge.scale.set(0.7,0.22,1);
  badge.position.copy(topA).lerp(topB,0.5).addScaledVector(dirBox,0.14);
  group.add(badge);
 }

 for(const slab of model.slabs){if(visibleNodeIds&&!slab.nodes.every(id=>visibleNodeIds.has(id)))continue;const pts=slab.nodes.map(id=>pos.get(id));if(pts.length<3||pts.some(p=>!p))continue;const contour=pts.map(p=>new THREE.Vector2(p.x,p.z));const triangles=THREE.ShapeUtils.triangulateShape(contour,[]),vertices=[];for(const tri of triangles)for(const i of tri)vertices.push(pts[i].x,pts[i].y-.025,pts[i].z);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:slab.mode==='pending'?0xddae66:0x5e9acd,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));mesh.userData={kind:'slabs',id:slab.id};group.add(mesh);}
 for(const f of model.foundations){
  if(visibleNodeIds&&!f.nodes.every(id=>visibleNodeIds.has(id)))continue;
  const pts=f.nodes.map(id=>pos.get(id));
  if(!pts.length||pts.some(p=>!p))continue;
  const c=pts.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/pts.length);
  const isSelected=selected?.kind==='foundations'&&selected.id===f.id;
  const pCount=f.pileCount||(f.type==='pile_cap'?4:0);
  const pLen=f.pileLength||12.0;
  if([f.bx,f.bz,f.depth].every(v=>Number.isFinite(v)&&v>0)){
   const capGeo=new THREE.BoxGeometry(f.bx,f.depth,f.bz);
   const capMat=new THREE.MeshStandardMaterial({color:isSelected?0xffbe66:(f.mode==='pending'?0xc99653:0x8593a5),transparent:true,opacity:.8});
   const mesh=new THREE.Mesh(capGeo,capMat);
   mesh.position.copy(c).add(new THREE.Vector3(0,-f.depth/2,0));
   mesh.userData={kind:'foundations',id:f.id};
   group.add(mesh);
   if(isSelected)group.add(new THREE.BoxHelper(mesh,0xffbe66));
  }
  if(pCount>0){
   const pileR=0.125;
   const dx=Math.min((f.bx||1.4)*0.28,0.45),dz=Math.min((f.bz||1.4)*0.28,0.45);
   let pileOffsets=[[0,0]];
   if(pCount===1)pileOffsets=[[0,0]];
   else if(pCount===2)pileOffsets=[[-dx,0],[dx,0]];
   else if(pCount===3)pileOffsets=[[-dx,-dz*0.7],[dx,-dz*0.7],[0,dz*0.7]];
   else if(pCount===4)pileOffsets=[[-dx,-dz],[dx,-dz],[-dx,dz],[dx,dz]];
   else if(pCount===5)pileOffsets=[[-dx,-dz],[dx,-dz],[-dx,dz],[dx,dz],[0,0]];
   else if(pCount===6)pileOffsets=[[-dx,-dz],[0,-dz],[dx,-dz],[-dx,dz],[0,dz],[dx,dz]];
   else pileOffsets=[[-dx,-dz],[dx,-dz],[-dx,dz],[dx,dz]];
   const cylGeo=new THREE.CylinderGeometry(pileR,pileR,pLen,16);
   const edgeGeo=new THREE.EdgesGeometry(cylGeo,30);
   const pileMat=new THREE.MeshStandardMaterial({color:isSelected?0xffd59e:0x94a3b8,roughness:.6,metalness:.1,transparent:true,opacity:.85});
   const edgeMat=new THREE.LineBasicMaterial({color:0x334155});
   const pileY=c.y-(f.depth||0.5)-pLen/2;
   for(const [ox,oz] of pileOffsets){
    const pMesh=new THREE.Mesh(cylGeo,pileMat);
    pMesh.position.set(c.x+ox,pileY,c.z+oz);
    pMesh.userData={kind:'foundations',id:f.id};
    group.add(pMesh);
    const edgeLine=new THREE.LineSegments(edgeGeo,edgeMat);
    edgeLine.position.copy(pMesh.position);
    group.add(edgeLine);
   }
  }
  const fmark=getFoundationMark(f);
  const pileText=pCount>0?` · ${pCount} เข็ม`:'';
  const label=labelSprite(`${fmark} (${f.id})${pileText}`);
  label.position.copy(c).add(new THREE.Vector3(.3,-f.depth-0.2,.3));
  group.add(label);
 }
 // 3D Solid Staircase (Landing Slab + Flight Waist Slabs + Steps)
 if(viewMode!=='plan'&&model.stairs&&model.stairs.length){
  const stairMat=new THREE.MeshStandardMaterial({color:0x94a3b8,roughness:0.6,metalness:0.1,transparent:true,opacity:0.85});
  const stepMat=new THREE.MeshStandardMaterial({color:0x64748b,roughness:0.5,metalness:0.1});
  for(const st of model.stairs){
   const fNum=parseInt(st.id.replace(/\D/g,''))||1;
   const height=3.0;
   const yBot=(fNum-1)*height;
   const yMid=yBot+height/2.0;
   const spanZ=st.span||4.0;
   const width=st.width||1.2;
   const waistTh=st.thickness||0.15;
   const riser=st.riser||0.175;
   const landZ=spanZ/2.0;
   const landingLz=1.2;

   const landGeo=new THREE.BoxGeometry(width,waistTh,landingLz);
   const landMesh=new THREE.Mesh(landGeo,stairMat);
   landMesh.position.set(width/2.0,yMid-waistTh/2.0,landZ);
   landMesh.userData={kind:'stairs',id:st.id};
   group.add(landMesh);
   group.add(new THREE.BoxHelper(landMesh,0x38bdf8));

   const numSteps1=Math.max(4,Math.round((height/2.0)/riser));
   const dz1=(landZ-landingLz/2.0)/numSteps1;
   const dy1=(height/2.0)/numSteps1;
   for(let s=0;s<numSteps1;s++){
    const stepZ=s*dz1+dz1/2.0;
    const stepY=yBot+(s+0.5)*dy1;
    const sGeo=new THREE.BoxGeometry(width,dy1,dz1);
    const sMesh=new THREE.Mesh(sGeo,stepMat);
    sMesh.position.set(width/2.0,stepY,stepZ);
    sMesh.userData={kind:'stairs',id:st.id};
    group.add(sMesh);
   }

   const numSteps2=numSteps1;
   const startZ2=landZ+landingLz/2.0;
   const dz2=(spanZ-startZ2)/numSteps2;
   const dy2=(height/2.0)/numSteps2;
   for(let s=0;s<numSteps2;s++){
    const stepZ=startZ2+s*dz2+dz2/2.0;
    const stepY=yMid+(s+0.5)*dy2;
    const sGeo=new THREE.BoxGeometry(width,dy2,dz2);
    const sMesh=new THREE.Mesh(sGeo,stepMat);
    sMesh.position.set(width/2.0,stepY,stepZ);
    sMesh.userData={kind:'stairs',id:st.id};
    group.add(sMesh);
   }

   const badge=labelSprite(`${st.label||st.id}: พื้นบันได-ชานพัก คสล. หนา ${Math.round(waistTh*100)} cm`,340,64,20);
   badge.scale.set(0.85,0.22,1);
   badge.position.set(width/2.0,yMid+0.45,landZ);
   group.add(badge);
  }
 }
 if(viewMode==='plan'&&beamDrag){const start=pos.get(beamDrag.startId);if(start&&beamDrag.world)line([start,beamDrag.world],0xff7a00);}
 $('stats').textContent=`${model.nodes.length} โหนด / ${model.members.length} สมาชิก / ${model.slabs.length} พื้น / ${model.foundations.length} ฐาน`;

}
function fit(){if(viewMode==='plan'){fitPlan();drawModel();return;}const nodes=model.nodes.filter(n=>[n.x,n.y,n.z].every(Number.isFinite));if(!nodes.length)return;const box=new THREE.Box3().setFromPoints(nodes.map(n=>new THREE.Vector3(n.x,n.y,n.z))),center=box.getCenter(new THREE.Vector3()),size=Math.max(4,box.getSize(new THREE.Vector3()).length());controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size*.9,size*.65,size));controls.update();saved3D={position:camera.position.clone(),target:controls.target.clone()};}
const quantity=(value,kind)=>toDisplay(value,kind,model.displayUnits);
const canonical=(value,kind)=>toCanonical(value,kind,model.displayUnits);
const unitLabel=kind=>unit(kind,model.displayUnits).label;
const editValue=(value,kind)=>value===null?'':Number(quantity(value,kind).toPrecision(14));
const groupFor=t=>['beams','columns','roof'].includes(t)?'members':t;
const memberTab=m=>m.kind==='column'?'columns':m.kind==='roof'?'roof':'beams';
const rowsFor=t=>groupFor(t)==='members'?model.members.filter(m=>memberTab(m)===t):model[t];
const memberColumns=[['id','สมาชิก','id'],['i','โหนด i','node'],['j','โหนด j','node'],['kind','ประเภท','enum:kind'],['sectionType','หน้าตัด','enum:sectionType'],['b','b ตาม local z','number','section'],['h','h ตาม local y','number','section'],['A','A เหล็ก','number','area'],['Iy','Iy เหล็ก','number','inertia'],['Iz','Iz เหล็ก','number','inertia'],['J','J เหล็ก','number','inertia'],['rotation','หมุน (°)','number'],['behavior','พฤติกรรม','enum:behavior']];
const specs={
 nodes:[['id','โหนด','id'],['x','X','number','length'],['y','Y สูง','number','length'],['z','Z','number','length'],...dofs.map((d,i)=>['r'+i,d,'bool'])],
 beams:memberColumns,columns:memberColumns,roof:[...memberColumns,['roofType','รูปแบบหลังคา','enum:roofType']],
 slabs:[['id','พื้น','id'],['type','ชนิดพื้น','enum:slabType'],['nodes','โหนดรอบรูป (เช่น N5,N6,N8,N7)','nodes'],['thickness','ความหนา','number','section'],['weightMode','นน.ตัวพื้น','enum:weightMode'],['selfLoad','นน.ตัวพื้นเมื่อกรอกเอง','number','pressure'],['dead','นน.คงที่เพิ่ม','number','pressure'],['live','นน.จร','number','pressure'],['mode','การวิเคราะห์','enum:slabMode'],['support1','คานรับด้าน 1','beam'],['support2','คานรับด้าน 2','beam'],['note','หมายเหตุ','text']],
 foundations:[['id','ฐาน','id'],['type','ชนิดฐานราก','enum:foundationType'],['nodes','โหนดที่รองรับ (คั่นด้วย ,)','nodes'],['bx','กว้าง X','number','length'],['bz','ยาว Z','number','length'],['depth','หนาฐาน','number','section'],['embedment','ความลึกฝัง','number','length'],['qa','กำลังดิน qa (ข้อมูล)','number','pressure'],['pileCount','จำนวนเข็ม (ข้อมูล)','number'],['pileCapacity','กำลังต่อเข็ม (ข้อมูล)','number','force'],['pileLength','ยาวเข็ม (ข้อมูล)','number','length'],['mode','แบบจำลองรองรับ','enum:foundationMode'],['note','หมายเหตุ','text']],
 nodalLoads:[['node','โหนด','node'],['case','กรณี','case'],...['fx','fy','fz'].map(k=>[k,k.toUpperCase(),'number','force']),...['mx','my','mz'].map(k=>[k,k.toUpperCase(),'number','moment'])],
 memberLoads:[['member','สมาชิก','member'],['case','กรณี','case'],['axes','ระบบแกน','enum:axes'],...['qx','qy','qz'].map(k=>[k,k,'number','line'])],
 combinations:[['name','ชื่อชุด','text'],['D','D ×','number'],['L','L ×','number'],['W','W ×','number']]
};
const notes={nodes:'✓ = ยึดการเลื่อน/หมุน · แกน Y ขึ้น · หน่วยพิกัด m',beams:'คสล. ใช้ b/h; เหล็กใช้ A/Iy/Iz/J ของหน้าตัดจริง · ไม่ใช้ b/h แทนเหล็ก',columns:'เสาต่อ rigid joint · ยังไม่ตรวจ P–M หรือความชะลูด',roof:'รูปแบบหลังคาเป็นการจัดกลุ่ม · วิเคราะห์เฉพาะ frame · truss ยังไม่รองรับ · หน้าตัดเหล็กต้องกรอก A/Iy/Iz/J',slabs:'กรอกได้ทุกชนิดในรายการ + กำหนดเอง · วิเคราะห์นน.ได้เฉพาะพื้นทางเดียวสี่เหลี่ยมลงคานสองด้าน · หนา/นน./โหนด/คานต้องครบ',foundations:'ข้อมูลดิน/เข็มเก็บไว้เท่านั้น · ยังไม่ใช้คำนวณกำลัง/การทรุดตัว · ฐานใช้จุดรองรับที่ผู้ใช้กำหนดไว้ ไม่เปลี่ยน restraints อัตโนมัติ',nodalLoads:'แกน GLOBAL · FY ลบ = ลง · แสดงหน่วยเป็น kg (แรงกระทำ)',memberLoads:'แรงกระจายสม่ำเสมอ · เลือกระบบแกน Local (แกนเฉพาะตัวชิ้นส่วน) หรือ Global (แกนรวม) · qy ลบ = กดลง',combinations:'ชุดน้ำหนักกำหนดเอง ยังไม่ได้สร้างตามมาตรฐาน'};
function classification(collection,row){if(collection==='slabs')return row.mode==='one_way_load'&&['one_way','precast','steel_deck','custom'].includes(row.type)?'ตั้งให้ถ่ายนน.ทางเดียว':'รอวิเคราะห์';if(collection==='foundations')return row.mode==='ideal_support'?'จุดรองรับ / ไม่ตรวจฐาน':'รอยืนยันรองรับ';if(collection==='members')return (row.behavior==='truss'||row.kind==='roof'&&['truss','spaceframe'].includes(row.roofType))?'รอระบบ truss':row.sectionType==='steel_custom'&&['A','Iy','Iz','J'].some(k=>!Number.isFinite(row[k])||row[k]<=0)?'รอคุณสมบัติหน้าตัด':'วิเคราะห์ frame';return '';}
function getMemberLoadBreakdown(item){
 if(!item||!['beams','columns','roof'].includes(memberTab(item)))return null;
 const act=result?.combinations?.[$('resultCombo')?.value];
 const memRes=act?.members?.[item.id];
 const a=model.nodes.find(n=>n.id===item.i),b=model.nodes.find(n=>n.id===item.j);
 if(!a||!b)return null;
 const L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
 const density=(item.sectionType==='steel_custom'?model.steel.density:model.material.density)||24;
 const secA=(item.sectionType==='steel_custom'?(item.A||0.002):(item.b||0.25)*(item.h||0.45));
 const swKN=secA*density*L,swKNm=secA*density;
 if(item.kind==='column'){
  const isTopB=b.y>=a.y;
  const topNode=isTopB?b:a,baseNode=isTopB?a:b;
  const framingBeams=model.members.filter(m=>m.id!==item.id&&(m.i===topNode.id||m.j===topNode.id)&&m.kind==='beam');
  const beamTransfers=[];let totalBeamReactionKN=0;
  for(const bm of framingBeams){
   const bmRes=act?.members?.[bm.id];
   let vEnd=0;
   if(bmRes&&bmRes.samples?.length){
    vEnd=(bm.i===topNode.id)?Math.abs(bmRes.samples[0].Vy):Math.abs(bmRes.samples[bmRes.samples.length-1].Vy);
   }else{
    const bmA=(bm.b||0.25)*(bm.h||0.45);
    vEnd=(bmA*density*4)/2;
   }
   beamTransfers.push({id:bm.id,shearKN:vEnd});
   totalBeamReactionKN+=vEnd;
  }
  const topNodalLoads=model.nodalLoads.filter(l=>l.node===topNode.id);
  let topNodeFyKN=0;
  for(const nl of topNodalLoads)topNodeFyKN+=(nl.fy||0);
  const framingIds=new Set(framingBeams.map(x=>x.id));
  const floorTransfers=result?.coverage?.floorLoadTransfers?.filter(p=>framingIds.has(p.member))||[];
  let totalSlabAreaM2=0;
  for(const ft of floorTransfers)totalSlabAreaM2+=(ft.areaM2/2);
  const baseReaction=act?.nodes?.[baseNode.id]?.reaction;
  const baseRyKN=baseReaction?baseReaction[1]:null;
  const axialMaxKN=memRes?.samples?Math.max(...memRes.samples.map(s=>Math.abs(s.N))):(totalBeamReactionKN+swKN);
  return{type:'column',topNode:topNode.id,baseNode:baseNode.id,framingBeams:beamTransfers,totalBeamReactionKN,topNodeFyKN:Math.abs(topNodeFyKN),selfWeightKN:swKN,axialMaxKN,baseRyKN,slabAreaM2:totalSlabAreaM2,L,secA};
 }else if(item.kind==='beam'){
  const memberLoads=model.memberLoads.filter(l=>l.member===item.id);
  let userQy=0;for(const l of memberLoads)userQy+=(l.qy||0);
  const floorTransfers=result?.coverage?.floorLoadTransfers?.filter(p=>p.member===item.id)||[];
  let slabQy=0;const slabSources=[];
  for(const ft of floorTransfers){slabQy+=(ft.qyKNm||0);slabSources.push(ft.source);}
  const totalQyKNm=Math.abs(userQy)+Math.abs(slabQy)+swKNm;
  const totalWeightKN=totalQyKNm*L;
  const vI=memRes?.samples?Math.abs(memRes.samples[0].Vy):(totalWeightKN/2);
  const vJ=memRes?.samples?Math.abs(memRes.samples[memRes.samples.length-1].Vy):(totalWeightKN/2);
  const mzMax=memRes?.samples?Math.max(...memRes.samples.map(s=>Math.abs(s.Mz))):0;
  const mzMid=memRes?.samples?memRes.samples[Math.floor(memRes.samples.length/2)].Mz:0;
  const mzI=memRes?.samples?memRes.samples[0].Mz:0;
  const mzJ=memRes?.samples?memRes.samples[memRes.samples.length-1].Mz:0;
  return{type:'beam',userQyKNm:Math.abs(userQy),slabQyKNm:Math.abs(slabQy),slabSources:[...new Set(slabSources)],swKNm,totalQyKNm,totalWeightKN,vIKN:vI,vJKN:vJ,mzMaxKNm:mzMax,mzMidKNm:mzMid,mzIKNm:mzI,mzJKNm:mzJ,L,secA};
 }else{
  const axialKN=memRes?.samples?memRes.samples[0].N:0;
  return{type:'roof',axialKN,selfWeightKN:swKN,L,secA};
 }
}
function renderSelection(){
 const box=$('selection');box.replaceChildren();
 if(!selected){box.textContent='คลิกโหนด สมาชิก พื้น หรือฐานในภาพ';return;}
 const item=model[selected.kind]?.find(x=>x.id===selected.id);
 if(!item){selected=null;return renderSelection();}
 const mark=selected.kind==='members'?getMemberMark(item):selected.kind==='foundations'?getFoundationMark(item):'';
 const title=mark?`${mark} (${item.id})`:item.id;
 box.append(el('b',title),el('div',classification(selected.kind,item)));
 if(selected.kind==='nodes')box.append(el('div',`X ${item.x??'—'} · Y ${item.y??'—'} · Z ${item.z??'—'} m`));
 else if(selected.kind==='members'){
  const a=model.nodes.find(n=>n.id===item.i),b=model.nodes.find(n=>n.id===item.j);
  box.append(el('div',`${item.i} → ${item.j}`));
  if(a&&b){
   const ax=getMemberLocalAxes(a,b,item.rotation||0);
   const info=el('div');info.className='local-axes-info';
   info.innerHTML=`<b>แกนเฉพาะตัว (Local Axes):</b><br><span style="color:#ef4444">■ x_L: [${ax.x.map(v=>fmt(v,3)).join(', ')}] (ยาว)</span><span style="color:#22c55e">■ y_L: [${ax.y.map(v=>fmt(v,3)).join(', ')}] (ลึก h)</span><span style="color:#3b82f6">■ z_L: [${ax.z.map(v=>fmt(v,3)).join(', ')}] (กว้าง b)</span><span>ยาว ${fmt(ax.L)} m · หมุน ${item.rotation||0}°</span>`;
   box.append(info);
   if(item.kind==='beam'&&item.behavior==='frame'){
    const tool=el('div');tool.className='reference-node-tool';
    tool.append(el('b','วางโหนดอ้างอิงบนคาน'),el('small','เลือกปลายคานที่ต่อกับเสา แล้ววัดระยะตามแนวคาน (m)'));
    const from=el('select');from.setAttribute('aria-label','ปลายคานอ้างอิง');
    for(const n of [a,b]){const option=el('option',`${n.id} · X ${fmt(n.x)} Y ${fmt(n.y)} Z ${fmt(n.z)}`);option.value=n.id;from.append(option);}
    const offset=el('input');offset.type='number';offset.min='0.001';offset.step='0.001';offset.placeholder=`ระยะจากปลายคาน (0–${fmt(ax.L)} m)`;offset.setAttribute('aria-label','ระยะตามแนวคาน (เมตร)');
    const button=el('button','สร้างโหนดและแบ่งคาน');button.type='button';
    button.onclick=()=>{if(offset.value.trim()==='')return status('กรอกระยะจากปลายคานเป็นเมตรก่อน','error');commitReferenceNode(item.id,from.value,Number(offset.value));};
    tool.append(from,offset,button);
    if(model.slabs.some(s=>['support1','support2','support3','support4'].some(key=>s[key]===item.id))){button.disabled=true;tool.append(el('small','คานนี้รองรับขอบพื้นอยู่ ต้องจัดการการถ่ายโหลดพื้นก่อนแบ่งคาน'));}
    box.append(tool);
   }
   const bd=getMemberLoadBreakdown(item);
   if(bd){
    const card=el('div');card.className='load-breakdown';
    if(bd.type==='column'){
     const bmLines=bd.framingBeams.map(x=>{
      const bm=model.members.find(m=>m.id===x.id);
      const bmMark=bm?getMemberMark(bm):x.id;
      return `<div class="load-item" style="padding-left:10px;font-size:10px"><span class="lbl">└ คาน ${bmMark} (${x.id}):</span><span class="val">${fmt(quantity(x.shearKN,'force'))} ${unitLabel('force')}</span></div>`;
     }).join('');
     const topLoadLine=bd.topNodeFyKN>0?`<div class="load-item"><span class="lbl">โหลดหัวเสา (${bd.topNode}):</span><span class="val">${fmt(quantity(bd.topNodeFyKN,'force'))} ${unitLabel('force')}</span></div>`:'';
     const slabLine=bd.slabAreaM2>0?`<div class="load-item"><span class="lbl">พื้นที่รับน้ำหนักพื้น:</span><span class="val">~${fmt(bd.slabAreaM2,1)} m²</span></div>`:'';
     const ryLine=bd.baseRyKN!=null?`<div class="load-item" style="margin-top:4px"><span class="lbl">แรงปฏิกิริยาฐาน (${bd.baseNode}):</span><span class="val" style="color:#22C55E">Ry = ${fmt(quantity(bd.baseRyKN,'force'))} ${unitLabel('force')}</span></div>`:'';
     const tfVal=(quantity(bd.axialMaxKN,'force')/1000).toFixed(2);
     card.innerHTML=`<b>การถ่ายน้ำหนักลงเสา (Column Load Path)</b><div class="load-item"><span class="lbl">แรงเฉือนจากคานบน:</span><span class="val">${fmt(quantity(bd.totalBeamReactionKN,'force'))} ${unitLabel('force')}</span></div>${bmLines}${topLoadLine}${slabLine}<div class="load-item"><span class="lbl">น้ำหนักตัวเสา:</span><span class="val">${fmt(quantity(bd.selfWeightKN,'force'))} ${unitLabel('force')}</span></div><div class="load-sum"><span>รวมน้ำหนักกดลงเสา (P):</span><span>${fmt(quantity(bd.axialMaxKN,'force'))} ${unitLabel('force')} (${tfVal} tf)</span></div>${ryLine}`;
    }else if(bd.type==='beam'){
     const slabLine=bd.slabQyKNm>0?`<div class="load-item"><span class="lbl">น้ำหนักพื้น (${bd.slabSources.join(',')}):</span><span class="val">${fmt(quantity(bd.slabQyKNm,'line'))} ${unitLabel('line')}</span></div>`:'';
     const userLine=bd.userQyKNm>0?`<div class="load-item"><span class="lbl">โหลดกระจายเพิ่ม:</span><span class="val">${fmt(quantity(bd.userQyKNm,'line'))} ${unitLabel('line')}</span></div>`:'';
     card.innerHTML=`<b>น้ำหนักบรรทุกบนคาน (Beam Loads)</b><div class="load-item"><span class="lbl">น้ำหนักตัวคาน:</span><span class="val">${fmt(quantity(bd.swKNm,'line'))} ${unitLabel('line')}</span></div>${slabLine}${userLine}<div class="load-sum"><span>รวมโหลดกระจาย (q):</span><span>${fmt(quantity(bd.totalQyKNm,'line'))} ${unitLabel('line')} (รวม ${fmt(quantity(bd.totalWeightKN,'force'))} ${unitLabel('force')})</span></div><div class="load-item" style="margin-top:4px"><span class="lbl">ถ่ายลงเสาที่โหนด ${item.i}:</span><span class="val">${fmt(quantity(bd.vIKN,'force'))} ${unitLabel('force')}</span></div><div class="load-item"><span class="lbl">ถ่ายลงเสาที่โหนด ${item.j}:</span><span class="val">${fmt(quantity(bd.vJKN,'force'))} ${unitLabel('force')}</span></div>`;
    }else{
     const sign=bd.axialKN>=0?'แรงดึง Tension':'แรงอัด Compression';
     card.innerHTML=`<b>แรงในชิ้นส่วนโครงหลังคา</b><div class="load-item"><span class="lbl">น้ำหนักตัวเอง:</span><span class="val">${fmt(quantity(bd.selfWeightKN,'force'))} ${unitLabel('force')}</span></div><div class="load-sum"><span>แรงตามแกน (N):</span><span>${fmt(quantity(Math.abs(bd.axialKN),'force'))} ${unitLabel('force')} (${sign})</span></div>`;
    }
    box.append(card);
    const act=result?.combinations?.[$('resultCombo')?.value];
    const mRes=act?.members?.[item.id];
    if(mRes?.samples?.length){
     const pillBox=el('div');pillBox.style.cssText='margin-top:6px;display:flex;gap:4px;flex-wrap:wrap';
     const mxMz=Math.max(...mRes.samples.map(s=>Math.abs(s.Mz)));
     const mxVy=Math.max(...mRes.samples.map(s=>Math.abs(s.Vy)));
     const mxN=Math.max(...mRes.samples.map(s=>Math.abs(s.N)));
     pillBox.innerHTML=`<span class="force-pill">Mz = ${fmt(quantity(mxMz,'moment'))} ${unitLabel('moment')}</span><span class="force-pill">Vy = ${fmt(quantity(mxVy,'force'))} ${unitLabel('force')}</span><span class="force-pill">N = ${fmt(quantity(mxN,'force'))} ${unitLabel('force')}</span>`;
     box.append(pillBox);
    }
   }
  }
 }else if(selected.kind==='foundations'){
   const act=result?.combinations?.[$('resultCombo')?.value];
   let totalRyKN=0;
   for(const nid of (item.nodes||[])){
    const r=act?.nodes?.[nid]?.reaction;
    if(r&&r[1]!=null)totalRyKN+=r[1];
   }
   const pCount=item.pileCount||(item.type==='pile_cap'?4:0);
   const pCapKN=item.pileCapacity||250;
   const pLen=item.pileLength||12;
   const pCapTon=(pCapKN/9.80665).toFixed(1);
   const loadPerPileKN=pCount>0?(totalRyKN/pCount):0;
   const loadPerPileTon=(loadPerPileKN/9.80665).toFixed(2);
   const dcRatio=pCapKN>0?(loadPerPileKN/pCapKN):0;
   const fCard=el('div');fCard.className='load-breakdown';
   let pileHtml='';
   if(pCount>0){
    const dcColor=dcRatio>1.0?'#ef4444':dcRatio>0.8?'#f59e0b':'#22c55e';
    const dcStatus=dcRatio<=1.0?'✓ ปลอดภัย':'✗ เกินกำลัง';
    pileHtml=`<div class="load-item"><span class="lbl">ชนิดฐาน:</span><span class="val">ฐานหัวเสาเข็ม (${pCount} ต้น)</span></div><div class="load-item"><span class="lbl">ขนาดเสาเข็ม:</span><span class="val">∅ 0.25 m × ยาว ${pLen} m</span></div><div class="load-item"><span class="lbl">กำลังรับน้ำหนักปลอดภัย:</span><span class="val">${fmt(quantity(pCapKN,'force'))} ${unitLabel('force')} (~${pCapTon} tf/ต้น)</span></div><div class="load-sum"><span>น้ำหนักกดต่อต้น (P/n):</span><span>${fmt(quantity(loadPerPileKN,'force'))} ${unitLabel('force')} (~${loadPerPileTon} tf/ต้น)</span></div><div class="load-item" style="margin-top:4px"><span class="lbl">อัตราส่วนรับแรง (D/C):</span><span class="val" style="color:${dcColor};font-weight:bold">${(dcRatio*100).toFixed(1)}% (${dcStatus})</span></div>`;
   }else{
    pileHtml=`<div class="load-item"><span class="lbl">ชนิดฐาน:</span><span class="val">ฐานแผ่เดี่ยว (Isolated Footing)</span></div>`;
   }
   const totalTon=(totalRyKN/9.80665).toFixed(2);
   fCard.innerHTML=`<b>ข้อมูลฐานรากและเสาเข็ม (Foundation & Piles)</b><div class="load-item"><span class="lbl">ขนาดฐาน (bx × bz × h):</span><span class="val">${item.bx||1.4} × ${item.bz||1.4} × ${item.depth||0.5} m</span></div><div class="load-item"><span class="lbl">โหนดรองรับ:</span><span class="val">${item.nodes.join(', ')}</span></div><div class="load-item"><span class="lbl">แรงปฏิกิริยารวม (Ry):</span><span class="val" style="color:#22c55e">Ry = ${fmt(quantity(totalRyKN,'force'))} ${unitLabel('force')} (~${totalTon} tf)</span></div>${pileHtml}`;
   box.append(fCard);
  }else box.append(el('div','โหนด: '+item.nodes.join(', ')));
 const btn=el('button','แก้ไขในตาราง');
 btn.onclick=()=>{tab=selected.kind==='members'?memberTab(item):selected.kind;renderTable();};
 box.append(btn);
}
function addRow(){const collection=groupFor(tab);if(['beams','columns','roof'].includes(tab)){status('ใช้ช่องเชื่อมคาน / เสา / หลังคาด้านซ้าย เพื่อเลือกสองโหนด');return;}if((tab==='nodalLoads'&&!model.nodes.length)||(tab==='memberLoads'&&!model.members.length))return status('สร้างโหนดและสมาชิกก่อน','error');mutate(()=>{if(tab==='slabs')model.slabs.push(slabRecord(nextId('S',model.slabs)));if(tab==='foundations')model.foundations.push(foundationRecord(nextId('F',model.foundations)));if(tab==='nodalLoads')model.nodalLoads.push({node:model.nodes[0].id,case:'D',fx:0,fy:0,fz:0,mx:0,my:0,mz:0});if(tab==='memberLoads')model.memberLoads.push({member:model.members[0].id,case:'D',axes:'local',qx:0,qy:0,qz:0});if(tab==='combinations'){let i=1;while(model.combinations.some(c=>c.name==='Combo'+i))i++;model.combinations.push({name:'Combo'+i,D:1,L:1,W:0});}});}
function deleteRow(collection,row){if(collection==='combinations'&&model.combinations.length===1)return status('ต้องมีชุดน้ำหนักอย่างน้อยหนึ่งชุด','error');if(['nodes','members','slabs','foundations'].includes(collection)&&!confirm(`ลบ ${row.id}? รายการที่อ้างอิงจะถูกปรับเป็นรอตรวจ`))return;mutate(()=>{let removed=[];if(collection==='nodes'){removed=model.members.filter(m=>m.i===row.id||m.j===row.id).map(m=>m.id);model.members=model.members.filter(m=>!removed.includes(m.id));model.nodalLoads=model.nodalLoads.filter(l=>l.node!==row.id);for(const e of [...model.slabs,...model.foundations])if(e.nodes.includes(row.id)){e.nodes=e.nodes.filter(n=>n!==row.id);e.mode='pending';}}if(collection==='members')removed=[row.id];if(removed.length){model.memberLoads=model.memberLoads.filter(l=>!removed.includes(l.member));for(const s of model.slabs)for(const key of ['support1','support2'])if(removed.includes(s[key])){s[key]='';s.mode='pending';}}model[collection].splice(model[collection].indexOf(row),1);});}
function renderTable(){document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('table').replaceChildren();$('tableActions').replaceChildren();if(tab==='results')return renderResultsTable();if(tab==='coverage')return renderCoverage();if(tab==='design')return renderDesignTable();const collection=groupFor(tab);$('tableActions').append(el('span',notes[tab]));if(collection==='members'&&selected?.kind==='members'&&rowsFor(tab).some(m=>m.id===selected.id&&m.kind==='beam')){const shortcut=el('button','📍 วางโหนดจากปลายคาน');shortcut.id='referenceQuickAction';shortcut.onclick=()=>{const tool=document.querySelector('#selection .reference-node-tool');tool?.scrollIntoView({block:'center',behavior:'auto'});tool?.querySelector('input')?.focus({preventScroll:true});};$('tableActions').prepend(shortcut);}if(['slabs','foundations','nodalLoads','memberLoads','combinations'].includes(tab)){const add=el('button','+ เพิ่มแถว');add.onclick=addRow;$('tableActions').prepend(add);}const table=el('table'),hr=el('tr'),head=el('thead');for(const [,label,,q]of specs[tab])hr.append(el('th',label+(q?' ('+unitLabel(q)+')':'')));hr.append(el('th','สถานะ / ลบ'));head.append(hr);table.append(head);const body=el('tbody');
 for(const [index,row]of rowsFor(tab).entries()){const tr=el('tr');if(selected?.kind===collection&&selected.id===row.id)tr.classList.add('selected');for(const [key,,type,q='none']of specs[tab]){const td=el('td');if(type==='id'){let displayId=row[key];if(collection==='members'){const m=model.members.find(x=>x.id===row[key]);if(m)displayId=`${getMemberMark(m)} (${m.id})`;}else if(collection==='foundations'){const f=model.foundations.find(x=>x.id===row[key]);if(f)displayId=`${getFoundationMark(f)} (${f.id})`;}const btn=el('button',displayId);btn.onclick=()=>{selected={kind:collection,id:row.id};renderSelection();drawModel();renderTable();};td.append(btn);}else{const isSelect=type.startsWith('enum:')||['node','member','beam','case'].includes(type);const input=el(isSelect?'select':'input');input.setAttribute('aria-label',`${row.id||index+1} ${key}`);if(isSelect){let choices={};if(type.startsWith('enum:'))choices=catalogs[type.slice(5)];else if(type==='case')choices={D:'D',L:'L',W:'W'};else{const items=type==='node'?model.nodes:model.members.filter(m=>type!=='beam'||m.kind==='beam');if(type==='beam')choices['']='เลือกคาน';for(const item of items)choices[item.id]=item.id;}for(const [value,label]of Object.entries(choices)){const o=el('option',label);o.value=value;input.append(o);}input.value=row[key];}else if(type==='bool'){input.type='checkbox';input.checked=row.restraints[Number(key.slice(1))];}else{input.type=type==='number'?'number':'text';input.value=type==='number'?editValue(row[key],q):type==='nodes'?row[key].join(','):row[key];if(type==='number')input.step='any';if(type==='text')input.maxLength=key==='note'?500:120;if(type==='nodes')input.style.minWidth='170px';}if(collection==='members'&&((row.sectionType==='rc_rect'&&['A','Iy','Iz','J'].includes(key))||(row.sectionType==='steel_custom'&&['b','h'].includes(key))))input.disabled=true;
 input.onchange=()=>{const value=input.value;const nodeValues=type==='nodes'?value.split(',').map(s=>s.trim()).filter(Boolean):null;if(nodeValues&&(new Set(nodeValues).size!==nodeValues.length||nodeValues.some(id=>!model.nodes.some(n=>n.id===id)))){status('ใช้โหนดที่มีอยู่และไม่ซ้ำ คั่นด้วยจุลภาค','error');renderTable();return;}mutate(()=>{if(type==='bool')row.restraints[Number(key.slice(1))]=input.checked;else if(type==='nodes')row[key]=nodeValues;else row[key]=type==='number'?canonical(num(value),q):value;});};td.append(input);}tr.append(td);}const td=el('td');td.append(el('span',classification(collection,row)));const del=el('button','ลบ');del.onclick=()=>deleteRow(collection,row);td.append(del);tr.append(td);body.append(tr);}table.append(body);$('table').append(table);}
function renderResultsTable(){const active=result?.combinations[$('resultCombo').value];if(!active){$('table').append(el('p','ยังไม่มีผลของโมเดลปัจจุบัน'));return;}$('tableActions').textContent='การเคลื่อนที่และแรงปฏิกิริยาที่โหนด · GLOBAL';const table=el('table'),tr=el('tr');for(const h of ['โหนด','uX mm','uY mm','uZ mm','RX rad','RY rad','RZ rad',...['FX','FY','FZ'].map(x=>x+' '+unitLabel('force')),...['MX','MY','MZ'].map(x=>x+' '+unitLabel('moment'))])tr.append(el('th',h));table.append(tr);for(const [id,n]of Object.entries(active.nodes)){const r=el('tr');for(const v of [id,...n.translationMM,...n.displacement.slice(3),...n.reaction.map((v,i)=>quantity(v,i<3?'force':'moment'))])r.append(el('td',typeof v==='number'?fmt(v,6):v));table.append(r);}$('table').append(table);}
function renderCoverage(){$('tableActions').textContent='แยกข้อมูลที่กรอก การนำไปวิเคราะห์ และงานออกแบบที่ยังไม่ทำ';const table=el('table');const head=el('tr');for(const h of ['ชิ้นส่วน','สถานะ','รายละเอียด'])head.append(el('th',h));table.append(head);for(const collection of ['members','slabs','foundations'])for(const item of model[collection]){const r=el('tr');r.append(el('td',item.id),el('td',classification(collection,item)),el('td',collection==='foundations'?'ไม่รวมดิน/เข็ม/กำลังฐาน/นน.ตัวฐานใน frame':collection==='slabs'?'ยังไม่มี plate stiffness / diaphragm / RC design':'ยังไม่ตรวจ capacity หรือเหล็กเสริม'));table.append(r);}for(const p of result?.coverage?.floorLoadTransfers||[]){const r=el('tr');r.append(el('td',p.source+' → '+p.member),el('td',p.case),el('td',`พื้นที่ ${fmt(p.areaM2)} m² × ${fmt(quantity(p.pressureKNm2,'pressure'))} ${unitLabel('pressure')} → qY ${fmt(quantity(p.qyKNm,'line'))} ${unitLabel('line')}`));table.append(r);}$('table').append(table);}
function renderResults(){const previous=$('resultCombo').value;options($('resultCombo'),result?Object.keys(result.combinations):[],previous);options($('resultMember'),result?model.members.map(m=>m.id):[],$('resultMember').value);$('exportResults').disabled=!result;$('metrics').replaceChildren();const active=result?.combinations[$('resultCombo').value];if(!active){$('metrics').append(el('p','ผลจะปรากฏหลังวิเคราะห์'));drawDiagram();return;}let max=0;for(const n of Object.values(active.nodes))max=Math.max(max,Math.hypot(...n.translationMM));const eq=active.equilibrium;for(const [title,value,label]of [['การเคลื่อนที่โหนดสูงสุด',fmt(max,4),'mm'],['สมดุลแรง · residual สูงสุด',quantity(Math.max(...eq.forceResidualKN.map(Math.abs)),'force').toExponential(2),unitLabel('force')],['สมดุลโมเมนต์ · residual สูงสุด',quantity(Math.max(...eq.momentResidualKNm.map(Math.abs)),'moment').toExponential(2),unitLabel('moment')]]){const div=el('div');div.className='metric';div.append(el('span',title),el('b',value),el('small',' '+label));$('metrics').append(div);}drawDiagram();}
function drawDiagram(){const member=result?.combinations[$('resultCombo').value]?.members[$('resultMember').value];$('diagram').replaceChildren();$('axes').textContent='';const types={Mz:['โมเมนต์','moment'],My:['โมเมนต์','moment'],Vy:['แรงเฉือน','force'],Vz:['แรงเฉือน','force'],N:['แรงตามแกน','force'],T:['แรงบิด','moment'],dy:['โก่ง local y','length'],dz:['โก่ง local z','length']};for(const o of $('diagramType').options){const [label,kind]=types[o.value];o.textContent=o.value+' — '+label+' ('+unitLabel(kind)+')';}if(!member){$('diagram').textContent='ยังไม่มีผล';return;}const key=$('diagramType').value,q=types[key][1],values=member.samples.map(s=>quantity(s[key],q)),max=Math.max(...values.map(Math.abs),1e-12),len=member.length;const points=member.samples.map((s,i)=>`${20+s.x/len*200},${80-values[i]/max*52}`).join(' ');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 170');svg.innerHTML=`<line x1="20" y1="80" x2="220" y2="80" stroke="#41566f"/><polyline points="${points}" fill="none" stroke="#51dcba" stroke-width="2"/><text x="20" y="150" fill="#9fb5cc" font-size="10">i / 0</text><text x="165" y="150" fill="#9fb5cc" font-size="10">j / ${fmt(len)} m</text><text x="12" y="18" fill="#e0eaf5" font-size="9">${key}: ${fmt(Math.min(...values),4)} to ${fmt(Math.max(...values),4)} ${unitLabel(q)}</text>`;$('diagram').append(svg);const axInfo=member.localAxes?`<div style="margin:4px 0;line-height:1.4"><span style="color:#ef4444">🔴 x_L = [${member.localAxes[0].map(v=>fmt(v,3)).join(', ')}]</span><br><span style="color:#22c55e">🟢 y_L = [${member.localAxes[1].map(v=>fmt(v,3)).join(', ')}]</span><br><span style="color:#3b82f6">🔵 z_L = [${member.localAxes[2].map(v=>fmt(v,3)).join(', ')}]</span></div>`:'';$('axes').innerHTML=`<b>แกนชิ้นส่วนเฉพาะตัว (Local Axes):</b>${axInfo}<div style="color:#8b949e;font-size:10px">แรง N, Vy, Vz, My, Mz, T และการแอ่นตัว dy, dz อ้างอิงแกน local · เครื่องหมายตาม PyNite</div>`;}
function render(){
 $('memberB').value=editValue(memberDraft.b,'section');$('memberH').value=editValue(memberDraft.h,'section');
 $('projectName').value=model.name;$('unitSystem').value=model.displayUnits.system;$('forceUnit').value=model.displayUnits.force;$('forceUnit').disabled=model.displayUnits.system==='si';$('unitSummary').textContent=`พิกัด m · หน้าตัด ${unitLabel('section')} · แรง ${unitLabel('force')} · โหลด ${unitLabel('line')} · ${unitLabel('stress')}`;
 for(const [id,material,key,q]of [['E','material','E','stress'],['nu','material','nu','none'],['density','material','density','density'],['steelE','steel','E','stress'],['steelNu','steel','nu','none'],['steelDensity','steel','density','density']])$(id).value=editValue(model[material][key],q);
 for(const [id,text,q]of [['ELabel','E คอนกรีต','stress'],['densityLabel','นน.คอนกรีต','density'],['steelELabel','E เหล็ก','stress'],['steelDensityLabel','นน.เหล็ก','density'],['memberBLabel','b ตาม local z','section'],['memberHLabel','h ตาม local y','section']])$(id).textContent=text+' ('+unitLabel(q)+')';
  $('selfWeight').checked=model.selfWeight;for(const id of ['memberI','memberJ'])options($(id),model.nodes.map(n=>n.id),$(id).value);$('undo').disabled=!history.length;renderPlanControls();renderResults();drawModel();renderSelection();renderTable();
}
async function api(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw new Error(body.error||'คำขอไม่สำเร็จ');return body;}
$('projectName').onchange=()=>mutate(()=>model.name=$('projectName').value);
for(const [id,material,key,q]of [['E','material','E','stress'],['nu','material','nu','none'],['density','material','density','density'],['steelE','steel','E','stress'],['steelNu','steel','nu','none'],['steelDensity','steel','density','density']])$(id).onchange=()=>mutate(()=>model[material][key]=canonical(num($(id).value),q));
$('selfWeight').onchange=()=>mutate(()=>model.selfWeight=$('selfWeight').checked);
for(const [id,key]of [['memberB','b'],['memberH','h']])$(id).onchange=()=>{memberDraft[key]=canonical(num($(id).value),'section');};
for(const id of ['unitSystem','forceUnit'])$(id).onchange=()=>{model.displayUnits={system:$('unitSystem').value,force:$('forceUnit').value};persist();render();};
if ($('generate')) $('generate').onclick=()=>{cancelInteraction();const values=['gx','gz','nx','nz','gh','nf'].map(id=>Number($(id).value)),[sx,sz,nx,nz,height,floors]=values;if(values.some(v=>!Number.isFinite(v)||v<=0)||![nx,nz,floors].every(Number.isInteger)||nx>4||nz>4||floors>3||(nx+1)*(nz+1)*(floors+1)>100)return status('สูงสุด 4×4 ช่วง, 3 ชั้น, 100 โหนด','error');if(model.nodes.length&&!confirm('แทนโมเดลปัจจุบันด้วยกริดใหม่? ย้อนกลับได้ด้วย Undo'))return;mutate(()=>{const units=model.displayUnits;model=grid(sx,sz,nx,nz,height,floors);model.displayUnits=units;selected=null;});fit();};
$('example').onclick=async()=>{cancelInteraction();if(model.nodes.length&&!confirm('เปิดตัวอย่างครบอาคารแทนโมเดลปัจจุบัน? ย้อนกลับได้ด้วย Undo'))return;const rev=revision;try{const response=await fetch('demo-v02.json');const p=await response.json();await api('/api/validate',p);if(revision!==rev)return status('โมเดลเปลี่ยนระหว่างเปิดตัวอย่าง กรุณาเปิดอีกครั้ง');mutate(()=>{model=p;selected=null;});fit();status('ตัวอย่างเพื่อทดสอบ: พื้นทางเดียว + ฐานรองรับสมมติ + หลังคา frame เหล็ก ไม่ใช่แบบก่อสร้าง');}catch(e){status(e.message,'error');}};
$('new').onclick=()=>{cancelInteraction();if(model.nodes.length&&!confirm('สร้างโมเดลว่าง? ย้อนกลับได้ด้วย Undo'))return;mutate(()=>{const units=model.displayUnits;model=empty();model.displayUnits=units;selected=null;});};
$('addNode').onclick=()=>{const [x,y,z]=['nodeX','nodeY','nodeZ'].map(id=>num($(id).value));if([x,y,z].some(v=>v===null||!Number.isFinite(v)))return status('กรอกพิกัดครบ','error');if(model.nodes.some(n=>Math.hypot(n.x-x,n.y-y,n.z-z)<1e-6))return status('มีโหนดตำแหน่งนี้แล้ว','error');mutate(()=>{const id=nextId('N',model.nodes);model.nodes.push({id,x,y,z,restraints:Array(6).fill(false)});selected={kind:'nodes',id};tab='nodes';});};
$('addMember').onclick=()=>{const i=$('memberI').value,j=$('memberJ').value,kind=$('memberKind').value,b=memberDraft.b,h=memberDraft.h,rot=num($('memberRot')?.value)||0,validation=validateMemberEndpoints(model.nodes,model.members,i,j);if(!validation.ok)return status(validation.reason,'error');if(kind!=='roof'&&(!Number.isFinite(b)||!Number.isFinite(h)||b<.01||h<.01))return status('เลือกสองโหนดและกรอกหน้าตัด คสล. ให้ครบ','error');mutate(()=>{const m=memberRecord(nextId('M',model.members),i,j,kind);if(kind!=='roof'){m.b=b;m.h=h;}m.rotation=rot;model.members.push(m);selected={kind:'members',id:m.id};tab=memberTab(m);});};
$('addSlab').onclick=()=>{tab='slabs';addRow();};$('addFoundation').onclick=()=>{tab='foundations';addRow();};
$('undo').onclick=()=>{cancelInteraction(false);if(!history.length)return;model=history.pop();revision++;result=null;selected=null;persist();render();status('ย้อนแล้ว · ต้องวิเคราะห์ใหม่');};
$('tabs').onclick=e=>{if(e.target.dataset.tab){tab=e.target.dataset.tab;renderTable();}};
$('fit').onclick=fit;for(const id of ['labels','deformed','localAxes','diagram3d'])$(id).onchange=drawModel;$('view3d').onclick=()=>setViewMode('3d');$('viewPlan').onclick=()=>setViewMode('plan');$('planLevel').onchange=()=>{const next=Number($('planLevel').value);if(!Number.isFinite(next))return;cancelInteraction(false);planLevelY=next;renderPlanControls();if(viewMode==='plan')fitPlan();drawModel();};$('setPlanElevation').onclick=()=>{const input=$('planElevation');if(input.value.trim()===''||!Number.isFinite(Number(input.value)))return status('กรอกระดับ Y เป็นตัวเลขเมตรก่อน','error');const y=Number(input.value);if(Math.abs(y)>10000)return status('ระดับ Y ต้องอยู่ในช่วง ±10000 m','error');cancelInteraction(false);planLevelY=Number(y.toFixed(3));renderPlanControls();if(viewMode==='plan')fitPlan();drawModel();status(`ตั้งระดับวางโหนด Y ${fmt(planLevelY)} m · คลิก วางโหนด แล้วคลิกบนผัง`);};$('planElevation').onkeydown=e=>{if(e.key==='Enter')$('setPlanElevation').click();};$('planSelectTool').onclick=()=>setPlanTool('select');$('planNodeTool').onclick=()=>setPlanTool('node');$('planBeamTool').onclick=()=>setPlanTool('beam');document.addEventListener('keydown',event=>{if(event.key==='Escape')cancelInteraction();});$('resultCombo').onchange=()=>{renderResults();drawModel();if(tab==='results')renderTable();};$('resultMember').onchange=()=>{drawDiagram();if($('diagram3d')?.checked)drawModel();};$('diagramType').onchange=()=>{drawDiagram();if($('diagram3d')?.checked)drawModel();};
$('save').onclick=async()=>{try{const data=await api('/api/save',clone(model));$('saveStatus').textContent='บันทึกไฟล์แล้ว: '+data.path;status('บันทึกไฟล์แล้ว: '+data.filename);}catch(err){status('บันทึกไม่ได้: '+err.message,'error');}};
$('load').onclick=()=>{cancelInteraction();$('file').click();};$('file').onchange=async()=>{cancelInteraction();const file=$('file').files[0];if(!file)return;const rev=revision;try{if(file.size>1_000_000)throw new Error('ไฟล์ใหญ่กว่า 1 MB');const raw=JSON.parse(await file.text()),validated=await api('/api/validate',raw);if(rev!==revision)throw new Error('โมเดลเปลี่ยนระหว่างเปิดไฟล์');mutate(()=>{model=validated.model;selected=null;});fit();status('เปิดโมเดลแล้ว · ต้องวิเคราะห์ใหม่');}catch(err){status('เปิดไฟล์ไม่ได้: '+err.message,'error');}finally{$('file').value='';}};
$('analyze').onclick=async()=>{if(busy)return;const rev=revision,snapshot=clone(model);busy=true;result=null;renderResults();drawModel();if(tab==='results'||tab==='coverage')renderTable();$('analyze').disabled=true;$('analyze').textContent='กำลังคำนวณ…';status('ตรวจโมเดล หน่วย และการถ่ายแรง');try{const data=await api('/api/analyze',snapshot);if(rev!==revision){status('โมเดลเปลี่ยนระหว่างคำนวณ · ไม่ใช้ผลเก่า');return;}result=data;tab='results';render();status('วิเคราะห์ตามขอบเขตสำเร็จ · ตรวจสมดุล 6 แกน · ดูสถานะ/ที่มาโหลด · ยังไม่ตรวจออกแบบ','ok');}catch(err){if(rev===revision)status(err.message,'error');}finally{busy=false;$('analyze').disabled=false;$('analyze').textContent='▶ วิเคราะห์';}};
$('exportResults').onclick=async()=>{if(!result)return;const rev=revision;try{const data=await api('/api/export',clone(model));$('saveStatus').textContent='ส่งออกแล้ว: '+data.path;if(rev===revision)status('ส่งออกผลและที่มาโหลดแล้ว: '+data.filename);}catch(err){status('ส่งออกไม่ได้: '+err.message,'error');}};
document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
model=empty();try{const saved=localStorage.getItem(KEY);if(saved){const data=JSON.parse(saved);const validated=await api('/api/validate',data);if(data.schemaVersion===1)localStorage.setItem(KEY+'-v1-backup',saved);model=validated.model;status('เปิดงานเดิมแล้ว · หน่วยหน้าจอเป็นเมตริกไทย · ค่าจริงยังเดิม');}else{model=grid(4,4,1,1,3,1,true);status('ตัวอย่างศึกษา · เปิดตัวอย่างอาคารเพื่อดูพื้นและฐานราก');}}catch{status('กู้คืนไม่ได้ · ข้อมูลเดิมสำรองไว้ กรุณาเปิดไฟล์','error');try{const raw=localStorage.getItem(KEY);if(raw)localStorage.setItem(KEY+'-recovery-'+Date.now(),raw);}catch{}}
document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);$('memberB').value=editValue(.25,'section');$('memberH').value=editValue(.45,'section');
if(!model.designBasis)model.designBasis={fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9};
render();fit();
function renderDesignBasis(){const db=model.designBasis||{};const su=unitLabel('stress');if($('fcLabel'))$('fcLabel').textContent='f′c ('+su+')';if($('fyLabel'))$('fyLabel').textContent='fy ('+su+')';if($('fytLabel'))$('fytLabel').textContent='fyt ('+su+')';if($('designFc'))$('designFc').value=db.fc_mpa!=null?editValue(db.fc_mpa,'stress'):'';if($('designFy'))$('designFy').value=db.fy_mpa!=null?editValue(db.fy_mpa,'stress'):'';if($('designFyt'))$('designFyt').value=db.fyt_mpa!=null?editValue(db.fyt_mpa,'stress'):'';if($('designCover'))$('designCover').value=db.cover_mm||40;if($('designAgg'))$('designAgg').value=db.agg_mm||20;if($('designStirrup'))$('designStirrup').value=db.stirrup_mm||9;}
for(const[id,key,q]of[['designFc','fc_mpa','stress'],['designFy','fy_mpa','stress'],['designFyt','fyt_mpa','stress']]){if($(id))$(id).onchange=()=>{const v=num($(id).value);if(!model.designBasis)model.designBasis={};model.designBasis[key]=v!=null?canonical(v,q):null;persist();};}
for(const[id,key]of[['designCover','cover_mm'],['designAgg','agg_mm'],['designStirrup','stirrup_mm']]){if($(id))$(id).onchange=()=>{if(!model.designBasis)model.designBasis={};model.designBasis[key]=Number($(id).value)||0;persist();};}
function renderDesignSummary(){const box=$('designSummary');if(!box)return;box.replaceChildren();if(!designResult){box.append(el('p','กดปุ่ม "ออกแบบ ACI" เพื่อเริ่มออกแบบ'));return;}const s=designResult.summary;const c1=el('div');c1.className='card';const b1=el('span',s.overallStatus==='ALL_PASS'?'✓ ผ่านทั้งหมด':'✗ มีไม่ผ่าน');b1.className=s.overallStatus==='ALL_PASS'?'badge-pass':'badge-fail';c1.append(b1,el('div','ออกแบบ '+s.designed+' / ไม่ผ่าน '+s.fail+' / ข้าม '+s.skip),el('div',designResult.code));box.append(c1);const labels=designResult.labels||{};const grouped={};for(const[mid,label]of Object.entries(labels)){if(!grouped[label])grouped[label]=[];grouped[label].push(mid);}const c2=el('div');c2.className='card';c2.append(el('b','เบอร์สมาชิก'));for(const[label,members]of Object.entries(grouped))c2.append(el('div',label+': '+members.join(', ')));box.append(c2);for(const[mid,d]of Object.entries(designResult.members)){const card=el('div');card.className='card';const hd=el('div');hd.append(el('b',(d.label||mid)+' ('+mid+')'));const bg=el('span',d.status);bg.className=d.status==='DESIGNED'?'badge-pass':d.status==='FAIL'?'badge-fail':'badge-skip';hd.append(document.createTextNode(' '),bg);card.append(hd);if(d.type==='beam'&&d.flexure){if(d.flexure.bottom?.rebar)card.append(el('div','ล่าง: '+d.flexure.bottom.rebar.label+' φMn='+fmt(d.flexure.bottom.rebar.phi_mn)+' kN·m'));if(d.flexure.top?.rebar)card.append(el('div','บน: '+d.flexure.top.rebar.label));if(d.shear?.stirrup)card.append(el('div','ปลอก: '+d.shear.stirrup.label));}if(d.type==='column'&&d.longitudinal){card.append(el('div','เหล็กยืน: '+d.longitudinal.label+' ρ='+fmt(d.longitudinal.rho*100,2)+'%'));if(d.tie)card.append(el('div','ปลอก: '+d.tie.label));}box.append(card);
 }
 for(const[fid,d]of Object.entries(designResult.footings||{})){
  const card=el('div');card.className='card';
  const hd=el('div');hd.append(el('b',(d.label||fid)+' ('+fid+')'));
  const bg=el('span',d.status||'SKIP');bg.className=d.status==='DESIGNED'?'badge-pass':d.status==='FAIL'?'badge-fail':'badge-skip';
  hd.append(document.createTextNode(' '),bg);card.append(hd);
  if(d.pile)card.append(el('div',`เสาเข็ม: ${d.pile.count} ต้น · กด ${fmt(d.pile.load_per_pile_kn/9.80665,2)} tf/ต้น (รับได้ ${fmt(d.pile.capacity_kn/9.80665,0)} tf)`));
  if(d.flexure_x?.rebar)card.append(el('div',`เหล็กฐาน: ${d.flexure_x.rebar.label}`));
  box.append(card);
 }
 for(const[sid,d]of Object.entries(designResult.slabs||{})){
  const card=el('div');card.className='card';
  const hd=el('div');hd.append(el('b',(d.label||sid)+' ('+sid+')'));
  const bg=el('span',d.status||'SKIP');bg.className=d.status==='DESIGNED'?'badge-pass':d.status==='FAIL'?'badge-fail':'badge-skip';
  hd.append(document.createTextNode(' '),bg);card.append(hd);
  if(d.type==='two_way_slab'){
   card.append(el('div',`พื้นสองทาง คสล. หนา ${(d.thickness_mm/10).toFixed(0)} cm · ช่วง ${d.span_short_m}×${d.span_long_m} m`));
   card.append(el('div',`เหล็กเสริม: ${d.flexure_short?.label||'—'} (สั้น) / ${d.flexure_long?.label||'—'} (ยาว)`));
  }else{
   card.append(el('div',`พื้นทางเดียว หนา ${(d.thickness_mm/10).toFixed(0)} cm · เหล็ก: ${d.flexure?.label||'—'}`));
   if(d.shrinkage?.label)card.append(el('div',`กันร้าว: ${d.shrinkage.label}`));
  }
  box.append(card);
 }
 for(const[stid,d]of Object.entries(designResult.stairs||{})){
  const card=el('div');card.className='card';
  const hd=el('div');hd.append(el('b',(d.label||stid)+' (บันได คสล.)'));
  const bg=el('span',d.status||'SKIP');bg.className=d.status==='DESIGNED'?'badge-pass':d.status==='FAIL'?'badge-fail':'badge-skip';
  hd.append(document.createTextNode(' '),bg);card.append(hd);
  card.append(el('div',`แม่บันไดหนา ${(d.thickness_mm/10).toFixed(0)} cm · ลูกตั้ง ${d.riser_mm}mm / ลูกนอน ${d.tread_mm}mm`));
  card.append(el('div',`เหล็กทางลาด: ${d.flexure_main?.label||'—'} · เหล็กขวาง: ${d.distribution?.label||'—'}`));
  box.append(card);
 }
}
function renderDesignTable(){$('table').replaceChildren();$('tableActions').replaceChildren();if(!designResult){$('table').append(el('p','ยังไม่มีผลออกแบบ — กดปุ่ม "ออกแบบ ACI"'));return;}$('tableActions').append(el('span',designResult.code+' · '+designResult.version));const table=el('table');table.className='design-table';const head=el('tr');for(const h of['สมาชิก','เบอร์','ประเภท','ขนาด','เหล็กหลัก','ปลอก','Utilization','สถานะ'])head.append(el('th',h));table.append(head);for(const m of model.members){const d=designResult.members[m.id];if(!d)continue;const tr=el('tr');tr.append(el('td',m.id),el('td',d.label||getMemberMark(m)),el('td',d.type||m.kind));tr.append(el('td',m.b&&m.h?((m.b*100).toFixed(0)+'×'+(m.h*100).toFixed(0)+' cm'):'—'));let rt='—';if(d.type==='beam'){const p=[];if(d.flexure?.bottom?.rebar)p.push('ล่าง:'+d.flexure.bottom.rebar.label);if(d.flexure?.top?.rebar)p.push('บน:'+d.flexure.top.rebar.label);rt=p.join(' / ')||'—';}else if(d.type==='column'&&d.longitudinal)rt=d.longitudinal.label;tr.append(el('td',rt));let st='—';if(d.type==='beam'&&d.shear?.stirrup)st=d.shear.stirrup.label;else if(d.type==='column'&&d.tie)st=d.tie.label;tr.append(el('td',st));let util=0;if(d.type==='beam')util=Math.max(d.flexure?.bottom?.rebar?.utilization||0,d.flexure?.top?.rebar?.utilization||0);else if(d.type==='column'&&d.longitudinal)util=d.longitudinal.utilization||0;const utd=el('td');const bar=el('div');bar.className='utilization-bar';const fill=el('div');fill.className='fill '+(util>0.9?'util-red':util>0.7?'util-yellow':'util-green');fill.style.width=Math.min(100,util*100)+'%';bar.append(fill);utd.append(el('span',fmt(util*100,1)+'%'),bar);tr.append(utd);const sTd=el('td');const bge=el('span',d.status);bge.className=d.status==='DESIGNED'?'badge-pass':d.status==='FAIL'?'badge-fail':'badge-skip';sTd.append(bge);tr.append(sTd);table.append(tr);}if(designResult.footings){for(const f of model.foundations){const d=designResult.footings[f.id];if(!d)continue;const tr=el('tr');tr.append(el('td',f.id),el('td',d.label||getFoundationMark(f)));const hasPile=(f.pileCount>0||f.type==='pile_cap'||d.pile);const fType=hasPile?`ฐานเข็ม (${d.pile?.count||f.pileCount||4} ต้น)`:'ฐานแผ่';tr.append(el('td',fType));const fDim=f.bx&&f.bz?(f.bx+'×'+f.bz+' m'+(hasPile?` (ยาว ${d.pile?.length_m||f.pileLength||12}m)`:'')):'—';tr.append(el('td',fDim));tr.append(el('td',d.flexure_x?.rebar?d.flexure_x.rebar.label:'—'));let stirrupText='—';if(d.pile){const pCapTon=(d.pile.capacity_kn/9.80665).toFixed(0);const pLoadTon=(d.pile.load_per_pile_kn/9.80665).toFixed(1);stirrupText=`เข็ม ${pLoadTon}/${pCapTon} tf/ต้น`;}tr.append(el('td',stirrupText));const util=Math.max(d.punching?.utilization||0,d.pile?.utilization||0,d.flexure_x?.utilization||0);const utd=el('td');const bar=el('div');bar.className='utilization-bar';const fill=el('div');fill.className='fill '+(util>0.9?'util-red':util>0.7?'util-yellow':'util-green');fill.style.width=Math.min(100,util*100)+'%';bar.append(fill);utd.append(el('span',fmt(util*100,1)+'%'),bar);tr.append(utd);const sTd=el('td');const bge=el('span',d.status||'SKIP');bge.className=(d.status==='DESIGNED')?'badge-pass':(d.status==='FAIL')?'badge-fail':'badge-skip';sTd.append(bge);tr.append(sTd);table.append(tr);}}if(designResult.slabs){for(const s of model.slabs){const d=designResult.slabs[s.id];if(!d)continue;const isTwoWay=(d.type==='two_way_slab');const tr=el('tr');tr.append(el('td',s.id),el('td',d.label||getSlabMark(s)),el('td',isTwoWay?'พื้น คสล. สองทาง':'พื้น คสล. ทางเดียว'));const dimText=isTwoWay?`หนา ${(d.thickness_mm/10).toFixed(0)} cm (${d.span_short_m}×${d.span_long_m}m)`:`หนา ${(d.thickness_mm/10).toFixed(0)} cm (ช่วง ${d.span_m?.toFixed(1)}m)`;tr.append(el('td',dimText));const rebarText=isTwoWay?`${d.flexure_short?.label||'—'} (สั้น) / ${d.flexure_long?.label||'—'} (ยาว)`:(d.flexure?.label||'—');tr.append(el('td',rebarText));tr.append(el('td',d.shrinkage?.label?('กันร้าว: '+d.shrinkage.label):'—'));const util=isTwoWay?Math.max(d.flexure_short?.utilization||0,d.flexure_long?.utilization||0):(d.flexure?.utilization||0);const utd=el('td');const bar=el('div');bar.className='utilization-bar';const fill=el('div');fill.className='fill '+(util>0.9?'util-red':util>0.7?'util-yellow':'util-green');fill.style.width=Math.min(100,util*100)+'%';bar.append(fill);utd.append(el('span',fmt(util*100,1)+'%'),bar);tr.append(utd);const sTd=el('td');const bge=el('span',d.status||'SKIP');bge.className=(d.status==='DESIGNED')?'badge-pass':(d.status==='FAIL')?'badge-fail':'badge-skip';sTd.append(bge);tr.append(sTd);table.append(tr);}}if(designResult.stairs){for(const[stid,d]of Object.entries(designResult.stairs)){const tr=el('tr');tr.append(el('td',stid),el('td',d.label||stid),el('td','บันได คสล. (Staircase)'));tr.append(el('td',`หนา ${(d.thickness_mm/10).toFixed(0)} cm (ช่วง ${d.span_m}m, กว้าง ${d.width_m}m)`));tr.append(el('td',d.flexure_main?.label?('ทางลาด: '+d.flexure_main.label):'—'));tr.append(el('td',d.distribution?.label?('ขวาง: '+d.distribution.label):'—'));const util=d.flexure_main?.utilization||0;const utd=el('td');const bar=el('div');bar.className='utilization-bar';const fill=el('div');fill.className='fill '+(util>0.9?'util-red':util>0.7?'util-yellow':'util-green');fill.style.width=Math.min(100,util*100)+'%';bar.append(fill);utd.append(el('span',fmt(util*100,1)+'%'),bar);tr.append(utd);const sTd=el('td');const bge=el('span',d.status||'SKIP');bge.className=(d.status==='DESIGNED')?'badge-pass':(d.status==='FAIL')?'badge-fail':'badge-skip';sTd.append(bge);tr.append(sTd);table.append(tr);}}$('table').append(table);}
if($('designAll'))$('designAll').onclick=async()=>{if(busy)return;const rev=revision,snapshot=clone(model);busy=true;designResult=null;result=null;$('designAll').disabled=true;$('designAll').textContent='กำลังออกแบบ…';$('analyze').disabled=true;status('วิเคราะห์และออกแบบ ACI 318-25 ทุกชิ้นส่วน…');try{const payload={...snapshot,designBasis:model.designBasis};const data=await api('/api/design-all',payload);if(rev!==revision){status('โมเดลเปลี่ยนระหว่างออกแบบ');return;}result=data.analysis;designResult=data.design;tab='design';render();renderDesignSummary();renderDesignTable();document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));const sm=designResult.summary;status('ออกแบบเสร็จ · '+sm.designed+' ผ่าน / '+sm.fail+' ไม่ผ่าน / '+sm.skip+' ข้าม',sm.fail>0?'error':'ok');if($('colorMode'))$('colorMode').value='utilization';drawModel();}catch(err){if(rev===revision)status('ออกแบบไม่สำเร็จ: '+err.message,'error');}finally{busy=false;$('designAll').disabled=false;$('designAll').textContent='▶ ออกแบบ ACI';$('analyze').disabled=false;}};
$('tabs').onclick=e=>{if(e.target.dataset.tab){tab=e.target.dataset.tab;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));if(tab==='design')renderDesignTable();else renderTable();}};
renderDesignBasis();







function getRainbowRGB(val, min, max) {
 if (!Number.isFinite(val) || max <= min) return [0.37, 0.8, 0.73];
 const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
 const hue = (1.0 - t) * 240;
 const c = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
 return [c.r, c.g, c.b];
}

function rainbowColor(val, min, max) {
 const rgb = getRainbowRGB(val, min, max);
 return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex();
}

function getMemberDC(m, active) {
 if (designResult?.heatmaps?.utilization?.values?.[m.id] != null) {
  return designResult.heatmaps.utilization.values[m.id];
 }
 if (designResult?.members?.[m.id]) {
  const d = designResult.members[m.id];
  if (d.type === 'beam') return Math.max(d.flexure?.bottom?.rebar?.utilization || 0, d.flexure?.top?.rebar?.utilization || 0, d.shear?.utilization || 0);
  if (d.type === 'column') return d.longitudinal?.utilization || 0;
  if (d.utilization != null) return d.utilization;
 }
 if (active?.members?.[m.id]) {
  const s = active.members[m.id].samples || [];
  if (!s.length) return null;
  const maxMz = Math.max(...s.map(pt => Math.abs(pt.Mz || 0)));
  const maxMy = Math.max(...s.map(pt => Math.abs(pt.My || 0)));
  const maxN = Math.max(...s.map(pt => Math.abs(pt.N || 0)));
  const fc = (model.designBasis?.fc_mpa || 23.5) * 1000;
  const fy = (model.designBasis?.fy_mpa || 392) * 1000;
  if (m.kind === 'column') {
   const b = m.b || 0.3, h = m.h || 0.3;
   const Ag = b * h;
   const phiPn = 0.65 * 0.80 * (0.85 * fc * (Ag * 0.99) + fy * (Ag * 0.01));
   const phiMn = 0.9 * (Ag * 0.01 * fy * (0.8 * h));
   return Math.min(2.0, (maxN / Math.max(1, phiPn)) + ((maxMz + maxMy) / Math.max(1, phiMn)));
  } else if (m.kind === 'beam') {
   const b = m.b || 0.25, h = m.h || 0.45;
   const d = h - 0.05;
   const phiMn = 0.9 * (0.01 * b * d) * fy * (0.9 * d);
   return Math.min(2.0, maxMz / Math.max(1, phiMn));
  } else {
   const A = m.A || 1.4e-3;
   const fy_s = (model.designBasis?.fy_steel_mpa || 245) * 1000;
   const phiPn = 0.9 * A * fy_s;
   return Math.min(2.0, maxN / Math.max(1, phiPn));
  }
 }
 return null;
}

function getMemberStationRGB(m, t, cm, minVal, maxVal, active) {
 if (!m) return [0.37, 0.8, 0.73];
 if (cm === 'default') {
  const def = m.kind === 'roof' ? 0xe0a75f : m.kind === 'column' ? 0x80d7c7 : 0x5fcbbb;
  const c = new THREE.Color(def);
  return [c.r, c.g, c.b];
 }
 if (cm === 'utilization') {
  const util = getMemberDC(m, active);
  if (util == null) return [0.37, 0.8, 0.73];
  if (util > 1.0) {
   const tOver = Math.min(1.0, (util - 1.0) / 0.5);
   const c = new THREE.Color().lerpColors(new THREE.Color(0xff0000), new THREE.Color(0x9900ff), tOver);
   return [c.r, c.g, c.b];
  }
  return getRainbowRGB(util, 0, 1.0);
 }
 if (cm === 'load') {
  const bd = getMemberLoadBreakdown(m);
  if (!bd) return [0.37, 0.8, 0.73];
  let loadVal = 0;
  if (bd.type === 'column') {
   const a = model.nodes.find(n => n.id === m.i), b = model.nodes.find(n => n.id === m.j);
   const isTopB = (b && a) ? (b.y >= a.y) : true;
   const distFromTop = isTopB ? (1.0 - t) * (bd.L || 3) : t * (bd.L || 3);
   const P = (bd.totalBeamReactionKN + bd.topNodeFyKN) + (bd.swKNm * distFromTop);
   loadVal = quantity(P, 'force');
  } else if (bd.type === 'beam') {
   loadVal = quantity(bd.totalQyKNm, 'line');
  } else {
   loadVal = quantity(Math.abs(bd.axialKN), 'force');
  }
  return getRainbowRGB(loadVal, minVal, maxVal);
 }
 if (['Mz', 'Vy', 'N'].includes(cm)) {
  const smp = active?.members?.[m.id]?.samples;
  if (!smp || !smp.length) return [0.37, 0.8, 0.73];
  const k = Math.min(smp.length - 1, Math.max(0, Math.round(t * (smp.length - 1))));
  const pt = smp[k];
  const raw = (cm === 'N') ? Math.abs(pt.N) : Math.abs(pt[cm]);
  const val = quantity(raw, cm === 'Mz' ? 'moment' : 'force');
  return getRainbowRGB(val, minVal, maxVal);
 }
 return [0.37, 0.8, 0.73];
}

function getHeatmapColorForMember(mid, mode) {
 const m = model.members.find(x => x.id === mid);
 const rgb = getMemberStationRGB(m, 0.5, mode, 0, 100, result?.combinations?.[$('resultCombo')?.value]);
 return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex();
}

function updateHeatmapLegend() {
 const box = $('heatmapLegend');
 if (!box) return;
 const cm = $('colorMode')?.value || 'default';
 if (cm === 'default') {
  box.hidden = true;
  return;
 }
 box.hidden = false;
 const titleEl = $('legendTitle');
 const ticksEl = $('legendTicks');
 if (cm === 'utilization') {
  if (titleEl) titleEl.textContent = 'อัตราการรับแรง (Demand / Capacity Ratio)';
  if (ticksEl) ticksEl.innerHTML = '<span>0.0 ปลอดภัย</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1.0 วิกฤต</span><span>>1.0 ไม่ผ่าน</span>';
  return;
 }
 const act = result?.combinations?.[$('resultCombo')?.value];
 if (cm === 'load') {
  if (titleEl) titleEl.textContent = `น้ำหนักบรรทุก / โหลดกระทำ (${unitLabel('force')} เสา, ${unitLabel('line')} คาน) · ไล่เฉดสี`;
  let maxL = 0;
  for (const m of model.members) {
   const bd = getMemberLoadBreakdown(m);
   if (bd) {
    if (bd.type === 'column') maxL = Math.max(maxL, quantity(bd.axialMaxKN, 'force'));
    else if (bd.type === 'beam') maxL = Math.max(maxL, quantity(bd.totalQyKNm, 'line'));
    else maxL = Math.max(maxL, quantity(Math.abs(bd.axialKN), 'force'));
   }
  }
  if (maxL <= 0) maxL = 1000;
  if (ticksEl) {
   const t0 = '0', t1 = fmt(maxL * 0.25, 0), t2 = fmt(maxL * 0.5, 0), t3 = fmt(maxL * 0.75, 0), t4 = fmt(maxL, 0);
   ticksEl.innerHTML = `<span>${t0}</span><span>${t1}</span><span>${t2}</span><span>${t3}</span><span>${t4} ${unitLabel('force')}</span>`;
  }
  return;
 }
 const titleMap = {Mz: 'โมเมนต์ดัด Mz', N: 'แรงตามแกน N', Vy: 'แรงเฉือน Vy'};
 const u = unitLabel(cm === 'Mz' ? 'moment' : 'force');
 if (titleEl) titleEl.textContent = `${titleMap[cm] || cm} (${u}) · ไล่เฉดสี (Gradient Shading)`;
 let minF = 0, maxF = 0;
 if (act?.members) {
  const vals = [];
  for (const m of model.members) {
   const s = act.members[m.id]?.samples;
   if (s) {
    for (const pt of s) {
     const v = (cm === 'N') ? Math.abs(pt.N) : Math.abs(pt[cm]);
     if (Number.isFinite(v)) vals.push(quantity(v, cm === 'Mz' ? 'moment' : 'force'));
    }
   }
  }
  if (vals.length) {
   minF = Math.min(...vals);
   maxF = Math.max(...vals);
  }
 }
 if (maxF <= minF) maxF = minF + 10;
 if (ticksEl) {
  const t0 = fmt(minF, 1), t1 = fmt(minF + (maxF - minF) * 0.25, 1), t2 = fmt(minF + (maxF - minF) * 0.5, 1), t3 = fmt(minF + (maxF - minF) * 0.75, 1), t4 = fmt(maxF, 1);
  ticksEl.innerHTML = `<span>${t0}</span><span>${t1}</span><span>${t2}</span><span>${t3}</span><span>${t4} ${u}</span>`;
 }
}

if ($('generateWarehouse')) $('generateWarehouse').onclick = () => {
 mutate(() => {
  const sx = num($('txSpan').value) || 12;
  const bz = num($('tzBay').value) || 5;
  const nz = parseInt($('tzNum').value) || 3;
  const ch = num($('tColH').value) || 4.5;
  const th = num($('tTrussH').value) || 1.8;
  const pan = parseInt($('tPanels').value) || 4;
  const cc = $('tCenterCol').checked;
  model = warehouse(sx, bz, nz, ch, th, pan, cc);
  selected = null;
 });
 fit();
 status('สร้างโมเดลโรงงาน + โครงถักเหล็กแล้ว · กด "วิเคราะห์" หรือ "ออกแบบ ACI" ได้ทันที');
};

if ($('btnGenerateFullBuilding')) $('btnGenerateFullBuilding').onclick = () => {
 mutate(() => {
  const units = model.displayUnits;
  const roofStyle = $('bldRoofStyle')?.value || 'gable';
  const overhang = num($('bldOverhang')?.value) || 0.9;
  const slabType = $('bldSlabType')?.value || 'two_way';
  const footingType = $('bldFooting')?.value || 'pile_cap';
  const hasStaircase = $('bldStairs')?.checked ?? true;
  const sx = num($('gx')?.value) || 4.5;
  const sz = num($('gz')?.value) || 4.0;
  const nx = parseInt($('nx')?.value) || 2;
  const nz = parseInt($('nz')?.value) || 1;
  const height = num($('gh')?.value) || 3.0;
  const floors = parseInt($('nf')?.value) || 3;

  model = generateFullBuilding({
   sx, sz, nx, nz, height, floors,
   roofStyle, overhang, slabType, hasStaircase, footingType
  });
  model.displayUnits = units;
  selected = null;
 });
 fit();
 const rLabel = $('bldRoofStyle')?.selectedOptions?.[0]?.text || 'หลังคา';
 const sLabel = $('bldSlabType')?.selectedOptions?.[0]?.text || 'พื้น';
 status(`สร้างอาคารครบองค์ (${rLabel} + ${sLabel} + บันได) สำเร็จ · พร้อมวิเคราะห์และออกแบบ ACI 318-25`);
};

if ($('btn3Story')) $('btn3Story').onclick = () => {
 if ($('btnGenerateFullBuilding')) $('btnGenerateFullBuilding').click();
 else {
  mutate(() => {
   const units = model.displayUnits;
   model = threeStoryBuilding();
   model.displayUnits = units;
   selected = null;
  });
  fit();
  status('สร้างตึก 3 ชั้น + ฐานรากเสาเข็มแล้ว · คลิกดูเสาเข็ม 3D หรือกด "ออกแบบ ACI" ได้ทันที');
 }
};

if ($('colorMode')) $('colorMode').onchange = () => {
 const cm = $('colorMode').value;
 if (cm === 'utilization' && !designResult && !result) {
  if ($('designAll')) {
   status('กำลังคำนวณออกแบบและวิเคราะห์อัตราการรับแรง (D/C Heatmap)...');
   $('designAll').click();
   return;
  }
 }
 drawModel();
};
if ($('diagram3d')) $('diagram3d').onchange = () => {
 drawModel();
};

async function exportCalculationPdf(){
 if(busy)return;
 const btn=$('exportPdf'),btn2=$('btnReportPdf');
 if(btn){btn.disabled=true;btn.textContent='กำลังออก PDF…';}
 if(btn2){btn2.disabled=true;btn2.textContent='กำลังออก PDF…';}
 status('กำลังสร้างรายการคำนวณและประมวลผล PDF ผ่าน Chrome Headless…');
 try{
  const payload={...model,designBasis:model.designBasis};
  const res=await api('/api/export-pdf',payload);
  if(res.ok){
   status(`ออกรายการคำนวณ PDF สำเร็จ (${res.filename}, ${(res.sizeBytes/1024).toFixed(0)} KB)`,'ok');
   window.open(res.pdfUrl,'_blank');
  }else{
   status('ออก PDF ไม่สำเร็จ: '+(res.error||'unknown error'),'error');
  }
 }catch(err){
  status('ออก PDF ผิดพลาด: '+err.message,'error');
 }finally{
  if(btn){btn.disabled=false;btn.textContent='📄 ออกรายงาน PDF';}
  if(btn2){btn2.disabled=false;btn2.textContent='📄 ดาวน์โหลดรายงาน PDF';}
 }
}
if($('exportPdf'))$('exportPdf').onclick=exportCalculationPdf;
if($('btnReportPdf'))$('btnReportPdf').onclick=exportCalculationPdf;
