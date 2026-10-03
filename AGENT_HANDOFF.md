# AGENT_HANDOFF — RCStudio-ACI (v0.9.5)

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

## 2. สถานะฟีเจอร์ (v0.9.5)
- ✅ Setup Hub, คลังวัสดุไทย (`thai_standards.js`), เครื่องคิดเลข Wall UDL / Floor SDL, Auto-Exterior Wall
- ✅ Build tools: Line L, Node N, Slab R, Wall P, Join J, Pull Q; snapping 3D
- ✅ วิเคราะห์ PyNite + ตรวจ ACI 318-25 (ทดสอบจริง 202 components)
- ✅ Heatmap เสา/คานไล่เฉดสีตามพฤติกรรมจริง (D/C แปรผันตาม station t) ไม่เป็นก้อน
- ✅ เสาต่อเนื่องหลายชั้น (Continuous Column Stack) จัดกลุ่มแชร์สเกลสีรวม และไล่เรียงเฉดสีลงมาไร้รอยต่อข้ามชั้น (`getContinuousColumnStackValue`)
- ✅ แผนภาพ 3D Multi-Family Diagrams (M, V, N, T) รองรับครบทุกตระกูลแรงพร้อม offset vector และสีนีออนเฉพาะตระกูล
- ✅ แสดงเส้นถ่ายแรงพื้นลงคาน (Floor Load Transfers UDL & Overlay) ในระนาบ Z-Up
- ⚠️ ยังไม่มี: plate/shell FEM, P-Delta, soil/pile, แรงลม/แผ่นดินไหว — ต้องมีวิศวกรตรวจก่อนใช้งานจริง

## 3. กฎการพัฒนาร่วมกัน (Collaboration Rules)
1. **ระบุที่มา (Source Citation):** ทุกค่าวัสดุ/โหลด/สูตรต้องอ้างอิงมาตรฐาน เช่น กฎกระทรวง ฉบับที่ 6 พ.ศ. 2527, มยผ., ว.ส.ท., ACI 318-25 ไว้ใน comment หรือ CHANGELOG
2. **บันทึกทุกการเปลี่ยนแปลง:** เพิ่มหัวข้อรุ่นบนสุดของ `CHANGELOG.md` ระบุ: อาการบัค → ต้นเหตุ → วิธีแก้ → หลักฐานทดสอบ; อัปเดต `VERSION` และ banner `static/index.html`
3. **Layout 100vh:** ห้ามมี scrollbar ของหน้าต่างหลัก (`height:100vh; overflow:hidden`) เครื่องมือใหม่ต้องไม่ดันให้ต้องเลื่อนหน้า; `<dialog>` ต้องไม่อยู่ใน document flow
4. **ความเข้ากันได้ย้อนหลัง:** ห้ามลบ/เปลี่ยนชื่อ DOM id เดิม (เทสต์อ้างอิงอยู่) และต้องเปิดไฟล์ `.rcstudio` รุ่นเก่าได้
5. **ขีดจำกัดโมเดล:** `nodes ≤ 500`, `members ≤ 1000`, `model.name ≤ 120` ตัวอักษร (`mutate()` ใน `app.js` จะ rollback เงียบๆ ถ้าเกิน)
6. **Z-Up เท่านั้น:** generator ใหม่ต้องสร้างเป็น Z-Up หรือเรียก `migrateToZUp`
7. **Verification Gate ก่อน commit:** `node --test` (44 ผ่าน) และ `python -m unittest discover -s tests` (84 ผ่าน) ต้องผ่านทั้งหมด
8. **Handoff:** แก้อะไรเพิ่มให้อัปเดตไฟล์นี้ (ส่วน 2, 6, 8) ก่อนส่งต่อ
9. **Coordinate-Safe Backend:** โค้ด Python ที่อ่านพิกัดโหนด / reaction / ขนาดฐานราก ต้องแตกกิ่งตาม `model['coordinateSystem']` (`z-up`: แนวดิ่ง = `z`, reaction ดิ่ง = index 2, โมเมนต์ราบ = index 3,4, ฐานราก `bx,by`; `y-up`: แนวดิ่ง = `y`, index 1, โมเมนต์ 3,5, `bx,bz`) ห้ามฮาร์ดโค้ดแกน `y`/index 1 เป็น "แนวดิ่ง" และทุกการแก้ต้องมีเทสต์ **ทั้งสองระบบ** (ดู `tests/test_zup_design.py`)
10. **Fail-Safe ด้านความปลอดภัย:** ผลออกแบบต้องไม่ "PASS" เมื่ออินพุตเป็น 0/ว่าง/หาย (เช่น ไม่มี reaction ดิ่งที่ฐานราก) → ให้คืน `SKIP`/`FAIL` พร้อมข้อความไทยบอกสาเหตุ ผล "ผ่าน" ที่มาจากอินพุตศูนย์ถือเป็นบั๊กระดับ Critical
11. **ห้าม Fallback เงียบ:** ค่า default ที่ใช้แทนข้อมูลที่หายไป (เช่น `lu=3000`, `span=4.0`) ต้องแสดงใน `note`/warning ของผลลัพธ์ ไม่ใช่แทนค่าแล้วเงียบ (ดูรายการค้างในส่วน 8)
12. **ขั้นตอนแก้โค้ดความปลอดภัยสูง** (`engine.py`, `design_rc25.py`, `design_beam25.py`, `project_v2.py`, `server.py`): (ก) เขียนเทสต์ที่ล้มก่อนแก้ (ข) แก้เล็กที่สุด (ค) ยืนยัน Y-up เดิมไม่เปลี่ยนผล (ง) บันทึกบั๊กในส่วน 6 พร้อมต้นเหตุ
13. **Input จาก client ไม่น่าเชื่อถือ:** ทุก endpoint ต้อง validate ชนิด/ช่วง/finite ก่อนใช้ (ดู `clean_basis()` ใน `server.py`) ห้ามส่งต่อ dict จาก client เข้า solver/designer ตรงๆ
15. **ยืนยันทิศทาง/เครื่องหมายกับ solver จริงก่อนเขียน logic ที่ใช้ผลวิเคราะห์:** ห้ามสมมติเครื่องหมายหรือแกน ให้รันโมเดลเล็กที่รู้คำตอบ (เช่นคานช่วงเดียว wL²/8, 2 ช่วง 9wL²/128) แล้วเทียบ ข้อเท็จจริงที่ตรวจแล้ว: PyNite **sagging = ค่าลบ, hogging = ค่าบวก** (ทั้ง Mz ของ Y-up และ My ของ Z-up); คาน Z-up โก่งรอบ local y → ใช้ **My, Vz** (Mz=Vy=0); ความลึกหน้าตัด h ต้องอยู่ตาม local z ใน Z-up
16. **ห้ามให้ UI อ่านแรง/โมเมนต์แกนเดียวแบบตายตัว:** โหมดสี/แผนภาพ/D-C ต้องใช้ `max(|Mz|,|My|)` และ `max(|Vy|,|Vz|)` (คีย์ `M`/`V` ใน `heatmap.js`) เพื่อไม่ให้คานแสดงเป็น "ไม่มีแรง"
17. **เครื่องมือแก้โมเดล (J/Q/P/...) ต้อง validate ชนิดและรูปทรงก่อนแก้:** ห้ามเขียนทับหน้าตัดโดยไม่แจ้ง และต้องบอกเหตุผลเมื่อปฏิเสธ
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
| 14 | **[Critical]** คาน/เสา คสล. ใน Z-up ถูกวิเคราะห์ "ล้มตะแคง" (ใช้ b เป็นความลึก) — โก่งตัว 6.00 mm แทน 2.16 mm (คาน 30×50, 6 m, 10 kN/m), ความแข็งผิด 2.8 เท่า ทำให้การกระจายโมเมนต์ในโครงข้อแข็งเพี้ยน ทั้งที่ภาพ 3D วาด h เป็นความลึกถูกต้อง | `engine.section_properties` ให้ `Iy=h·b³/12` ตามสมมติฐาน Y-up (h ตาม local y) แต่ใน Z-up แรงโน้มถ่วงอยู่ตาม local z | สลับ `Iy↔Iz` เมื่อ `coordinateSystem=='z-up'` (เฉพาะหน้าตัด คสล. ไม่แตะ steel_custom) — ยืนยัน δ=5wL⁴/384EI → 2.16 mm |
| 15 | **[Critical]** ออกแบบคานใน Z-up ได้ Mu=0, Vu=0 แต่ขึ้น DESIGNED | `design_all` อ่านเฉพาะ `Mz`/`Vy` ของคาน (Z-up อยู่ใน `My`/`Vz`) | เลือก `My,Vz` ตามระบบพิกัด; เสา: mux=My, muy=Mz ใน Z-up |
| 16 | **[Critical]** เหล็กบน/ล่างของคานสลับกัน (ทั้ง Y-up และ Z-up): โมเมนต์ช่วงกลาง (sagging) ถูกใส่เหล็กบน, ที่หัวเสา (hogging) ถูกใส่เหล็กล่าง — คานช่วงเดียว 45 kN·m ได้เหล็กล่าง = 0 | `gov_mu_pos=|Mz_max|` แต่ sagging เป็นค่า**ลบ** (`Mz_min`) | `bottom ← |min(M,0)|`, `top ← |max(M,0)|`; แก้ fixture เดิมใน `test_design_rc25.py` ที่ฝังเครื่องหมายผิดไว้ |
| 17 | แผนภาพแรงเฉือน 3D ของคาน Z-up ไม่แสดง และโหมดสี Mz/Vy ทาคานเป็นสีเทา (ไม่มีแรง); D/C สำรองของคานเป็น ~0 (ดูปลอดภัยเกินจริง) | UI อ่าน `Vy`/`Mz` อย่างเดียว | แผนภาพเลือก Vy/Vz (ทิศ y_L/z_L ตามตัวใหญ่), โหมดสีใช้คีย์รวม `M`/`V`, D/C ใช้ `max(Mz,My)` |
| 18 | ปุ่ม J (รวมคานต่อเนื่อง) รับเสา/คานตัวที/คานหักมุม/คานที่ไม่ต่อกัน และเขียนทับหน้าตัดทุกตัวเป็นของ "ตัวแรกที่เลือก" (อาจลดความลึกคานโดยไม่แจ้ง) | `findContinuousBeamChain` ตรวจแค่ "มีโหนดร่วม ≥1 จุด" | ตรวจเป็นคานล้วน/ต่อเนื่องเป็นสายเดียว/ไม่มีจุดต่อ >2/เป็นเส้นตรง; ใช้หน้าตัดที่ใหญ่สุด และแจ้งตัวที่ถูกปรับ |
| 19 | เสาแสดงสี Heatmap D/C เป็นก้อนสีทึบเดียวทั้งท่อน (Solid Monochromatic Block) | `getMemberDC(m, active)` คืนสเกลาร์เดียวทั้งชิ้น ไม่ขึ้นกับตำแหน่งสถานี ($t$) | ปรับ `getMemberDC(m, active, t)` คำนวณ $D/C(t) = P(t)/\phi P_n + M_u(t)/\phi M_n$ แปรผันตามสถานี ทำให้หัวเสาไล่สีส้ม/แดง กลางเสาสีเขียว/น้ำเงิน สะท้อนพฤติกรรมจริง |
| 20 | เสาหลายชั้นในแนวดิ่งเดียวกันถูกแสดงแยกท่อนในโหมด Member Focus | เสาแต่ละชั้นใช้ local min/max แยกกัน และไฮไลต์เฉพาะท่อนเดี่ยว | เพิ่ม `findContinuousColumnStack(members, memberId, nodes)` รวมเสาแกน $(X,Y)$ เดียวกันจากฐานรากถึงหลังคาให้แชร์สเกลและสว่างพร้อมกัน |
| 21 | เส้นโครงถ่ายน้ำหนักพื้น (Floor Tributary Loads) ไม่แสดงในระบบพิกัด Z-Up | `static/app.js` ตรวจ `if (qVal > 0.005)` แต่ $q_z = -3.5 \text{ kN/m}$ (ทิศแรงโน้มถ่วงค่าลบ) | ใช้ `Math.abs(qVal) > 0.005` พร้อมวาดเส้นโครง UDL แรเงาและลูกศรสีเขียวมรกตแสดงการถ่ายแรงลงคาน |
| 22 | แผนภาพ 3D ไม่ตอบสนองเมื่อผู้ใช้เลือกดูแรงตามแนวแกน ($N$) หรือแรงบิด ($T$) | UI บังคับทับค่าด้วย $M_z/M_y$ และขาด `diagGlobal.N`, `diagGlobal.T` | รองรับแผนภาพ 3D ครบทุกตระกูลแรง ($M_z, M_y, V_y, V_z, N, T$) พร้อม transverse offset vector และสีเส้นกรอบนีออนเฉพาะตระกูล |
| 23 | โหมดเส้นโครงลวด (Wireframe) เมื่อเปิด Heatmap ชิ้นส่วนยังคงแสดงสีเดี่ยว | เดิมสร้าง Three.js Line ด้วย 2 จุดปลายและสีเดียว | ปรับเป็น Line 20 ท่อนย่อยพร้อม `vertexColors: true` ไล่เฉดสีสอดคล้องกับโหมด Solid 3D |
| 24 | เสาในอาคารหลายชั้นแสดงผลแบ่งเป็นก้อนสีแยกตามชั้น และมีรอยต่อสีคมชัดตรงจุดต่อระดับพื้น (Discontinuous Joint Step) | เสาแต่ละชั้นสร้างเป็น member แยกกันใน FEM เมื่อแรงตามแนวแกน $N$ หรือ demand คงที่ตลอดความยาวท่อน ทำให้แต่ละชั้นได้สีเดียวทึบทั้งท่อน และตัดกันกะทันหันตรงจุดต่อพื้น | เพิ่ม `getContinuousColumnStackValue` ใน `static/building.js` เชื่อมเสาแนวดิ่งทุกชั้นเป็น Column Stack เฉลี่ยค่าที่จุดต่อระหว่างชั้น ($C^0$ continuity) และคำนวณการไล่เรียงเฉดสีแบบ Cascading Gradient จากยอดอาคารถึงฐานรากเสมือนเป็นเสาต้นเดียวกัน |

## 8. รายการเสี่ยงที่ยังค้าง (พบจากการตรวจโค้ด 0.9.2 — ยังไม่แก้)
- `design_rc25.py`: fallback เงียบ `lu=3000 mm`, `span=4.0 m`, `fy_steel=245` เมื่อข้อมูลขาด (ละเมิดกฎ 11)
- `design_rc25.py`: จัดกลุ่มพื้นด้วย `(s.get('dead') or 1.0)` ทำให้ dead=0 ถูกแทนด้วย 1.0
- `design_rc25.py`: ออกแบบแบบ "กลุ่มตาม label" ใช้ค่า governing ของกลุ่ม — ตรวจให้แน่ว่ากลุ่มคาน/เสาที่ต่างชั้น/ต่างโหลดไม่ถูกสรุปด้วย rep (ตัวแทน) ตัวแรกในส่วนที่ใช้ค่า `rep.get(...)`
- `server.py`: ไม่มีการลบไฟล์ใน `static/reports/` และ `/api/export-pdf` สร้างไฟล์ใหม่ทุกครั้ง
- `static/app.js` ~265 KB ไฟล์เดียว ความเสี่ยงชนกันเมื่อ agent หลายตัวแก้พร้อมกัน → ให้แยกฟีเจอร์ใหม่ไปโมดูลใหม่
- ไฟล์ scratch ใน root (`scratch_*.py`, `scratch_*.png`, `scratch_warehouse.json`) ถูก track อยู่ ควรย้ายออก/ลบเมื่อยืนยันแล้ว

- **[ต้องตัดสินใจ] การถ่ายแรงพื้นสองทางเป็นแบบ "เฉลี่ย UDL"** (ผลรวมแรงถูกต้อง 100% ตรวจแล้ว: 93.12 kN ทั้ง one-way/two-way, Y-up/Z-up) แต่คานด้านสั้นรับโหลดสามเหลี่ยม ใช้ UDL เฉลี่ย wLs/4 แทนค่าเทียบเท่าโมเมนต์ wLs/3 → โมเมนต์คานด้านสั้นต่ำกว่าจริงประมาณ 20–25% (ฝั่งไม่ปลอดภัย) แก้ได้ด้วยแรงเทียบเท่าตามมาตรฐาน แต่จะทำให้การตรวจสมดุลแรงรวมต้องปรับ — ยังไม่แก้ รอผู้ใช้ยืนยัน
- `continuousGroup` ใช้เป็นป้ายกลุ่มเท่านั้น ไม่มีผลต่อการวิเคราะห์ (ความต่อเนื่องมาจากโหนดร่วม) และไม่มีผลต่อการออกแบบ
- สีแผนภาพ/โหมดสีแสดง **ขนาด** |ค่า| ไม่แสดงเครื่องหมาย (sagging/hogging) ข้อเสนอ: ใช้สีแยกขั้ว (น้ำเงิน=ท้องคาน, แดง=หัวเสา)
- ผลออกแบบ D/C ของคานในแบ็กเอนด์ยังไม่รวมแรงเฉือน; กราฟ 2D ด้านขวา (`drawDiagram`) เริ่มที่ Mz เสมอ ผู้ใช้ Z-up ต้องเลือก My เอง

## 7. งานแนะนำถัดไป
Auto-load จากแรงลม/แผ่นดินไหว (มยผ. 1311/1301), ออกแบบพื้นและฐานราก, P-Delta, undo สำหรับ wizard, เทสต์ E2E อัตโนมัติ
