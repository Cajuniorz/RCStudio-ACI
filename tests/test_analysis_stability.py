import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine import solve, ModelError
from project_v2 import migrate
from test_engine import beam

class TestAnalysisStability(unittest.TestCase):
    def test_orphan_node_auto_pruned(self):
        # Create a valid v2 model using migrate(beam())
        p = migrate(beam())
        # Intentionally inject an isolated floating node (N_orphan)
        p['nodes'].append({
            'id': 'N_orphan',
            'x': 99.0,
            'y': 99.0,
            'z': 99.0,
            'restraints': [False] * 6
        })
        
        # Solving should NOT fail with 'free degree of freedom has no positive stiffness'
        res = solve(p)
        self.assertIsNotNone(res)
        self.assertIn('combinations', res)
        # Verify coverage reported the pruned orphan node
        coverage_data = res.get('coverage', {})
        components = coverage_data.get('components', []) if isinstance(coverage_data, dict) else []
        pruned_items = [c for c in components if isinstance(c, dict) and c.get('status') == 'PRUNED_ORPHAN']
        self.assertEqual(len(pruned_items), 1)
        self.assertEqual(pruned_items[0]['id'], 'N_orphan')

    def test_no_supports_diagnostic(self):
        p = migrate(beam())
        for n in p['nodes']:
            n['restraints'] = [False] * 6
        with self.assertRaises(ModelError) as ctx:
            solve(p)
        self.assertIn('จุดยึดรั้ง', str(ctx.exception))

if __name__ == '__main__':
    unittest.main()
