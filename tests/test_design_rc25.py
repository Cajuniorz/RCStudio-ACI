"""Unit tests for design_rc25.py — ACI 318-25 full design module."""
import math
import sys
import unittest
from pathlib import Path

# Adjust path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from design_rc25 import (
    design_beam_section,
    design_column_section,
    design_footing,
    design_steel_member,
    label_members,
    _beta1,
    _rebar_area,
)


class TestBeta1(unittest.TestCase):
    def test_low_strength(self):
        self.assertAlmostEqual(_beta1(20), 0.85)
        self.assertAlmostEqual(_beta1(28), 0.85)

    def test_high_strength(self):
        self.assertAlmostEqual(_beta1(55), 0.65)
        self.assertAlmostEqual(_beta1(60), 0.65)

    def test_intermediate(self):
        b = _beta1(35)
        self.assertGreater(b, 0.65)
        self.assertLess(b, 0.85)


class TestRebarArea(unittest.TestCase):
    def test_single_bar(self):
        a = _rebar_area(20, 1)
        self.assertAlmostEqual(a, math.pi * 20**2 / 4, places=1)

    def test_multiple_bars(self):
        a = _rebar_area(16, 4)
        self.assertAlmostEqual(a, 4 * math.pi * 16**2 / 4, places=1)


class TestBeamDesign(unittest.TestCase):
    """Test beam section design for standard cases."""

    def test_simple_beam_positive_moment(self):
        """250×450 beam, f'c=28 MPa, fy=400 MPa, Mu=80 kN·m."""
        result = design_beam_section(
            b_mm=250, h_mm=450, fc=28, fy=400, fyt=235,
            cover_mm=40, stirrup_mm=9, agg_mm=20,
            mu_pos=80, mu_neg=0, vu=30,
            clear_span_mm=4000,
        )
        self.assertEqual(result['type'], 'beam')
        self.assertEqual(result['status'], 'DESIGNED')

        # Check flexure bottom
        bottom = result['flexure']['bottom']
        self.assertEqual(bottom['status'], 'PASS')
        self.assertIsNotNone(bottom['rebar'])
        self.assertGreaterEqual(bottom['rebar']['phi_mn'], 80)
        self.assertLessEqual(bottom['rebar']['utilization'], 1.0)

        # Check top not required
        top = result['flexure']['top']
        self.assertFalse(top['required'])

    def test_beam_with_shear(self):
        """Beam with significant shear force."""
        result = design_beam_section(
            b_mm=300, h_mm=500, fc=28, fy=400, fyt=235,
            cover_mm=40, stirrup_mm=9, agg_mm=20,
            mu_pos=120, mu_neg=60, vu=150,
            clear_span_mm=5000,
        )
        self.assertEqual(result['status'], 'DESIGNED')
        self.assertIsNotNone(result['shear'].get('stirrup'))
        self.assertEqual(result['shear']['status'], 'PASS')

    def test_beam_low_moment_min_rebar(self):
        """Low moment should still satisfy minimum reinforcement."""
        result = design_beam_section(
            b_mm=200, h_mm=400, fc=21, fy=400, fyt=235,
            cover_mm=40, stirrup_mm=9, agg_mm=20,
            mu_pos=10, mu_neg=0, vu=5,
            clear_span_mm=3000,
        )
        bottom = result['flexure']['bottom']
        if bottom['rebar']:
            self.assertGreaterEqual(bottom['rebar']['area_mm2'], bottom['rebar']['as_min_mm2'])

    def test_beam_zero_moment(self):
        """No moment → flexure not required."""
        result = design_beam_section(
            b_mm=250, h_mm=450, fc=28, fy=400, fyt=235,
            cover_mm=40, stirrup_mm=9, agg_mm=20,
            mu_pos=0, mu_neg=0, vu=10,
            clear_span_mm=4000,
        )
        self.assertFalse(result['flexure']['bottom']['required'])
        self.assertFalse(result['flexure']['top']['required'])

    def test_beam_low_shear_no_stirrup(self):
        """Very low shear → no stirrups required."""
        result = design_beam_section(
            b_mm=300, h_mm=600, fc=28, fy=400, fyt=235,
            cover_mm=40, stirrup_mm=9, agg_mm=20,
            mu_pos=50, mu_neg=0, vu=5,
            clear_span_mm=6000,
        )
        self.assertEqual(result['shear']['status'], 'PASS')


class TestColumnDesign(unittest.TestCase):
    """Test column section design."""

    def test_short_column_axial_only(self):
        """300×300 column, pure axial compression."""
        result = design_column_section(
            b_mm=300, h_mm=300, fc=28, fy=400, fyt=235,
            cover_mm=40, pu=500, mux=5, muy=0,
        )
        self.assertEqual(result['type'], 'column')
        self.assertIsNotNone(result['longitudinal'])
        self.assertEqual(result['status'], 'DESIGNED')

        rho = result['longitudinal']['rho']
        self.assertGreaterEqual(rho, 0.01)
        self.assertLessEqual(rho, 0.08)

    def test_column_with_moment(self):
        """Column with significant moment."""
        result = design_column_section(
            b_mm=400, h_mm=400, fc=28, fy=400, fyt=235,
            cover_mm=40, pu=800, mux=80, muy=20,
        )
        self.assertEqual(result['status'], 'DESIGNED')
        self.assertIsNotNone(result['tie'])

    def test_column_slenderness(self):
        """Check slenderness evaluation."""
        result = design_column_section(
            b_mm=300, h_mm=300, fc=28, fy=400, fyt=235,
            cover_mm=40, pu=200, mux=30, muy=0,
            lu_mm=3000,
        )
        self.assertIn('klu_r', result['slenderness'])
        # 3000/(0.3*300) = 33.3 > 22 → slender
        self.assertFalse(result['slenderness']['short'])

    def test_column_tie_spacing(self):
        """Verify tie spacing constraints."""
        result = design_column_section(
            b_mm=300, h_mm=300, fc=28, fy=400, fyt=235,
            cover_mm=40, pu=300, mux=10, muy=0,
        )
        if result['tie']:
            s = result['tie']['spacing_mm']
            db = result['longitudinal']['db']
            self.assertLessEqual(s, 16 * db)
            self.assertLessEqual(s, 300)  # least dimension


class TestFootingDesign(unittest.TestCase):
    """Test footing design."""

    def test_basic_footing(self):
        """1500×1500mm footing, 300mm thick."""
        result = design_footing(
            bx_mm=1500, bz_mm=1500, depth_mm=300,
            fc=28, fy=400, fyt=235, cover_mm=75,
            pu=300, mux=0, muz=0,
            col_bx_mm=300, col_bz_mm=300,
        )
        self.assertEqual(result['type'], 'footing')
        # Should have punching check
        self.assertIn('punching', result)
        self.assertIn('one_way_shear', result)

    def test_footing_with_bearing(self):
        """Footing with bearing pressure check."""
        result = design_footing(
            bx_mm=2000, bz_mm=2000, depth_mm=400,
            fc=28, fy=400, fyt=235, cover_mm=75,
            pu=500, mux=0, muz=0,
            col_bx_mm=400, col_bz_mm=400,
            qa_kpa=150, p_service=350,
        )
        self.assertIn('bearing', result)
        q_actual = result['bearing']['q_actual']
        expected_q = 350 / (2.0 * 2.0)  # 87.5 kPa
        self.assertAlmostEqual(q_actual, expected_q, places=1)
        self.assertEqual(result['bearing']['status'], 'PASS')

    def test_footing_punching(self):
        """Verify punching shear calculation."""
        result = design_footing(
            bx_mm=1500, bz_mm=1500, depth_mm=350,
            fc=28, fy=400, fyt=235, cover_mm=75,
            pu=400, mux=0, muz=0,
            col_bx_mm=300, col_bz_mm=300,
        )
        self.assertGreater(result['punching']['bo_mm'], 0)
        self.assertGreater(result['punching']['phi_vc'], 0)

    def test_footing_with_piles(self):
        """Verify pile capacity and utilization on pile cap."""
        result = design_footing(
            bx_mm=1400, bz_mm=1400, depth_mm=500,
            fc=28, fy=400, fyt=235, cover_mm=75,
            pu=600, mux=0, muz=0,
            col_bx_mm=300, col_bz_mm=300,
            pile_count=4, pile_capacity=250, pile_length=12, ftype='pile_cap'
        )
        self.assertIn('pile', result)
        self.assertEqual(result['pile']['count'], 4)
        self.assertEqual(result['pile']['capacity_kn'], 250)
        self.assertAlmostEqual(result['pile']['load_per_pile_kn'], 150.0, places=1)
        self.assertAlmostEqual(result['pile']['utilization'], 0.60, places=2)
        self.assertEqual(result['pile']['status'], 'PASS')


class TestMemberLabeling(unittest.TestCase):
    """Test member group labeling."""

    def test_basic_labeling(self):
        members = [
            {'id': 'M1', 'kind': 'beam', 'b': 0.25, 'h': 0.45},
            {'id': 'M2', 'kind': 'beam', 'b': 0.25, 'h': 0.45},
            {'id': 'M3', 'kind': 'beam', 'b': 0.30, 'h': 0.50},
            {'id': 'M4', 'kind': 'column', 'b': 0.30, 'h': 0.30},
            {'id': 'M5', 'kind': 'column', 'b': 0.30, 'h': 0.30},
        ]
        labels = label_members(members)
        self.assertEqual(labels['M1'], labels['M2'])  # Same size beams
        self.assertNotEqual(labels['M1'], labels['M3'])  # Different size
        self.assertEqual(labels['M4'], labels['M5'])  # Same columns
        self.assertTrue(labels['M1'].startswith('B'))
        self.assertTrue(labels['M4'].startswith('C'))

    def test_roof_prefix(self):
        members = [{'id': 'R1', 'kind': 'roof', 'b': None, 'h': None}]
        labels = label_members(members)
        self.assertTrue(labels['R1'].startswith('R'))

    def test_empty(self):
        labels = label_members([])
        self.assertEqual(labels, {})

    def test_unique_labels_per_group(self):
        members = [
            {'id': 'A', 'kind': 'beam', 'b': 0.25, 'h': 0.45},
            {'id': 'B', 'kind': 'beam', 'b': 0.30, 'h': 0.50},
            {'id': 'C', 'kind': 'beam', 'b': 0.25, 'h': 0.60},
        ]
        labels = label_members(members)
        unique_labels = set(labels.values())
        self.assertEqual(len(unique_labels), 3)  # 3 different sizes


class TestSteelMemberDesign(unittest.TestCase):
    """Test steel truss member tension and compression design."""

    def test_steel_tension_pass(self):
        # A = 16 cm2 = 0.0016 m2, Fy = 245 MPa
        # phi*Pn = 0.90 * 245 * 1600 / 1000 = 352.8 kN
        result = design_steel_member(
            a_m2=0.0016, iy_m4=1.5e-6, iz_m4=1.5e-6,
            length_m=3.0, e_mpa=200000, fy_mpa=245,
            pu_kn=150.0  # tension
        )
        self.assertEqual(result['status'], 'DESIGNED')
        self.assertEqual(result['governing'], 'tension')
        self.assertAlmostEqual(result['phi_pn_kn'], 352.8, places=1)
        self.assertLess(result['utilization'], 1.0)

    def test_steel_tension_fail(self):
        result = design_steel_member(
            a_m2=0.0010, iy_m4=1.0e-6, iz_m4=1.0e-6,
            length_m=3.0, e_mpa=200000, fy_mpa=245,
            pu_kn=300.0  # phi*Pn = 220.5 kN < 300
        )
        self.assertEqual(result['status'], 'FAIL')
        self.assertGreater(result['utilization'], 1.0)

    def test_steel_compression_buckling(self):
        # Compression: check Euler buckling and AISC curve
        result = design_steel_member(
            a_m2=0.0016, iy_m4=1.5e-6, iz_m4=1.5e-6,
            length_m=2.5, e_mpa=200000, fy_mpa=245,
            pu_kn=-100.0  # compression
        )
        self.assertEqual(result['status'], 'DESIGNED')
        self.assertEqual(result['governing'], 'compression')
        self.assertGreater(result['phi_pn_kn'], 0)
        self.assertLess(result['slenderness'], 200)


class TestGoverningGroupDesign(unittest.TestCase):
    """Test that all members sharing a mark (e.g. B1) share the exact same governing design."""

    def test_beam_group_shares_governing_rebar(self):
        from design_rc25 import design_all
        model = {
            'nodes': [
                {'id': 'N1', 'x': 0, 'y': 3, 'z': 0, 'restraints': [False]*6},
                {'id': 'N2', 'x': 4, 'y': 3, 'z': 0, 'restraints': [False]*6},
                {'id': 'N3', 'x': 8, 'y': 3, 'z': 0, 'restraints': [False]*6},
            ],
            'members': [
                {'id': 'M1', 'i': 'N1', 'j': 'N2', 'kind': 'beam', 'b': 0.25, 'h': 0.45, 'sectionType': 'rc_rect', 'rotation': 0},
                {'id': 'M2', 'i': 'N2', 'j': 'N3', 'kind': 'beam', 'b': 0.25, 'h': 0.45, 'sectionType': 'rc_rect', 'rotation': 0},
            ],
            'nodalLoads': [],
            'memberLoads': [],
            'foundations': [],
        }
        # Analysis result where M1 has high moment (90 kNm) and M2 has low moment (20 kNm)
        analysis_result = {
            'combinations': {
                'U1': {
                    'members': {
                        'M1': {'samples': [{'Mz': 90.0, 'My': 0, 'Vy': 45.0, 'Vz': 0, 'N': 0, 'T': 0}]},
                        'M2': {'samples': [{'Mz': 20.0, 'My': 0, 'Vy': 15.0, 'Vz': 0, 'N': 0, 'T': 0}]},
                    },
                    'nodes': {},
                }
            }
        }
        basis = {'fc_mpa': 25, 'fy_mpa': 400, 'fyt_mpa': 240, 'cover_mm': 40, 'agg_mm': 20, 'stirrup_mm': 9}
        res = design_all(model, analysis_result, basis)
        # Both M1 and M2 belong to B1
        self.assertEqual(res['labels']['M1'], 'B1')
        self.assertEqual(res['labels']['M2'], 'B1')
        d1 = res['members']['M1']
        d2 = res['members']['M2']
        # Both must have the identical governing bottom rebar and capacity
        self.assertEqual(d1['flexure']['bottom']['rebar']['label'], d2['flexure']['bottom']['rebar']['label'])
        self.assertEqual(d1['flexure']['bottom']['rebar']['phi_mn'], d2['flexure']['bottom']['rebar']['phi_mn'])
        # M1 governed at 90 kNm, M2 shares the same rebar
        self.assertGreater(d1['flexure']['bottom']['rebar']['phi_mn'], 90.0)


class TestTwoWaySlabAndStairs(unittest.TestCase):
    """Test ACI 318-25 Two-Way Slab and RC Staircase design."""

    def test_two_way_slab_design(self):
        from design_rc25 import design_two_way_slab
        # 4m x 4.5m slab, 12cm thick
        res = design_two_way_slab(
            thickness_m=0.12,
            span_s_m=4.0,
            span_l_m=4.5,
            dead_kpa=1.0,
            live_kpa=2.0,
            fc=23.5,
            fy=392,
            cover_mm=20
        )
        self.assertEqual(res['type'], 'two_way_slab')
        self.assertEqual(res['status'], 'DESIGNED')
        self.assertIn('DB', res['flexure_short']['label'])
        self.assertIn('DB', res['flexure_long']['label'])
        self.assertLessEqual(res['flexure_short']['utilization'], 1.0)
        self.assertLessEqual(res['flexure_long']['utilization'], 1.0)
        self.assertTrue(all(c['pass'] for c in res['checks']))

    def test_staircase_design(self):
        from design_rc25 import design_staircase
        res = design_staircase(
            waist_th_m=0.15,
            span_ln_m=4.0,
            width_m=1.2,
            riser_m=0.175,
            tread_m=0.25,
            dead_finishes_kpa=1.0,
            live_kpa=3.0,
            fc=23.5,
            fy=392,
            fyt=235,
            cover_mm=25
        )
        self.assertEqual(res['type'], 'staircase')
        self.assertEqual(res['status'], 'DESIGNED')
        self.assertIn('DB', res['flexure_main']['label'])
        self.assertIn('DB', res['distribution']['label'])
        self.assertLessEqual(res['flexure_main']['utilization'], 1.0)
        self.assertGreater(res['landing_reaction_kn'], 0)
        self.assertTrue(all(c['pass'] for c in res['checks']))

    def test_roof_and_stair_member_labels(self):
        from design_rc25 import label_members
        members = [
            {'id': 'M1', 'kind': 'beam', 'role': 'eave', 'b': 0.25, 'h': 0.45},
            {'id': 'M2', 'kind': 'beam', 'roofRole': 'AS', 'b': 0.25, 'h': 0.45},
            {'id': 'M3', 'kind': 'roof', 'roofRole': 'kingpost', 'A': 0.0014},
            {'id': 'M4', 'kind': 'roof', 'roofRole': 'hip', 'A': 0.0016},
            {'id': 'M5', 'kind': 'roof', 'roofRole': 'rafter', 'A': 0.0014},
            {'id': 'M6', 'kind': 'roof', 'roofRole': 'ridge', 'A': 0.0018},
            {'id': 'M7', 'kind': 'roof', 'roofRole': 'purlin', 'A': 0.0007},
            {'id': 'M8', 'kind': 'beam', 'role': 'stair', 'b': 0.20, 'h': 0.40},
        ]
        labels = label_members(members)
        self.assertTrue(labels['M1'].startswith('AS'))
        self.assertTrue(labels['M2'].startswith('AS'))
        self.assertTrue(labels['M3'].startswith('DANG'))
        self.assertTrue(labels['M4'].startswith('HIP'))
        self.assertTrue(labels['M5'].startswith('RAF'))
        self.assertTrue(labels['M6'].startswith('OK'))
        self.assertTrue(labels['M7'].startswith('P'))
        self.assertTrue(labels['M8'].startswith('ST'))


if __name__ == '__main__':
    unittest.main()

