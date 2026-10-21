const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
  const accounts=[['الاسم','السجل المدني','الصلاحية'],['First','1000000001','مشرف'],['Second','1000000002','مشرف'],['Manager','1000000003','مدير النظام']];
  const schools=[['معرف السجل','اسم المدرسة','اسم مدير المدرسة','المحافظة','جوال مدير المدرسة','المشرف','السجل المدني'],['a','A','Principal A','North','0500000000','First','1000000001'],['b','B','Principal B','South','0500000001','First','1000000001'],['c','C','Principal C','East','0500000002','Second','1000000002'],['d','D','Principal D','West','0500000003','','']];
  const cache=new Map();let uuid=0;
  const sheets={'المدارس':schools,'المشرفين':accounts};
  const ctx=vm.createContext({beginRequest_(){},SHEETS:{schools:'المدارس',status:'status'},normalizeCode_:value=>String(value||'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)),hash_:value=>'hashed-'+value,
    Utilities:{getUuid:()=>String(++uuid)},CacheService:{getScriptCache:()=>({put:(key,value)=>cache.set(key,value),get:key=>cache.get(key),remove:key=>cache.delete(key)})},
    sheet_:name=>{const rows=sheets[name];if(!rows)throw Error('missing');return {getLastColumn:()=>rows[0].length,getLastRow:()=>rows.length,getRange:(row,col,height,width)=>({getDisplayValues:()=>rows.slice(row-1,row-1+height).map(item=>item.slice(col-1,col-1+width))})};},
    records_:()=>[{values:['a','مكتمل']},{values:['c','مكتمل']}]
  });
  vm.runInContext(fs.readFileSync(process.env.MONITORING_BACKEND_PATH||'Monitoring.gs','utf8'),ctx);
  return {ctx,accounts,schools};
}
test('supervisor sees assigned schools only, accurate counts, and no civil IDs',()=>{
  const {ctx}=environment();const login=ctx.loginSupervisor('١٠٠٠٠٠٠٠٠١');
  assert.equal(login.data.user.role,'مشرف');assert.equal(login.data.stats.total,2);assert.equal(login.data.stats.percent,50);
  assert.deepEqual(Array.from(login.data.schools,school=>school.id),['a','b']);
  assert.ok(!JSON.stringify(login).includes('1000000001'));assert.equal(login.data.supervisors,undefined);
  assert.throws(()=>ctx.getMonitoring('school-session'));
  ctx.logoutSupervisor(login.token);assert.throws(()=>ctx.getMonitoring(login.token));
});
test('manager sees global stats, each supervisor and unassigned records',()=>{
  const {ctx}=environment();const {data}=ctx.loginSupervisor('1000000003');
  assert.equal(data.stats.total,4);assert.equal(data.stats.complete,2);assert.equal(data.stats.remaining,2);
  assert.equal(data.supervisors.find(item=>item.name==='Second').percent,100);
  assert.equal(data.unassigned.total,1);assert.ok(!JSON.stringify(data).includes('1000000002'));
});
test('manager sees all statistics without assignment columns; supervisors cannot bypass scoping',()=>{
  const {ctx,schools}=environment();
  for(const row of schools)row.splice(5,2);
  const {data}=ctx.loginSupervisor('1000000003');
  assert.equal(data.stats.total,4);assert.equal(data.stats.complete,2);assert.equal(data.stats.percent,50);
  assert.equal(data.unassigned.total,4);assert.equal(data.assignmentReady,false);
  assert.equal(data.supervisors.length,3);
  assert.throws(()=>ctx.loginSupervisor('1000000001'));
});
test('assignment headers tolerate extra whitespace and invisible directional characters',()=>{
  const {ctx,schools}=environment();schools[0][6]=' \u200fالسجل\u00a0  المدني\u200e\n';
  schools[0][5]='\u200fالمشرف ';
  assert.equal(ctx.loginSupervisor('1000000001').data.stats.total,2);
});
test('civil heading tolerates Arabic ya variants, diacritics and tatweel without changing account scope',()=>{
  const {ctx,schools}=environment();schools[0][6]='السّجـل المدنى';
  const result=ctx.loginSupervisor('1000000001');assert.equal(result.data.stats.total,2);
  schools[0].push('السجل المدني');assert.throws(()=>ctx.loginSupervisor('1000000001'),/مكرر/);
});
test('missing and duplicate assignment headers give distinct errors without broadening access',()=>{
  const {ctx,schools}=environment();schools[0].push('السجل المدني');
  assert.throws(()=>ctx.loginSupervisor('1000000001'),/مكرر/);
  schools[0].pop();schools[0][6]='عنوان مختلف';
  assert.throws(()=>ctx.loginSupervisor('1000000001'),/لم يُعثر/);
});
test('permissions and assignments are rechecked on refresh; removed accounts lose access',()=>{
  const {ctx,accounts,schools}=environment();const login=ctx.loginSupervisor('1000000001');
  schools[2][6]='1000000002';assert.equal(ctx.getMonitoring(login.token).stats.total,1);
  accounts.splice(1,1);assert.throws(()=>ctx.getMonitoring(login.token));
});
test('unknown, malformed and duplicate civil IDs cannot log in',()=>{
  const {ctx,accounts}=environment();assert.throws(()=>ctx.loginSupervisor('123'));assert.throws(()=>ctx.loginSupervisor('9999999999'));
  accounts.push(['Duplicate','1000000001','مشرف']);assert.throws(()=>ctx.loginSupervisor('1000000001'));
});
test('only manager sessions can reopen a single approved school and statistics refresh',()=>{
  const {ctx,schools}=environment();const statuses=[{values:['a','مكتمل']},{values:['c','مكتمل']}];
  ctx.records_=name=>name==='المدارس'?schools.slice(1).map(values=>({values})):statuses;
  ctx.find_=(name,id)=>statuses.find(row=>row.values[0]===id);
  let writes=0;ctx.touch_=(id,complete)=>{assert.equal(complete,false);writes++;statuses.find(row=>row.values[0]===id).values[1]='قيد الاستكمال';};
  ctx.withWriteLock_=work=>work();
  const supervisor=ctx.loginSupervisor('1000000001');assert.throws(()=>ctx.reopenSchool(supervisor.token,{id:'a'}),/مدير النظام/);assert.equal(writes,0);
  assert.throws(()=>ctx.reopenSchool('invalid',{id:'a'}));assert.equal(writes,0);
  const manager=ctx.loginSupervisor('1000000003');const result=ctx.reopenSchool(manager.token,{id:'a'});
  assert.equal(result.stats.complete,1);assert.equal(result.schools.find(row=>row.id==='a').status,'قيد الاستكمال');
  assert.equal(result.schools.find(row=>row.id==='c').status,'مكتمل');assert.equal(writes,1);
  ctx.reopenSchool(manager.token,{id:'a'});assert.equal(writes,1);
  assert.throws(()=>ctx.reopenSchool(manager.token,{id:'missing'}));assert.equal(writes,1);
});
test('manager permission is rechecked after waiting for the write lock',()=>{
  const {ctx,accounts}=environment();const manager=ctx.loginSupervisor('1000000003');let writes=0;
  ctx.withWriteLock_=work=>{accounts[3][2]='مشرف';return work();};ctx.touch_=()=>writes++;
  assert.throws(()=>ctx.reopenSchool(manager.token,{id:'a'}),/مدير النظام/);assert.equal(writes,0);
});
test('incomplete unrelated rows do not block valid accounts and whitespace roles normalize',()=>{
  const {ctx,accounts}=environment();
  accounts.push(['Incomplete','','']);
  accounts[1][2]=' \u200fمشرف\u200e ';
  assert.equal(ctx.loginSupervisor('1000000001').data.stats.total,2);
  const manager=ctx.loginSupervisor('1000000003').data;
  assert.equal(manager.accountIssues.length,1);
  assert.match(manager.accountIssues[0],/الصف 5/);
});
test('the matching account gets a precise row and field error without disclosing its civil ID',()=>{
  const {ctx,accounts}=environment();accounts[1][2]='مدير';
  assert.throws(()=>ctx.loginSupervisor('1000000001'),error=>error.message.includes('الصف 2')&&error.message.includes('الصلاحية')&&!error.message.includes('1000000001'));
  assert.equal(ctx.loginSupervisor('1000000002').data.stats.total,1);
});
test('contact links accept Saudi mobile numbers and reject executable input',()=>{
  const html=fs.readFileSync('Monitor.html','utf8');const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
  const ctx=vm.createContext({window:{},document:{getElementById:()=>({addEventListener(){}})}});vm.runInContext(code,ctx);
  assert.equal(ctx.phoneNumber('٠٥٠٠٠٠٠٠٠٠'),'966500000000');assert.equal(ctx.phoneNumber('javascript:alert(1)'),null);
  assert.equal(ctx.phoneNumber('+966500000000'),'966500000000');
});
test('large school lists render 50 rows per page and filters reset pagination',()=>{
  const html=fs.readFileSync('Monitor.html','utf8');const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
  const nodes={};const el=id=>nodes[id]??={value:'',textContent:'',innerHTML:'',addEventListener(){},classList:{add(){},toggle(){}}};
  const ctx=vm.createContext({window:{},clearTimeout(){},document:{getElementById:el}});vm.runInContext(code,ctx);
  el('statusFilter').value='all';el('ownerFilter').value='all';
  const schools=Array.from({length:123},(_,i)=>({id:String(i),name:'School'+i,principal:'Principal',governorate:'North',mobile:'0500000000',status:'مكتمل',supervisorKey:'owner'}));
  vm.runInContext('model='+JSON.stringify({user:{role:'مدير النظام'},schools}),ctx);
  ctx.drawSchools();assert.equal((el('schools').innerHTML.match(/data-contact=/g)||[]).length,50);
  ctx.changeSchoolPage(2);assert.equal((el('schools').innerHTML.match(/data-contact=/g)||[]).length,23);
  el('search').value='School122';ctx.filterSchools();
  assert.equal((el('schools').innerHTML.match(/data-contact=/g)||[]).length,1);
  assert.match(el('schoolPageLabel').textContent,/1/);
});
