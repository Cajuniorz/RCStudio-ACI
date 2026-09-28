import assert from 'node:assert/strict';
import {groupLevels,nearestPlanNode,validateMemberEndpoints,planNodeDraft} from '../static/plan.js';

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

const before=JSON.stringify({nodes,members:[]});
for(const [i,j,options] of [
  ['N1','N2',{levelY:0,disallowIntervening:true}],
  ['N1','N4',{levelY:0,disallowIntervening:true}],
  ['N1','N1',{levelY:0,disallowIntervening:true}]
]) assert.equal(validateMemberEndpoints(nodes,[],i,j,options).ok,false);
assert.equal(JSON.stringify({nodes,members:[]}),before,'rejected validation must not mutate model inputs');
console.log('PASS: level grouping, level-specific snapping, same-level/zero/duplicate/intervening checks, manual cross-level endpoints, rejection purity.');
