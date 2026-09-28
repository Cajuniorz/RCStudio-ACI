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
  }
  return {ok:true,a,b,length};
}
