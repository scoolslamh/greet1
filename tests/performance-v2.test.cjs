const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {backend}=require('./performance.test.cjs');
test('thousands of schools do not require downloading full school, guard and coverage tables',()=>{
  const b=backend();for(let i=2;i<=1001;i++){b.tables.schools.push(['s'+i,String(10000+i),'Other','','','','','','','','','','']);b.tables.guards.push(['s'+i,'x','Other']);b.tables.coverage.push(['s'+i]);b.tables.status.push(['s'+i,'قيد الاستكمال']);}
  b.ctx.loginByCode('123');assert.ok(b.metrics.cellsRead<1100);assert.equal(b.metrics.opens,1);
});
test('ministerial code duplicates remain blocked and moved row writes are rejected',()=>{
  const b=backend();b.tables.schools.push(['s2','123','Other']);assert.throws(()=>b.ctx.loginByCode('123'));
  b.tables.schools.pop();const record=b.ctx.find_('المدارس','s1');b.tables.schools[1][0]='another-id';
  assert.throws(()=>b.ctx.verifyRecordRow_('المدارس','s1',record.row));assert.equal(b.metrics.writes,0);
});
test('compact save returns canonical changed fields and avoids the full reload',()=>{
  const b=backend();b.ctx.load_=()=>{throw Error('Unexpected full reload');};
  const result=b.ctx.saveSchool('token',{principal:' Changed ',mobile:'0500000001',address:' New address ',email:'CHANGED@example.edu.sa',__compact:true});
  assert.equal(result.saved,true);assert.equal(result.patch.school.principal,'Changed');assert.equal(result.patch.school.email,'changed@example.edu.sa');assert.equal(result.patch.status,'قيد الاستكمال');assert.equal(b.metrics.writes,2);
});
test('new school client merges compact patches while accepting legacy full responses',async()=>{
  const elements={};const get=id=>elements[id]??={addEventListener(){}};
  const ctx=vm.createContext({window:{},document:{getElementById:get}});const html=fs.readFileSync('Index.html','utf8');vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1],ctx);
  vm.runInContext("data={school:{name:'School',principal:'Old'},guards:{ministry:[],company:[]}};token='session'",ctx);
  ctx.run=async(action,token,payload)=>{assert.equal(payload.__compact,true);return {saved:true,patch:{school:{principal:'New'},status:'قيد الاستكمال'}};};
  await ctx.saveStep('saveSchool',{});assert.equal(vm.runInContext('data.school.name',ctx),'School');assert.equal(vm.runInContext('data.school.principal',ctx),'New');
  ctx.run=async()=>({school:{name:'Legacy'},status:'لم يبدأ'});await ctx.saveStep('saveSchool',{});assert.equal(vm.runInContext('data.school.name',ctx),'Legacy');
});
test('both pages expose a real spinner and hide it after failed operations',async()=>{
  for(const file of ['Index.html','Monitor.html']){
    const html=fs.readFileSync(file,'utf8');assert.ok(html.includes('class="operation-spinner"'));assert.ok(html.includes('role="status" aria-live="polite"'));
    const nodes={},hidden=new Set();const get=id=>nodes[id]??={style:{},textContent:'',addEventListener(){},classList:{add:name=>hidden.add(id+':'+name),remove:name=>hidden.delete(id+':'+name)}};
    const ctx=vm.createContext({window:{},clearTimeout(){},document:{getElementById:get,querySelectorAll:()=>[]}});vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1],ctx);
    await ctx.busy(async()=>{assert.equal(hidden.has('operationLoading:hidden'),false);throw Error('test failure');});assert.equal(hidden.has('operationLoading:hidden'),true);
  }
});
