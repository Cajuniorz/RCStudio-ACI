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


if __name__ == '__main__':
    unittest.main()
