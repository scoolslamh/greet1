const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function ui(){
  const nodes={},listeners={};let focused;
  function element(id){
    const attrs={},classes=new Set();
    return {id,value:'',textContent:'',className:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      setAttribute:(key,value)=>attrs[key]=value,getAttribute:key=>attrs[key],removeAttribute:key=>delete attrs[key],
      insertAdjacentElement(position,node){nodes[node.id]=node;},remove(){delete nodes[this.id];},
      addEventListener(){},focus(){focused=id;},matches:()=>true};
  }
  const get=id=>nodes[id]??(id.endsWith('_error')?null:nodes[id]=element(id));
  const ctx=vm.createContext({window:{},clearTimeout(){},setTimeout(){},document:{
    getElementById:get,createElement:()=>element(''),addEventListener:(name,fn)=>listeners[name]=fn,
    querySelectorAll:()=>Object.values(nodes).filter(node=>node.getAttribute('aria-invalid')==='true')
  }});
  const html=fs.readFileSync('Index.html','utf8');
  vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1],ctx);
  return {ctx,get,listeners,focused:()=>focused};
}
test('invalid school fields are individually marked; editing clears only the edited field and notice',()=>{
  const u=ui();
  u.get('principal').value='Principal';u.get('address').value='Address';u.get('mobile').value='123';u.get('email').value='invalid';
  assert.throws(()=>u.ctx.validateSchoolForm());
  assert.equal(u.focused(),'mobile');
  assert.equal(u.get('mobile').getAttribute('aria-invalid'),'true');
  assert.ok(u.get('mobile_error').textContent.length>0);
  assert.equal(u.get('email').classList.contains('invalid-field'),true);
  u.ctx.notify('problem',true);
  u.listeners.input({target:u.get('mobile')});
  assert.equal(u.get('mobile').getAttribute('aria-invalid'),undefined);
  assert.equal(u.get('mobile_error'),null);
  assert.equal(u.get('message').className,'hidden alert');
  assert.equal(u.get('email').getAttribute('aria-invalid'),'true');
  u.get('mobile').value='0500000000';u.get('email').value='principal@example.edu.sa';
  u.ctx.validateSchoolForm();
  assert.equal(u.get('email').getAttribute('aria-invalid'),undefined);
});
test('coverage validation pinpoints used gates and manual current counts',()=>{
  const u=ui();
  vm.runInContext("data={options:{affiliation:['a'],classification:['b'],coverageType:['c'],coverageRange:['d'],risk:['e']}}",u.ctx);
  for(const [id,value] of Object.entries({affiliation:'a',classification:'b',population:'100',gates:'2',usedGates:'3',coverageType:'c',coverageRange:'d',current:'-1',required:'5',risk:'e'}))u.get(id).value=value;
  assert.throws(()=>u.ctx.validateCoverageForm());
  assert.equal(u.get('usedGates').getAttribute('aria-invalid'),'true');
  assert.equal(u.get('current').getAttribute('aria-invalid'),'true');
  u.get('usedGates').value='2';u.get('current').value='0';u.ctx.validateCoverageForm();
  assert.equal(u.get('current_error'),null);
});
test('navigation clears notices and invalid guard counts identify the correct count field',()=>{
  const u=ui();u.get('ministryCount').value='51';u.get('companyCount').value='0';
  assert.deepEqual(Object.keys(u.ctx.guardCountErrors()),['ministryCount']);
  u.ctx.notify('saved');u.ctx.hideDashboard();
  assert.equal(u.get('message').textContent,'');
  assert.equal(u.get('message').className,'hidden alert');
});
