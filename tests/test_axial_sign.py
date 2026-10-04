import unittest
from engine import solve

class TestAxialSign(unittest.TestCase):
    def test_column_compression_sign_negative(self):
        """Downward gravity load on a column must produce negative axial force (compression)."""
        project = {
            'schemaVersion': 1,
            'name': 'Axial sign benchmark',
            'material': {'E': 25000, 'nu': 0.2, 'density': 24},
            'nodes': [
                {'id': 'N1', 'x': 0, 'y': 0, 'z': 0, 'restraints': [True]*6},
                {'id': 'N2', 'x': 0, 'y': 0, 'z': 3.0, 'restraints': [False]*6}
            ],
            'members': [
                {'id': 'C1', 'i': 'N1', 'j': 'N2', 'b': 0.3, 'h': 0.3, 'rotation': 0}
            ],
            'nodalLoads': [
                {'node': 'N2', 'case': 'D', 'fx': 0, 'fy': 0, 'fz': -100.0, 'mx': 0, 'my': 0, 'mz': 0}
            ],
            'memberLoads': [],
            'combinations': [
                {'name': 'U1', 'D': 1.0, 'L': 0, 'W': 0}
            ],
            'selfWeight': False
        }
        res = solve(project)
        combo = res['combinations']['U1']
        samples = combo['members']['C1']['samples']
        base_sample = samples[0]
        # In civil engineering standard, compression = negative (-)
        self.assertAlmostEqual(base_sample['N'], -100.0, places=1)
        self.assertLess(base_sample['N'], 0, "Axial force for column in compression must be negative!")

if __name__ == '__main__':
    unittest.main()
