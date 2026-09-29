function alphaLabel(index){let n=index+1,label='';while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}return label;}

export function buildGridLayoutFromLines({linesX,linesY,linesZ,y,z}={}){
  const reject=reason=>({ok:false,reason});
  const round=v=>Number(v.toFixed(3));
  const linesSecond = linesY || linesZ;
  const secondKey = linesY ? 'Y' : 'Z';
  const elevVal = z !== undefined ? z : (y !== undefined ? y : 0);
  const elevKey = z !== undefined ? 'Z' : 'Y';
  if(!Array.isArray(linesX)||!Array.isArray(linesSecond)||linesX.length<2||linesSecond.length<2||linesX.length>20||linesSecond.length>20||linesX.length*linesSecond.length>400)return reject('กริดต้องมี 2–20 แนวต่อแกน และไม่เกิน 400 จุดตัด');
  if(!Number.isFinite(elevVal)||Math.abs(elevVal)>10000)return reject(`ระดับ ${elevKey} ต้องเป็นตัวเลขในช่วง ±10000 m`);
  const normalize=(rows,axis)=>{
    const labels=new Set(),out=[];
    for(const row of rows){
      if(!row||typeof row.label!=='string'||!/[A-Za-z0-9_-]{1,12}/.test(row.label)||!Number.isFinite(row.value)||Math.abs(row.value)>10000)return null;
      const label=row.label.trim();if(!/^[A-Za-z0-9_-]{1,12}$/.test(label)||labels.has(label.toLowerCase()))return null;
      labels.add(label.toLowerCase());out.push({label,value:round(row.value)});
    }
    if(out.some((line,index)=>index>0&&line.value-out[index-1].value<.001))return null;
    return out;
  };
  const x=normalize(linesX,'X'),second=normalize(linesSecond,secondKey);
  if(!x||!second)return reject('ชื่อแนวต้องไม่ซ้ำ และพิกัดแต่ละแกนต้องเรียงเพิ่มอย่างน้อย 0.001 m');
  const level=round(elevVal);
  let nodes, edgesX, edgesSecond;
  if(z !== undefined){
    nodes=x.flatMap(gx=>second.map(gy=>({x:gx.value,y:gy.value,z:level})));
    edgesX=second.flatMap(gy=>x.slice(0,-1).map((gx,i)=>({start:{x:gx.value,y:gy.value,z:level},end:{x:x[i+1].value,y:gy.value,z:level}})));
    edgesSecond=x.flatMap(gx=>second.slice(0,-1).map((gy,i)=>({start:{x:gx.value,y:gy.value,z:level},end:{x:gx.value,y:second[i+1].value,z:level}})));
  } else {
    nodes=x.flatMap(gx=>second.map(gz=>({x:gx.value,y:level,z:gz.value})));
    edgesX=second.flatMap(gz=>x.slice(0,-1).map((gx,i)=>({start:{x:gx.value,y:level,z:gz.value},end:{x:x[i+1].value,y:level,z:gz.value}})));
    edgesSecond=x.flatMap(gx=>second.slice(0,-1).map((gz,i)=>({start:{x:gx.value,y:level,z:gz.value},end:{x:gx.value,y:level,z:second[i+1].value}})));
  }
  return {ok:true,lines:{x,y:second,z:second},nodes,edgesX,edgesY:edgesSecond,edgesZ:edgesSecond,elevationAxis:z!==undefined?'z':'y'};
}

export function buildGridLayout({countX,countY,countZ,spacingX,spacingY,spacingZ,startX=0,startY=0,startZ=0,y,z}={}){
  const reject=reason=>({ok:false,reason});
  const cSecond = countY !== undefined ? countY : countZ;
  const spSecond = spacingY !== undefined ? spacingY : spacingZ;
  const stSecond = startY !== undefined ? startY : startZ;
  if(!Number.isInteger(countX)||!Number.isInteger(cSecond)||countX<2||cSecond<2||countX>20||cSecond>20||countX*cSecond>400)return reject('กริดต้องมี 2–20 แนวต่อแกน และไม่เกิน 400 จุดตัด');
  const elevVal = z !== undefined ? z : (y !== undefined ? y : 0);
  if(![spacingX,spSecond,startX,stSecond,elevVal].every(Number.isFinite)||spacingX<.05||spSecond<.05||spacingX>1000||spSecond>1000||Math.abs(startX)>10000||Math.abs(stSecond)>10000||Math.abs(elevVal)>10000)return reject('ระยะกริดต้อง ≥0.05 m และพิกัดต้องอยู่ในช่วง ±10000 m');
  const linesX=Array.from({length:countX},(_,i)=>({label:String(i+1),value:startX+i*spacingX}));
  const linesSecond=Array.from({length:cSecond},(_,i)=>({label:alphaLabel(i),value:stSecond+i*spSecond}));
  if (z !== undefined) {
    return buildGridLayoutFromLines({linesX,linesY:linesSecond,z});
  } else {
    return buildGridLayoutFromLines({linesX,linesZ:linesSecond,y:elevVal});
  }
}

export function autoDetectGridLines(nodes, {levelY, levelZ, tolerance = 0.08} = {}) {
  const elev = levelZ !== undefined ? levelZ : levelY;
  const isZ = levelZ !== undefined;
  const pts = (nodes || []).filter(finitePoint).filter(n => {
    if (elev === undefined) return true;
    return Math.abs((isZ ? n.z : n.y) - elev) <= 0.05;
  });
  if (!pts.length) return { ok: false, reason: 'ไม่พบโหนดในระดับนี้' };
  const clusterCoords = (coords) => {
    const sorted = [...coords].sort((a,b) => a - b);
    const groups = [];
    for (const v of sorted) {
      const last = groups.at(-1);
      if (!last || Math.abs(v - last.center) > tolerance) {
        groups.push({ sum: v, count: 1, center: v });
      } else {
        last.sum += v;
        last.count++;
        last.center = last.sum / last.count;
      }
    }
    return groups.map(g => Number(g.center.toFixed(3)));
  };
  const xs = clusterCoords(pts.map(n => n.x));
  const ys = clusterCoords(pts.map(n => n.y));
  const zs = clusterCoords(pts.map(n => n.z));
  const linesX = xs.map((val, i) => ({ label: String(i + 1), value: val }));
  const linesY = ys.map((val, i) => ({ label: alphaLabel(i), value: val }));
  const linesZ = zs.map((val, i) => ({ label: alphaLabel(i), value: val }));
  if (xs.length < 2) return { ok: false, reason: 'ต้องการอย่างน้อย 2 แนวต่อแกนเพื่อสร้างกริด' };
  return { ok: true, lines: { x: linesX, y: linesY.length >= 2 ? linesY : linesZ, z: linesZ.length >= 2 ? linesZ : linesY } };
}

const finitePoint = node => node && [node.x,node.y,node.z].every(Number.isFinite);

export function groupLevels(nodes, tolerance = 1e-5, axis = 'auto') {
  const valid = (nodes || []).filter(finitePoint);
  let effectiveAxis = axis;
  if (effectiveAxis === 'auto') {
    const ys = valid.map(n => n.y), zs = valid.map(n => n.z);
    const ptpY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const ptpZ = zs.length ? Math.max(...zs) - Math.min(...zs) : 0;
    if (ptpZ > tolerance && ptpY <= tolerance) {
      effectiveAxis = 'z';
    } else if (ptpY > tolerance && ptpZ <= tolerance) {
      effectiveAxis = 'y';
    } else {
      effectiveAxis = 'z';
    }
  }

  const coordKey = effectiveAxis === 'y' ? 'y' : 'z';
  const labelPrefix = effectiveAxis === 'y' ? 'Y' : 'Z';
  const ordered = valid.slice().sort((a,b) => a[coordKey]-b[coordKey] || a.id.localeCompare(b.id));
  const groups = [];
  for (const node of ordered) {
    let group = groups.at(-1);
    if (!group || Math.abs(node[coordKey]-group.anchor) > tolerance) {
      group = {anchor:node[coordKey],nodes:[]};
      groups.push(group);
    }
    group.nodes.push(node);
  }
  return groups.map((group,index) => {
    const val = group.nodes.reduce((sum,node) => sum+node[coordKey],0)/group.nodes.length;
    const yVal = group.nodes.reduce((sum,node) => sum+node.y,0)/group.nodes.length;
    const zVal = group.nodes.reduce((sum,node) => sum+node.z,0)/group.nodes.length;
    return {
      y: yVal,
      z: zVal,
      elevation: val,
      axis: effectiveAxis,
      nodes: group.nodes,
      label: `ระดับ ${index+1} · ${labelPrefix} ${Number(val.toFixed(4))} m`
    };
  });
}

export function nearestPlanNode(nodes, c1, c2, elevation, tolerance, maxDistance) {
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const node of nodes) {
    if (!finitePoint(node)) continue;
    let distance;
    if (Math.abs(node.z - elevation) <= tolerance) {
      distance = Math.hypot(node.x - c1, node.y - c2);
    } else if (Math.abs(node.y - elevation) <= tolerance) {
      distance = Math.hypot(node.x - c1, node.z - c2);
    } else {
      continue;
    }
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
  if(!finitePoint(start)||!point||(useGrid&&!validPlanGridStep(gridStep)))return null;
  const sameZ = Math.abs(start.z - (point.z ?? start.z)) < 1e-5;
  const sameY = Math.abs(start.y - (point.y ?? start.y)) < 1e-5;
  const diffY = !sameY;
  const diffZ = !sameZ;

  if (sameZ && (diffY || axis === 'y') && !diffZ) {
    if(!['x','y'].includes(axis))return null;
    const freeAxis=axis,lockedAxis=axis==='x'?'y':'x';
    const raw=point[freeAxis],value=useGrid?Math.round(raw/gridStep)*gridStep:raw;
    return {[freeAxis]:Number(value.toFixed(3)),[lockedAxis]:start[lockedAxis],z:start.z};
  } else {
    if(!['x','z'].includes(axis))return null;
    const freeAxis=axis==='x'?'x':'z',lockedAxis=axis==='x'?'z':'x';
    const raw=point[freeAxis],value=useGrid?Math.round(raw/gridStep)*gridStep:raw;
    return {[freeAxis]:Number(value.toFixed(3)),y:start.y,[lockedAxis]:start[lockedAxis]};
  }
}

export function snapPlanPoint(point, nodes, levelElevation, gridStep = 1, axisTolerance = .12) {
  if (!point || !validPlanGridStep(gridStep) || axisTolerance < 0) return null;
  const snapAxis = (value, axis) => {
    let snapped = Math.round(value / gridStep) * gridStep, distance = axisTolerance;
    for (const node of nodes) {
      if (!finitePoint(node)) continue;
      const offset = Math.abs(value - node[axis]);
      if (offset < distance) { distance = offset; snapped = node[axis]; }
    }
    return Number(snapped.toFixed(3));
  };
  if (Number.isFinite(point.x) && Number.isFinite(point.y) && (point.z === undefined || Math.abs(point.z - levelElevation) < 1e-4)) {
    const elev = Number.isFinite(levelElevation) ? levelElevation : (point.z ?? 0);
    return { x: snapAxis(point.x, 'x'), y: snapAxis(point.y, 'y'), z: elev };
  }
  if (![point.x, point.z, levelElevation, axisTolerance].every(Number.isFinite)) return null;
  return { x: snapAxis(point.x, 'x'), y: levelElevation, z: snapAxis(point.z, 'z') };
}

export function planNodeDraft(nodes, point, id) {
  if (!point || ![point.x,point.y,point.z].every(Number.isFinite)) return {ok:false,reason:'พิกัดโหนดต้องเป็นตัวเลขที่มีค่าจำกัด'};
  if (!id || nodes.some(node => node.id===id)) return {ok:false,reason:'รหัสโหนดซ้ำหรือว่าง'};
  const coordinates={x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3)),z:Number(point.z.toFixed(3))};
  if (nodes.some(node => finitePoint(node) && Math.hypot(node.x-coordinates.x,node.y-coordinates.y,node.z-coordinates.z)<1e-5))
    return {ok:false,reason:'มีโหนดที่พิกัดนี้แล้ว กรุณาเลือกโหนดเดิม'};
  return {ok:true,node:{id,...coordinates,restraints:[false,false,false,false,false,false]}};
}

export function nearestBeamOnPlan(model, point, levelElevation, maxDistance, levelTolerance=1e-5) {
  if (!point || !Number.isFinite(levelElevation) || !Number.isFinite(maxDistance) || maxDistance<0) return null;
  const nodes=new Map((model?.nodes||[]).map(n=>[n.id,n]));
  let nearest=null;
  for (const member of model?.members||[]) {
    if (member.kind!=='beam'||member.behavior!=='frame') continue;
    const a=nodes.get(member.i),b=nodes.get(member.j);
    if (!finitePoint(a)||!finitePoint(b)) continue;

    // Check if beam is at elevation Z (Z-up)
    if (Math.abs(a.z-levelElevation)<=levelTolerance && Math.abs(b.z-levelElevation)<=levelTolerance) {
      const py = point.y !== undefined ? point.y : point.z;
      const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy;
      if (L2<=1e-12) continue;
      const t=((point.x-a.x)*dx+(py-a.y)*dy)/L2;
      if(t<=0||t>=1)continue;
      const px=a.x+t*dx,pY=a.y+t*dy,distance=Math.hypot(point.x-px,py-pY);
      if(distance>maxDistance)continue;
      const candidate={member,fromId:member.i,distanceFromI:Number((t*Math.sqrt(L2)).toFixed(3)),point:{x:Number(px.toFixed(3)),y:Number(pY.toFixed(3)),z:levelElevation},distance};
      if(nearest&&Math.abs(distance-nearest.distance)<1e-5)nearest={ambiguous:true,distance};
      else if(!nearest||distance<nearest.distance-1e-5)nearest=candidate;
    }
    // Check if beam is at elevation Y (Y-up)
    else if (Math.abs(a.y-levelElevation)<=levelTolerance && Math.abs(b.y-levelElevation)<=levelTolerance) {
      const pz = point.z !== undefined ? point.z : point.y;
      const dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
      if (L2<=1e-12) continue;
      const t=((point.x-a.x)*dx+(pz-a.z)*dz)/L2;
      if(t<=0||t>=1)continue;
      const px=a.x+t*dx,pzRes=a.z+t*dz,distance=Math.hypot(point.x-px,pz-pzRes);
      if(distance>maxDistance)continue;
      const candidate={member,fromId:member.i,distanceFromI:Number((t*Math.sqrt(L2)).toFixed(3)),point:{x:Number(px.toFixed(3)),y:levelElevation,z:Number(pzRes.toFixed(3))},distance};
      if(nearest&&Math.abs(distance-nearest.distance)<1e-5)nearest={ambiguous:true,distance};
      else if(!nearest||distance<nearest.distance-1e-5)nearest=candidate;
    }
  }
  return nearest;
}

export function planGridModel(model, layout, {beamsX=false,beamsY=false,beamsZ=false,b=.25,h=.45}={}) {
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
  const makeSecondBeams = beamsY || beamsZ;
  if(beamsX||makeSecondBeams){if(!Number.isFinite(b)||!Number.isFinite(h)||b<.01||h<.01)return reject('ขนาดหน้าตัดคาน b/h ต้องมากกว่า 0.01 m');}
  const allNodes=model.nodes.concat(stagedNodes),allMembers=model.members.slice();
  const addEdges=edges=>{
    if(!edges)return null;
    for(const edge of edges){
      const [i,j]=resolveEdge(edge);
      if(!i||!j||i===j)return reject('กริดสร้างโหนดปลายคานไม่ครบ');
      if(allMembers.some(m=>m.i===i&&m.j===j||m.i===j&&m.j===i))continue;
      const elevOpts = layout.elevationAxis === 'z' ? {levelZ: edge.start.z} : {levelY: edge.start.y};
      const checked=validateMemberEndpoints(allNodes,allMembers,i,j,{...elevOpts,disallowIntervening:true});
      if(!checked.ok)return reject(`${i}–${j}: ${checked.reason}`);
      const id=freshId('M',usedMemberIds),member={id,i,j,b,h,rotation:0,kind:'beam',sectionType:'rc_rect',A:null,Iy:null,Iz:null,J:null,roofType:'custom',behavior:'frame'};
      stagedMembers.push(member);allMembers.push(member);
    }
    return null;
  };
  if(beamsX){const error=addEdges(layout.edgesX);if(error)return error;}
  if(makeSecondBeams){const error=addEdges(layout.edgesY || layout.edgesZ);if(error)return error;}
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
  // Check if planar in X-Y (Z constant)
  const isXY = Math.abs(a.z-b.z)<1e-5 && Math.abs(c.z-d.z)<1e-5 && Math.abs(a.z-c.z)<1e-5;
  const a2 = isXY ? a.y : a.z, b2 = isXY ? b.y : b.z, c2 = isXY ? c.y : c.z, d2 = isXY ? d.y : d.z;
  const rx=b.x-a.x,rz=b2-a2,sx=d.x-c.x,sz=d2-c2,den=rx*sz-rz*sx,qx=c.x-a.x,qz=c2-a2,qxr=qx*rz-qz*rx;
  if(Math.abs(den)<=tol){if(Math.abs(qxr)>tol)return false;const rr=rx*rx+rz*rz;if(rr<=tol)return false;const t0=(qx*rx+qz*rz)/rr,t1=t0+(sx*rx+sz*rz)/rr;return Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1))>tol;}
  const t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den;if(t<-tol||t>1+tol||u<-tol||u>1+tol)return false;
  const tEnd=t<=tol?a.id:t>=1-tol?b.id:null,uEnd=u<=tol?c.id:u>=1-tol?d.id:null;
  return !(tEnd&&uEnd&&tEnd===uEnd);
}

export function validateMemberEndpoints(nodes, members, i, j, {levelY,levelZ,levelTolerance=1e-5,lineTolerance=1e-6,disallowIntervening=false} = {}) {
  const reject = reason => ({ok:false,reason});
  if (!i || !j || i===j) return reject('เลือกโหนดต้นและปลายคนละโหนด');
  const a = nodes.find(node => node.id===i), b = nodes.find(node => node.id===j);
  if (!a || !b) return reject('ไม่พบโหนดต้นหรือปลายในโมเดล');
  if (!finitePoint(a) || !finitePoint(b)) return reject('พิกัดโหนดต้องเป็นตัวเลขที่มีค่าจำกัด');

  const isZ = levelZ !== undefined;
  const elev = isZ ? levelZ : levelY;
  if (elev !== undefined) {
    const aElev = isZ ? a.z : a.y;
    const bElev = isZ ? b.z : b.y;
    if (Math.abs(aElev - elev) > levelTolerance || Math.abs(bElev - elev) > levelTolerance) {
      return reject('เลือกโหนดที่ระดับเดียวกันก่อนวาดคาน');
    }
  }

  const length = Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
  if (length<=lineTolerance) return reject('โหนดต้นและปลายอยู่ตำแหน่งเดียวกัน');
  if (members.some(member => member.i===i&&member.j===j || member.i===j&&member.j===i)) return reject('มีสมาชิกคู่นี้แล้ว');
  if (disallowIntervening) {
    const secondCoord = isZ ? 'y' : 'z';
    const dx=b.x-a.x, dSecond=b[secondCoord]-a[secondCoord], length2=dx*dx+dSecond*dSecond;
    if (length2<=lineTolerance*lineTolerance) return reject(`คานในผังต้องมีระยะในแนว X${secondCoord.toUpperCase()} มากกว่าศูนย์`);
    for (const node of nodes) {
      if (node.id===i||node.id===j||!finitePoint(node)) continue;
      if (elev !== undefined && Math.abs((isZ ? node.z : node.y) - elev) > levelTolerance) continue;
      const t=((node.x-a.x)*dx+(node[secondCoord]-a[secondCoord])*dSecond)/length2;
      if (t<=1e-4||t>=1-1e-4) continue;
      const perp=Math.abs((node.x-a.x)*dSecond-(node[secondCoord]-a[secondCoord])*dx)/Math.sqrt(length2);
      if (perp<=Math.max(lineTolerance,0.01)) return reject('มีโหนดคั่นกลาง กรุณาวาดแยกช่วง');
    }
    for (const member of members) {
      if (member.kind!=='beam'||member.behavior!=='frame'||[member.i,member.j].some(endpoint=>endpoint===i||endpoint===j)) continue;
      const c=nodes.find(node=>node.id===member.i),d=nodes.find(node=>node.id===member.j);
      if (!c||!d||!finitePoint(c)||!finitePoint(d)) continue;
      if (elev !== undefined && (Math.abs((isZ ? c.z : c.y)-elev)>levelTolerance||Math.abs((isZ ? d.z : d.y)-elev)>levelTolerance)) continue;
      if (planSegmentsIntersect(a,b,c,d)) return reject(`แนวคานตัดกับคาน ${member.id} กรุณาแบ่งช่วงที่จุดตัด`);
    }
  }
  return {ok:true};
}

export function planContinuousBeamSegments(
  nodes,
  members,
  startId,
  endTarget,
  {
    levelY,
    levelZ,
    levelTolerance = 1e-5,
    lineTolerance = 1e-6,
    memberProps = {},
    allowNewEndNode = false,
    freshNodeId = null,
    nextMemberIdFn = null
  } = {}
) {
  const reject = reason => ({ ok: false, reason });
  if (!startId) return reject('ต้องระบุโหนดเริ่มต้น');
  const startNode = nodes.find(n => n.id === startId);
  if (!startNode || !finitePoint(startNode)) return reject('ไม่พบโหนดเริ่มต้น');

  const isZ = levelZ !== undefined;
  const elev = isZ ? levelZ : levelY;
  if (elev !== undefined) {
    const sElev = isZ ? startNode.z : startNode.y;
    if (Math.abs(sElev - elev) > levelTolerance) return reject('โหนดเริ่มต้นไม่อยู่ในระดับที่เลือก');
  }

  let endNode = null;
  let endPoint = null;
  if (typeof endTarget === 'string') {
    if (endTarget === startId) return reject('โหนดต้นและปลายต้องไม่เป็นโหนดเดียวกัน');
    endNode = nodes.find(n => n.id === endTarget);
    if (!endNode || !finitePoint(endNode)) return reject('ไม่พบโหนดปลายทาง');
    if (elev !== undefined) {
      const eElev = isZ ? endNode.z : endNode.y;
      if (Math.abs(eElev - elev) > levelTolerance) return reject('โหนดปลายทางไม่อยู่ในระดับที่เลือก');
    }
    endPoint = { x: endNode.x, y: endNode.y, z: endNode.z };
  } else if (endTarget && typeof endTarget === 'object' && [endTarget.x, endTarget.y, endTarget.z].every(Number.isFinite)) {
    endPoint = {
      x: Number(endTarget.x.toFixed(3)),
      y: Number((isZ ? endTarget.y : (levelY ?? endTarget.y)).toFixed(3)),
      z: Number((isZ ? (levelZ ?? endTarget.z) : endTarget.z).toFixed(3))
    };
    const match = nodes.find(n => finitePoint(n) && Math.hypot(n.x - endPoint.x, n.y - endPoint.y, n.z - endPoint.z) < 1e-4);
    if (match) {
      if (match.id === startId) return reject('จุดปลายตรงกับโหนดเริ่มต้น');
      endNode = match;
    }
  } else {
    return reject('พิกัดปลายคานไม่ถูกต้อง');
  }

  const secondCoord = isZ ? 'y' : 'z';
  const dx = endPoint.x - startNode.x;
  const dSecond = endPoint[secondCoord] - startNode[secondCoord];
  const length2 = dx * dx + dSecond * dSecond;
  if (length2 <= lineTolerance * lineTolerance) return reject('ระยะระหว่างจุดเริ่มต้นและปลายต้องมากกว่าศูนย์');
  const totalLength = Math.sqrt(length2);

  const collinear = [];
  const startIdSet = new Set([startId, endNode?.id].filter(Boolean));
  for (const node of nodes) {
    if (!finitePoint(node) || startIdSet.has(node.id)) continue;
    if (elev !== undefined && Math.abs((isZ ? node.z : node.y) - elev) > levelTolerance) continue;
    const t = ((node.x - startNode.x) * dx + (node[secondCoord] - startNode[secondCoord]) * dSecond) / length2;
    if (t <= 1e-4 || t >= 1 - 1e-4) continue;
    const perpDist = Math.abs((node.x - startNode.x) * dSecond - (node[secondCoord] - startNode[secondCoord]) * dx) / totalLength;
    if (perpDist <= Math.max(lineTolerance, 0.05)) {
      collinear.push({ node, t });
    }
  }
  collinear.sort((a, b) => a.t - b.t);

  const nodeChain = [startNode, ...collinear.map(c => c.node)];
  const nodesToAdd = [];
  if (!endNode) {
    if (!allowNewEndNode) return reject('ไม่พบโหนดปลายทาง');
    const newEndId = freshNodeId;
    if (!newEndId || nodes.some(n => n.id === newEndId)) return reject('รหัสโหนดปลายซ้ำ');
    endNode = { id: newEndId, x: endPoint.x, y: endPoint.y, z: endPoint.z, restraints: [false, false, false, false, false, false] };
    nodesToAdd.push(endNode);
  }
  nodeChain.push(endNode);

  const segments = [];
  const existingMembers = members.slice();
  const allNodes = nodes.concat(nodesToAdd);

  for (let idx = 0; idx < nodeChain.length - 1; idx++) {
    const u = nodeChain[idx];
    const v = nodeChain[idx + 1];
    const exists = existingMembers.some(m => (m.i === u.id && m.j === v.id) || (m.i === v.id && m.j === u.id));
    if (exists) continue;

    const validation = validateMemberEndpoints(allNodes, existingMembers, u.id, v.id, {
      levelY: isZ ? undefined : u.y,
      levelZ: isZ ? u.z : undefined,
      levelTolerance,
      disallowIntervening: true
    });
    if (!validation.ok) {
      return reject(`ช่วง ${u.id}–${v.id}: ${validation.reason}`);
    }

    const memberId = nextMemberIdFn ? nextMemberIdFn(existingMembers.concat(segments)) : `M_TEMP_${idx}`;
    const newMem = {
      id: memberId,
      i: u.id,
      j: v.id,
      ...memberProps
    };
    segments.push(newMem);
    existingMembers.push(newMem);
  }

  if (segments.length === 0) return reject('มีสมาชิกทุกช่วงเชื่อมต่ออยู่แล้ว');

  return {
    ok: true,
    nodeChain: nodeChain.map(n => n.id),
    intermediateCount: collinear.length,
    segments,
    nodesToAdd
  };
}
