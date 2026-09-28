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

export function snapPlanPoint(point, nodes, levelY, gridStep = 1, axisTolerance = .12) {
  if (!point || ![point.x,point.z,levelY,gridStep,axisTolerance].every(Number.isFinite) || gridStep<=0 || axisTolerance<0) return null;
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
