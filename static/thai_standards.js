/**
 * thai_standards.js
 * มาตรฐานวัสดุก่อสร้างไทยและเกณฑ์การออกแบบวิศวกรรมโครงสร้าง
 * อ้างอิง:
 * - กฎกระทรวง ฉบับที่ 6 (พ.ศ. 2527) ออกตามความใน พ.ร.บ. ควบคุมอาคาร พ.ศ. 2522
 * - กฎกระทรวง กำหนดการรับน้ำหนักฯ พ.ศ. 2566
 * - มาตรฐาน มยผ. 101/102-51 และมาตรฐาน ว.ส.ท. (EIT Standard)
 * - ACI 318-25 (USD) / ว.ส.ท.
 */

export const GRAVITY = 9.80665; // m/s^2

/**
 * แคตตาล็อกหน่วยน้ำหนักผนังมาตรฐานไทย (Wall Materials Dead Loads)
 * หน่วย: kg/m^2 (กิโลกรัมต่อตารางเมตรของพื้นที่ผนัง)
 */
export const THAI_WALL_MATERIALS = {
 mon_half: {
  id: 'mon_half',
  name: 'ผนังก่ออิฐมอญครึ่งแผ่น ฉาบปูน 2 ด้าน',
  shortName: 'อิฐมอญครึ่งแผ่น',
  density_kgm2: 180,
  min_kgm2: 180,
  max_kgm2: 200,
  thickness_cm: 10,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 1 & มาตรฐาน ว.ส.ท.'
 },
 mon_full: {
  id: 'mon_full',
  name: 'ผนังก่ออิฐมอญเต็มแผ่น ฉาบปูน 2 ด้าน',
  shortName: 'อิฐมอญเต็มแผ่น',
  density_kgm2: 360,
  min_kgm2: 360,
  max_kgm2: 400,
  thickness_cm: 20,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 1 & มาตรฐาน ว.ส.ท.'
 },
 aac_75: {
  id: 'aac_75',
  name: 'ผนังก่ออิฐมวลเบา หนา 7.5 cm ฉาบปูน 2 ด้าน',
  shortName: 'อิฐมวลเบา 7.5cm',
  density_kgm2: 90,
  min_kgm2: 80,
  max_kgm2: 100,
  thickness_cm: 9.5,
  ref: 'มยผ. 102-51 & ผลทดสอบผู้ผลิต มอก. 1505'
 },
 aac_100: {
  id: 'aac_100',
  name: 'ผนังก่ออิฐมวลเบา หนา 10 cm ฉาบปูน 2 ด้าน',
  shortName: 'อิฐมวลเบา 10cm',
  density_kgm2: 120,
  min_kgm2: 110,
  max_kgm2: 130,
  thickness_cm: 12,
  ref: 'มยผ. 102-51 & ผลทดสอบผู้ผลิต มอก. 1505'
 },
 cblock_70: {
  id: 'cblock_70',
  name: 'ผนังคอนกรีตบล็อก หนา 7 cm ฉาบปูน 2 ด้าน',
  shortName: 'อิฐบล็อก 7cm',
  density_kgm2: 150,
  min_kgm2: 140,
  max_kgm2: 160,
  thickness_cm: 9.5,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 gypsum_light: {
  id: 'gypsum_light',
  name: 'ผนังยิปซัมบอร์ด 2 ด้าน โครงคร่าวเหล็กชุบสังกะสี',
  shortName: 'ผนังเบายิปซัม',
  density_kgm2: 30,
  min_kgm2: 25,
  max_kgm2: 35,
  thickness_cm: 7.5,
  ref: 'มยผ. 102-51'
 },
 glass_curtain: {
  id: 'glass_curtain',
  name: 'ผนังกระจกบานเกล็ด / อลูมิเนียมคอมโพสิต',
  shortName: 'ผนังกระจก/อลูมิเนียม',
  density_kgm2: 40,
  min_kgm2: 30,
  max_kgm2: 50,
  thickness_cm: 5,
  ref: 'มาตรฐาน ว.ส.ท.'
 }
};

/**
 * แคตตาล็อกวัสดุตกแต่งผิวพื้นและฝ้าเพดาน (Superimposed Dead Load - SDL)
 * หน่วย: kg/m^2
 */
export const THAI_FLOOR_SDL = {
 tile_screed: {
  id: 'tile_screed',
  name: 'กระเบื้องเซรามิก / แกรนิตโต้ + ปูนทรายปรับระดับ 3-5 cm',
  shortName: 'ปูกระเบื้อง+ปูนทราย',
  density_kgm2: 60,
  min_kgm2: 50,
  max_kgm2: 80,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 wood_parquet: {
  id: 'wood_parquet',
  name: 'ไม้ปาร์เกต์ / ลามิเนต / SPC + แผ่นโฟมและปูนปรับระดับ',
  shortName: 'ปาร์เกต์/ลามิเนต/SPC',
  density_kgm2: 35,
  min_kgm2: 25,
  max_kgm2: 45,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 bare_polished: {
  id: 'bare_polished',
  name: 'คอนกรีตขัดมันเปลือย (Bare Polished Concrete - ไม่มีผิวทับ)',
  shortName: 'คอนกรีตขัดมัน',
  density_kgm2: 0,
  min_kgm2: 0,
  max_kgm2: 10,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 ceiling_gypsum: {
  id: 'ceiling_gypsum',
  name: 'ฝ้าเพดานยิปซัมบอร์ดฉาบเรียบ 9mm รวมโครงคร่าวเหล็กชุบ',
  shortName: 'ฝ้ายิปซัมฉาบเรียบ',
  density_kgm2: 15,
  min_kgm2: 12,
  max_kgm2: 18,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 ceiling_tbar: {
  id: 'ceiling_tbar',
  name: 'ฝ้าเพดานทีบาร์ แผ่นอะคูสติก / ยิปซัม 60x60 cm',
  shortName: 'ฝ้าทีบาร์',
  density_kgm2: 10,
  min_kgm2: 8,
  max_kgm2: 14,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 mep_pipework: {
  id: 'mep_pipework',
  name: 'งานระบบท่อสุขาภิบาล ไฟฟ้า และปรับอากาศ (M&E Piping)',
  shortName: 'งานระบบท่อ M&E',
  density_kgm2: 15,
  min_kgm2: 10,
  max_kgm2: 25,
  ref: 'มาตรฐาน ว.ส.ท.'
 },
 ceiling_gypsum_mep: {
  id: 'ceiling_gypsum_mep',
  name: 'ฝ้าเพดานยิปซัม 9mm + งานระบบท่อ M&E',
  shortName: 'ฝ้ายิปซัม+ระบบท่อ',
  density_kgm2: 30,
  min_kgm2: 25,
  max_kgm2: 40,
  ref: 'มาตรฐาน ว.ส.ท.'
 }
};

/**
 * แคตตาล็อกวัสดุมุงหลังคา (Roof Covering Materials)
 * หน่วย: kg/m^2
 */
export const THAI_ROOF_MATERIALS = {
 metal_sheet_pu: {
  id: 'metal_sheet_pu',
  name: 'แผ่นเหล็กรีดลอน (Metal Sheet 0.35-0.47mm) + ฉนวน PU/PE',
  shortName: 'เมทัลชีท+ฉนวน',
  density_kgm2: 12,
  min_kgm2: 8,
  max_kgm2: 15,
  ref: 'มยผ. 102-51'
 },
 cpac_monier: {
  id: 'cpac_monier',
  name: 'กระเบื้องคอนกรีตซีแพคโมเนีย (CPAC Monier Tile)',
  shortName: 'ซีแพคโมเนีย',
  density_kgm2: 52,
  min_kgm2: 45,
  max_kgm2: 58,
  ref: 'มาตรฐาน ว.ส.ท. & มอก. 535'
 },
 corrugated_fiber: {
  id: 'corrugated_fiber',
  name: 'กระเบื้องลอนคู่ไฟเบอร์ซีเมนต์ (Corrugated Fiber-Cement)',
  shortName: 'กระเบื้องลอนคู่',
  density_kgm2: 16,
  min_kgm2: 14,
  max_kgm2: 18,
  ref: 'มาตรฐาน ว.ส.ท. & มอก. 79'
 }
};

/**
 * น้ำหนักบรรทุกจรขั้นต่ำตามกฎกระทรวง ฉบับที่ 6 (พ.ศ. 2527) ข้อ 2
 * หน่วย: kg/m^2
 */
export const THAI_LIVE_LOADS = {
 residential: {
  id: 'residential',
  label: 'ที่พักอาศัย / ห้องนอน / บ้านเดี่ยว / คอนโด / ทาวน์เฮาส์',
  shortLabel: 'ที่พักอาศัย',
  ll_kgm2: 150,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(1)'
 },
 office: {
  id: 'office',
  label: 'อาคารสำนักงาน / ธนาคาร',
  shortLabel: 'สำนักงาน/ธนาคาร',
  ll_kgm2: 250,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(2)'
 },
 commercial_school: {
  id: 'commercial_school',
  label: 'อาคารพาณิชย์ / ร้านค้า / มินิมาร์ท / ห้องเรียน / โรงเรียน',
  shortLabel: 'ร้านค้า/โรงเรียน',
  ll_kgm2: 300,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(3)'
 },
 assembly_stairs: {
  id: 'assembly_stairs',
  label: 'ภัตตาคาร / หอประชุม / โรงมหรสพ / โถงทางเดิน / บันได',
  shortLabel: 'หอประชุม/บันได/ทางเดิน',
  ll_kgm2: 400,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(4)'
 },
 warehouse_parking: {
  id: 'warehouse_parking',
  label: 'ที่จอดรถยนต์ส่วนบุคคล / คลังสินค้าเบา',
  shortLabel: 'ที่จอดรถ/คลังสินค้าเบา',
  ll_kgm2: 400,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(5)'
 },
 heavy_warehouse: {
  id: 'heavy_warehouse',
  label: 'คลังสินค้าทั่วไป / โรงงานอุตสาหกรรม',
  shortLabel: 'คลังสินค้า/โรงงาน',
  ll_kgm2: 500,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(6)'
 },
 roof_inaccessible: {
  id: 'roof_inaccessible',
  label: 'หลังคาไม่ได้ใช้สอย (Inaccessible Roof)',
  shortLabel: 'หลังคา (ไม่ใช้สอย)',
  ll_kgm2: 30,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(7)'
 },
 roof_deck: {
  id: 'roof_deck',
  label: 'ดาดฟ้าคอนกรีตสำหรับใช้สอยทั่วไป',
  shortLabel: 'ดาดฟ้าคอนกรีต',
  ll_kgm2: 100,
  ref: 'กฎกระทรวง ฉบับที่ 6 ข้อ 2(8)'
 }
};

/**
 * พรีเซ็ตก่อสร้างคอนกรีตเสริมเหล็ก (Concrete Strength Presets)
 * แปลงระหว่าง ksc (Cylinder 15x30 cm) และ MPa
 */
export const THAI_CONCRETE_PRESETS = [
 { ksc: 180, fc_mpa: 17.65, label: '180 ksc (17.7 MPa) · งานบ้านทั่วไป/คานคอดิน' },
 { ksc: 210, fc_mpa: 20.59, label: '210 ksc (20.6 MPa) · มาตรฐานบ้านพักอาศัย' },
 { ksc: 240, fc_mpa: 23.54, label: '240 ksc (23.5 MPa) · อาคารพาณิชย์/มาตรฐาน ACI' },
 { ksc: 280, fc_mpa: 27.46, label: '280 ksc (27.5 MPa) · อาคารสาธารณะ/โครงสร้างรับแรงสูง' },
 { ksc: 320, fc_mpa: 31.38, label: '320 ksc (31.4 MPa) · อาคารขนาดใหญ่' },
 { ksc: 350, fc_mpa: 34.32, label: '350 ksc (34.3 MPa) · เสาเข็ม/งานคอนกรีตอัดแรง' }
];

/**
 * เกรดเหล็กเสริมตามมาตรฐาน มอก. (Rebar Grades)
 */
export const THAI_REBAR_GRADES = {
 longitudinal: [
  { grade: 'SD40', fy_mpa: 392, label: 'SD40 (fy = 392 MPa / 4,000 ksc) · ข้ออ้อยยอดนิยม' },
  { grade: 'SD50', fy_mpa: 490, label: 'SD50 (fy = 490 MPa / 5,000 ksc) · ข้ออ้อยกำลังสูง' },
  { grade: 'SR24', fy_mpa: 235, label: 'SR24 (fy = 235 MPa / 2,400 ksc) · เหล็กกลมผิวเรียบ' }
 ],
 stirrup: [
  { grade: 'RB9_SR24', fyt_mpa: 235, bar: 9, label: 'RB9 / SR24 (fyt = 235 MPa) · ปลอกมาตรฐานทั่วไป' },
  { grade: 'RB6_SR24', fyt_mpa: 235, bar: 6, label: 'RB6 / SR24 (fyt = 235 MPa) · ปลอกคานขนาดเล็ก/แผงพื้น' },
  { grade: 'DB10_SD30', fyt_mpa: 295, bar: 10, label: 'DB10 / SD30 (fyt = 295 MPa) · ปลอกเสารับแรงเฉือนสูง' },
  { grade: 'DB10_SD40', fyt_mpa: 392, bar: 10, label: 'DB10 / SD40 (fyt = 392 MPa) · ปลอกต้านแผ่นดินไหว' }
 ]
};

/**
 * ระยะหุ้มคอนกรีตมาตรฐาน (Clear Concrete Cover mm)
 */
export const THAI_COVERING_STANDARDS = {
 footing: 50,  // ฐานราก (สัมผัสลีนคอนกรีต 50mm, สัมผัสดินตรง 75mm)
 column: 40,   // เสา
 beam: 40,     // คาน
 slab: 20      // พื้น คสล.
};

// ==========================================
// ฟังก์ชันคำนวณและแปลงหน่วย (Calculation Helpers)
// ==========================================

/**
 * คำนวณน้ำหนักผนังกระจายลงคาน (Wall Uniform Distributed Load)
 * @param {number} heightM ความสูงผนัง (m)
 * @param {number} densityKgm2 น้ำหนักผนังต่อพื้นที่ (kg/m^2)
 * @returns {number} ค่า UDL ในหน่วย kN/m (ทศนิยม 3 ตำแหน่ง)
 */
export function computeWallUDL_KNm(heightM = 2.8, densityKgm2 = 180) {
 if (!Number.isFinite(heightM) || heightM <= 0 || !Number.isFinite(densityKgm2) || densityKgm2 < 0) return 0;
 const wKNm = (densityKgm2 * heightM * GRAVITY) / 1000;
 return Number(wKNm.toFixed(3));
}

/**
 * คำนวณ Dead Load รวมของแผ่นพื้น (Concrete Slab Self-weight + Superimposed Finish + Ceiling)
 * @param {number} thicknessM ความหนาพื้น (m) เช่น 0.10 หรือ 0.12 m
 * @param {number} finishKgm2 น้ำหนักผิวพื้น (kg/m^2)
 * @param {number} ceilingKgm2 น้ำหนักฝ้าเพดาน/งานระบบ (kg/m^2)
 * @param {number} concreteDensityKgm3 หน่วยน้ำหนักคอนกรีต (kg/m^3) ปกติ 2400
 * @returns {{ selfWeightKNm2: number, sdlKNm2: number, totalDeadKNm2: number }}
 */
export function computeFloorDeadLoad_KNm2(thicknessOrFinish = 0.12, finishOrCeiling = 60, ceilingKgm2 = 15, concreteDensityKgm3 = 2400) {
 if (typeof thicknessOrFinish === 'string') {
  const finishKey = thicknessOrFinish;
  const ceilingKey = finishOrCeiling;
  const finishKg = THAI_FLOOR_SDL[finishKey]?.density_kgm2 ?? THAI_FLOOR_SDL[finishKey]?.sdl_kgm2 ?? 60;
  const ceilKg = THAI_FLOOR_SDL[ceilingKey]?.density_kgm2 ?? THAI_FLOOR_SDL[ceilingKey]?.sdl_kgm2 ?? (ceilingKey === 'none' ? 0 : 15);
  const sdlKg = finishKg + ceilKg;
  const sdlKN = Number(((sdlKg * GRAVITY) / 1000).toFixed(3));
  return {
   selfWeightKNm2: 0,
   sdlKNm2: sdlKN,
   totalDeadKNm2: sdlKN,
   toFixed: (d) => sdlKN.toFixed(d),
   valueOf: () => sdlKN
  };
 }
 const thicknessM = Number(thicknessOrFinish) || 0.12;
 const finishKg = Number(finishOrCeiling) || 0;
 const ceilKg = Number(ceilingKgm2) || 0;
 const swKg = thicknessM * concreteDensityKgm3;
 const swKN = (swKg * GRAVITY) / 1000;
 const sdlKg = finishKg + ceilKg;
 const sdlKN = (sdlKg * GRAVITY) / 1000;
 const sdlKNRound = Number(sdlKN.toFixed(3));
 return {
  selfWeightKNm2: Number(swKN.toFixed(3)),
  sdlKNm2: sdlKNRound,
  totalDeadKNm2: Number((swKN + sdlKN).toFixed(3)),
  toFixed: (d) => sdlKNRound.toFixed(d),
  valueOf: () => sdlKNRound
 };
}

/**
 * แปลง kg/m^2 เป็น kN/m^2
 */
export function kgm2ToKNm2(kgm2) {
 if (!Number.isFinite(kgm2)) return 0;
 return Number(((kgm2 * GRAVITY) / 1000).toFixed(3));
}

/**
 * แปลง kN/m^2 เป็น kg/m^2
 */
export function knm2ToKgm2(knm2) {
 if (!Number.isFinite(knm2)) return 0;
 return Number(((knm2 * 1000) / GRAVITY).toFixed(1));
}

/**
 * แปลง ksc (Cylinder 15x30cm) เป็น MPa
 */
export function kscToMpa(ksc) {
 if (!Number.isFinite(ksc)) return 0;
 return Number((ksc * 0.0980665).toFixed(2));
}

/**
 * แปลง MPa เป็น ksc
 */
export function mpaToKsc(mpa) {
 if (!Number.isFinite(mpa)) return 0;
 return Number((mpa / 0.0980665).toFixed(1));
}
