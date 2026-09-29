import assert from 'node:assert/strict';
import {groupLevels,nearestPlanNode,validateMemberEndpoints,planNodeDraft,snapPlanPoint,splitBeamAtDistance,nearestBeamOnPlan,validPlanGridStep,buildGridLayout,buildGridLayoutFromLines,planGridModel,constrainPlanPoint,autoDetectGridLines,planContinuousBeamSegments} from '../static/plan.js';

const nodes=[
  {id:'N1',x:0,y:0,z:0},
  {id:'N2',x:4,y:0,z:0},
  {id:'N3',x:2,y:0,z:0},
  {id:'N4',x:0,y:3,z:0},
  {id:'N5',x:4,y:3.000004,z:0},
  {id:'bad',x:NaN,y:3,z:2}
];
const levels=groupLevels(nodes,1e-5);
assert.equal(levels.length,2);
assert.equal(levels[0].nodes.length,3);
assert.equal(levels[1].nodes.length,2);
assert.match(levels[1].label,/ระดับ 2 · Y 3 m/);

assert.equal(nearestPlanNode(nodes,4.01,0,0,1e-5,.1)?.node.id,'N2');
assert.equal(nearestPlanNode(nodes,0,0,3,1e-5,.1)?.node.id,'N4');
assert.equal(nearestPlanNode(nodes,20,20,0,1e-5,.1),null);

const edge=(i,j)=>({id:`${i}-${j}`,i,j});
assert.equal(validateMemberEndpoints(nodes,[edge('N1','N2')],'N2','N1').reason,'มีสมาชิกคู่นี้แล้ว');
assert.equal(validateMemberEndpoints(nodes,[],'N1','N2',{levelY:0,disallowIntervening:true}).reason,'มีโหนดคั่นกลาง กรุณาวาดแยกช่วง');
assert.equal(validateMemberEndpoints(nodes,[],'N1','N4',{levelY:0,disallowIntervening:true}).reason,'เลือกโหนดที่ระดับเดียวกันก่อนวาดคาน');
assert.equal(validateMemberEndpoints([{id:'A',x:1,y:0,z:1},{id:'B',x:1,y:0,z:1}],[],'A','B',{levelY:0,disallowIntervening:true}).reason,'โหนดต้นและปลายอยู่ตำแหน่งเดียวกัน');
assert.equal(validateMemberEndpoints(nodes,[],'N1','N2',{levelY:0,disallowIntervening:false}).ok,true);
assert.equal(validateMemberEndpoints(nodes,[],'N1','N4').ok,true,'manual column members may connect different levels');

const placed=planNodeDraft(nodes,{x:1.23749,y:3,z:-2.5012},'N6');
assert.equal(placed.ok,true);
assert.deepEqual(placed.node,{id:'N6',x:1.237,y:3,z:-2.501,restraints:[false,false,false,false,false,false]});
assert.equal(planNodeDraft(nodes,{x:4,y:0,z:0},'N6').ok,false,'overlapping nodes must be rejected');
assert.equal(planNodeDraft(nodes,{x:Infinity,y:0,z:0},'N6').ok,false,'invalid coordinate must be rejected');
assert.equal(planNodeDraft(nodes,{x:2,y:0,z:1},'N1').ok,false,'duplicate IDs must be rejected');
assert.equal(planNodeDraft(nodes,{x:4,y:1,z:0},'N6').ok,true,'same XZ at different elevation is valid');

const structuralAxes=[{id:'A',x:4.5,y:3,z:4},{id:'B',x:0,y:3,z:0}];
assert.deepEqual(snapPlanPoint({x:1.014,y:1.5,z:2.198},structuralAxes,1.5,1,.12),{x:1,y:1.5,z:2});
assert.deepEqual(snapPlanPoint({x:4.49,y:1.5,z:3.98},structuralAxes,1.5,1,.12),{x:4.5,y:1.5,z:4},'existing structural axes take precedence over 1m visual grid');
assert.deepEqual(snapPlanPoint({x:-1.4,y:1.5,z:-2.6},[],1.5,1,.12),{x:-1,y:1.5,z:-3},'negative coordinates snap symmetrically');
assert.equal(snapPlanPoint({x:NaN,y:0,z:1},[],0,1,.12),null);
assert.equal(validPlanGridStep(.05),true);
assert.equal(validPlanGridStep(.15),true);
assert.equal(validPlanGridStep(1),true);
for(const invalid of [0,.049,.051,1.001,NaN,Infinity])assert.equal(validPlanGridStep(invalid),false);
assert.deepEqual(snapPlanPoint({x:1.237,y:1.5,z:-1.237},[],1.5,.05,.0),{x:1.25,y:1.5,z:-1.25},'5cm grid snaps positive and negative coordinates');
assert.deepEqual(snapPlanPoint({x:1.26,y:1.5,z:-1.26},[],1.5,.25,.0),{x:1.25,y:1.5,z:-1.25},'25cm grid snaps coordinates');
assert.equal(snapPlanPoint({x:1.2,y:1.5,z:0},[],1.5,.049,.0),null,'invalid grid step fails closed');

const grid=buildGridLayout({countX:5,countZ:5,spacingX:4.5,spacingZ:4,startX:0,startZ:0,y:3});
assert.equal(grid.lines.x.length,5);assert.equal(grid.lines.z.length,5);
assert.deepEqual(grid.lines.x.map(g=>g.label),['1','2','3','4','5']);
assert.deepEqual(grid.lines.z.map(g=>g.label),['A','B','C','D','E']);
assert.deepEqual(grid.lines.x.map(g=>g.value),[0,4.5,9,13.5,18]);
assert.deepEqual(grid.lines.z.map(g=>g.value),[0,4,8,12,16]);
assert.equal(grid.nodes.length,25);assert.equal(grid.edgesX.length,20);assert.equal(grid.edgesZ.length,20);
assert.deepEqual(grid.nodes[12],{x:9,y:3,z:8});
const customGrid=buildGridLayoutFromLines({linesX:[{label:'1',value:0},{label:'2',value:3.25},{label:'3',value:9}],linesZ:[{label:'A',value:-2},{label:'B',value:1},{label:'C',value:5}],y:4.5});
assert.equal(customGrid.ok,true);assert.deepEqual(customGrid.lines.x.map(g=>g.value),[0,3.25,9]);assert.deepEqual(customGrid.lines.z.map(g=>g.label),['A','B','C']);assert.equal(customGrid.nodes.length,9);assert.equal(customGrid.edgesX.length,6);assert.equal(customGrid.edgesZ.length,6);assert.equal(customGrid.nodes[0].y,4.5);
assert.equal(buildGridLayoutFromLines({linesX:[{label:'1',value:0},{label:'1',value:4}],linesZ:[{label:'A',value:0},{label:'B',value:4}],y:0}).ok,false,'duplicate labels must be rejected');
assert.equal(buildGridLayoutFromLines({linesX:[{label:'1',value:4},{label:'2',value:0}],linesZ:[{label:'A',value:0},{label:'B',value:4}],y:0}).ok,false,'axis positions must increase');
assert.equal(buildGridLayoutFromLines({linesX:[{label:'1',value:0}],linesZ:[{label:'A',value:0},{label:'B',value:4}],y:0}).ok,false,'minimum two grid axes per direction');
const smallGrid=buildGridLayout({countX:3,countZ:2,spacingX:4.5,spacingZ:4,startX:0,startZ:0,y:3});
const gridModel={nodes:[{id:'N1',x:0,y:3,z:0,restraints:[false,false,false,false,false,false]},{id:'N2',x:4.5,y:3,z:0,restraints:[false,false,false,false,false,false]}],members:[{id:'M1',i:'N1',j:'N2',kind:'beam',behavior:'frame',b:.25,h:.45}],slabs:[]};
const generated=planGridModel(gridModel,smallGrid,{beamsX:true,beamsZ:true,b:.3,h:.5});
assert.equal(generated.ok,true);assert.equal(generated.nodes.length,4);assert.equal(generated.members.length,6);assert.deepEqual(generated.gridLines,smallGrid.lines);
assert.equal(generated.members.every(m=>m.kind==='beam'&&m.b===.3&&m.h===.5),true);
const merged={...gridModel,nodes:[...gridModel.nodes,...generated.nodes],members:[...gridModel.members,...generated.members]};
const repeat=planGridModel(merged,smallGrid,{beamsX:true,beamsZ:true,b:.3,h:.5});
assert.equal(repeat.ok,true);assert.equal(repeat.nodes.length,0);assert.equal(repeat.members.length,0,'regenerating same grid must not duplicate nodes or beams');
assert.equal(planGridModel(gridModel,smallGrid,{beamsX:false,beamsZ:false,b:.3,h:.5}).members.length,0);
const crossing={nodes:[{id:'A',x:0,y:3,z:0},{id:'B',x:4,y:3,z:4},{id:'C',x:0,y:3,z:4},{id:'D',x:4,y:3,z:0}],members:[{id:'M1',i:'A',j:'B',kind:'beam',behavior:'frame'}]};
assert.equal(validateMemberEndpoints(crossing.nodes,crossing.members,'C','D',{levelY:3,disallowIntervening:true}).reason.includes('ตัด'),true,'reject unconnected beam crossings');
assert.equal(validateMemberEndpoints(crossing.nodes,crossing.members,'B','C',{levelY:3,disallowIntervening:true}).ok,true,'allow shared endpoint connections');
assert.equal(buildGridLayout({countX:1,countZ:5,spacingX:4,spacingZ:4,startX:0,startZ:0,y:0}).ok,false);
assert.equal(buildGridLayout({countX:5,countZ:5,spacingX:0,spacingZ:4,startX:0,startZ:0,y:0}).ok,false);
assert.equal(buildGridLayout({countX:30,countZ:30,spacingX:4,spacingZ:4,startX:0,startZ:0,y:0}).ok,false,'keep one-level grid under node cap');
const constrainedX=constrainPlanPoint({x:0,y:3,z:0},{x:1.237,y:3,z:2.198},'x',.05,true);
assert.deepEqual(constrainedX,{x:1.25,y:3,z:0},'X lock keeps Z at the start axis and snaps the free coordinate');
assert.deepEqual(constrainPlanPoint({x:0,y:3,z:0},{x:1.237,y:3,z:2.198},'z',.05,true),{x:0,y:3,z:2.2});
assert.deepEqual(constrainPlanPoint({x:4.5,y:3,z:2},{x:1.237,y:3,z:2.198},'x',.05,false),{x:1.237,y:3,z:2},'free-axis mode still locks the perpendicular axis');
assert.equal(constrainPlanPoint({x:0,y:0,z:0},{x:1,y:0,z:2},'y',.05,true),null);

const splitSource={nodes:[{id:'N1',x:0,y:3,z:0},{id:'N2',x:4.5,y:3,z:0},{id:'N3',x:0,y:0,z:0}],members:[{id:'M1',i:'N1',j:'N2',kind:'beam',behavior:'frame',b:.25,h:.45},{id:'M2',i:'N3',j:'N1',kind:'column',behavior:'frame'}],memberLoads:[{member:'M1',case:'D',qx:0,qy:-5,qz:0,axes:'global'}],slabs:[]};
const snapshot=JSON.stringify(splitSource);
const split=splitBeamAtDistance(splitSource,'M1','N1',1.5,'N4','M3');
assert.equal(split.ok,true);
assert.deepEqual(split.node,{id:'N4',x:1.5,y:3,z:0,restraints:[false,false,false,false,false,false]});
assert.deepEqual(split.members.map(m=>[m.id,m.i,m.j]),[['M1','N1','N4'],['M3','N4','N2']]);
assert.deepEqual(split.memberLoads.map(l=>[l.member,l.qy,l.axes]),[['M1',-5,'global'],['M3',-5,'global']]);
assert.equal(JSON.stringify(splitSource),snapshot,'split preview must not mutate existing model');
assert.equal(splitBeamAtDistance(splitSource,'M1','N2',1.5,'N4','M3').node.x,3,'distance from opposite end');
for(const distance of [0,4.5,-1,NaN])assert.equal(splitBeamAtDistance(splitSource,'M1','N1',distance,'N4','M3').ok,false);
assert.equal(splitBeamAtDistance(splitSource,'M1','N1',1.5,'N1','M3').ok,false,'duplicate node ID');
assert.equal(splitBeamAtDistance(splitSource,'M1','N1',1.5,'N4','M1').ok,false,'duplicate member ID');
assert.equal(splitBeamAtDistance({...splitSource,slabs:[{id:'S1',support1:'M1'}]},'M1','N1',1.5,'N4','M3').ok,false,'slab edge cannot be silently broken');
assert.equal(splitBeamAtDistance({...splitSource,nodes:[...splitSource.nodes,{id:'N8',x:1.5,y:3,z:0}]},'M1','N1',1.5,'N4','M3').ok,false,'existing coincident node');

const lineHit=nearestBeamOnPlan(splitSource,{x:1.52,z:.08},3,.15);
assert.equal(lineHit?.member.id,'M1');
assert.equal(lineHit?.fromId,'N1');
assert.equal(lineHit?.distanceFromI,1.52);
assert.deepEqual(lineHit?.point,{x:1.52,y:3,z:0});
assert.equal(nearestBeamOnPlan(splitSource,{x:1.52,z:.3},3,.15),null,'outside pick tolerance');
assert.equal(nearestBeamOnPlan(splitSource,{x:1.52,z:.08},0,.15),null,'wrong level');
assert.equal(nearestBeamOnPlan(splitSource,{x:5,z:0},3,.15),null,'outside member endpoints');
const tieSource={...splitSource,members:[...splitSource.members,{...splitSource.members[0],id:'M9'}]};
assert.equal(nearestBeamOnPlan(tieSource,{x:1.5,z:0},3,.15)?.ambiguous,true,'overlapping beams must not be selected arbitrarily');

const before=JSON.stringify({nodes,members:[]});
for(const [i,j,options] of [
  ['N1','N2',{levelY:0,disallowIntervening:true}],
  ['N1','N4',{levelY:0,disallowIntervening:true}],
  ['N1','N1',{levelY:0,disallowIntervening:true}]
]) assert.equal(validateMemberEndpoints(nodes,[],i,j,options).ok,false);
assert.equal(JSON.stringify({nodes,members:[]}),before,'rejected validation must not mutate model inputs');

// Test autoDetectGridLines
const buildingNodes=[
  {id:'N1',x:0,y:0,z:0},{id:'N2',x:4.5,y:0,z:0},{id:'N3',x:9,y:0,z:0},
  {id:'N4',x:0,y:0,z:4},{id:'N5',x:4.5,y:0,z:4},{id:'N6',x:9,y:0,z:4},
  {id:'N7',x:0,y:3,z:0},{id:'N8',x:4.5,y:3,z:0},{id:'N9',x:9,y:3,z:0}
];
const detected=autoDetectGridLines(buildingNodes,{levelY:0});
assert.equal(detected.ok,true);
assert.deepEqual(detected.lines.x.map(g=>g.value),[0,4.5,9]);
assert.deepEqual(detected.lines.x.map(g=>g.label),['1','2','3']);
assert.deepEqual(detected.lines.z.map(g=>g.value),[0,4]);
assert.deepEqual(detected.lines.z.map(g=>g.label),['A','B']);

// Test planContinuousBeamSegments across intermediate node N3(2,0,0) between N1(0,0,0) and N2(4,0,0)
const cont1=planContinuousBeamSegments(nodes,[],'N1','N2',{levelY:0,memberProps:{kind:'beam',b:.25,h:.45}});
assert.equal(cont1.ok,true);
assert.equal(cont1.intermediateCount,1);
assert.deepEqual(cont1.nodeChain,['N1','N3','N2']);
assert.equal(cont1.segments.length,2);
assert.equal(cont1.segments[0].i,'N1');assert.equal(cont1.segments[0].j,'N3');
assert.equal(cont1.segments[1].i,'N3');assert.equal(cont1.segments[1].j,'N2');

// Test planContinuousBeamSegments with roof role (จันทัน RAF and อะเส AS)
const contRoof=planContinuousBeamSegments(nodes,[],'N1','N2',{levelY:0,memberProps:{kind:'roof',roofRole:'AS',b:.1,h:.15}});
assert.equal(contRoof.ok,true);
assert.equal(contRoof.segments[0].roofRole,'AS');
assert.equal(contRoof.segments[1].roofRole,'AS');

// Test planContinuousBeamSegments drawing to a new point
let memIdCount=1;
const contNewPoint=planContinuousBeamSegments(nodes,[],'N1',{x:6,y:0,z:0},{levelY:0,allowNewEndNode:true,freshNodeId:'N99',nextMemberIdFn:()=>`M${memIdCount++}`});
assert.equal(contNewPoint.ok,true);
assert.deepEqual(contNewPoint.nodeChain,['N1','N3','N2','N99']);
assert.equal(contNewPoint.segments.length,3);
assert.equal(contNewPoint.nodesToAdd.length,1);
assert.equal(contNewPoint.nodesToAdd[0].id,'N99');

// Test warehouseModel tributary area load weighting and symmetric ground tie beams
import {warehouseModel} from '../static/building.js';
const wh=warehouseModel(12,5,3,4.5,1.8,4,false,true);
assert.equal(wh.nodes.length>0,true);

// Verify tributary scaling: end frames (y=0, y=15) have trib=0.5, interior frames (y=5, y=10) have trib=1.0
const endNodesY0=new Set(wh.nodes.filter(n=>n.y===0).map(n=>n.id));
const endNodesY15=new Set(wh.nodes.filter(n=>n.y===15).map(n=>n.id));
const intNodesY5=new Set(wh.nodes.filter(n=>n.y===5).map(n=>n.id));

const endLoadsY0=wh.nodalLoads.filter(l=>endNodesY0.has(l.node)&&l.case==='D');
const intLoadsY5=wh.nodalLoads.filter(l=>intNodesY5.has(l.node)&&l.case==='D');
assert.equal(endLoadsY0.length>0,true);
assert.equal(intLoadsY5.length>0,true);
// End frame loads should be exactly half of interior frame loads (downward in -Z)
assert.equal(endLoadsY0[0].fz,-1.25);
assert.equal(intLoadsY5[0].fz,-2.5);

// Verify ground tie beams at Z=0: symmetric on left (x=0) and right (x=12) along Y
const groundBeams=wh.members.filter(m=>m.kind==='beam'&&m.h===0.40);
const gbLeft=groundBeams.filter(m=>{
  const ni=wh.nodes.find(n=>n.id===m.i),nj=wh.nodes.find(n=>n.id===m.j);
  return ni.x===0&&nj.x===0&&ni.z===0&&nj.z===0;
});
const gbRight=groundBeams.filter(m=>{
  const ni=wh.nodes.find(n=>n.id===m.i),nj=wh.nodes.find(n=>n.id===m.j);
  return ni.x===12&&nj.x===12&&ni.z===0&&nj.z===0;
});
assert.equal(gbLeft.length,3,'3 left ground tie beams along Y');
assert.equal(gbRight.length,3,'3 right ground tie beams along Y');

// Verify cross tie beams across X at Z=0
const gbCross=groundBeams.filter(m=>{
  const ni=wh.nodes.find(n=>n.id===m.i),nj=wh.nodes.find(n=>n.id===m.j);
  return ni.z===0&&nj.z===0&&Math.abs(nj.x-ni.x)===12;
});
assert.equal(gbCross.length,4,'4 cross ground tie beams at column lines');

// Verify grid lines generated
assert.deepEqual(wh.gridLines.x,[{label:'1',value:0},{label:'2',value:12}]);
assert.equal(wh.gridLines.y.length,4);
assert.equal(wh.gridLines.y[0].label,'A');
assert.equal(wh.gridLines.y[3].label,'D');
assert.equal(wh.coordinateSystem,'z-up');

console.log('PASS: level grouping, level-specific snapping, same-level/zero/duplicate/intervening checks, manual cross-level endpoints, rejection purity, auto-detect grids, continuous beams, warehouse tributary loading & ground beams.');

