import copy
import math
import unittest
from design_beam25 import design, validate, DesignInputError, CODE, beta1


def example():
    return dict(code=CODE,name='SYNTHETIC TEST ONLY',demandSource='Factored pure moment benchmark; not customer data',
        jurisdiction='Test only, jurisdiction not certified',rebarSpecification='Nominal deformed bars test only',
        scope='protected-normalweight-nonseismic-rectangular',tensionFace='bottom',bMm=250,hMm=450,fcMPa=28,fyMPa=400,
        coverMm=40,stirrupMm=9,aggregateMm=20,muKNm=80,axialKN=0,torsionKNm=0,minorMomentKNm=0,
        clearSpanMm=4000,barDiametersMm=[12,16,20,25])


class SectionDesign(unittest.TestCase):
    def test_numerical_strain_compatibility_oracle(self):
        """Independent equilibrium root; does not call candidate/block equations."""
        p=example(); r=design(p); s=r['selected']
        self.assertIsNotNone(s)
        area=s['count']*math.pi*s['diameterMm']**2/4
        d=p['hMm']-p['coverMm']-p['stirrupMm']-s['diameterMm']/2
        lo,hi=.001,p['hMm']
        for _ in range(100):
            neutral=(lo+hi)/2
            # fc=28 -> beta=.85, numerical rectangular concrete integration.
            block=.85*neutral
            concrete=sum(.85*p['fcMPa']*p['bMm']*(block/2000) for _ in range(2000))
            steel=area*min(p['fyMPa'],200000*.003*(d-neutral)/neutral)
            if concrete>steel: hi=neutral
            else: lo=neutral
        neutral=(lo+hi)/2; block=.85*neutral
        moment=sum(.85*p['fcMPa']*p['bMm']*block/2000*(d-(j+.5)*block/2000) for j in range(2000))/1e6
        self.assertAlmostEqual(s['designMomentKNm'],.9*moment,places=7)
        self.assertGreaterEqual(s['designMomentKNm'],p['muKNm'])

    def test_all_selected_checks_and_deterministic_ranking(self):
        p=example(); before=copy.deepcopy(p); r=design(p)
        self.assertEqual(p,before)
        self.assertEqual(r,design(p))
        self.assertEqual(r['overallStatus'],'NOT_DESIGNED')
        self.assertEqual(len(r['checks']),5)
        self.assertTrue(all(c['actual']>=c['required']-1e-9 for c in r['checks']))
        self.assertTrue(all(c['areaMm2']>=r['selected']['areaMm2'] for c in r['alternatives']))

    def test_no_solution_is_not_pass(self):
        p=example(); p['muKNm']=10000
        r=design(p); self.assertEqual(r['status'],'NO_SOLUTION_IN_SEARCH');self.assertIsNone(r['selected']);self.assertEqual(r['checks'],[])
        p=example();p['bMm']=100
        self.assertIsNone(design(p)['selected'])

    def test_each_missing_numeric_rejected(self):
        for key in ['fcMPa','fyMPa','bMm','coverMm','aggregateMm','muKNm','axialKN']:
            p=example();p[key]=None
            with self.subTest(key=key),self.assertRaises(DesignInputError):design(p)

    def test_unsupported_actions_and_basis(self):
        for key,val in [('axialKN',1),('torsionKNm',.01),('minorMomentKNm',-.01),('coverMm',39.9),('clearSpanMm',1799),('fcMPa',16.99),('fyMPa',551),('code','ACI 318-19'),('scope','exposed'),('demandSource',' '),('barDiametersMm',[12,12]),('barDiametersMm',[13])]:
            p=example();p[key]=val
            with self.subTest(key=key),self.assertRaises(DesignInputError):design(p)

    def test_beta_boundaries(self):
        self.assertEqual(beta1(17),.85);self.assertEqual(beta1(28),.85)
        self.assertAlmostEqual(beta1(35),.8);self.assertEqual(beta1(55),.65)

    def test_vertical_cover_and_tension_face(self):
        p=example();p.update(bMm=500,hMm=150,coverMm=100,fcMPa=55,fyMPa=200,muKNm=.001,clearSpanMm=1000,stirrupMm=6,barDiametersMm=[10])
        with self.assertRaises(DesignInputError):design(p)
        p=example();a=design(p)['selected'];p['tensionFace']='top'
        self.assertEqual(a,design(p)['selected'])
        p['tensionFace']='side'
        with self.assertRaises(DesignInputError):design(p)

    def test_minimum_controls_low_demand(self):
        p=example();p['muKNm']=.001
        s=design(p)['selected'];self.assertGreater(s['minimumAreaMm2'],s['strengthAreaMm2'])
        self.assertGreaterEqual(s['areaMm2'],s['minimumAreaMm2'])

    def test_global_optimum_in_declared_small_search(self):
        p=example();best=design(p)['selected']; alternative=[]
        # Independent brute-force feasibility at fc=28; every search candidate.
        for db in p['barDiametersMm']:
            for n in range(2,13):
                A=n*math.pi*db**2/4;d=401-db/2
                c=A*400/(.85*28*250*.85)
                clear=(250-98-n*db)/(n-1)
                if clear<max(25,db,80/3) or A<max(.25*math.sqrt(28),1.4)/400*250*d:continue
                if .003*(d/c-1)<.005:continue
                if .9*A*400*(d-.85*c/2)/1e6<80:continue
                alternative.append((A,n,db))
        self.assertEqual((best['areaMm2'],best['count'],best['diameterMm']),min(alternative))

    def test_units_anchor_same_physical_input(self):
        p=example(); thai=copy.deepcopy(p)
        thai['fcMPa']=(28/.0980665)*.0980665
        thai['muKNm']=(80/.00980665)*.00980665
        a,b=design(p)['selected'],design(thai)['selected']
        self.assertEqual(a['label'],b['label']);self.assertAlmostEqual(a['designMomentKNm'],b['designMomentKNm'])

    def test_hash_changes_and_unknown_fields_fail(self):
        p=example();r=design(p);p['muKNm']+=1
        self.assertNotEqual(r['inputHash'],design(p)['inputHash'])
        p['pretendCertified']=True
        with self.assertRaises(DesignInputError):design(p)


if __name__=='__main__':unittest.main()
