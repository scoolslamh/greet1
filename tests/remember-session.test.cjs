const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
  const storage=new Map(),nodes={},events={};let renders=0;
  const element=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',style:{},open:false,disabled:false,addEventListener(){},focus(){},removeAttribute(){},setAttribute(){},classList:{add(){},remove(){}}};
  const ctx=vm.createContext({window:{localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},addEventListener:(name,fn)=>events[name]=fn},document:{getElementById:element,querySelectorAll:()=>[]},clearTimeout(){}});
  const html=fs.readFileSync(process.env.MONITOR_UI_PATH||'Monitor.html','utf8');
  vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1],ctx);ctx.render=()=>renders++;
  return {ctx,storage,events,element,renders:()=>renders,state:()=>vm.runInContext('({session,model})',ctx)};
}
const key='aseer-monitor-session-v1';
test('successful login persists only token and expiry; reload verifies token with server',async()=>{
  const a=environment();a.element('civil').value='1000000001';
  a.ctx.call=async()=>({token:'opaque-session',data:{user:{name:'Manager',role:'مدير النظام'},schools:[]}});
  await a.ctx.signIn();const stored=JSON.parse(a.storage.get(key));assert.deepEqual(Object.keys(stored).sort(),['expiresAt','token']);assert.equal(stored.token,'opaque-session');assert.ok(!a.storage.get(key).includes('1000000001'));
  const b=environment();b.storage.set(key,JSON.stringify(stored));let called;
  b.ctx.call=async(action,token)=>{called={action,token};return {user:{role:'مشرف'},schools:[]};};
  await b.ctx.restoreSession();assert.deepEqual(called,{action:'getMonitoring',token:'opaque-session'});assert.equal(b.state().model.user.role,'مشرف');assert.equal(b.renders(),1);
});
test('expired local or rejected server sessions are removed',async()=>{
  const a=environment();a.storage.set(key,JSON.stringify({token:'old',expiresAt:Date.now()-1}));let calls=0;a.ctx.call=async()=>calls++;
  await a.ctx.restoreSession();assert.equal(calls,0);assert.equal(a.storage.has(key),false);
  const b=environment();b.ctx.rememberSession('revoked');b.ctx.call=async()=>{throw Error('انتهت جلسة المتابعة؛ سجل الدخول مجدداً');};
  await b.ctx.restoreSession();assert.equal(b.storage.has(key),false);assert.equal(b.state().session,'');assert.equal(b.state().model,null);
});
test('network failures retain the stored token but never show unverified school data',async()=>{
  const a=environment();a.ctx.rememberSession('valid');a.ctx.call=async()=>{throw Error('network unavailable');};await a.ctx.restoreSession();
  assert.equal(a.storage.has(key),true);assert.equal(a.state().model,null);assert.equal(a.renders(),0);
});
test('logout clears local data even when server logout fails',async()=>{
  const a=environment();a.ctx.rememberSession('active');vm.runInContext("session='active';model={private:true}",a.ctx);
  a.ctx.call=async()=>{throw Error('offline');};await a.ctx.signOut();assert.equal(a.storage.has(key),false);assert.equal(a.state().model,null);assert.equal(a.state().session,'');
});
test('cross-tab logout prevents a pending restore from restoring private data',async()=>{
  const a=environment();a.ctx.rememberSession('active');let resolve;a.ctx.call=()=>new Promise(done=>resolve=done);
  const pending=a.ctx.restoreSession();a.storage.delete(key);a.events.storage({key});resolve({user:{role:'مدير النظام'}});await pending;
  assert.equal(a.state().model,null);assert.equal(a.renders(),0);
});
test('disabled browser storage does not block ordinary login',async()=>{
  const a=environment();a.ctx.window.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  assert.equal(a.ctx.readStoredSession(),null);a.element('civil').value='1000000001';a.ctx.call=async()=>({token:'active',data:{user:{role:'مشرف'}}});await a.ctx.signIn();assert.equal(a.state().session,'active');
});
