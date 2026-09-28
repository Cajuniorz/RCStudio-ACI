// Visualisation only: solver member forces (N, Vy, Vz) in kN at stations.
// This is NOT an applied-load map or a structural-capacity check.
const magnitude = s => {
 if (!s || !['x','N','Vy','Vz'].every(k => Number.isFinite(s[k]))) return null;
 return Math.hypot(s.N, s.Vy, s.Vz);
};

export function stationForceKN(memberResult, t) {
 const samples=memberResult?.samples;
 const length=memberResult?.length;
 if (!Array.isArray(samples) || !samples.length || !Number.isFinite(length) || length<=0 || !Number.isFinite(t)) return null;
 const x=Math.max(0,Math.min(1,t))*length;
 const sorted=[...samples].sort((a,b)=>a.x-b.x);
 if (sorted.some(s=>magnitude(s)===null)) return null;
 if (x<=sorted[0].x) return magnitude(sorted[0]);
 if (x>=sorted.at(-1).x) return magnitude(sorted.at(-1));
 for(let i=1;i<sorted.length;i++){
  const a=sorted[i-1],b=sorted[i];
  if(x<=b.x){
   const d=b.x-a.x,alpha=d>0?(x-a.x)/d:1;
   return Math.hypot(
    a.N+(b.N-a.N)*alpha,
    a.Vy+(b.Vy-a.Vy)*alpha,
    a.Vz+(b.Vz-a.Vz)*alpha
   );
  }
 }
 return null;
}

export function peakForceStation(memberResult){
 const samples=memberResult?.samples,length=memberResult?.length;
 if(!Array.isArray(samples)||!samples.length||!Number.isFinite(length)||length<=0)return null;
 let peak=null;
 for(const s of samples){
  const f=magnitude(s);
  if(f===null || s.x<0 || s.x>length+1e-6)return null;
  if(!peak || f>peak.forceKN)peak={x:s.x,t:Math.min(1,s.x/length),forceKN:f};
 }
 return peak;
}

export function forceRangeKN(members,results){
 if(!results)return null;
 let max=0,found=false;
 for(const member of members){
  const m=results[member.id],samples=m?.samples;
  if(!Array.isArray(samples)||!samples.length)continue;
  if(!peakForceStation(m))continue;
  for(const s of samples){const v=magnitude(s);if(v===null)continue;max=Math.max(max,v);found=true;}
 }
 return found?{min:0,max}:null;
}
