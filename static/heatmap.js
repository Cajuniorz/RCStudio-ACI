// Visualisation helpers for the 3D colour map.
// Values are solver member actions in internal units (kN, kN·m).
// This is NOT an applied-load map and NOT a structural-capacity check.
//
// key: 'resultant' = |N,Vy,Vz| (kN), 'N' | 'Vy' | 'Vz' (kN), 'Mz' | 'My' (kN·m)

// 'M' / 'V' = governing bending / shear plane: max(|Mz|,|My|) and max(|Vy|,|Vz|). A beam under gravity bends about
// local z in Y-up models but about local y in Z-up models, so a single-axis key would paint it as 'no force'.
const COMPOUND = { M: ['Mz', 'My'], V: ['Vy', 'Vz'] };
const KEYS = new Set(['resultant', 'N', 'Vy', 'Vz', 'Mz', 'My', 'M', 'V']);
const compoundAt = (key, get) => {
 let best = null;
 for (const c of COMPOUND[key]) {
  const v = get(c);
  if (Number.isFinite(v) && (best === null || Math.abs(v) > best)) best = Math.abs(v);
 }
 return best;
};

const sampleMagnitude = s => (Number.isFinite(s?.N) && Number.isFinite(s?.Vy) && Number.isFinite(s?.Vz))
 ? Math.hypot(s.N, s.Vy, s.Vz) : null;

const sampleValue = (s, key) => {
 if (!s) return null;
 if (key === 'resultant') return sampleMagnitude(s);
 if (COMPOUND[key]) return compoundAt(key, c => s[c]);
 const v = s[key];
 return Number.isFinite(v) ? Math.abs(v) : null;
};

// the same member result is sampled once per geometry vertex, so cache the sort per object
const sortedCache = new WeakMap();
const samplesOf = memberResult => {
 if (!memberResult || typeof memberResult !== 'object') return null;
 const cached = sortedCache.get(memberResult);
 if (cached !== undefined) return cached;
 const samples = memberResult.samples, length = memberResult.length;
 let result = null;
 if (Array.isArray(samples) && samples.length && Number.isFinite(length) && length > 0
     && !samples.some(s => sampleMagnitude(s) === null)) {
  result = [...samples].sort((a, b) => a.x - b.x);
 }
 sortedCache.set(memberResult, result);
 return result;
};

// Interpolated value at 0..1 along the member, or null when the result is unusable.
export function stationValueKN(memberResult, t, key = 'resultant') {
 if (!KEYS.has(key) || !Number.isFinite(t)) return null;
 const samples = samplesOf(memberResult);
 if (!samples) return null;
 const x = Math.max(0, Math.min(1, t)) * memberResult.length;
 if (x <= samples[0].x) return sampleValue(samples[0], key);
 const last = samples[samples.length - 1];
 if (x >= last.x) return sampleValue(last, key);
 for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  if (x <= b.x) {
   const span = b.x - a.x, alpha = span > 0 ? (x - a.x) / span : 1;
   if (key === 'resultant') {
    // interpolate the vector, then take its magnitude - never interpolate magnitudes
    return Math.hypot(
     a.N + (b.N - a.N) * alpha,
     a.Vy + (b.Vy - a.Vy) * alpha,
     a.Vz + (b.Vz - a.Vz) * alpha
    );
   }
   if (COMPOUND[key]) return compoundAt(key, c => a[c] + (b[c] - a[c]) * alpha);
   return Math.abs(a[key] + (b[key] - a[key]) * alpha);
  }
 }
 return null;
}

// Own range of one member along its length (21 stations), null when unusable.
export function memberRangeKN(memberResult, key = 'resultant') {
 const samples = samplesOf(memberResult);
 if (!samples) return null;
 let min = Infinity, max = -Infinity;
 for (let i = 0; i <= 20; i++) {
  const v = stationValueKN(memberResult, i / 20, key);
  if (v === null) return null;
  if (v < min) min = v;
  if (v > max) max = v;
 }
 return { min, max };
}

export function peakStation(memberResult, key = 'resultant') {
 const samples = samplesOf(memberResult);
 if (!samples) return null;
 const length = memberResult.length;
 let peak = null;
 for (const s of samples) {
  const value = sampleValue(s, key);
  if (value === null || s.x < 0 || s.x > length + 1e-6) return null;
  if (!peak || value > peak.value) peak = { x: s.x, t: Math.min(1, s.x / length), value };
 }
 return peak;
}

// Range across the stations of the given members, or null when no usable result exists.
export function rangeKN(members, results, key = 'resultant') {
 if (!results) return null;
 let min = Infinity, max = -Infinity, found = false;
 for (const member of members) {
  const samples = samplesOf(results[member.id]);
  if (!samples) continue;
  for (const s of samples) {
   const v = sampleValue(s, key);
   if (v === null) continue;
   if (v < min) min = v;
   if (v > max) max = v;
   found = true;
  }
 }
 return found ? { min, max } : null;
}

// Range per member group so secondary members (purlins) are not flattened by columns.
export function rangeByGroupKN(members, results, key = 'resultant', groupOf) {
 if (!results) return null;
 const groups = {};
 for (const member of members) {
  const samples = samplesOf(results[member.id]);
  if (!samples) continue;
  const group = groupOf(member);
  const bucket = groups[group] || (groups[group] = { min: Infinity, max: -Infinity });
  for (const s of samples) {
   const v = sampleValue(s, key);
   if (v === null) continue;
   if (v < bucket.min) bucket.min = v;
   if (v > bucket.max) bucket.max = v;
  }
 }
 for (const [group, bucket] of Object.entries(groups)) {
  if (!Number.isFinite(bucket.min) || !Number.isFinite(bucket.max)) delete groups[group];
 }
 return Object.keys(groups).length ? groups : null;
}

export function memberGroupOf(member) {
 if (member?.kind === 'column') return 'column';
 if (member?.kind === 'beam') return 'beam';
 return 'roof';
}

export const GROUP_LABELS = { column: 'เสา', beam: 'คาน', roof: 'หลังคา/แป' };

// ── Signed values for diverging colour maps ──────────────────────────────────────────────────────────────────
// |value| colouring folds sagging/hogging (and tension/compression) onto one scale: a member whose moment goes
// +8 -> 0 -> -8 then shows a "V" of colour with a false cold spot in the middle. Signed colouring is continuous
// through zero. For compound keys M/V the member's dominant component (largest peak) is used, so one member never
// flips between Mz and My along its length.
const SIGNED_KEYS = new Set(['N', 'Vy', 'Vz', 'Mz', 'My', 'M', 'V']);
export const isSignedKey = key => SIGNED_KEYS.has(key);
const dominantCache = new WeakMap();
export function dominantComponent(memberResult, key) {
  if (!COMPOUND[key]) return key;
  const samples = samplesOf(memberResult);
  if (!samples) return null;
  const cached = dominantCache.get(memberResult);
  if (cached && cached[key]) return cached[key];
  let best = COMPOUND[key][0], bestPeak = -1;
  for (const c of COMPOUND[key]) {
    let peak = 0;
    for (const s of samples) if (Number.isFinite(s[c])) peak = Math.max(peak, Math.abs(s[c]));
    if (peak > bestPeak + 1e-12) { bestPeak = peak; best = c; }
  }
  dominantCache.set(memberResult, { ...(cached || {}), [key]: best });
  return best;
}

// Interpolated SIGNED value at 0..1 along the member, or null when unusable.
export function stationSignedKN(memberResult, t, key) {
  if (!SIGNED_KEYS.has(key) || !Number.isFinite(t)) return null;
  const samples = samplesOf(memberResult);
  if (!samples) return null;
  const comp = dominantComponent(memberResult, key);
  if (!comp) return null;
  const x = Math.max(0, Math.min(1, t)) * memberResult.length;
  const val = s => (Number.isFinite(s[comp]) ? s[comp] : null);
  if (x <= samples[0].x) return val(samples[0]);
  const last = samples[samples.length - 1];
  if (x >= last.x) return val(last);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (x <= b.x) {
      const va = val(a), vb = val(b);
      if (va === null || vb === null) return null;
      const span = b.x - a.x, alpha = span > 0 ? (x - a.x) / span : 1;
      return va + (vb - va) * alpha;
    }
  }
  return null;
}

// Backwards-compatible names kept for the 0.5.5 tests and the console debug hook.
export const stationForceKN = (memberResult, t) => stationValueKN(memberResult, t, 'resultant');
export const peakForceStation = memberResult => {
 const peak = peakStation(memberResult, 'resultant');
 return peak ? { x: peak.x, t: peak.t, forceKN: peak.value } : null;
};
export const forceRangeKN = (members, results) => rangeKN(members, results, 'resultant');
