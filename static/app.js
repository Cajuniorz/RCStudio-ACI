import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {stationValueKN,rangeKN,rangeByGroupKN,memberRangeKN,peakStation,memberGroupOf,GROUP_LABELS} from './heatmap.js';
import {unit,toDisplay,toCanonical} from './units.js';
import {catalogs,memberRecord,slabRecord,foundationRecord,blankProject,roofSeatElevation,warehouseModel,getMemberLocalAxes,migrateToZUp,ARROW_AXIS_LOCKS,getAxisLockFromKey,projectRayToAxisLine,computeEndpointFromDimension,findContinuousBeamChain,calculateWallUDL,classifyConnectedMembers} from './building.js';
import {groupLevels,nearestPlanNode,validateMemberEndpoints,planNodeDraft,snapPlanPoint,splitBeamAtDistance,nearestBeamOnPlan,validPlanGridStep,buildGridLayout,buildGridLayoutFromLines,planGridModel,constrainPlanPoint,autoDetectGridLines,planContinuousBeamSegments} from './plan.js';

const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
const KEY='rcstudio-v1', dofs=['DX','DY','DZ','RX','RY','RZ'];
let model, result=null, designResult=null, revision=0, tab='nodes', selected=null, selectedList=[], history=[], busy=false;
let viewMode='3d',planLevelZ=null,planLevelY=null,activeTool='select',beamDrag=null,beamAxisLock=null,lineSnapHover=null,pointerStart=null;
let buildDrawState=null, measurementBuffer='';

let structMode='solid';  // solid | wire - one state, switched by a single click
let viewScales={deformScale:100,diagramScale:1,lastPeakH:0};
// member name plate: ultra-vibrant electric lightning neon orange with multi-layer aura and pulsating beat
// font scale reduced by 30% (from 1.35 down to 0.945) and centered directly at member midpoint
const MEMBER_NAME_CANVAS_H=84,MEMBER_NAME_FONT=34,MEMBER_NAME_SCALE=0.945,MEMBER_NAME_PAD=28;
const MEMBER_NAME_FILL='#FF4500';        // ส้มแสง ส้มไลท์นิ่ง ส้มนีออนเรืองแสงแท้ (Electric Vivid Neon Orange)
const MEMBER_NAME_GLOW='#FF1E00';        // รังสีเรืองแสงออร่ารอบตัวอักษร (Hyper-saturated Neon Laser Core)
let memberNameSprites=[];               // tracked for smooth pulse animation
const PLAN_LEVEL_TOLERANCE=1e-5;
const memberDraft={b:.25,h:.45};
const empty=blankProject;
const nextId=(prefix,rows)=>{let i=1;while(rows.some(r=>r.id===prefix+i))i++;return prefix+i;};
const num=value=>value.trim()===''?null:Number(value);
const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function status(message,type=''){$('status').textContent=message;$('status').className=type;}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(model));$('saveStatus').textContent='บันทึกอัตโนมัติแล้ว · '+new Date().toLocaleTimeString('th-TH')+' · ควรเก็บไฟล์สำรอง';}catch{$('saveStatus').textContent='บันทึกอัตโนมัติไม่ได้ กรุณาบันทึกไฟล์';}}
function mutate(fn){cancelInteraction(false);const previous=clone(model);fn();const caps={nodes:500,members:1000,nodalLoads:1000,memberLoads:1000,combinations:16,slabs:100,foundations:100};if(Object.entries(caps).some(([key,max])=>model[key].length>max)||model.name.length>120||model.combinations.some(c=>c.name.length>120)||[...model.slabs,...model.foundations].some(e=>e.note.length>500)){model=previous;render();status('เกินขีดจำกัด: 500 โหนด / 1000 สมาชิก / 1000 แรงต่อประเภท / 16 ชุดน้ำหนัก / ชื่อ 120 ตัวอักษร','error');return;}history.push(previous);if(history.length>40)history.shift();revision++;result=null;persist();render();const elevated=model.nodes.find(n=>(n.z!==undefined?n.z:n.y)>0.05&&n.restraints?.some(Boolean));if(elevated)status(`⚠️ คำเตือน: โหนด ${elevated.id} อยู่ที่ระดับ Z=${fmt(elevated.z!==undefined?elevated.z:elevated.y)} m (ลอยฟ้า) ถูกตั้งเป็นจุดรองรับ ทำให้น้ำหนักไม่ถ่ายลงเสา`,'error');else status('โมเดลเปลี่ยนแล้ว · ต้องวิเคราะห์ใหม่');}
function options(select,values,current){select.replaceChildren();for(const v of values){const option=el('option',v);option.value=v;select.append(option);}if(values.includes(current))select.value=current;}
function grid(sx=4,sz=4,nx=1,nz=1,height=3,floors=1,withLoads=false){
 const p=empty();p.name=withLoads?'ตัวอย่างศึกษา · อาคาร 1 ชั้น':'กริดอาคารใหม่';p.selfWeight=true;
 const ids=new Map();for(let f=0;f<=floors;f++)for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const id='N'+(p.nodes.length+1);ids.set(`${ix},${iz},${f}`,id);p.nodes.push({id,x:ix*sx,y:iz*sz,z:f*height,restraints:Array(6).fill(f===0)});
 }
 const add=(i,j,column)=>p.members.push({...memberRecord('M'+(p.members.length+1),i,j,column?'column':'beam'),b:column?.3:.25,h:column?.3:.45});
 for(let f=1;f<=floors;f++)for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
  const n=ids.get(`${ix},${iz},${f}`);add(ids.get(`${ix},${iz},${f-1}`),n,true);
  if(ix<nx)add(n,ids.get(`${ix+1},${iz},${f}`),false);
  if(iz<nz)add(n,ids.get(`${ix},${iz+1},${f}`),false);
 }
 if(withLoads){for(const m of p.members){const a=p.nodes.find(n=>n.id===m.i),b=p.nodes.find(n=>n.id===m.j);if(a.z===b.z)p.memberLoads.push({member:m.id,case:'L',qx:0,qy:0,qz:-5});}}
 const yGridLines=Array.from({length:nz+1},(_,i)=>({label:alphaGridLabel(i),value:Number((i*sz).toFixed(3))}));
 p.gridLines={
  x:Array.from({length:nx+1},(_,i)=>({label:String(i+1),value:Number((i*sx).toFixed(3))})),
  y:yGridLines,
  z:yGridLines
 };
 p.coordinateSystem='z-up';
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
    if (isRoof && (iz === 0 || iz === nz)) {
     p.memberLoads.push({ member: mid, case: 'D', axes: 'local', qx: 0, qy: -0.8, qz: 0 });
    }
   }
  }

  for (let ix = 0; ix <= nx; ix++) {
   for (let iz = 0; iz < nz; iz++) {
    const mid = addRC(ids.get(`${ix},${iz},${f}`), ids.get(`${ix},${iz + 1},${f}`), 'beam', beamB, beamH, null);
    beamsZ.set(`${ix},${iz},${f}`, mid);
    if (isRoof && (ix === 0 || ix === nx)) {
     p.memberLoads.push({ member: mid, case: 'D', axes: 'local', qx: 0, qy: -0.8, qz: 0 });
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

 return migrateToZUp(p);
}

function threeStoryBuilding(sx=4.5,sz=4.0,nx=2,nz=1,height=3.0){
 return generateFullBuilding({ sx, sz, nx, nz, height, floors: 3, roofStyle: 'gable', overhang: 0.90, slabType: 'two_way', hasStaircase: true, footingType: 'pile_cap' });
}

function warehouse(spanX=12,bayZ=5,numBaysZ=3,colH=4.5,trussH=1.8,panels=4,centerCol=false,groundBeams=true){
 return warehouseModel(spanX,bayZ,numBaysZ,colH,trussH,panels,centerCol,groundBeams);
}

function _legacy_warehouse(spanX=12,bayZ=5,numBaysZ=3,colH=4.5,trussH=1.8,panels=4,centerCol=false,groundBeams=true){
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
 // 1. Generate all base nodes (y=0) first so they are N1..N_base and have base restraints
 for(let iz=0;iz<=numBaysZ;iz++){
  const z=iz*bayZ;
  getNode(`bL_${iz}`,0,0,z,true);
  getNode(`bR_${iz}`,spanX,0,z,true);
  if(centerCol)getNode(`bC_${iz}`,spanX/2,0,z,true);
 }
 // 2. Generate all column top nodes (y=colH) next (free/unrestrained)
 for(let iz=0;iz<=numBaysZ;iz++){
  const z=iz*bayZ;
  getNode(`tL_${iz}`,0,colH,z,false);
  getNode(`tR_${iz}`,spanX,colH,z,false);
  if(centerCol)getNode(`tC_${iz}`,spanX/2,colH,z,false);
 }
 // 3. Generate intermediate truss nodes (free/unrestrained)
 for(let iz=0;iz<=numBaysZ;iz++){
  const z=iz*bayZ;
  for(let k=1;k<totalPanels;k++){
   if(centerCol&&k===panels)continue;
   getNode(`tr_bot_${iz}_${k}`,k*dx,colH,z,false);
  }
  for(let k=1;k<totalPanels;k++){
   const pitchFactor=1.0-Math.abs(2*k/totalPanels-1.0);
   const yTop=colH+trussH*pitchFactor;
   getNode(`tr_top_${iz}_${k}`,k*dx,yTop,z,false);
  }
 }
 for(let iz=0;iz<=numBaysZ;iz++){
  const z=iz*bayZ;
  const bL=nodeMap.get(`bL_${iz}`),tL=nodeMap.get(`tL_${iz}`);addRC(bL,tL,'column',0.35,0.35);
  const bR=nodeMap.get(`bR_${iz}`),tR=nodeMap.get(`tR_${iz}`);addRC(bR,tR,'column',0.35,0.35);
  let bC,tC;if(centerCol){bC=nodeMap.get(`bC_${iz}`);tC=nodeMap.get(`tC_${iz}`);addRC(bC,tC,'column',0.35,0.35);}
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bL],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bR],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  if(centerCol)p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bC],bx:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  const botNodes=[],topNodes=[];
  const trib=(iz===0||iz===numBaysZ)?0.5:1.0;
  for(let k=0;k<=totalPanels;k++){
   let botId=k===0?tL:k===totalPanels?tR:centerCol&&k===panels?tC:nodeMap.get(`tr_bot_${iz}_${k}`);botNodes.push(botId);
   let topId=k===0?tL:k===totalPanels?tR:nodeMap.get(`tr_top_${iz}_${k}`);topNodes.push(topId);
   if(k>0&&k<totalPanels){
    p.nodalLoads.push({node:topId,case:'D',fx:0,fy:Math.round(-2.5*trib*1000)/1000,fz:0,mx:0,my:0,mz:0});
    p.nodalLoads.push({node:topId,case:'L',fx:0,fy:Math.round(-4.0*trib*1000)/1000,fz:0,mx:0,my:0,mz:0});
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
 if(groundBeams){
  for(let iz=0;iz<numBaysZ;iz++){
   addRC(getNode(`bL_${iz}`),getNode(`bL_${iz+1}`),'beam',0.25,0.40);
   addRC(getNode(`bR_${iz}`),getNode(`bR_${iz+1}`),'beam',0.25,0.40);
   if(centerCol)addRC(getNode(`bC_${iz}`),getNode(`bC_${iz+1}`),'beam',0.25,0.40);
  }
  for(let iz=0;iz<=numBaysZ;iz++){
   if(centerCol){
    addRC(getNode(`bL_${iz}`),getNode(`bC_${iz}`),'beam',0.25,0.40);
    addRC(getNode(`bC_${iz}`),getNode(`bR_${iz}`),'beam',0.25,0.40);
   }else{
    addRC(getNode(`bL_${iz}`),getNode(`bR_${iz}`),'beam',0.25,0.40);
   }
  }
 }
 p.gridLines={
  x:[{label:'1',value:0},...(centerCol?[{label:'2',value:Math.round(spanX/2*1000)/1000}]:[]),{label:centerCol?'3':'2',value:Math.round(spanX*1000)/1000}],
  z:Array.from({length:numBaysZ+1},(_,i)=>({label:alphaGridLabel(i),value:Math.round(i*bayZ*1000)/1000}))
 };
 return p;
}


// Procedural Realistic Aggregate Concrete Texture (เนื้อคอนกรีตสีเทาซีด + มวลรวมหิน-ทราย ละเอียดคมชัด)
function createConcreteTextures() {
 const size = 512;
 const canvasDiff = document.createElement('canvas');
 canvasDiff.width = canvasDiff.height = size;
 const ctxD = canvasDiff.getContext('2d');

 const canvasBump = document.createElement('canvas');
 canvasBump.width = canvasBump.height = size;
 const ctxB = canvasBump.getContext('2d');

 // 1. Base pale cement matrix (เทาซีด คอนกรีตหล่อแบบ คม ละเอียด)
 ctxD.fillStyle = '#b8bec5';
 ctxD.fillRect(0, 0, size, size);
 ctxB.fillStyle = '#808080';
 ctxB.fillRect(0, 0, size, size);

 const imgDataD = ctxD.getImageData(0, 0, size, size);
 const dataD = imgDataD.data;
 const imgDataB = ctxB.getImageData(0, 0, size, size);
 const dataB = imgDataB.data;

 // Fine cement noise (รูพรุนและเม็ดทรายคอนกรีตละเอียด)
 for (let i = 0; i < dataD.length; i += 4) {
  const n = (Math.random() - 0.5) * 22;
  dataD[i]     = Math.min(255, Math.max(0, dataD[i] + n));
  dataD[i + 1] = Math.min(255, Math.max(0, dataD[i + 1] + n));
  dataD[i + 2] = Math.min(255, Math.max(0, dataD[i + 2] + n));
  dataB[i]     = Math.min(255, Math.max(0, 128 + n * 2.2));
  dataB[i + 1] = dataB[i];
  dataB[i + 2] = dataB[i];
 }
 ctxD.putImageData(imgDataD, 0, 0);
 ctxB.putImageData(imgDataB, 0, 0);

 // 2. Aggregate inclusions: มวลรวมหินย่อย หินเกล็ด และแร่หินหลายเฉด (เทาเข้ม, หินปูนเทา, ตะกอนทราย)
 const numAggregates = 420;
 for (let i = 0; i < numAggregates; i++) {
  const x = Math.random() * size;
  const y = Math.random() * size;
  const rad = 1.2 + Math.random() * 4.8;
  const grayTone = Math.floor(85 + Math.random() * 95);
  const colorStr = `rgb(${grayTone}, ${grayTone + Math.floor(Math.random()*4)}, ${grayTone + Math.floor(Math.random()*6)})`;
  
  ctxD.beginPath();
  ctxD.arc(x, y, rad, 0, Math.PI * 2);
  ctxD.fillStyle = colorStr;
  ctxD.fill();

  // Subtle dark pore edge around stones
  ctxD.beginPath();
  ctxD.arc(x, y, rad + 0.6, 0, Math.PI * 2);
  ctxD.strokeStyle = 'rgba(70, 75, 80, 0.45)';
  ctxD.lineWidth = 0.8;
  ctxD.stroke();

  // Bump map for aggregate texture depth
  ctxB.beginPath();
  ctxB.arc(x, y, rad, 0, Math.PI * 2);
  ctxB.fillStyle = grayTone > 130 ? '#aaaaaa' : '#555555';
  ctxB.fill();
 }

 const map = new THREE.CanvasTexture(canvasDiff);
 map.wrapS = map.wrapT = THREE.RepeatWrapping;
 map.repeat.set(2.5, 2.5);

 const bumpMap = new THREE.CanvasTexture(canvasBump);
 bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
 bumpMap.repeat.set(2.5, 2.5);

 return { map, bumpMap };
}

const concreteTex = createConcreteTextures();

// A local, self-contained viewer. Global Z is up (SketchUp convention: X=Red, Y=Green, Z=Blue).
const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(42,1,.01,10000),controls;
camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
$('canvas').append(renderer.domElement);
renderer.domElement.addEventListener('mousedown', event => {
 if (event.button === 1) event.preventDefault();
});
$('canvas').addEventListener('contextmenu', event => {
 event.preventDefault();
 if (currentMode === 'build') {
  showContextMenu(event.clientX, event.clientY);
 }
});
let saved3D={position:new THREE.Vector3(12,-14,10),target:new THREE.Vector3(2,2,1.5)},planFrustumHeight=12;
let currentPlanGridTags=[];
let currentMode=(()=>{try{return localStorage.getItem('rcstudio_mode')||'classic';}catch{return 'classic';}})();
function configureControlsForMode(){
 if(!controls)return;
 if(currentMode==='build'){
  controls.mouseButtons={LEFT:-1,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:-1};
  controls.zoomToCursor=true;
 }else{
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  controls.zoomToCursor=false;
 }
 controls.enableRotate=viewMode!=='plan';
 controls.enabled=!(viewMode==='plan'&&activeTool==='beam');
}
function updatePlanGridOverlay(){
 if(viewMode!=='plan'||!currentPlanGridTags.length)return;
 const overlay=$('gridLabelsOverlay');if(!overlay)return;
 const box=overlay.getBoundingClientRect();if(!box.width||!box.height)return;
 for(const item of currentPlanGridTags){
  const p=item.world.clone().project(camera);
  if(p.z>1||Math.abs(p.x)>1.15||Math.abs(p.y)>1.15){item.el.style.display='none';continue;}
  item.el.style.display='';
  item.el.style.left=`${(p.x+1)*box.width/2}px`;
  item.el.style.top=`${(1-p.y)*box.height/2}px`;
 }
}
function bindControls(target,position,up){controls?.dispose();controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;if(up)camera.up.copy(up);else camera.up.set(0,0,1);camera.position.copy(position);camera.lookAt(target);controls.target.copy(target);configureControlsForMode();controls.addEventListener('change',updatePlanGridOverlay);controls.update();window.__rc_camera=camera;window.__rc_renderer=renderer;window.__rc_controls=controls;}
bindControls(saved3D.target,saved3D.position);
scene.add(new THREE.AmbientLight(0xffffff,1.2));
const mainLight=new THREE.DirectionalLight(0xffffff,1.2);mainLight.position.set(10,15,20);scene.add(mainLight);
const fillLight=new THREE.DirectionalLight(0xffffff,0.5);fillLight.position.set(-10,-10,-10);scene.add(fillLight);
const gridHelper=new THREE.GridHelper(40,40,0x395776,0x24384e);gridHelper.rotation.x=Math.PI/2;scene.add(gridHelper);scene.add(new THREE.AxesHelper(1.5));let group=new THREE.Group();scene.add(group);
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
ray.params.Line={threshold:0.18};
function resizeViewport(){const {width,height}=$('canvas').getBoundingClientRect(),w=Math.max(1,width),h=Math.max(1,height);renderer.setSize(w,h);if(camera.isPerspectiveCamera)camera.aspect=w/h;else{const aspect=w/h;camera.left=-planFrustumHeight*aspect/2;camera.right=planFrustumHeight*aspect/2;camera.top=planFrustumHeight/2;camera.bottom=-planFrustumHeight/2;}camera.updateProjectionMatrix();updatePlanGridOverlay();}
new ResizeObserver(()=>{resizeViewport();if(model)drawModel();}).observe($('canvas'));
renderer.setAnimationLoop(()=>{
 controls.update();
 updatePlanGridOverlay();
 if (memberNameSprites.length) {
  // rhythmic slow glowing pulse ("บีทอัพช้าๆ": breathing beat cycle ~2.6s)
  const t = performance.now() * 0.0024;
  const pulse = 0.5 + 0.5 * Math.sin(t);
  const scaleMul = 0.94 + 0.12 * Math.sin(t); // subtle organic expansion rhythm
  for (let i = 0; i < memberNameSprites.length; i++) {
   const item = memberNameSprites[i];
   if (!item || !item.sprite) continue;
   if (item.sprite.material) {
    item.sprite.material.opacity = 0.82 + 0.18 * pulse;
   }
   if (item.baseScaleX) {
    item.sprite.scale.set(item.baseScaleX * scaleMul, item.baseScaleY * scaleMul, 1);
   }
  }
 }
 renderer.render(scene,camera);
});
function labelSprite(text, width=0, height=44, fontSize=16, options={}){
 const dpr = 2;
 const c = document.createElement('canvas');
 const ctxM = c.getContext('2d');
 ctxM.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
 const textW = ctxM.measureText(text).width;
 const padX = options.padX ?? 12;
 const realW = Math.max(width || 40, Math.ceil(textW + padX * 2));
 const realH = height || 44;

 c.width = realW * dpr;
 c.height = realH * dpr;
 const ctx = c.getContext('2d');
 ctx.scale(dpr, dpr);

 // an explicit null/false means 'no backplate at all' (?? would silently fall back to the default)
 const bg = 'bg' in options ? options.bg : 'rgba(15, 23, 42, 0.88)';
 const border = options.border ?? 'rgba(148, 163, 184, 0.45)';
 const color = options.color ?? '#e2e8f0';
 const radius = options.radius ?? 6;

 if (bg) {
  ctx.beginPath();
  if (ctx.roundRect) {
   ctx.roundRect(1.5, 1.5, realW - 3, realH - 3, radius);
  } else {
   ctx.rect(1.5, 1.5, realW - 3, realH - 3);
  }
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
   ctx.lineWidth = 1.5;
   ctx.strokeStyle = border;
   ctx.stroke();
  }
 }

 ctx.font = `900 ${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif`;
 ctx.textAlign = 'center';
 ctx.textBaseline = 'middle';
 if (options.glow) {
  // Electric neon lightning aura: multi-pass intense radioactive glow
  ctx.save();
  ctx.shadowColor = options.glow;
  for (const blur of [24, 16, 8]) {
   ctx.shadowBlur = blur;
   ctx.fillStyle = options.glow;
   ctx.fillText(text, realW / 2, realH / 2);
  }
  ctx.restore();
 }
 if (options.outline) {
  // crisp dark outline to boost contrast against light or solid beams
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = options.outlineWidth ?? Math.max(4, fontSize * 0.18);
  ctx.strokeStyle = options.outline;
  ctx.strokeText(text, realW / 2, realH / 2);
 }
 if (options.glow) {
  // Second glow pass directly over outline to create true electric plasma edge
  ctx.save();
  ctx.shadowColor = options.glow;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, realW / 2, realH / 2);
  ctx.restore();
 }
 ctx.fillStyle = color;
 ctx.fillText(text, realW / 2, realH / 2);

 const texture = new THREE.CanvasTexture(c);
 texture.minFilter = THREE.LinearFilter;
 const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: texture,
  depthTest: options.alwaysOnTop ? false : (options.depthTest ?? true),
  depthWrite: false
 }));
 if (options.alwaysOnTop) sprite.renderOrder = 1000;
 sprite.scale.set((realW / 200) * 0.52, (realH / 44) * 0.18, 1);
 return sprite;
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
function line(points,color,dashed=false,opts={}){const g=new THREE.BufferGeometry().setFromPoints(points);const matParams={color};if(opts.depthTest!==undefined)matParams.depthTest=opts.depthTest;if(opts.linewidth!==undefined)matParams.linewidth=opts.linewidth;const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.28,gapSize:.18,transparent:true,opacity:.7,...(opts.depthTest!==undefined?{depthTest:opts.depthTest}:{})}):new THREE.LineBasicMaterial(matParams);const l=new THREE.Line(g,material);if(dashed)l.computeLineDistances();if(opts.renderOrder!==undefined)l.renderOrder=opts.renderOrder;group.add(l);return l;}
const planLevels=()=>groupLevels(model.nodes,PLAN_LEVEL_TOLERANCE);
function choosePlanLevel(levels){
 let best=levels[0],bestCount=-1;
 for(const level of levels){
  const ids=new Set(level.nodes.map(node=>node.id));
  const count=model.members.filter(member=>ids.has(member.i)&&ids.has(member.j)&&member.kind==='beam').length+model.slabs.filter(slab=>slab.nodes.length>=3&&slab.nodes.every(id=>ids.has(id))).length*2;
  if(count>bestCount){best=level;bestCount=count;}
 }
 return best?.z!==undefined?best.z:(best?.y??null);
}
function updateAxisLockBadge(){
 const badge=$('axisLockBadge');
 if(!badge)return;
 if(!beamAxisLock){
  badge.hidden=true;
  badge.className='axis-lock-badge';
  badge.textContent='';
  return;
 }
 badge.hidden=false;
 badge.className=`axis-lock-badge lock-${beamAxisLock}`;
 const labels={x:'แกน X (แดง · Span)',y:'แกน Y (เขียว · Bay)',z:'แกน Z (น้ำเงิน · Elevation)'};
 badge.textContent=`🔒 ล็อก${labels[beamAxisLock]||beamAxisLock.toUpperCase()}`;
}
function renderPlanControls(){
 const levels=planLevels(),select=$('planLevel'),previous=planLevelZ??planLevelY;
 select.replaceChildren();
 for(const level of levels){
  const elevVal=level.z!==undefined?level.z:level.y;
  const option=el('option',level.label);
  option.value=String(elevVal);
  select.append(option);
 }
 if(levels.length){
  const custom=Number.isFinite(previous)&&!levels.some(level=>Math.abs((level.z??level.y)-previous)<=PLAN_LEVEL_TOLERANCE);
  if(custom){
   const option=el('option',`ระดับอิสระ · Z ${Number(previous.toFixed(3))} m`);
   option.value=String(previous);
   select.append(option);
  }else if(!levels.some(level=>Math.abs((level.z??level.y)-(previous??NaN))<=PLAN_LEVEL_TOLERANCE)){
   planLevelZ=choosePlanLevel(levels);
   planLevelY=planLevelZ;
  }
  const level=levels.find(item=>Math.abs((item.z??item.y)-(planLevelZ??planLevelY))<=PLAN_LEVEL_TOLERANCE);
  if(level){
   planLevelZ=level.z!==undefined?level.z:level.y;
   planLevelY=planLevelZ;
  }
  select.value=String(planLevelZ);
 }else if(!Number.isFinite(planLevelZ)){
  planLevelZ=null;
  planLevelY=null;
 }
 select.disabled=!levels.length&&planLevelZ===null;
 select.hidden=viewMode!=='plan';
 $('planElevation').hidden=viewMode!=='plan';
 $('setPlanElevation').hidden=viewMode!=='plan';
 $('planGridStep').disabled=!$('planSnap').checked;
 $('planTools').hidden=viewMode!=='plan';
 $('view3d').classList.toggle('active',viewMode==='3d');
 $('viewPlan').classList.toggle('active',viewMode==='plan');
 $('planSelectTool').classList.toggle('active',activeTool==='select');
 $('planNodeTool').classList.toggle('active',activeTool==='node');
 $('planMemberNodeTool').classList.toggle('active',activeTool==='memberNode');
 $('planBeamTool').classList.toggle('active',activeTool==='beam');
 $('planBeamLockX').hidden=viewMode!=='plan'||activeTool!=='beam';
 if($('planBeamLockY'))$('planBeamLockY').hidden=viewMode!=='plan'||activeTool!=='beam';
 $('planBeamLockZ').hidden=viewMode!=='plan'||activeTool!=='beam';
 $('planBeamLockX').classList.toggle('active',beamAxisLock==='x');
 if($('planBeamLockY'))$('planBeamLockY').classList.toggle('active',beamAxisLock==='y');
 $('planBeamLockZ').classList.toggle('active',beamAxisLock==='z'||beamAxisLock==='y');
 updateAxisLockBadge();
 const curElev=planLevelZ??planLevelY;
 $('viewHint').textContent=viewMode==='plan'?'ผัง X–Y · ระดับ '+(levels.find(item=>(item.z??item.y)===curElev)?.label??`Z ${fmt(curElev)} m`):'ลากหมุน · ล้อเมาส์ซูม · คลิกเลือก';
 if(viewMode==='plan'&&previous!==curElev){cancelInteraction(false);fitPlan();}
}
function cancelInteraction(redraw=true){pointerStart=null;beamDrag=null;lineSnapHover=null;$('beamHint').textContent='';updateAxisLockBadge();if(controls)controls.enabled=!(viewMode==='plan'&&activeTool==='beam');if(redraw&&model)drawModel();}
function setPlanTool(tool){cancelInteraction(false);activeTool=tool;beamAxisLock=null;updateAxisLockBadge();if(controls)controls.enabled=!(viewMode==='plan'&&activeTool==='beam');renderPlanControls();drawModel();}
function setBeamAxisLock(axis){
 if(axis===null){
  beamAxisLock=null;
 }else{
  beamAxisLock=beamAxisLock===axis?null:axis;
 }
 renderPlanControls();
 updateAxisLockBadge();
 if(beamDrag)drawModel();
 status(beamAxisLock?`ล็อกแนว ${beamAxisLock.toUpperCase()} · กด ${beamAxisLock.toUpperCase()} หรือลูกศรลงเพื่อปลดล็อก`:'ปลดล็อกแกน');
}
function fitPlan(){
 const curElev=planLevelZ??planLevelY;
 const all=model.nodes.filter(node=>[node.x,node.y,node.z].every(Number.isFinite)),
       levelNodes=all.filter(node=>curElev!==null&&(Math.abs(node.z-curElev)<=PLAN_LEVEL_TOLERANCE||Math.abs(node.y-curElev)<=PLAN_LEVEL_TOLERANCE)),
       nodes=levelNodes.length?levelNodes:all,
       gridX=model.gridLines?.x||[],
       gridY=model.gridLines?.y||model.gridLines?.z||[],
       xs=[...nodes.map(n=>n.x),...gridX.map(g=>g.value).filter(Number.isFinite)],
       ys=[...nodes.map(n=>n.y),...gridY.map(g=>g.value).filter(Number.isFinite)],
       minX=xs.length?Math.min(...xs):0,
       maxX=xs.length?Math.max(...xs):10,
       minY=ys.length?Math.min(...ys):0,
       maxY=ys.length?Math.max(...ys):10,
       minZ=nodes.length?Math.min(...nodes.map(n=>n.z)):0,
       maxZ=nodes.length?Math.max(...nodes.map(n=>n.z)):0,
       spanX=Math.max(maxX-minX,1),
       spanY=Math.max(maxY-minY,1),
       leftMargin=Math.max(2.8,spanX*.25),
       topMargin=Math.max(2.8,spanY*.25),
       rightMargin=Math.max(1.2,spanX*.1),
       bottomMargin=Math.max(1.2,spanY*.1),
       totalSpanX=spanX+leftMargin+rightMargin,
       totalSpanY=spanY+topMargin+bottomMargin,
       center=new THREE.Vector3(minX-leftMargin+totalSpanX/2,minY-topMargin+totalSpanY/2,curElev!==null?curElev:(minZ+maxZ)/2),
       aspect=Math.max(1,$('canvas').clientWidth)/Math.max(1,$('canvas').clientHeight);
 planFrustumHeight=Math.max(totalSpanY/.85,totalSpanX/(.85*aspect),1)*1.05;
 const distance=Math.max(20,maxZ-minZ+10);
 camera=new THREE.OrthographicCamera(-planFrustumHeight*aspect/2,planFrustumHeight*aspect/2,planFrustumHeight/2,-planFrustumHeight/2,.1,10000);
 camera.up.set(0,1,0);
 bindControls(center,new THREE.Vector3(center.x,center.y,center.z+distance),new THREE.Vector3(0,1,0));
 gridHelper.position.set(0,0,curElev??0);
 gridHelper.rotation.x=Math.PI/2;
 resizeViewport();
}
function setViewMode(mode){
 if(mode===viewMode)return;
 cancelInteraction(false);
 activeTool='select';
 beamAxisLock=null;
 updateAxisLockBadge();
 if(viewMode==='3d'){saved3D={position:camera.position.clone(),target:controls.target.clone()};}
 viewMode=mode;
 renderPlanControls();
 if(mode==='plan')fitPlan();
 else{
  camera=new THREE.PerspectiveCamera(42,1,.01,10000);
  camera.up.set(0,0,1);
  bindControls(saved3D.target,saved3D.position,new THREE.Vector3(0,0,1));
  gridHelper.position.set(0,0,0);
  gridHelper.rotation.x=Math.PI/2;
  resizeViewport();
 }
 drawModel();
}
function planPointerPoint(event){
 const rect=renderer.domElement.getBoundingClientRect();
 const curElev=planLevelZ??planLevelY;
 if(!rect.width||!rect.height||curElev===null)return null;
 pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
 ray.setFromCamera(pointer,camera);
 return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-curElev),new THREE.Vector3());
}
function snapPlanNode(event){
 const point=planPointerPoint(event);
 if(!point)return null;
 const zoom=camera.isOrthographicCamera?camera.zoom:1,threshold=planFrustumHeight/Math.max(.01,zoom)/Math.max(1,renderer.domElement.clientHeight)*18;
 const curElev=planLevelZ??planLevelY;
 return nearestPlanNode(model.nodes,point.x,point.y,curElev,PLAN_LEVEL_TOLERANCE,threshold);
}
function snapPlanBeam(event){
 const point=planPointerPoint(event);
 if(!point)return null;
 const threshold=planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18;
 const curElev=planLevelZ??planLevelY;
 return nearestBeamOnPlan(model,point,curElev,threshold,PLAN_LEVEL_TOLERANCE);
}
function commitPlanNode(point,event){
 const useSnap=$('planSnap').checked&&!event?.altKey,gridStep=Number($('planGridStep').value);
 if(useSnap&&!validPlanGridStep(gridStep))return status('ระยะกริดต้องอยู่ระหว่าง 0.05–1.00 m เพิ่มครั้งละ 0.05 m','error');
 const pixelTolerance=planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18;
 const curElev=planLevelZ??planLevelY;
 const placed=useSnap?snapPlanPoint(point,model.nodes,curElev,gridStep,Math.min(.25,pixelTolerance)):point;
 const draft=planNodeDraft(model.nodes,placed,nextId('N',model.nodes));
 if(!draft.ok)return status(draft.reason,'error');
 const before=revision;
 mutate(()=>{model.nodes.push(draft.node);selected={kind:'nodes',id:draft.node.id};tab='nodes';});
 if(revision!==before)status(`วางโหนด ${draft.node.id} ที่ X ${fmt(draft.node.x)}, Y ${fmt(draft.node.y)}, Z ${fmt(draft.node.z)} m${useSnap?` · ดูดกริด ${fmt(gridStep,2)} m / แนวโหนดเดิม`:''} · ยังไม่เชื่อมสมาชิก`);
}
function commitReferenceNode(memberId,fromNodeId,distance){
 const plan=splitBeamAtDistance(model,memberId,fromNodeId,distance,nextId('N',model.nodes),nextId('M',model.members));
 if(!plan.ok)return status(plan.reason,'error');
 const before=revision;
 mutate(()=>{const idx=model.members.findIndex(m=>m.id===memberId);model.nodes.push(plan.node);model.members.splice(idx,1,...plan.members);model.memberLoads=model.memberLoads.filter(load=>load.member!==memberId).concat(plan.memberLoads);selected={kind:'nodes',id:plan.node.id};tab='nodes';});
 if(revision!==before)status(`สร้าง ${plan.node.id} ห่างจาก ${fromNodeId} ${fmt(distance)} m บนคาน ${memberId} · แบ่งคานเป็น ${plan.members.map(m=>m.id).join(' / ')} แล้ว · ต้องวิเคราะห์ใหม่`);
}
async function createBuildingGrid(layoutOverride=null){
 const layout=layoutOverride||buildGridLayout({countX:Number($('gridCountX').value),countZ:Number($('gridCountZ').value),spacingX:Number($('gridSpacingX').value),spacingZ:Number($('gridSpacingZ').value),startX:Number($('gridStartX').value),startZ:Number($('gridStartZ').value),y:Number($('gridLevelY').value)});
 if(!layout.ok)return status(layout.reason,'error');
 const proposed=planGridModel(model,layout,{beamsX:$('gridBeamsX').checked,beamsZ:$('gridBeamsZ').checked,b:memberDraft.b,h:memberDraft.h});
 if(!proposed.ok)return status(proposed.reason,'error');
 const oldGrid=model.gridLines||{x:[],z:[]};
 if((oldGrid.x.length||oldGrid.z.length)&&JSON.stringify(oldGrid)!==JSON.stringify(proposed.gridLines)&&!confirm('แทนชุดเส้นกริดเดิมหรือไม่? โหนด/คานเดิมจะไม่ถูกลบ และย้อนกลับได้ด้วย Undo'))return;
 if(!proposed.nodes.length&&!proposed.members.length&&JSON.stringify(oldGrid)===JSON.stringify(proposed.gridLines))return status('กริดและโหนด/คานตามช่วงนี้มีครบแล้ว');
 const before=revision,candidate=clone(model);candidate.gridLines=proposed.gridLines;candidate.nodes.push(...proposed.nodes);candidate.members.push(...proposed.members);
 status('ตรวจสอบข้อมูลกริดและการเชื่อมต่อก่อนสร้าง…');
 try{const checked=await api('/api/validate',candidate);if(revision!==before)return status('โมเดลเปลี่ยนระหว่างตรวจกริด กรุณากดสร้างอีกครั้ง','error');mutate(()=>{model=checked.model;selected=proposed.members.length?{kind:'members',id:proposed.members[0].id}:proposed.nodes.length?{kind:'nodes',id:proposed.nodes[0].id}:null;tab=proposed.members.length?'beams':'nodes';});if(revision!==before){if(viewMode==='plan')fitPlan();status(`สร้างกริด X 1–${layout.lines.x.length} / Z A–${layout.lines.z.map(g=>g.label).at(-1)} · จุดตัด ${layout.nodes.length} · เพิ่มโหนด ${proposed.nodes.length} · เพิ่มคาน ${proposed.members.length} · b/h ${fmt(memberDraft.b)}×${fmt(memberDraft.h)} m · ตรวจแบบใหม่ก่อนวิเคราะห์`);}}catch(error){if(revision===before)status(`สร้างกริดไม่ได้: ${error.message}`,'error');}
}
function gridEditorRows(axis){return [...$(`gridEditor${axis.toUpperCase()}`).querySelectorAll('tr')].map(row=>({label:row.querySelector('.axis-label-input').value.trim(),value:row.querySelector('.axis-value-input').value.trim()===''?NaN:Number(row.querySelector('.axis-value-input').value)}));}
function refreshGridEditorGaps(axis){
 const rows=[...$(`gridEditor${axis.toUpperCase()}`).querySelectorAll('tr')];
 rows.forEach((row,i)=>{
  const current=Number(row.querySelector('.axis-value-input').value),previous=i?Number(rows[i-1].querySelector('.axis-value-input').value):NaN,gapInput=row.querySelector('.grid-gap-input');
  if(!gapInput)return;
  if(i&&Number.isFinite(current)&&Number.isFinite(previous)){gapInput.value=fmt(current-previous,3);}else{gapInput.value='';}
 });
}
function onGridGapChange(axis,changedIndex){
 const rows=[...$(`gridEditor${axis.toUpperCase()}`).querySelectorAll('tr')];
 if(changedIndex<=0||changedIndex>=rows.length)return;
 const gapVal=Number(rows[changedIndex].querySelector('.grid-gap-input').value);
 if(!Number.isFinite(gapVal)||gapVal<=0)return;
 for(let k=changedIndex;k<rows.length;k++){
  const prevVal=Number(rows[k-1].querySelector('.axis-value-input').value);
  const thisGap=k===changedIndex?gapVal:Number(rows[k].querySelector('.grid-gap-input').value);
  if(Number.isFinite(prevVal)&&Number.isFinite(thisGap)){
   const newVal=Number((prevVal+thisGap).toFixed(3));
   rows[k].querySelector('.axis-value-input').value=String(newVal);
  }
 }
 refreshGridEditorGaps(axis);
}
function renderGridEditorAxis(axis,lines){
 const body=$(`gridEditor${axis.toUpperCase()}`);body.replaceChildren();
 lines.forEach((line,index)=>{
  const row=el('tr'),labelCell=el('td'),valueCell=el('td'),gapCell=el('td'),actionCell=el('td');
  const label=el('input');label.className='axis-label-input';label.value=line.label;label.maxLength=12;label.setAttribute('aria-label',`ชื่อแนว ${axis} ${index+1}`);
  const value=el('input');value.className='axis-value-input';value.type='number';value.step='.001';value.value=String(line.value);value.setAttribute('aria-label',`พิกัดแนว ${axis} ${index+1} เมตร`);
  labelCell.append(label);valueCell.append(value);
  if(index>0){
   const gapInput=el('input');gapInput.className='grid-gap-input';gapInput.type='number';gapInput.step='.001';gapInput.min='0.001';gapInput.placeholder='ช่วง (m)';gapInput.setAttribute('aria-label',`ระยะช่วงแกน ${axis} แนวที่ ${index+1} จากแนวก่อนหน้า`);
   gapInput.addEventListener('input',()=>onGridGapChange(axis,index));
   gapCell.append(gapInput);
  }else{
   gapCell.style.textAlign='center';gapCell.style.color='#7e93a7';gapCell.textContent='(เริ่ม)';
  }
  const remove=el('button','ลบ');remove.type='button';remove.className='remove-grid-axis';remove.disabled=lines.length<=2;remove.setAttribute('aria-label',`ลบแนว ${axis} ${line.label}`);
  remove.onclick=()=>{const current=gridEditorRows(axis);if(current.length<=2)return;current.splice(index,1);renderGridEditorAxis(axis,current);};
  actionCell.append(remove);row.append(labelCell,valueCell,gapCell,actionCell);body.append(row);
  value.addEventListener('input',()=>refreshGridEditorGaps(axis));
 });
 refreshGridEditorGaps(axis);
}
function openGridEditor(){
 const saved=model.gridLines||{x:[],z:[]};let lines=(saved.x?.length>=2&&saved.z?.length>=2)?{x:clone(saved.x),z:clone(saved.z)}:null;
 if(!lines){
  const curElev=planLevelZ??planLevelY;
  const detected=autoDetectGridLines(model.nodes,{levelZ:curElev,levelY:curElev});
  if(detected.ok){lines=detected.lines;}
  else{
   const layout=buildGridLayout({countX:Number($('gridCountX')?.value||2),countZ:Number($('gridCountZ')?.value||2),spacingX:Number($('gridSpacingX')?.value||4),spacingZ:Number($('gridSpacingZ')?.value||4),startX:Number($('gridStartX')?.value||0),startZ:Number($('gridStartZ')?.value||0),y:Number($('gridLevelY')?.value||0)});
   lines=layout.ok?layout.lines:{x:[{label:'1',value:0},{label:'2',value:4}],z:[{label:'A',value:0},{label:'B',value:4}]};
  }
 }
 renderGridEditorAxis('x',lines.x);renderGridEditorAxis('z',lines.z);$('gridEditorHelp').textContent='💡 แก้ไขได้ทั้งช่อง "พิกัดสะสม" หรือ "ช่วงจากก่อน" (แก้ระยะช่วงจะปรับพิกัดสะสมอัตโนมัติ) · ตรวจจับจากเสาได้ทันที';$('gridEditorDialog').showModal();
}
function addGridEditorAxis(axis){const rows=gridEditorRows(axis);if(rows.length>=20)return status('เพิ่มได้สูงสุด 20 แนวต่อแกน','error');const step=Math.max(.05,Number($(`gridSpacing${axis.toUpperCase()}`).value)||4);const last=rows.at(-1),value=(Number.isFinite(last?.value)?last.value:0)+step,label=axis==='x'?String(rows.length+1):alphaGridLabel(rows.length);rows.push({label,value:Number(value.toFixed(3))});renderGridEditorAxis(axis,rows);}
function alphaGridLabel(index){let n=index+1,out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}
async function buildGridFromEditor(){
 const curElev=planLevelZ??planLevelY;
 const layout=buildGridLayoutFromLines({linesX:gridEditorRows('x'),linesY:gridEditorRows('z'),linesZ:gridEditorRows('z'),z:Number(curElev||0),y:Number(curElev||0)});
 if(!layout.ok){$('gridEditorHelp').textContent=layout.reason;$('gridEditorHelp').classList.add('error');return status(layout.reason,'error');}
 $('gridEditorHelp').classList.remove('error');const before=revision;await createBuildingGrid(layout);if(revision!==before)$('gridEditorDialog').close();
}
function planBeamEndpoint(event,startNode){
 const raw=planPointerPoint(event);if(!raw)return {error:'เลือกระดับแปลนก่อนวาดคาน'};
 const useGrid=$('planSnap').checked&&!event.altKey,step=Number($('planGridStep').value);
 if(useGrid&&!validPlanGridStep(step))return {error:'ระยะกริดต้องอยู่ระหว่าง 0.05–1.00 m เพิ่มครั้งละ 0.05 m'};
 const curElev=planLevelZ??planLevelY;
 const effectiveLock=beamAxisLock==='z'?'y':beamAxisLock;
 let point=beamAxisLock?constrainPlanPoint(startNode,raw,effectiveLock,step,useGrid):useGrid?snapPlanPoint(raw,model.nodes,curElev,step,Math.min(.25,planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18)):raw;
 if(!point)return {error:'ไม่สามารถคำนวณพิกัดปลายคาน'};
 let candidates=model.nodes.filter(n=>Math.abs(n.z-curElev)<=PLAN_LEVEL_TOLERANCE||Math.abs(n.y-curElev)<=PLAN_LEVEL_TOLERANCE);
 if(effectiveLock==='x')candidates=candidates.filter(n=>Math.abs(n.y-startNode.y)<=1e-5);
 if(effectiveLock==='y')candidates=candidates.filter(n=>Math.abs(n.x-startNode.x)<=1e-5);
 const tol=planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18;
 const snap=nearestPlanNode(candidates,point.x,point.y,curElev,PLAN_LEVEL_TOLERANCE,tol);
 return {point:snap?{x:snap.node.x,y:snap.node.y,z:snap.node.z}:point,node:snap?.node||null,useGrid,step};
}
function getActiveMemberProps(role=$('planBeamRole')?.value||'beam'){
 if(role==='beam'){
  return {kind:'beam',b:memberDraft.b,h:memberDraft.h,rotation:0,sectionType:'rc_rect',A:null,Iy:null,Iz:null,J:null,roofType:'custom',behavior:'frame',roofRole:null};
 }
 const steelDefs={
  AS:{b:.10,h:.125,A:1.8e-3,Iy:1.8e-6,Iz:4.0e-6,J:5e-8},
  rafter:{b:.08,h:.125,A:1.4e-3,Iy:1.2e-6,Iz:3.5e-6,J:4e-8},
  purlin:{b:.05,h:.10,A:7e-4,Iy:6e-7,Iz:1.8e-6,J:4e-8},
  ridge:{b:.10,h:.15,A:1.6e-3,Iy:1.5e-6,Iz:5.0e-6,J:6e-8}
 };
 const def=steelDefs[role]||steelDefs.AS;
 return {kind:'roof',b:def.b,h:def.h,rotation:0,sectionType:'steel_custom',A:def.A,Iy:def.Iy,Iz:def.Iz,J:def.J,roofType:'custom',behavior:'frame',roofRole:role};
}
function commitPlanBeamPoint(startId,point){
 const start=model.nodes.find(n=>n.id===startId);if(!start)return status('ไม่พบโหนดเริ่มต้น','error');
 const role=$('planBeamRole')?.value||'beam',props=getActiveMemberProps(role);
 if(props.kind==='beam'&&(!Number.isFinite(props.b)||!Number.isFinite(props.h)||props.b<.01||props.h<.01))return status('กรอกขนาด b และ h ของคานให้มากกว่า 0.01 m','error');
 const curElev=planLevelZ??planLevelY;
 const isContinuous=$('planContinuous')?.checked??true;
 if(isContinuous){
  const freshNodeId=nextId('N',model.nodes);
  const res=planContinuousBeamSegments(model.nodes,model.members,startId,point,{levelZ:curElev,levelY:curElev,levelTolerance:PLAN_LEVEL_TOLERANCE,allowNewEndNode:true,freshNodeId,memberProps:props,nextMemberIdFn:mems=>nextId('M',mems)});
  if(!res.ok)return status(res.reason,'error');
  const before=revision;
  mutate(()=>{
   model.nodes.push(...res.nodesToAdd);
   model.members.push(...res.segments);
   selected={kind:'members',id:res.segments[0].id};
   tab=memberTab(res.segments[0]);
  });
  if(revision!==before){
   const endNode=res.nodesToAdd[0],roleLabel=role==='beam'?'คาน':role==='AS'?'เหล็กอะเส (AS)':role==='rafter'?'เหล็กจันทัน (RAF)':role==='purlin'?'แป (Purlin)':'อกไก่ (OK)';
   if(res.segments.length>1)status(`วาด${roleLabel}ต่อเนื่อง ${startId} → ${endNode.id} แบ่งเป็น ${res.segments.length} ช่วง (${res.segments.map(s=>s.id).join(', ')}) · โหนดปลายใหม่ X ${fmt(endNode.x)} Z ${fmt(endNode.z)} m · ต้องวิเคราะห์ใหม่`);
   else status(`วาด${roleLabel} ${startId} → ${endNode.id} แล้ว · โหนดปลายใหม่ X ${fmt(endNode.x)} Z ${fmt(endNode.z)} m · ต้องวิเคราะห์ใหม่`);
  }
 }else{
  const draft=planNodeDraft(model.nodes,point,nextId('N',model.nodes));if(!draft.ok)return status(draft.reason,'error');
  const validation=validateMemberEndpoints([...model.nodes,draft.node],model.members,startId,draft.node.id,{levelZ:curElev,levelY:curElev,levelTolerance:PLAN_LEVEL_TOLERANCE,disallowIntervening:true});if(!validation.ok)return status(validation.reason,'error');
  const before=revision;
  mutate(()=>{
   const member={id:nextId('M',model.members),i:startId,j:draft.node.id,...props};
   model.nodes.push(draft.node);model.members.push(member);
   selected={kind:'members',id:member.id};tab=memberTab(member);
  });
  if(revision!==before)status(`วาดสมาชิก ${startId} → ${draft.node.id} แล้ว · ปลายใหม่ X ${fmt(draft.node.x)} Z ${fmt(draft.node.z)} m · ต้องวิเคราะห์ใหม่`);
 }
}
function commitPlanBeam(startId,endId){
 const role=$('planBeamRole')?.value||'beam',props=getActiveMemberProps(role);
 if(props.kind==='beam'&&(!Number.isFinite(props.b)||!Number.isFinite(props.h)||props.b<.01||props.h<.01))return status('กรอกขนาด b และ h ของคานให้มากกว่า 0.01 m','error');
 const isContinuous=$('planContinuous')?.checked??true;
 const curElev=planLevelZ??planLevelY;
 if(isContinuous){
  const res=planContinuousBeamSegments(model.nodes,model.members,startId,endId,{levelZ:curElev,levelY:curElev,levelTolerance:PLAN_LEVEL_TOLERANCE,memberProps:props,nextMemberIdFn:mems=>nextId('M',mems)});
  if(!res.ok)return status(res.reason,'error');
  const before=revision;
  mutate(()=>{
   model.members.push(...res.segments);
   selected={kind:'members',id:res.segments[0].id};
   tab=memberTab(res.segments[0]);
  });
  if(revision!==before){
   const roleLabel=role==='beam'?'คาน':role==='AS'?'เหล็กอะเส (AS)':role==='rafter'?'เหล็กจันทัน (RAF)':role==='purlin'?'แป (Purlin)':'อกไก่ (OK)';
   if(res.segments.length>1)status(`สร้าง${roleLabel}ต่อเนื่อง ${startId} → ${endId} แบ่งเป็น ${res.segments.length} ช่วง (${res.segments.map(s=>s.id).join(', ')}) · จุดต่อแข็ง Rigid Joint · ต้องวิเคราะห์ใหม่`);
   else status(`เพิ่ม${roleLabel} ${startId} → ${endId} (${res.segments[0].id}) แล้ว · ต้องวิเคราะห์ใหม่`);
  }
 }else{
  const validation=validateMemberEndpoints(model.nodes,model.members,startId,endId,{levelZ:curElev,levelY:curElev,levelTolerance:PLAN_LEVEL_TOLERANCE,disallowIntervening:true});
  if(!validation.ok)return status(validation.reason,'error');
  const before=revision;
  mutate(()=>{
   const member={id:nextId('M',model.members),i:startId,j:endId,...props};
   model.members.push(member);selected={kind:'members',id:member.id};tab=memberTab(member);
  });
  if(revision!==before)status(`เพิ่มสมาชิก ${startId} → ${endId} แล้ว · ต้องวิเคราะห์ใหม่`);
 }
}
function cancelBuildDrawing(redraw=true){
 buildDrawState=null;
 measurementBuffer='';
 const box=$('buildMeasurementBox');if(box)box.hidden=true;
 const input=$('buildMeasurementInput');if(input)input.value='';
 buildOverlayGroup.clear();
 if(redraw&&model)drawModel();
}

function updateMeasurementBox(length,dx=0,dy=0,dz=0){
 const box=$('buildMeasurementBox');if(!box)return;
 if(currentMode!=='build'||!buildDrawState){box.hidden=true;return;}
 box.hidden=false;
 const input=$('buildMeasurementInput');
 if(input&&!measurementBuffer){
  input.value=Number.isFinite(length)?fmt(length,3):'';
 }
}

function get3DPointerPoint(event){
 const rect=renderer.domElement.getBoundingClientRect();
 if(!rect.width||!rect.height)return null;
 pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
 ray.setFromCamera(pointer,camera);
 const curElev=(planLevelZ??planLevelY)??0;

 const hits=ray.intersectObjects(group.children,true);
 const nodeHit=hits.find(h=>h.object.userData?.kind==='nodes');
 if(nodeHit){
  const n=model.nodes.find(node=>node.id===nodeHit.object.userData.id);
  if(n){
   return {point:new THREE.Vector3(n.x,n.y,n.z),node:n,isNode:true};
  }
 }

 if(buildDrawState){
  const origin=buildDrawState.start||buildDrawState.ref;
  const effectiveLock=beamAxisLock||buildDrawState.axisLock;
  if(effectiveLock){
   const proj=projectRayToAxisLine(ray.ray.origin,ray.ray.direction,origin,effectiveLock);
   if(proj){
    return {point:new THREE.Vector3(proj.x,proj.y,proj.z),axis:effectiveLock};
   }
  }

  const projX=projectRayToAxisLine(ray.ray.origin,ray.ray.direction,origin,'x');
  const projY=projectRayToAxisLine(ray.ray.origin,ray.ray.direction,origin,'y');
  const projZ=projectRayToAxisLine(ray.ray.origin,ray.ray.direction,origin,'z');

  const planePt=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-origin.z),new THREE.Vector3());
  if(planePt){
   const dx=Math.abs(planePt.x-origin.x);
   const dy=Math.abs(planePt.y-origin.y);
   const angle=Math.atan2(dy,dx);
   if(angle<0.12&&projX){
    return {point:new THREE.Vector3(projX.x,origin.y,origin.z),axis:'x',isAuto:true};
   }
   if(Math.abs(angle-Math.PI/2)<0.12&&projY){
    return {point:new THREE.Vector3(origin.x,projY.y,origin.z),axis:'y',isAuto:true};
   }
  }
  if(projZ){
   const distToZ=ray.ray.distanceToPoint(new THREE.Vector3(origin.x,origin.y,projZ.z));
   if(distToZ<0.35){
    return {point:new THREE.Vector3(origin.x,origin.y,projZ.z),axis:'z',isAuto:true};
   }
  }
  if(planePt)return {point:planePt};
 }

 const pt=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-curElev),new THREE.Vector3());
 if(pt&&$('planSnap')?.checked&&!event.altKey){
  const step=Number($('planGridStep')?.value)||1.0;
  pt.x=Math.round(pt.x/step)*step;
  pt.y=Math.round(pt.y/step)*step;
 }
 return pt?{point:pt}:null;
}

function drawBuildPreview(){
 buildOverlayGroup.clear();
 if(!buildDrawState)return;
 const start=buildDrawState.start||buildDrawState.ref;
 const end=buildDrawState.current;
 if(!start||!end)return;
 if(buildDrawState.tool==='slab'){
  const z=start.z;
  const pts=[
   new THREE.Vector3(start.x,start.y,z),
   new THREE.Vector3(end.x,start.y,z),
   new THREE.Vector3(end.x,end.y,z),
   new THREE.Vector3(start.x,end.y,z),
   new THREE.Vector3(start.x,start.y,z)
  ];
  const slabGeo=new THREE.BufferGeometry().setFromPoints(pts);
  const slabMat=new THREE.LineBasicMaterial({color:0x38bdf8,linewidth:2,depthTest:false,transparent:true,opacity:0.95});
  const slabMesh=new THREE.Line(slabGeo,slabMat);
  slabMesh.renderOrder=999;
  buildOverlayGroup.add(slabMesh);

  const sphereGeo=new THREE.SphereGeometry(0.04,12,12);
  const sphereMat=new THREE.MeshBasicMaterial({color:0x38bdf8,depthTest:false});
  const sphere=new THREE.Mesh(sphereGeo,sphereMat);
  sphere.position.set(end.x,end.y,z);
  sphere.renderOrder=1000;
  buildOverlayGroup.add(sphere);

  const dx=Math.abs(end.x-start.x), dy=Math.abs(end.y-start.y);
  if(dx>0.05&&dy>0.05){
   const mid=new THREE.Vector3((start.x+end.x)/2,(start.y+end.y)/2,z+0.15);
   const badge=labelSprite(`${fmt(dx,2)} × ${fmt(dy,2)} m`,0,36,12,{
    bg:'rgba(15, 23, 42, 0.92)',
    border:'#38bdf8',
    color:'#f8fafc',
    radius:6,
    alwaysOnTop:true
   });
   badge.position.copy(mid);
   badge.renderOrder=1001;
   buildOverlayGroup.add(badge);
  }
  updateMeasurementBox(Math.hypot(dx,dy),dx,dy,0);
  return;
 }
 if(buildDrawState.tool==='pull'){
  const axis=buildDrawState.axis;
  const color=axis==='x'?0xef4444:axis==='y'?0x22c55e:axis==='z'?0x3b82f6:0x38bdf8;
  const lineGeo=new THREE.BufferGeometry().setFromPoints([start,end]);
  const lineMat=new THREE.LineBasicMaterial({color,linewidth:2,depthTest:false,transparent:true,opacity:0.95});
  const lineMesh=new THREE.Line(lineGeo,lineMat);
  lineMesh.renderOrder=999;
  buildOverlayGroup.add(lineMesh);

  const sphereGeo=new THREE.SphereGeometry(0.05,12,12);
  const sphereMat=new THREE.MeshBasicMaterial({color,depthTest:false});
  const sphere=new THREE.Mesh(sphereGeo,sphereMat);
  sphere.position.copy(end);
  sphere.renderOrder=1000;
  buildOverlayGroup.add(sphere);

  const dist=start.distanceTo(end);
  updateMeasurementBox(dist,end.x-start.x,end.y-start.y,end.z-start.z);
  return;
 }
 const lock=buildDrawState.axisLock||beamAxisLock;
 const color=lock==='x'?0xef4444:lock==='y'?0x22c55e:lock==='z'?0x3b82f6:0x38bdf8;

 const lineGeo=new THREE.BufferGeometry().setFromPoints([start,end]);
 const lineMat=new THREE.LineBasicMaterial({color,linewidth:2,depthTest:false,transparent:true,opacity:0.95});
 const lineMesh=new THREE.Line(lineGeo,lineMat);
 lineMesh.renderOrder=999;
 buildOverlayGroup.add(lineMesh);

 const sphereGeo=new THREE.SphereGeometry(0.04,12,12);
 const sphereMat=new THREE.MeshBasicMaterial({color,depthTest:false});
 const sphere=new THREE.Mesh(sphereGeo,sphereMat);
 sphere.position.copy(end);
 sphere.renderOrder=1000;
 buildOverlayGroup.add(sphere);

 const L=start.distanceTo(end);
 if(L>0.05){
  const mid=new THREE.Vector3().addVectors(start,end).multiplyScalar(0.5);
  const badge=labelSprite(`${fmt(L,3)} m`,0,36,12,{
   bg:'rgba(15, 23, 42, 0.92)',
   border:lock==='x'?'#f87171':lock==='y'?'#4ade80':lock==='z'?'#60a5fa':'#38bdf8',
   color:'#f8fafc',
   radius:6,
   alwaysOnTop:true
  });
  badge.position.copy(mid).add(new THREE.Vector3(0,0,0.15));
  badge.renderOrder=1001;
  buildOverlayGroup.add(badge);
 }
 updateMeasurementBox(L,end.x-start.x,end.y-start.y,end.z-start.z);
}

function commitBuildLinePoint(targetPoint){
 if(!buildDrawState||buildDrawState.tool!=='line')return;
 const start=buildDrawState.start;
 const startId=buildDrawState.startId;
 const L=start.distanceTo(targetPoint);
 if(L<0.01){
  status('ระยะสั้นเกินไป ไม่สามารถสร้างชิ้นส่วนได้','error');
  return;
 }
 let endId=null;
 const existingNode=model.nodes.find(n=>Math.hypot(n.x-targetPoint.x,n.y-targetPoint.y,n.z-targetPoint.z)<0.02);
 if(existingNode){
  if(existingNode.id===startId){status('ปลายคานต้องต่างจากจุดเริ่มต้น','error');return;}
  endId=existingNode.id;
 }else{
  endId=nextId('N',model.nodes);
 }
 const exists=model.members.some(m=>(m.i===startId&&m.j===endId)||(m.i===endId&&m.j===startId));
 if(exists){
  status(`มีชิ้นส่วนเชื่อมระหว่าง ${startId} กับ ${endId} อยู่แล้ว`,'error');
  return;
 }
 const isCol=Math.abs(start.x-targetPoint.x)<1e-4&&Math.abs(start.y-targetPoint.y)<1e-4;
 const kind=isCol?'column':'beam';
 const mId=nextId('M',model.members);
 const b=isCol?0.30:(memberDraft.b||0.25);
 const h=isCol?0.30:(memberDraft.h||0.45);

 mutate(()=>{
  if(!existingNode){
   model.nodes.push({
    id:endId,
    x:Number(targetPoint.x.toFixed(3)),
    y:Number(targetPoint.y.toFixed(3)),
    z:Number(targetPoint.z.toFixed(3)),
    restraints:Array(6).fill(false)
   });
  }
  const mem={id:mId,i:startId,j:endId,kind,b,h,rotation:0};
  model.members.push(mem);
  selected={kind:'members',id:mId};
  selectedList=[selected];
 });

 const newStartPt=existingNode?new THREE.Vector3(existingNode.x,existingNode.y,existingNode.z):targetPoint.clone();
 buildDrawState={
  tool:'line',
  start:newStartPt,
  startId:endId,
  current:newStartPt.clone()
 };
 measurementBuffer='';
 drawBuildPreview();
 status(`สร้าง${kind==='column'?'เสา':'คาน'} ${mId} (${startId} → ${endId}, ยาว ${fmt(L,3)} m) สำเร็จ · คลิกจุดต่อไป หรือกด Space เพื่อเสร็จสิ้น`);
}

function commitBuildNodePoint(targetPoint){
 if(!buildDrawState||buildDrawState.tool!=='node')return;
 const existing=model.nodes.find(n=>Math.hypot(n.x-targetPoint.x,n.y-targetPoint.y,n.z-targetPoint.z)<0.02);
 if(existing){
  status(`มีโหนด ${existing.id} ที่ตำแหน่งนี้อยู่แล้ว`,'error');
  cancelBuildDrawing();
  return;
 }
 const nId=nextId('N',model.nodes);
 mutate(()=>{
  model.nodes.push({
   id:nId,
   x:Number(targetPoint.x.toFixed(3)),
   y:Number(targetPoint.y.toFixed(3)),
   z:Number(targetPoint.z.toFixed(3)),
   restraints:Array(6).fill(false)
  });
  selected={kind:'nodes',id:nId};
  selectedList=[selected];
 });
 cancelBuildDrawing();
 status(`วางโหนดใหม่ ${nId} ที่ (${fmt(targetPoint.x)}, ${fmt(targetPoint.y)}, ${fmt(targetPoint.z)}) แล้ว`);
}

function commitBuildDimensionInput(targetLength){
 if(!buildDrawState||!Number.isFinite(targetLength)||targetLength<=0)return;
 if(buildDrawState.tool==='pull'){
  const node=model.nodes.find(n=>n.id===buildDrawState.nodeId);
  if(!node){cancelBuildDrawing();return;}
  const axis=buildDrawState.axis;
  mutate(()=>{
   if(axis==='x')node.x=Number((node.x+targetLength).toFixed(3));
   else if(axis==='y')node.y=Number((node.y+targetLength).toFixed(3));
   else if(axis==='z')node.z=Number(((node.z!==undefined?node.z:node.y)+targetLength).toFixed(3));
  });
  cancelBuildDrawing();
  status(`ดึงโหนด ${node.id} ตามแนวแกน ${axis.toUpperCase()} ระยะ ${fmt(targetLength,3)} m สำเร็จ`);
  return;
 }
 const start=buildDrawState.start||buildDrawState.ref;
 const current=buildDrawState.current;
 const lock=buildDrawState.axisLock||beamAxisLock;
 const targetPoint=computeEndpointFromDimension(start,current,lock,targetLength);
 if(buildDrawState.tool==='line'){
  commitBuildLinePoint(new THREE.Vector3(targetPoint.x,targetPoint.y,targetPoint.z));
 }else if(buildDrawState.tool==='node'){
  commitBuildNodePoint(new THREE.Vector3(targetPoint.x,targetPoint.y,targetPoint.z));
 }
}

function commitBuildSlab(p1,p2,startNode=null,endNode=null){
 if(!p1||!p2)return null;
 const z=Number((p1.z!==undefined?p1.z:0).toFixed(3));
 const minX=Math.min(p1.x,p2.x);
 const maxX=Math.max(p1.x,p2.x);
 const minY=Math.min(p1.y,p2.y);
 const maxY=Math.max(p1.y,p2.y);
 const lx=Number((maxX-minX).toFixed(3));
 const ly=Number((maxY-minY).toFixed(3));
 if(lx<0.2||ly<0.2){
  status('ขนาดพื้นเล็กเกินไป (ต้องมีขนาดอย่างน้อย 0.2 × 0.2 ม.)','error');
  return null;
 }

 const cornerCoords=[
  {x:minX,y:minY,z},
  {x:maxX,y:minY,z},
  {x:maxX,y:maxY,z},
  {x:minX,y:maxY,z}
 ];

 const cornerIds=[];
 const createdNodes=[];

 for(const c of cornerCoords){
  let match=model.nodes.find(n=>Math.hypot(n.x-c.x,n.y-c.y,(n.z!==undefined?n.z:n.y)-c.z)<0.05);
  if(!match){
   const newId=nextId('N',[...model.nodes,...createdNodes]);
   match={id:newId,x:c.x,y:c.y,z:c.z,restraints:Array(6).fill(false)};
   createdNodes.push(match);
  }
  cornerIds.push(match.id);
 }

 const findBeam=(idA,idB)=>{
  return model.members.find(m=>(m.i===idA&&m.j===idB)||(m.i===idB&&m.j===idA));
 };
 const b1=findBeam(cornerIds[0],cornerIds[1]);
 const b2=findBeam(cornerIds[1],cornerIds[2]);
 const b3=findBeam(cornerIds[2],cornerIds[3]);
 const b4=findBeam(cornerIds[3],cornerIds[0]);

 const ratio=Math.max(lx,ly)/Math.min(lx,ly);
 const isOneWay=ratio>=2.0;
 const sId=nextId('S',model.slabs);
 const slab={
  ...slabRecord(sId,cornerIds),
  type:isOneWay?'one_way':'two_way',
  thickness:0.12,
  mode:isOneWay?'one_way_load':'two_way_load',
  dead:1.5,
  live:2.0,
  support1:b1?b1.id:'',
  support2:b2?b2.id:'',
  support3:b3?b3.id:'',
  support4:b4?b4.id:''
 };

 mutate(()=>{
  if(createdNodes.length>0){
   model.nodes.push(...createdNodes);
  }
  model.slabs.push(slab);
  selected={kind:'slabs',id:sId};
  selectedList=[selected];
 });

 cancelBuildDrawing();
 status(`สร้างพื้น ${sId} (${isOneWay?'One-Way':'Two-Way'}, ${fmt(lx,2)} × ${fmt(ly,2)} m) สำเร็จ`);
 return slab;
}

function commitBuildWall(memberId,heightM=2.8,densityKgm2=180){
 const mem=model.members.find(m=>m.id===memberId);
 if(!mem){
  status(`ไม่พบชิ้นส่วนคาน ${memberId} สำหรับสร้างผนัง`,'error');
  return null;
 }
 const w=calculateWallUDL(heightM,densityKgm2);
 mutate(()=>{
  model.memberLoads.push({
   member:mem.id,
   case:'D',
   qx:0,
   qy:0,
   qz:-w,
   dist1:0,
   dist2:null
  });
  mem.hasWall=true;
  mem.wallHeight=heightM;
  mem.wallDensity=densityKgm2;
  mem.wallLoad=w;
  selected={kind:'members',id:mem.id};
  selectedList=[selected];
 });
 drawModel();
 renderTable();
 status(`สร้างผนังบนคาน ${mem.id} สำเร็จ (สูง ${fmt(heightM,2)} m, โหลดผนัง ${fmt(w,2)} kN/m ลงแกน -Z)`);
 return {memberId:mem.id,load:w,height:heightM};
}

let currentJoinChain=null;

function promptJoinBeams(){
 const beamIds=selectedList.filter(s=>s.kind==='members').map(s=>s.id);
 if(beamIds.length===0&&selected&&selected.kind==='members'){
  beamIds.push(selected.id);
 }
 if(beamIds.length<2){
  status('กรุณาเลือกคานต่อเนื่องอย่างน้อย 2 ชิ้น (กด Ctrl+คลิก เพื่อเลือกหลายชิ้น) แล้วกด J');
  return;
 }
 const chain=findContinuousBeamChain(model.members,beamIds,model.nodes);
 if(!chain||!chain.valid){
  status('คานที่เลือกไม่ได้เชื่อมต่อกัน กรุณาเลือกคานที่มีโหนดร่วมกัน','error');
  return;
 }
 currentJoinChain=chain;
 const body=$('joinDialogBody');
 if(body){
  body.innerHTML=`
   <p style="margin:0">พบชุดคานต่อเนื่อง <strong>${chain.members.length}</strong> ท่อน:</p>
   <div style="display:flex;flex-direction:column;gap:6px">
    ${chain.members.map(m=>`
     <div class="join-beam-card">
      <span><strong>${m.id}</strong> (${m.i} → ${m.j})</span>
      <span>หน้าตัด: ${fmt((m.b||0.25)*100,0)} × ${fmt((m.h||0.45)*100,0)} ซม.</span>
     </div>
    `).join('')}
   </div>
   <p style="color:#38bdf8;font-size:12px;margin:4px 0 0">
    โหนดเชื่อมต่อร่วม: <strong>${chain.sharedNodes.join(', ')}</strong>
   </p>
  `;
 }
 const dlg=$('joinBeamsDialog');
 if(dlg){
  if(typeof dlg.showModal==='function')dlg.showModal();
  else dlg.open=true;
 }
}

function executeJoinBeams(chain){
 if(!chain||!chain.members||chain.members.length<2){
  status('ต้องเลือกคานที่ต่อเนื่องกันอย่างน้อย 2 ชิ้นขึ้นไป','error');
  return false;
 }
 const primary=chain.members[0];
 const b=primary.b||0.25;
 const h=primary.h||0.45;
 const groupTag=`CB_${primary.id}`;

 mutate(()=>{
  for(const m of chain.members){
   m.b=b;
   m.h=h;
   m.continuousGroup=groupTag;
  }
 });

 const dlg=$('joinBeamsDialog');
 if(dlg){
  if(typeof dlg.close==='function')dlg.close();
  else dlg.open=false;
 }
 currentJoinChain=null;
 status(`รวมคาน ${chain.members.map(m=>m.id).join(', ')} เป็นคานต่อเนื่อง ${groupTag} (${fmt(b*100,0)}×${fmt(h*100,0)} cm) สำเร็จ`);
 return true;
}

function openPullNodeMenu(nodeId,clientX=window.innerWidth/2,clientY=window.innerHeight/2){
 const node=model.nodes.find(n=>n.id===nodeId);
 if(!node)return;
 const classified=classifyConnectedMembers(nodeId,model.members,model.nodes);
 if(classified.length===0){
  status(`โหนด ${nodeId} ไม่มีชิ้นส่วนเชื่อมต่อที่จะดึง/ยืดได้`,'error');
  return;
 }

 const container=$('pullMenuItems');
 if(container){
  container.innerHTML='';
  classified.forEach(c=>{
   const btn=document.createElement('button');
   btn.type='button';
   btn.className='pull-item-btn';
   btn.innerHTML=`<span class="pull-axis-tag axis-${c.axis}">${c.axis.toUpperCase()}</span><span>${c.label}</span>`;
   btn.addEventListener('click',()=>{
    closePullNodeMenu();
    startPullingNode(nodeId,c.axis,c.member);
   });
   container.appendChild(btn);
  });
 }

 const menu=$('pullNodeMenu');
 if(menu){
  menu.hidden=false;
  menu.style.left=`${Math.min(window.innerWidth-270,Math.max(10,clientX+8))}px`;
  menu.style.top=`${Math.min(window.innerHeight-220,Math.max(10,clientY+8))}px`;
 }
}

function closePullNodeMenu(){
 const menu=$('pullNodeMenu');
 if(menu)menu.hidden=true;
}

function startPullingNode(nodeId,axis,member){
 const node=model.nodes.find(n=>n.id===nodeId);
 if(!node)return;
 const zVal=node.z!==undefined?node.z:node.y;
 buildDrawState={
  tool:'pull',
  nodeId,
  axis,
  member,
  start:new THREE.Vector3(node.x,node.y,zVal),
  current:new THREE.Vector3(node.x,node.y,zVal),
  axisLock:axis
 };
 measurementBuffer='';
 const box=$('buildMeasurementBox');
 if(box)box.hidden=false;
 const input=$('buildMeasurementInput');
 if(input){
  input.value='';
  input.placeholder='ระยะยืด (m)';
  input.focus();
 }
 status(`ดึงโหนด ${nodeId} ตามแนวแกน ${axis.toUpperCase()}: พิมพ์ระยะในช่อง Length หรือพิมพ์ตัวเลขแล้วกด Enter`);
}

renderer.domElement.addEventListener('pointerdown',event=>{
 if(event.button===0&&currentMode==='build'){
  if(activeBuildTool==='line'){
   event.preventDefault();
   const p=get3DPointerPoint(event);
   if(!p)return;
   if(!buildDrawState){
    let startId=null;
    if(p.node){
     startId=p.node.id;
    }else{
     startId=nextId('N',model.nodes);
     mutate(()=>{
      model.nodes.push({
       id:startId,
       x:Number(p.point.x.toFixed(3)),
       y:Number(p.point.y.toFixed(3)),
       z:Number(p.point.z.toFixed(3)),
       restraints:Array(6).fill(false)
      });
     });
    }
    buildDrawState={
     tool:'line',
     start:p.point.clone(),
     startId,
     current:p.point.clone(),
     axisLock:beamAxisLock
    };
    drawBuildPreview();
    status(`เริ่มวาดเส้นจาก ${startId} · คลิกปลายทาง หรือพิมพ์ระยะความยาว`);
    return;
   }else{
    commitBuildLinePoint(buildDrawState.current);
    return;
   }
  }else if(activeBuildTool==='node'){
   event.preventDefault();
   const p=get3DPointerPoint(event);
   if(!p)return;
   if(!buildDrawState){
    buildDrawState={
     tool:'node',
     ref:p.point.clone(),
     refId:p.node?.id||null,
     current:p.point.clone(),
     axisLock:beamAxisLock
    };
    drawBuildPreview();
    status(`อ้างอิงจาก ${p.node?.id||'พิกัด'} (${fmt(p.point.x)}, ${fmt(p.point.y)}, ${fmt(p.point.z)}) · ชี้จุดวาง หรือพิมพ์ระยะ`);
    return;
   }else{
    commitBuildNodePoint(buildDrawState.current);
    return;
   }
  }else if(activeBuildTool==='slab'){
   event.preventDefault();
   const p=get3DPointerPoint(event);
   if(!p)return;
   if(!buildDrawState){
    buildDrawState={
     tool:'slab',
     start:p.point.clone(),
     startNode:p.node||null,
     current:p.point.clone()
    };
    drawBuildPreview();
    status('เริ่มกำหนดขอบเขตพื้น · คลิกมุมทแยงอีกด้าน หรือเลือกโหนดมุม');
    return;
   }else{
    commitBuildSlab(buildDrawState.start,p.point,buildDrawState.startNode,p.node||null);
    return;
   }
  }else if(activeBuildTool==='wall'){
   const rect=renderer.domElement.getBoundingClientRect();
   pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
   ray.setFromCamera(pointer,camera);
   const hits=ray.intersectObjects(group.children,true);
   const memHit=hits.find(h=>h.object.userData?.kind==='members');
   if(memHit){
    event.preventDefault();
    commitBuildWall(memHit.object.userData.id,2.8,180);
    return;
   }
  }else if(activeBuildTool==='pull'){
   const rect=renderer.domElement.getBoundingClientRect();
   pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
   ray.setFromCamera(pointer,camera);
   const hits=ray.intersectObjects(group.children,true);
   const nodeHit=hits.find(h=>h.object.userData?.kind==='nodes');
   if(nodeHit){
    event.preventDefault();
    openPullNodeMenu(nodeHit.object.userData.id,event.clientX,event.clientY);
    return;
   }
  }
 }

 if(viewMode==='plan'&&activeTool==='beam'&&event.button===0){event.preventDefault();if(!beamDrag){const start=snapPlanNode(event);if(!start){$('beamHint').textContent='เริ่มจากโหนดกริด/โหนดเดิมก่อน';return;}beamDrag={startId:start.node.id,startNode:start.node,world:new THREE.Vector3(start.node.x,start.node.y,start.node.z),endId:start.node.id};$('beamHint').textContent=`เริ่ม ${start.node.id} · คลิกปลายคาน · ลูกศร/X/Y ล็อกแกน`;drawModel();return;}const start=beamDrag;const end=planBeamEndpoint(event,start.startNode);beamDrag=null;$('beamHint').textContent='';if(end.error)status(end.error,'error');else if(end.node){if(end.node.id===start.startId)status('ปลายคานต้องต่างจากโหนดเริ่ม','error');else commitPlanBeam(start.startId,end.node.id);}else commitPlanBeamPoint(start.startId,end.point);drawModel();return;}
 if(event.button===0)pointerStart=[event.clientX,event.clientY];else pointerStart=null;
});

renderer.domElement.addEventListener('pointermove',event=>{
 if(currentMode==='build'&&buildDrawState){
  const p=get3DPointerPoint(event);
  if(p){
   buildDrawState.current=p.point.clone();
   buildDrawState.axisLock=p.axis||beamAxisLock;
   drawBuildPreview();
  }
  return;
 }
 if(viewMode==='plan'&&activeTool==='beam'&&beamDrag){const end=planBeamEndpoint(event,beamDrag.startNode);beamDrag.endId=end.node?.id||null;beamDrag.world=end.point?new THREE.Vector3(end.point.x,end.point.y,end.point.z):null;$('beamHint').textContent=end.error?end.error:`${beamDrag.startId} → ${beamDrag.endId||'โหนดใหม่'} · X ${fmt(end.point?.x)} Y ${fmt(end.point?.y)} m${$('planContinuous')?.checked?' (ต่อเนื่อง)':''}${beamAxisLock?` · 🔒 ${beamAxisLock.toUpperCase()}`:''}${end.useGrid?` · กริด ${fmt(end.step,2)} m`:''}`;drawModel();return;}if(viewMode==='plan'&&activeTool==='memberNode'&&!beamDrag){const hit=snapPlanBeam(event),previous=lineSnapHover;lineSnapHover=hit&&!hit.ambiguous?hit:null;$('beamHint').textContent=hit?.ambiguous?'เส้นคานซ้อนกัน เลือกคานในตารางแทน':hit?`${hit.member.id} · จาก ${hit.fromId} ${fmt(hit.distanceFromI)} m${model.slabs.some(s=>['support1','support2','support3','support4'].some(k=>s[k]===hit.member.id))?' · คานรับพื้น แบ่งไม่ได้':''}`:'ชี้ใกล้เส้นคานที่ระดับนี้';if(previous?.member?.id!==lineSnapHover?.member?.id||Math.abs((previous?.distanceFromI??-1)-(lineSnapHover?.distanceFromI??-1))>.02)drawModel();return;}if(viewMode==='plan'&&activeTool==='node'&&!beamDrag){const curElev=planLevelZ??planLevelY;const point=planPointerPoint(event),gridStep=Number($('planGridStep').value),valid=$('planSnap').checked?validPlanGridStep(gridStep):true,snapped=valid&&$('planSnap').checked&&!event.altKey&&point?snapPlanPoint(point,model.nodes,curElev,gridStep,Math.min(.25,planFrustumHeight/Math.max(.01,camera.zoom||1)/Math.max(1,renderer.domElement.clientHeight)*18)):point;$('beamHint').textContent=!valid?'ระยะกริด 0.05–1.00 m · เพิ่มครั้งละ 0.05 m':snapped?`X ${fmt(snapped.x)} · Y ${fmt(snapped.y)} m${$('planSnap').checked&&!event.altKey?` · กริด ${fmt(gridStep,2)} m`:''}`:'';return;}
});

renderer.domElement.addEventListener('pointerup',event=>{
 if(event.button!==0){pointerStart=null;return;}
 if(!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>4){pointerStart=null;return;}
 pointerStart=null;
 if(currentMode==='build'&&(activeBuildTool==='line'||activeBuildTool==='node'||activeBuildTool==='slab'||activeBuildTool==='wall'||activeBuildTool==='pull'))return;
 if(viewMode==='plan'&&activeTool==='memberNode'){const hit=snapPlanBeam(event);if(!hit)return status('คลิกใกล้เส้นคานที่ระดับชั้นนี้','error');if(hit.ambiguous)return status('เส้นคานซ้อนกัน เลือกคานในตารางแล้วระบุระยะแทน','error');commitReferenceNode(hit.member.id,hit.fromId,hit.distanceFromI);lineSnapHover=null;drawModel();return;}
 if(viewMode==='plan'&&activeTool==='node'){const point=planPointerPoint(event);if(point)commitPlanNode(point,event);else status('เลือกระดับชั้นก่อนวางโหนด','error');return;}

 const rect=renderer.domElement.getBoundingClientRect();
 pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
 ray.setFromCamera(pointer,camera);
 const allHits=ray.intersectObjects(group.children,true),hit=viewMode==='plan'?(allHits.find(item=>['nodes','members'].includes(item.object.userData.kind))||allHits.find(item=>['slabs','foundations'].includes(item.object.userData.kind))):allHits.find(item=>item.object.userData.kind);

 if(currentMode==='build'){
  if(event.ctrlKey&&!event.shiftKey){
   if(hit){
    const ud=hit.object.userData;
    if(!selectedList.some(s=>s.kind===ud.kind&&s.id===ud.id)){
     selectedList.push(ud);
    }
    selected=ud;
   }
  }else if(event.ctrlKey&&event.shiftKey){
   if(hit){
    const ud=hit.object.userData;
    selectedList=selectedList.filter(s=>!(s.kind===ud.kind&&s.id===ud.id));
    selected=selectedList.length>0?selectedList[selectedList.length-1]:null;
   }
  }else{
   selected=hit?hit.object.userData:null;
   selectedList=selected?[selected]:[];
  }
 }else{
  selected=hit?hit.object.userData:null;
  selectedList=selected?[selected]:[];
 }

 if(selected?.kind==='members'){$('resultMember').value=selected.id;drawDiagram();}
 renderSelection();drawModel();renderTable();
});
renderer.domElement.addEventListener('pointercancel',()=>cancelInteraction());
renderer.domElement.addEventListener('pointerleave',()=>{if(lineSnapHover){lineSnapHover=null;$('beamHint').textContent='';drawModel();}});

function drawModel(){
 updateHeatmapLegend();
 $('gridLabelsOverlay').replaceChildren();$('gridLabelsOverlay').hidden=viewMode!=='plan';
 currentPlanGridTags=[];
 memberNameSprites=[];
 scene.remove(group);group.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});group=new THREE.Group();scene.add(group);
 const curElev=planLevelZ??planLevelY;
 const visibleNodeIds=viewMode==='plan'?new Set(model.nodes.filter(n=>Math.abs(n.z-curElev)<=PLAN_LEVEL_TOLERANCE||Math.abs(n.y-curElev)<=PLAN_LEVEL_TOLERANCE).map(n=>n.id)):null;gridHelper.position.set(0,0,viewMode==='plan'?(curElev??0):0);gridHelper.rotation.x=Math.PI/2;
 const pos=new Map(model.nodes.filter(n=>[n.x,n.y,n.z].every(Number.isFinite)).map(n=>[n.id,new THREE.Vector3(n.x,n.y,n.z)]));const active=result?.combinations[$('resultCombo').value];
 if(viewMode==='plan'&&model.gridLines){
  const gridX=(model.gridLines.x||[]).filter(g=>Number.isFinite(g.value)).sort((a,b)=>a.value-b.value),
        gridY=(model.gridLines.y||model.gridLines.z||[]).filter(g=>Number.isFinite(g.value)).sort((a,b)=>a.value-b.value),
        valid=model.nodes.filter(n=>[n.x,n.y,n.z].every(Number.isFinite)&&(curElev===null||Math.abs(n.z-curElev)<=PLAN_LEVEL_TOLERANCE||Math.abs(n.y-curElev)<=PLAN_LEVEL_TOLERANCE)),
        xs=[...valid.map(n=>n.x),...gridX.map(g=>g.value)],
        ys=[...valid.map(n=>model.coordinateSystem==='z-up'?n.y:n.z),...gridY.map(g=>g.value)],
        minX=xs.length?Math.min(...xs):0,
        maxX=xs.length?Math.max(...xs):10,
        minY=ys.length?Math.min(...ys):0,
        maxY=ys.length?Math.max(...ys):10,
        spanX=Math.max(maxX-minX,1),
        spanY=Math.max(maxY-minY,1),
        leftMargin=Math.max(2.8,spanX*.25),
        topMargin=Math.max(2.8,spanY*.25),
        axisZ=(Number.isFinite(curElev)?curElev:0)+.006,
        overlay=$('gridLabelsOverlay');

  const addPlanTag=(elNode,worldVec)=>{
   overlay.append(elNode);
   currentPlanGridTags.push({el:elNode,world:worldVec});
  };

  // 1. Grid X (Numbered 1..N on TOP / +Y side)
  if(gridX.length>0){
   const bubbleY=maxY+(topMargin-0.45);
   const tier2Y=maxY+(topMargin*0.62);
   const tier1Y=maxY+(topMargin*0.32);

   for(const gx of gridX){
    line([new THREE.Vector3(gx.value,minY-0.6,axisZ),new THREE.Vector3(gx.value,bubbleY-0.22,axisZ)],0x6688a8,true);
    const bubble=el('span',gx.label);
    bubble.className='grid-axis-label grid-x';
    bubble.setAttribute('aria-label',`แนวกริด ${gx.label}`);
    addPlanTag(bubble,new THREE.Vector3(gx.value,bubbleY,axisZ));
   }

   if(gridX.length>=2){
    const minGx=gridX[0].value,maxGx=gridX[gridX.length-1].value;
    line([new THREE.Vector3(minGx,tier1Y,axisZ),new THREE.Vector3(maxGx,tier1Y,axisZ)],0x4e6275);
    for(let i=0;i<gridX.length;i++){
     const gx=gridX[i];
     line([new THREE.Vector3(gx.value-0.1,tier1Y-0.1,axisZ),new THREE.Vector3(gx.value+0.1,tier1Y+0.1,axisZ)],0x5b9bd5);
     if(i<gridX.length-1){
      const nextGx=gridX[i+1],spanDist=nextGx.value-gx.value,midX=(gx.value+nextGx.value)/2;
      const badge=el('span',fmt(spanDist,2));
      badge.className='grid-dim-badge';
      badge.title=`ช่วง ${gx.label}–${nextGx.label}: ${fmt(spanDist,3)} m`;
      addPlanTag(badge,new THREE.Vector3(midX,tier1Y,axisZ));
     }
    }

    line([new THREE.Vector3(minGx,tier2Y,axisZ),new THREE.Vector3(maxGx,tier2Y,axisZ)],0x4e6275);
    line([new THREE.Vector3(minGx-0.12,tier2Y-0.12,axisZ),new THREE.Vector3(minGx+0.12,tier2Y+0.12,axisZ)],0xe68a35);
    line([new THREE.Vector3(maxGx-0.12,tier2Y-0.12,axisZ),new THREE.Vector3(maxGx+0.12,tier2Y+0.12,axisZ)],0xe68a35);
    const totalSpan=maxGx-minGx,midXTotal=(minGx+maxGx)/2;
    const totalBadge=el('span',fmt(totalSpan,2));
    totalBadge.className='grid-dim-badge total';
    totalBadge.title=`ระยะรวม ${gridX[0].label}–${gridX[gridX.length-1].label}: ${fmt(totalSpan,3)} m`;
    addPlanTag(totalBadge,new THREE.Vector3(midXTotal,tier2Y,axisZ));
   }
  }

  // 2. Grid Y (Lettered A..N on LEFT / -X side)
  if(gridY.length>0){
   const bubbleX=minX-(leftMargin-0.45);
   const tier2X=minX-(leftMargin*0.62);
   const tier1X=minX-(leftMargin*0.32);

   for(const gy of gridY){
    line([new THREE.Vector3(bubbleX+0.22,gy.value,axisZ),new THREE.Vector3(maxX+0.6,gy.value,axisZ)],0x987451,true);
    const bubble=el('span',gy.label);
    bubble.className='grid-axis-label grid-z';
    bubble.setAttribute('aria-label',`แนวกริด ${gy.label}`);
    addPlanTag(bubble,new THREE.Vector3(bubbleX,gy.value,axisZ));
   }

   if(gridY.length>=2){
    const minGy=gridY[0].value,maxGy=gridY[gridY.length-1].value;
    line([new THREE.Vector3(tier1X,minGy,axisZ),new THREE.Vector3(tier1X,maxGy,axisZ)],0x4e6275);
    for(let i=0;i<gridY.length;i++){
     const gy=gridY[i];
     line([new THREE.Vector3(tier1X-0.1,gy.value-0.1,axisZ),new THREE.Vector3(tier1X+0.1,gy.value+0.1,axisZ)],0xe68a35);
     if(i<gridY.length-1){
      const nextGy=gridY[i+1],spanDist=nextGy.value-gy.value,midY=(gy.value+nextGy.value)/2;
      const badge=el('span',fmt(spanDist,2));
      badge.className='grid-dim-badge';
      badge.title=`ช่วง ${gy.label}–${nextGy.label}: ${fmt(spanDist,3)} m`;
      addPlanTag(badge,new THREE.Vector3(tier1X,midY,axisZ));
     }
    }

    line([new THREE.Vector3(tier2X,minGy,axisZ),new THREE.Vector3(tier2X,maxGy,axisZ)],0x4e6275);
    line([new THREE.Vector3(tier2X-0.12,minGy-0.12,axisZ),new THREE.Vector3(tier2X+0.12,minGy+0.12,axisZ)],0x5b9bd5);
    line([new THREE.Vector3(tier2X-0.12,maxGy-0.12,axisZ),new THREE.Vector3(tier2X+0.12,maxGy+0.12,axisZ)],0x5b9bd5);
    const totalSpan=maxGy-minGy,midYTotal=(minGy+maxGy)/2;
    const totalBadge=el('span',fmt(totalSpan,2));
    totalBadge.className='grid-dim-badge total';
    totalBadge.title=`ระยะรวม ${gridY[0].label}–${gridY[gridY.length-1].label}: ${fmt(totalSpan,3)} m`;
    addPlanTag(totalBadge,new THREE.Vector3(tier2X,midYTotal,axisZ));
   }
  }
  updatePlanGridOverlay();
 }
 const cm = $('colorMode')?.value || 'default';
 const scaleMode = $('colorScale')?.value || 'group';
 const heatKey = cm === 'load' ? 'resultant' : (['Mz', 'Vy', 'N'].includes(cm) ? cm : null);
 const heatResults = active?.members;
 const heatGlobal = heatKey ? rangeKN(model.members, heatResults, heatKey) : null;
 const heatGroups = heatKey ? rangeByGroupKN(model.members, heatResults, heatKey, memberGroupOf) : null;
 const selectedMember = selected?.kind === 'members' ? model.members.find(x => x.id === selected.id) : null;
 const heatSelected = heatKey && selectedMember ? memberRangeKN(heatResults?.[selectedMember.id], heatKey) : null;
 const rangeForMember = m => {
  if (cm === 'utilization') return { min: 0, max: 1 };
  if (!heatKey) return null;
  // member scale focuses one member: every other member is dimmed, never re-scaled silently
  if (scaleMode === 'member') return { focus: true, id: selectedMember?.id ?? null, min: heatSelected?.min ?? 0, max: heatSelected?.max ?? 1 };
  if (scaleMode === 'group' && heatGroups) return heatGroups[memberGroupOf(m)] || heatGlobal;
  return heatGlobal;
 };
 const showSolid3D=structMode!=='wire';
 const showWireframe=structMode==='wire';
 const deformScale=Math.max(0,Number($('deformScaleInput')?.value)||100);
 const diagramScale=Math.max(.05,Number($('diagramScaleInput')?.value)||1);
 // diagnostic hook, same style as window.__rc_model/__rc_scene, used by the render tests
 viewScales={deformScale,diagramScale,lastPeakH:0,draws:(viewScales?.draws||0)+1};
 window.__rc_viewScales=viewScales;
 updateDisplayToggles();
 syncToggleLamps();
 const showPointLoads=!$('showPointLoads')||$('showPointLoads').checked;
 const showUniformLoads=!$('showUniformLoads')||$('showUniformLoads').checked;
 const showSelfWeight=!$('showSelfWeight')||$('showSelfWeight').checked;
 const showRoofSheeting=!$('showRoofSheeting')||$('showRoofSheeting').checked;
 const showNodeLabels=!$('labels')||$('labels').checked;
 const showMemberNames=!$('memberNames')||$('memberNames').checked;
 const columnPeaks=heatKey&&active?.members?model.members.filter(m=>m.kind==='column').map(m=>({id:m.id,peak:peakStation(active.members[m.id],heatKey)})).filter(x=>x.peak):[];
 const maxColumnPeak=columnPeaks.reduce((best,row)=>!best||row.peak.value>best.peak.value?row:best,null);
 const visibleMembers=new Set();for(const m of model.members){if(visibleNodeIds&&(!visibleNodeIds.has(m.i)||!visibleNodeIds.has(m.j)))continue;const a=pos.get(m.i),b=pos.get(m.j);if(!a||!b||a.distanceTo(b)<1e-6)continue;visibleMembers.add(m.id);
  const highlight=(selected?.kind==='members'&&selected.id===m.id)||selectedList.some(s=>s.kind==='members'&&s.id===m.id);
  const axes=getMemberLocalAxes(a,b,m.rotation||0);
  const secB=(m.kind==='roof'||m.sectionType==='steel_custom')?0.08:Math.max(0.08,m.b||0.25);
  const secH=(m.kind==='roof'||m.sectionType==='steel_custom')?0.08:Math.max(0.08,m.h||0.35);
  if(showSolid3D){
   const nSegments=(cm!=='default')?40:1;
   const boxGeo=new THREE.BoxGeometry(secH,axes.L,secB,1,nSegments,1);
   let memberMat;
   if(cm==='default'){
    if(highlight){
     memberMat=new THREE.MeshStandardMaterial({color:0xffbe66,metalness:.05,roughness:.85});
    }else if(m.kind==='roof'||m.sectionType==='steel_custom'){
     memberMat=new THREE.MeshStandardMaterial({color:0xd18f45,metalness:.3,roughness:.6});
    }else{
     // เสา และ คาน คสล.: คอนกรีตสีเทาซีด + เทกเจอร์คอนกรีตมวลรวม
     const concBaseColor = (m.kind === 'column') ? 0xd0d5db : 0xc6ccd3;
     memberMat=new THREE.MeshStandardMaterial({
      color: concBaseColor,
      map: concreteTex.map,
      bumpMap: concreteTex.bumpMap,
      bumpScale: 0.035,
      roughness: 0.92,
      metalness: 0.02
     });
    }
   }else{
    const posAttr=boxGeo.attributes.position;
    const colorArr=new Float32Array(posAttr.count*3);
    // the box carries exactly nSegments steps along its length, so build the station colours
    // once per member (nSegments+1 lookups) instead of running a lookup per vertex
    const memberRange=rangeForMember(m);
    const table=new Array(nSegments+1);
    for(let i=0;i<=nSegments;i++)table[i]=getMemberStationRGB(m,i/nSegments,cm,memberRange,active,heatKey);
    for(let vi=0;vi<posAttr.count;vi++){
     const yVal=posAttr.getY(vi);
     const t=axes.L>1e-6?Math.max(0,Math.min(1,(yVal+axes.L/2)/axes.L)):0;
     const rgb=table[Math.round(t*nSegments)]||table[0];
     colorArr[vi*3]=rgb[0];colorArr[vi*3+1]=rgb[1];colorArr[vi*3+2]=rgb[2];
    }
    boxGeo.setAttribute('color',new THREE.BufferAttribute(colorArr,3));
    memberMat=new THREE.MeshBasicMaterial({vertexColors:true});
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
  }
  if(showWireframe||!showSolid3D){
   let wireColor=highlight?0xffbe66:m.kind==='roof'?0xf59e0b:m.kind==='column'?0x10b981:0x38bdf8;
   if(cm!=='default'){
    const rgb=getMemberStationRGB(m,0.5,cm,rangeForMember(m),active,heatKey);
    wireColor=new THREE.Color(rgb[0],rgb[1],rgb[2]).getHex();
   }
   const lineGeo=new THREE.BufferGeometry().setFromPoints([a,b]);
   const lineMat=new THREE.LineBasicMaterial({color:wireColor,linewidth:2});
   const wLine=new THREE.Line(lineGeo,lineMat);
   wLine.userData={kind:'members',id:m.id};
   group.add(wLine);
  }
  if(heatKey&&m.kind==='column'&&active?.members){
   const peak=peakStation(active.members[m.id],heatKey);
   if(peak){
    // Peak of internal resultant demand, NOT the physical applied-load location.
    const at=a.clone().lerp(b,peak.t);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));
    marker.position.copy(at);marker.userData={kind:'members',id:m.id,forcePeak:true};marker.renderOrder=12;group.add(marker);
    if(highlight||maxColumnPeak?.id===m.id){
     const text=`${m.id} · ค่าสูงสุด ${fmt(quantity(peak.value,heatKey==='Mz'?'moment':'force'),1)} ${unitLabel(heatKey==='Mz'?'moment':'force')} · จาก i ${fmt(peak.x,2)} m`;
     const badge=labelSprite(text,0,34,13,{bg:'rgba(30,41,59,.95)',border:'#ffffff',color:'#ffffff',radius:6,alwaysOnTop:true});
     badge.position.copy(at).add(new THREE.Vector3(.38,.2,.2));group.add(badge);
    }
   }
  }
  // member local-axis triads were removed with the local-axes menu: they added clutter without telling the user anything they could act on
  if(active&&$('diagram3d')?.checked&&viewMode!=='plan'){
   const memRes=active.members[m.id];
   if(memRes&&memRes.samples&&memRes.samples.length>=2){
     const isVy = (cm === 'Vy' || $('diagramType')?.value === 'Vy');
     let diagKey = isVy ? 'Vy' : 'Mz';
     let dirY = new THREE.Vector3(...axes.y);
     if (!isVy) {
      const maxMz = Math.max(...memRes.samples.map(s => Math.abs(s.Mz || 0)), 0);
      const maxMy = Math.max(...memRes.samples.map(s => Math.abs(s.My || 0)), 0);
      if (maxMy > maxMz * 1.05) {
       diagKey = 'My';
       dirY = new THREE.Vector3(...axes.z);
      }
     }
     const diagMax = Math.max(...memRes.samples.map(s => Math.abs(s[diagKey] || 0)), 0);
     if (diagMax > 1e-4) {
      const peakH = Math.min(0.65, Math.max(0.18, axes.L * 0.22)) * diagramScale;
      viewScales.lastPeakH = Math.max(viewScales.lastPeakH || 0, peakH);
      const dScale = peakH / diagMax;
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
     const ribMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.65,depthTest:false,depthWrite:false});
     const ribMesh=new THREE.Mesh(ribGeo,ribMat);
     ribMesh.renderOrder=900;
     group.add(ribMesh);
     const isMomentDiag=(diagKey==='Mz'||diagKey==='My');
     const frameColor=isMomentDiag?0x39ff14:0xff5500; // Neon Lime for Moment, Electric Orange for Shear
     const lineMat=new THREE.LineBasicMaterial({color:frameColor,depthTest:false,linewidth:2});
     const lineGeo=new THREE.BufferGeometry().setFromPoints(linePts);
     const boundaryLine=new THREE.Line(lineGeo,lineMat);
     boundaryLine.renderOrder=905;
     group.add(boundaryLine);
     const tieMat=new THREE.LineBasicMaterial({color:frameColor,depthTest:false});
     const tieA=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,linePts[0]]),tieMat);
     tieA.renderOrder=905;
     group.add(tieA);
     const tieB=new THREE.Line(new THREE.BufferGeometry().setFromPoints([b,linePts[linePts.length-1]]),tieMat);
     tieB.renderOrder=905;
     group.add(tieB);
     const showDiagValues = !$('diagramValues') || $('diagramValues').checked;
     const isSelectedMem = (selected?.kind === 'members' && selected.id === m.id) || selectedList.some(s => s.kind === 'members' && s.id === m.id);
     const isInspectedMem = isSelectedMem || ($('resultMember')?.value === m.id);
     const isRoof = m.kind === 'roof' || m.sectionType === 'steel_custom';

     if(showDiagValues && (!isRoof || isInspectedMem) && diagMax > 0.05){
      let kPeak = 0, peakVal = 0;
      for(let k = 0; k < memRes.samples.length; k++){
       const av = Math.abs(memRes.samples[k][diagKey]);
       if(av > peakVal){ peakVal = av; kPeak = k; }
      }
      const uKey = (diagKey === 'Mz' || diagKey === 'My') ? 'moment' : 'force';
      const numPts = linePts.length;
      let kLabel = kPeak;
      // Joint clearance anti-collision: clamp label point to 22% - 78% of span
      // so beam, column and cross-beam peak values don't collide directly at the joint node
      if(numPts >= 5){
       const fracPeak = kPeak / (numPts - 1);
       if(fracPeak < 0.20){
        kLabel = Math.min(numPts - 1, Math.max(kPeak, Math.round((numPts - 1) * 0.22)));
       }else if(fracPeak > 0.80){
        kLabel = Math.max(0, Math.min(kPeak, Math.round((numPts - 1) * 0.78)));
       }
      }
      const valStr = `${diagKey} = ${fmt(quantity(peakVal, uKey), 1)} ${unitLabel(uKey)}`;
      const labelOpts = isInspectedMem
       ? { bg: 'rgba(234, 88, 12, 0.95)', border: '#fef08a', color: '#00FFB2', radius: 6, alwaysOnTop: true }
       : { bg: (diagKey === 'Mz' || diagKey === 'My') ? 'rgba(8, 28, 44, 0.92)' : 'rgba(44, 18, 5, 0.92)',
           border: (diagKey === 'Mz' || diagKey === 'My') ? '#39ff14' : '#ff5500',
           color: '#00FFB2', radius: 6, alwaysOnTop: true };
      const label = labelSprite(valStr, 0, 36, 14, labelOpts);
      label.position.copy(linePts[kLabel]).addScaledVector(dirY, 0.16);
      group.add(label);
     }
    }
   }
  }
  if(showMemberNames){
   // the member name sits dead-center on the member: glowing lightning orange glyphs with pulsing beat-up rhythm
   const nameLabel = labelSprite(getMemberMark(m), 0, MEMBER_NAME_CANVAS_H, MEMBER_NAME_FONT, {
    bg: null, padX: MEMBER_NAME_PAD, color: MEMBER_NAME_FILL, outline: '#000000', outlineWidth: 6,
    glow: MEMBER_NAME_GLOW, glowBlur: 16, alwaysOnTop: true
   });
   nameLabel.userData={kind:'memberName',member:m.id};
   nameLabel.scale.multiplyScalar(MEMBER_NAME_SCALE);
   // place directly at the 3D center of the member line (a.lerp(b, 0.5))
   nameLabel.position.copy(a).lerp(b, 0.5);
   group.add(nameLabel);
   memberNameSprites.push({
    sprite: nameLabel,
    baseScaleX: nameLabel.scale.x,
    baseScaleY: nameLabel.scale.y
   });
  }
  if(active&&$('deformed').checked&&deformScale>0){const da=active.nodes[m.i].displacement,db=active.nodes[m.j].displacement;line([a.clone().add(new THREE.Vector3(...da.slice(0,3)).multiplyScalar(deformScale)),b.clone().add(new THREE.Vector3(...db.slice(0,3)).multiplyScalar(deformScale))],0xffb861);}
 }
 for(const n of model.nodes){if(visibleNodeIds&&!visibleNodeIds.has(n.id))continue;const p=pos.get(n.id);if(!p)continue;
  const isWireOnly=showWireframe&&!showSolid3D;
  const isSelNode=(selected?.kind==='nodes'&&selected.id===n.id)||selectedList.some(s=>s.kind==='nodes'&&s.id===n.id);
  const nodeColor=isSelNode?0xffbe66:isWireOnly?0x38bdf8:0xd8edf9;
  const nodeRadius=isWireOnly?0.04:0.025;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(nodeRadius,10,10),new THREE.MeshStandardMaterial({color:nodeColor}));mesh.position.copy(p);mesh.userData={kind:'nodes',id:n.id};group.add(mesh);
  if(n.restraints.some(Boolean)){
   const isZUp=model.coordinateSystem==='z-up';
   const isElevated=isZUp?(n.z>0.05):(n.y>0.05);
   const coneColor=isElevated?0xef4444:0x6885a6;
   const support=new THREE.Mesh(new THREE.ConeGeometry(.24,.32,4),new THREE.MeshStandardMaterial({color:coneColor,transparent:true,opacity:.85}));
   if(isZUp){
    support.rotation.x=Math.PI/2;
    support.position.copy(p).add(new THREE.Vector3(0,0,-.16));
   }else{
    support.position.copy(p).add(new THREE.Vector3(0,-.2,0));
   }
   group.add(support);
   if(isElevated&&showNodeLabels){
    const elevAxis=isZUp?'Z':'Y',elevVal=isZUp?n.z:n.y;
    const badge=labelSprite(`⚠️ ${n.id} (Support ลอยฟ้า ${elevAxis}=${fmt(elevVal)}m)`,0,30,13,{bg:'rgba(239, 68, 68, 0.95)',border:'#fef08a',color:'#ffffff',radius:6,alwaysOnTop:true});
    badge.position.copy(p).add(isZUp?new THREE.Vector3(0,0,0.35):new THREE.Vector3(0,0.35,0));
    group.add(badge);
   }
  }
  if(showNodeLabels){
   const isSelNode = (selected?.kind === 'nodes' && selected.id === n.id) || selectedList.some(s => s.kind === 'nodes' && s.id === n.id);
   const labelOpts = isSelNode
    ? { bg: 'rgba(245, 158, 11, 0.95)', border: '#fef08a', color: '#0f172a', radius: 8, alwaysOnTop: true }
    : { bg: 'rgba(15, 23, 42, 0.90)', border: 'rgba(56, 189, 248, 0.5)', color: '#93c5fd', radius: 8 };
   const label = labelSprite(n.id, 0, 26, 12, labelOpts);
   label.position.copy(p).add(new THREE.Vector3(0.08, 0.18, 0));
   group.add(label);
  }
 }
 // Point Loads (Nodal)
 if(showPointLoads){
  for(const load of model.nodalLoads){
   if(visibleNodeIds&&!visibleNodeIds.has(load.node))continue;
   const p=pos.get(load.node);
   if(!p)continue;
   const v=new THREE.Vector3(load.fx,load.fy,load.fz);
   const pVal=v.length();
   if(pVal>1e-6){
    const d=v.clone().normalize();
    const arrowLen=0.85;
    const ptArr=new THREE.ArrowHelper(d,p.clone().sub(d.clone().multiplyScalar(arrowLen)),arrowLen,0xef4444,0.22,0.12);
     ptArr.line.material.depthTest=false;
     ptArr.cone.material.depthTest=false;
     ptArr.line.renderOrder=910;
     ptArr.cone.renderOrder=910;
     group.add(ptArr);
    const isRoofNode = model.members.some(m=>m.kind==='roof'&&(m.i===load.node||m.j===load.node));
    const loadNote = isRoofNode ? ` (${load.case} · ถ่ายจากแป)` : ` (${load.case})`;
    const badge=labelSprite(`P = ${fmt(quantity(pVal,'force'),1)} ${unitLabel('force')}${loadNote}`,0,28,12,{bg:'rgba(153, 27, 27, 0.92)',border:'rgba(248, 113, 113, 0.65)',color:'#fee2e2',radius:5});
    badge.position.copy(p).sub(d.clone().multiplyScalar(arrowLen+0.16));
    group.add(badge);
   }
  }
 }
 // Uniform Distributed Loads (UDL)
 if(showUniformLoads){
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
   const beamH=m.h||0.35;
   const baseOffset=(m.kind==='beam'&&showSolid3D)?(beamH*0.5+0.005):0;
   const baseA=a.clone().addScaledVector(dirBox,baseOffset);
   const baseB=b.clone().addScaledVector(dirBox,baseOffset);
   const boxH=Math.min(0.65,Math.max(0.35,L*0.12));
   const topA=baseA.clone().addScaledVector(dirBox,boxH);
   const topB=baseB.clone().addScaledVector(dirBox,boxH);

   // Rectangular wireframe frame lines - see-through
   line([topA,topB],0xf59e0b,false,{depthTest:false,renderOrder:910,linewidth:2});
   line([baseA,topA],0xf59e0b,false,{depthTest:false,renderOrder:910});
   line([baseB,topB],0xf59e0b,false,{depthTest:false,renderOrder:910});
   line([baseA,baseB],0xd97706,false,{depthTest:false,renderOrder:910});

   // Shaded quad - see through
   const quadGeo=new THREE.BufferGeometry();
   const quadVerts=[
    baseA.x,baseA.y,baseA.z, topA.x,topA.y,topA.z, topB.x,topB.y,topB.z,
    baseA.x,baseA.y,baseA.z, topB.x,topB.y,topB.z, baseB.x,baseB.y,baseB.z
   ];
   quadGeo.setAttribute('position',new THREE.Float32BufferAttribute(quadVerts,3));
   quadGeo.computeVertexNormals();
   const quadMat=new THREE.MeshBasicMaterial({color:0xfbbf24,transparent:true,opacity:0.25,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
   const udlQuadMesh=new THREE.Mesh(quadGeo,quadMat);
   udlQuadMesh.renderOrder=908;
   group.add(udlQuadMesh);

   // Downward arrows inside the box - see through
   const numArrows=Math.max(4,Math.min(8,Math.round(L*1.5)));
   for(let i=0;i<numArrows;i++){
    const t=(i+0.5)/numArrows;
    const pTop=topA.clone().lerp(topB,t);
    const pBeam=baseA.clone().lerp(baseB,t);
    const arrLen=pTop.distanceTo(pBeam);
    const hl=Math.min(arrLen*0.35,0.14);
    const arr=new THREE.ArrowHelper(dirLoad,pTop,arrLen,0xf59e0b,hl,hl*0.6);
    arr.line.material.depthTest=false;
    arr.cone.material.depthTest=false;
    arr.line.renderOrder=910;
    arr.cone.renderOrder=910;
    group.add(arr);
   }

   // Badge with load in kg/m and case: Neon Mint font with alwaysOnTop
   const badge=labelSprite(`q = ${fmt(quantity(qVal,'line'),1)} ${unitLabel('line')} (${load.case})`,0,32,13,{
    bg:'rgba(44, 28, 5, 0.92)',
    border:'#f59e0b',
    color:'#00FFB2', // Neon Mint
    radius:5,
    alwaysOnTop:true
   });
   badge.position.copy(topA).lerp(topB,0.50).addScaledVector(dirBox,0.15);
   group.add(badge);
  }
 }

 // Material Self-Weight & Floor Load Transfers (SW)
 if(showSelfWeight && model.selfWeight){
  for(const m of model.members){
   if(visibleNodeIds&&(!visibleNodeIds.has(m.i)||!visibleNodeIds.has(m.j)))continue;
   const a=pos.get(m.i),b=pos.get(m.j);
   if(!a||!b||a.distanceTo(b)<1e-6)continue;
   const L=a.distanceTo(b);
   const density=(m.sectionType==='steel_custom'?model.steel.density:model.material.density)||24;
   const secA=(m.kind==='roof'||m.sectionType==='steel_custom')?(m.A||0.002):(m.b||0.25)*(m.h||0.35);
   const swKNm=secA*density; // line load in kN/m
   const swTotalKN=swKNm*L;
   const isSelectedMem=selected?.kind==='members'&&selected.id===m.id;

   if(m.kind==='beam'&&swKNm>0.005){
    const isZUp=model.coordinateSystem==='z-up';
    const dirLoad=isZUp?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,-1,0);
    const dirBox=isZUp?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
    const beamH=m.h||0.35;
    const baseOffset=showSolid3D ? (beamH*0.5 + 0.005) : 0;
    const baseA=a.clone().addScaledVector(dirBox,baseOffset);
    const baseB=b.clone().addScaledVector(dirBox,baseOffset);
    const boxH=Math.min(0.45,Math.max(0.22,L*0.08));
    const topA=baseA.clone().addScaledVector(dirBox,boxH);
    const topB=baseB.clone().addScaledVector(dirBox,boxH);

    // Aqua blue wireframe lines for self-weight (dead load) - See-through above and through solid beams
    line([topA,topB],0x00e5ff,false,{depthTest:false,renderOrder:910,linewidth:2});
    line([baseA,topA],0x00e5ff,false,{depthTest:false,renderOrder:910});
    line([baseB,topB],0x00e5ff,false,{depthTest:false,renderOrder:910});
    line([baseA,baseB],0x00e5ff,true,{depthTest:false,renderOrder:910}); // Base beam contact line dashed

    // Shaded vibrant Aqua quad - see through
    const quadGeo=new THREE.BufferGeometry();
    const quadVerts=[
     baseA.x,baseA.y,baseA.z, topA.x,topA.y,topA.z, topB.x,topB.y,topB.z,
     baseA.x,baseA.y,baseA.z, topB.x,topB.y,topB.z, baseB.x,baseB.y,baseB.z
    ];
    quadGeo.setAttribute('position',new THREE.Float32BufferAttribute(quadVerts,3));
    quadGeo.computeVertexNormals();
    const quadMat=new THREE.MeshBasicMaterial({color:0x00e5ff,transparent:true,opacity:0.35,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    const swQuadMesh=new THREE.Mesh(quadGeo,quadMat);
    swQuadMesh.renderOrder=908;
    group.add(swQuadMesh);

    // Downward Aqua arrows - see through
    const numArrows=Math.max(3,Math.min(6,Math.round(L*1.2)));
    for(let i=0;i<numArrows;i++){
     const t=(i+0.5)/numArrows;
     const pTop=topA.clone().lerp(topB,t);
     const pBeam=a.clone().lerp(b,t);
     const arrLen=pTop.distanceTo(pBeam);
     const hl=Math.min(arrLen*0.35,0.11);
     const arr=new THREE.ArrowHelper(dirLoad,pTop,arrLen,0x00e5ff,hl,hl*0.6);
     arr.line.material.depthTest=false;
     arr.cone.material.depthTest=false;
     arr.line.renderOrder=910;
     arr.cone.renderOrder=910;
     group.add(arr);
    }

    // SW Badge: always show in Neon Mint (#00FFB2) font with alwaysOnTop priority
    const swVal=quantity(swKNm,'line');
    const badge=labelSprite(`SW = ${fmt(swVal,1)} ${unitLabel('line')}`,0,30,13,{
     bg:'rgba(8, 28, 44, 0.92)',
     border:'#00e5ff',
     color:'#00FFB2', // Neon Mint
     radius:5,
     alwaysOnTop:true
    });
    badge.position.copy(topA).lerp(topB,0.28).addScaledVector(dirBox,0.14);
    group.add(badge);
   }else if((m.kind==='column'||m.kind==='roof')&&swTotalKN>0.01){
    // Column or roof self-weight badge at midpoint
    const swVal=quantity(swTotalKN,'force');
    const mid=a.clone().lerp(b,0.5);
    const badge=labelSprite(`SW = ${fmt(swVal,1)} ${unitLabel('force')}`,0,28,12,{
     bg:'rgba(8, 28, 44, 0.92)',
     border:'#00e5ff',
     color:'#00FFB2', // Neon Mint
     radius:5,
     alwaysOnTop:true
    });
    badge.position.copy(mid).add(new THREE.Vector3(0.12,0.1,0.12));
    group.add(badge);
   }
  }

  // Floor load transfers (slab tributary lines onto beams)
  const floorTransfers=result?.coverage?.floorLoadTransfers||[];
  for(const ft of floorTransfers){
   const m=model.members.find(x=>x.id===ft.member);
   if(!m)continue;
   const a=pos.get(m.i),b=pos.get(m.j);
   if(!a||!b)continue;
   const L=a.distanceTo(b);
   if(L<1e-6)continue;
   const isZUp=model.coordinateSystem==='z-up';
   const qVal=isZUp?(ft.qzKNm||ft.qyKNm||0):(ft.qyKNm||0);
   if(qVal>0.005){
    const dirBox=isZUp?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
    const boxH=Math.min(0.48,Math.max(0.22,L*0.10));
    const topA=a.clone().addScaledVector(dirBox,boxH);
    const topB=b.clone().addScaledVector(dirBox,boxH);
    const isSelectedMem=selected?.kind==='members'&&selected.id===m.id;
    if(isSelectedMem || (model.members.length<35)){
     const qDisp=quantity(qVal,'line');
     const badge=labelSprite(`พื้น ${ft.source} = ${fmt(qDisp,1)} ${unitLabel('line')}`,0,28,12,{bg:'rgba(6, 78, 59, 0.92)',border:'rgba(52, 211, 153, 0.65)',color:'#d1fae5',radius:5});
     badge.position.copy(topA).lerp(topB,0.72).addScaledVector(dirBox,0.12);
     group.add(badge);
    }
   }
  }
 }

  // 3D Roofing Surface (แผ่นมุงหลังคา Metal Sheet + ฉนวน PU)
  if(showRoofSheeting && showSolid3D){
   const roofMembers = model.members.filter(m => m.kind === 'roof');
   if(roofMembers.length){
    const isZUp = model.coordinateSystem === 'z-up';
    const roofNodeIds = new Set();
    for(const m of roofMembers){ roofNodeIds.add(m.i); roofNodeIds.add(m.j); }
    const slices = new Map();
    for(const nid of roofNodeIds){
     const p = pos.get(nid);
     if(!p) continue;
     const bayVal = isZUp ? p.y : p.z;
     const bayKey = Math.round(bayVal * 1000) / 1000;
     if(!slices.has(bayKey)) slices.set(bayKey, []);
     slices.get(bayKey).push({ id: nid, x: p.x, y: p.y, z: p.z });
    }
    const sortedBay = Array.from(slices.keys()).sort((a,b) => a - b);
    if(sortedBay.length >= 2){
     const profileMap = new Map();
     for(const bayVal of sortedBay){
      const nodes = slices.get(bayVal);
      const topByX = new Map();
      for(const n of nodes){
       const xKey = Math.round(n.x * 1000) / 1000;
       const elev = isZUp ? n.z : n.y;
       if(!topByX.has(xKey) || elev > (isZUp ? topByX.get(xKey).z : topByX.get(xKey).y)){
        topByX.set(xKey, n);
       }
      }
      const sortedX = Array.from(topByX.values()).sort((a,b) => a.x - b.x);
      profileMap.set(bayVal, sortedX);
     }
     const vertices = [], ribLines = [];
     let overallMinX = Infinity, overallMaxX = -Infinity, overallMaxElev = -Infinity;
     for(let i = 0; i < sortedBay.length - 1; i++){
      const b0 = sortedBay[i], b1 = sortedBay[i+1];
      const profA = profileMap.get(b0);
      const profB = profileMap.get(b1);
      if(!profA || !profB || profA.length < 2 || profA.length !== profB.length) continue;
      for(let k = 0; k < profA.length - 1; k++){
       const p0 = profA[k], p1 = profA[k+1];
       const p3 = profB[k], p2 = profB[k+1];
       overallMinX = Math.min(overallMinX, p0.x, p1.x);
       overallMaxX = Math.max(overallMaxX, p0.x, p1.x);
       const elev0 = isZUp ? p0.z : p0.y, elev1 = isZUp ? p1.z : p1.y;
       const elev2 = isZUp ? p2.z : p2.y, elev3 = isZUp ? p3.z : p3.y;
       overallMaxElev = Math.max(overallMaxElev, elev0, elev1, elev2, elev3);
       if(isZUp){
        vertices.push(p0.x, p0.y, p0.z + 0.02, p1.x, p1.y, p1.z + 0.02, p2.x, p2.y, p2.z + 0.02);
        vertices.push(p0.x, p0.y, p0.z + 0.02, p2.x, p2.y, p2.z + 0.02, p3.x, p3.y, p3.z + 0.02);
        ribLines.push([new THREE.Vector3(p0.x, p0.y, p0.z + 0.025), new THREE.Vector3(p1.x, p1.y, p1.z + 0.025)]);
        ribLines.push([new THREE.Vector3(p3.x, p3.y, p3.z + 0.025), new THREE.Vector3(p2.x, p2.y, p2.z + 0.025)]);
        ribLines.push([new THREE.Vector3(p0.x, p0.y, p0.z + 0.025), new THREE.Vector3(p3.x, p3.y, p3.z + 0.025)]);
        ribLines.push([new THREE.Vector3(p1.x, p1.y, p1.z + 0.025), new THREE.Vector3(p2.x, p2.y, p2.z + 0.025)]);
        for(const t of [0.33, 0.67]){
         const r0 = new THREE.Vector3(p0.x, p0.y, p0.z + 0.028).lerp(new THREE.Vector3(p3.x, p3.y, p3.z + 0.028), t);
         const r1 = new THREE.Vector3(p1.x, p1.y, p1.z + 0.028).lerp(new THREE.Vector3(p2.x, p2.y, p2.z + 0.028), t);
         ribLines.push([r0, r1]);
        }
       }else{
        vertices.push(p0.x, p0.y + 0.02, p0.z, p1.x, p1.y + 0.02, p1.z, p2.x, p2.y + 0.02, p2.z);
        vertices.push(p0.x, p0.y + 0.02, p0.z, p2.x, p2.y + 0.02, p2.z, p3.x, p3.y + 0.02, p3.z);
        ribLines.push([new THREE.Vector3(p0.x, p0.y + 0.025, p0.z), new THREE.Vector3(p1.x, p1.y + 0.025, p1.z)]);
        ribLines.push([new THREE.Vector3(p3.x, p3.y + 0.025, p3.z), new THREE.Vector3(p2.x, p2.y + 0.025, p2.z)]);
        ribLines.push([new THREE.Vector3(p0.x, p0.y + 0.025, p0.z), new THREE.Vector3(p3.x, p3.y + 0.025, p3.z)]);
        ribLines.push([new THREE.Vector3(p1.x, p1.y + 0.025, p1.z), new THREE.Vector3(p2.x, p2.y + 0.025, p2.z)]);
        for(const t of [0.33, 0.67]){
         const r0 = new THREE.Vector3(p0.x, p0.y + 0.028, p0.z).lerp(new THREE.Vector3(p3.x, p3.y + 0.028, p3.z), t);
         const r1 = new THREE.Vector3(p1.x, p1.y + 0.028, p1.z).lerp(new THREE.Vector3(p2.x, p2.y + 0.028, p2.z), t);
         ribLines.push([r0, r1]);
        }
       }
      }
     }
     if(vertices.length){
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({color: 0x38bdf8, metalness: 0.35, roughness: 0.55, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false});
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { kind: 'roofSheeting', id: 'RS1' };
      group.add(mesh);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.75 });
      for(const [ptA, ptB] of ribLines){
       const lGeo = new THREE.BufferGeometry().setFromPoints([ptA, ptB]);
       group.add(new THREE.Line(lGeo, lineMat));
      }
      if(Number.isFinite(overallMinX) && Number.isFinite(overallMaxX) && Number.isFinite(overallMaxElev)){
       const midX = (overallMinX + overallMaxX) / 2;
       const midBay = (sortedBay[0] + sortedBay[sortedBay.length - 1]) / 2;
       const badge = labelSprite(`แผ่นมุง Metal Sheet 0.47 mm + ฉนวน PU (DL ~15 kg/m², LL ~30 kg/m²)\nกลไกถ่ายแรง: แผ่นมุง w → แป q (kg/m) → ถ่ายลงโหนดโครงถัก P (kg)`, 0, 52, 12, { bg: 'rgba(12, 74, 110, 0.94)', border: 'rgba(56, 189, 248, 0.8)', color: '#f0f9ff', radius: 6, alwaysOnTop: true });
       if(isZUp){
        badge.position.set(midX, midBay, overallMaxElev + 0.45);
       }else{
        badge.position.set(midX, overallMaxElev + 0.45, midBay);
       }
       group.add(badge);
      }
     }
    }
   }
  }

  for(const slab of model.slabs){
   if(visibleNodeIds&&!slab.nodes.every(id=>visibleNodeIds.has(id)))continue;
   const pts=slab.nodes.map(id=>pos.get(id));
   if(pts.length<3||pts.some(p=>!p))continue;
   if(showSolid3D){
    const isZUp=model.coordinateSystem==='z-up';
    const contour=pts.map(p=>isZUp?new THREE.Vector2(p.x,p.y):new THREE.Vector2(p.x,p.z));
    const triangles=THREE.ShapeUtils.triangulateShape(contour,[]),vertices=[];
    for(const tri of triangles){
     for(const i of tri){
      if(isZUp){
       vertices.push(pts[i].x,pts[i].y,pts[i].z-.025);
      }else{
       vertices.push(pts[i].x,pts[i].y-.025,pts[i].z);
      }
     }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:slab.mode==='pending'?0xddae66:0x5e9acd,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));
    mesh.userData={kind:'slabs',id:slab.id};
    group.add(mesh);
   }
   if(showWireframe||!showSolid3D){
    const loopPts=[...pts,pts[0]];
    const lineGeo=new THREE.BufferGeometry().setFromPoints(loopPts);
    const lineMat=new THREE.LineBasicMaterial({color:0x38bdf8,linewidth:2});
    const slabBorder=new THREE.Line(lineGeo,lineMat);
    slabBorder.userData={kind:'slabs',id:slab.id};
    group.add(slabBorder);
   }
  }

  for(const f of model.foundations){
   if(visibleNodeIds&&!f.nodes.every(id=>visibleNodeIds.has(id)))continue;
   const pts=f.nodes.map(id=>pos.get(id));
   if(!pts.length||pts.some(p=>!p))continue;
   const c=pts.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/pts.length);
   const isSelected=selected?.kind==='foundations'&&selected.id===f.id;
   const pCount=f.pileCount||(f.type==='pile_cap'?4:0);
   const pLen=f.pileLength||12.0;
   const isZUp=model.coordinateSystem==='z-up';
   const by=isZUp?(f.by??f.bz??1.4):(f.bz||1.4);
   const bz=isZUp?by:(f.bz||1.4);
   if([f.bx,bz,f.depth].every(v=>Number.isFinite(v)&&v>0)){
    const capGeo=isZUp?new THREE.BoxGeometry(f.bx,by,f.depth):new THREE.BoxGeometry(f.bx,f.depth,f.bz);
    const posOffset=isZUp?new THREE.Vector3(0,0,-f.depth/2):new THREE.Vector3(0,-f.depth/2,0);
    if(showSolid3D){
     const capMat=new THREE.MeshStandardMaterial({color:isSelected?0xffbe66:(f.mode==='pending'?0xc99653:0x8593a5),transparent:true,opacity:.8});
     const mesh=new THREE.Mesh(capGeo,capMat);
     mesh.position.copy(c).add(posOffset);
     mesh.userData={kind:'foundations',id:f.id};
     group.add(mesh);
     if(isSelected)group.add(new THREE.BoxHelper(mesh,0xffbe66));
    }else{
     const edges=new THREE.EdgesGeometry(capGeo);
     const lineMat=new THREE.LineBasicMaterial({color:isSelected?0xffbe66:0x64748b,linewidth:2});
     const capWire=new THREE.LineSegments(edges,lineMat);
     capWire.position.copy(c).add(posOffset);
     capWire.userData={kind:'foundations',id:f.id};
     group.add(capWire);
    }
   }
   if(pCount>0){
    const pileR=0.125;
    const dy=Math.min((by||1.4)*0.28,0.45),dz=Math.min((f.bz||1.4)*0.28,0.45);
    const dSec=isZUp?dy:dz;
    const dx=Math.min((f.bx||1.4)*0.28,0.45);
    let pileOffsets=[[0,0]];
    if(pCount===1)pileOffsets=[[0,0]];
    else if(pCount===2)pileOffsets=[[-dx,0],[dx,0]];
    else if(pCount===3)pileOffsets=[[-dx,-dSec*0.7],[dx,-dSec*0.7],[0,dSec*0.7]];
    else if(pCount===4)pileOffsets=[[-dx,-dSec],[dx,-dSec],[-dx,dSec],[dx,dSec]];
    else if(pCount===5)pileOffsets=[[-dx,-dSec],[dx,-dSec],[-dx,dSec],[dx,dSec],[0,0]];
    else if(pCount===6)pileOffsets=[[-dx,-dSec],[0,-dSec],[dx,-dSec],[-dx,dSec],[0,dSec],[dx,dSec]];
    else pileOffsets=[[-dx,-dSec],[dx,-dSec],[-dx,dSec],[dx,dSec]];
    if(isZUp){
     const pileZ=c.z-(f.depth||0.5)-pLen/2;
     if(showSolid3D){
      const cylGeo=new THREE.CylinderGeometry(pileR,pileR,pLen,16);
      cylGeo.rotateX(Math.PI/2);
      const edgeGeo=new THREE.EdgesGeometry(cylGeo,30);
      const pileMat=new THREE.MeshStandardMaterial({color:isSelected?0xffd59e:0x94a3b8,roughness:.6,metalness:.1,transparent:true,opacity:.85});
      const edgeMat=new THREE.LineBasicMaterial({color:0x334155});
      for(const [ox,oy] of pileOffsets){
       const pMesh=new THREE.Mesh(cylGeo,pileMat);
       pMesh.position.set(c.x+ox,c.y+oy,pileZ);
       pMesh.userData={kind:'foundations',id:f.id};
       group.add(pMesh);
       const edgeLine=new THREE.LineSegments(edgeGeo,edgeMat);
       edgeLine.position.copy(pMesh.position);
       group.add(edgeLine);
      }
     }else{
      const pileMat=new THREE.LineBasicMaterial({color:isSelected?0xffd59e:0x0284c7,linewidth:2});
      for(const [ox,oy] of pileOffsets){
       const pTop=new THREE.Vector3(c.x+ox,c.y+oy,c.z-(f.depth||0.5));
       const pBot=new THREE.Vector3(c.x+ox,c.y+oy,c.z-(f.depth||0.5)-pLen);
       const pLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([pTop,pBot]),pileMat);
       pLine.userData={kind:'foundations',id:f.id};
       group.add(pLine);
      }
     }
    }else{
     const pileY=c.y-(f.depth||0.5)-pLen/2;
     if(showSolid3D){
      const cylGeo=new THREE.CylinderGeometry(pileR,pileR,pLen,16);
      const edgeGeo=new THREE.EdgesGeometry(cylGeo,30);
      const pileMat=new THREE.MeshStandardMaterial({color:isSelected?0xffd59e:0x94a3b8,roughness:.6,metalness:.1,transparent:true,opacity:.85});
      const edgeMat=new THREE.LineBasicMaterial({color:0x334155});
      for(const [ox,oz] of pileOffsets){
       const pMesh=new THREE.Mesh(cylGeo,pileMat);
       pMesh.position.set(c.x+ox,pileY,c.z+oz);
       pMesh.userData={kind:'foundations',id:f.id};
       group.add(pMesh);
       const edgeLine=new THREE.LineSegments(edgeGeo,edgeMat);
       edgeLine.position.copy(pMesh.position);
       group.add(edgeLine);
      }
     }else{
      const pileMat=new THREE.LineBasicMaterial({color:isSelected?0xffd59e:0x0284c7,linewidth:2});
      for(const [ox,oz] of pileOffsets){
       const pTop=new THREE.Vector3(c.x+ox,c.y-(f.depth||0.5),c.z+oz);
       const pBot=new THREE.Vector3(c.x+ox,c.y-(f.depth||0.5)-pLen,c.z+oz);
       const pLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([pTop,pBot]),pileMat);
       pLine.userData={kind:'foundations',id:f.id};
       group.add(pLine);
      }
     }
    }
   }
   const fmark=getFoundationMark(f);
   const pileText=pCount>0?` · ${pCount} เข็ม`:'';
   const label=labelSprite(`${fmark} (${f.id})${pileText}`);
   label.position.copy(c).add(isZUp?new THREE.Vector3(.3,.3,-f.depth-0.2):new THREE.Vector3(.3,-f.depth-0.2,.3));
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
 if(viewMode==='plan'&&activeTool==='memberNode'&&lineSnapHover?.point){const marker=new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),new THREE.MeshBasicMaterial({color:0xff9a33,depthTest:false}));marker.position.set(lineSnapHover.point.x,lineSnapHover.point.y+.04,lineSnapHover.point.z);group.add(marker);}
 if(viewMode==='plan'&&activeTool==='beam'&&beamDrag){const start=pos.get(beamDrag.startId);if(start&&beamDrag.world){const dragColor=beamAxisLock==='x'?0xef4444:(beamAxisLock==='y'||beamAxisLock==='z')?0x22c55e:0xff7a00;line([start,beamDrag.world],dragColor);const endMarker=new THREE.Mesh(new THREE.SphereGeometry(.095,10,8),new THREE.MeshBasicMaterial({color:beamAxisLock==='x'?0xef4444:(beamAxisLock==='y'||beamAxisLock==='z')?0x22c55e:0xffa24a,depthTest:false}));endMarker.position.copy(beamDrag.world);group.add(endMarker);}}
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
function classification(collection,row){if(collection==='nodes')return (row.y>0.05&&row.restraints?.some(Boolean))?'⚠️ Support ลอยฟ้า!':row.restraints?.some(Boolean)?'จุดรองรับ (Support)':'อิสระ';if(collection==='slabs')return row.mode==='one_way_load'&&['one_way','precast','steel_deck','custom'].includes(row.type)?'ตั้งให้ถ่ายนน.ทางเดียว':'รอวิเคราะห์';if(collection==='foundations')return row.mode==='ideal_support'?'จุดรองรับ / ไม่ตรวจฐาน':'รอยืนยันรองรับ';if(collection==='members')return (row.behavior==='truss'||row.kind==='roof'&&['truss','spaceframe'].includes(row.roofType))?'รอระบบ truss':row.sectionType==='steel_custom'&&['A','Iy','Iz','J'].some(k=>!Number.isFinite(row[k])||row[k]<=0)?'รอคุณสมบัติหน้าตัด':'วิเคราะห์ frame';return '';}
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
  const framingMembers=model.members.filter(m=>m.id!==item.id&&(m.i===topNode.id||m.j===topNode.id));
  const beamTransfers=[];let totalBeamReactionKN=0;
  const roofTransfers=[];let totalRoofReactionKN=0;
  for(const mFraming of framingMembers){
   const memRes=act?.members?.[mFraming.id];
   let vEnd=0;
   if(memRes&&memRes.samples?.length){
    const atStart=(mFraming.i===topNode.id);
    const pt=atStart?memRes.samples[0]:memRes.samples[memRes.samples.length-1];
    if(mFraming.kind==='roof'){
     const otherNid=atStart?mFraming.j:mFraming.i;
     const otherNode=model.nodes.find(n=>n.id===otherNid);
     if(otherNode){
      const dy=otherNode.y-topNode.y;
      const len=Math.hypot(otherNode.x-topNode.x,dy,otherNode.z-topNode.z);
      const sinY=len>1e-5?Math.abs(dy)/len:0;
      vEnd=Math.abs(pt.N*sinY)+Math.abs(pt.Vy);
     }else{
      vEnd=Math.abs(pt.Vy);
     }
    }else{
     vEnd=Math.abs(pt.Vy);
    }
   }else{
    const mA=(mFraming.sectionType==='steel_custom'?(mFraming.A||0.0016):(mFraming.b||0.25)*(mFraming.h||0.45));
    const mDens=(mFraming.sectionType==='steel_custom'?model.steel.density:model.material.density)||24;
    vEnd=(mA*mDens*4)/2;
   }
   if(mFraming.kind==='roof'){
    roofTransfers.push({id:mFraming.id,forceKN:vEnd});
    totalRoofReactionKN+=vEnd;
   }else{
    beamTransfers.push({id:mFraming.id,shearKN:vEnd});
    totalBeamReactionKN+=vEnd;
   }
  }
  const topNodalLoads=model.nodalLoads.filter(l=>l.node===topNode.id);
  let topNodeFyKN=0;
  for(const nl of topNodalLoads)topNodeFyKN+=(nl.fy||0);
  const framingIds=new Set(framingMembers.filter(m=>m.kind==='beam').map(x=>x.id));
  const floorTransfers=result?.coverage?.floorLoadTransfers?.filter(p=>framingIds.has(p.member))||[];
  let totalSlabAreaM2=0;
  for(const ft of floorTransfers)totalSlabAreaM2+=(ft.areaM2/2);
  const baseReaction=act?.nodes?.[baseNode.id]?.reaction;
  const baseRyKN=baseReaction?baseReaction[1]:null;
  const axialMaxKN=memRes?.samples?Math.max(...memRes.samples.map(s=>Math.abs(s.N))):(totalBeamReactionKN+totalRoofReactionKN+swKN);
  return{type:'column',topNode:topNode.id,baseNode:baseNode.id,framingBeams:beamTransfers,framingRoof:roofTransfers,totalBeamReactionKN,totalRoofReactionKN,topNodeFyKN:Math.abs(topNodeFyKN),selfWeightKN:swKN,axialMaxKN,baseRyKN,slabAreaM2:totalSlabAreaM2,L,secA};
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
 if(selectedList.length > 1){
  const memCount = selectedList.filter(s => s.kind === 'members').length;
  const nodeCount = selectedList.filter(s => s.kind === 'nodes').length;
  const otherCount = selectedList.length - memCount - nodeCount;
  box.append(
   el('b', `เลือกพร้อมกัน ${selectedList.length} รายการ`),
   el('div', `คาน/เสา: ${memCount} ชิ้น · โหนด: ${nodeCount} จุด${otherCount ? ` · อื่นๆ: ${otherCount}` : ''}`),
   el('div', 'กด Del เพื่อลบทั้งหมด · Spacebar เพื่อยกเลิก')
  );
  return;
 }
 if(!selected){box.textContent='คลิกโหนด สมาชิก พื้น หรือฐานในภาพ';return;}
 const item=model[selected.kind]?.find(x=>x.id===selected.id);
 if(!item){selected=null;return renderSelection();}
 const mark=selected.kind==='members'?getMemberMark(item):selected.kind==='foundations'?getFoundationMark(item):'';
 const title=mark?`${mark} (${item.id})`:item.id;
 box.append(el('b',title),el('div',classification(selected.kind,item)));
 if(selected.kind==='nodes'){
  box.append(el('div',`X ${item.x??'—'} · Y ${item.y??'—'} · Z ${item.z??'—'} m`));
  const nLoads=(model.nodalLoads||[]).filter(nl=>nl.node===item.id);
  if(nLoads.length){
   const isRoofNode=model.members.some(m=>m.kind==='roof'&&(m.i===item.id||m.j===item.id));
   const card=el('div');card.className='load-breakdown';
   const lines=nLoads.map(nl=>`<div class="load-item"><span class="lbl">เคส [${nl.case}]:</span><span class="val">Fy = ${fmt(quantity(Math.abs(nl.fy||0),'force'))} ${unitLabel('force')}</span></div>`).join('');
   const note=isRoofNode?`<div style="font-size:10px;color:#94a3b8;margin-top:4px;border-top:1px dashed #334155;padding-top:4px;line-height:1.4"><b>ที่มาแรงบนโหนดโครงถัก (Roof Load Path):</b><br>1. แผ่นมุง (Metal Sheet + ฉนวน PU ~15 kg/m²)<br>2. ถ่ายลงแปตามระยะห่าง (q = w × s ≈ 22.5–25 kg/m)<br>3. แปพาดช่วง 5 m ถ่ายแรงปฏิกิริยาลงโหนดโครงถักหัวแป (P = q × L_bay)</div>`:'';
   card.innerHTML=`<b>แรงกระทำบนโหนด (Nodal Loads)</b>${lines}${note}`;
   box.append(card);
  }
 }
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
     const rfLines=(bd.framingRoof||[]).filter(x=>x.forceKN>0.01).map(x=>{
      const rf=model.members.find(m=>m.id===x.id);
      const rfMark=rf?getMemberMark(rf):x.id;
      return `<div class="load-item" style="padding-left:10px;font-size:10px"><span class="lbl">└ โครงหลังคา ${rfMark} (${x.id}):</span><span class="val">${fmt(quantity(x.forceKN,'force'))} ${unitLabel('force')}</span></div>`;
     }).join('');
     const rfHeader=bd.totalRoofReactionKN>0.01?`<div class="load-item"><span class="lbl">แรงถ่ายจากโครงหลังคา/โครงถัก:</span><span class="val">${fmt(quantity(bd.totalRoofReactionKN,'force'))} ${unitLabel('force')}</span></div>${rfLines}`:'';
     card.innerHTML=`<b>การถ่ายน้ำหนักลงเสา (Column Load Path)</b>${rfHeader}<div class="load-item"><span class="lbl">แรงเฉือนจากคานบน:</span><span class="val">${fmt(quantity(bd.totalBeamReactionKN,'force'))} ${unitLabel('force')}</span></div>${bmLines}${topLoadLine}${slabLine}<div class="load-item"><span class="lbl">น้ำหนักตัวเสา:</span><span class="val">${fmt(quantity(bd.selfWeightKN,'force'))} ${unitLabel('force')}</span></div><div class="load-sum"><span>รวมน้ำหนักกดลงเสา (P):</span><span>${fmt(quantity(bd.axialMaxKN,'force'))} ${unitLabel('force')} (${tfVal} tf)</span></div>${ryLine}`;
    }else if(bd.type==='beam'){
     const slabLine=bd.slabQyKNm>0?`<div class="load-item"><span class="lbl">น้ำหนักพื้น (${bd.slabSources.join(',')}):</span><span class="val">${fmt(quantity(bd.slabQyKNm,'line'))} ${unitLabel('line')}</span></div>`:'';
     const userLine=bd.userQyKNm>0?`<div class="load-item"><span class="lbl">โหลดกระจายเพิ่ม:</span><span class="val">${fmt(quantity(bd.userQyKNm,'line'))} ${unitLabel('line')}</span></div>`:'';
     card.innerHTML=`<b>น้ำหนักบรรทุกบนคาน (Beam Loads)</b><div class="load-item"><span class="lbl">น้ำหนักตัวคาน:</span><span class="val">${fmt(quantity(bd.swKNm,'line'))} ${unitLabel('line')}</span></div>${slabLine}${userLine}<div class="load-sum"><span>รวมโหลดกระจาย (q):</span><span>${fmt(quantity(bd.totalQyKNm,'line'))} ${unitLabel('line')} (รวม ${fmt(quantity(bd.totalWeightKN,'force'))} ${unitLabel('force')})</span></div><div class="load-item" style="margin-top:4px"><span class="lbl">ถ่ายลงเสาที่โหนด ${item.i}:</span><span class="val">${fmt(quantity(bd.vIKN,'force'))} ${unitLabel('force')}</span></div><div class="load-item"><span class="lbl">ถ่ายลงเสาที่โหนด ${item.j}:</span><span class="val">${fmt(quantity(bd.vJKN,'force'))} ${unitLabel('force')}</span></div>`;
    }else{
     const sign=bd.axialKN>=0?'แรงดึง Tension':'แรงอัด Compression';
     card.innerHTML=`<b>แรงในชิ้นส่วนโครงหลังคา</b><div class="load-item"><span class="lbl">น้ำหนักตัวเอง:</span><span class="val">${fmt(quantity(bd.selfWeightKN,'force'))} ${unitLabel('force')}</span></div><div class="load-sum"><span>แรงตามแกน (N):</span><span>${fmt(quantity(Math.abs(bd.axialKN),'force'))} ${unitLabel('force')} (${sign})</span></div><div style="font-size:10px;color:#94a3b8;margin-top:6px;border-top:1px dashed #334155;padding-top:4px;line-height:1.4"><b>กลไกการถ่ายแรงหลังคา (Roof Load Transfer):</b><br>แผ่นหลังคา (kg/m²) ➔ แป (kg/m) ➔ จุดต่อโครงถัก/จันทัน (Point Load) ➔ เสาและฐานราก</div>`;
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
   const isZUp=model.coordinateSystem==='z-up';
   let totalRyKN=0;
   for(const nid of (item.nodes||[])){
    const r=act?.nodes?.[nid]?.reaction;
    if(r){
     const rVal=isZUp?r[2]:r[1];
     if(rVal!=null)totalRyKN+=rVal;
    }
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
   const rLabel=isZUp?'Rz':'Ry';
   const dimTitle=isZUp?'ขนาดฐาน (bx × by × h):':'ขนาดฐาน (bx × bz × h):';
   const dimVal=isZUp?`${item.bx||1.4} × ${item.by||item.bz||1.4} × ${item.depth||0.5}`:`${item.bx||1.4} × ${item.bz||1.4} × ${item.depth||0.5}`;
   fCard.innerHTML=`<b>ข้อมูลฐานรากและเสาเข็ม (Foundation & Piles)</b><div class="load-item"><span class="lbl">${dimTitle}</span><span class="val">${dimVal} m</span></div><div class="load-item"><span class="lbl">โหนดรองรับ:</span><span class="val">${item.nodes.join(', ')}</span></div><div class="load-item"><span class="lbl">แรงปฏิกิริยารวม (${rLabel}):</span><span class="val" style="color:#22c55e">${rLabel} = ${fmt(quantity(totalRyKN,'force'))} ${unitLabel('force')} (~${totalTon} tf)</span></div>${pileHtml}`;
   box.append(fCard);
  }else box.append(el('div','โหนด: '+item.nodes.join(', ')));
 const btn=el('button','แก้ไขในตาราง');
 btn.onclick=()=>{tab=selected.kind==='members'?memberTab(item):selected.kind;renderTable();};
 box.append(btn);
}
function addRow(){const collection=groupFor(tab);if(['beams','columns','roof'].includes(tab)){status('ใช้ช่องเชื่อมคาน / เสา / หลังคาด้านซ้าย เพื่อเลือกสองโหนด');return;}if((tab==='nodalLoads'&&!model.nodes.length)||(tab==='memberLoads'&&!model.members.length))return status('สร้างโหนดและสมาชิกก่อน','error');mutate(()=>{if(tab==='slabs')model.slabs.push(slabRecord(nextId('S',model.slabs)));if(tab==='foundations')model.foundations.push(foundationRecord(nextId('F',model.foundations)));if(tab==='nodalLoads')model.nodalLoads.push({node:model.nodes[0].id,case:'D',fx:0,fy:0,fz:0,mx:0,my:0,mz:0});if(tab==='memberLoads')model.memberLoads.push({member:model.members[0].id,case:'D',axes:'local',qx:0,qy:0,qz:0});if(tab==='combinations'){let i=1;while(model.combinations.some(c=>c.name==='Combo'+i))i++;model.combinations.push({name:'Combo'+i,D:1,L:1,W:0});}});}
function deleteRow(collection,row){if(collection==='combinations'&&model.combinations.length===1)return status('ต้องมีชุดน้ำหนักอย่างน้อยหนึ่งชุด','error');if(['nodes','members','slabs','foundations'].includes(collection)&&!confirm(`ลบ ${row.id}? รายการที่อ้างอิงจะถูกปรับเป็นรอตรวจ`))return;mutate(()=>{let removed=[];if(collection==='nodes'){removed=model.members.filter(m=>m.i===row.id||m.j===row.id).map(m=>m.id);model.members=model.members.filter(m=>!removed.includes(m.id));model.nodalLoads=model.nodalLoads.filter(l=>l.node!==row.id);for(const e of [...model.slabs,...model.foundations])if(e.nodes.includes(row.id)){e.nodes=e.nodes.filter(n=>n!==row.id);e.mode='pending';}}if(collection==='members')removed=[row.id];if(removed.length){model.memberLoads=model.memberLoads.filter(l=>!removed.includes(l.member));for(const s of model.slabs)for(const key of ['support1','support2'])if(removed.includes(s[key])){s[key]='';s.mode='pending';}}model[collection].splice(model[collection].indexOf(row),1);});}
function renderTable(){document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('table').replaceChildren();$('tableActions').replaceChildren();if(tab==='results')return renderResultsTable();if(tab==='coverage')return renderCoverage();if(tab==='design')return renderDesignTable();const collection=groupFor(tab);$('tableActions').append(el('span',notes[tab]));if(collection==='members'&&selected?.kind==='members'&&rowsFor(tab).some(m=>m.id===selected.id&&m.kind==='beam')){const shortcut=el('button','📍 วางโหนดจากปลายคาน');shortcut.id='referenceQuickAction';shortcut.onclick=()=>{const tool=document.querySelector('#selection .reference-node-tool');tool?.scrollIntoView({block:'center',behavior:'auto'});tool?.querySelector('input')?.focus({preventScroll:true});};$('tableActions').prepend(shortcut);}if(['slabs','foundations','nodalLoads','memberLoads','combinations'].includes(tab)){const add=el('button','+ เพิ่มแถว');add.onclick=addRow;$('tableActions').prepend(add);}const table=el('table'),hr=el('tr'),head=el('thead');for(const [,label,,q]of specs[tab])hr.append(el('th',label+(q?' ('+unitLabel(q)+')':'')));hr.append(el('th','สถานะ / ลบ'));head.append(hr);table.append(head);const body=el('tbody');
  for(const [index,row]of rowsFor(tab).entries()){const tr=el('tr');if(selected?.kind===collection&&selected.id===row.id)tr.classList.add('selected');if(collection==='nodes'&&((model.coordinateSystem==='z-up'?row.z:row.y)>0.05)&&row.restraints?.some(Boolean))tr.style.background='rgba(239, 68, 68, 0.18)';for(const [key,,type,q='none']of specs[tab]){const td=el('td');if(type==='id'){let displayId=row[key];if(collection==='members'){const m=model.members.find(x=>x.id===row[key]);if(m)displayId=`${getMemberMark(m)} (${m.id})`;}else if(collection==='foundations'){const f=model.foundations.find(x=>x.id===row[key]);if(f)displayId=`${getFoundationMark(f)} (${f.id})`;}const btn=el('button',displayId);btn.onclick=()=>{selected={kind:collection,id:row.id};renderSelection();drawModel();renderTable();};td.append(btn);}else{const isSelect=type.startsWith('enum:')||['node','member','beam','case'].includes(type);const input=el(isSelect?'select':'input');input.setAttribute('aria-label',`${row.id||index+1} ${key}`);if(isSelect){let choices={};if(type.startsWith('enum:'))choices=catalogs[type.slice(5)];else if(type==='case')choices={D:'D',L:'L',W:'W'};else{const items=type==='node'?model.nodes:model.members.filter(m=>type!=='beam'||m.kind==='beam');if(type==='beam')choices['']='เลือกคาน';for(const item of items)choices[item.id]=item.id;}for(const [value,label]of Object.entries(choices)){const o=el('option',label);o.value=value;input.append(o);}input.value=row[key];}else if(type==='bool'){input.type='checkbox';input.checked=row.restraints[Number(key.slice(1))];}else{input.type=type==='number'?'number':'text';input.value=type==='number'?editValue(row[key],q):type==='nodes'?row[key].join(','):row[key];if(type==='number')input.step='any';if(type==='text')input.maxLength=key==='note'?500:120;if(type==='nodes')input.style.minWidth='170px';}if(collection==='members'&&((row.sectionType==='rc_rect'&&['A','Iy','Iz','J'].includes(key))||(row.sectionType==='steel_custom'&&['b','h'].includes(key))))input.disabled=true;
   input.onchange=()=>{const value=input.value;const nodeValues=type==='nodes'?value.split(',').map(s=>s.trim()).filter(Boolean):null;if(nodeValues&&(new Set(nodeValues).size!==nodeValues.length||nodeValues.some(id=>!model.nodes.some(n=>n.id===id)))){status('ใช้โหนดที่มีอยู่และไม่ซ้ำ คั่นด้วยจุลภาค','error');renderTable();return;}mutate(()=>{if(type==='bool'){row.restraints[Number(key.slice(1))]=input.checked;const elevVal=model.coordinateSystem==='z-up'?row.z:row.y;if(input.checked&&elevVal>0.05)status(`⚠️ คำเตือน: โหนด ${row.id} อยู่ที่ระดับ ${model.coordinateSystem==='z-up'?'Z':'Y'}=${fmt(elevVal)} m (ลอยฟ้า) หากล็อกจุดรองรับ แรงจะไม่ถ่ายลงเสา`,'error');}else if(type==='nodes')row[key]=nodeValues;else row[key]=type==='number'?canonical(num(value),q):value;});};td.append(input);}tr.append(td);}const td=el('td');td.append(el('span',classification(collection,row)));const del=el('button','ลบ');del.onclick=()=>deleteRow(collection,row);td.append(del);tr.append(td);body.append(tr);}table.append(body);$('table').append(table);}
function renderResultsTable(){const active=result?.combinations[$('resultCombo').value];if(!active){$('table').append(el('p','ยังไม่มีผลของโมเดลปัจจุบัน'));return;}$('tableActions').textContent='การเคลื่อนที่และแรงปฏิกิริยาที่โหนด · GLOBAL';const table=el('table'),tr=el('tr');for(const h of ['โหนด','uX mm','uY mm','uZ mm','RX rad','RY rad','RZ rad',...['FX','FY','FZ'].map(x=>x+' '+unitLabel('force')),...['MX','MY','MZ'].map(x=>x+' '+unitLabel('moment'))])tr.append(el('th',h));table.append(tr);for(const [id,n]of Object.entries(active.nodes)){const r=el('tr');for(const v of [id,...n.translationMM,...n.displacement.slice(3),...n.reaction.map((v,i)=>quantity(v,i<3?'force':'moment'))])r.append(el('td',typeof v==='number'?fmt(v,6):v));table.append(r);}$('table').append(table);}
function renderCoverage(){$('tableActions').textContent='แยกข้อมูลที่กรอก การนำไปวิเคราะห์ และงานออกแบบที่ยังไม่ทำ';const table=el('table');const head=el('tr');for(const h of ['ชิ้นส่วน','สถานะ','รายละเอียด'])head.append(el('th',h));table.append(head);for(const collection of ['members','slabs','foundations'])for(const item of model[collection]){const r=el('tr');r.append(el('td',item.id),el('td',classification(collection,item)),el('td',collection==='foundations'?'ไม่รวมดิน/เข็ม/กำลังฐาน/นน.ตัวฐานใน frame':collection==='slabs'?'ยังไม่มี plate stiffness / diaphragm / RC design':'ยังไม่ตรวจ capacity หรือเหล็กเสริม'));table.append(r);}for(const p of result?.coverage?.floorLoadTransfers||[]){const r=el('tr');const qDir=model.coordinateSystem==='z-up'?'qZ':'qY',qTrans=model.coordinateSystem==='z-up'?(p.qzKNm??p.qyKNm):p.qyKNm;r.append(el('td',p.source+' → '+p.member),el('td',p.case),el('td',`พื้นที่ ${fmt(p.areaM2)} m² × ${fmt(quantity(p.pressureKNm2,'pressure'))} ${unitLabel('pressure')} → ${qDir} ${fmt(quantity(qTrans,'line'))} ${unitLabel('line')}`));table.append(r);}$('table').append(table);}
function renderResults(){const previous=$('resultCombo').value;options($('resultCombo'),result?Object.keys(result.combinations):[],previous);options($('resultMember'),result?model.members.map(m=>m.id):[],$('resultMember').value);$('exportResults').disabled=!result;$('metrics').replaceChildren();const active=result?.combinations[$('resultCombo').value];if(!active){$('metrics').append(el('p','ผลจะปรากฏหลังวิเคราะห์'));drawDiagram();return;}let max=0;for(const n of Object.values(active.nodes))max=Math.max(max,Math.hypot(...n.translationMM));const eq=active.equilibrium;for(const [title,value,label]of [['การเคลื่อนที่โหนดสูงสุด',fmt(max,4),'mm'],['สมดุลแรง · residual สูงสุด',quantity(Math.max(...eq.forceResidualKN.map(Math.abs)),'force').toExponential(2),unitLabel('force')],['สมดุลโมเมนต์ · residual สูงสุด',quantity(Math.max(...eq.momentResidualKNm.map(Math.abs)),'moment').toExponential(2),unitLabel('moment')]]){const div=el('div');div.className='metric';div.append(el('span',title),el('b',value),el('small',' '+label));$('metrics').append(div);}drawDiagram();}
function drawDiagram(){const member=result?.combinations[$('resultCombo').value]?.members[$('resultMember').value];$('diagram').replaceChildren();$('axes').textContent='';const types={Mz:['โมเมนต์','moment'],My:['โมเมนต์','moment'],Vy:['แรงเฉือน','force'],Vz:['แรงเฉือน','force'],N:['แรงตามแกน','force'],T:['แรงบิด','moment'],dy:['โก่ง local y','length'],dz:['โก่ง local z','length']};for(const o of $('diagramType').options){const [label,kind]=types[o.value];o.textContent=o.value+' — '+label+' ('+unitLabel(kind)+')';}if(!member){$('diagram').textContent='ยังไม่มีผล';return;}const key=$('diagramType').value,q=types[key][1],values=member.samples.map(s=>quantity(s[key],q)),max=Math.max(...values.map(Math.abs),1e-12),len=member.length;const points=member.samples.map((s,i)=>`${20+s.x/len*200},${80-values[i]/max*52}`).join(' ');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 170');svg.innerHTML=`<line x1="20" y1="80" x2="220" y2="80" stroke="#41566f"/><polyline points="${points}" fill="none" stroke="#51dcba" stroke-width="2"/><text x="20" y="150" fill="#9fb5cc" font-size="10">i / 0</text><text x="165" y="150" fill="#9fb5cc" font-size="10">j / ${fmt(len)} m</text><text x="12" y="18" fill="#e0eaf5" font-size="9">${key}: ${fmt(Math.min(...values),4)} to ${fmt(Math.max(...values),4)} ${unitLabel(q)}</text>`;$('diagram').append(svg);const axInfo=member.localAxes?`<div style="margin:4px 0;line-height:1.4"><span style="color:#ef4444">🔴 x_L = [${member.localAxes[0].map(v=>fmt(v,3)).join(', ')}]</span><br><span style="color:#22c55e">🟢 y_L = [${member.localAxes[1].map(v=>fmt(v,3)).join(', ')}]</span><br><span style="color:#3b82f6">🔵 z_L = [${member.localAxes[2].map(v=>fmt(v,3)).join(', ')}]</span></div>`:'';$('axes').innerHTML=`<b>แกนชิ้นส่วนเฉพาะตัว (Local Axes):</b>${axInfo}<div style="color:#8b949e;font-size:10px">แรง N, Vy, Vz, My, Mz, T และการแอ่นตัว dy, dz อ้างอิงแกน local · เครื่องหมายตาม PyNite</div>`;}
function render(){
 $('memberB').value=editValue(memberDraft.b,'section');$('memberH').value=editValue(memberDraft.h,'section');
 $('projectName').value=model.name;$('unitSystem').value=model.displayUnits.system;$('forceUnit').value=model.displayUnits.force;$('forceUnit').disabled=model.displayUnits.system==='si';$('unitSummary').textContent=`พิกัด m · หน้าตัด ${unitLabel('section')} · แรง ${unitLabel('force')} · โหลด ${unitLabel('line')} · ${unitLabel('stress')}`;
 for(const [id,material,key,q]of [['E','material','E','stress'],['nu','material','nu','none'],['density','material','density','density'],['steelE','steel','E','stress'],['steelNu','steel','nu','none'],['steelDensity','steel','density','density']])$(id).value=editValue(model[material][key],q);
 for(const [id,text,q]of [['ELabel','E คอนกรีต','stress'],['densityLabel','นน.คอนกรีต','density'],['steelELabel','E เหล็ก','stress'],['steelDensityLabel','นน.เหล็ก','density'],['memberBLabel','b ตาม local z','section'],['memberHLabel','h ตาม local y','section']])$(id).textContent=text+' ('+unitLabel(q)+')';
  $('selfWeight').checked=model.selfWeight;for(const id of ['memberI','memberJ'])options($(id),model.nodes.map(n=>n.id),$(id).value);$('undo').disabled=!history.length;window.__rc_model=model;window.__rc_result=result;window.__rc_scene=scene;window.__rc_getRGB=getMemberStationRGB;renderPlanControls();renderResults();drawModel();renderSelection();renderTable();
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
$('fit').onclick=fit;for(const id of ['memberNames','labels','deformed','diagram3d','diagramValues','showPointLoads','showUniformLoads','showSelfWeight','showRoofSheeting']){if($(id))$(id).onchange=drawModel;}
// on/off and its value live in one pill: the name toggles, the value is typed or stepped.
// a control that is switched off cannot be adjusted (the value field and +- are locked in CSS).
let pendingDraw=0;
function drawModelSoon(){
 if(pendingDraw)return;
 pendingDraw=requestAnimationFrame(()=>{pendingDraw=0;drawModel();});
}
const SCALE_CONTROLS=[
 {toggle:'deformed',number:'deformScaleInput',down:'deformScaleDown',up:'deformScaleUp',step:10,key:'deformScale',fallback:100},
 {toggle:'diagram3d',number:'diagramScaleInput',down:'diagramScaleDown',up:'diagramScaleUp',step:0.1,key:'diagramScale',fallback:1},
];
for(const cfg of SCALE_CONTROLS){
 const input=$(cfg.number),down=$(cfg.down),up=$(cfg.up);
 if(!input||!down||!up)continue;
 const bounds=()=>({min:Number(input.min),max:Number(input.max)});
 const current=()=>{const v=Number(input.value);return Number.isFinite(v)?v:cfg.fallback;};
 const apply=raw=>{
  const {min,max}=bounds();
  let value=Number(raw);
  if(!Number.isFinite(value))value=cfg.fallback;
  value=Math.min(max,Math.max(min,value));          // typing a wild number is clamped, not accepted
  if(cfg.step<1)value=Math.round(value*100)/100;    // keep the display honest for fractional steps
  input.value=String(value);
  viewScales[cfg.key]=value;
  drawModelSoon();
 };
 input.addEventListener('input',()=>apply(input.value));
 input.addEventListener('change',()=>apply(input.value));       // commit on blur/enter: writes the clamped value back
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){apply(input.value);input.blur();}});
 down.onclick=()=>apply(current()-cfg.step);
 up.onclick=()=>apply(current()+cfg.step);
}
// the pill shows its own state: on = lamp lit + frame glowing, off = dark lamp
function syncToggleLamps(){
 for(const el of document.querySelectorAll('.viewbottom label,.viewbottom .combo-pill')){
  const input=el.querySelector('input[type=checkbox]');
  if(input)el.classList.toggle('on',input.checked);
 }
}
const STRUCT_MODES=[['solid','โครงสร้าง 3D (Solid)'],['wire','เส้นแกน & โหนด']];
function renderStructButton(){
 const button=$('structModeButton');
 if(!button)return;
 const entry=STRUCT_MODES.find(pair=>pair[0]===structMode)||STRUCT_MODES[0];
 button.textContent=entry[1];
 button.classList.toggle('alt',structMode!=='solid');
 button.setAttribute('aria-label',`การแสดงโครงสร้าง: ${entry[1]} · กดเพื่อสลับ`);
}
function applyStructMode(mode){
 if(!STRUCT_MODES.some(pair=>pair[0]===mode))return;
 structMode=mode;
 renderStructButton();
 drawModel();
}
// one button cycles the three display states, so nothing has to be aimed at
if($('structModeButton'))$('structModeButton').onclick=()=>{
 const index=Math.max(0,STRUCT_MODES.findIndex(pair=>pair[0]===structMode));
 applyStructMode(STRUCT_MODES[(index+1)%STRUCT_MODES.length][0]);
};
renderStructButton();
function updateDisplayToggles(){
 // hide a load toggle when the model has no data of that type (nothing it could show)
 // every control stays visible: no data-aware hiding, so the row never changes shape
 syncToggleLamps();
}
$('view3d').onclick=()=>setViewMode('3d');$('viewPlan').onclick=()=>setViewMode('plan');$('planLevel').onchange=()=>{const next=Number($('planLevel').value);if(!Number.isFinite(next))return;cancelInteraction(false);planLevelY=next;planLevelZ=next;renderPlanControls();if(viewMode==='plan')fitPlan();drawModel();};$('setPlanElevation').onclick=()=>{const input=$('planElevation');if(input.value.trim()===''||!Number.isFinite(Number(input.value)))return status('กรอกระดับ Y เป็นตัวเลขเมตรก่อน','error');const y=Number(input.value);if(Math.abs(y)>10000)return status('ระดับ Y ต้องอยู่ในช่วง ±10000 m','error');cancelInteraction(false);planLevelY=Number(y.toFixed(3));planLevelZ=planLevelY;renderPlanControls();if(viewMode==='plan')fitPlan();drawModel();status(`ตั้งระดับวางโหนด Y ${fmt(planLevelY)} m · คลิก วางโหนด แล้วคลิกบนผัง`);};$('planElevation').onkeydown=e=>{if(e.key==='Enter')$('setPlanElevation').click();};$('generatePlanGrid').onclick=createBuildingGrid;$('openGridEditor').onclick=openGridEditor;$('closeGridEditor').onclick=()=> $('gridEditorDialog').close();$('closeGridEditorBottom').onclick=()=> $('gridEditorDialog').close();$('addGridX').onclick=()=>addGridEditorAxis('x');$('addGridZ').onclick=()=>addGridEditorAxis('z');$('buildGridFromEditor').onclick=buildGridFromEditor;
if($('autoDetectGrids'))$('autoDetectGrids').onclick=()=>{const curElev=planLevelZ??planLevelY;const detected=autoDetectGridLines(model.nodes,{levelZ:curElev,levelY:curElev});if(!detected.ok)return status(detected.reason,'error');renderGridEditorAxis('x',detected.lines.x);renderGridEditorAxis('z',detected.lines.z);status(`ตรวจจับแนวกริดจากเสาอาคารสำเร็จ: X ${detected.lines.x.length} แนว, Z ${detected.lines.z.length} แนว`);};
if($('clearGridsBtn'))$('clearGridsBtn').onclick=()=>{if(!confirm('ต้องการล้างแนวกริดทั้งหมดในผังหรือไม่?'))return;mutate(()=>{model.gridLines={x:[],z:[]};});renderGridEditorAxis('x',[]);renderGridEditorAxis('z',[]);drawModel();status('ล้างแนวกริดในผังแล้ว');};
if($('applyGridLinesOnly'))$('applyGridLinesOnly').onclick=()=>{const linesX=gridEditorRows('x'),linesZ=gridEditorRows('z');const validX=linesX.length>=2&&linesX.every(l=>l.label&&Number.isFinite(l.value)),validZ=linesZ.length>=2&&linesZ.every(l=>l.label&&Number.isFinite(l.value));if(!validX||!validZ)return status('ต้องมีแนวกริดที่ถูกต้องอย่างน้อยแกนละ 2 แนว','error');linesX.sort((a,b)=>a.value-b.value);linesZ.sort((a,b)=>a.value-b.value);mutate(()=>{model.gridLines={x:linesX,z:linesZ};});$('gridEditorDialog').close();if(viewMode==='plan')fitPlan();drawModel();status(`อัปเดตเฉพาะแนวกริดในผังแล้ว: X ${linesX.length} แนว, Z ${linesZ.length} แนว`);};$('planSnap').onchange=()=>{renderPlanControls();drawModel();status($('planSnap').checked?`เปิดดูดกริด ${fmt(Number($('planGridStep').value),2)} m · Alt+คลิกวางอิสระ`:'ปิดดูดกริด · วางตามเมาส์');};$('planGridStep').onchange=()=>{const input=$('planGridStep'),step=Number(input.value);if(!validPlanGridStep(step)){input.setCustomValidity('กรอกตั้งแต่ 0.05 ถึง 1.00 m เพิ่มครั้งละ 0.05 m');input.reportValidity();return status('ระยะกริดต้องอยู่ระหว่าง 0.05–1.00 m เพิ่มครั้งละ 0.05 m','error');}input.setCustomValidity('');input.value=String(Number(step.toFixed(2)));$('beamHint').textContent=`ระยะดูดกริด ${fmt(step,2)} m`;drawModel();status(`ตั้งระยะดูดกริด ${fmt(step,2)} m · โหนดใหม่จะปัดตามช่วงนี้`);};$('planSelectTool').onclick=()=>setPlanTool('select');$('planNodeTool').onclick=()=>setPlanTool('node');$('planMemberNodeTool').onclick=()=>setPlanTool('memberNode');$('planBeamTool').onclick=()=>setPlanTool('beam');$('planBeamLockX').onclick=()=>setBeamAxisLock('x');if($('planBeamLockY'))$('planBeamLockY').onclick=()=>setBeamAxisLock('y');$('planBeamLockZ').onclick=()=>setBeamAxisLock('z');
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
  cancelInteraction();
  hideContextMenu();
  if(listeningShortcutAction)stopListeningShortcut();
  return;
 }
 const activeTag = document.activeElement?.tagName;
 const inDialog = activeTag === 'DIALOG' || Boolean(document.activeElement?.closest('dialog')) || Boolean(document.querySelector('dialog[open]'));
 if (['INPUT', 'SELECT', 'TEXTAREA', 'DIALOG'].includes(activeTag) || inDialog || document.activeElement?.isContentEditable) {
  return;
 }
 if(listeningShortcutAction)return;
 if((currentMode==='build'||viewMode==='plan')&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
  const arrowLock=getAxisLockFromKey(event.key);
  if(arrowLock!==undefined){
   event.preventDefault();
   setBeamAxisLock(arrowLock);
   if(buildDrawState){
    buildDrawState.axisLock = arrowLock;
    drawBuildPreview();
   }
   return;
  }
 }

 if(currentMode==='build'&&buildDrawState&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
  if((event.key>='0'&&event.key<='9')||event.key==='.'||event.key==='-'){
   event.preventDefault();
   measurementBuffer+=event.key;
   const input=$('buildMeasurementInput');if(input)input.value=measurementBuffer;
   const val=parseFloat(measurementBuffer);
   if(Number.isFinite(val)&&val>0){
    const start=buildDrawState.start||buildDrawState.ref;
    const end=computeEndpointFromDimension(start,buildDrawState.current,buildDrawState.axisLock||beamAxisLock,val);
    buildDrawState.current=new THREE.Vector3(end.x,end.y,end.z);
    drawBuildPreview();
   }
   return;
  }
  if(event.key==='Backspace'){
   event.preventDefault();
   measurementBuffer=measurementBuffer.slice(0,-1);
   const input=$('buildMeasurementInput');if(input)input.value=measurementBuffer;
   const val=parseFloat(measurementBuffer);
   if(Number.isFinite(val)&&val>0){
    const start=buildDrawState.start||buildDrawState.ref;
    const end=computeEndpointFromDimension(start,buildDrawState.current,buildDrawState.axisLock||beamAxisLock,val);
    buildDrawState.current=new THREE.Vector3(end.x,end.y,end.z);
    drawBuildPreview();
   }
   return;
  }
  if(event.key==='Enter'){
   event.preventDefault();
   const val=parseFloat(measurementBuffer||$('buildMeasurementInput')?.value);
   if(Number.isFinite(val)&&val>0){
    commitBuildDimensionInput(val);
   }
   measurementBuffer='';
   return;
  }
 }
 for(const [action,shortcutStr] of Object.entries(currentShortcuts)){
  if(matchesShortcut(event,shortcutStr)){
   event.preventDefault();
   executeShortcutAction(action);
   return;
  }
 }
});
$('resultCombo').onchange=()=>{renderResults();drawModel();if(tab==='results')renderTable();};$('resultMember').onchange=()=>{drawDiagram();if($('diagram3d')?.checked)drawModel();};$('diagramType').onchange=()=>{drawDiagram();if($('diagram3d')?.checked)drawModel();};
$('save').onclick=async()=>{try{const data=await api('/api/save',clone(model));$('saveStatus').textContent='บันทึกไฟล์แล้ว: '+data.path;status('บันทึกไฟล์แล้ว: '+data.filename);}catch(err){status('บันทึกไม่ได้: '+err.message,'error');}};
$('load').onclick=()=>{cancelInteraction();$('file').click();};$('file').onchange=async()=>{cancelInteraction();const file=$('file').files[0];if(!file)return;const rev=revision;try{if(file.size>1_000_000)throw new Error('ไฟล์ใหญ่กว่า 1 MB');const raw=JSON.parse(await file.text()),validated=await api('/api/validate',raw);if(rev!==revision)throw new Error('โมเดลเปลี่ยนระหว่างเปิดไฟล์');mutate(()=>{model=migrateToZUp(validated.model);selected=null;});fit();status('เปิดโมเดลแล้ว · ต้องวิเคราะห์ใหม่');}catch(err){status('เปิดไฟล์ไม่ได้: '+err.message,'error');}finally{$('file').value='';}};
$('analyze').onclick=async()=>{if(busy)return;const rev=revision,snapshot=clone(model);busy=true;result=null;renderResults();drawModel();if(tab==='results'||tab==='coverage')renderTable();$('analyze').disabled=true;$('analyze').textContent='กำลังคำนวณ…';status('ตรวจโมเดล หน่วย และการถ่ายแรง');try{const data=await api('/api/analyze',snapshot);if(rev!==revision){status('โมเดลเปลี่ยนระหว่างคำนวณ · ไม่ใช้ผลเก่า');return;}result=data;tab='results';render();const elevatedWarning=result?.coverage?.components?.find(c=>c.status==='ELEVATED_SUPPORT_WARNING');if(elevatedWarning)status('⚠️ '+elevatedWarning.detail,'error');else status('วิเคราะห์ตามขอบเขตสำเร็จ · ตรวจสมดุล 6 แกน · ดูสถานะ/ที่มาโหลด · ยังไม่ตรวจออกแบบ','ok');}catch(err){if(rev===revision)status(err.message,'error');}finally{busy=false;$('analyze').disabled=false;$('analyze').textContent='▶ วิเคราะห์';}};
$('exportResults').onclick=async()=>{if(!result)return;const rev=revision;try{const data=await api('/api/export',clone(model));$('saveStatus').textContent='ส่งออกแล้ว: '+data.path;if(rev===revision)status('ส่งออกผลและที่มาโหลดแล้ว: '+data.filename);}catch(err){status('ส่งออกไม่ได้: '+err.message,'error');}};
document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
model=empty();try{const saved=localStorage.getItem(KEY);if(saved){const data=JSON.parse(saved);const validated=await api('/api/validate',data);if(data.schemaVersion===1)localStorage.setItem(KEY+'-v1-backup',saved);model=migrateToZUp(validated.model);status('เปิดงานเดิมแล้ว · หน่วยหน้าจอเป็นเมตริกไทย · ค่าจริงยังเดิม');}else{model=grid(4,4,1,1,3,1,true);status('ตัวอย่างศึกษา · เปิดตัวอย่างอาคารเพื่อดูพื้นและฐานราก');}}catch{status('กู้คืนไม่ได้ · ข้อมูลเดิมสำรองไว้ กรุณาเปิดไฟล์','error');try{const raw=localStorage.getItem(KEY);if(raw)localStorage.setItem(KEY+'-recovery-'+Date.now(),raw);}catch{}}
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

function getMemberStationRGB(m, t, cm, range, active, key) {
 const fallback = [0.37, 0.8, 0.73];
 if (!m) return fallback;
 if (cm === 'default') {
  const def = m.kind === 'roof' ? 0xe0a75f : m.kind === 'column' ? 0x80d7c7 : 0x5fcbbb;
  const c = new THREE.Color(def);
  return [c.r, c.g, c.b];
 }
 if (cm === 'utilization') {
  const util = getMemberDC(m, active);
  if (util == null) return fallback;
  if (util > 1.0) {
   const tOver = Math.min(1.0, (util - 1.0) / 0.5);
   const c = new THREE.Color().lerpColors(new THREE.Color(0xff0000), new THREE.Color(0x9900ff), tOver);
   return [c.r, c.g, c.b];
  }
  return getRainbowRGB(util, 0, 1.0);
 }
 if (!key || !range) return fallback;
 if (range.focus && m.id !== range.id) {
  const off = new THREE.Color(0x475058);
  return [off.r, off.g, off.b];
 }
 const value = stationValueKN(active?.members?.[m.id], t, key);
 if (value === null) return fallback;
 // Key has no colour beyond its own span: painting it would claim a gradient that does not exist.
 if (range.max - range.min <= 1e-9) return fallback;
 return getRainbowRGB(value, range.min, range.max);
}

function getHeatmapColorForMember(mid, mode) {
 const m = model.members.find(x => x.id === mid);
 const act = result?.combinations?.[$('resultCombo')?.value];
 const key = mode === 'load' ? 'resultant' : mode;
 if (!m || !['Mz', 'Vy', 'N', 'resultant'].includes(key)) return 0x5fcbbb;
 const range = rangeKN(model.members, act?.members, key) || { min: 0, max: 1 };
 const rgb = getMemberStationRGB(m, 0.5, mode, range, act, key);
 return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex();
}

const HEAT_TITLES = {load: 'แรงภายในรวมตามตำแหน่ง |N,Vy,Vz|', Mz: 'โมเมนต์ดัด Mz', Vy: 'แรงเฉือน Vy', N: 'แรงตามแกน N'};
const HEAT_ORDER = ['column', 'beam', 'roof'];

function legendRow(label, text) {
 const row = el('div');
 row.className = 'legend-row';
 const name = el('span', label);
 name.className = 'legend-row-label';
 const bar = el('div');
 bar.className = 'legend-gradient';
 const value = el('span', text);
 value.className = 'legend-row-value';
 row.append(name, bar, value);
 return row;
}

function legendRangeText(range, unitKind) {
 const u = unitLabel(unitKind);
 const at = value => fmt(quantity(value, unitKind), 1);
 if (range.max - range.min <= 1e-9) return `${at(range.max)} ${u} · ค่าคงที่ตลอดช่วง (ไม่แสดงเฉด)`;
 return `${at(range.min)} – ${at(range.max)} ${u}`;
}

function updateHeatmapLegend() {
 const box = $('heatmapLegend');
 if (!box) return;
 const cm = $('colorMode')?.value || 'default';
 const rowsEl = $('legendRows');
 if (!rowsEl) return;
 const titleEl = $('legendTitle');
 const scaleMode = $('colorScale')?.value || 'group';
 if (cm === 'default') {
  box.hidden = true;
  return;
 }
 box.hidden = false;
 if (cm === 'utilization') {
  if (titleEl) titleEl.textContent = 'อัตราการรับแรง (Demand / Capacity) · ทุกชิ้นส่วนต่อกัน';
  rowsEl.replaceChildren(legendRow('D/C', '0 ปลอดภัย – 1.0 วิกฤต – >1.0 ไม่ผ่าน'));
  return;
 }
 const key = cm === 'load' ? 'resultant' : cm;
 const unitKind = cm === 'Mz' ? 'moment' : 'force';
 const act = result?.combinations?.[$('resultCombo')?.value];
 const global = rangeKN(model.members, act?.members, key);
 const groups = rangeByGroupKN(model.members, act?.members, key, memberGroupOf);
 const selectedMember = selected?.kind === 'members' ? model.members.find(x => x.id === selected.id) : null;
 const selectedRange = selectedMember ? memberRangeKN(act?.members?.[selectedMember.id], key) : null;
 const scaleName = scaleMode === 'member' ? 'สเกลตามชิ้นส่วนที่เลือก' : scaleMode === 'global' ? 'สเกลรวมทั้งโมเดล' : 'สเกลแยกตามประเภทชิ้นส่วน';
 if (titleEl) titleEl.textContent = `${HEAT_TITLES[cm] || cm} (${unitLabel(unitKind)}) · ${scaleName} · จากผลวิเคราะห์`;
 if (!global) {
  rowsEl.replaceChildren(legendRow('—', 'ไม่มีผลวิเคราะห์ · กด “วิเคราะห์” ก่อน'));
  return;
 }
 if (scaleMode === 'member') {
  if (!selectedMember) {
   rowsEl.replaceChildren(legendRow('—', 'เลือกชิ้นส่วนในภาพ 1 ชิ้นก่อน เพื่อใช้สเกลของชิ้นส่วนนั้น'));
   return;
  }
  const range = selectedRange || { min: global.min, max: global.max };
  rowsEl.replaceChildren(legendRow(selectedMember.id, legendRangeText(range, unitKind) + ' · เฉพาะชิ้นส่วนนี้ ชิ้นอื่นสีเทา'));
  return;
 }
 if (scaleMode === 'group') {
  const rows = HEAT_ORDER.filter(group => groups?.[group]).map(group => legendRow(GROUP_LABELS[group] || group, legendRangeText(groups[group], unitKind)));
  rowsEl.replaceChildren(...(rows.length ? rows : [legendRow('—', 'ไม่มีผลวิเคราะห์')]));
  return;
 }
 rowsEl.replaceChildren(legendRow('ทุกชิ้นส่วน', legendRangeText(global, unitKind)));
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
  const gb = $('tGroundBeams') ? $('tGroundBeams').checked : true;
  model = warehouse(sx, bz, nz, ch, th, pan, cc, gb);
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
  // the legend must follow the selected mode even while we hand off to the design run
  updateHeatmapLegend();
  if ($('designAll')) {
   status('กำลังคำนวณออกแบบและวิเคราะห์อัตราการรับแรง (D/C Heatmap)...');
   $('designAll').click();
   return;
  }
 }
 drawModel();
};
if ($('colorScale')) $('colorScale').onchange = () => {
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

/* ==========================================================================
   RCStudio SketchUp-style 3D Build Mode & Shortcut Manager (Sprint 1)
   ========================================================================== */

let activeBuildTool = 'select';

const SHORTCUTS_STORAGE_KEY = 'rcstudio_shortcuts';
const DEFAULT_SHORTCUTS = {
  Select: ' ',
  Line: 'l',
  Node: 'n',
  Slab: 'r',
  Wall: 'p',
  Join: 'j',
  Pull: 'q',
  Toggle2D3D: 'v',
  ToggleDiagram: 'd',
  CycleDiagram: 'Ctrl+e',
  Analyze: 'Ctrl+a',
  Delete: 'Delete'
};

const SHORTCUT_METADATA = [
  { id: 'Select', label: 'เลือก (Select)', desc: 'เลือกวัตถุ / โหนด / สมาชิก' },
  { id: 'Line', label: 'เส้น (Line)', desc: 'วาดเส้น / คานโครงสร้าง' },
  { id: 'Node', label: 'โหนด (Node)', desc: 'วางตำแหน่งโหนดโครงสร้าง' },
  { id: 'Slab', label: 'พื้น (Slab)', desc: 'สร้างแผ่นพื้น คสล.' },
  { id: 'Wall', label: 'ผนัง (Wall)', desc: 'สร้างแผงผนังรับแรง / ผนังทั่วไป' },
  { id: 'Join', label: 'เชื่อม (Join)', desc: 'เชื่อมต่อจุดหรือเส้นโครงสร้าง' },
  { id: 'Pull', label: 'ดึง (Pull / Extrude)', desc: 'ดึงยืดหน้าตัด 3D' },
  { id: 'Toggle2D3D', label: 'สลับ 3D / 2D', desc: 'สลับมุมมองระหว่าง 3D กับผัง 2D' },
  { id: 'ToggleDiagram', label: 'แผนภาพ 3D', desc: 'เปิด / ปิด แผนภาพแรง 3D' },
  { id: 'CycleDiagram', label: 'เปลี่ยนแผนภาพ', desc: 'วนเปลี่ยนประเภท Mz, My, Vy, Vz, N, T' },
  { id: 'Analyze', label: 'วิเคราะห์', desc: 'สั่งคำนวณวิเคราะห์โครงสร้าง 3D' },
  { id: 'Delete', label: 'ลบ', desc: 'ลบรายการหรือชิ้นส่วนที่เลือก' }
];

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SHORTCUTS, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to load shortcuts from localStorage:', err);
  }
  return { ...DEFAULT_SHORTCUTS };
}

function saveShortcuts(shortcuts) {
  try {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (err) {
    console.warn('Failed to save shortcuts to localStorage:', err);
  }
}

let currentShortcuts = loadShortcuts();
let listeningShortcutAction = null;
let keydownCaptureHandler = null;

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

function deleteSelectedElement() {
  if (selectedList.length > 1) {
    const count = selectedList.length;
    mutate(() => {
      for (const sel of selectedList) {
        const row = model[sel.kind]?.find(r => r.id === sel.id);
        if (row) deleteRow(sel.kind, row);
      }
    });
    selected = null;
    selectedList = [];
    renderSelection();
    drawModel();
    renderTable();
    status(`ลบชิ้นส่วนที่เลือกทั้งหมด ${count} รายการแล้ว`);
    return;
  }
  if (!selected) {
    status('ยังไม่ได้เลือกชิ้นส่วนหรือโหนดที่จะลบ', 'error');
    return;
  }
  const collection = selected.kind;
  if (!collection || !model[collection]) {
    status('ไม่สามารถลบรายการนี้ได้', 'error');
    return;
  }
  const row = model[collection].find(r => r.id === selected.id);
  if (!row) {
    status(`ไม่พบรายการ ${selected.id}`, 'error');
    return;
  }
  deleteRow(collection, row);
  selected = null;
  selectedList = [];
  renderSelection();
  drawModel();
  renderTable();
}

function setBuildTool(tool) {
  activeBuildTool = tool;
  const palette = $('buildToolPalette');
  if (palette) {
    palette.querySelectorAll('.build-palette-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }
  if (viewMode === 'plan') {
    if (tool === 'select') setPlanTool('select');
    else if (tool === 'line') setPlanTool('beam');
    else if (tool === 'node') setPlanTool('node');
  }
  const toolNames = {
    select: 'เลือก (Select)',
    line: 'เส้น / คาน (Line)',
    node: 'โหนด (Node)',
    slab: 'พื้น (Slab)',
    wall: 'ผนัง (Wall)',
    join: 'เชื่อม (Join)',
    pull: 'ดึง / Extrude (Pull)'
  };
  if (tool === 'join') {
    promptJoinBeams();
  } else if (tool === 'pull') {
    if (selected && selected.kind === 'nodes') {
      openPullNodeMenu(selected.id);
    } else {
      status('เครื่องมือดึง (Pull): คลิกเลือกโหนดที่ต้องการยืดขยาย');
    }
  } else {
    status(`เครื่องมือ Build: ${toolNames[tool] || tool}`);
  }
}

function executeShortcutAction(action) {
  switch (action) {
    case 'Select':
      if (buildDrawState) {
        cancelBuildDrawing();
      } else {
        selected = null;
        selectedList = [];
        renderSelection();
        drawModel();
      }
      setBuildTool('select');
      break;
    case 'Line':
      setBuildTool('line');
      break;
    case 'Node':
      setBuildTool('node');
      break;
    case 'Slab':
      setBuildTool('slab');
      break;
    case 'Wall':
      setBuildTool('wall');
      break;
    case 'Join':
      setBuildTool('join');
      break;
    case 'Pull':
      setBuildTool('pull');
      break;
    case 'Toggle2D3D':
      setViewMode(viewMode === '3d' ? 'plan' : '3d');
      status(`สลับมุมมองเป็น ${viewMode === '3d' ? '3D' : 'ผัง 2D'}`);
      break;
    case 'ToggleDiagram': {
      const d = $('diagram3d');
      if (d) {
        d.checked = !d.checked;
        d.dispatchEvent(new Event('change'));
        status(`แผนภาพ 3D: ${d.checked ? 'เปิด' : 'ปิด'}`);
      }
      break;
    }
    case 'CycleDiagram': {
      const sel = $('diagramType');
      if (sel && sel.options.length) {
        sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
        sel.dispatchEvent(new Event('change'));
        status(`แผนภาพ: ${sel.options[sel.selectedIndex].text}`);
      }
      break;
    }
    case 'Analyze':
      $('analyze')?.click();
      break;
    case 'Delete':
      deleteSelectedElement();
      break;
  }
}

function setMode(mode) {
  if (mode !== 'classic' && mode !== 'build') return;
  currentMode = mode;
  try {
    localStorage.setItem('rcstudio_mode', mode);
  } catch {}

  $('btnModeClassic')?.classList.toggle('active', mode === 'classic');
  $('btnModeBuild')?.classList.toggle('active', mode === 'build');
  $('btnModeClassic')?.setAttribute('aria-checked', mode === 'classic' ? 'true' : 'false');
  $('btnModeBuild')?.setAttribute('aria-checked', mode === 'build' ? 'true' : 'false');

  const palette = $('buildToolPalette');
  if (palette) {
    palette.hidden = (mode !== 'build');
  }

  hideContextMenu();
  configureControlsForMode();

  if (mode === 'build') {
    status('สลับสู่ โหมด Build (3D) · คลิกกลางเพื่อหมุน · Shift+คลิกกลางเพื่อเลื่อน (Pan)');
  } else {
    status('สลับสู่ โหมด Classic');
  }
}

function showContextMenu(clientX, clientY) {
  const menu = $('customContextMenu');
  if (!menu) return;
  menu.hidden = false;
  menu.style.display = 'flex';
  
  const width = 230;
  const height = 370;
  let left = clientX;
  let top = clientY;
  if (left + width > window.innerWidth - 10) {
    left = window.innerWidth - width - 10;
  }
  if (top + height > window.innerHeight - 10) {
    top = window.innerHeight - height - 10;
  }
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;
}

function hideContextMenu() {
  const menu = $('customContextMenu');
  if (menu && !menu.hidden) {
    menu.hidden = true;
    menu.style.display = 'none';
  }
}

function renderShortcutTable() {
  const tbody = $('shortcutTableBody');
  if (!tbody) return;
  tbody.replaceChildren();

  SHORTCUT_METADATA.forEach(meta => {
    const tr = el('tr');
    
    const tdName = el('td');
    tdName.innerHTML = `<strong>${meta.label}</strong>`;
    
    const tdDesc = el('td');
    tdDesc.textContent = meta.desc;
    
    const tdKey = el('td');
    tdKey.style.textAlign = 'center';
    const keyBtn = el('button', formatShortcutDisplay(currentShortcuts[meta.id]));
    keyBtn.type = 'button';
    keyBtn.className = 'shortcut-record-btn';
    keyBtn.dataset.action = meta.id;
    keyBtn.title = 'คลิกเพื่อเปลี่ยนปุ่มลัด';
    keyBtn.onclick = () => startListeningShortcut(meta.id, keyBtn);
    
    tdKey.append(keyBtn);
    tr.append(tdName, tdDesc, tdKey);
    tbody.append(tr);
  });
}

function startListeningShortcut(action, buttonEl) {
  stopListeningShortcut();
  
  listeningShortcutAction = action;
  buttonEl.classList.add('recording');
  buttonEl.textContent = 'กดปุ่มใหม่...';

  keydownCaptureHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.key === 'Escape') {
      stopListeningShortcut();
      return;
    }
    
    const combo = eventToKeyCombo(event);
    if (!combo) return;
    
    currentShortcuts[action] = combo;
    saveShortcuts(currentShortcuts);
    stopListeningShortcut();
    renderShortcutTable();
    updateUIWithShortcuts();
    status(`ตั้งค่าปุ่มลัดสำหรับ ${action} เป็น [${formatShortcutDisplay(combo)}] แล้ว`);
  };

  window.addEventListener('keydown', keydownCaptureHandler, { capture: true });
}

function stopListeningShortcut() {
  if (keydownCaptureHandler) {
    window.removeEventListener('keydown', keydownCaptureHandler, { capture: true });
    keydownCaptureHandler = null;
  }
  listeningShortcutAction = null;
  document.querySelectorAll('.shortcut-record-btn.recording').forEach(btn => {
    btn.classList.remove('recording');
    const act = btn.dataset.action;
    btn.textContent = formatShortcutDisplay(currentShortcuts[act]);
  });
}

function openShortcutManager() {
  renderShortcutTable();
  $('shortcutManagerDialog')?.showModal();
}

function closeShortcutManager() {
  stopListeningShortcut();
  $('shortcutManagerDialog')?.close();
}

function resetShortcuts() {
  stopListeningShortcut();
  currentShortcuts = { ...DEFAULT_SHORTCUTS };
  saveShortcuts(currentShortcuts);
  renderShortcutTable();
  updateUIWithShortcuts();
  status('รีเซ็ตคีย์ลัดเป็นค่าเริ่มต้นแล้ว');
}

function updateUIWithShortcuts() {
  const toolMap = {
    Select: 'toolBuildSelect',
    Line: 'toolBuildLine',
    Node: 'toolBuildNode',
    Slab: 'toolBuildSlab',
    Wall: 'toolBuildWall',
    Join: 'toolBuildJoin',
    Pull: 'toolBuildPull'
  };
  for (const [action, btnId] of Object.entries(toolMap)) {
    const kbd = $(btnId)?.querySelector('.palette-kbd');
    if (kbd) kbd.textContent = formatShortcutDisplay(currentShortcuts[action]);
  }

  const ctx = $('customContextMenu');
  if (ctx) {
    ctx.querySelectorAll('.ctx-item').forEach(item => {
      const act = item.dataset.action;
      if (act && currentShortcuts[act]) {
        const kbd = item.querySelector('.ctx-key');
        if (kbd) kbd.textContent = formatShortcutDisplay(currentShortcuts[act]);
      }
    });
  }
}

// Global click outside context menu to hide
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#customContextMenu')) {
    hideContextMenu();
  }
});

// Context Menu item clicks
$('customContextMenu')?.addEventListener('click', event => {
  const item = event.target.closest('.ctx-item');
  if (!item) return;
  const action = item.dataset.action;
  hideContextMenu();
  if (action === 'settings') {
    openShortcutManager();
  } else {
    executeShortcutAction(action);
  }
});

// Floating Palette tools click
$('buildToolPalette')?.querySelectorAll('.build-palette-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    setBuildTool(btn.dataset.tool);
  });
});
$('toolBuildSettings')?.addEventListener('click', openShortcutManager);

// Mode switcher & Header buttons
$('btnModeClassic')?.addEventListener('click', () => setMode('classic'));
$('btnModeBuild')?.addEventListener('click', () => setMode('build'));
$('btnHeaderShortcuts')?.addEventListener('click', openShortcutManager);
$('btnJoinBeamsSidebar')?.addEventListener('click', promptJoinBeams);
$('btnPullNodeSidebar')?.addEventListener('click', () => {
  if (selected?.kind === 'nodes') {
    openPullNodeMenu(selected.id);
  } else {
    status('กรุณาเลือกโหนดในโมเดลก่อนกดดึง/ยืด (Q)', 'error');
  }
});

// Shortcut Dialog buttons
$('closeShortcutDialog')?.addEventListener('click', closeShortcutManager);
$('saveShortcutsBtn')?.addEventListener('click', closeShortcutManager);
$('resetShortcutsBtn')?.addEventListener('click', resetShortcuts);

// Join Beams Dialog buttons
$('closeJoinDialog')?.addEventListener('click', () => $('joinBeamsDialog')?.close());
$('cancelJoinBeamsBtn')?.addEventListener('click', () => $('joinBeamsDialog')?.close());
$('confirmJoinBeamsBtn')?.addEventListener('click', () => {
  if (currentJoinChain) {
    executeJoinBeams(currentJoinChain);
  }
});

// Click outside pullNodeMenu to hide
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#pullNodeMenu')) {
    closePullNodeMenu();
  }
});

// Initialize mode and shortcuts UI
setMode(currentMode);
updateUIWithShortcuts();

window.app = {
 getModel: () => model,
 structMode: applyStructMode,
 getStructMode: () => structMode,
 setSelected: (s) => { selected = s; renderSelection(); drawModel(); },
 selectItem: (kind, id) => { selected = { kind, id }; renderSelection(); drawModel(); },
 analyze: () => $('analyze').click(),
 drawModel: () => drawModel(),
 getMode: () => currentMode,
 setMode: setMode,
 getShortcuts: () => ({ ...currentShortcuts }),
 resetShortcuts: resetShortcuts,
 setBuildTool: setBuildTool,
 getActiveBuildTool: () => activeBuildTool,
 openShortcutManager: openShortcutManager,
 closeShortcutManager: closeShortcutManager,
 getSelectedList: () => [...selectedList],
 getBuildDrawState: () => buildDrawState ? { ...buildDrawState } : null,
 commitBuildDimensionInput: commitBuildDimensionInput,
 cancelBuildDrawing: cancelBuildDrawing,
 commitBuildSlab: commitBuildSlab,
 commitBuildWall: commitBuildWall,
 executeJoinBeams: executeJoinBeams,
 promptJoinBeams: promptJoinBeams,
 openPullNodeMenu: openPullNodeMenu,
 closePullNodeMenu: closePullNodeMenu
};

