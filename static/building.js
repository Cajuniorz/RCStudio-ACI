export const catalogs={
 kind:{beam:'คาน',column:'เสา',roof:'โครงหลังคา'},
 sectionType:{rc_rect:'คสล. สี่เหลี่ยม',steel_custom:'เหล็ก — กรอก A / I / J'},
 behavior:{frame:'โครงข้อแข็ง (รองรับ)',truss:'โครงถัก (รอระบบวิเคราะห์)'},
 axes:{local:'Local (แกนเฉพาะตัว)',global:'Global (แกนรวม)'},
 roofType:{gable:'จั่ว',hip:'ปั้นหยา',mono:'เพิงหมาแหงน',flat:'แบน',truss:'โครงถัก',spaceframe:'โครงข้อหมุนสามมิติ',curved:'โค้ง',custom:'กำหนดเอง'},
 slabType:{one_way:'คสล. ทางเดียว',two_way:'คสล. สองทาง',precast:'สำเร็จรูป',flat_slab:'ไร้คาน',ribbed:'ตง/ซี่โครง',waffle:'วาฟเฟิล',post_tension:'อัดแรงภายหลัง',steel_deck:'พื้นเหล็ก/เด็ค',custom:'กำหนดเอง'},
 foundationType:{isolated:'ฐานแผ่เดี่ยว',combined:'ฐานร่วม',strip:'ฐานแถบ',raft:'ฐานแพ',pile_cap:'ฐานหัวเสาเข็ม',pile:'เสาเข็ม',custom:'กำหนดเอง'},
 slabMode:{pending:'บันทึกข้อมูล — รอวิเคราะห์',one_way_load:'ถ่ายนน.ทางเดียวลง 2 คาน',two_way_load:'ถ่ายนน.สองทางลง 4 คาน'},
 foundationMode:{pending:'รอยืนยันจุดรองรับ',ideal_support:'ใช้จุดรองรับที่กำหนด — ยังไม่ออกแบบฐาน'},
 weightMode:{volume:'หนา × หน่วยนน.คอนกรีต',manual:'กรอกนน.ตัวพื้นต่อพื้นที่'}
};

export function roofSeatElevation(roofBeamCenterZ, rcBeamDepth, steelEavesDepth) {
  if (![roofBeamCenterZ,rcBeamDepth,steelEavesDepth].every(Number.isFinite) || rcBeamDepth<=0 || steelEavesDepth<=0)
    throw new RangeError('Roof seat depth and elevation must be finite, positive dimensions');
  return roofBeamCenterZ+(rcBeamDepth+steelEavesDepth)/2;
}

export const memberRecord=(id,i,j,kind='beam')=>({id,i,j,b:kind==='roof'?null:.25,h:kind==='roof'?null:.45,rotation:0,kind,sectionType:kind==='roof'?'steel_custom':'rc_rect',A:null,Iy:null,Iz:null,J:null,roofType:'custom',behavior:'frame'});
export const slabRecord=(id,nodes=[])=>({id,type:'one_way',nodes,thickness:null,weightMode:'volume',selfLoad:null,dead:null,live:null,mode:'pending',support1:'',support2:'',support3:'',support4:'',note:''});
export const foundationRecord=id=>({id,type:'isolated',nodes:[],bx:null,bz:null,by:null,depth:null,embedment:null,qa:null,pileCount:null,pileCapacity:null,pileLength:null,mode:'pending',note:''});

export const blankProject=()=>({
 schemaVersion:2,
 coordinateSystem:'z-up',
 canonicalUnits:'m-kN-MPa',
 displayUnits:{system:'thai',force:'kgf'},
 name:'โครงการใหม่',
 material:{E:25000,nu:.2,density:24},
 steel:{E:200000,nu:.3,density:77},
 designBasis:{fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9},
 nodes:[],
 members:[],
 slabs:[],
 foundations:[],
 gridLines:{x:[],y:[],z:[]},
 nodalLoads:[],
 memberLoads:[],
 combinations:[{name:'U1',D:1.4,L:0,W:0},{name:'U2',D:1.2,L:1.6,W:0}],
 selfWeight:false
});

export function alphaGridLabel(index){let n=index+1,out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}

export function warehouseModel(spanX=12,bayY=5,numBaysY=3,colH=4.5,trussH=1.8,panels=4,centerCol=false,groundBeams=true){
 const p=blankProject();p.name='อาคารโรงงาน + โครงถักเหล็ก ACI';p.selfWeight=true;
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

 // 1. Base nodes (z=0) with fixed base restraints
 for(let iy=0;iy<=numBaysY;iy++){
  const y=iy*bayY;
  getNode(`bL_${iy}`,0,y,0,true);
  getNode(`bR_${iy}`,spanX,y,0,true);
  if(centerCol)getNode(`bC_${iy}`,spanX/2,y,0,true);
 }
 // 2. Column top nodes (z=colH) (free/unrestrained)
 for(let iy=0;iy<=numBaysY;iy++){
  const y=iy*bayY;
  getNode(`tL_${iy}`,0,y,colH,false);
  getNode(`tR_${iy}`,spanX,y,colH,false);
  if(centerCol)getNode(`tC_${iy}`,spanX/2,y,colH,false);
 }
 // 3. Intermediate truss nodes in X-Z plane at each Y bay
 for(let iy=0;iy<=numBaysY;iy++){
  const y=iy*bayY;
  for(let k=1;k<totalPanels;k++){
   if(centerCol&&k===panels)continue;
   getNode(`tr_bot_${iy}_${k}`,k*dx,y,colH,false);
  }
  for(let k=1;k<totalPanels;k++){
   const pitchFactor=1.0-Math.abs(2*k/totalPanels-1.0);
   const zTop=colH+trussH*pitchFactor;
   getNode(`tr_top_${iy}_${k}`,k*dx,y,zTop,false);
  }
 }
 for(let iy=0;iy<=numBaysY;iy++){
  const bL=nodeMap.get(`bL_${iy}`),tL=nodeMap.get(`tL_${iy}`);addRC(bL,tL,'column',0.35,0.35);
  const bR=nodeMap.get(`bR_${iy}`),tR=nodeMap.get(`tR_${iy}`);addRC(bR,tR,'column',0.35,0.35);
  let bC,tC;if(centerCol){bC=nodeMap.get(`bC_${iy}`);tC=nodeMap.get(`tC_${iy}`);addRC(bC,tC,'column',0.35,0.35);}
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bL],bx:1.5,by:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bR],bx:1.5,by:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  if(centerCol)p.foundations.push({...foundationRecord('F'+(p.foundations.length+1)),nodes:[bC],bx:1.5,by:1.5,bz:1.5,depth:0.45,qa:150,mode:'ideal_support'});
  const botNodes=[],topNodes=[];
  const trib=(iy===0||iy===numBaysY)?0.5:1.0;
  for(let k=0;k<=totalPanels;k++){
   let botId=k===0?tL:k===totalPanels?tR:centerCol&&k===panels?tC:nodeMap.get(`tr_bot_${iy}_${k}`);botNodes.push(botId);
   let topId=k===0?tL:k===totalPanels?tR:nodeMap.get(`tr_top_${iy}_${k}`);topNodes.push(topId);
   if(k>0&&k<totalPanels){
    p.nodalLoads.push({node:topId,case:'D',fx:0,fy:0,fz:Math.round(-2.5*trib*1000)/1000,mx:0,my:0,mz:0});
    p.nodalLoads.push({node:topId,case:'L',fx:0,fy:0,fz:Math.round(-4.0*trib*1000)/1000,mx:0,my:0,mz:0});
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
 for(let iy=0;iy<numBaysY;iy++){
  addRC(getNode(`tL_${iy}`),getNode(`tL_${iy+1}`),'beam',0.25,0.45);
  addRC(getNode(`tR_${iy}`),getNode(`tR_${iy+1}`),'beam',0.25,0.45);
  if(centerCol)addRC(getNode(`tC_${iy}`),getNode(`tC_${iy+1}`),'beam',0.25,0.45);
  for(let k=1;k<totalPanels;k++){
   const p0=getNode(`tr_top_${iy}_${k}`),p1=getNode(`tr_top_${iy+1}_${k}`);
   if(p0&&p1&&p0!==p1)addSteel(p0,p1,0.0008,5e-7,5e-7,5e-8);
  }
 }
 if(groundBeams){
  for(let iy=0;iy<numBaysY;iy++){
   addRC(getNode(`bL_${iy}`),getNode(`bL_${iy+1}`),'beam',0.25,0.40);
   addRC(getNode(`bR_${iy}`),getNode(`bR_${iy+1}`),'beam',0.25,0.40);
   if(centerCol)addRC(getNode(`bC_${iy}`),getNode(`bC_${iy+1}`),'beam',0.25,0.40);
  }
  for(let iy=0;iy<=numBaysY;iy++){
   if(centerCol){
    addRC(getNode(`bL_${iy}`),getNode(`bC_${iy}`),'beam',0.25,0.40);
    addRC(getNode(`bC_${iy}`),getNode(`bR_${iy}`),'beam',0.25,0.40);
   }else{
    addRC(getNode(`bL_${iy}`),getNode(`bR_${iy}`),'beam',0.25,0.40);
   }
  }
 }
 const yGridLines = Array.from({length:numBaysY+1},(_,i)=>({label:alphaGridLabel(i),value:Math.round(i*bayY*1000)/1000}));
 p.gridLines={
  x:[{label:'1',value:0},...(centerCol?[{label:'2',value:Math.round(spanX/2*1000)/1000}]:[]),{label:centerCol?'3':'2',value:Math.round(spanX*1000)/1000}],
  y:yGridLines,
  z:yGridLines
 };
 return p;
}

export function threeStoryBuilding(sx=4.5,sy=4.0,nx=2,ny=1,height=3.0){
 const p=blankProject();
 p.name='อาคาร คสล. 3 ชั้น (ทรงจั่ว + พื้นสองทาง + บันได คสล. + เสาเข็ม)';
 p.selfWeight=true;
 p.designBasis={fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9,fy_steel_mpa:245};
 p.combinations=[{name:'U1',D:1.4,L:0,W:0},{name:'U2',D:1.2,L:1.6,W:0},{name:'Service',D:1.0,L:1.0,W:0}];
 p.stairs=[];
 const floors=3;
 const ids=new Map();
 for(let f=0;f<=floors;f++){
  const z=Math.round(f*height*1000)/1000;
  for(let iy=0;iy<=ny;iy++){
   const y=Math.round(iy*sy*1000)/1000;
   for(let ix=0;ix<=nx;ix++){
    const x=Math.round(ix*sx*1000)/1000;
    const id='N'+(p.nodes.length+1);
    ids.set(`${ix},${iy},${f}`,id);
    p.nodes.push({id,x,y,z,restraints:Array(6).fill(f===0)});
   }
  }
 }

 for(let iy=0;iy<=ny;iy++){
  for(let ix=0;ix<=nx;ix++){
   const baseNode=ids.get(`${ix},${iy},0`);
   p.foundations.push({
    ...foundationRecord('F'+(p.foundations.length+1)),
    type:'pile_cap',nodes:[baseNode],bx:1.4,by:1.4,bz:1.4,depth:0.5,embedment:1.2,
    qa:200,pileCount:4,pileCapacity:250,pileLength:12.0,mode:'ideal_support',
    note:'ฐานหัวเสาเข็ม 4 ต้น ∅0.25m ลึก 12m'
   });
  }
 }

 const beamsX=new Map(),beamsY=new Map();
 const addRC=(i,j,kind,b,h,roofRole=null)=>{
  const id='M'+(p.members.length+1);
  p.members.push({...memberRecord(id,i,j,kind),b,h,sectionType:'rc_rect',roofRole,behavior:'frame'});
  return id;
 };

 for(let f=1;f<=floors;f++){
  const isRoof=(f===floors);
  const colB=(f===1)?0.35:0.30,colH=(f===1)?0.35:0.30;
  const beamB=0.25,beamH=0.45;

  for(let iy=0;iy<=ny;iy++){
   for(let ix=0;ix<=nx;ix++){
    addRC(ids.get(`${ix},${iy},${f-1}`),ids.get(`${ix},${iy},${f}`),'column',colB,colH);
   }
  }

  for(let iy=0;iy<=ny;iy++){
   for(let ix=0;ix<nx;ix++){
    const mid=addRC(ids.get(`${ix},${iy},${f}`),ids.get(`${ix+1},${iy},${f}`),'beam',beamB,beamH,null);
    beamsX.set(`${ix},${iy},${f}`,mid);
    if(isRoof&&(iy===0||iy===ny)){
     p.memberLoads.push({member:mid,case:'D',axes:'local',qx:0,qy:0,qz:-0.8});
    }
   }
  }

  for(let ix=0;ix<=nx;ix++){
   for(let iy=0;iy<ny;iy++){
    const mid=addRC(ids.get(`${ix},${iy},${f}`),ids.get(`${ix},${iy+1},${f}`),'beam',beamB,beamH,null);
    beamsY.set(`${ix},${iy},${f}`,mid);
    if(isRoof&&(ix===0||ix===nx)){
     p.memberLoads.push({member:mid,case:'D',axes:'local',qx:0,qy:0,qz:-0.8});
    }
   }
  }
 }

 for(let f=1;f<floors;f++){
  for(let ix=0;ix<nx;ix++){
   for(let iy=0;iy<ny;iy++){
    const sid='S'+(p.slabs.length+1);
    const c0=ids.get(`${ix},${iy},${f}`);
    const c1=ids.get(`${ix+1},${iy},${f}`);
    const c2=ids.get(`${ix+1},${iy+1},${f}`);
    const c3=ids.get(`${ix},${iy+1},${f}`);
    const sup1=beamsX.get(`${ix},${iy},${f}`);
    const sup2=beamsX.get(`${ix},${iy+1},${f}`);
    const sup3=beamsY.get(`${ix},${iy},${f}`);
    const sup4=beamsY.get(`${ix+1},${iy},${f}`);
    p.slabs.push({
     ...slabRecord(sid),
     nodes:[c0,c1,c2,c3],
     type:'two_way',
     thickness:0.12,
     weightMode:'volume',
     dead:1.0,
     live:2.0,
     mode:'two_way_load',
     support1:sup1,
     support2:sup2,
     support3:sup3,
     support4:sup4,
     note:`พื้น คสล. สองทาง (Two-Way) ชั้น ${f+1} หนา 12cm`
    });
   }
  }
 }

 const yLines = Array.from({length:ny+1},(_,i)=>({label:alphaGridLabel(i),value:Math.round(i*sy*1000)/1000}));
 p.gridLines={
  x:Array.from({length:nx+1},(_,i)=>({label:String(i+1),value:Math.round(i*sx*1000)/1000})),
  y:yLines,
  z:yLines
 };
 p.coordinateSystem='z-up';
 return p;
}

export function getMemberLocalAxes(a,b,rotationDeg=0){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,L=Math.hypot(dx,dy,dz);
 if(L<1e-6)return{x:[1,0,0],y:[0,1,0],z:[0,0,1],L:0};
 let x=[dx/L,dy/L,dz/L],y,z;
 const isVert=Math.abs(dx)<1e-5&&Math.abs(dy)<1e-5;
 const isHoriz=Math.abs(dz)<1e-5;
 if(isVert){
  if(dz>=0){
   x=[0,0,1];
   y=[0,1,0];
   z=[-1,0,0];
  }else{
   x=[0,0,-1];
   y=[0,1,0];
   z=[1,0,0];
  }
 }else if(isHoriz){
  z=[0,0,1];
  y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  const my=Math.hypot(...y);
  y=[y[0]/my,y[1]/my,y[2]/my];
 }else{
  const zt=[0,0,1];
  let yTemp=[zt[1]*x[2]-zt[2]*x[1],zt[2]*x[0]-zt[0]*x[2],zt[0]*x[1]-zt[1]*x[0]];
  const my=Math.hypot(...yTemp);
  if(my>1e-6){
   y=[yTemp[0]/my,yTemp[1]/my,yTemp[2]/my];
   z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
   const mz=Math.hypot(...z);
   z=[z[0]/mz,z[1]/mz,z[2]/mz];
  }else{
   y=[0,1,0];
   z=[-1,0,0];
  }
 }
 if(rotationDeg!==0){
  const rad=rotationDeg*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const dotYX=y[0]*x[0]+y[1]*x[1]+y[2]*x[2];
  const crXY=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  const ry=[y[0]*c+crXY[0]*s+x[0]*dotYX*(1-c),y[1]*c+crXY[1]*s+x[1]*dotYX*(1-c),y[2]*c+crXY[2]*s+x[2]*dotYX*(1-c)];
  const dotZX=z[0]*x[0]+z[1]*x[1]+z[2]*x[2];
  const crXZ=[x[1]*z[2]-x[2]*z[1],x[2]*z[0]-x[0]*z[2],x[0]*z[1]-x[1]*z[0]];
  const rz=[z[0]*c+crXZ[0]*s+x[0]*dotZX*(1-c),z[1]*c+crXZ[1]*s+x[1]*dotZX*(1-c),z[2]*c+crXZ[2]*s+x[2]*dotZX*(1-c)];
  y=ry;
  z=rz;
 }
 return{x,y,z,L};
}

export function migrateToZUp(model){
 if(!model||typeof model!=='object')return model;
 if(model.coordinateSystem==='z-up')return model;
 const clone=JSON.parse(JSON.stringify(model));
 if(Array.isArray(clone.nodes)){
  for(const node of clone.nodes){
   if(node&&typeof node==='object'){
    const oldY=node.y,oldZ=node.z;
    node.y=oldZ??0;
    node.z=oldY??0;
    if(Array.isArray(node.restraints)&&node.restraints.length===6){
     const r=node.restraints;
     const rDY=r[1],rDZ=r[2],rRY=r[4],rRZ=r[5];
     r[1]=rDZ;r[2]=rDY;r[4]=rRZ;r[5]=rRY;
    }
   }
  }
 }
 if(Array.isArray(clone.nodalLoads)){
  for(const nl of clone.nodalLoads){
   if(nl&&typeof nl==='object'){
    const oldFy=nl.fy,oldFz=nl.fz;
    nl.fy=oldFz??0;nl.fz=oldFy??0;
    const oldMy=nl.my,oldMz=nl.mz;
    nl.my=oldMz??0;nl.mz=oldMy??0;
   }
  }
 }
 if(Array.isArray(clone.memberLoads)){
  for(const ml of clone.memberLoads){
   if(ml&&typeof ml==='object'){
    const oldQy=ml.qy,oldQz=ml.qz;
    ml.qy=oldQz??0;ml.qz=oldQy??0;
   }
  }
 }
 if(clone.gridLines&&typeof clone.gridLines==='object'){
  const oldX=clone.gridLines.x||[];
  const oldZ=clone.gridLines.z||[];
  const oldY=clone.gridLines.y||[];
  const targetLines=oldZ.length?oldZ:oldY;
  clone.gridLines={x:oldX,y:targetLines,z:targetLines};
 }
 if(Array.isArray(clone.foundations)){
  for(const f of clone.foundations){
   if(f&&typeof f==='object'){
    if(f.bz!==undefined&&f.by===undefined)f.by=f.bz;
   }
  }
 }
 clone.coordinateSystem='z-up';
 return clone;
}

export const ARROW_AXIS_LOCKS={
 ArrowRight:'x',
 ArrowLeft:'y',
 ArrowUp:'z',
 ArrowDown:null
};

export function getAxisLockFromKey(key){
 if(!key)return undefined;
 if(ARROW_AXIS_LOCKS[key]!==undefined)return ARROW_AXIS_LOCKS[key];
 const lower=key.toLowerCase();
 if(lower==='x'||lower==='y'||lower==='z')return lower;
 return undefined;
}

export function projectRayToAxisLine(rayOrigin, rayDir, lineStart, axis) {
 const u = axis === 'x' ? { x: 1, y: 0, z: 0 } :
           axis === 'y' ? { x: 0, y: 1, z: 0 } :
                          { x: 0, y: 0, z: 1 };
 const w = {
  x: rayOrigin.x - lineStart.x,
  y: rayOrigin.y - lineStart.y,
  z: rayOrigin.z - lineStart.z
 };
 const b = rayDir.x * u.x + rayDir.y * u.y + rayDir.z * u.z;
 const d = rayDir.x * w.x + rayDir.y * w.y + rayDir.z * w.z;
 const e = u.x * w.x + u.y * w.y + u.z * w.z;
 const D = 1 - b * b;
 if (Math.abs(D) < 1e-6) return null;
 const t = (e - b * d) / D;
 return {
  x: lineStart.x + t * u.x,
  y: lineStart.y + t * u.y,
  z: lineStart.z + t * u.z,
  dist: Math.abs(t)
 };
}

export function computeEndpointFromDimension(start, currentPoint, axisLock, targetLength) {
 let dir = { x: currentPoint.x - start.x, y: currentPoint.y - start.y, z: currentPoint.z - start.z };
 if (axisLock === 'x') {
  const sign = dir.x >= 0 ? 1 : -1;
  return { x: start.x + targetLength * sign, y: start.y, z: start.z };
 } else if (axisLock === 'y') {
  const sign = dir.y >= 0 ? 1 : -1;
  return { x: start.x, y: start.y + targetLength * sign, z: start.z };
 } else if (axisLock === 'z') {
  const sign = dir.z >= 0 ? 1 : -1;
  return { x: start.x, y: start.y, z: start.z + targetLength * sign };
 }
 const len = Math.hypot(dir.x, dir.y, dir.z);
 if (len < 1e-6) {
  return { x: start.x + targetLength, y: start.y, z: start.z };
 }
 return {
  x: start.x + (dir.x / len) * targetLength,
  y: start.y + (dir.y / len) * targetLength,
  z: start.z + (dir.z / len) * targetLength
 };
}

export function findContinuousBeamChain(members, selectedIds, nodes) {
 const selectedMembers = members.filter(m => selectedIds.includes(m.id));
 if (selectedMembers.length < 2) return null;

 const nodeConnections = new Map();
 for (const m of selectedMembers) {
  if (!nodeConnections.has(m.i)) nodeConnections.set(m.i, []);
  if (!nodeConnections.has(m.j)) nodeConnections.set(m.j, []);
  nodeConnections.get(m.i).push(m);
  nodeConnections.get(m.j).push(m);
 }

 const sharedNodes = [...nodeConnections.entries()].filter(([nodeId, mems]) => mems.length >= 2);
 if (sharedNodes.length === 0) return null;

 return {
  valid: true,
  members: selectedMembers,
  sharedNodes: sharedNodes.map(s => s[0])
 };
}

export function calculateWallUDL(heightM = 2.8, densityKgm2 = 180) {
 const wKNm = (densityKgm2 * heightM * 9.80665) / 1000;
 return Number(wKNm.toFixed(2));
}

export function classifyConnectedMembers(nodeId, members, nodes) {
 const n0 = nodes.find(n => n.id === nodeId);
 if (!n0) return [];
 const connected = members.filter(m => m.i === nodeId || m.j === nodeId);
 return connected.map(m => {
  const otherId = m.i === nodeId ? m.j : m.i;
  const n1 = nodes.find(n => n.id === otherId);
  if (!n1) return { member: m, axis: 'unknown', label: m.id };
  const dx = Math.abs(n1.x - n0.x);
  const dy = Math.abs(n1.y - n0.y);
  const dz = Math.abs(n1.z - n0.z);
  let axis = 'other', label = `คาน ${m.id}`;
  if (dx < 1e-4 && dy < 1e-4 && dz > 1e-4) {
   axis = 'z';
   label = `เสาแนวดิ่ง (Column: ${m.id})`;
  } else if (dy < 1e-4 && dz < 1e-4 && dx > 1e-4) {
   axis = 'x';
   label = `คานแนวแกน X (Beam X: ${m.id})`;
  } else if (dx < 1e-4 && dz < 1e-4 && dy > 1e-4) {
   axis = 'y';
   label = `คานแนวแกน Y (Beam Y: ${m.id})`;
  }
  return { member: m, axis, label, otherNode: n1 };
 });
}

export function closestPointOnSegmentToRay(rayOrigin, rayDir, segA, segB) {
 const v1 = rayDir;
 const v2 = { x: segB.x - segA.x, y: segB.y - segA.y, z: (segB.z !== undefined ? segB.z : 0) - (segA.z !== undefined ? segA.z : 0) };
 const L2 = v2.x * v2.x + v2.y * v2.y + v2.z * v2.z;
 if (L2 < 1e-8) {
  return { point: { x: segA.x, y: segA.y, z: segA.z !== undefined ? segA.z : 0 }, dist: 999, param: 0 };
 }
 const w0 = { x: rayOrigin.x - segA.x, y: rayOrigin.y - segA.y, z: rayOrigin.z - (segA.z !== undefined ? segA.z : 0) };
 const a = v1.x * v1.x + v1.y * v1.y + v1.z * v1.z;
 const b = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
 const c = L2;
 const d = v1.x * w0.x + v1.y * w0.y + v1.z * w0.z;
 const e = v2.x * w0.x + v2.y * w0.y + v2.z * w0.z;
 const denom = a * c - b * b;
 let s = Math.abs(denom) > 1e-8 ? (a * e - b * d) / denom : 0;
 s = Math.max(0, Math.min(1, s));
 const segPt = {
  x: segA.x + s * v2.x,
  y: segA.y + s * v2.y,
  z: (segA.z !== undefined ? segA.z : 0) + s * v2.z
 };
 const t = Math.max(0, (segPt.x - rayOrigin.x) * v1.x + (segPt.y - rayOrigin.y) * v1.y + (segPt.z - rayOrigin.z) * v1.z);
 const rayPt = {
  x: rayOrigin.x + t * v1.x,
  y: rayOrigin.y + t * v1.y,
  z: rayOrigin.z + t * v1.z
 };
 const dist = Math.hypot(segPt.x - rayPt.x, segPt.y - rayPt.y, segPt.z - rayPt.z);
 return { point: segPt, dist, param: s };
}

export function project3DToScreen(worldPoint, camera, viewportWidth, viewportHeight, Vector3Class = null) {
 if (!camera || !viewportWidth || !viewportHeight) return null;
 const zVal = worldPoint.z !== undefined ? worldPoint.z : (worldPoint.y ?? 0);
 let pNdc = null;
 if (Vector3Class) {
  pNdc = new Vector3Class(worldPoint.x, worldPoint.y, zVal).project(camera);
 } else if (typeof worldPoint.project === 'function') {
  pNdc = worldPoint.clone().project(camera);
 } else if (typeof camera.projectPoint === 'function') {
  pNdc = camera.projectPoint({ x: worldPoint.x, y: worldPoint.y, z: zVal });
 } else if (typeof camera.project === 'function') {
  const tmp = { x: worldPoint.x, y: worldPoint.y, z: zVal };
  pNdc = camera.project(tmp) || tmp;
 }
 if (!pNdc) return null;
 return {
  screenX: ((pNdc.x + 1) * viewportWidth) / 2,
  screenY: ((1 - pNdc.y) * viewportHeight) / 2,
  ndcZ: pNdc.z,
  inFront: pNdc.z > -1 && pNdc.z < 1
 };
}

export function find3DSnapPoint({
 screenX,
 screenY,
 viewportWidth,
 viewportHeight,
 camera,
 nodes = [],
 members = [],
 ray = null,
 buildDrawState = null,
 axisLock = null,
 curElev = 0,
 gridStep = 1.0,
 useGrid = false,
 nodeTolerancePx = 22,
 midpointTolerancePx = 18,
 edgeToleranceDist = 0.20,
 Vector3Class = null
}) {
 const nodeMap = new Map(nodes.map(n => [n.id, n]));

 // 1. Highest Priority: Screen-space Endpoint / Node snapping
 if (camera && viewportWidth && viewportHeight) {
  let bestNode = null, bestProj = null, minNodeDist = nodeTolerancePx;
  for (const node of nodes) {
   const proj = project3DToScreen(node, camera, viewportWidth, viewportHeight, Vector3Class);
   if (!proj || !proj.inFront) continue;
   const d = Math.hypot(screenX - proj.screenX, screenY - proj.screenY);
   if (d <= minNodeDist) {
    minNodeDist = d;
    bestNode = node;
    bestProj = proj;
   }
  }
  if (bestNode) {
   const zVal = bestNode.z !== undefined ? bestNode.z : (bestNode.y ?? 0);
   return {
    type: 'node',
    point: { x: bestNode.x, y: bestNode.y, z: zVal },
    node: bestNode,
    screenX: bestProj.screenX,
    screenY: bestProj.screenY,
    label: `โหนด ${bestNode.id}`,
    detail: `(${bestNode.x.toFixed(2)}, ${bestNode.y.toFixed(2)}, ${zVal.toFixed(2)})`,
    color: '#10b981',
    symbol: 'diamond',
    pixelDist: minNodeDist
   };
  }

  // 2. Second Priority: Screen-space Member Midpoint snapping
  let bestMid = null, bestMember = null, bestMidProj = null, minMidDist = midpointTolerancePx;
  for (const mem of members) {
   const ni = nodeMap.get(mem.i), nj = nodeMap.get(mem.j);
   if (!ni || !nj) continue;
   const zi = ni.z !== undefined ? ni.z : (ni.y ?? 0);
   const zj = nj.z !== undefined ? nj.z : (nj.y ?? 0);
   const mid = { x: (ni.x + nj.x) / 2, y: (ni.y + nj.y) / 2, z: (zi + zj) / 2 };
   const proj = project3DToScreen(mid, camera, viewportWidth, viewportHeight, Vector3Class);
   if (!proj || !proj.inFront) continue;
   const d = Math.hypot(screenX - proj.screenX, screenY - proj.screenY);
   if (d <= minMidDist) {
    minMidDist = d;
    bestMid = mid;
    bestMember = mem;
    bestMidProj = proj;
   }
  }
  if (bestMid) {
   return {
    type: 'midpoint',
    point: bestMid,
    member: bestMember,
    screenX: bestMidProj.screenX,
    screenY: bestMidProj.screenY,
    label: `กึ่งกลาง ${bestMember.id}`,
    detail: `(${bestMid.x.toFixed(2)}, ${bestMid.y.toFixed(2)}, ${bestMid.z.toFixed(2)})`,
    color: '#06b6d4',
    symbol: 'triangle',
    pixelDist: minMidDist
   };
  }
 }

 // 3. Third Priority: 3D Ray-to-Member Edge snapping ("On Edge")
 if (ray && ray.origin && ray.direction) {
  let bestEdgePt = null, bestEdgeMember = null, minRayDist = edgeToleranceDist;
  for (const mem of members) {
   const ni = nodeMap.get(mem.i), nj = nodeMap.get(mem.j);
   if (!ni || !nj) continue;
   const res = closestPointOnSegmentToRay(ray.origin, ray.direction, ni, nj);
   if (res.dist <= minRayDist) {
    minRayDist = res.dist;
    bestEdgePt = res.point;
    bestEdgeMember = mem;
   }
  }
  if (bestEdgePt) {
   return {
    type: 'edge',
    point: bestEdgePt,
    member: bestEdgeMember,
    label: `บนชิ้นส่วน ${bestEdgeMember.id}`,
    detail: `(${bestEdgePt.x.toFixed(2)}, ${bestEdgePt.y.toFixed(2)}, ${bestEdgePt.z.toFixed(2)})`,
    color: '#ec4899',
    symbol: 'square',
    dist: minRayDist
   };
  }
 }

 // 4. Fourth Priority: Axis Locks & Inference when actively drawing
 if (buildDrawState && ray && ray.origin && ray.direction) {
  const origin = buildDrawState.start || buildDrawState.ref;
  if (origin) {
   const effectiveLock = axisLock || buildDrawState.axisLock;
   if (effectiveLock) {
    const proj = projectRayToAxisLine(ray.origin, ray.direction, origin, effectiveLock);
    if (proj) {
     const color = effectiveLock === 'x' ? '#ef4444' : effectiveLock === 'y' ? '#22c55e' : '#3b82f6';
     return {
      type: 'axis',
      point: { x: proj.x, y: proj.y, z: proj.z },
      axis: effectiveLock,
      isLocked: true,
      label: `ล็อกแกน ${effectiveLock.toUpperCase()}`,
      detail: `L: ${proj.dist.toFixed(2)} m`,
      color,
      symbol: 'axis'
     };
    }
   }

   const projX = projectRayToAxisLine(ray.origin, ray.direction, origin, 'x');
   const projY = projectRayToAxisLine(ray.origin, ray.direction, origin, 'y');
   const projZ = projectRayToAxisLine(ray.origin, ray.direction, origin, 'z');

   const denom = ray.direction.z;
   if (Math.abs(denom) > 1e-6) {
    const t = (origin.z - ray.origin.z) / denom;
    if (t > 0) {
     const planePt = {
      x: ray.origin.x + t * ray.direction.x,
      y: ray.origin.y + t * ray.direction.y,
      z: origin.z
     };
     const dx = Math.abs(planePt.x - origin.x);
     const dy = Math.abs(planePt.y - origin.y);
     const angle = Math.atan2(dy, dx);
     if (angle < 0.12 && projX) {
      return {
       type: 'axis',
       point: { x: projX.x, y: origin.y, z: origin.z },
       axis: 'x',
       isAuto: true,
       label: 'ตามแนวแกน X (แดง)',
       detail: `ΔX: ${(projX.x - origin.x).toFixed(2)} m`,
       color: '#ef4444',
       symbol: 'axis'
      };
     }
     if (Math.abs(angle - Math.PI / 2) < 0.12 && projY) {
      return {
       type: 'axis',
       point: { x: origin.x, y: projY.y, z: origin.z },
       axis: 'y',
       isAuto: true,
       label: 'ตามแนวแกน Y (เขียว)',
       detail: `ΔY: ${(projY.y - origin.y).toFixed(2)} m`,
       color: '#22c55e',
       symbol: 'axis'
      };
     }
    }
   }

   if (projZ) {
    const ptOnZ = { x: origin.x, y: origin.y, z: projZ.z };
    const tZ = (ptOnZ.x - ray.origin.x) * ray.direction.x + (ptOnZ.y - ray.origin.y) * ray.direction.y + (ptOnZ.z - ray.origin.z) * ray.direction.z;
    const ptRayZ = { x: ray.origin.x + tZ * ray.direction.x, y: ray.origin.y + tZ * ray.direction.y, z: ray.origin.z + tZ * ray.direction.z };
    const distZ = Math.hypot(ptOnZ.x - ptRayZ.x, ptOnZ.y - ptRayZ.y, ptOnZ.z - ptRayZ.z);
    if (distZ < 0.35) {
     return {
      type: 'axis',
      point: ptOnZ,
      axis: 'z',
      isAuto: true,
      label: 'ตามแนวแกน Z ดิ่ง (น้ำเงิน)',
      detail: `ΔZ: ${(projZ.z - origin.z).toFixed(2)} m`,
      color: '#3b82f6',
      symbol: 'axis'
     };
    }
   }
  }
 }

 // 5. Fallback: Horizontal Plane / Ground Plane Snapping
 if (ray && ray.origin && ray.direction && Math.abs(ray.direction.z) > 1e-6) {
  const targetZ = curElev;
  const t = (targetZ - ray.origin.z) / ray.direction.z;
  if (t > 0) {
   let pt = {
    x: ray.origin.x + t * ray.direction.x,
    y: ray.origin.y + t * ray.direction.y,
    z: targetZ
   };
   if (useGrid && gridStep > 0) {
    pt.x = Math.round(pt.x / gridStep) * gridStep;
    pt.y = Math.round(pt.y / gridStep) * gridStep;
   }
   return {
    type: useGrid ? 'grid' : 'plane',
    point: pt,
    label: useGrid ? `กริด ${gridStep.toFixed(2)} m` : `ระนาบ Z = ${targetZ.toFixed(2)}`,
    detail: `(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)})`,
    color: '#94a3b8',
    symbol: 'cross'
   };
  }
 }

 return null;
}



