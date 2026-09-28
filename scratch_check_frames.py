import json, engine

with open('scratch_warehouse.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

res = engine.solve(d)
u1 = res['combinations']['U1']

# Let's inspect rafter / chord axial forces for Frame 0 (End) vs Frame 1 (Interior)
# Frame 0 nodes are N5..N18, Frame 1 nodes are N23..N36
for iz in range(4):
    print(f"\n--- FRAME {iz} ---")
    frame_mems = []
    for m in d['members']:
        if m['kind'] == 'roof':
            # check if both nodes are in this frame
            ni = next(n for n in d['nodes'] if n['id'] == m['i'])
            nj = next(n for n in d['nodes'] if n['id'] == m['j'])
            if abs(ni['z'] - iz*5) < 0.01 and abs(nj['z'] - iz*5) < 0.01:
                frame_mems.append(m['id'])
    
    max_N = max(max(abs(s['N']) for s in u1['members'][mid]['samples']) for mid in frame_mems)
    print(f"Frame {iz} (z={iz*5}m): Max Rafter/Truss |N| = {max_N*1000/9.80665:.1f} kg ({max_N:.2f} kN)")
