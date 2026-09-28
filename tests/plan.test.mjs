import assert from 'node:assert/strict';
import {groupLevels,nearestPlanNode,validateMemberEndpoints,planNodeDraft,snapPlanPoint,splitBeamAtDistance,nearestBeamOnPlan,validPlanGridStep} from '../static/plan.js';

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
console.log('PASS: level grouping, level-specific snapping, same-level/zero/duplicate/intervening checks, manual cross-level endpoints, rejection purity.');
