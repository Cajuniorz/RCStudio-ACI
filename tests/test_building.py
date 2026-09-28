import copy
import json
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import solve, ModelError, validate
from project_v2 import migrate, prepare, rectangle
from test_engine import beam, load


def slab_frame():
    source=json.loads((Path(__file__).resolve().parents[1]/'examples/one-storey-demo.rcstudio').read_text(encoding='utf-8'))
    p=migrate(source);p['selfWeight']=False;p['memberLoads']=[]
    p['slabs']=[dict(id='S1',type='one_way',nodes=['N5','N6','N8','N7'],thickness=.12,weightMode='volume',selfLoad=None,dead=1,live=2,mode='one_way_load',support1='M2',support2='M7',note='Synthetic verification input')]
    p['combinations']=[dict(name='D',D=1,L=0,W=0),dict(name='L',D=0,L=1,W=0)]
    return p


class BuildingTests(unittest.TestCase):
    def test_v1_migration_preserves_analysis(self):
        p=beam();p['nodalLoads']=[load(fy=-10)]
        r1=solve(p);v2=migrate(p);r2=solve(v2)
        self.assertEqual(r1['combinations'],r2['combinations'])
        self.assertEqual(v2,migrate(v2));self.assertEqual(p['schemaVersion'],1)

    def test_unit_preferences_do_not_change_physics(self):
        p=migrate(beam());p['nodalLoads']=[load(fy=-10)];a=solve(p)
        for prefs in [dict(system='thai',force='tf'),dict(system='si',force='kgf')]:
            p['displayUnits']=prefs;self.assertEqual(a['combinations'],solve(p)['combinations'])

    def test_floor_transfer_conservation_and_provenance(self):
        p=slab_frame();before=copy.deepcopy(p);r=solve(p)
        for case,expected in [('D',(.12*24+1)*16),('L',2*16)]:
            total=sum(n['reaction'][1] for n in r['combinations'][case]['nodes'].values())
            self.assertAlmostEqual(total,expected,places=8)
        self.assertEqual(p,before);self.assertEqual(r,solve(p))
        self.assertEqual(len(r['coverage']['floorLoadTransfers']),4)
        self.assertAlmostEqual(r['coverage']['floorLoadTransfers'][0]['qyKNm'],-(.12*24+1)*4/2)

    def test_manual_load_combines_without_overwrite(self):
        p=slab_frame();p['memberLoads']=[dict(member='M2',case='D',qx=0,qy=-1,qz=0)]
        r=solve(p)['combinations']['D'];self.assertAlmostEqual(sum(n['reaction'][1] for n in r['nodes'].values()),(.12*24+1)*16+4,places=8)

    def test_adjacent_slabs_share_beam(self):
        p=slab_frame()
        # Add a second bay at x=8; M5 is the original beam N6-N8 at x=4.
        for node in [dict(id='N9',x=8,y=0,z=0,restraints=[True]*6),dict(id='N10',x=8,y=0,z=4,restraints=[True]*6),dict(id='N11',x=8,y=3,z=0,restraints=[False]*6),dict(id='N12',x=8,y=3,z=4,restraints=[False]*6)]:p['nodes'].append(node)
        template=p['members'][0]
        for mid,i,j,kind in [('M9','N9','N11','column'),('M10','N10','N12','column'),('M11','N6','N11','beam'),('M12','N8','N12','beam'),('M13','N11','N12','beam')]:
            m=copy.deepcopy(template);m.update(id=mid,i=i,j=j,kind=kind);p['members'].append(m)
        p['slabs'][0].update(support1='M3',support2='M5')
        p['slabs'].append(dict(p['slabs'][0],id='S2',nodes=['N6','N11','N12','N8'],support1='M5',support2='M13'))
        core,_,_=prepare(p);shared=[l for l in core['memberLoads'] if l['member']=='M5' and l['case']=='D']
        self.assertEqual(len(shared),1);self.assertAlmostEqual(shared[0]['qy'],-(.12*24+1)*4)
        r=solve(p)['combinations']['D'];self.assertAlmostEqual(sum(n['reaction'][1] for n in r['nodes'].values()),(.12*24+1)*32,places=8)

    def test_unsupported_and_invalid_floor_blocks(self):
        variants=[]
        for changes in [dict(mode='pending'),dict(type='two_way'),dict(type='precast'),dict(support2='M3'),dict(nodes=['N5','N8','N6','N7'])]:
            p=slab_frame();p['slabs'][0].update(changes);variants.append(p)
        p=slab_frame();p['slabs'].append(dict(p['slabs'][0],id='S2'));variants.append(p)
        for p in variants:
            validate(p,draft=True)
            with self.assertRaises(ModelError):solve(p)

    def test_explicit_precast_weight(self):
        p=slab_frame();p['slabs'][0].update(type='precast',weightMode='manual',selfLoad=2.5)
        r=solve(p)['combinations']['D'];self.assertAlmostEqual(sum(n['reaction'][1] for n in r['nodes'].values()),(2.5+1)*16,places=8)

    def test_steel_member_uses_own_properties_and_density(self):
        p=migrate(beam());m=p['members'][0];m.update(kind='roof',sectionType='steel_custom',b=None,h=None,A=.001,Iy=2e-6,Iz=4e-6,J=1e-6)
        p['selfWeight']=True;p['nodalLoads']=[load(fy=-1)]
        r=solve(p)['combinations']['S'];q=.001*77
        expected=-1*6**3/(3*200e6*4e-6)-q*6**4/(8*200e6*4e-6)
        self.assertAlmostEqual(r['nodes']['N2']['displacement'][1],expected,places=8)
        self.assertAlmostEqual(r['nodes']['N1']['reaction'][1],1+q*6,places=8)
        m['J']=None
        with self.assertRaises(ModelError):solve(p)

    def test_truss_is_not_silently_rigid(self):
        p=migrate(beam());p['members'][0]['behavior']='truss'
        with self.assertRaises(ModelError):solve(p)
        p=migrate(beam());p['members'][0].update(kind='roof',roofType='truss',behavior='frame')
        with self.assertRaises(ModelError):solve(p)

    def test_foundation_does_not_create_support(self):
        p=migrate(beam());p['foundations']=[dict(id='F1',type='pile_cap',nodes=['N1'],bx=1.5,bz=1.5,depth=.5,embedment=None,qa=None,pileCount=4,pileCapacity=None,pileLength=None,mode='ideal_support',note='Verification only')]
        r=solve(p);self.assertEqual(r['coverage']['components'][0]['status'],'IDEAL_SUPPORT_ONLY')
        p['foundations'][0]['nodes']=['N2']
        with self.assertRaises(ModelError):solve(p)

    def test_v2_incomplete_draft_roundtrip(self):
        p=slab_frame();p['slabs'][0]['thickness']=None;p['slabs'][0]['nodes']=[]
        validate(json.loads(json.dumps(p)),draft=True)
        with self.assertRaises(ModelError):solve(p)

    def test_custom_steel_output_provenance(self):
        p=migrate(beam());p['members'][0].update(kind='roof',sectionType='steel_custom',A=.001,Iy=2e-6,Iz=4e-6,J=1e-6)
        r=solve(p)
        self.assertEqual(r['memberProperties']['M1']['material'],p['steel'])
        self.assertEqual(r['sections']['M1']['J'],1e-6)
        self.assertIn('steel custom A/Iy/Iz/J are user-supplied',r['assumptions'][-1])


if __name__=='__main__':unittest.main(verbosity=2)
