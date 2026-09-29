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
