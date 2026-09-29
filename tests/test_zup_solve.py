import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import solve, ModelError


def zup_column_model():
    """Returns a schemaVersion 2 model with coordinateSystem: 'z-up'."""
    return {
        'schemaVersion': 2,
        'canonicalUnits': 'm-kN-MPa',
        'displayUnits': {'system': 'thai', 'force': 'kgf'},
        'name': 'Z-Up Column Test',
        'coordinateSystem': 'z-up',
        'material': {'E': 25000, 'nu': 0.2, 'density': 24},
        'steel': {'E': 200000, 'nu': 0.3, 'density': 77},
        'nodes': [
            {'id': 'N1', 'x': 0.0, 'y': 0.0, 'z': 0.0, 'restraints': [True, True, True, True, True, True]},
            {'id': 'N2', 'x': 0.0, 'y': 0.0, 'z': 4.0, 'restraints': [False, False, False, False, False, False]}
        ],
        'members': [
            {
                'id': 'M1', 'i': 'N1', 'j': 'N2', 'b': 0.3, 'h': 0.3, 'rotation': 0,
                'kind': 'column', 'sectionType': 'rc_rect',
                'A': None, 'Iy': None, 'Iz': None, 'J': None,
                'roofType': 'custom', 'behavior': 'frame'
            }
        ],
        'nodalLoads': [
            {'node': 'N2', 'case': 'D', 'fx': 0.0, 'fy': 0.0, 'fz': -50.0, 'mx': 0.0, 'my': 0.0, 'mz': 0.0}
        ],
        'memberLoads': [],
        'combinations': [
            {'name': 'Donly', 'D': 1.0, 'L': 0.0, 'W': 0.0}
        ],
        'selfWeight': True,
        'slabs': [],
        'foundations': []
    }


class TestZUpSolve(unittest.TestCase):
    def test_zup_self_weight_and_load_along_z(self):
        model = zup_column_model()
        res = solve(model)
        self.assertIsNotNone(res)
        self.assertEqual(res.get('status'), 'ANALYSIS_ONLY')

        combo = res['combinations']['Donly']
        self.assertTrue(combo['equilibrium']['passed'])

        # Cross section: 0.3 x 0.3 = 0.09 m2
        # Density: 24 kN/m3 -> self-weight per m = 2.16 kN/m
        # Length: 4.0 m -> total self-weight = 8.64 kN
        expected_sw = 0.3 * 0.3 * 24 * 4.0
        expected_total_fz = 50.0 + expected_sw

        n1_rxn = combo['nodes']['N1']['reaction']
        # reaction format: [RxnFX, RxnFY, RxnFZ, RxnMX, RxnMY, RxnMZ]
        rxn_fx, rxn_fy, rxn_fz = n1_rxn[0], n1_rxn[1], n1_rxn[2]

        self.assertAlmostEqual(rxn_fz, expected_total_fz, places=4,
                               msg=f"Expected RxnFZ={expected_total_fz}, got {rxn_fz}")
        self.assertAlmostEqual(rxn_fy, 0.0, places=6,
                               msg=f"Expected RxnFY=0.0 in Z-up model, got {rxn_fy}")
        self.assertAlmostEqual(rxn_fx, 0.0, places=6,
                               msg=f"Expected RxnFX=0.0, got {rxn_fx}")

    def test_zup_without_self_weight(self):
        model = zup_column_model()
        model['selfWeight'] = False
        res = solve(model)
        combo = res['combinations']['Donly']
        self.assertTrue(combo['equilibrium']['passed'])

        n1_rxn = combo['nodes']['N1']['reaction']
        rxn_fy, rxn_fz = n1_rxn[1], n1_rxn[2]

        self.assertAlmostEqual(rxn_fz, 50.0, places=4)
        self.assertAlmostEqual(rxn_fy, 0.0, places=6)

    def test_zup_schema_v1_preservation(self):
        # Even on a v1 model, coordinateSystem: 'z-up' directs selfWeight to FZ
        model_v1 = {
            'schemaVersion': 1,
            'name': 'Z-Up v1 Model',
            'coordinateSystem': 'z-up',
            'material': {'E': 25000, 'nu': 0.2, 'density': 24},
            'nodes': [
                {'id': 'N1', 'x': 0.0, 'y': 0.0, 'z': 0.0, 'restraints': [True]*6},
                {'id': 'N2', 'x': 0.0, 'y': 0.0, 'z': 4.0, 'restraints': [False]*6}
            ],
            'members': [
                {'id': 'M1', 'i': 'N1', 'j': 'N2', 'b': 0.3, 'h': 0.3, 'rotation': 0}
            ],
            'nodalLoads': [
                {'node': 'N2', 'case': 'D', 'fx': 0.0, 'fy': 0.0, 'fz': -50.0, 'mx': 0.0, 'my': 0.0, 'mz': 0.0}
            ],
            'memberLoads': [],
            'combinations': [{'name': 'Donly', 'D': 1.0, 'L': 0.0, 'W': 0.0}],
            'selfWeight': True
        }
        res = solve(model_v1)
        combo = res['combinations']['Donly']
        self.assertTrue(combo['equilibrium']['passed'])
        self.assertAlmostEqual(combo['nodes']['N1']['reaction'][2], 58.64, places=4)
        self.assertAlmostEqual(combo['nodes']['N1']['reaction'][1], 0.0, places=6)


if __name__ == '__main__':
    unittest.main()
