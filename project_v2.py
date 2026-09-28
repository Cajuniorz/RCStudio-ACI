"""Building input schema. Canonical values always m, kN and MPa.

Floor load transfer is not slab stiffness/design. Foundation geometry does not
replace the explicitly assigned nodal supports. Unsupported behavior blocks solve.
"""
import copy
import numpy as np
from engine import shape, number, identifier, fail, validate as validate_frame

ROOT_FIELDS = 'schemaVersion canonicalUnits displayUnits name material steel nodes members nodalLoads memberLoads combinations selfWeight slabs foundations'
MEMBER_FIELDS = 'id i j b h rotation kind sectionType A Iy Iz J roofType behavior'
SLAB_FIELDS = 'id type nodes thickness weightMode selfLoad dead live mode support1 support2 note'
FOUNDATION_FIELDS = 'id type nodes bx bz depth embedment qa pileCount pileCapacity pileLength mode note'
FLOOR_TYPES = ('one_way','two_way','precast','flat_slab','ribbed','waffle','post_tension','steel_deck','custom')
FOUNDATION_TYPES = ('isolated','combined','strip','raft','pile_cap','pile','custom')
ROOF_TYPES = ('gable','hip','mono','flat','truss','spaceframe','curved','custom')


def migrate(data):
    if not isinstance(data, dict):
        fail('Project object required')
    if data.get('schemaVersion') == 2:
        return copy.deepcopy(data)
    validate_frame(data, draft=True)
    p = copy.deepcopy(data)
    p.update(schemaVersion=2, canonicalUnits='m-kN-MPa', displayUnits={'system':'thai','force':'kgf'},
             steel={'E':200000,'nu':.3,'density':77}, slabs=[], foundations=[])
    nodes={n['id']:n for n in p['nodes']}
    for m in p['members']:
        a,b=nodes[m['i']],nodes[m['j']]
        kind='column' if a['x']==b['x'] and a['z']==b['z'] else 'beam'
        m.update(kind=kind, sectionType='rc_rect', A=None, Iy=None, Iz=None, J=None, roofType='custom', behavior='frame')
    return p


def core_project(p):
    keys='name material nodes nodalLoads memberLoads combinations selfWeight'.split()
    core={k:copy.deepcopy(p[k]) for k in keys}
    core['schemaVersion']=1
    core['members']=[{k:copy.deepcopy(m[k]) for k in 'id i j b h rotation'.split()} for m in p['members']]
    return core


def validate_project(p, draft=True):
    if not isinstance(p, dict):
        fail('Project object required')
    allowed_roots = set(ROOT_FIELDS.split())
    if 'designBasis' in p:
        allowed_roots.add('designBasis')
    if set(p.keys()) != allowed_roots:
        fail(f'Project v2: required fields: {ROOT_FIELDS}; unknown fields are not supported')
    if 'designBasis' in p and p['designBasis'] is not None:
        shape(p['designBasis'], 'fc_mpa fy_mpa fyt_mpa cover_mm agg_mm stirrup_mm', 'Design basis')
        for k, v in p['designBasis'].items():
            if v is not None:
                number(v, f'Design basis {k}')
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
        if m_keys != set(MEMBER_FIELDS.split()):
            fail(f'Member v2: required fields: {MEMBER_FIELDS}; unknown fields are not supported')
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
            shape(e,fields,collection)
            identifier(e['id'],collection)
            if e['id'] in seen: fail(f'Duplicate {collection} ID')
            seen.add(e['id'])
            if e['type'] not in types: fail(f'Unsupported {collection} type')
            if not isinstance(e['nodes'],list) or len(e['nodes'])>100 or any(not isinstance(n,str) or n not in ids for n in e['nodes']):
                fail(f'{e["id"]}: node reference not found')
            if len(set(e['nodes']))!=len(e['nodes']): fail(f'{e["id"]}: duplicate node references')
            if not isinstance(e['note'],str) or len(e['note'])>500: fail('Note: maximum 500 characters')
            for k in nums:
                if e[k] is not None: number(e[k],f'{e["id"]}.{k}')
            if collection=='slabs':
                if e['mode'] not in ('pending','one_way_load') or e['weightMode'] not in ('volume','manual'):
                    fail('Unsupported floor analysis/weight mode')
                for k in ('support1','support2'):
                    if not isinstance(e[k],str) or e[k] and e[k] not in member_ids:
                        fail(f'{e["id"]}: supporting member not found')
            elif e['mode'] not in ('pending','ideal_support'):
                fail('Unsupported foundation analysis mode')
    return core


def rectangle(nodes, label):
    if len(nodes)!=4:
        fail(f'{label}: one-way transfer requires four ordered corners')
    points=np.array(nodes,dtype=float)
    if np.ptp(points[:,1])>1e-7:
        fail(f'{label}: floor must be horizontal')
    edges=np.roll(points,-1,axis=0)-points
    lengths=np.linalg.norm(edges,axis=1)
    if min(lengths)<1e-4 or np.linalg.norm(edges[0]+edges[2])>1e-7 or np.linalg.norm(edges[1]+edges[3])>1e-7:
        fail(f'{label}: floor must be a rectangle in perimeter order')
    if abs(np.dot(edges[0],edges[1]))>1e-8*lengths[0]*lengths[1]:
        fail(f'{label}: non-rectangular one-way transfer is not supported')
    return points, float(lengths[0]*lengths[1])


def overlap(a,b):
    if abs(a[0,1]-b[0,1])>1e-7: return False
    for points in (a,b):
        for i in (0,1):
            v=points[(i+1)%4,[0,2]]-points[i,[0,2]]
            axis=np.array([-v[1],v[0]])/np.linalg.norm(v)
            pa=a[:,[0,2]]@axis;pb=b[:,[0,2]]@axis
            if min(max(pa),max(pb))-max(min(pa),min(pb))<=1e-7:return False
    return True


def prepare(p):
    core=validate_project(p)
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
    for slab in p['slabs']:
        sid=slab['id']
        if slab['mode']!='one_way_load':
            fail(f'{sid}: floor data recorded, analysis pending. Select a verified one-way load transfer model or complete its analysis method.')
        if slab['type'] not in ('one_way','precast','steel_deck','custom'):
            fail(f'{sid}: selected floor type cannot use one-way transfer in this version')
        pts,area=rectangle([coords[n] for n in slab['nodes']],sid)
        if any(overlap(pts,previous) for previous in rectangles):fail(f'{sid}: overlapping floor panels would double-count load')
        rectangles.append(pts)
        number(slab['thickness'],f'{sid}.thickness (m)',.001,5)
        number(slab['dead'],f'{sid}.additional dead (kN/m2)',0,10000)
        number(slab['live'],f'{sid}.live (kN/m2)',0,10000)
        if slab['weightMode']=='volume':
            if slab['type']!='one_way':fail(f'{sid}: this floor needs explicit selfLoad; solid concrete density cannot be assumed')
            self_load=slab['thickness']*p['material']['density']
        else:
            number(slab['selfLoad'],f'{sid}.selfLoad (kN/m2)',0,10000)
            self_load=slab['selfLoad']
        support_ids=[slab['support1'],slab['support2']]
        if '' in support_ids or len(set(support_ids))!=2:fail(f'{sid}: select two different opposite supporting beams')
        edges=[{slab['nodes'][i],slab['nodes'][(i+1)%4]} for i in range(4)]
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
                loads[key]['qy']+=q
                force=np.array([0,q*length,0]);generated_force+=force;generated_moment+=np.cross((a+b)/2,force)
                provenance.append({'source':sid,'member':m['id'],'case':case,'areaM2':area,'pressureKNm2':pressure,'qyKNm':q,'formula':'q = -(self + additional pressure) * area / (2 * beam length)'})
            expected=np.array([0,-total,0]);expected_m=np.cross(pts.mean(axis=0),expected)
            if not np.allclose(generated_force,expected,atol=1e-8,rtol=1e-9) or not np.allclose(generated_moment,expected_m,atol=1e-8,rtol=1e-9):fail(f'{sid}: floor transfer force/moment mismatch')
        coverage.append({'id':sid,'kind':'slab','status':'LOAD_TRANSFER_ONLY','detail':'One-way simply supported tributary transfer; no plate stiffness, diaphragm or RC capacity'})
    core['memberLoads']=list(loads.values())
    linked=set();node_map={n['id']:n for n in p['nodes']}
    for f in p['foundations']:
        fid=f['id']
        if f['mode']!='ideal_support':fail(f'{fid}: foundation support idealization is pending')
        if not f['nodes']:fail(f'{fid}: assign supported nodes')
        if np.ptp([coords[n][1] for n in f['nodes']])>1e-7:fail(f'{fid}: linked support nodes must be at one elevation')
        for n in f['nodes']:
            if n in linked:fail(f'{fid}: node {n} already belongs to another foundation')
            if not any(node_map[n]['restraints'][:3]):fail(f'{fid}: node {n} needs an explicit translational restraint')
            linked.add(n)
        for key in ('bx','bz','depth'):number(f[key],f'{fid}.{key} (m)',.01,10000)
        for key in ('qa','pileCapacity','pileLength','embedment'):
            if f[key] is not None:number(f[key],f'{fid}.{key}',0,1e8)
        if f['pileCount'] is not None and (type(f['pileCount']) is not int or f['pileCount']<0):fail(f'{fid}: pileCount must be a nonnegative integer')
        coverage.append({'id':fid,'kind':'foundation','status':'IDEAL_SUPPORT_ONLY','detail':'Uses explicit node restraints. Geometry, soil and pile inputs are records, not soil/pile stiffness or capacity; foundation self weight excluded from superstructure model.'})
    return core,overrides,{'components':coverage,'floorLoadTransfers':provenance,'foundationDefinitions':copy.deepcopy(p['foundations'])}
