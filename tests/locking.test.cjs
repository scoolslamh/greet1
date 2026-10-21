const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(acquired=true){
  const events=[],writes=[];let held=false;
  const lock={tryLock(timeout){assert.equal(timeout,25000);events.push('acquire');held=acquired;return acquired;},releaseLock(){events.push('release');held=false;}};
  const ctx=vm.createContext({LockService:{getScriptLock:()=>lock},SpreadsheetApp:{flush(){assert.ok(held);events.push('flush');}}});
  vm.runInContext(fs.readFileSync(process.env.LOCK_BACKEND_PATH||'الرمز.js','utf8'),ctx);
  const school=['id','123','School','City','Governorate','','','','','Principal','0500000000','Address','example@example.edu.sa'];
  const sheet={getLastRow:()=>2,getLastColumn:()=>16,getMaxColumns:()=>310,getRange:()=>({getDisplayValue:()=> 'الرقم الوزاري',setValues(values){assert.ok(held);events.push('write');writes.push(values);}})};
  Object.assign(ctx,{auth_:()=> 'id',supervisor_:()=>{},editable_:()=>{assert.ok(held);},find_:()=>({row:2,values:school}),sheet_:()=>sheet,
    guardsFromRow_:()=>({ministry:[],company:[]}),upsert_:()=>{assert.ok(held);events.push('write');},touch_:()=>{assert.ok(held);events.push('status');},
    load_:()=>{assert.equal(held,false);events.push('response');return {saved:true};},dashboard:()=>{assert.equal(held,false);events.push('response');return {saved:true};},
    migrateGuardsColumns_:()=>{throw Error('A normal save must never migrate all guard records');}
  });return {ctx,events,writes};
}
const school={principal:'Principal',mobile:'0500000000',address:'Address',email:'example@example.edu.sa'};
const coverage={affiliation:'حكومي',classification:'ابتدائي',population:'100',gates:'2',usedGates:'1',coverageType:'حراس الوزارة',coverageRange:'على مدار اليوم',current:'7',required:'10',risk:'منخفضة'};
test('all daily mutations flush and release before constructing the response',()=>{
  for(const [method,payload] of [['saveSchool',school],['saveGuards',{ministry:[],company:[]}],['saveCoverage',coverage],['approve'],['reopen']]){
    const {ctx,events}=environment();ctx[method]('token',payload);
    assert.deepEqual(events.slice(-3),['flush','release','response']);
  }
});
test('busy lock rejects before writing and never retries the write',()=>{
  const {ctx,events}=environment(false);
  assert.throws(()=>ctx.saveSchool('token',school),/لم يبدأ حفظ هذا الطلب/);
  assert.deepEqual(events,['acquire']);
});
test('validation failure inside the lock releases it without a success response',()=>{
  const {ctx,events}=environment();ctx.editable_=()=>{throw Error('approved');};
  assert.throws(()=>ctx.saveSchool('token',school),/approved/);
  assert.deepEqual(events,['acquire','flush','release']);
});
test('flush failure still releases the lock',()=>{
  const {ctx,events}=environment();ctx.SpreadsheetApp.flush=()=>{events.push('flush');throw Error('flush failed');};
  assert.throws(()=>ctx.saveSchool('token',school),/flush failed/);assert.equal(events.at(-1),'release');
});
test('saving fewer guards clears old trailing cells in one write without migration',()=>{
  const {ctx,writes}=environment();ctx.saveGuards('token',{ministry:[],company:[]});
  assert.equal(writes.length,1);assert.equal(writes[0][0].length,16);assert.deepEqual(Array.from(writes[0][0].slice(10)),Array(6).fill(''));
});
