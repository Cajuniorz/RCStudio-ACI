"""RC Studio 0.1: elastic 3D frame adapter. Internal units: kN, m, rad.

No RC capacity/design or building-code compliance is implemented.
"""
import hashlib
import copy
import json
import math
import re
from importlib.metadata import version

import numpy as np
from Pynite import FEModel3D

DOFS = ('DX', 'DY', 'DZ', 'RX', 'RY', 'RZ')
FORCES = ('FX', 'FY', 'FZ', 'MX', 'MY', 'MZ')
CASES = ('D', 'L', 'W')


class ModelError(ValueError):
    pass


def fail(message):
    raise ModelError(message)


def shape(obj, keys, label):
    if not isinstance(obj, dict) or set(obj) != set(keys.split()):
        fail(f'{label}: required fields: {keys}; unknown fields are not supported')


def number(value, label, minimum=None, maximum=None):
    if type(value) not in (float, int) or not math.isfinite(value):
        fail(f'{label}: finite number required')
    if minimum is not None and value < minimum:
        fail(f'{label}: must be >= {minimum}')
    if maximum is not None and value > maximum:
        fail(f'{label}: must be <= {maximum}')
    return value


def identifier(value, label):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}', value):
        fail(f'{label}: use a letter followed by letters, digits, _ or - (max 32)')


def validate_draft(data):
    """Editor drafts may be incomplete or physically invalid, but remain recoverable.

    Solve always uses the stricter validate() path. Never infer missing values.
    """
    shape(data, 'schemaVersion name material nodes members nodalLoads memberLoads combinations selfWeight', 'Project')
    if type(data['schemaVersion']) is not int or data['schemaVersion'] != 1:
        fail('Unsupported schemaVersion')
    if not isinstance(data['name'], str) or len(data['name']) > 120 or type(data['selfWeight']) is not bool:
        fail('Invalid project metadata')
    def editable(value):
        if value is not None:
            number(value, 'Draft numeric field')
    shape(data['material'], 'E nu density', 'Material')
    for value in data['material'].values():
        editable(value)
    specs = [('nodes', 'id x y z restraints', ('x','y','z'), 500),
             ('members', 'id i j b h rotation', ('b','h','rotation'), 1000),
             ('nodalLoads', 'node case fx fy fz mx my mz', ('fx','fy','fz','mx','my','mz'), 1000),
             ('memberLoads', 'member case qx qy qz', ('qx','qy','qz'), 1000),
             ('combinations', 'name D L W', CASES, 16)]
    ids = {}
    for key, fields, numeric, limit in specs:
        if not isinstance(data[key], list) or len(data[key]) > limit:
            fail(f'Invalid draft {key}')
        ids[key] = set()
        for row in data[key]:
            expected_fields = fields.split()
            if key == 'memberLoads' and 'axes' in row:
                expected_fields.append('axes')
            if not isinstance(row, dict) or set(row) != set(expected_fields):
                fail(f'Invalid draft {key}')
            for field in numeric:
                editable(row[field])
            if key in ('nodes', 'members'):
                identifier(row['id'], key)
                if row['id'] in ids[key]:
                    fail('Duplicate ID in draft')
                ids[key].add(row['id'])
            if key == 'nodes' and (not isinstance(row['restraints'], list) or len(row['restraints']) != 6 or any(type(v) is not bool for v in row['restraints'])):
                fail('Invalid draft restraints')
            if key == 'members' and any(not isinstance(row[k], str) or row[k] not in ids['nodes'] for k in ('i','j')):
                fail('Draft member endpoint not found')
            if key in ('nodalLoads','memberLoads'):
                target, collection = ('node','nodes') if key == 'nodalLoads' else ('member','members')
                if not isinstance(row[target], str) or row[target] not in ids[collection] or row['case'] not in CASES:
                    fail('Invalid draft load target or case')
            if key == 'combinations' and (not isinstance(row['name'], str) or len(row['name']) > 120):
                fail('Invalid draft combination name')
    return {}, {}


def validate(data, draft=False, section_overrides=None):
    if isinstance(data, dict) and data.get('schemaVersion') == 2:
        from project_v2 import validate_project, prepare
        return validate_project(data) if draft else prepare(data)
    if draft:
        return validate_draft(data)
    shape(data, 'schemaVersion name material nodes members nodalLoads memberLoads combinations selfWeight', 'Project')
    if type(data['schemaVersion']) is not int or data['schemaVersion'] != 1:
        fail('Unsupported schemaVersion')
    if not isinstance(data['name'], str) or not 1 <= len(data['name']) <= 120:
        fail('Project name required (1-120 characters)')
    if type(data['selfWeight']) is not bool:
        fail('selfWeight must be true or false')
    mat = data['material']
    shape(mat, 'E nu density', 'Material')
    number(mat['E'], 'E (MPa)', 1, 1000000)
    number(mat['nu'], 'Poisson ratio', 0, .49)
    number(mat['density'], 'Unit weight (kN/m3)', 0, 1000)
    for key, lo, hi in [('nodes', 0 if draft else 2, 500), ('members', 0 if draft else 1, 1000), ('nodalLoads', 0, 1000), ('memberLoads', 0, 1000), ('combinations', 1, 16)]:
        if not isinstance(data[key], list) or not lo <= len(data[key]) <= hi:
            fail(f'{key}: expected {lo} to {hi} entries')
    nodes, members = {}, {}
    for n in data['nodes']:
        shape(n, 'id x y z restraints', 'Node')
        identifier(n['id'], 'Node ID')
        if n['id'] in nodes:
            fail(f'Duplicate node: {n["id"]}')
        for key in ('x', 'y', 'z'):
            number(n[key], f'{n["id"]}.{key} (m)', -10000, 10000)
        if not isinstance(n['restraints'], list) or len(n['restraints']) != 6 or any(type(v) is not bool for v in n['restraints']):
            fail(f'{n["id"]}: six boolean restraints required (DX DY DZ RX RY RZ)')
        xyz = np.array([n['x'], n['y'], n['z']], dtype=float)
        if any(np.linalg.norm(xyz - p) < 1e-6 for p in nodes.values()):
            fail(f'{n["id"]}: coincident nodes; merge them explicitly')
        nodes[n['id']] = xyz
    edges = set()
    for m in data['members']:
        shape(m, 'id i j b h rotation', 'Member')
        identifier(m['id'], 'Member ID')
        if m['id'] in members:
            fail(f'Duplicate member: {m["id"]}')
        if not isinstance(m['i'], str) or not isinstance(m['j'], str) or m['i'] not in nodes or m['j'] not in nodes:
            fail(f'{m["id"]}: endpoint not found')
        length = float(np.linalg.norm(nodes[m['j']] - nodes[m['i']]))
        if length < 1e-4:
            fail(f'{m["id"]}: member too short')
        edge = tuple(sorted((m['i'], m['j'])))
        if edge in edges:
            fail(f'{m["id"]}: duplicate member endpoints')
        edges.add(edge)
        if not section_overrides or m['id'] not in section_overrides:
            number(m['b'], f'{m["id"]}.b (m)', .01, 10)
            number(m['h'], f'{m["id"]}.h (m)', .01, 10)
        number(m['rotation'], f'{m["id"]}.rotation (degrees)', -360, 360)
        a, b = nodes[m['i']], nodes[m['j']]
        for name, p in nodes.items():
            if name in edge:
                continue
            t = float(np.dot(p-a, b-a) / length**2)
            if not draft and 1e-7 < t < 1-1e-7 and np.linalg.norm(p - (a + t*(b-a))) < 1e-6:
                fail(f'{name} lies inside {m["id"]}; split the member at this node')
        members[m['id']] = m
    used = {x for edge in edges for x in edge}
    if not draft and set(nodes) != used:
        fail('Isolated nodes: ' + ', '.join(sorted(set(nodes)-used)))
    # Every connected component needs a support. PyNite checks remaining mechanisms.
    unseen = set(nodes)
    supports = {n['id'] for n in data['nodes'] if any(n['restraints'])}
    while unseen:
        component, stack = set(), [next(iter(unseen))]
        while stack:
            n = stack.pop()
            if n in component:
                continue
            component.add(n)
            stack += [b if a == n else a for a, b in edges if a == n or b == n]
        unseen -= component
        if not draft and not component & supports:
            fail('Unsupported component: ' + ', '.join(sorted(component)))
    for key, entity, fields, targets in [('nodalLoads', 'node', 'fx fy fz mx my mz', nodes), ('memberLoads', 'member', 'qx qy qz', members)]:
        seen = set()
        for load in data[key]:
            expected_fields = f'{entity} case {fields}'.split()
            if key == 'memberLoads' and 'axes' in load:
                if load['axes'] not in ('local', 'global'):
                    fail('memberLoads.axes must be "local" or "global"')
                expected_fields.append('axes')
            if not isinstance(load, dict) or set(load) != set(expected_fields):
                fail(f'{key}: required fields: {" ".join(expected_fields)}; unknown fields are not supported')
            if not isinstance(load[entity], str) or load[entity] not in targets or load['case'] not in CASES:
                fail(f'{key}: invalid target or case (D/L/W required)')
            pair = (load[entity], load['case'])
            if pair in seen:
                fail(f'{key}: combine duplicate entries for {pair}')
            seen.add(pair)
            for field in fields.split():
                number(load[field], f'{key}.{field}', -1e8, 1e8)
    names = set()
    for combo in data['combinations']:
        shape(combo, 'name D L W', 'Combination')
        identifier(combo['name'], 'Combination name')
        if combo['name'] in names:
            fail('Duplicate combination name')
        names.add(combo['name'])
        for case in CASES:
            number(combo[case], f'{combo["name"]}.{case}', -100, 100)
        if not any(combo[c] for c in CASES):
            fail('Combination must have at least one nonzero factor')
    return nodes, members


def section_properties(b, h):
    # Rectangle: local-y depth h, local-z width b. Saint-Venant J approximation.
    a, t = max(b, h), min(b, h)
    return {'A': b*h, 'Iy': h*b**3/12, 'Iz': b*h**3/12,
            'J': a*t**3*(1/3 - .21*t/a*(1-t**4/(12*a**4)))}


def solve(data):
    source = copy.deepcopy(data)
    overrides, coverage = {}, None
    if isinstance(data, dict) and data.get('schemaVersion') == 2:
        from project_v2 import prepare
        data, overrides, coverage = prepare(data)
    coords, members = validate(data, section_overrides=overrides)
    if version('PyNiteFEA') != '3.0.0':
        fail('This preview requires the tested PyNiteFEA 3.0.0 environment')
    model = FEModel3D()
    mat = data['material']
    E = mat['E'] * 1000  # MPa -> kN/m2
    model.add_material('Concrete', E, E/(2*(1+mat['nu'])), mat['nu'], mat['density'])
    for n in data['nodes']:
        model.add_node(n['id'], n['x'], n['y'], n['z'])
        model.def_support(n['id'], **dict(zip(('support_'+d for d in DOFS), n['restraints'])))
    sections, densities = {}, {}
    for m in data['members']:
        props = overrides[m['id']]['section'] if m['id'] in overrides else section_properties(m['b'], m['h'])
        material_name = 'Concrete'
        densities[m['id']] = mat['density']
        if m['id'] in overrides:
            material_name = 'Material_'+m['id']
            custom = overrides[m['id']]['material']
            custom_E = custom['E']*1000
            model.add_material(material_name, custom_E, custom_E/(2*(1+custom['nu'])), custom['nu'], custom['density'])
            densities[m['id']] = custom['density']
        sections[m['id']] = props
        model.add_section(m['id'], **props)
        model.add_member(m['id'], m['i'], m['j'], material_name, m['id'], rotation=m['rotation'])
    for load in data['nodalLoads']:
        for direction in FORCES:
            value = load[direction.lower()]
            if value:
                model.add_node_load(load['node'], direction, value, case=load['case'])
    for load in data['memberLoads']:
        is_local = (load.get('axes') == 'local')
        for axis in 'xyz':
            value = load['q'+axis]
            if value:
                dir_name = 'F' + (axis.lower() if is_local else axis.upper())
                model.add_member_dist_load(load['member'], dir_name, value, value, case=load['case'])
    if data['selfWeight']:
        model.add_member_self_weight('FY', -1, case='D')
    for combo in data['combinations']:
        model.add_load_combo(combo['name'], {c: combo[c] for c in CASES})
    try:
        model.analyze_linear(check_stability=True)
    except Exception as exc:
        fail(f'Analysis stopped: check restraints, connectivity and stiffness. {type(exc).__name__}: {exc}')
    # A zero-load mechanism can return all-zero results and pass equilibrium.
    # Check positive definiteness independently on the scaled free stiffness.
    free = [n.ID*6+i for n in model.nodes.values() for i,d in enumerate(DOFS) if not getattr(n, 'support_'+d)]
    if free:
        stiffness = model.Ke(data['combinations'][0]['name'], sparse=False, check_stability=False)
        kff = stiffness[np.ix_(free, free)]
        diagonal = np.diag(kff)
        if not np.isfinite(kff).all() or np.any(diagonal <= 0):
            fail('Unstable model: free degree of freedom has no positive stiffness')
        scale = np.sqrt(diagonal)
        normalized = kff / np.outer(scale, scale)
        eigenvalues = np.linalg.eigvalsh((normalized + normalized.T)/2)
        if eigenvalues[0] <= 1e-10*eigenvalues[-1]:
            fail('Unstable or poorly conditioned model: check supports, connectivity and stiffness ratios')
    result = {'status': 'ANALYSIS_ONLY', 'solver': 'PyNiteFEA 3.0.0', 'units': 'kN, m, rad; displacements also reported in mm',
              'modelHash': hashlib.sha256(json.dumps(source, sort_keys=True, allow_nan=False).encode()).hexdigest(),
              'assumptions': ['Linear elastic, first order, rigid joints; concrete rectangles or user-supplied steel section properties',
                              'No slab stiffness/soil/RC capacity, cracking, creep, P-Delta, seismic or code checks',
                              'Loads and combination factors are user inputs; Y is vertical',
                              'Member forces and deflections use local axes; node outputs use global axes',
                              'Concrete rectangle J uses a Saint-Venant approximation; steel custom A/Iy/Iz/J are user-supplied directly'],
              'sections': sections, 'combinations': {}}
    if coverage is not None:
        result['coverage'] = coverage
        result['displayUnits'] = source['displayUnits']
        result['memberProperties'] = {m['id']: {'sectionType': m['sectionType'], 'kind': m['kind'],
            'material': copy.deepcopy(source['steel'] if m['sectionType']=='steel_custom' else source['material']),
            'canonicalUnits': 'm-kN-MPa'} for m in source['members']}
    for combo in data['combinations']:
        name = combo['name']
        applied_f, applied_m, reaction_f, reaction_m = (np.zeros(3) for _ in range(4))
        force_scale = moment_scale = 0.
        def apply(p, f, moment):
            nonlocal force_scale, moment_scale
            applied_f[:] += f
            applied_m[:] += np.cross(p, f)+moment
            force_scale += float(np.linalg.norm(f))
            moment_scale += float(np.linalg.norm(np.cross(p, f)))+float(np.linalg.norm(moment))
        for load in data['nodalLoads']:
            factor = combo[load['case']]
            apply(coords[load['node']], np.array([load['f'+a] for a in 'xyz'])*factor,
                  np.array([load['m'+a] for a in 'xyz'])*factor)
        for m in data['members']:
            a, b = coords[m['i']], coords[m['j']]
            q = np.zeros(3)
            mem_obj = model.members[m['id']]
            T_mat = mem_obj.T()[:3, :3]
            for load in data['memberLoads']:
                if load['member'] == m['id']:
                    factor = combo[load['case']]
                    q_vec = np.array([load['q'+ax] for ax in 'xyz']) * factor
                    if load.get('axes') == 'local':
                        q += T_mat.T @ q_vec
                    else:
                        q += q_vec
            if data['selfWeight']:
                q[1] -= sections[m['id']]['A']*densities[m['id']]*combo['D']
            apply((a+b)/2, q*np.linalg.norm(b-a), np.zeros(3))
        node_results, member_results = {}, {}
        for key, n in model.nodes.items():
            disp = [float(getattr(n, d)[name]) for d in DOFS]
            reaction = [float(getattr(n, 'Rxn'+d)[name]) for d in FORCES]
            node_results[key] = {'displacement': disp, 'translationMM': [v*1000 for v in disp[:3]], 'reaction': reaction}
            reaction_f += reaction[:3]
            reaction_m += np.cross(coords[key], reaction[:3])+reaction[3:]
        for key, m in model.members.items():
            sample = []
            for x in np.linspace(0, m.L(), 41):
                sample.append({'x': float(x), 'N': float(m.axial(x, name)), 'Vy': float(m.shear('Fy', x, name)),
                               'Vz': float(m.shear('Fz', x, name)), 'My': float(m.moment('My', x, name)),
                               'Mz': float(m.moment('Mz', x, name)), 'T': float(m.torque(x, name)),
                               'dy': float(m.deflection('dy', x, name)), 'dz': float(m.deflection('dz', x, name))})
            member_results[key] = {'length': float(m.L()), 'rotation': float(m.rotation), 'localAxes': m.T()[:3, :3].tolist(), 'samples': sample}
        f_res, m_res = applied_f+reaction_f, applied_m+reaction_m
        f_tol, m_tol = max(1e-6, force_scale*1e-7), max(1e-6, moment_scale*1e-7)
        if max(abs(f_res)) > f_tol or max(abs(m_res)) > m_tol:
            fail(f'{name}: global equilibrium check failed')
        result['combinations'][name] = {'nodes': node_results, 'members': member_results,
            'equilibrium': {'forceResidualKN': f_res.tolist(), 'momentResidualKNm': m_res.tolist(),
                            'forceToleranceKN': f_tol, 'momentToleranceKNm': m_tol, 'passed': True}}
    try:
        json.dumps(result, allow_nan=False)
    except ValueError:
        fail('Nonfinite result; model is unstable or numerically unsuitable')
    return result
