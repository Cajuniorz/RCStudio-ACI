import json
import engine

with open('scratch_warehouse.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

res = engine.solve(data)
u1 = res['combinations']['U1']

print('=== COLUMNS ===')
for m in data['members']:
    if m['kind'] == 'column':
        m_id = m['id']
        m_res = u1['members'][m_id]
        s0 = m_res['samples'][0]
        s_end = m_res['samples'][-1]
        print(f"{m_id} ({m['i']}->{m['j']}) N_base={s0['N']:.2f} kN, N_top={s_end['N']:.2f} kN, Mz_base={s0['Mz']:.2f} kNm, Vy={s0['Vy']:.2f} kN")

print('\n=== ROOF / TRUSS MAX FORCES ===')
roof_forces = []
for m in data['members']:
    if m['kind'] == 'roof':
        m_id = m['id']
        m_res = u1['members'][m_id]
        max_N = max(abs(s['N']) for s in m_res['samples'])
        max_Mz = max(abs(s['Mz']) for s in m_res['samples'])
        roof_forces.append((m_id, m['i'], m['j'], max_N, max_Mz))

# Sort by max_N descending
roof_forces.sort(key=lambda x: x[3], reverse=True)
print("Top 10 highest axial force members:")
for rf in roof_forces[:10]:
    print(f"Member {rf[0]} ({rf[1]}->{rf[2]}): Max |N| = {rf[3]:.2f} kN, Max |Mz| = {rf[4]:.2f} kNm")

print("\nBottom 10 lowest axial force members:")
for rf in roof_forces[-10:]:
    print(f"Member {rf[0]} ({rf[1]}->{rf[2]}): Max |N| = {rf[3]:.2f} kN, Max |Mz| = {rf[4]:.2f} kNm")

print('\n=== REACTIONS ===')
for nid, reac in u1['nodes'].items():
    fy = reac['reaction'][1]
    if abs(fy) > 1e-3:
        print(f"Node {nid}: FY = {fy:.2f} kN")
