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
export function roofSeatElevation(roofBeamCenterY, rcBeamDepth, steelEavesDepth) {
  if (![roofBeamCenterY,rcBeamDepth,steelEavesDepth].every(Number.isFinite) || rcBeamDepth<=0 || steelEavesDepth<=0)
    throw new RangeError('Roof seat depth and elevation must be finite, positive dimensions');
  return roofBeamCenterY+(rcBeamDepth+steelEavesDepth)/2;
}

export const memberRecord=(id,i,j,kind='beam')=>({id,i,j,b:kind==='roof'?null:.25,h:kind==='roof'?null:.45,rotation:0,kind,sectionType:kind==='roof'?'steel_custom':'rc_rect',A:null,Iy:null,Iz:null,J:null,roofType:'custom',behavior:'frame'});
export const slabRecord=(id,nodes=[])=>({id,type:'one_way',nodes,thickness:null,weightMode:'volume',selfLoad:null,dead:null,live:null,mode:'pending',support1:'',support2:'',support3:'',support4:'',note:''});
export const foundationRecord=id=>({id,type:'isolated',nodes:[],bx:null,bz:null,depth:null,embedment:null,qa:null,pileCount:null,pileCapacity:null,pileLength:null,mode:'pending',note:''});
export const blankProject=()=>({schemaVersion:2,canonicalUnits:'m-kN-MPa',displayUnits:{system:'thai',force:'kgf'},name:'โครงการใหม่',material:{E:25000,nu:.2,density:24},steel:{E:200000,nu:.3,density:77},designBasis:{fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9},nodes:[],members:[],slabs:[],foundations:[],gridLines:{x:[],z:[]},nodalLoads:[],memberLoads:[],combinations:[{name:'U1',D:1.4,L:0,W:0},{name:'U2',D:1.2,L:1.6,W:0}],selfWeight:false});

export function alphaGridLabel(index){let n=index+1,out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}

export function warehouseModel(spanX=12,bayZ=5,numBaysZ=3,colH=4.5,trussH=1.8,panels=4,centerCol=false,groundBeams=true){
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
