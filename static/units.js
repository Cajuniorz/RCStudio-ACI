// Exact standard gravity conversions, canonical m / kN / MPa.
// NIST SP 811: 1 kgf = 9.80665 N; 1 ksc = 0.0980665 MPa.
export function unit(kind, prefs={system:'thai',force:'kgf'}){
 const thai=prefs.system==='thai',force=thai?(prefs.force==='tf'?'tf':'kg'):'kN';
 const f=thai?(force==='tf'?1/9.80665:1/.00980665):1;
 const map={length:['m',1],section:[thai?'cm':'mm',thai?100:1000],force:[force,f],moment:[force+'·m',f],
 line:[thai?(prefs.force==='tf'?'tf/m':'kg/m'):'kN/m',thai?1/.00980665:1],
 pressure:[thai?(prefs.force==='tf'?'tf/m²':'kg/m²'):'kN/m²',thai?1/.00980665:1],
 stress:[thai?'ksc':'MPa',thai?1/.0980665:1],
 density:[thai?'kg/m³':'kN/m³',thai?1/.00980665:1],
 area:[thai?'cm²':'mm²',thai?1e4:1e6],inertia:[thai?'cm⁴':'mm⁴',thai?1e8:1e12],none:['',1],mm:['mm',1]};
 const [label,factor]=map[kind]||map.none;return {label,factor};
}
export const toDisplay=(value,kind,prefs)=>value===null?null:value*unit(kind,prefs).factor;
export const toCanonical=(value,kind,prefs)=>value===null?null:value/unit(kind,prefs).factor;
