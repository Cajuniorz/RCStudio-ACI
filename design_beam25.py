"""ACI CODE-318-25 SI: bounded, singly reinforced rectangular flexural section.

Not a whole-member or whole-building design check. No sampled solver demands
are accepted implicitly. Units are explicit and all missing inputs are errors.
"""
import copy
import hashlib
import json
import math

VERSION = 'beam-flexure-25/0.1'
CODE = 'ACI CODE-318-25 (SI)'
CATALOG = (10, 12, 16, 20, 25, 28, 32)
REFERENCES = [
    {'clause': '20.2.2.1-20.2.2.2', 'printedPage': 411, 'pdfPage': 412, 'topic': 'Nonprestressed reinforcing steel stress-strain and Es'},
    {'clause': '9.3.3.1', 'printedPage': 144, 'pdfPage': 145, 'topic': 'Tension-controlled nonprestressed beams'},
    {'clause': '9.6.1.2', 'printedPage': 149, 'pdfPage': 150, 'topic': 'Minimum flexural reinforcement; no 9.6.1.3 exception used'},
    {'clause': 'Table 20.5.1.3.1', 'printedPage': 421, 'pdfPage': 422, 'topic': 'Protected cast-in-place beam cover'},
    {'clause': 'Table 21.2.2', 'printedPage': 432, 'pdfPage': 433, 'topic': 'Tension-controlled strain and phi'},
    {'clause': '22.2.2 / Table 22.2.2.4.3 / 22.3.1.1', 'printedPage': '438-439', 'pdfPage': '439-440', 'topic': 'Rectangular stress block and section flexure'},
    {'clause': '25.2.1', 'printedPage': 509, 'pdfPage': 510, 'topic': 'Clear spacing of a single horizontal layer'},
]
NOT_CHECKED = [
    'แรงเฉือนและการเลือกขนาด/ระยะปลอก',
    'ระยะฝัง ระยะทาบ จุดตัดเหล็ก และเหล็กต่อเนื่อง/ความสมบูรณ์ของระบบ',
    'การโก่ง รอยร้าว และพฤติกรรมระยะยาวที่ระดับใช้งาน',
    'แรงร่วมตามแนวแกน ดัดสองแกน แรงบิด และแผ่นดินไหว',
    'ความครบถ้วนของโหลดและชุดน้ำหนัก รวมถึงมาตรฐานแรงของพื้นที่โครงการ',
    'ความทนทาน ไฟ และการยอมรับเกรดเหล็กจริงตามข้อ 20.2.1',
    'การเลือกหน้าตัด/วิเคราะห์ซ้ำทั้งอาคาร พื้น เสา ฐานราก และหลังคาเหล็ก',
]


class DesignInputError(ValueError):
    pass


def value(data, name, low, high):
    v = data.get(name)
    if type(v) not in (int, float) or not math.isfinite(v) or not low <= v <= high:
        raise DesignInputError(f'{name}: ต้องระบุค่าจำกัด {low} ถึง {high} ตามหน่วยของช่อง')
    return float(v)


def validate(data):
    if not isinstance(data, dict):
        raise DesignInputError('ต้องเป็นข้อมูลหน้าตัด')
    keys = {'code','name','demandSource','jurisdiction','rebarSpecification','scope','tensionFace',
            'bMm','hMm','fcMPa','fyMPa','coverMm','stirrupMm','aggregateMm','muKNm',
            'axialKN','torsionKNm','minorMomentKNm','clearSpanMm','barDiametersMm'}
    if set(data) != keys:
        raise DesignInputError('ข้อมูลไม่ครบหรือมีฟิลด์ที่ไม่รองรับ: '+', '.join(sorted(set(data)^keys)))
    if data['code'] != CODE:
        raise DesignInputError('โมดูลนี้ตรวจเฉพาะ ACI CODE-318-25 (SI)')
    if data['scope'] != 'protected-normalweight-nonseismic-rectangular':
        raise DesignInputError('รองรับคาน คสล. ตันสี่เหลี่ยม หล่อในที่ คอนกรีตน้ำหนักปกติ ภายในอาคาร ไม่ใช่ระบบต้านแผ่นดินไหว')
    if data['tensionFace'] not in ('top','bottom'):
        raise DesignInputError('ต้องเลือกด้านเหล็กดึง บนหรือใต้คาน')
    for key in ('name','demandSource','jurisdiction','rebarSpecification'):
        if not isinstance(data[key],str) or not 1 <= len(data[key].strip()) <= 300:
            raise DesignInputError(f'{key}: ต้องระบุข้อความที่มา ไม่เกิน 300 ตัวอักษร')
    for key,low,high in [('bMm',100,1500),('hMm',150,900),('fcMPa',17,55),
                         ('fyMPa',200,550),('coverMm',40,150),('stirrupMm',6,16),
                         ('aggregateMm',5,50),('muKNm',.000001,1e5),('clearSpanMm',600,30000)]:
        value(data,key,low,high)
    # A section-only pilot does not approximate the effects of nonzero forces.
    for key in ('axialKN','torsionKNm','minorMomentKNm'):
        if value(data,key,-1e8,1e8) != 0:
            raise DesignInputError(f'{key}: โมดูลแรงดัดล้วนไม่รองรับค่านี้ที่ไม่เป็นศูนย์')
    if data['clearSpanMm'] < 4*data['hMm']:
        raise DesignInputError('ช่วงใสต้องไม่น้อยกว่า 4h ในขอบเขตทดลองนี้; คานลึกไม่รองรับ')
    if min(data['bMm'],data['hMm']) <= 2*(data['coverMm']+data['stirrupMm']):
        raise DesignInputError('หน้าตัดเล็กเกิน cover และปลอก ไม่เหลือพื้นที่ภายในสำหรับเหล็ก')
    bars=data['barDiametersMm']
    if not isinstance(bars,list) or not bars or len(bars)>len(CATALOG) or any(type(d) is not int or d not in CATALOG for d in bars) or len(set(bars))!=len(bars):
        raise DesignInputError('เลือกเบอร์ DB จาก 10, 12, 16, 20, 25, 28, 32 โดยไม่ซ้ำ')
    return data


def beta1(fc):
    return .85 if fc <= 28 else (.65 if fc >= 55 else .85-.05*(fc-28)/7)


def evaluate_candidate(data, diameter, count):
    b,h,fc,fy = (data[k] for k in ('bMm','hMm','fcMPa','fyMPa'))
    edge = data['coverMm']+data['stirrupMm']
    d = h-edge-diameter/2
    clear = (b-2*edge-count*diameter)/(count-1)
    spacing_min = max(25.,diameter,4*data['aggregateMm']/3)
    area = count*math.pi*diameter**2/4
    if d <= 0 or diameter > h-2*edge:
        return None
    as_min=max(.25*math.sqrt(fc)/fy,1.4/fy)*b*d
    a=area*fy/(.85*fc*b)
    c=a/beta1(fc)
    strain=.003*(d-c)/c
    strain_limit=fy/200000+.003
    mn=area*fy*(d-a/2)/1e6
    capacity=.9*mn
    # φ=0.9 is admitted only after verifying tension-controlled behavior.
    if clear+1e-9 < spacing_min or area+1e-9 < as_min or strain+1e-12 < strain_limit or capacity+1e-9 < data['muKNm']:
        return None
    disc=d*d-2*(data['muKNm']*1e6/.9)/(.85*fc*b)
    if disc < 0:
        return None
    as_strength=(.85*fc*b/fy)*(d-math.sqrt(disc))
    return {'count':count,'diameterMm':diameter,'label':f'{count} DB{diameter}',
            'areaMm2':area,'effectiveDepthMm':d,'clearSpacingMm':clear,
            'minimumClearMm':spacing_min,'minimumAreaMm2':as_min,
            'strengthAreaMm2':as_strength,'requiredAreaMm2':max(as_min,as_strength),
            'beta1':beta1(fc),'aMm':a,'cMm':c,'tensileStrain':strain,
            'strainLimit':strain_limit,'phi':.9,'nominalMomentKNm':mn,
            'designMomentKNm':capacity,'utilization':data['muKNm']/capacity}


def design(data):
    validate(data)
    candidates=[]
    for diameter in sorted(data['barDiametersMm']):
        for count in range(2,13):
            candidate=evaluate_candidate(data,diameter,count)
            if candidate:
                candidates.append(candidate)
    candidates.sort(key=lambda c:(c['areaMm2'],c['count'],c['diameterMm']))
    result={'moduleVersion':VERSION,'code':CODE,'status':'FLEXURE_CANDIDATE' if candidates else 'NO_SOLUTION_IN_SEARCH',
            'overallStatus':'NOT_DESIGNED','input':copy.deepcopy(data),
            'inputHash':hashlib.sha256(json.dumps(data,sort_keys=True,allow_nan=False).encode()).hexdigest(),
            'units':'mm, MPa, kN, kN.m; reinforcement area mm2',
            'objective':'พื้นที่เหล็กดึงน้อยที่สุดในชุดที่เลือก → จำนวนเส้นน้อยกว่าเมื่อพื้นที่เท่ากัน; ไม่ใช่ต้นทุนก่อสร้างต่ำสุด',
            'searchSpace':{'diametersMm':sorted(data['barDiametersMm']),'barCount':[2,12],'layers':1,'fixedSection':True},
            'assumptions':['แรงดัดล้วนหนึ่งหน้าตัด หนึ่งทิศ เหล็กดึงชั้นเดียว ไม่คิดเหล็กอัด',
                           'E_s = 200000 MPa; epsilon_cu = 0.003; ไม่มี moment redistribution',
                           'ขนาดปลอกใช้หาระยะ d และพื้นที่วางเหล็กเท่านั้น ยังไม่ได้ออกแบบปลอก',
                           'พื้นที่ DB คิดจากเส้นผ่านศูนย์กลาง nominal; ต้องตรวจเกรดและใบรับรองวัสดุจริง',
                           'รูปเหล็กเป็นแบบหน้าตัดเชิงสัญลักษณ์ ยังไม่ตรวจความพอดีบริเวณโค้งงอปลอกและขอเกี่ยว',
                           'ไม่ใช้ข้อยกเว้นลดเหล็กขั้นต่ำ 9.6.1.3; จำกัด fc 17–55 MPa และ fy 200–550 MPa'],
            'checks':[], 'notChecked':NOT_CHECKED,'references':REFERENCES,
            'selected':candidates[0] if candidates else None,'alternatives':candidates[:8],
            'feasibleCount':len(candidates)}
    if candidates:
        c=candidates[0]
        result['checks']=[
            {'check':'กำลังดัด','status':'PASS','actual':c['designMomentKNm'],'required':data['muKNm'],'unit':'kN.m','clause':'22.3.1.1 / Table 21.2.2'},
            {'check':'พื้นที่เหล็กขั้นต่ำ','status':'PASS','actual':c['areaMm2'],'required':c['minimumAreaMm2'],'unit':'mm2','clause':'9.6.1.2'},
            {'check':'ระยะว่างระหว่างเหล็ก','status':'PASS','actual':c['clearSpacingMm'],'required':c['minimumClearMm'],'unit':'mm','clause':'25.2.1'},
            {'check':'Tension-controlled','status':'PASS','actual':c['tensileStrain'],'required':c['strainLimit'],'unit':'strain','clause':'9.3.3.1 / Table 21.2.2'},
            {'check':'Cover ภายในอาคารตามขอบเขต','status':'PASS','actual':data['coverMm'],'required':40,'unit':'mm','clause':'Table 20.5.1.3.1'},
        ]
    return result
