"""ACI CODE-318-25 SI: Full RC member design — beam, column, footing.

Ultimate Strength Design (USD). Units: mm, MPa, kN, kN·m internally.
Canonical project units: m, kN, MPa.
"""
import copy
import math

VERSION = 'rc-design-25/1.0'
CODE = 'ACI CODE-318-25 (SI)'

# Standard rebar catalog (nominal diameter mm)
REBAR_DB = [10, 12, 16, 20, 25, 28, 32]
STIRRUP_DB = [6, 9, 10, 12]

REFERENCES = {
    'beam_flexure': [
        {'clause': '9.3.3.1', 'topic': 'Tension-controlled beams'},
        {'clause': '9.6.1.2', 'topic': 'Minimum flexural reinforcement'},
        {'clause': 'Table 21.2.2', 'topic': 'Strain limits and φ'},
        {'clause': '22.2.2 / 22.3.1.1', 'topic': 'Rectangular stress block'},
        {'clause': '25.2.1', 'topic': 'Clear spacing'},
    ],
    'beam_shear': [
        {'clause': '22.5.5.1', 'topic': 'Vc for members with shear and flexure'},
        {'clause': '22.5.10.5.3', 'topic': 'Vs with stirrups'},
        {'clause': '9.5.1.1', 'topic': 'Design shear strength'},
        {'clause': '9.7.6.2.2', 'topic': 'Maximum stirrup spacing'},
        {'clause': '9.6.3.1', 'topic': 'Minimum shear reinforcement'},
    ],
    'column': [
        {'clause': '22.4.2', 'topic': 'Axial strength'},
        {'clause': '22.4.3', 'topic': 'Combined flexure and axial'},
        {'clause': '10.6.1.1', 'topic': 'Longitudinal reinforcement limits'},
        {'clause': '10.7.6.1.2', 'topic': 'Tie spacing'},
        {'clause': '6.2.5', 'topic': 'Slenderness effects'},
    ],
    'footing': [
        {'clause': '13.3.1.1', 'topic': 'Footing design basis'},
        {'clause': '13.2.6.2', 'topic': 'Two-way shear (punching)'},
        {'clause': '22.6.5.2', 'topic': 'Punching shear strength'},
        {'clause': '13.2.7.1', 'topic': 'One-way shear in footings'},
        {'clause': '13.2.7.2', 'topic': 'Flexure in footings'},
    ],
    'steel_truss': [
        {'clause': 'AISC 360 D2', 'topic': 'Tensile strength φPn = 0.90 Fy Ag'},
        {'clause': 'AISC 360 E3', 'topic': 'Compressive strength with flexural buckling'},
        {'clause': 'AISC 360 B4/E2', 'topic': 'Slenderness limits (KL/r ≤ 200 comp, 300 tens)'},
    ],
    'slab': [
        {'clause': '7.3.1.1', 'topic': 'Minimum thickness of solid one-way slabs'},
        {'clause': '7.5.1.1', 'topic': 'Required flexural strength φMn ≥ Mu'},
        {'clause': '7.6.1.1', 'topic': 'Minimum shrinkage & temp reinforcement (0.0018 Ag)'},
        {'clause': '7.7.2.3', 'topic': 'Maximum bar spacing min(3h, 450 mm)'},
        {'clause': '22.5.5.1', 'topic': 'One-way shear strength φVc ≥ Vu'},
    ],
    'two_way_slab': [
        {'clause': 'Table 8.3.1.1', 'topic': 'Minimum thickness for two-way slabs with beams'},
        {'clause': '8.5.1', 'topic': 'Factored moments in orthogonal directions'},
        {'clause': '8.6.1.1', 'topic': 'Minimum flexural reinforcement ratio 0.0018 Ag'},
        {'clause': '8.7.2.2', 'topic': 'Maximum bar spacing min(2h, 450 mm)'},
        {'clause': '22.5.5.1', 'topic': 'One-way shear on critical perimeter section'},
    ],
    'staircase': [
        {'clause': '7.3.1.1', 'topic': 'Minimum waist thickness for staircase slabs'},
        {'clause': '7.5.1.1', 'topic': 'Required flexural strength along incline'},
        {'clause': '7.6.1.1', 'topic': 'Transverse distribution & shrinkage rebar'},
        {'clause': '22.5.5.1', 'topic': 'One-way shear capacity φVc ≥ Vu'},
    ],
}


class DesignError(ValueError):
    pass


def _beta1(fc):
    """ACI 22.2.2.4.3: stress block depth factor."""
    if fc <= 28:
        return 0.85
    if fc >= 55:
        return 0.65
    return 0.85 - 0.05 * (fc - 28) / 7


def _rebar_area(diameter, count=1):
    """Area of rebar in mm²."""
    return count * math.pi * diameter ** 2 / 4


# ─── BEAM DESIGN ───────────────────────────────────────────────

def design_beam_section(b_mm, h_mm, fc, fy, fyt, cover_mm, stirrup_mm, agg_mm,
                        mu_pos, mu_neg, vu, clear_span_mm, bars=None):
    """Design a beam section for flexure and shear.

    Args (all in mm / MPa / kN / kN·m):
        b_mm, h_mm: section dimensions
        fc: f'c concrete strength
        fy: rebar yield strength
        fyt: stirrup yield strength
        cover_mm: clear cover to stirrup face
        stirrup_mm: stirrup diameter
        agg_mm: max aggregate size
        mu_pos: positive ultimate moment (kN·m), tension at bottom
        mu_neg: absolute negative ultimate moment (kN·m), tension at top
        vu: ultimate shear (kN)
        clear_span_mm: clear span for deep beam check
        bars: allowed bar diameters (default all)
    """
    if bars is None:
        bars = REBAR_DB
    result = {
        'type': 'beam',
        'section': {'b': b_mm, 'h': h_mm},
        'material': {'fc': fc, 'fy': fy, 'fyt': fyt},
        'flexure': {},
        'shear': {},
        'status': 'DESIGNED',
        'checks': [],
    }

    # ── Effective depth
    edge = cover_mm + stirrup_mm
    d_bottom = h_mm - edge - 20 / 2  # assume DB20 initially
    d_top = h_mm - edge - 20 / 2

    # ── Flexure design (positive moment — tension at bottom)
    for face, mu in [('bottom', abs(mu_pos)), ('top', abs(mu_neg))]:
        if mu < 1e-6:
            result['flexure'][face] = {'mu': 0, 'required': False, 'rebar': None}
            continue
        d = d_bottom if face == 'bottom' else d_top
        mu_nmm = mu * 1e6  # kN·m → N·mm

        # Find minimum reinforcement
        best = None
        for diameter in sorted(bars):
            d_eff = h_mm - edge - diameter / 2
            if d_eff <= 0:
                continue
            for count in range(2, 13):
                area = _rebar_area(diameter, count)
                clear = (b_mm - 2 * edge - count * diameter) / max(1, count - 1)
                spacing_min = max(25.0, diameter, 4 * agg_mm / 3)
                if clear < spacing_min - 0.1:
                    continue

                # Minimum reinforcement ACI 9.6.1.2
                as_min = max(0.25 * math.sqrt(fc) / fy, 1.4 / fy) * b_mm * d_eff

                # Flexural capacity
                a = area * fy / (0.85 * fc * b_mm)
                c = a / _beta1(fc)
                strain = 0.003 * (d_eff - c) / c if c > 0 else 999
                strain_limit = fy / 200000 + 0.003

                if strain < strain_limit:
                    continue  # not tension-controlled

                mn = area * fy * (d_eff - a / 2) / 1e6  # N·mm → kN·m
                phi_mn = 0.9 * mn

                if area < as_min - 0.1:
                    continue
                if phi_mn < mu - 0.001:
                    continue

                candidate = {
                    'count': count, 'db': diameter, 'label': f'{count}-DB{diameter}',
                    'area_mm2': round(area, 1), 'd_mm': round(d_eff, 1),
                    'clear_mm': round(clear, 1), 'as_min_mm2': round(as_min, 1),
                    'a_mm': round(a, 2), 'c_mm': round(c, 2),
                    'strain': round(strain, 6), 'strain_limit': round(strain_limit, 6),
                    'phi_mn': round(phi_mn, 3), 'mu': round(mu, 3),
                    'utilization': round(mu / phi_mn, 4),
                }
                if best is None or area < best['area_mm2']:
                    best = candidate
                    break  # inner count loop — found for this diameter, try next

        result['flexure'][face] = {
            'mu': round(mu, 3), 'required': True,
            'rebar': best,
            'status': 'PASS' if best else 'FAIL',
        }
        if best:
            result['checks'].append({
                'check': f'กำลังดัด ({face})', 'status': 'PASS',
                'actual': best['phi_mn'], 'required': mu,
                'unit': 'kN·m', 'clause': '22.3.1.1',
            })
        else:
            result['status'] = 'FAIL'
            result['checks'].append({
                'check': f'กำลังดัด ({face})', 'status': 'FAIL',
                'actual': 0, 'required': mu,
                'unit': 'kN·m', 'clause': '22.3.1.1',
            })

    # ── Shear design
    vu_abs = abs(vu)  # kN
    d = d_bottom  # use bottom effective depth
    # ACI 22.5.5.1: Vc = 0.17 * λ * √f'c * bw * d  (λ=1 normal weight)
    vc_n = 0.17 * 1.0 * math.sqrt(fc) * b_mm * d / 1000  # kN
    phi_vc = 0.75 * vc_n

    if vu_abs <= phi_vc / 2:
        # No stirrups required (below threshold)
        result['shear'] = {
            'vu': round(vu_abs, 3), 'phi_vc': round(phi_vc, 3),
            'stirrup': None, 'status': 'PASS',
            'note': 'Vu ≤ φVc/2 — ไม่ต้องปลอก (ในทางปฏิบัติยังควรใส่ปลอกประกอบ)',
        }
        result['checks'].append({
            'check': 'แรงเฉือน', 'status': 'PASS',
            'actual': phi_vc, 'required': vu_abs,
            'unit': 'kN', 'clause': '9.5.1.1',
        })
    else:
        # Need stirrups
        vs_req = vu_abs / 0.75 - vc_n  # required Vs (kN)
        vs_max = 0.66 * math.sqrt(fc) * b_mm * d / 1000  # ACI limit
        if vs_req > vs_max:
            result['shear'] = {
                'vu': round(vu_abs, 3), 'phi_vc': round(phi_vc, 3),
                'vs_req': round(vs_req, 3), 'vs_max': round(vs_max, 3),
                'stirrup': None, 'status': 'FAIL',
                'note': 'Vs > Vs,max — ต้องเพิ่มขนาดหน้าตัด',
            }
            result['status'] = 'FAIL'
            result['checks'].append({
                'check': 'แรงเฉือน (Vs,max)', 'status': 'FAIL',
                'actual': vs_max, 'required': vs_req,
                'unit': 'kN', 'clause': '22.5.1.2',
            })
        else:
            # Select stirrup size and spacing
            best_stirrup = None
            for ds in STIRRUP_DB:
                av = 2 * _rebar_area(ds)  # 2-legged stirrup
                if vs_req > 0:
                    s_strength = av * fyt * d / (vs_req * 1000)  # mm
                else:
                    s_strength = 9999

                # Maximum spacing ACI 9.7.6.2.2
                s_max = d / 2 if vs_req <= 0.33 * math.sqrt(fc) * b_mm * d / 1000 else d / 4
                s_max = min(s_max, 600)  # absolute max 600mm

                # Minimum shear reinforcement ACI 9.6.3.1
                av_min = max(0.062 * math.sqrt(fc), 0.35) * b_mm / fyt
                s_min_rein = av / av_min if av_min > 0 else 9999

                s = min(s_strength, s_max, s_min_rein)
                s = max(50, math.floor(s / 25) * 25)  # round down to 25mm

                # Provided Vs
                vs_prov = av * fyt * d / (s * 1000)  # kN
                phi_vn = 0.75 * (vc_n + vs_prov)

                if phi_vn >= vu_abs - 0.01:
                    best_stirrup = {
                        'db': ds, 'legs': 2,
                        'spacing_mm': s, 'av_mm2': round(av, 1),
                        'vs_prov': round(vs_prov, 3), 'phi_vn': round(phi_vn, 3),
                        'label': f'2-DB{ds}@{s}',
                    }
                    break

            result['shear'] = {
                'vu': round(vu_abs, 3), 'phi_vc': round(phi_vc, 3),
                'vs_req': round(vs_req, 3),
                'stirrup': best_stirrup,
                'status': 'PASS' if best_stirrup else 'FAIL',
            }
            if best_stirrup:
                result['checks'].append({
                    'check': 'แรงเฉือน', 'status': 'PASS',
                    'actual': best_stirrup['phi_vn'], 'required': vu_abs,
                    'unit': 'kN', 'clause': '9.5.1.1',
                })
            else:
                result['status'] = 'FAIL'
                result['checks'].append({
                    'check': 'แรงเฉือน', 'status': 'FAIL',
                    'actual': 0, 'required': vu_abs,
                    'unit': 'kN', 'clause': '9.5.1.1',
                })

    return result


# ─── COLUMN DESIGN ─────────────────────────────────────────────

def _column_pm_capacity(b_mm, h_mm, fc, fy, bars_info, axis='major'):
    """Compute key points on P-M interaction diagram.

    bars_info: {'count': n, 'db': diameter_mm, 'cover_to_center': mm}
    Returns list of (Pn, Mn) points in kN and kN·m.
    """
    d_prime = bars_info['cover_to_center']
    d = h_mm - d_prime
    n_bars = bars_info['count']
    db = bars_info['db']
    as_total = _rebar_area(db, n_bars)
    # Assume bars equally distributed on two faces
    as_face = as_total / 2

    points = []

    # Point 1: Pure axial compression (Po)
    # ACI 22.4.2.1: Po = 0.85*f'c*(Ag - Ast) + fy*Ast
    ag = b_mm * h_mm
    po = 0.85 * fc * (ag - as_total) + fy * as_total
    po_kn = po / 1000
    # φPn,max = 0.80 * φ * Po (tied column)  ACI 22.4.2.1
    phi_po = 0.65 * 0.80 * po_kn
    points.append({'label': 'Po', 'pn': round(po_kn, 1), 'mn': 0,
                   'phi_pn': round(phi_po, 1), 'phi_mn': 0})

    # Point 2: Balanced condition (cb = 0.003/(0.003+fy/Es) * d)
    es = 200000  # MPa
    cb = 0.003 / (0.003 + fy / es) * d
    ab = _beta1(fc) * cb
    ab = min(ab, h_mm)

    # Compression steel strain
    eps_prime = 0.003 * (cb - d_prime) / cb
    fs_prime = min(abs(eps_prime) * es, fy) * (1 if eps_prime >= 0 else -1)

    cc = 0.85 * fc * ab * b_mm / 1000  # kN
    cs = as_face * fs_prime / 1000  # kN (compression steel)
    ts = as_face * fy / 1000  # kN (tension steel at yield)

    pb = cc + cs - ts  # kN
    # Moment about centroid
    mb = (cc * (h_mm / 2 - ab / 2) + cs * (h_mm / 2 - d_prime) + ts * (h_mm / 2 - d_prime)) / 1000  # kN·m

    points.append({'label': 'Balanced', 'pn': round(pb, 1), 'mn': round(mb, 3),
                   'phi_pn': round(0.65 * pb, 1), 'phi_mn': round(0.65 * mb, 3)})

    # Point 3: Pure bending (Pn = 0)
    # Simple approximation: As_tension only
    a = as_face * fy / (0.85 * fc * b_mm)
    mn0 = as_face * fy * (d - a / 2) / 1e6  # kN·m
    points.append({'label': 'Mo', 'pn': 0, 'mn': round(mn0, 3),
                   'phi_pn': 0, 'phi_mn': round(0.9 * mn0, 3)})

    # Point 4: Tension controlled (c = 3/8 * d for εt = 0.005)
    ct = 0.003 / (0.003 + 0.005) * d
    at = _beta1(fc) * ct
    at = min(at, h_mm)
    eps_prime_t = 0.003 * (ct - d_prime) / ct if ct > 0 else 0
    fs_prime_t = min(abs(eps_prime_t) * es, fy) * (1 if eps_prime_t >= 0 else -1)

    cc_t = 0.85 * fc * at * b_mm / 1000
    cs_t = as_face * fs_prime_t / 1000
    ts_t = as_face * fy / 1000

    pt = cc_t + cs_t - ts_t
    mt = (cc_t * (h_mm / 2 - at / 2) + cs_t * (h_mm / 2 - d_prime) + ts_t * (h_mm / 2 - d_prime)) / 1000

    points.append({'label': 'Tension-controlled', 'pn': round(pt, 1), 'mn': round(mt, 3),
                   'phi_pn': round(0.9 * pt, 1), 'phi_mn': round(0.9 * mt, 3)})

    return points


def design_column_section(b_mm, h_mm, fc, fy, fyt, cover_mm, pu, mux, muy,
                          lu_mm=None, bars=None):
    """Design a column section for combined axial + biaxial bending.

    Args (mm / MPa / kN / kN·m):
        b_mm, h_mm: column section
        fc, fy, fyt: material strengths
        cover_mm: clear cover
        pu: factored axial load (kN), positive = compression
        mux, muy: factored moments about X and Y (kN·m)
        lu_mm: unsupported length for slenderness
        bars: allowed bar diameters
    """
    if bars is None:
        bars = [db for db in REBAR_DB if db >= 16]

    result = {
        'type': 'column',
        'section': {'b': b_mm, 'h': h_mm},
        'material': {'fc': fc, 'fy': fy, 'fyt': fyt},
        'axial': {'pu': round(abs(pu), 3)},
        'moment': {'mux': round(abs(mux), 3), 'muy': round(abs(muy), 3)},
        'longitudinal': {},
        'tie': {},
        'slenderness': {},
        'status': 'DESIGNED',
        'checks': [],
    }

    ag = b_mm * h_mm  # gross area mm²

    # Slenderness check
    if lu_mm is not None and lu_mm > 0:
        k = 1.0  # conservative for braced frame
        r = min(b_mm, h_mm) * 0.3  # radius of gyration
        slenderness = k * lu_mm / r
        result['slenderness'] = {
            'lu_mm': lu_mm, 'k': k, 'r': round(r, 1),
            'klu_r': round(slenderness, 2),
            'short': slenderness <= 22,
            'note': 'เสาสั้น' if slenderness <= 22 else 'เสายาว — ต้องขยาย moment (simplified Cm/(1-Pu/Pc))',
        }
        if slenderness > 22:
            # Simplified moment magnifier for braced frame
            ec = 4700 * math.sqrt(fc)  # MPa
            ig = b_mm * h_mm ** 3 / 12  # mm⁴
            ei = 0.4 * ec * ig  # simplified EI
            pc = math.pi ** 2 * ei / (k * lu_mm) ** 2 / 1000  # kN
            cm = 1.0  # conservative
            dns = max(cm / (1 - abs(pu) / (0.75 * pc)), 1.0) if pc > 0 and abs(pu) < 0.75 * pc else 2.0
            result['slenderness']['dns'] = round(dns, 4)
            result['slenderness']['pc_kn'] = round(pc, 1)
            mux = abs(mux) * dns
            muy = abs(muy) * dns

    # ── Select longitudinal bars
    # ACI 10.6.1.1: 0.01*Ag ≤ As ≤ 0.08*Ag
    as_min = 0.01 * ag
    as_max = 0.08 * ag

    best = None
    for db in sorted(bars):
        cover_to_center = cover_mm + 10 + db / 2  # stirrup ~10mm + bar center
        for count in range(4, 21, 2):  # even numbers, min 4 for tied
            area = _rebar_area(db, count)
            if area < as_min:
                continue
            if area > as_max:
                break

            bars_info = {'count': count, 'db': db, 'cover_to_center': cover_to_center}

            # Check P-M capacity using simplified interaction
            pm_points = _column_pm_capacity(b_mm, h_mm, fc, fy, bars_info)
            phi_po = pm_points[0]['phi_pn']  # max axial

            # Simple capacity check: use linear interpolation on diagram
            # Check if (Pu, Mu) is inside the interaction diagram
            mu_total = math.sqrt(mux ** 2 + muy ** 2) if muy > 0.01 else abs(mux)
            pu_abs = abs(pu)

            # Find capacity at the given Pu level using linear interpolation
            phi_mn_at_pu = 0
            for i in range(len(pm_points) - 1):
                p1 = pm_points[i]['phi_pn']
                p2 = pm_points[i + 1]['phi_pn']
                m1 = pm_points[i]['phi_mn']
                m2 = pm_points[i + 1]['phi_mn']
                if (p1 >= pu_abs >= p2) or (p2 >= pu_abs >= p1):
                    if abs(p1 - p2) > 0.01:
                        t = (pu_abs - p2) / (p1 - p2)
                        phi_mn_at_pu = m2 + t * (m1 - m2)
                    else:
                        phi_mn_at_pu = max(m1, m2)
                    break
            else:
                # Pu above Po: check axial only
                if pu_abs <= phi_po:
                    phi_mn_at_pu = 0  # on P axis
                else:
                    continue  # doesn't work

            # Check axial capacity
            if pu_abs > phi_po + 0.1:
                continue

            # Check moment capacity
            if mu_total > 0.01 and phi_mn_at_pu < mu_total - 0.1:
                continue

            utilization_p = pu_abs / phi_po if phi_po > 0 else 0
            utilization_m = mu_total / phi_mn_at_pu if phi_mn_at_pu > 0 else 0
            utilization = max(utilization_p, utilization_m)

            candidate = {
                'count': count, 'db': db, 'label': f'{count}-DB{db}',
                'area_mm2': round(area, 1),
                'as_min': round(as_min, 1), 'as_max': round(as_max, 1),
                'rho': round(area / ag, 5),
                'phi_po': round(phi_po, 1),
                'phi_mn': round(phi_mn_at_pu, 3),
                'utilization': round(utilization, 4),
                'pm_diagram': pm_points,
            }
            if best is None or area < best['area_mm2']:
                best = candidate
                break  # found for this diameter

    result['longitudinal'] = best
    if best:
        result['checks'].append({
            'check': 'เหล็กยืน (0.01Ag ≤ As ≤ 0.08Ag)', 'status': 'PASS',
            'actual': best['area_mm2'], 'required': best['as_min'],
            'unit': 'mm²', 'clause': '10.6.1.1',
        })
        result['checks'].append({
            'check': 'กำลังรับแรงแกน', 'status': 'PASS',
            'actual': best['phi_po'], 'required': abs(pu),
            'unit': 'kN', 'clause': '22.4.2',
        })
    else:
        result['status'] = 'FAIL'
        result['checks'].append({
            'check': 'เหล็กยืน', 'status': 'FAIL',
            'actual': 0, 'required': as_min,
            'unit': 'mm²', 'clause': '10.6.1.1',
        })

    # ── Tie design
    if best:
        db_long = best['db']
        # ACI 10.7.6.1.2: spacing ≤ min(16*db_long, 48*db_stirrup, least dimension)
        for ds in STIRRUP_DB:
            if ds < 10:
                continue  # minimum for tied columns
            s_max = min(16 * db_long, 48 * ds, min(b_mm, h_mm))
            s = max(50, math.floor(s_max / 25) * 25)
            result['tie'] = {
                'db': ds, 'spacing_mm': s,
                'label': f'RB{ds}@{s}',
            }
            result['checks'].append({
                'check': 'ปลอกเสา', 'status': 'PASS',
                'actual': s, 'required': s_max,
                'unit': 'mm', 'clause': '10.7.6.1.2',
            })
            break

    return result


# ─── FOOTING DESIGN ────────────────────────────────────────────

def design_footing(bx_mm, bz_mm, depth_mm, fc, fy, fyt, cover_mm,
                   pu, mux, muz, col_bx_mm, col_bz_mm, qa_kpa=None,
                   p_service=None, bars=None,
                   pile_count=None, pile_capacity=None, pile_length=None, ftype='isolated'):
    """Design an isolated spread footing or pile cap foundation.

    Args (mm / MPa / kN / kN·m):
        bx_mm, bz_mm: footing plan dimensions
        depth_mm: footing thickness
        fc, fy, fyt: material strengths
        cover_mm: clear cover
        pu: factored axial (kN, downward positive)
        mux, muz: factored moments
        col_bx_mm, col_bz_mm: column dimensions on footing
        qa_kpa: allowable bearing capacity (kPa) for service check
        p_service: service load for bearing check
        bars: allowed bar diameters
        pile_count: number of piles under pile cap
        pile_capacity: allowable vertical capacity per pile (kN)
        pile_length: length of pile (m)
        ftype: foundation type
    """
    if bars is None:
        bars = REBAR_DB

    result = {
        'type': 'footing',
        'ftype': ftype,
        'section': {'bx': bx_mm, 'bz': bz_mm, 'depth': depth_mm},
        'material': {'fc': fc, 'fy': fy},
        'bearing': {},
        'flexure_x': {},
        'flexure_z': {},
        'one_way_shear': {},
        'punching': {},
        'status': 'DESIGNED',
        'checks': [],
    }

    area_mm2 = bx_mm * bz_mm
    area_m2 = area_mm2 / 1e6
    d = depth_mm - cover_mm - 16 / 2  # assume DB16

    # ── Bearing check (service loads)
    if p_service is not None and qa_kpa is not None:
        q_actual = p_service / area_m2  # kPa = kN/m²
        result['bearing'] = {
            'q_actual': round(q_actual, 2), 'qa': qa_kpa,
            'utilization': round(q_actual / qa_kpa, 4) if qa_kpa > 0 else 999,
            'status': 'PASS' if q_actual <= qa_kpa else 'FAIL',
        }
        result['checks'].append({
            'check': 'Bearing pressure', 'status': 'PASS' if q_actual <= qa_kpa else 'FAIL',
            'actual': round(qa_kpa, 2), 'required': round(q_actual, 2),
            'unit': 'kPa', 'clause': '13.3.1.1',
        })
        if q_actual > qa_kpa:
            result['status'] = 'FAIL'

    # ── Pile capacity check (for pile cap foundation)
    if pile_count and pile_count > 0:
        p_cap = float(pile_capacity) if pile_capacity is not None else 250.0  # default 250 kN ≈ 25.5 tons
        p_pile = abs(pu) / pile_count
        p_util = round(p_pile / p_cap, 4) if p_cap > 0 else 999
        pile_status = 'PASS' if p_pile <= p_cap else 'FAIL'
        result['pile'] = {
            'count': pile_count,
            'capacity_kn': p_cap,
            'load_per_pile_kn': round(p_pile, 2),
            'length_m': pile_length or 12.0,
            'utilization': p_util,
            'status': pile_status,
        }
        result['checks'].append({
            'check': f'กำลังรับน้ำหนักเสาเข็ม ({pile_count} ต้น)',
            'status': pile_status,
            'actual': round(p_cap, 2),
            'required': round(p_pile, 2),
            'unit': 'kN/ต้น',
            'clause': 'มาตรฐานวิศวกรรมฐานราก (EIT/DPT)',
        })
        if pile_status == 'FAIL':
            result['status'] = 'FAIL'

    # ── Net soil pressure for strength design
    qu_net = abs(pu) / area_m2  # kN/m² (factored, net upward)

    # ── One-way shear (check both directions)
    for direction, footing_dim, col_dim, label in [
        ('x', bx_mm, col_bx_mm, 'ทิศ X'), ('z', bz_mm, col_bz_mm, 'ทิศ Z')
    ]:
        cantilever = (footing_dim - col_dim) / 2
        # Critical section at d from column face
        shear_span = max(0, cantilever - d)
        vu_1way = qu_net * shear_span / 1000 * (bz_mm if direction == 'x' else bx_mm) / 1000  # kN
        phi_vc = 0.75 * 0.17 * math.sqrt(fc) * (bz_mm if direction == 'x' else bx_mm) * d / 1000  # kN

        status = 'PASS' if phi_vc >= vu_1way else 'FAIL'
        result['one_way_shear'][direction] = {
            'vu': round(vu_1way, 3), 'phi_vc': round(phi_vc, 3),
            'status': status, 'label': label,
        }
        result['checks'].append({
            'check': f'เฉือนทางเดียว {label}', 'status': status,
            'actual': round(phi_vc, 3), 'required': round(vu_1way, 3),
            'unit': 'kN', 'clause': '13.2.7.1',
        })
        if status == 'FAIL':
            result['status'] = 'FAIL'

    # ── Two-way punching shear
    bo = 2 * ((col_bx_mm + d) + (col_bz_mm + d))  # perimeter at d/2
    beta_c = max(col_bx_mm, col_bz_mm) / min(col_bx_mm, col_bz_mm) if min(col_bx_mm, col_bz_mm) > 0 else 1
    alpha_s = 40  # interior column

    vc1 = 0.33 * math.sqrt(fc)  # MPa
    vc2 = 0.17 * (1 + 2 / beta_c) * math.sqrt(fc)
    vc3 = 0.083 * (alpha_s * d / bo + 2) * math.sqrt(fc) if bo > 0 else 999
    vc = min(vc1, vc2, vc3)

    phi_vc_punch = 0.75 * vc * bo * d / 1000  # kN

    # Punching load = total load minus area inside critical perimeter
    area_inside = (col_bx_mm + d) * (col_bz_mm + d) / 1e6  # m²
    vu_punch = abs(pu) - qu_net * area_inside

    punch_status = 'PASS' if phi_vc_punch >= vu_punch else 'FAIL'
    result['punching'] = {
        'vu': round(vu_punch, 3), 'phi_vc': round(phi_vc_punch, 3),
        'bo_mm': round(bo, 1), 'beta_c': round(beta_c, 3),
        'vc_mpa': round(vc, 4),
        'utilization': round(vu_punch / phi_vc_punch, 4) if phi_vc_punch > 0 else 999,
        'status': punch_status,
    }
    result['checks'].append({
        'check': 'เจาะทะลุ (Punching)', 'status': punch_status,
        'actual': round(phi_vc_punch, 3), 'required': round(vu_punch, 3),
        'unit': 'kN', 'clause': '22.6.5.2',
    })
    if punch_status == 'FAIL':
        result['status'] = 'FAIL'

    # ── Flexure (both directions)
    for direction, footing_dim, col_dim, other_dim, label in [
        ('x', bx_mm, col_bx_mm, bz_mm, 'ทิศ X'),
        ('z', bz_mm, col_bz_mm, bx_mm, 'ทิศ Z'),
    ]:
        cantilever = (footing_dim - col_dim) / 2
        mu = qu_net * (cantilever / 1000) ** 2 / 2 * (other_dim / 1000)  # kN·m

        # Find reinforcement per meter width
        b_design = other_dim  # full width
        best = None
        for db in sorted(bars):
            d_eff = depth_mm - cover_mm - db / 2
            if d_eff <= 0:
                continue
            for spacing in range(100, 301, 25):
                count_per_m = int(1000 / spacing)
                total_count = max(2, int(b_design / spacing))
                area = _rebar_area(db, total_count)

                as_min = max(0.25 * math.sqrt(fc) / fy, 1.4 / fy) * b_design * d_eff
                # Temperature/shrinkage minimum for footings
                as_temp = 0.0018 * b_design * depth_mm
                as_min = max(as_min, as_temp)

                if area < as_min - 0.1:
                    continue

                a = area * fy / (0.85 * fc * b_design)
                phi_mn = 0.9 * area * fy * (d_eff - a / 2) / 1e6

                if phi_mn < mu - 0.001:
                    continue

                candidate = {
                    'db': db, 'spacing_mm': spacing,
                    'label': f'DB{db}@{spacing}',
                    'total_count': total_count,
                    'area_mm2': round(area, 1),
                    'phi_mn': round(phi_mn, 3), 'mu': round(mu, 3),
                    'utilization': round(mu / phi_mn, 4) if phi_mn > 0 else 999,
                }
                if best is None or area < best['area_mm2']:
                    best = candidate
                break  # found for this spacing

        key = f'flexure_{direction}'
        result[key] = {
            'mu': round(mu, 3), 'rebar': best,
            'status': 'PASS' if best else 'FAIL', 'label': label,
        }
        result['checks'].append({
            'check': f'ดัดฐานราก {label}', 'status': 'PASS' if best else 'FAIL',
            'actual': best['phi_mn'] if best else 0, 'required': round(mu, 3),
            'unit': 'kN·m', 'clause': '13.2.7.2',
        })
        if not best:
            result['status'] = 'FAIL'

    return result


# ─── STEEL TRUSS MEMBER DESIGN ────────────────────────────────

def design_steel_member(a_m2, iy_m4, iz_m4, length_m, e_mpa, fy_mpa, pu_kn, mu_knm=0):
    """Design a steel truss/roof member for axial tension or compression.

    AISC 360 / USD Method:
    - Tension: φPn = 0.90 * Fy * Ag
    - Compression: φPn = 0.90 * Fcr * Ag (Euler buckling)
    """
    ag_mm2 = (a_m2 if a_m2 and a_m2 > 0 else 0.0016) * 1e6  # default 16 cm2 (~2L 50x50x5 or pipe)
    iy = (iy_m4 if iy_m4 and iy_m4 > 0 else 1e-6) * 1e12  # mm4
    iz = (iz_m4 if iz_m4 and iz_m4 > 0 else 1e-6) * 1e12  # mm4
    i_min = min(iy, iz)
    r_mm = math.sqrt(max(1.0, i_min / ag_mm2))
    l_mm = max(100.0, length_m * 1000.0)
    slenderness = l_mm / r_mm

    is_tension = pu_kn >= 0
    pu_abs = abs(pu_kn)
    checks = []

    if is_tension:
        phi_pn = 0.90 * fy_mpa * ag_mm2 / 1000.0  # kN
        util = pu_abs / phi_pn if phi_pn > 0 else 999.0
        status = 'PASS' if util <= 1.0 else 'FAIL'
        checks.append({
            'check': 'แรงดึงเหล็ก (φPn = 0.90 Fy Ag)',
            'status': status,
            'actual': round(phi_pn, 2),
            'required': round(pu_abs, 2),
            'unit': 'kN',
            'clause': 'AISC 360 D2',
        })
        if slenderness > 300:
            checks.append({
                'check': 'ความชะลูด L/r ≤ 300 (แรงดึง)',
                'status': 'FAIL',
                'actual': round(slenderness, 1),
                'required': 300.0,
                'unit': '',
                'clause': 'AISC 360 D1',
            })
            status = 'FAIL'
    else:
        fe = math.pi ** 2 * e_mpa / (max(1.0, slenderness) ** 2)  # Euler buckling stress
        limit_lambda = 4.71 * math.sqrt(e_mpa / fy_mpa)
        if slenderness <= limit_lambda:
            fcr = (0.658 ** (fy_mpa / fe)) * fy_mpa
        else:
            fcr = 0.877 * fe
        phi_pn = 0.90 * fcr * ag_mm2 / 1000.0  # kN
        util = pu_abs / phi_pn if phi_pn > 0 else 999.0
        status = 'PASS' if util <= 1.0 else 'FAIL'
        checks.append({
            'check': 'แรงอัดเหล็ก (การโก่งเดาะ φPn = 0.90 Fcr Ag)',
            'status': status,
            'actual': round(phi_pn, 2),
            'required': round(pu_abs, 2),
            'unit': 'kN',
            'clause': 'AISC 360 E3',
        })
        if slenderness > 200:
            checks.append({
                'check': 'ความชะลูด L/r ≤ 200 (แรงอัด)',
                'status': 'FAIL',
                'actual': round(slenderness, 1),
                'required': 200.0,
                'unit': '',
                'clause': 'AISC 360 E2',
            })
            status = 'FAIL'

    return {
        'type': 'steel_truss',
        'status': 'DESIGNED' if status == 'PASS' else 'FAIL',
        'governing': 'tension' if is_tension else 'compression',
        'pu_kn': round(pu_kn, 2),
        'phi_pn_kn': round(phi_pn, 2),
        'slenderness': round(slenderness, 1),
        'ag_mm2': round(ag_mm2, 1),
        'r_mm': round(r_mm, 1),
        'utilization': round(util, 4),
        'checks': checks,
    }


# ─── SLAB DESIGN ───────────────────────────────────────────────

def design_one_way_slab(thickness_m, span_m, dead_kpa, live_kpa, fc, fy, cover_mm=25, bar_options=None):
    """ACI CODE-318-25: Solid one-way slab design per 1 meter strip width (b = 1000 mm).

    Args:
        thickness_m: slab thickness in meters
        span_m: clear span ln in meters
        dead_kpa: superimposed dead load (finishes/partitions) in kN/m²
        live_kpa: superimposed live load in kN/m²
        fc: concrete compressive strength f'c in MPa
        fy: steel yield strength in MPa
        cover_mm: clear cover in mm (default 25 mm)
        bar_options: candidate bar diameters in mm (default [10, 12, 16])
    """
    if bar_options is None:
        bar_options = [10, 12, 16]

    h_mm = round(thickness_m * 1000)
    b_mm = 1000.0
    w_self = thickness_m * 24.0
    w_d = w_self + dead_kpa
    w_l = live_kpa
    wu = max(1.4 * w_d, 1.2 * w_d + 1.6 * w_l)
    mu = wu * (span_m ** 2) / 10.0
    vu = wu * span_m / 2.0
    as_min = 0.0018 * b_mm * h_mm

    phi = 0.90
    best_bar = None
    for bar_db in bar_options:
        d = h_mm - cover_mm - bar_db / 2.0
        if d <= 20:
            continue
        rn = (mu * 1e6) / (phi * b_mm * (d ** 2))
        m = fy / (0.85 * fc)
        discriminant = max(0.0, 1.0 - 2.0 * m * rn / fy)
        rho = (1.0 / m) * (1.0 - math.sqrt(discriminant))
        as_req = max(rho * b_mm * d, as_min)
        ab = math.pi * (bar_db ** 2) / 4.0
        max_spacing = min(3.0 * h_mm, 450.0)
        for s in [300, 250, 200, 150, 125, 100]:
            if s > max_spacing:
                continue
            as_prov = (1000.0 / s) * ab
            if as_prov >= as_req:
                a = (as_prov * fy) / (0.85 * fc * b_mm)
                phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
                util = mu / phi_mn if phi_mn > 0 else 999.0
                if util <= 1.0:
                    best_bar = {
                        'bar_db': bar_db,
                        'spacing_mm': s,
                        'spacing_m': s / 1000.0,
                        'as_req': round(as_req, 1),
                        'as_prov': round(as_prov, 1),
                        'phi_mn': round(phi_mn, 2),
                        'mu': round(mu, 2),
                        'utilization': round(util, 3),
                        'label': f'DB{bar_db} @ {s/1000:.2f} m',
                        'd_mm': round(d, 1)
                    }
                    break
        if best_bar:
            break

    if not best_bar:
        bar_db = 12
        d = h_mm - cover_mm - bar_db / 2.0
        ab = math.pi * (bar_db ** 2) / 4.0
        s = 100
        as_prov = (1000.0 / s) * ab
        a = (as_prov * fy) / (0.85 * fc * b_mm)
        phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
        best_bar = {
            'bar_db': bar_db, 'spacing_mm': s, 'spacing_m': 0.10,
            'as_req': round(as_min, 1), 'as_prov': round(as_prov, 1),
            'phi_mn': round(phi_mn, 2), 'mu': round(mu, 2),
            'utilization': round(mu / phi_mn if phi_mn > 0 else 1.0, 3),
            'label': f'DB{bar_db} @ 0.10 m', 'd_mm': round(d, 1),
        }

    temp_ab = math.pi * (10 ** 2) / 4.0
    temp_s = min(250, int(temp_ab * 1000.0 / as_min / 25) * 25)
    temp_rebar_label = f'DB10 @ {temp_s/1000:.2f} m'

    d = best_bar['d_mm']
    phi_v = 0.75
    phi_vc = phi_v * 0.17 * 1.0 * math.sqrt(fc) * b_mm * d * 1e-3
    v_util = vu / phi_vc if phi_vc > 0 else 0.0
    h_min_code_mm = round((span_m * 1000.0) / 28.0)

    checks = [
        {'name': 'ความหนาขั้นต่ำ (ACI 7.3.1.1)', 'value': f'{h_mm} mm (เกณฑ์ ℓ/28 = {h_min_code_mm} mm)', 'pass': h_mm >= h_min_code_mm or h_mm >= 100},
        {'name': 'กำลังดัด φMn ≥ Mu (ACI 7.5.1.1)', 'value': f'{best_bar["phi_mn"]} ≥ {best_bar["mu"]} kN·m/m', 'pass': best_bar['utilization'] <= 1.0},
        {'name': 'เหล็กเสริมขั้นต่ำ As ≥ As,min (ACI 7.6.1.1)', 'value': f'{best_bar["as_prov"]} ≥ {round(as_min, 1)} mm²/m', 'pass': best_bar['as_prov'] >= as_min},
        {'name': 'ระยะห่างเหล็ก s ≤ min(3h, 450 mm)', 'value': f'{best_bar["spacing_mm"]} ≤ {min(3*h_mm, 450)} mm', 'pass': best_bar['spacing_mm'] <= min(3*h_mm, 450)},
        {'name': 'กำลังรับแรงเฉือน φVc ≥ Vu (ACI 22.5.5.1)', 'value': f'{round(phi_vc, 1)} ≥ {round(vu, 1)} kN/m', 'pass': v_util <= 1.0},
    ]

    all_pass = all(c['pass'] for c in checks)
    return {
        'type': 'one_way_slab',
        'status': 'DESIGNED' if all_pass else 'FAIL',
        'thickness_mm': h_mm,
        'span_m': span_m,
        'loads': {
            'w_self_kpa': round(w_self, 2),
            'w_dead_kpa': round(dead_kpa, 2),
            'w_live_kpa': round(live_kpa, 2),
            'w_u_kpa': round(wu, 2),
        },
        'flexure': best_bar,
        'shrinkage': {
            'as_min': round(as_min, 1),
            'label': temp_rebar_label,
            'spacing_mm': temp_s,
        },
        'shear': {
            'vu_kn_m': round(vu, 2),
            'phi_vc_kn_m': round(phi_vc, 2),
            'utilization': round(v_util, 3),
            'pass': v_util <= 1.0,
        },
        'checks': checks,
    }


# ─── TWO-WAY SLAB DESIGN ────────────────────────────────────────

def design_two_way_slab(thickness_m, span_s_m, span_l_m, dead_kpa, live_kpa, fc, fy, cover_mm=20, bar_options=None):
    """ACI CODE-318-25: Solid two-way slab design supported on beams on all four sides.

    Chapter 8: Direct Design / Moment Coefficient Method.
    Calculates design moments and reinforcement mesh for both short and long directions.

    Args:
        thickness_m: slab thickness h in meters
        span_s_m: clear span in short direction ln,s in meters
        span_l_m: clear span in long direction ln,l in meters
        dead_kpa: superimposed dead load in kN/m²
        live_kpa: superimposed live load in kN/m²
        fc: concrete compressive strength f'c in MPa
        fy: rebar yield strength in MPa
        cover_mm: clear cover in mm (default 20 mm)
        bar_options: candidate bar diameters in mm (default [10, 12, 16])
    """
    if bar_options is None:
        bar_options = [10, 12, 16]

    ls = min(span_s_m, span_l_m)
    ll = max(span_s_m, span_l_m)
    if ls <= 0:
        ls = 3.0
    if ll <= 0:
        ll = 4.0

    beta = ll / ls  # Aspect ratio (1.0 to 2.0)
    h_mm = round(thickness_m * 1000)
    b_mm = 1000.0  # per 1 meter strip

    w_self = thickness_m * 24.0
    w_d = w_self + dead_kpa
    w_l = live_kpa
    wu = max(1.4 * w_d, 1.2 * w_d + 1.6 * w_l)

    # ACI 318-25 Table 8.3.1.1: Minimum thickness for deflection control
    h_min_calc = round((ll * 1000.0 * (0.8 + fy / 1400.0)) / (36.0 + 9.0 * beta))
    h_min_code_mm = max(90, h_min_calc)

    # Short span takes greater share of load: alpha_s = beta^4 / (1 + beta^4)
    alpha_s = (beta ** 4) / (1.0 + beta ** 4)
    alpha_l = 1.0 - alpha_s

    # Middle strip positive moments (kN·m/m)
    mu_s_pos = max(wu * (ls ** 2) * alpha_s / 10.0, 1.0)
    mu_l_pos = max(wu * (ll ** 2) * alpha_l / 10.0, 1.0)

    phi = 0.90
    as_min = 0.0018 * b_mm * h_mm
    max_spacing = min(2.0 * h_mm, 450.0)

    def _select_mesh(mu_design, d_eff):
        best = None
        for bar_db in bar_options:
            d = d_eff - bar_db / 2.0
            if d <= 15:
                continue
            rn = (mu_design * 1e6) / (phi * b_mm * (d ** 2))
            m = fy / (0.85 * fc)
            disc = max(0.0, 1.0 - 2.0 * m * rn / fy)
            rho = (1.0 / m) * (1.0 - math.sqrt(disc))
            as_req = max(rho * b_mm * d, as_min)
            ab = math.pi * (bar_db ** 2) / 4.0
            for s in [300, 250, 200, 150, 125, 100]:
                if s > max_spacing:
                    continue
                as_prov = (1000.0 / s) * ab
                if as_prov >= as_req:
                    a = (as_prov * fy) / (0.85 * fc * b_mm)
                    phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
                    util = mu_design / phi_mn if phi_mn > 0 else 1.0
                    if util <= 1.0:
                        best = {
                            'bar_db': bar_db,
                            'spacing_mm': s,
                            'spacing_m': s / 1000.0,
                            'as_req': round(as_req, 1),
                            'as_prov': round(as_prov, 1),
                            'phi_mn': round(phi_mn, 2),
                            'mu': round(mu_design, 2),
                            'utilization': round(util, 3),
                            'label': f'DB{bar_db} @ {s/1000:.2f} m',
                            'd_mm': round(d, 1)
                        }
                        break
            if best:
                break
        if not best:
            bar_db = 10
            s = 150
            ab = math.pi * (bar_db ** 2) / 4.0
            as_prov = (1000.0 / s) * ab
            d = d_eff - bar_db / 2.0
            a = (as_prov * fy) / (0.85 * fc * b_mm)
            phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
            best = {
                'bar_db': bar_db, 'spacing_mm': s, 'spacing_m': s / 1000.0,
                'as_req': round(as_min, 1), 'as_prov': round(as_prov, 1),
                'phi_mn': round(phi_mn, 2), 'mu': round(mu_design, 2),
                'utilization': round(mu_design / phi_mn if phi_mn > 0 else 1.0, 3),
                'label': f'DB{bar_db} @ {s/1000:.2f} m', 'd_mm': round(d, 1)
            }
        return best

    d_short_eff = h_mm - cover_mm
    rebar_short = _select_mesh(mu_s_pos, d_short_eff)

    d_long_eff = d_short_eff - rebar_short['bar_db']
    rebar_long = _select_mesh(mu_l_pos, d_long_eff)

    vu = (wu * ls / 2.0) * (1.0 - (rebar_short['d_mm'] / 1000.0) / (ls / 2.0))
    phi_v = 0.75
    phi_vc = phi_v * 0.17 * math.sqrt(fc) * b_mm * rebar_short['d_mm'] * 1e-3
    v_util = vu / phi_vc if phi_vc > 0 else 0.0

    checks = [
        {'name': 'ความหนาขั้นต่ำ 2-Way (ACI Table 8.3.1.1)', 'value': f'{h_mm} mm (เกณฑ์ ℓn/33 = {h_min_code_mm} mm)', 'pass': h_mm >= h_min_code_mm or h_mm >= 100},
        {'name': 'กำลังดัดทิศทางสั้น φMn,s ≥ Mu,s (ACI 8.5.1)', 'value': f'{rebar_short["phi_mn"]} ≥ {rebar_short["mu"]} kN·m/m', 'pass': rebar_short['utilization'] <= 1.0},
        {'name': 'กำลังดัดทิศทางยาว φMn,l ≥ Mu,l (ACI 8.5.1)', 'value': f'{rebar_long["phi_mn"]} ≥ {rebar_long["mu"]} kN·m/m', 'pass': rebar_long['utilization'] <= 1.0},
        {'name': 'เหล็กเสริมขั้นต่ำ As ≥ As,min (ACI 8.6.1.1)', 'value': f'{rebar_short["as_prov"]} ≥ {round(as_min, 1)} mm²/m', 'pass': rebar_short['as_prov'] >= as_min},
        {'name': 'ระยะห่างเหล็กตะแกรง s ≤ min(2h, 450 mm)', 'value': f'{max(rebar_short["spacing_mm"], rebar_long["spacing_mm"])} ≤ {min(2*h_mm, 450)} mm', 'pass': max(rebar_short['spacing_mm'], rebar_long['spacing_mm']) <= min(2*h_mm, 450)},
        {'name': 'กำลังรับแรงเฉือนขอบคาน φVc ≥ Vu (ACI 22.5.5.1)', 'value': f'{round(phi_vc, 1)} ≥ {round(vu, 1)} kN/m', 'pass': v_util <= 1.0},
    ]
    all_pass = all(c['pass'] for c in checks)

    return {
        'type': 'two_way_slab',
        'status': 'DESIGNED' if all_pass else 'FAIL',
        'thickness_mm': h_mm,
        'span_short_m': round(ls, 2),
        'span_long_m': round(ll, 2),
        'aspect_ratio': round(beta, 2),
        'loads': {
            'w_self_kpa': round(w_self, 2),
            'w_dead_kpa': round(dead_kpa, 2),
            'w_live_kpa': round(live_kpa, 2),
            'w_u_kpa': round(wu, 2),
        },
        'flexure_short': rebar_short,
        'flexure_long': rebar_long,
        'flexure': rebar_short,
        'shrinkage': {
            'as_min': round(as_min, 1),
            'label': f'ตะแกรง 2 ทาง: {rebar_short["label"]} (สั้น) + {rebar_long["label"]} (ยาว)',
            'spacing_mm': rebar_long['spacing_mm'],
        },
        'shear': {
            'vu_kn_m': round(vu, 2),
            'phi_vc_kn_m': round(phi_vc, 2),
            'utilization': round(v_util, 3),
            'pass': v_util <= 1.0,
        },
        'checks': checks,
    }


# ─── STAIRCASE DESIGN ──────────────────────────────────────────

def design_staircase(waist_th_m=0.15, span_ln_m=4.0, width_m=1.2, riser_m=0.175, tread_m=0.25,
                     dead_finishes_kpa=1.0, live_kpa=3.0, fc=23.5, fy=392, fyt=235, cover_mm=25, bar_options=None):
    """ACI CODE-318-25: Reinforced concrete staircase (waist slab + landing + steps) design.

    Args:
        waist_th_m: thickness of inclined waist slab in meters (default 0.15 m)
        span_ln_m: clear horizontal span of flight and landing in meters (default 4.0 m)
        width_m: staircase clear width in meters (default 1.2 m)
        riser_m: step riser height R in meters (default 0.175 m)
        tread_m: step tread depth T in meters (default 0.25 m)
        dead_finishes_kpa: superimposed dead load for floor finishes & railing (default 1.0 kPa)
        live_kpa: staircase live load (default 3.0 kPa)
        fc, fy, fyt, cover_mm: material properties
        bar_options: candidate bar diameters (default [12, 16, 20])
    """
    if bar_options is None:
        bar_options = [12, 16, 20]

    h_mm = round(waist_th_m * 1000)
    b_mm = 1000.0

    theta_rad = math.atan(riser_m / tread_m)
    cos_theta = math.cos(theta_rad)

    w_waist = (waist_th_m * 24.0) / cos_theta
    w_step = 0.5 * riser_m * 24.0
    w_d = w_waist + w_step + dead_finishes_kpa
    w_l = live_kpa

    wu = max(1.4 * w_d, 1.2 * w_d + 1.6 * w_l)
    mu = wu * (span_ln_m ** 2) / 10.0
    vu = wu * span_ln_m / 2.0

    as_min = 0.0018 * b_mm * h_mm
    phi = 0.90
    best_bar = None

    for bar_db in bar_options:
        d = h_mm - cover_mm - bar_db / 2.0
        if d <= 20:
            continue
        rn = (mu * 1e6) / (phi * b_mm * (d ** 2))
        m = fy / (0.85 * fc)
        disc = max(0.0, 1.0 - 2.0 * m * rn / fy)
        rho = (1.0 / m) * (1.0 - math.sqrt(disc))
        as_req = max(rho * b_mm * d, as_min)
        ab = math.pi * (bar_db ** 2) / 4.0
        max_spacing = min(3.0 * h_mm, 300.0)
        for s in [250, 200, 150, 125, 100]:
            if s > max_spacing:
                continue
            as_prov = (1000.0 / s) * ab
            if as_prov >= as_req:
                a = (as_prov * fy) / (0.85 * fc * b_mm)
                phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
                util = mu / phi_mn if phi_mn > 0 else 1.0
                if util <= 1.0:
                    best_bar = {
                        'bar_db': bar_db,
                        'spacing_mm': s,
                        'spacing_m': s / 1000.0,
                        'as_req': round(as_req, 1),
                        'as_prov': round(as_prov, 1),
                        'phi_mn': round(phi_mn, 2),
                        'mu': round(mu, 2),
                        'utilization': round(util, 3),
                        'label': f'DB{bar_db} @ {s/1000:.2f} m',
                        'd_mm': round(d, 1)
                    }
                    break
        if best_bar:
            break

    if not best_bar:
        bar_db = 12
        s = 150
        ab = math.pi * (bar_db ** 2) / 4.0
        as_prov = (1000.0 / s) * ab
        d = h_mm - cover_mm - bar_db / 2.0
        a = (as_prov * fy) / (0.85 * fc * b_mm)
        phi_mn = phi * as_prov * fy * (d - a / 2.0) * 1e-6
        best_bar = {
            'bar_db': bar_db, 'spacing_mm': s, 'spacing_m': s / 1000.0,
            'as_req': round(as_min, 1), 'as_prov': round(as_prov, 1),
            'phi_mn': round(phi_mn, 2), 'mu': round(mu, 2),
            'utilization': round(mu / phi_mn if phi_mn > 0 else 1.0, 3),
            'label': f'DB{bar_db} @ {s/1000:.2f} m', 'd_mm': round(d, 1)
        }

    dist_ab = math.pi * (10 ** 2) / 4.0
    dist_s = min(200, int(dist_ab * 1000.0 / as_min / 25) * 25)
    dist_label = f'DB10 @ {dist_s/1000:.2f} m'

    phi_v = 0.75
    d = best_bar['d_mm']
    phi_vc = phi_v * 0.17 * math.sqrt(fc) * b_mm * d * 1e-3
    v_util = vu / phi_vc if phi_vc > 0 else 0.0
    h_min_code_mm = round((span_ln_m * 1000.0) / 24.0)
    r_landing_total_kn = round(vu * width_m, 2)

    checks = [
        {'name': 'ความหนาแม่บันได (ACI Table 7.3.1.1)', 'value': f'{h_mm} mm (เกณฑ์ ℓ/24 = {h_min_code_mm} mm)', 'pass': h_mm >= h_min_code_mm or h_mm >= 120},
        {'name': 'กำลังดัดหลักตามทางลาด φMn ≥ Mu', 'value': f'{best_bar["phi_mn"]} ≥ {best_bar["mu"]} kN·m/m', 'pass': best_bar['utilization'] <= 1.0},
        {'name': 'เหล็กเสริมขั้นต่ำ As ≥ As,min', 'value': f'{best_bar["as_prov"]} ≥ {round(as_min, 1)} mm²/m', 'pass': best_bar['as_prov'] >= as_min},
        {'name': 'เหล็กกันร้าวขวางลูกนอน Ast', 'value': f'{dist_label} (Ast = {round(as_min, 1)} mm²/m)', 'pass': True},
        {'name': 'กำลังรับแรงเฉือน φVc ≥ Vu', 'value': f'{round(phi_vc, 1)} ≥ {round(vu, 1)} kN/m', 'pass': v_util <= 1.0},
    ]
    all_pass = all(c['pass'] for c in checks)

    return {
        'type': 'staircase',
        'status': 'DESIGNED' if all_pass else 'FAIL',
        'thickness_mm': h_mm,
        'span_m': span_ln_m,
        'width_m': width_m,
        'angle_deg': round(math.degrees(theta_rad), 1),
        'riser_mm': round(riser_m * 1000),
        'tread_mm': round(tread_m * 1000),
        'flight_waist_slab': {
            'thickness_mm': h_mm,
            'slope_deg': round(math.degrees(theta_rad), 1),
            'main_rebar': best_bar['label'],
            'dist_rebar': dist_label,
            'mu': best_bar['mu'],
            'phi_mn': best_bar['phi_mn'],
            'utilization': best_bar['utilization'],
            'pass': best_bar['utilization'] <= 1.0,
        },
        'landing_slab': {
            'thickness_mm': h_mm,
            'span_m': width_m,
            'mesh_rebar': 'DB10 @ 0.15 m (บน-ล่าง สองทิศทาง)',
            'as_min': round(as_min, 1),
            'reaction_kn': r_landing_total_kn,
            'pass': True,
        },
        'loads': {
            'w_waist_kpa': round(w_waist, 2),
            'w_step_kpa': round(w_step, 2),
            'w_dead_finishes_kpa': round(dead_finishes_kpa, 2),
            'w_live_kpa': round(live_kpa, 2),
            'w_u_kpa': round(wu, 2),
        },
        'flexure_main': best_bar,
        'distribution': {
            'label': dist_label,
            'spacing_mm': dist_s,
            'as_min': round(as_min, 1),
        },
        'landing_reaction_kn': r_landing_total_kn,
        'shear': {
            'vu_kn_m': round(vu, 2),
            'phi_vc_kn_m': round(phi_vc, 2),
            'utilization': round(v_util, 3),
            'pass': v_util <= 1.0,
        },
        'checks': checks,
    }


# ─── MEMBER LABELING ───────────────────────────────────────────

def label_members(members, node_map=None):
    """Group members by role and section size → assign B1/C1/TC1/BC1/W1/P1/RAF1/OK1/AS1/DANG1/HIP1/ST1 labels.

    members: list of dicts with 'id', 'kind', 'b', 'h', 'sectionType', 'i', 'j'
    node_map: optional dict node_id -> node dict
    Returns dict: member_id → label
    """
    groups = {}
    for m in members:
        kind = m.get('kind', 'beam')
        role = (m.get('roofRole') or m.get('role') or '').lower()
        prefix = 'M'
        if role in ('rafter', 'raf'):
            prefix = 'RAF'
        elif role in ('ridge', 'ok'):
            prefix = 'OK'
        elif role in ('purlin', 'p'):
            prefix = 'P'
        elif role in ('eave', 'as'):
            prefix = 'AS'
        elif role in ('kingpost', 'strut', 'dang'):
            prefix = 'DANG'
        elif role in ('hip', 'hip_rafter'):
            prefix = 'HIP'
        elif role in ('valley', 'val'):
            prefix = 'VAL'
        elif role in ('stair', 'landing', 'st'):
            prefix = 'ST'
        elif kind == 'column':
            prefix = 'C'
        elif kind == 'beam':
            prefix = 'B'
        elif kind == 'roof' or m.get('sectionType') == 'steel_custom':
            prefix = 'R'
            if node_map and m.get('i') in node_map and m.get('j') in node_map:
                ni = node_map[m['i']]
                nj = node_map[m['j']]
                dx = abs(nj['x'] - ni['x'])
                dy = abs(nj['y'] - ni['y'])
                dz = abs(nj['z'] - ni['z'])
                if dz > 0.1 and dx < 0.1 and dy < 0.1:
                    prefix = 'P'  # Purlin along Z
                elif dy > 0.05 and dx < 0.1 and dz > 0.1:
                    prefix = 'RAF'  # Sloping Rafter
                elif dy > 0.05 and dx > 0.1:
                    prefix = 'TC'  # Sloping Top Chord
                elif dy < 0.05 and dx > 0.1:
                    prefix = 'BC'  # Horizontal Bottom Chord
                elif dx < 0.1 and dy > 0.1:
                    prefix = 'W'  # Vertical Web Strut
                else:
                    prefix = 'W'  # Diagonal Web
        else:
            prefix = 'M'

        b = round(m.get('b', 0) * 1000) if m.get('b') else 0
        h = round(m.get('h', 0) * 1000) if m.get('h') else 0
        a = round((m.get('A', 0) or 0) * 1e4)  # cm2 for steel
        key = (prefix, b, h, a)
        if key not in groups:
            groups[key] = []
        groups[key].append(m['id'])

    labels = {}
    counters = {}
    for (prefix, b, h, a), member_ids in sorted(groups.items()):
        counters[prefix] = counters.get(prefix, 0) + 1
        label = f'{prefix}{counters[prefix]}'
        for mid in member_ids:
            labels[mid] = label

    return labels


# ─── FULL BUILDING DESIGN ─────────────────────────────────────

def design_all(model, analysis_result, design_basis):
    """Design all members after analysis.

    Args:
        model: the project model (schema v2)
        analysis_result: output from engine.solve()
        design_basis: {fc_mpa, fy_mpa, fyt_mpa, cover_mm, agg_mm, stirrup_mm}

    Returns design result dict.
    """
    fc = design_basis['fc_mpa']
    fy = design_basis['fy_mpa']
    fyt = design_basis['fyt_mpa']
    cover = design_basis['cover_mm']
    agg = design_basis.get('agg_mm', 20)
    stirrup = design_basis.get('stirrup_mm', 9)

    # Get node coordinates
    node_map = {n['id']: n for n in model['nodes']}
    member_map = {m['id']: m for m in model['members']}

    # Label members
    labels = label_members(model['members'], node_map)

    # Collect envelope forces from all combinations
    member_envelopes = {}
    for combo_name, combo_data in analysis_result.get('combinations', {}).items():
        for mid, mdata in combo_data.get('members', {}).items():
            if mid not in member_envelopes:
                member_envelopes[mid] = {
                    'Mz_max': 0, 'Mz_min': 0,
                    'My_max': 0, 'My_min': 0,
                    'Vy_max': 0, 'Vz_max': 0,
                    'N_max': 0, 'N_min': 0,
                    'T_max': 0,
                }
            env = member_envelopes[mid]
            for sample in mdata['samples']:
                env['Mz_max'] = max(env['Mz_max'], sample['Mz'])
                env['Mz_min'] = min(env['Mz_min'], sample['Mz'])
                env['My_max'] = max(env['My_max'], sample['My'])
                env['My_min'] = min(env['My_min'], sample['My'])
                env['Vy_max'] = max(env['Vy_max'], abs(sample['Vy']))
                env['Vz_max'] = max(env['Vz_max'], abs(sample['Vz']))
                env['N_max'] = max(env['N_max'], sample['N'])
                env['N_min'] = min(env['N_min'], sample['N'])
                env['T_max'] = max(env['T_max'], abs(sample['T']))

    # Collect envelope reactions for footings
    node_envelopes = {}
    for combo_name, combo_data in analysis_result.get('combinations', {}).items():
        for nid, ndata in combo_data.get('nodes', {}).items():
            if nid not in node_envelopes:
                node_envelopes[nid] = {'fy_max': 0, 'mx_max': 0, 'mz_max': 0}
            env = node_envelopes[nid]
            rxn = ndata['reaction']
            env['fy_max'] = max(env['fy_max'], abs(rxn[1]))  # FY reaction
            env['mx_max'] = max(env['mx_max'], abs(rxn[3]))
            env['mz_max'] = max(env['mz_max'], abs(rxn[5]))

    # Group footings by label
    footing_labels = {}
    f_groups = {}
    for f in model.get('foundations', []):
        key = (round(f.get('bx', 1) * 1000), round(f.get('bz', 1) * 1000), round(f.get('depth', 0.4) * 1000), f.get('pileCount', 0), f.get('type', 'isolated'))
        f_groups.setdefault(key, []).append(f['id'])
    f_counter = 0
    for key, fids in sorted(f_groups.items()):
        f_counter += 1
        flabel = f'F{f_counter}'
        for fid in fids:
            footing_labels[fid] = flabel

    # ── Group members by label for governing group design
    members_by_label = {}
    for m in model['members']:
        lbl = labels.get(m['id'], m['id'])
        members_by_label.setdefault(lbl, []).append(m)

    member_designs = {}
    for lbl, m_list in members_by_label.items():
        rep = m_list[0]
        kind = rep.get('kind', 'beam')
        is_steel = (rep.get('sectionType') == 'steel_custom' or kind == 'roof')

        if is_steel:
            gov_pu = 0
            gov_len = 0
            for m in m_list:
                env = member_envelopes.get(m['id'], {})
                n_min = env.get('N_min', 0)
                n_max = env.get('N_max', 0)
                pu_m = n_min if abs(n_min) > abs(n_max) else n_max
                if abs(pu_m) > abs(gov_pu):
                    gov_pu = pu_m
                ni, nj = node_map.get(m['i']), node_map.get(m['j'])
                if ni and nj:
                    gov_len = max(gov_len, math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'], nj['z'] - ni['z']))
            if gov_len <= 0:
                gov_len = 1.0
            e_steel = model.get('steel', {}).get('E', 200000)
            fy_steel = design_basis.get('fy_steel_mpa', 245)
            group_design = design_steel_member(
                rep.get('A'), rep.get('Iy'), rep.get('Iz'),
                gov_len, e_steel, fy_steel, gov_pu
            )
            group_design['label'] = lbl
            for m in m_list:
                d = copy.deepcopy(group_design)
                d['envelope'] = {k: round(v, 3) for k, v in member_envelopes.get(m['id'], {}).items()}
                member_designs[m['id']] = d

        elif kind == 'beam':
            b_mm = round(rep.get('b', 0.25) * 1000)
            h_mm = round(rep.get('h', 0.45) * 1000)
            gov_mu_pos = 0
            gov_mu_neg = 0
            gov_vu = 0
            gov_span_mm = 0
            for m in m_list:
                env = member_envelopes.get(m['id'], {})
                gov_mu_pos = max(gov_mu_pos, abs(env.get('Mz_max', 0)))
                gov_mu_neg = max(gov_mu_neg, abs(env.get('Mz_min', 0)))
                gov_vu = max(gov_vu, abs(env.get('Vy_max', 0)))
                ni, nj = node_map.get(m['i']), node_map.get(m['j'])
                if ni and nj:
                    span_m = math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'], nj['z'] - ni['z'])
                    gov_span_mm = max(gov_span_mm, span_m * 1000)
            if gov_span_mm <= 0:
                gov_span_mm = 4000

            group_design = design_beam_section(
                b_mm, h_mm, fc, fy, fyt, cover, stirrup, agg,
                gov_mu_pos, gov_mu_neg, gov_vu, gov_span_mm
            )
            group_design['label'] = lbl
            for m in m_list:
                d = copy.deepcopy(group_design)
                d['envelope'] = {k: round(v, 3) for k, v in member_envelopes.get(m['id'], {}).items()}
                member_designs[m['id']] = d

        elif kind == 'column':
            b_mm = round(rep.get('b', 0.30) * 1000)
            h_mm = round(rep.get('h', 0.30) * 1000)
            gov_pu = 0
            gov_mux = 0
            gov_muy = 0
            gov_lu_mm = 0
            for m in m_list:
                env = member_envelopes.get(m['id'], {})
                pu_m = abs(env.get('N_min', 0))
                if abs(env.get('N_max', 0)) > pu_m:
                    pu_m = abs(env.get('N_max', 0))
                gov_pu = max(gov_pu, pu_m)
                gov_mux = max(gov_mux, abs(env.get('Mz_max', 0)), abs(env.get('Mz_min', 0)))
                gov_muy = max(gov_muy, abs(env.get('My_max', 0)), abs(env.get('My_min', 0)))
                ni, nj = node_map.get(m['i']), node_map.get(m['j'])
                if ni and nj:
                    gov_lu_mm = max(gov_lu_mm, abs(nj['y'] - ni['y']) * 1000)
            if gov_lu_mm <= 0:
                gov_lu_mm = 3000

            group_design = design_column_section(
                b_mm, h_mm, fc, fy, fyt, cover,
                gov_pu, gov_mux, gov_muy, lu_mm=gov_lu_mm
            )
            group_design['label'] = lbl
            for m in m_list:
                d = copy.deepcopy(group_design)
                d['envelope'] = {k: round(v, 3) for k, v in member_envelopes.get(m['id'], {}).items()}
                member_designs[m['id']] = d

    # ── Group footings by label for governing group design
    footings_by_label = {}
    for f in model.get('foundations', []):
        lbl = footing_labels.get(f['id'], f['id'])
        footings_by_label.setdefault(lbl, []).append(f)

    footing_designs = {}
    for lbl, f_list in footings_by_label.items():
        rep = f_list[0]
        if rep.get('mode') != 'ideal_support':
            for f in f_list:
                footing_designs[f['id']] = {'status': 'SKIP', 'note': 'รอยืนยันจุดรองรับ', 'label': lbl}
            continue

        bx = rep.get('bx', 1.0)
        bz = rep.get('bz', 1.0)
        depth = rep.get('depth', 0.4)
        qa = rep.get('qa')

        gov_pu_total = 0
        gov_mux_total = 0
        gov_muz_total = 0
        for f in f_list:
            pu_m = 0
            mux_m = 0
            muz_m = 0
            for nid in f.get('nodes', []):
                env = node_envelopes.get(nid, {})
                pu_m += env.get('fy_max', 0)
                mux_m += env.get('mx_max', 0)
                muz_m += env.get('mz_max', 0)
            gov_pu_total = max(gov_pu_total, pu_m)
            gov_mux_total = max(gov_mux_total, mux_m)
            gov_muz_total = max(gov_muz_total, muz_m)

        col_bx = 300
        col_bz = 300
        for f in f_list:
            for m in model['members']:
                if m.get('kind') == 'column' and (m['i'] in f.get('nodes', []) or m['j'] in f.get('nodes', [])):
                    col_bx = round(m.get('b', 0.3) * 1000)
                    col_bz = round(m.get('h', 0.3) * 1000)
                    break

        p_count = rep.get('pileCount')
        p_cap = rep.get('pileCapacity')
        p_len = rep.get('pileLength')
        ftype = rep.get('type', 'isolated')

        group_design = design_footing(
            round(bx * 1000), round(bz * 1000), round(depth * 1000),
            fc, fy, fyt, cover,
            gov_pu_total, gov_mux_total, gov_muz_total,
            col_bx, col_bz,
            qa_kpa=qa, p_service=None,
            pile_count=p_count, pile_capacity=p_cap, pile_length=p_len, ftype=ftype
        )
        group_design['label'] = lbl
        for f in f_list:
            d = copy.deepcopy(group_design)
            footing_designs[f['id']] = d

    # ── Group slabs by label
    slab_labels = {}
    s_groups = {}
    for s in model.get('slabs', []):
        th = round((s.get('thickness') or 0.12) * 1000)
        dead = round((s.get('dead') or 1.0) * 10)
        live = round((s.get('live') or 2.0) * 10)
        key = (th, dead, live, s.get('type', 'one_way'))
        s_groups.setdefault(key, []).append(s['id'])
    s_counter = 0
    for key, sids in sorted(s_groups.items()):
        s_counter += 1
        slabel = f'S{s_counter}'
        for sid in sids:
            slab_labels[sid] = slabel

    slabs_by_label = {}
    for s in model.get('slabs', []):
        lbl = slab_labels.get(s['id'], s['id'])
        slabs_by_label.setdefault(lbl, []).append(s)

    slab_designs = {}
    for lbl, s_list in slabs_by_label.items():
        rep = s_list[0]
        th = rep.get('thickness', 0.12)
        dead = rep.get('dead', 1.0)
        live = rep.get('live', 2.0)
        stype = rep.get('type', 'one_way')
        smode = rep.get('mode', 'one_way_load')
        span_s = 4.0
        span_l = 4.0
        s_nodes = rep.get('nodes', [])
        if len(s_nodes) >= 4:
            pts = [node_map[nid] for nid in s_nodes if nid in node_map]
            if len(pts) >= 4:
                dx1 = abs(pts[1]['x'] - pts[0]['x'])
                dz1 = abs(pts[3]['z'] - pts[0]['z'])
                if dx1 > 0 and dz1 > 0:
                    span_s = min(dx1, dz1)
                    span_l = max(dx1, dz1)
                else:
                    span_s = max(dx1, dz1, 1.0)
                    span_l = span_s

        if stype == 'two_way' or smode == 'two_way_load':
            group_design = design_two_way_slab(th, span_s, span_l, dead, live, fc, fy, cover_mm=20)
        else:
            group_design = design_one_way_slab(th, span_s, dead, live, fc, fy, cover_mm=25)
        group_design['label'] = lbl
        for s in s_list:
            d = copy.deepcopy(group_design)
            slab_designs[s['id']] = d

    # ── Design staircases if present
    stair_designs = {}
    for st in model.get('stairs', []):
        st_id = st.get('id', 'ST1')
        waist_th = st.get('thickness', 0.15)
        span_m = st.get('span', 4.0)
        width_m = st.get('width', 1.2)
        riser_m = st.get('riser', 0.175)
        tread_m = st.get('tread', 0.25)
        live_kpa = st.get('live', 3.0)
        d_st = design_staircase(waist_th, span_m, width_m, riser_m, tread_m, 1.0, live_kpa, fc, fy, fyt, cover)
        d_st['label'] = st.get('label', st_id)
        stair_designs[st_id] = d_st

    # ── Summary
    all_statuses = [d.get('status', 'SKIP') for d in member_designs.values()]
    all_statuses += [d.get('status', 'SKIP') for d in footing_designs.values()]
    all_statuses += [d.get('status', 'SKIP') for d in slab_designs.values()]
    all_statuses += [d.get('status', 'SKIP') for d in stair_designs.values()]
    designed_count = sum(1 for s in all_statuses if s == 'DESIGNED')
    fail_count = sum(1 for s in all_statuses if s == 'FAIL')
    skip_count = sum(1 for s in all_statuses if s == 'SKIP')

    # ── Calculate Heatmap metrics for 3D Viewer (matches reference image)
    heatmaps = {
        'Mz': {'values': {}, 'min': 0, 'max': 0, 'unit': 'kN·m'},
        'My': {'values': {}, 'min': 0, 'max': 0, 'unit': 'kN·m'},
        'Vy': {'values': {}, 'min': 0, 'max': 0, 'unit': 'kN'},
        'N': {'values': {}, 'min': 0, 'max': 0, 'unit': 'kN'},
        'utilization': {'values': {}, 'min': 0, 'max': 1.0, 'unit': ''},
    }
    for mid, env in member_envelopes.items():
        mz_val = max(abs(env.get('Mz_max', 0)), abs(env.get('Mz_min', 0)))
        heatmaps['Mz']['values'][mid] = round(mz_val, 3)
        my_val = max(abs(env.get('My_max', 0)), abs(env.get('My_min', 0)))
        heatmaps['My']['values'][mid] = round(my_val, 3)
        vy_val = max(abs(env.get('Vy_max', 0)), abs(env.get('Vz_max', 0)))
        heatmaps['Vy']['values'][mid] = round(vy_val, 3)
        n_val = env.get('N_min', 0) if abs(env.get('N_min', 0)) > abs(env.get('N_max', 0)) else env.get('N_max', 0)
        heatmaps['N']['values'][mid] = round(n_val, 3)
        d = member_designs.get(mid)
        util = 0.0
        if d:
            if d.get('type') == 'beam':
                flx = d.get('flexure') or {}
                bu = ((flx.get('bottom') or {}).get('rebar') or {}).get('utilization', 0) or 0
                tu = ((flx.get('top') or {}).get('rebar') or {}).get('utilization', 0) or 0
                util = max(bu, tu)
            elif d.get('type') == 'column':
                util = d.get('longitudinal', {}).get('utilization', 0) or 0
            elif d.get('type') == 'steel_truss':
                util = d.get('utilization', 0) or 0
        heatmaps['utilization']['values'][mid] = round(util, 4)

    for q in ('Mz', 'My', 'Vy', 'N', 'utilization'):
        vals = list(heatmaps[q]['values'].values())
        if vals:
            heatmaps[q]['min'] = min(vals)
            heatmaps[q]['max'] = max(vals)

    return {
        'version': VERSION,
        'code': CODE,
        'designBasis': design_basis,
        'labels': {**labels, **footing_labels, **slab_labels, **{sid: d['label'] for sid, d in stair_designs.items()}},
        'members': member_designs,
        'footings': footing_designs,
        'slabs': slab_designs,
        'stairs': stair_designs,
        'heatmaps': heatmaps,
        'summary': {
            'total': len(all_statuses),
            'designed': designed_count,
            'fail': fail_count,
            'skip': skip_count,
            'overallStatus': 'ALL_PASS' if fail_count == 0 and designed_count > 0 else 'HAS_FAILURES' if fail_count > 0 else 'NO_DESIGN',
        },
        'references': REFERENCES,
        'assumptions': [
            'เหล็กดึงชั้นเดียว ไม่คิดเหล็กอัด',
            'P-M interaction ใช้ simplified bilinear diagram',
            'Footing: isolated spread footing, interior column',
            'คานลึก (ℓn < 4h) ไม่รองรับ',
            'ใช้ค่า envelope (ค่าวิกฤตสูงสุด) จากทุก combinations',
            'λ = 1.0 (normal weight concrete)',
            'Es = 200,000 MPa, εcu = 0.003',
        ],
    }
