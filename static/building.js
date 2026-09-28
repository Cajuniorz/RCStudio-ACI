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
export const blankProject=()=>({schemaVersion:2,canonicalUnits:'m-kN-MPa',displayUnits:{system:'thai',force:'kgf'},name:'โครงการใหม่',material:{E:25000,nu:.2,density:24},steel:{E:200000,nu:.3,density:77},designBasis:{fc_mpa:23.5,fy_mpa:392,fyt_mpa:235,cover_mm:40,agg_mm:20,stirrup_mm:9},nodes:[],members:[],slabs:[],foundations:[],nodalLoads:[],memberLoads:[],combinations:[{name:'U1',D:1.4,L:0,W:0},{name:'U2',D:1.2,L:1.6,W:0}],selfWeight:false});
