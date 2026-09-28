function alphaLabel(index){let n=index+1,label='';while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}return label;}
export function buildGridLayout({countX,countZ,spacingX,spacingZ,startX=0,startZ=0,y=0}={}){
  const reject=reason=>({ok:false,reason});
  if(!Number.isInteger(countX)||!Number.isInteger(countZ)||countX<2||countZ<2||countX>20||countZ>20||countX*countZ>400)return reject('กริดต้องมี 2–20 แนวต่อแกน และไม่เกิน 400 จุดตัด');
  if(![spacingX,spacingZ,startX,startZ,y].every(Number.isFinite)||spacingX<.05||spacingZ<.05||spacingX>1000||spacingZ>1000||Math.abs(startX)>10000||Math.abs(startZ)>10000||Math.abs(y)>10000)return reject('ระยะกริดต้อง ≥0.05 m และพิกัดต้องอยู่ในช่วง ±10000 m');
  const round=v=>Number(v.toFixed(3));
  const lines={x:Array.from({length:countX},(_,i)=>({label:String(i+1),value:round(startX+i*spacingX)})),z:Array.from({length:countZ},(_,i)=>({label:alphaLabel(i),value:round(startZ+i*spacingZ)}))};
  if(new Set(lines.x.map(g=>g.value)).size!==countX||new Set(lines.z.map(g=>g.value)).size!==countZ)return reject('ระยะกริดเล็กกว่าความละเอียดพิกัด 1 mm');
  const nodes=lines.x.flatMap(x=>lines.z.map(z=>({x:x.value,y:round(y),z:z.value})));
  const edgesX=lines.z.flatMap(z=>lines.x.slice(0,-1).map((x,i)=>({start:{x:x.value,y:round(y),z:z.value},end:{x:lines.x[i+1].value,y:round(y),z:z.value}})));
  const edgesZ=lines.x.flatMap(x=>lines.z.slice(0,-1).map((z,i)=>({start:{x:x.value,y:round(y),z:z.value},end:{x:x.value,y:round(y),z:lines.z[i+1].value}})));
  return {ok:true,lines,nodes,edgesX,edgesZ};
}

const finitePoint = node => node && [node.x,node.y,node.z].every(Number.isFinite);

export function groupLevels(nodes, tolerance = 1e-5) {
  const ordered = nodes.filter(finitePoint).slice().sort((a,b) => a.y-b.y || a.id.localeCompare(b.id));
  const groups = [];
  for (const node of ordered) {
    let group = groups.at(-1);
    if (!group || Math.abs(node.y-group.anchor) > tolerance) {
      group = {anchor:node.y,nodes:[]};
      groups.push(group);
    }
    group.nodes.push(node);
  }
  return groups.map((group,index) => {
    const y = group.nodes.reduce((sum,node) => sum+node.y,0)/group.nodes.length;
    return {y,nodes:group.nodes,label:`ระดับ ${index+1} · Y ${Number(y.toFixed(4))} m`};
  });
}

export function nearestPlanNode(nodes, x, z, levelY, tolerance, maxDistance) {
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const node of nodes) {
    if (!finitePoint(node) || Math.abs(node.y-levelY) > tolerance) continue;
    const distance = Math.hypot(node.x-x,node.z-z);
    if (distance <= nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearest ? {node:nearest,distance:nearestDistance} : null;
}

export function validPlanGridStep(step) {
  if (!Number.isFinite(step)) return false;
  const hundredths=step*100;
  return hundredths>=5-1e-8&&hundredths<=100+1e-8&&Math.abs(hundredths-Math.round(hundredths))<1e-8;
}

export function constrainPlanPoint(start, point, axis, gridStep=1, useGrid=true) {
  if(!finitePoint(start)||!point||![point.x,point.z].every(Number.isFinite)||!['x','z'].includes(axis)||(useGrid&&!validPlanGridStep(gridStep)))return null;
  const freeAxis=axis==='x'?'x':'z',lockedAxis=axis==='x'?'z':'x';
  const raw=point[freeAxis],value=useGrid?Math.round(raw/gridStep)*gridStep:raw;
  return {[freeAxis]:Number(value.toFixed(3)),y:start.y,[lockedAxis]:start[lockedAxis]};
}

export function snapPlanPoint(point, nodes, levelY, gridStep = 1, axisTolerance = .12) {
  if (!point || ![point.x,point.z,levelY,axisTolerance].every(Number.isFinite) || axisTolerance<0 || !validPlanGridStep(gridStep)) return null;
  const snapAxis=(value,axis) => {
    let snapped=Math.round(value/gridStep)*gridStep, distance=axisTolerance;
    for (const node of nodes) {
      if (!finitePoint(node)) continue;
      const offset=Math.abs(value-node[axis]);
      if (offset<distance) {distance=offset;snapped=node[axis];}
    }
    return Number(snapped.toFixed(3));
  };
  return {x:snapAxis(point.x,'x'),y:levelY,z:snapAxis(point.z,'z')};
}

export function planNodeDraft(nodes, point, id) {
  if (!point || ![point.x,point.y,point.z].every(Number.isFinite)) return {ok:false,reason:'พิกัดโหนดต้องเป็นตัวเลขที่มีค่าจำกัด'};
  if (!id || nodes.some(node => node.id===id)) return {ok:false,reason:'รหัสโหนดซ้ำหรือว่าง'};
  const coordinates={x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3)),z:Number(point.z.toFixed(3))};
  if (nodes.some(node => finitePoint(node) && Math.hypot(node.x-coordinates.x,node.y-coordinates.y,node.z-coordinates.z)<1e-5))
    return {ok:false,reason:'มีโหนดที่พิกัดนี้แล้ว กรุณาเลือกโหนดเดิม'};
  return {ok:true,node:{id,...coordinates,restraints:[false,false,false,false,false,false]}};
}

export function nearestBeamOnPlan(model, point, levelY, maxDistance, levelTolerance=1e-5) {
  if (!point || ![point.x,point.z,levelY,maxDistance].every(Number.isFinite) || maxDistance<0) return null;
  const nodes=new Map((model?.nodes||[]).map(n=>[n.id,n]));
  let nearest=null;
  for (const member of model?.members||[]) {
    if (member.kind!=='beam'||member.behavior!=='frame') continue;
    const a=nodes.get(member.i),b=nodes.get(member.j);
    if (!finitePoint(a)||!finitePoint(b)||Math.abs(a.y-levelY)>levelTolerance||Math.abs(b.y-levelY)>levelTolerance) continue;
    const dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
    if (L2<=1e-12) continue;
    const t=((point.x-a.x)*dx+(point.z-a.z)*dz)/L2;
    if(t<=0||t>=1)continue;
    const px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(point.x-px,point.z-pz);
    if(distance>maxDistance)continue;
    const candidate={member,fromId:member.i,distanceFromI:Number((t*Math.sqrt(L2)).toFixed(3)),point:{x:Number(px.toFixed(3)),y:levelY,z:Number(pz.toFixed(3))},distance};
    if(nearest&&Math.abs(distance-nearest.distance)<1e-5)nearest={ambiguous:true,distance};
    else if(!nearest||distance<nearest.distance-1e-5)nearest=candidate;
  }
  return nearest;
}

export function planGridModel(model, layout, {beamsX=false,beamsZ=false,b=.25,h=.45}={}) {
  const reject=reason=>({ok:false,reason});
  if(!layout?.ok)return reject(layout?.reason||'ข้อมูลกริดไม่ถูกต้อง');
  if(!model||!Array.isArray(model.nodes)||!Array.isArray(model.members))return reject('ไม่พบโมเดลสำหรับสร้างกริด');
  const stagedNodes=[],byPoint=new Map();
  let nextNode=1;const usedNodeIds=new Set(model.nodes.map(n=>n.id));
  const freshId=(prefix,used)=>{let id;do{id=prefix+nextNode++;}while(used.has(id));used.add(id);return id;};
  for(const point of layout.nodes){
    const key=`${point.x.toFixed(3)}|${point.y.toFixed(3)}|${point.z.toFixed(3)}`;
    let existing=model.nodes.find(n=>finitePoint(n)&&Math.hypot(n.x-point.x,n.y-point.y,n.z-point.z)<.001);
    if(!existing){const node={id:freshId('N',usedNodeIds),...point,restraints:[false,false,false,false,false,false]};stagedNodes.push(node);existing=node;}
    byPoint.set(key,existing.id);
  }
  const pointKey=p=>`${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.z.toFixed(3)}`;
  const resolveEdge=edge=>[byPoint.get(pointKey(edge.start)),byPoint.get(pointKey(edge.end))];
  const stagedMembers=[],usedMemberIds=new Set(model.members.map(m=>m.id));
  if(beamsX||beamsZ){if(!Number.isFinite(b)||!Number.isFinite(h)||b<.01||h<.01)return reject('ขนาดหน้าตัดคาน b/h ต้องมากกว่า 0.01 m');}
  const allNodes=model.nodes.concat(stagedNodes),allMembers=model.members.slice();
  const addEdges=edges=>{for(const edge of edges){const [i,j]=resolveEdge(edge);if(!i||!j||i===j)return reject('กริดสร้างโหนดปลายคานไม่ครบ');if(allMembers.some(m=>m.i===i&&m.j===j||m.i===j&&m.j===i))continue;const checked=validateMemberEndpoints(allNodes,allMembers,i,j,{levelY:edge.start.y,disallowIntervening:true});if(!checked.ok)return reject(`${i}–${j}: ${checked.reason}`);const id=freshId('M',usedMemberIds),member={id,i,j,b,h,rotation:0,kind:'beam',sectionType:'rc_rect',A:null,Iy:null,Iz:null,J:null,roofType:'custom',behavior:'frame'};stagedMembers.push(member);allMembers.push(member);}return null;};
  if(beamsX){const error=addEdges(layout.edgesX);if(error)return error;}
  if(beamsZ){const error=addEdges(layout.edgesZ);if(error)return error;}
  if(model.nodes.length+stagedNodes.length>500)return reject('กริดนี้จะเกินขีดจำกัด 500 โหนด');
  if(model.members.length+stagedMembers.length>1000)return reject('กริดนี้จะเกินขีดจำกัด 1000 สมาชิก');
  return {ok:true,gridLines:layout.lines,nodes:stagedNodes,members:stagedMembers,intersectionCount:layout.nodes.length};
}

export function splitBeamAtDistance(model, memberId, fromNodeId, distance, newNodeId, newMemberId) {
  const reject=reason=>({ok:false,reason});
  const member=model?.members?.find(m=>m.id===memberId);
  if (!member || member.kind!=='beam' || member.behavior!=='frame') return reject('เลือกคานโครงข้อแข็งก่อนแบ่งช่วง');
  if (fromNodeId!==member.i && fromNodeId!==member.j) return reject('จุดอ้างอิงต้องเป็นปลายคานที่เลือก');
  if (!newNodeId || !newMemberId || model.nodes.some(n=>n.id===newNodeId) || model.members.some(m=>m.id===newMemberId)) return reject('รหัสโหนดหรือคานใหม่ซ้ำ');
  if (model.slabs?.some(s=>['support1','support2','support3','support4'].some(key=>s[key]===memberId))) return reject('คานนี้รองรับพื้นอยู่ การแบ่งคานจะทำให้การถ่ายโหลดพื้นผิด กรุณาจัดการขอบพื้นก่อน');
  const i=model.nodes.find(n=>n.id===member.i),j=model.nodes.find(n=>n.id===member.j);
  if (!finitePoint(i)||!finitePoint(j)) return reject('ไม่พบพิกัดปลายคาน');
  const length=Math.hypot(j.x-i.x,j.y-i.y,j.z-i.z);
  if (!Number.isFinite(distance)||!Number.isFinite(length)||distance<=.001||distance>=length-.001) return reject(`ระยะต้องอยู่ภายในช่วงคาน (ยาว ${Number(length.toFixed(3))} m) และห่างปลายอย่างน้อย 0.001 m`);
  const t=fromNodeId===member.i?distance/length:1-distance/length;
  const coordinates=Object.fromEntries(['x','y','z'].map(axis=>[axis,Number((i[axis]+(j[axis]-i[axis])*t).toFixed(3))]));
  if (Math.hypot(...['x','y','z'].map(axis=>coordinates[axis]-i[axis]))<=.001 || Math.hypot(...['x','y','z'].map(axis=>coordinates[axis]-j[axis]))<=.001) return reject('ระยะหลังปัดพิกัดใกล้ปลายคานเกินไป');
  if (model.nodes.some(n=>finitePoint(n)&&Math.hypot(n.x-coordinates.x,n.y-coordinates.y,n.z-coordinates.z)<1e-5)) return reject('มีโหนดบนตำแหน่งที่ต้องการแล้ว');
  const loads=(model.memberLoads||[]).filter(load=>load.member===memberId);
  if (loads.some(load=>Object.keys(load).some(k=>['xStart','xEnd','start','end'].includes(k)))) return reject('คานมีโหลดบางช่วงที่ยังแบ่งอัตโนมัติไม่ได้');
  return {ok:true,node:{id:newNodeId,...coordinates,restraints:[false,false,false,false,false,false]},
    members:[{...member,j:newNodeId},{...member,id:newMemberId,i:newNodeId}],
    memberLoads:loads.flatMap(load=>[{...load},{...load,member:newMemberId}]),length};
}

function planSegmentsIntersect(a,b,c,d,tol=1e-8){
  const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=rx*sz-rz*sx,qx=c.x-a.x,qz=c.z-a.z,qxr=qx*rz-qz*rx;
  if(Math.abs(den)<=tol){if(Math.abs(qxr)>tol)return false;const rr=rx*rx+rz*rz;if(rr<=tol)return false;const t0=(qx*rx+qz*rz)/rr,t1=t0+(sx*rx+sz*rz)/rr;return Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1))>tol;}
  const t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den;if(t<-tol||t>1+tol||u<-tol||u>1+tol)return false;
  const tEnd=t<=tol?a.id:t>=1-tol?b.id:null,uEnd=u<=tol?c.id:u>=1-tol?d.id:null;
  return !(tEnd&&uEnd&&tEnd===uEnd);
}

export function validateMemberEndpoints(nodes, members, i, j, {levelY,levelTolerance=1e-5,lineTolerance=1e-6,disallowIntervening=false} = {}) {
  const reject = reason => ({ok:false,reason});
  if (!i || !j || i===j) return reject('เลือกโหนดต้นและปลายคนละโหนด');
  const a = nodes.find(node => node.id===i), b = nodes.find(node => node.id===j);
  if (!a || !b) return reject('ไม่พบโหนดต้นหรือปลายในโมเดล');
  if (!finitePoint(a) || !finitePoint(b)) return reject('พิกัดโหนดต้องเป็นตัวเลขที่มีค่าจำกัด');
  if (levelY!==undefined && (Math.abs(a.y-levelY)>levelTolerance || Math.abs(b.y-levelY)>levelTolerance)) return reject('เลือกโหนดที่ระดับเดียวกันก่อนวาดคาน');
  const length = Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
  if (length<=lineTolerance) return reject('โหนดต้นและปลายอยู่ตำแหน่งเดียวกัน');
  if (members.some(member => member.i===i&&member.j===j || member.i===j&&member.j===i)) return reject('มีสมาชิกคู่นี้แล้ว');
  if (disallowIntervening) {
    const dx=b.x-a.x, dz=b.z-a.z, length2=dx*dx+dz*dz;
    if (length2<=lineTolerance*lineTolerance) return reject('คานในผังต้องมีระยะในแนว XZ มากกว่าศูนย์');
    for (const node of nodes) {
      if (node.id===i||node.id===j||!finitePoint(node)||Math.abs(node.y-levelY)>levelTolerance) continue;
      const t=((node.x-a.x)*dx+(node.z-a.z)*dz)/length2;
      if (t<=lineTolerance||t>=1-lineTolerance) continue;
      const distance=Math.abs((node.x-a.x)*dz-(node.z-a.z)*dx)/Math.sqrt(length2);
      if (distance<=lineTolerance*Math.max(1,Math.sqrt(length2))) return reject('มีโหนดคั่นกลาง กรุณาวาดแยกช่วง');
    }
    const byId=new Map(nodes.map(node=>[node.id,node]));
    for(const member of members){
      if(member.kind!=='beam'||member.behavior==='truss'||member.i===i||member.i===j||member.j===i||member.j===j)continue;
      const c=byId.get(member.i),d=byId.get(member.j);
      if(!finitePoint(c)||!finitePoint(d)||Math.abs(c.y-levelY)>levelTolerance||Math.abs(d.y-levelY)>levelTolerance)continue;
      if(planSegmentsIntersect(a,b,c,d,lineTolerance))return reject('เส้นคานตัด/ซ้อนกับสมาชิกเดิมโดยไม่มีโหนดร่วม กรุณาแบ่งหรือเชื่อมโหนดก่อน');
    }
  }
  return {ok:true,a,b,length};
}
