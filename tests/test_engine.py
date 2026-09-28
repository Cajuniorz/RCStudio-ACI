import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import solve, validate, ModelError, section_properties


def beam(end=(6, 0, 0)):
    return {'schemaVersion': 1, 'name': 'Independent benchmark', 'material': {'E': 25000, 'nu': .2, 'density': 24},
            'nodes': [{'id': 'N1', 'x': 0, 'y': 0, 'z': 0, 'restraints': [True]*6},
                      {'id': 'N2', 'x': end[0], 'y': end[1], 'z': end[2], 'restraints': [False]*6}],
            'members': [{'id': 'M1', 'i': 'N1', 'j': 'N2', 'b': .3, 'h': .6, 'rotation': 0}],
            'nodalLoads': [], 'memberLoads': [], 'combinations': [{'name': 'S', 'D': 1, 'L': 0, 'W': 0}], 'selfWeight': False}


def load(**kwargs):
    result = dict(node='N2', case='D', fx=0, fy=0, fz=0, mx=0, my=0, mz=0)
    result.update(kwargs)
    return result


class Benchmarks(unittest.TestCase):
    def close(self, actual, expected):
        self.assertAlmostEqual(actual, expected, delta=max(abs(expected)*1e-8, 1e-9))

    def test_cantilever_two_axes(self):
        for direction, index, inertia in [('fy', 1, .3*.6**3/12), ('fz', 2, .6*.3**3/12)]:
            p = beam(); p['nodalLoads'] = [load(**{direction: -10})]
            r = solve(p)['combinations']['S']
            self.close(r['nodes']['N2']['displacement'][index], -10*6**3/(3*25e6*inertia))
            self.close(r['nodes']['N1']['reaction'][index], 10)
            self.assertTrue(r['equilibrium']['passed'])

    def test_axial(self):
        p=beam(); p['nodalLoads']=[load(fx=100)]
        r=solve(p)['combinations']['S']; self.close(r['nodes']['N2']['displacement'][0], 100*6/(25e6*.3*.6))

    def test_torsion(self):
        p=beam(); p['nodalLoads']=[load(mx=10)]
        # Independent Saint-Venant rectangle approximation, not engine helper.
        J=.6*.3**3*(1/3-.21*(.3/.6)*(1-(.3/.6)**4/12))
        self.close(solve(p)['combinations']['S']['nodes']['N2']['displacement'][3],10*6/((25e6/2.4)*J))

    def test_simply_supported_udl(self):
        p=beam(); p['nodes'][0]['restraints']=[True,True,True,True,False,False]; p['nodes'][1]['restraints']=[False,True,True,False,False,False]
        p['memberLoads']=[dict(member='M1',case='D',qx=0,qy=-10,qz=0)]
        r=solve(p)['combinations']['S']
        for n in ['N1','N2']: self.close(r['nodes'][n]['reaction'][1],10*6/2)
        mid=r['members']['M1']['samples'][20]
        self.close(abs(mid['Mz']),10*6**2/8)
        self.close(mid['dy'],-5*10*6**4/(384*25e6*(.3*.6**3/12)))

    def test_vertical_axes(self):
        p=beam((0,6,0)); p['nodalLoads']=[load(fx=10)]
        r=solve(p)['combinations']['S']
        # A vertical member's local y is global -X at rotation 0.
        self.close(r['nodes']['N2']['displacement'][0],10*6**3/(3*25e6*(.3*.6**3/12)))

    def test_inclined_axial_and_moments(self):
        p=beam((3,4,0)); p['nodes'][0].update(x=2,y=3,z=1);p['nodes'][1].update(x=5,y=7,z=1)
        p['nodalLoads']=[load(fx=60,fy=80,mz=5)]
        r=solve(p)['combinations']['S'];d=r['nodes']['N2']['displacement']
        self.close(d[0]*.6+d[1]*.8,100*5/(25e6*.3*.6))
        self.assertTrue(r['equilibrium']['passed'])

    def test_section_rotation(self):
        p=beam();p['members'][0]['rotation']=90;p['nodalLoads']=[load(fy=-10)]
        self.close(solve(p)['combinations']['S']['nodes']['N2']['displacement'][1],-10*6**3/(3*25e6*(.6*.3**3/12)))

    def test_self_weight_and_combinations(self):
        p=beam();p['selfWeight']=True;p['nodalLoads']=[load(case='L',fy=-10)];p['combinations']=[dict(name='Donly',D=1,L=0,W=0),dict(name='Lonly',D=0,L=1,W=0),dict(name='Mix',D=1.2,L=-1.5,W=0)]
        r=solve(p)['combinations'];self.close(r['Donly']['nodes']['N1']['reaction'][1],.3*.6*24*6)
        for i in range(6):self.close(r['Mix']['nodes']['N2']['displacement'][i],1.2*r['Donly']['nodes']['N2']['displacement'][i]-1.5*r['Lonly']['nodes']['N2']['displacement'][i])
        p['selfWeight']=False;self.close(solve(p)['combinations']['Donly']['nodes']['N1']['reaction'][1],0)

    def test_global_udl_inclined(self):
        p=beam((3,4,2));p['memberLoads']=[dict(member='M1',case='D',qx=2,qy=-5,qz=3)]
        r=solve(p)['combinations']['S'];L=29**.5
        for actual,expected in zip(r['nodes']['N1']['reaction'][:3],[-2*L,5*L,-3*L]):self.close(actual,expected)
        self.assertTrue(r['equilibrium']['passed'])

    def test_unstable_and_isolated(self):
        p=beam();p['nodes'][0]['restraints']=[False]*6
        with self.assertRaises(ModelError):solve(p)
        p=beam();p['nodes'][0]['restraints']=[True,True,True,False,False,False]
        with self.assertRaises(ModelError):solve(p)
        p=beam();p['nodes'].append(dict(id='N3',x=1,y=2,z=3,restraints=[False]*6))
        with self.assertRaises(ModelError):solve(p)

    def test_validation(self):
        variants=[]
        p=beam();p['members'][0]['b']=None;variants.append(p)
        p=beam();p['material']['E']=float('nan');variants.append(p)
        p=beam();p['nodes'].append(copy.deepcopy(p['nodes'][0]));variants.append(p)
        p=beam();p['members'][0]['j']='missing';variants.append(p)
        p=beam();p['schemaVersion']=2;variants.append(p)
        p=beam();p['slabs']=[];variants.append(p)
        p=beam();p['nodalLoads']=[load(),load()];variants.append(p)
        p=beam();p['members'].append(dict(p['members'][0],id='M2'));variants.append(p)
        for p in variants:
            with self.subTest(p=p):
                with self.assertRaises(ModelError):solve(p)

    def test_roundtrip_and_incomplete_draft(self):
        p=beam();p['nodalLoads']=[load(fy=-10)]
        self.assertEqual(solve(p),solve(json.loads(json.dumps(p))))
        p['nodes']=[];p['members']=[];p['nodalLoads']=[];validate(p,draft=True)
        with self.assertRaises(ModelError):solve(p)

    def test_recoverable_incomplete_editor_drafts(self):
        variants=[]
        p=beam();p['material']['E']=None;variants.append(p)
        p=beam();p['nodes'][1]['x']=None;variants.append(p)
        p=beam();p['members'][0]['j']='N1';variants.append(p)
        p=beam();p['members'][0]['b']=-1;variants.append(p)
        p=beam();p['nodalLoads']=[load(),load()];variants.append(p)
        p=beam();p['combinations'][0]['name']='';variants.append(p)
        for p in variants:
            validate(json.loads(json.dumps(p)),draft=True)
            with self.assertRaises(ModelError):solve(p)


    def test_local_member_load_inclined(self):
        p = {'schemaVersion': 1, 'name': 'Local load benchmark',
             'material': {'E': 25000, 'nu': 0.2, 'density': 24},
             'nodes': [{'id': 'N1', 'x': 0, 'y': 0, 'z': 0, 'restraints': [True]*6},
                       {'id': 'N2', 'x': 4, 'y': 3, 'z': 0, 'restraints': [True]*6}],
             'members': [{'id': 'M1', 'i': 'N1', 'j': 'N2', 'b': 0.3, 'h': 0.5, 'rotation': 0}],
             'nodalLoads': [],
             'memberLoads': [{'member': 'M1', 'case': 'D', 'qx': 0, 'qy': -10, 'qz': 0, 'axes': 'local'}],
             'combinations': [{'name': 'S', 'D': 1.0, 'L': 0, 'W': 0}],
             'selfWeight': False}
        r = solve(p)['combinations']['S']
        self.assertTrue(r['equilibrium']['passed'])
        self.assertEqual(r['members']['M1']['rotation'], 0.0)
        self.close(r['members']['M1']['localAxes'][0][0], 0.8)
        self.close(r['members']['M1']['localAxes'][0][1], 0.6)
        # Global vertical reaction sum should equal total vertical component 10 * 5 * 0.8 = 40 kN
        ry = r['nodes']['N1']['reaction'][1] + r['nodes']['N2']['reaction'][1]
        self.close(ry, 40.0)


if __name__=='__main__':unittest.main(verbosity=2)
