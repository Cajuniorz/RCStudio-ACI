"""Building input schema. Canonical values always m, kN and MPa.

Floor load transfer is not slab stiffness/design. Foundation geometry does not
replace the explicitly assigned nodal supports. Unsupported behavior blocks solve.
"""
import copy
import re
import numpy as np
from engine import shape, number, identifier, fail, validate as validate_frame

ROOT_FIELDS = 'schemaVersion canonicalUnits displayUnits name material steel nodes members nodalLoads memberLoads combinations selfWeight slabs foundations'
MEMBER_FIELDS = 'id i j b h rotation kind sectionType A Iy Iz J roofType behavior'
SLAB_FIELDS = 'id type nodes thickness weightMode selfLoad dead live mode support1 support2 note'
FOUNDATION_FIELDS = 'id type nodes bx bz depth embedment qa pileCount pileCapacity pileLength mode note'
FLOOR_TYPES = ('one_way','two_way','precast','flat_slab','ribbed','waffle','post_tension','steel_deck','custom')
FOUNDATION_TYPES = ('isolated','combined','strip','raft','pile_cap','pile','custom')
ROOF_TYPES = ('gable','hip','mono','flat','truss','spaceframe','curved','custom','lean_to','shed')


def migrate(data):
    if not isinstance(data, dict):
        fail('Project object required')
    if data.get('schemaVersion') == 2:
        return copy.deepcopy(data)
    validate_frame(data, draft=True)
    p = copy.deepcopy(data)
    p.update(schemaVersion=2, canonicalUnits='m-kN-MPa', displayUnits={'system':'thai','force':'kgf'},
             steel={'E':200000,'nu':.3,'density':77}, slabs=[], foundations=[], gridLines={'x':[],'z':[]})
    nodes={n['id']:n for n in p['nodes']}
    is_z_up = (p.get('coordinateSystem') == 'z-up')
    for m in p['members']:
        a,b=nodes[m['i']],nodes[m['j']]
        kind='column' if (a['x']==b['x'] and (a['y']==b['y'] if is_z_up else a['z']==b['z'])) else 'beam'
        m.update(kind=kind, sectionType='rc_rect', A=None, Iy=None, Iz=None, J=None, roofType='custom', behavior='frame')
    return p


def core_project(p):
    keys='name material nodes nodalLoads memberLoads combinations selfWeight'.split()
    core={k:copy.deepcopy(p[k]) for k in keys}
    core['schemaVersion']=1
    core['members']=[{k:copy.deepcopy(m[k]) for k in 'id i j b h rotation'.split()} for m in p['members']]
    if 'coordinateSystem' in p:
        core['coordinateSystem'] = p['coordinateSystem']
    return core


def validate_project(p, draft=True):
    if not isinstance(p, dict):
        fail('Project object required')
    sanitize_v2_project(p)
    allowed_roots = set(ROOT_FIELDS.split())
    if 'designBasis' in p:
        allowed_roots.add('designBasis')
    if 'stairs' in p:
        allowed_roots.add('stairs')
    if 'gridLines' in p:
        allowed_roots.add('gridLines')
    if 'roofSheeting' in p:
        allowed_roots.add('roofSheeting')
    if 'coordinateSystem' in p:
        allowed_roots.add('coordinateSystem')
    if set(p.keys()) != allowed_roots:
        fail(f'Project v2: required fields: {ROOT_FIELDS}; unknown fields are not supported')
    if 'gridLines' in p:
        grid_keys = set(p['gridLines'].keys())
        if grid_keys not in ({'x', 'y'}, {'x', 'z'}, {'x', 'y', 'z'}):
            fail('Grid lines: required axes x and y (or x and z)')
        for axis in [a for a in ('x', 'y', 'z') if a in p['gridLines']]:
            rows=p['gridLines'][axis]
            if not isinstance(rows,list) or len(rows)>20:
                fail(f'Grid lines {axis}: maximum 20 axes')
            labels=set();values=[]
            for row in rows:
                shape(row,'label value',f'Grid line {axis}')
                label=row['label']
                if not isinstance(label,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,12}',label):
                    fail(f'Grid line {axis}: label must be 1-12 ASCII letters/digits/_/-')
                if label.lower() in labels:fail(f'Grid lines {axis}: duplicate label {label}')
                labels.add(label.lower())
                values.append(number(row['value'],f'Grid line {axis}.{label} (m)',-10000,10000))
            if any(b-a<.001 for a,b in zip(values,values[1:])):
                fail(f'Grid lines {axis}: coordinates must increase by at least 0.001 m')
    if 'designBasis' in p and p['designBasis'] is not None:
        basis = p['designBasis']
        required = set('fc_mpa fy_mpa fyt_mpa cover_mm agg_mm stirrup_mm'.split())
        if not isinstance(basis, dict) or not required.issubset(basis) or set(basis)-required-{'fy_steel_mpa'}:
            fail('Design basis: required RC fields; only optional fy_steel_mpa is supported')
        for k, v in basis.items():
            if v is not None:
                number(v, f'Design basis {k}', 0.001 if k == 'fy_steel_mpa' else None)
    if type(p['schemaVersion']) is not int or p['schemaVersion'] != 2 or p['canonicalUnits'] != 'm-kN-MPa':
        fail('Unsupported schema or canonical units')
    shape(p['displayUnits'],'system force','Display units')
    if p['displayUnits']['system'] not in ('thai','si') or p['displayUnits']['force'] not in ('kgf','tf'):
        fail('Unsupported display units')
    shape(p['steel'],'E nu density','Steel')
    for value in p['steel'].values():
        if value is not None:
            number(value,'Steel property')
    if not isinstance(p['members'],list):
        fail('members must be an array')
    for m in p['members']:
        m_keys = set(m.keys())
        m_keys.discard('roofRole')
        m_keys.discard('role')
        m_keys.discard('continuousGroup')
        if m_keys != set(MEMBER_FIELDS.split()):
            fail(f'Member v2: required fields: {MEMBER_FIELDS}; unknown fields are not supported')
        if m.get('continuousGroup') is not None and (not isinstance(m['continuousGroup'], str) or len(m['continuousGroup']) > 64):
            fail(f'{m["id"]}: continuousGroup must be a string up to 64 chars')
        if m['kind'] not in ('beam','column','roof') or m['sectionType'] not in ('rc_rect','steel_custom') or m['roofType'] not in ROOF_TYPES or m['behavior'] not in ('frame','truss'):
            fail('Unsupported member classification')
        for k in ('A','Iy','Iz','J'):
            if m[k] is not None:
                number(m[k],f'{m["id"]}.{k}')
    core=core_project(p)
    validate_frame(core,draft=True)
    ids={n['id'] for n in p['nodes']}
    member_ids={m['id'] for m in p['members']}
    for collection,fields,types,nums in [
        ('slabs',SLAB_FIELDS,FLOOR_TYPES,('thickness','selfLoad','dead','live')),
        ('foundations',FOUNDATION_FIELDS,FOUNDATION_TYPES,('bx','bz','depth','embedment','qa','pileCount','pileCapacity','pileLength'))]:
        if not isinstance(p[collection],list) or len(p[collection])>100:
            fail(f'{collection}: maximum 100 items')
        seen=set()
        for e in p[collection]:
            if collection == 'slabs':
                e_keys = set(e.keys())
                e_keys.discard('support3')
                e_keys.discard('support4')
                if e_keys != set(fields.split()):
                    fail(f'slabs: required fields: {fields}; unknown fields are not supported')
            elif collection == 'foundations':
                e_keys = set(e.keys())
                e_keys.discard('by')
                if e_keys != set(fields.split()):
                    fail(f'foundations: required fields: {fields}; unknown fields are not supported')
            else:
                shape(e, fields, collection)
            identifier(e['id'], collection)
            if e['id'] in seen: fail(f'Duplicate {collection} ID')
            seen.add(e['id'])
            if e['type'] not in types: fail(f'Unsupported {collection} type')
            if not isinstance(e['nodes'], list) or len(e['nodes']) > 100 or any(not isinstance(n, str) or n not in ids for n in e['nodes']):
                fail(f'{e["id"]}: node reference not found')
            if len(set(e['nodes'])) != len(e['nodes']): fail(f'{e["id"]}: duplicate node references')
            if not isinstance(e['note'], str) or len(e['note']) > 500: fail('Note: maximum 500 characters')
            for k in (*nums, 'by'):
                if e.get(k) is not None: number(e[k], f'{e["id"]}.{k}')
            if collection == 'slabs':
                if e['mode'] not in ('pending', 'one_way_load', 'two_way_load') or e['weightMode'] not in ('volume', 'manual'):
                    fail('Unsupported floor analysis/weight mode')
                sup_keys = ('support1', 'support2', 'support3', 'support4') if e['mode'] == 'two_way_load' else ('support1', 'support2')
                for k in sup_keys:
                    if k in e and (not isinstance(e[k], str) or (e[k] and e[k] not in member_ids)):
                        fail(f'{e["id"]}: supporting member not found')
            elif e['mode'] not in ('pending','ideal_support'):
                fail('Unsupported foundation analysis mode')
    return core


def rectangle(nodes, label, is_z_up=None):
    if len(nodes)!=4:
        fail(f'{label}: one-way transfer requires four ordered corners')
    points=np.array(nodes,dtype=float)
    if is_z_up is None:
        is_z_up = np.ptp(points[:,2]) <= 1e-7 and np.ptp(points[:,1]) > 1e-7
    elev_idx = 2 if is_z_up else 1
    if np.ptp(points[:,elev_idx])>1e-7:
        fail(f'{label}: floor must be horizontal')
    edges=np.roll(points,-1,axis=0)-points
    lengths=np.linalg.norm(edges,axis=1)
    if min(lengths)<1e-4 or np.linalg.norm(edges[0]+edges[2])>1e-7 or np.linalg.norm(edges[1]+edges[3])>1e-7:
        fail(f'{label}: floor must be a rectangle in perimeter order')
    if abs(np.dot(edges[0],edges[1]))>1e-8*lengths[0]*lengths[1]:
        fail(f'{label}: non-rectangular one-way transfer is not supported')
    return points, float(lengths[0]*lengths[1])


def overlap(a,b, is_z_up=None):
    if is_z_up is None:
        is_z_up = np.ptp(a[:,2]) <= 1e-7 and np.ptp(b[:,2]) <= 1e-7 and (np.ptp(a[:,1]) > 1e-7 or np.ptp(b[:,1]) > 1e-7)
    elev_idx = 2 if is_z_up else 1
    plane_idx = [0, 1] if is_z_up else [0, 2]
    if abs(a[0,elev_idx]-b[0,elev_idx])>1e-7: return False
    for points in (a,b):
        for i in (0,1):
            v=points[(i+1)%4,plane_idx]-points[i,plane_idx]
            axis=np.array([-v[1],v[0]])/np.linalg.norm(v)
            pa=a[:,plane_idx]@axis;pb=b[:,plane_idx]@axis
            if min(max(pa),max(pb))-max(min(pa),min(pb))<=1e-7:return False
    return True


def sanitize_v2_project(p):
    if not isinstance(p, dict) or 'nodes' not in p or 'members' not in p:
        return p, []
    for m in p.get('members', []):
        if not isinstance(m, dict):
            continue
        if 'kind' not in m:
            m['kind'] = 'beam'
        if 'sectionType' not in m:
            m['sectionType'] = 'rc_rect' if m.get('kind') != 'roof' else 'steel_custom'
        if 'rotation' not in m:
            m['rotation'] = 0
        if 'A' not in m:
            m['A'] = None
        if 'Iy' not in m:
            m['Iy'] = None
        if 'Iz' not in m:
            m['Iz'] = None
        if 'J' not in m:
            m['J'] = None
        if 'roofType' not in m:
            m['roofType'] = 'custom'
        if 'behavior' not in m:
            m['behavior'] = 'frame'
    used = set()
    for m in p.get('members', []):
        used.add(m.get('i'))
        used.add(m.get('j'))
    for s in p.get('slabs', []):
        for nid in s.get('nodes', []):
            used.add(nid)
    for f in p.get('foundations', []):
        for nid in f.get('nodes', []):
            used.add(nid)
    for l in p.get('nodalLoads', []):
        if any(l.get(k) for k in ('fx','fy','fz','mx','my','mz')):
            used.add(l.get('node'))

    pruned = []
    active_nodes = []
    for n in p.get('nodes', []):
        nid = n.get('id')
        has_restraints = any(n.get('restraints', []))
        if nid in used or has_restraints:
            active_nodes.append(n)
        else:
            pruned.append(nid)

    if pruned:
        p['nodes'] = active_nodes
        if 'nodalLoads' in p:
            p['nodalLoads'] = [l for l in p['nodalLoads'] if l.get('node') not in pruned]

    return p, pruned


def prepare(p):
    p, pruned_nodes = sanitize_v2_project(p)
    core=validate_project(p)
    if p.get('stairs'):
        fail('บันได/stairs: ยังไม่ถ่ายน้ำหนักพื้นทางลาดและชานพักเข้าสู่โมเดลวิเคราะห์; หยุดวิเคราะห์เพื่อไม่ให้ผลโหลดและการออกแบบผิด กรุณาแยกโมเดลที่ไม่มีบันไดหรือรอวิธีถ่ายแรงที่ตรวจสอบแล้ว')
    overrides={}
    for m in p['members']:
        if m['behavior']!='frame' or (m['kind']=='roof' and m['roofType'] in ('truss','spaceframe')):
            fail(f'{m["id"]}: truss behavior is pending; frame behavior cannot substitute for a truss')
        if m['sectionType']=='steel_custom':
            props={k:m[k] for k in ('A','Iy','Iz','J')}
            for k,v in props.items(): number(v,f'{m["id"]}.{k}',1e-14,1000)
            s=p['steel'];number(s['E'],'Steel E',1,1e6);number(s['nu'],'Steel nu',0,.49);number(s['density'],'Steel density',0,1000)
            overrides[m['id']]={'section':props,'material':s}
    # Validate original manual loads before combining generated loads.
    coords,_=validate_frame(core, section_overrides=overrides)
    member_map={m['id']:m for m in p['members']}
    loads={(l['member'],l['case']):copy.deepcopy(l) for l in core['memberLoads']}
    provenance=[];coverage=[];rectangles=[]
    for pid in pruned_nodes:
        coverage.append({'id': pid, 'kind': 'node', 'status': 'PRUNED_ORPHAN',
                         'detail': f'ตัดโหนดลอยอิสระ {pid} ออกจากการคำนวณเนื่องจากไม่มีชิ้นส่วนเชื่อมต่อ'})
    is_z_up = (p.get('coordinateSystem') == 'z-up')
    force_axis = 2 if is_z_up else 1
    q_key = 'qz' if is_z_up else 'qy'
    elev_axis_name = 'Z' if is_z_up else 'Y'
    for slab in p['slabs']:
        sid=slab['id']
        if slab['mode'] not in ('one_way_load', 'two_way_load'):
            fail(f'{sid}: floor data recorded, analysis pending. Select a verified one-way or two-way load transfer model or complete its analysis method.')
        if slab['mode'] == 'one_way_load':
            if slab['type'] not in ('one_way', 'precast', 'steel_deck', 'custom'):
                fail(f'{sid}: selected floor type cannot use one-way transfer in this version')
        elif slab['mode'] == 'two_way_load':
            if slab['type'] not in ('two_way', 'custom'):
                fail(f'{sid}: selected floor type cannot use two-way transfer in this version')
        if (not slab.get('nodes') or len(slab.get('nodes', [])) != 4) and slab.get('mode') in ('one_way_load', 'two_way_load'):
            inferred = None
            if slab['mode'] == 'one_way_load':
                s1 = member_map.get(slab.get('support1'))
                s2 = member_map.get(slab.get('support2'))
                if s1 and s2 and s1['i'] in coords and s1['j'] in coords and s2['i'] in coords and s2['j'] in coords:
                    n1, n2 = s1['i'], s1['j']
                    n3, n4 = s2['i'], s2['j']
                    c2, c3, c4 = coords[n2], coords[n3], coords[n4]
                    if np.linalg.norm(c2 - c4) < np.linalg.norm(c2 - c3):
                        inferred = [n1, n2, n4, n3]
                    else:
                        inferred = [n1, n2, n3, n4]
            elif slab['mode'] == 'two_way_load':
                s_ids = [slab.get(k, '') for k in ('support1', 'support2', 'support3', 'support4')]
                if all(sid in member_map for sid in s_ids):
                    b_list = [member_map[sid] for sid in s_ids]
                    first = b_list[0]
                    curr_node = first['j']
                    loop_nodes = [first['i'], first['j']]
                    remaining = b_list[1:]
                    for _ in range(2):
                        nxt = next((b for b in remaining if b['i'] == curr_node or b['j'] == curr_node), None)
                        if nxt:
                            curr_node = nxt['j'] if nxt['i'] == curr_node else nxt['i']
                            loop_nodes.append(curr_node)
                            remaining.remove(nxt)
                    if len(loop_nodes) == 4:
                        inferred = loop_nodes
            if inferred and len(set(inferred)) == 4:
                slab['nodes'] = inferred
        pts,area=rectangle([coords[n] for n in slab['nodes']],sid,is_z_up=is_z_up)
        if any(overlap(pts,previous,is_z_up=is_z_up) for previous in rectangles):fail(f'{sid}: overlapping floor panels would double-count load')
        rectangles.append(pts)
        number(slab['thickness'],f'{sid}.thickness (m)',.001,5)
        number(slab['dead'],f'{sid}.additional dead (kN/m2)',0,10000)
        number(slab['live'],f'{sid}.live (kN/m2)',0,10000)
        if slab['weightMode']=='volume':
            if slab['type'] not in ('one_way', 'two_way'):fail(f'{sid}: this floor needs explicit selfLoad; solid concrete density cannot be assumed')
            self_load=slab['thickness']*p['material']['density']
        else:
            number(slab['selfLoad'],f'{sid}.selfLoad (kN/m2)',0,10000)
            self_load=slab['selfLoad']
        edges=[{slab['nodes'][i],slab['nodes'][(i+1)%4]} for i in range(4)]
        edge_lengths=[float(np.linalg.norm(coords[slab['nodes'][(i+1)%4]]-coords[slab['nodes'][i]])) for i in range(4)]

        if slab['mode'] == 'two_way_load':
            support_ids=[slab.get(k,'') for k in ('support1','support2','support3','support4')]
            if any(s=='' for s in support_ids) or len(set(support_ids))!=4:
                fail(f'{sid}: select four distinct supporting beams for two-way load transfer')
            edge_to_beam={}
            for mid in support_ids:
                m=member_map[mid]
                if m['kind']!='beam':fail(f'{sid}: {mid} must be classified as beam')
                ends={m['i'],m['j']}
                if ends not in edges:fail(f'{sid}: {mid} must cover one complete floor edge')
                edge_to_beam[edges.index(ends)]=m
            if len(edge_to_beam)!=4:fail(f'{sid}: all four perimeter edges must be supported by beams')

            Ls = min(edge_lengths[0], edge_lengths[1])
            Ll = max(edge_lengths[0], edge_lengths[1])
            for case,pressure in [('D',self_load+slab['dead']),('L',slab['live'])]:
                total=pressure*area;generated_force=np.zeros(3);generated_moment=np.zeros(3)
                for e_idx in range(4):
                    m=edge_to_beam[e_idx]
                    L_edge=edge_lengths[e_idx]
                    if abs(L_edge - Ls) < 1e-5:
                        q = -(pressure * Ls) / 4.0
                    else:
                        q = -(pressure * Ls / 2.0) * (1.0 - Ls / (2.0 * Ll))
                    key=(m['id'],case)
                    if key not in loads:loads[key]={'member':m['id'],'case':case,'qx':0,'qy':0,'qz':0}
                    loads[key][q_key]+=q
                    a,b=coords[m['i']],coords[m['j']]
                    force=np.zeros(3); force[force_axis]=q*L_edge
                    generated_force+=force
                    generated_moment+=np.cross((a+b)/2,force)
                    provenance.append({'source':sid,'member':m['id'],'case':case,'areaM2':area,'pressureKNm2':pressure,'qzKNm':q if is_z_up else 0,'qyKNm':q if not is_z_up else 0,'formula':'Two-way 45 deg tributary load (triangular/trapezoidal)'})
                expected=np.zeros(3); expected[force_axis]=-total; expected_m=np.cross(pts.mean(axis=0),expected)
                if not np.allclose(generated_force,expected,atol=1e-8,rtol=1e-9) or not np.allclose(generated_moment,expected_m,atol=1e-8,rtol=1e-9):fail(f'{sid}: floor transfer force/moment mismatch')
            coverage.append({'id':sid,'kind':'slab','status':'LOAD_TRANSFER_ONLY','detail':'Two-way tributary transfer (45 deg triangular/trapezoidal); no plate stiffness, diaphragm or RC capacity'})
        else:
            support_ids=[slab['support1'],slab['support2']]
            if '' in support_ids or len(set(support_ids))!=2:fail(f'{sid}: select two different opposite supporting beams')
            edge_indices=[];supports=[]
            for mid in support_ids:
                m=member_map[mid]
                if m['kind']!='beam':fail(f'{sid}: {mid} must be classified as beam')
                ends={m['i'],m['j']}
                if ends not in edges:fail(f'{sid}: {mid} must cover one complete floor edge')
                edge_indices.append(edges.index(ends));supports.append(m)
            if (edge_indices[0]-edge_indices[1])%4!=2:fail(f'{sid}: supporting edges must be opposite')
            for case,pressure in [('D',self_load+slab['dead']),('L',slab['live'])]:
                total=pressure*area;generated_force=np.zeros(3);generated_moment=np.zeros(3)
                for m in supports:
                    a,b=coords[m['i']],coords[m['j']];length=float(np.linalg.norm(b-a));q=-total/(2*length)
                    key=(m['id'],case)
                    if key not in loads:loads[key]={'member':m['id'],'case':case,'qx':0,'qy':0,'qz':0}
                    loads[key][q_key]+=q
                    force=np.zeros(3); force[force_axis]=q*length; generated_force+=force;generated_moment+=np.cross((a+b)/2,force)
                    provenance.append({'source':sid,'member':m['id'],'case':case,'areaM2':area,'pressureKNm2':pressure,'qzKNm':q if is_z_up else 0,'qyKNm':q if not is_z_up else 0,'formula':'q = -(self + additional pressure) * area / (2 * beam length)'})
                expected=np.zeros(3); expected[force_axis]=-total; expected_m=np.cross(pts.mean(axis=0),expected)
                if not np.allclose(generated_force,expected,atol=1e-8,rtol=1e-9) or not np.allclose(generated_moment,expected_m,atol=1e-8,rtol=1e-9):fail(f'{sid}: floor transfer force/moment mismatch')
            coverage.append({'id':sid,'kind':'slab','status':'LOAD_TRANSFER_ONLY','detail':'One-way simply supported tributary transfer; no plate stiffness, diaphragm or RC capacity'})
    core['memberLoads']=list(loads.values())
    linked=set();node_map={n['id']:n for n in p['nodes']}
    for f in p['foundations']:
        fid=f['id']
        if f['mode']!='ideal_support':fail(f'{fid}: foundation support idealization is pending')
        if not f['nodes']:fail(f'{fid}: assign supported nodes')
        if np.ptp([coords[n][force_axis] for n in f['nodes']])>1e-7:fail(f'{fid}: linked support nodes must be at one elevation')
        for n in f['nodes']:
            if n in linked:fail(f'{fid}: node {n} already belongs to another foundation')
            if not any(node_map[n]['restraints'][:3]):fail(f'{fid}: node {n} needs an explicit translational restraint')
            if coords[n][force_axis] > 0.1:
                fail(f'{fid}: ฐานรากไม่สามารถอยู่บนโหนดลอยฟ้า {n} ({elev_axis_name}={coords[n][force_axis]:.3f}m) ได้ กรุณาผูกฐานรากกับโหนดฐานเสาที่ระดับดิน ({elev_axis_name}=0)')
            linked.add(n)
        for key in [k for k in ('bx','by','bz','depth') if k in f]:number(f[key],f'{fid}.{key} (m)',.01,10000)
        for key in ('qa','pileCapacity','pileLength','embedment'):
            if f[key] is not None:number(f[key],f'{fid}.{key}',0,1e8)
        if f['pileCount'] is not None and (type(f['pileCount']) is not int or f['pileCount']<0):fail(f'{fid}: pileCount must be a nonnegative integer')
        coverage.append({'id':fid,'kind':'foundation','status':'IDEAL_SUPPORT_ONLY','detail':'Uses explicit node restraints. Geometry, soil and pile inputs are records, not soil/pile stiffness or capacity; foundation self weight excluded from superstructure model.'})
    elevated_supports = [n['id'] for n in p['nodes'] if (n.get('z', 0) if is_z_up else n.get('y', 0)) > 0.05 and any(n['restraints'])]
    if elevated_supports:
        coverage.append({
            'id': ','.join(elevated_supports),
            'kind': 'support',
            'status': 'ELEVATED_SUPPORT_WARNING',
            'detail': f'พบจุดรองรับลอยฟ้า (Elevated Support) ที่โหนด {", ".join(elevated_supports)} ({elev_axis_name} > 0.05m): จุดรองรับนี้จะดูดซับแรงและโมเมนต์โดยตรง ทำให้น้ำหนักไม่ถ่ายลงเสาและฐานรากตามความเป็นจริง'
        })
    return core,overrides,{'components':coverage,'floorLoadTransfers':provenance,'foundationDefinitions':copy.deepcopy(p['foundations'])}
