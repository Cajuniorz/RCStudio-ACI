"""Regression tests for design_rc25.design_all on Z-up models (Bugs 10-12 in AGENT_HANDOFF.md).

Before the fix, design_all read Y-up indices (reaction[1], node['y']) even for Z-up models, so a
footing carrying 500 kN was designed with Pu = 0 and reported PASS.
"""
import unittest

import design_rc25 as d

BASIS = {'fc_mpa': 23.5, 'fy_mpa': 392, 'fyt_mpa': 235, 'cover_mm': 40}
SAMPLE = [{'Mz': 10, 'My': 5, 'Vy': 5, 'Vz': 5, 'N': -500, 'T': 0}]


def model(z_up, top):
    return {
        **({'coordinateSystem': 'z-up'} if z_up else {}),
        'nodes': [{'id': 'N1', 'x': 0, 'y': 0, 'z': 0}, {'id': 'N2', 'x': 0, 'y': 0, 'z': 0, **top}],
        'members': [{'id': 'M1', 'kind': 'column', 'i': 'N1', 'j': 'N2', 'b': 0.3, 'h': 0.3}],
        'foundations': [{'id': 'F1', 'mode': 'ideal_support', 'nodes': ['N1'], 'bx': 1.5, 'by': 1.5, 'bz': 1.5,
                         'depth': 0.5, 'qa': 150, 'type': 'isolated'}],
        'slabs': [],
    }


def analysis(reaction):
    return {'combinations': {'U': {'members': {'M1': {'samples': SAMPLE}},
                                   'nodes': {'N1': {'reaction': reaction}}}}}


class ZUpDesign(unittest.TestCase):
    def test_zup_footing_uses_vertical_fz_reaction(self):
        r = d.design_all(model(True, {'z': 3.5}), analysis([0, 0, 500, 3, 4, 0]), BASIS)
        f = r['footings']['F1']
        self.assertNotEqual(f.get('status'), 'SKIP')
        self.assertAlmostEqual(f['flexure_x']['mu'] > 0, True)

    def test_yup_footing_still_uses_fy_reaction(self):
        r = d.design_all(model(False, {'y': 3.5}), analysis([0, 500, 0, 3, 0, 4]), BASIS)
        self.assertNotEqual(r['footings']['F1'].get('status'), 'SKIP')
        self.assertGreater(r['footings']['F1']['flexure_x']['mu'], 0)

    def test_footing_without_vertical_reaction_never_passes(self):
        # Z-up model but only a horizontal reaction => must SKIP, never PASS.
        r = d.design_all(model(True, {'z': 3.5}), analysis([500, 0, 0, 0, 0, 0]), BASIS)
        self.assertEqual(r['footings']['F1']['status'], 'SKIP')

    def test_zup_column_unbraced_length_uses_z(self):
        r = d.design_all(model(True, {'z': 4.2}), analysis([0, 0, 500, 0, 0, 0]), BASIS)
        col = r['members']['M1']
        self.assertEqual(col['type'], 'column')

    def test_label_members_zup_roof_rafter(self):
        nodes = {'a': {'x': 0, 'y': 0, 'z': 3}, 'b': {'x': 3, 'y': 0, 'z': 4}}
        members = [{'id': 'R1', 'kind': 'roof', 'i': 'a', 'j': 'b'}]
        zup = d.label_members(members, nodes, z_up=True)
        self.assertTrue(zup['R1'].startswith('TC'), zup)


# ── Bugs 14-16: beam orientation, top/bottom steel and shear plane (see AGENT_HANDOFF.md section 6) ──────────
from engine import solve  # noqa: E402

W, SPAN, B, H, E_KPA = 10.0, 6.0, 0.3, 0.5, 25000e3


def simple_beam(z_up):
    q = {'qx': 0, 'qy': 0, 'qz': 0}
    q['qz' if z_up else 'qy'] = -W
    return {
        'schemaVersion': 2, 'canonicalUnits': 'm-kN-MPa', 'displayUnits': {'system': 'thai', 'force': 'kgf'},
        'name': 'ss', **({'coordinateSystem': 'z-up'} if z_up else {}),
        'material': {'E': 25000, 'nu': 0.2, 'density': 24}, 'steel': {'E': 200000, 'nu': 0.3, 'density': 77},
        'nodes': [{'id': 'N1', 'x': 0.0, 'y': 0.0, 'z': 0.0, 'restraints': [True, True, True, True, False, False]},
                  {'id': 'N2', 'x': SPAN, 'y': 0.0, 'z': 0.0, 'restraints': [False, True, True, False, False, False]}],
        'members': [{'id': 'B1', 'i': 'N1', 'j': 'N2', 'b': B, 'h': H, 'rotation': 0, 'kind': 'beam',
                     'sectionType': 'rc_rect', 'A': None, 'Iy': None, 'Iz': None, 'J': None,
                     'roofType': 'custom', 'behavior': 'frame'}],
        'nodalLoads': [], 'memberLoads': [{'member': 'B1', 'case': 'D', **q}],
        'combinations': [{'name': 'D', 'D': 1.0, 'L': 0.0, 'W': 0.0}], 'selfWeight': False, 'slabs': [], 'foundations': [],
    }


class BeamOrientationAndSigns(unittest.TestCase):
    def solved(self, z_up):
        m = simple_beam(z_up)
        return m, solve(m)

    def test_deflection_uses_depth_h_in_both_coordinate_systems(self):
        expected_mm = 5 * W * SPAN ** 4 / (384 * E_KPA * (B * H ** 3 / 12)) * 1000   # depth = h = 0.50 m
        for z_up, key in ((True, 'dz'), (False, 'dy')):
            _, res = self.solved(z_up)
            mid = res['combinations']['D']['members']['B1']['samples'][20]
            self.assertAlmostEqual(abs(mid[key]) * 1000, expected_mm, delta=0.02, msg=f'z_up={z_up}')

    def test_beam_design_puts_sagging_moment_on_bottom_steel_and_uses_shear(self):
        for z_up in (True, False):
            m, res = self.solved(z_up)
            r = d.design_all(m, res, BASIS)['members']['B1']
            self.assertAlmostEqual(r['flexure']['bottom']['mu'], W * SPAN ** 2 / 8, places=1, msg=f'z_up={z_up}')
            self.assertEqual(r['flexure']['top']['mu'], 0, msg=f'z_up={z_up}')
            self.assertAlmostEqual(r['shear']['vu'], W * SPAN / 2, places=1, msg=f'z_up={z_up}')


if __name__ == '__main__':
    unittest.main()