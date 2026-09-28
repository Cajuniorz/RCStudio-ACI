# หลักฐานตรวจ RC Studio 0.1

วันที่ 28 กันยายน 2026 — สถานะ engineering preview / ANALYSIS_ONLY

## Automated checks

`python -X utf8 -m unittest discover -s tests -v`: 13 test methods ผ่าน, exit 0 (ดู log)

- แรงตามแกน PL/EA
- คานยื่นแรงปลายสองแกน PL³/(3EI), Iy ≠ Iz
- แรงบิด TL/(GJ)
- คาน simply supported UDL: reactions wL/2, midspan |M| = wL²/8 และ deflection 5wL⁴/(384EI)
- เสาแนวตั้ง คานเอียง และหน้าตัดหมุน 90°
- แรงกระจาย GLOBAL บนสมาชิกเอียง และสมดุลรอบจุดกำเนิดรวมโมเมนต์
- น้ำหนักตัวเองและ linear superposition รวม factor ศูนย์/ลบ
- floating component, rigid-body mechanism แม้โหลดเป็นศูนย์, isolated node
- schema/finite input/duplicate IDs/duplicate members/duplicate loads/unsupported fields
- JSON roundtrip ให้ผลเดิม
- incomplete drafts 6 รูปแบบเก็บได้ แต่ strict analysis ปฏิเสธ

`node --check static/app.js`: exit 0

## UI ที่ทดลองจริง

- เปิดหน้าและตรวจภาพโมเดลตัวอย่าง 8 nodes / 8 members
- วิเคราะห์สำเร็จ แสดงผลโหนด แรงปฏิกิริยา และกราฟสมาชิก
- แก้ M2.h จาก 0.45 เป็น 0.50: ผลเดิมหาย ปุ่ม export ปิด แล้ว Undo คืนค่า 0.45
- ล้าง E แล้ว reload: โมเดล 8 nodes / 8 members ยังอยู่ ค่า E คงว่าง ไม่ถูกเติมศูนย์
- เติม E กลับเป็น 25000
- บันทึก `.rcstudio` ลง `projects` ผ่านปุ่มในหน้า เปิดกลับด้วย file chooser และวิเคราะห์ซ้ำสำเร็จ
- เพิ่มชุดน้ำหนักจนถึง 8 ชุด: การเพิ่มชุดที่ 9 ถูกปฏิเสธก่อน autosave
- launcher stop/start รันจริง exit 0 และ server กลับมาตอบ
- ปุ่ม export เขียน `projects/analysis-20260928-100702-679839.json` จริง ตรวจ SHA-256 ของ input ตรงกับผลและ equilibrium ทุกชุดผ่าน (exit 0)
- HTTP POST จาก origin อื่นถูกปฏิเสธด้วย 403 (ทดสอบจริง)
- ภาพหน้าจอส่งมอบ: `RCStudio-preview.png`

## Independent code review

ผู้ตรวจอีก agent อ่าน engine/server/UI/launcher/tests แบบ read-only พบและแก้ไขแล้ว:

1. draft บางแบบเปิดกลับไม่ได้ — แยก draft validation ออกจาก strict analysis
2. startup restore race — ปิด controls ระหว่าง restore
3. UI สร้างข้อมูลเกิน cap — ตรวจและ rollback ก่อน autosave

ตรวจซ้ำเฉพาะการแก้และ endpoints บันทึก/export แล้วไม่พบ actionable finding เพิ่มเติมในขอบเขตนั้น การตรวจนี้ไม่ใช่ independent engineering certification

## ขอบเขตหลักฐาน

ยังไม่ทดสอบอาคารจริงจากข้อมูลของผู้ใช้, benchmark อาคารหลายชั้นเต็มรูปแบบ, sustained load performance, standalone installer, พื้น/ฐานราก หรือ RC design ซึ่งยังไม่ implement รูปตัวอย่างใช้ทดสอบซอฟต์แวร์เท่านั้น
