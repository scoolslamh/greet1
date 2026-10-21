const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ui(){
  const nodes={};const get=id=>nodes[id]??={id,value:'0',disabled:false,textContent:'',className:'',addEventListener(){},classList:{remove(){}},removeAttribute(){},getAttribute:()=>'',focus(){}};
  const ctx=vm.createContext({window:{},clearTimeout(){},document:{getElementById:id=>id.endsWith('_error')?null:get(id)}});
  const html=fs.readFileSync(process.env.GUARD_UI_PATH||'Index.html','utf8');const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];vm.runInContext(code,ctx);
  let draws=0;ctx.drawGuards=()=>draws++;return {ctx,get,html,draws:()=>draws};
}
test('guard counts are read-only and have accessible plus and minus buttons',()=>{
  const {ctx}=ui();const markup=ctx.guardCounter('عدد حراس الوزارة','ministry',3);
  assert.match(markup,/type="text" inputmode="none" readonly/);assert.match(markup,/aria-readonly="true"/);
  assert.match(markup,/changeGuardCount\(&quot;ministry&quot;,1\)/);assert.match(markup,/changeGuardCount\(&quot;ministry&quot;,-1\)/);
});
test('counter adjusts by one, clamps to zero and fifty, and respects in-flight saves',()=>{
  const {ctx,get,draws}=ui();ctx.changeGuardCount('ministry',-1);assert.equal(draws(),0);
  ctx.changeGuardCount('ministry',1);assert.equal(get('ministryCount').value,1);assert.equal(draws(),1);
  get('ministryCount').value='50';ctx.changeGuardCount('ministry',1);assert.equal(draws(),1);
  ctx.changeGuardCount('ministry',-1);assert.equal(get('ministryCount').value,49);
  get('ministryPlus').disabled=true;ctx.changeGuardCount('ministry',-1);assert.equal(get('ministryCount').value,49);
  ctx.changeGuardCount('company',1);assert.equal(get('companyCount').value,1);
});
test('school login has no supervisor entry button or monitoring link',()=>{
  const {html}=ui();const login=html.match(/<section id="login"[\s\S]*?<\/section>/)[0];
  assert.ok(!login.includes('showDashboard'));assert.ok(!login.includes('لوحة المشرفين'));assert.ok(!login.includes('monitor.html'));
});
