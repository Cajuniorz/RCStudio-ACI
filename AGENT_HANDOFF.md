# AGENT_HANDOFF — RCStudio-ACI (v0.9.2)

เอกสารส่งต่องานสำหรับ AI Agent / นักพัฒนาคนถัดไป **อ่านทั้งไฟล์ก่อนแก้โค้ดทุกครั้ง**

## 1. ภาพรวมระบบ

| ชั้น | เทคโนโลยี | ไฟล์หลัก |
|---|---|---|
| Frontend | Vanilla ES Modules + Three.js (ไม่มี bundler) | `static/app.js`, `static/building.js`, `static/plan.js`, `static/heatmap.js`, `static/units.js`, `static/thai_standards.js`, `static/index.html`, `static/style.css` |
| Backend | Python `http.server` + PyNite 3.0.0 | `server.py`, `engine.py` (solver), `project_v2.py` (schema/validation/ถ่ายแรงพื้น), `design_rc25.py` (ACI 318-25 USD) |
| Protocol | JSON โมเดล v2 หน่วยภายใน **m–kN–MPa** | ไฟล์ `.rcstudio` ใน `projects/` |

- รัน: `& "H:\structure anlysis\.verification-tools\pynite-3.0.0\Scripts\python.exe" server.py` → `http://127.0.0.1:8766`
- ระบบพิกัดภายใน **Z-Up** (X,Y = ระนาบพื้น, Z = ความสูง, แรงโน้มถ่วง −Z) ไฟล์เก่า Y-Up แปลงด้วย `migrateToZUp()`
- UI: Pre-Design Setup Hub 4 แท็บ (โครงการ / วัสดุไทย / ผังกริด / สร้างอาคาร), โหมด Classic ↔ Build (สไตล์ SketchUp), Shortcut Manager, Context Menu, 3D Snapping HUD

## 2. สถานะฟีเจอร์ (v0.9.1)
- ✅ Setup Hub, คลังวัสดุไทย (`thai_standards.js`), เครื่องคิดเลข Wall UDL / Floor SDL, Auto-Exterior Wall
- ✅ Build tools: Line L, Node N, Slab R, Wall P, Join J, Pull Q; snapping 3D
- ✅ วิเคราะห์ PyNite + ตรวจ ACI 318-25 (ทดสอบจริง 202 components)
- ⚠️ ยังไม่มี: plate/shell FEM, P-Delta, soil/pile, แรงลม/แผ่นดินไหว — ต้องมีวิศวกรตรวจก่อนใช้งานจริง

## 3. กฎการพัฒนาร่วมกัน (Collaboration Rules)
1. **ระบุที่มา (Source Citation):** ทุกค่าวัสดุ/โหลด/สูตรต้องอ้างอิงมาตรฐาน เช่น กฎกระทรวง ฉบับที่ 6 พ.ศ. 2527, มยผ., ว.ส.ท., ACI 318-25 ไว้ใน comment หรือ CHANGELOG
2. **บันทึกทุกการเปลี่ยนแปลง:** เพิ่มหัวข้อรุ่นบนสุดของ `CHANGELOG.md` ระบุ: อาการบัค → ต้นเหตุ → วิธีแก้ → หลักฐานทดสอบ; อัปเดต `VERSION` และ banner `static/index.html`
3. **Layout 100vh:** ห้ามมี scrollbar ของหน้าต่างหลัก (`height:100vh; overflow:hidden`) เครื่องมือใหม่ต้องไม่ดันให้ต้องเลื่อนหน้า; `<dialog>` ต้องไม่อยู่ใน document flow
4. **ความเข้ากันได้ย้อนหลัง:** ห้ามลบ/เปลี่ยนชื่อ DOM id เดิม (เทสต์อ้างอิงอยู่) และต้องเปิดไฟล์ `.rcstudio` รุ่นเก่าได้
5. **ขีดจำกัดโมเดล:** `nodes ≤ 500`, `members ≤ 1000`, `model.name ≤ 120` ตัวอักษร (`mutate()` ใน `app.js` จะ rollback เงียบๆ ถ้าเกิน)
6. **Z-Up เท่านั้น:** generator ใหม่ต้องสร้างเป็น Z-Up หรือเรียก `migrateToZUp`
7. **Verification Gate ก่อน commit:** `node --test` (35 ผ่าน) และ `python -m unittest discover -s tests` (77 ผ่าน) ต้องผ่านทั้งหมด
8. **Handoff:** แก้อะไรเพิ่มให้อัปเดตไฟล์นี้ (ส่วน 2, 6, 8) ก่อนส่งต่อ
9. **Coordinate-Safe Backend:** โค้ด Python ที่อ่านพิกัดโหนด / reaction / ขนาดฐานราก ต้องแตกกิ่งตาม `model['coordinateSystem']` (`z-up`: แนวดิ่ง = `z`, reaction ดิ่ง = index 2, โมเมนต์ราบ = index 3,4, ฐานราก `bx,by`; `y-up`: แนวดิ่ง = `y`, index 1, โมเมนต์ 3,5, `bx,bz`) ห้ามฮาร์ดโค้ดแกน `y`/index 1 เป็น "แนวดิ่ง" และทุกการแก้ต้องมีเทสต์ **ทั้งสองระบบ** (ดู `tests/test_zup_design.py`)
10. **Fail-Safe ด้านความปลอดภัย:** ผลออกแบบต้องไม่ "PASS" เมื่ออินพุตเป็น 0/ว่าง/หาย (เช่น ไม่มี reaction ดิ่งที่ฐานราก) → ให้คืน `SKIP`/`FAIL` พร้อมข้อความไทยบอกสาเหตุ ผล "ผ่าน" ที่มาจากอินพุตศูนย์ถือเป็นบั๊กระดับ Critical
11. **ห้าม Fallback เงียบ:** ค่า default ที่ใช้แทนข้อมูลที่หายไป (เช่น `lu=3000`, `span=4.0`) ต้องแสดงใน `note`/warning ของผลลัพธ์ ไม่ใช่แทนค่าแล้วเงียบ (ดูรายการค้างในส่วน 8)
12. **ขั้นตอนแก้โค้ดความปลอดภัยสูง** (`engine.py`, `design_rc25.py`, `design_beam25.py`, `project_v2.py`, `server.py`): (ก) เขียนเทสต์ที่ล้มก่อนแก้ (ข) แก้เล็กที่สุด (ค) ยืนยัน Y-up เดิมไม่เปลี่ยนผล (ง) บันทึกบั๊กในส่วน 6 พร้อมต้นเหตุ
13. **Input จาก client ไม่น่าเชื่อถือ:** ทุก endpoint ต้อง validate ชนิด/ช่วง/finite ก่อนใช้ (ดู `clean_basis()` ใน `server.py`) ห้ามส่งต่อ dict จาก client เข้า solver/designer ตรงๆ
14. **ห้ามแก้ส่วนที่ผ่านการตรวจแล้วโดยไม่จำเป็น:** ฟังก์ชันออกแบบตามสูตร ACI (`design_beam_section`, `design_column_section`, `design_footing`, ...) แก้ได้เฉพาะเมื่อมีเอกสารอ้างอิงมาตรฐานและเทสต์เทียบมือ ห้าม refactor เชิงสไตล์

## 4. ข้อควรระวัง
- Windows: การ kill task ของ server อาจทิ้ง child process ค้างที่พอร์ต 8766 → `netstat -ano | findstr 8766` แล้ว `taskkill /F /PID <pid>`
- Backend ตรวจ schema เข้มงวด: ฟิลด์ใหม่บน member/slab/foundation ต้องเพิ่มใน `project_v2.py` ก่อน
- ฟิลด์ตัวเลขที่ backend ต้องการ ต้องเป็น finite number (ห้ามส่ง object/null)
- `git config core.autocrlf=true`: ไฟล์เป็น CRLF การ patch ด้วยข้อความหลายบรรทัดอาจไม่ match ให้แก้ผ่านสคริปต์ Python
- ไฟล์ใน `projects/` เป็นผลรันทดสอบ ไม่ต้อง commit
- `static/reports/` สะสมไฟล์ PDF/HTML ทุกครั้งที่ออกรายงาน ควรล้างเป็นระยะ (ยังไม่มีระบบลบอัตโนมัติ)
- Python runtime ถูกฮาร์ดโค้ดที่ `H:\structure anlysis\...` ถ้าไดรฟ์ H: ไม่อยู่ เซิร์ฟเวอร์จะไม่ขึ้น
- ผล UI "ผ่าน" ไม่ได้แปลว่าปลอดภัย ผลทั้งหมดเป็นเครื่องช่วย ต้องมีวิศวกรผู้ได้รับใบอนุญาตตรวจสอบ

## 5. ข้อห้าม
- ห้ามเปลี่ยนหน่วยภายใน (m–kN–MPa) การแปลงทำที่ชั้นแสดงผลเท่านั้น
- ห้ามฮาร์ดโค้ดค่าวัสดุ/โหลดโดยไม่มีที่มา
- ห้ามปิด/ข้ามการ validate เพื่อให้วิเคราะห์ผ่าน
- ห้ามอ้างว่าผลผ่านมาตรฐานโดยไม่ได้รันเทสต์จริง
- ห้าม push โดยเทสต์ไม่ผ่าน / ห้าม force-push `main`

## 6. Bug Autopsy Log
| # | อาการ | ต้นเหตุ | วิธีแก้ |
|---|---|---|---|
| 1 | `Member v2: ... unknown fields are not supported` | `project_v2.py` เทียบ key ของ member เข้มงวด ฟิลด์ผนังทำให้ล้ม | `discard` `hasWall, wallHeight, wallDensity, wallLoad, wallMaterial` ก่อนเทียบ |
| 2 | `ERR_EMPTY_RESPONSE` ที่ 8766 | process เก่าค้างถือพอร์ต | หา PID ด้วย netstat แล้ว taskkill |
| 3 | `S1.dead: finite number required` | `computeFloorDeadLoad_KNm2` คืน object ถูกใส่ใน `slab.dead` | ดึง `.sdlKNm2` / แปลงเป็น number |
| 4 | โมเดลหายเป็น 0 nodes | ชื่ออาคารอัตโนมัติ ~130 ตัวอักษร เกิน 120 → `mutate()` rollback | ย่อชื่อเหลือ ~35 ตัวอักษร |
| 5 | `S1: floor must be horizontal` | `blankProject()` ตั้ง `coordinateSystem:'z-up'` จึงข้าม `migrateToZUp` ทั้งที่ generator เป็น Y-Up | `delete p.coordinateSystem` ก่อนสร้างอาคาร |
| 6 | `F1.by (m): finite number required` | `by:null` ไม่ผ่านเงื่อนไข `=== undefined` | ตรวจ `undefined || null` และตั้ง `by` ใน generator |
| 7 | Floor SDL badge แสดง 0 kg/m² | อ่านฟิลด์ `.sdl_kgm2` แทน `.density_kgm2` | `item?.density_kgm2 ?? item?.sdl_kgm2` |
| 8 | เครื่องมือดันให้หน้าเว็บต้องเลื่อน / เมนูซ้อนทับ | dialog อยู่ใน flow, layout ล้น viewport | ย้ายเครื่องมือเป็น overlay, คง 100vh |
| 9 | กล้องหมุนอ้อมไกลเมื่อ orbit | pivot ไม่ใช่จุดที่ผู้ใช้สนใจ | ปรับ pivot / Build mode ใช้ middle-drag orbit |
| 10 | ฐานรากใน Z-up ออกแบบด้วย Pu=0 แต่ขึ้น PASS (**Critical**) | `design_all` อ่าน `reaction[1]` (FY) และ `rxn[5]` แบบ Y-up | เลือก index ตาม `coordinateSystem` (ดิ่ง=2, โมเมนต์=3,4) + fail-safe SKIP เมื่อ Pu≤0 |
| 11 | ความยาวไร้ค้ำยันเสาใน Z-up ตกไปใช้ค่า default 3000 mm เงียบๆ | ใช้ `abs(nj['y']-ni['y'])` เป็นความสูงเสา | ใช้แกนดิ่งตามระบบพิกัด (`v_key`) |
| 12 | ช่วงพื้น Z-up ถูกมองเป็นสี่เหลี่ยมจัตุรัส (ด้านยาวหาย) / label หลังคาผิด | ใช้ `['z']` เป็นแกนราบที่สอง และ `dy` เป็นความสูงแบบ Y-up | ใช้แกนราบ/ดิ่งตามระบบพิกัด, `label_members(..., z_up=)` |
| 13 | `/api/design-all` รับ `designBasis` ติดลบ/ข้อความ/NaN แล้วออกแบบต่อ; Content-Type ที่มี `; charset` ถูกปฏิเสธ | ไม่มี validation ใน `server.py` | เพิ่ม `clean_basis()` และผ่อน Content-Type ให้เทียบเฉพาะ media type |

## 8. รายการเสี่ยงที่ยังค้าง (พบจากการตรวจโค้ด 0.9.2 — ยังไม่แก้)
- `design_rc25.py`: fallback เงียบ `lu=3000 mm`, `span=4.0 m`, `fy_steel=245` เมื่อข้อมูลขาด (ละเมิดกฎ 11)
- `design_rc25.py`: จัดกลุ่มพื้นด้วย `(s.get('dead') or 1.0)` ทำให้ dead=0 ถูกแทนด้วย 1.0
- `design_rc25.py`: ออกแบบแบบ "กลุ่มตาม label" ใช้ค่า governing ของกลุ่ม — ตรวจให้แน่ว่ากลุ่มคาน/เสาที่ต่างชั้น/ต่างโหลดไม่ถูกสรุปด้วย rep (ตัวแทน) ตัวแรกในส่วนที่ใช้ค่า `rep.get(...)`
- `server.py`: ไม่มีการลบไฟล์ใน `static/reports/` และ `/api/export-pdf` สร้างไฟล์ใหม่ทุกครั้ง
- `static/app.js` ~265 KB ไฟล์เดียว ความเสี่ยงชนกันเมื่อ agent หลายตัวแก้พร้อมกัน → ให้แยกฟีเจอร์ใหม่ไปโมดูลใหม่
- ไฟล์ scratch ใน root (`scratch_*.py`, `scratch_*.png`, `scratch_warehouse.json`) ถูก track อยู่ ควรย้ายออก/ลบเมื่อยืนยันแล้ว

## 7. งานแนะนำถัดไป
Auto-load จากแรงลม/แผ่นดินไหว (มยผ. 1311/1301), ออกแบบพื้นและฐานราก, P-Delta, undo สำหรับ wizard, เทสต์ E2E อัตโนมัติ
