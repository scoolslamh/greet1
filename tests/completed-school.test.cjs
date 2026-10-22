const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function backend(state='مكتمل',raw=new Date('2026-10-22T21:15:00Z'),display=''){
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(process.env.COMPLETED_BACKEND_PATH||'الرمز.js','utf8'),ctx);
  const queried=[];Object.assign(ctx,{find_:(sheet)=>{queried.push(sheet);if(sheet==='المدارس')return {values:['id','123','School','','','','','','','Private principal','Private phone']};if(sheet==='المتابعة')return {row:2,values:['id',state,'',display]};return null;},sheet_:()=>({getRange:()=>({getValue:()=>raw})}),Utilities:{formatDate(value,zone,format){assert.equal(zone,'Asia/Riyadh');assert.equal(value,raw);return format==='yyyy/MM/dd'?'2026/10/23':'00:15';}}});
  return {ctx,queried};
}
test('approved school returns name and recorded approval in Riyadh time without editable data',()=>{
  const {ctx,queried}=backend();const result=ctx.load_('id');assert.equal(result.school.name,'School');assert.deepEqual(Object.keys(result.school),['name']);assert.equal(result.approval.date,'2026/10/23');assert.equal(result.approval.time,'00:15');assert.ok(!JSON.stringify(result).includes('Private'));assert.ok(!queried.includes('الحراس'));
});
test('reopened school returns the ordinary form payload even with a historical approval date',()=>{
  const {ctx}=backend('قيد الاستكمال');const result=ctx.load_('id');assert.equal(result.status,'قيد الاستكمال');assert.equal(result.school.principal,'Private principal');assert.ok(result.guards);assert.equal(result.approval,undefined);
});
test('missing approval timestamp stays missing; legacy text is preserved without guessing dates',()=>{
  assert.equal(backend('مكتمل','').ctx.load_('id').approval,null);assert.equal(backend('مكتمل','legacy','Saved time').ctx.load_('id').approval.display,'Saved time');
});
test('approved screen hides steps and metadata and never invokes a form renderer',()=>{
  const nodes={};const el=id=>nodes[id]??={textContent:'',innerHTML:'',className:'',hidden:false,classList:{add(){},remove(){},toggle(name,value){nodes[id].hidden=value;}},addEventListener(){}};
  const ctx=vm.createContext({window:{},clearTimeout(){},document:{getElementById:el}});const html=fs.readFileSync(process.env.COMPLETED_UI_PATH||'Index.html','utf8');vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1],ctx);
  let forms=0;ctx.renderSchool=()=>forms++;vm.runInContext("data={school:{name:'School'},status:'مكتمل',approval:{date:'2026/10/23',time:'00:15'}};render();",ctx);
  assert.equal(forms,0);assert.equal(el('schoolTitle').textContent,'School');assert.ok(el('schoolMeta').hidden);assert.ok(el('steps').hidden);assert.ok(!el('content').innerHTML.includes('<input'));assert.ok(el('content').innerHTML.includes('2026/10/23'));assert.ok(el('content').innerHTML.includes('00:15'));
  vm.runInContext("data={school:{name:'School',code:'123',governorate:'Place'},status:'قيد الاستكمال'};render();",ctx);assert.equal(forms,1);assert.equal(el('steps').hidden,false);
});
