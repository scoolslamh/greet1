const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function backend(){
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync('الرمز.js','utf8'),ctx);
  let saved;
  Object.assign(ctx,{
    auth_:()=> 'record',
    find_:(sheet)=>({values:sheet==='المدارس'?['record','123','school','city']:[]}),
    guardsFromRow_:()=>({ministry:[{name:'a'}],company:[]}),
    editable_:()=>{},touch_:()=>{},load_:()=>({saved:true}),
    upsert_:(sheet,id,values)=>{saved=values;},
    SpreadsheetApp:{flush(){}},
    LockService:{getScriptLock:()=>({tryLock(){return true;},releaseLock(){}})}
  });
  return {ctx,saved:()=>saved};
}
const payload={affiliation:'حكومي',classification:'ابتدائي',population:'100',gates:'2',usedGates:'1',coverageType:'حراس الوزارة',coverageRange:'على مدار اليوم',current:'7',required:'10',risk:'منخفضة'};

test('coverage stores the manual current count before required and calculates deficit from it',()=>{
  const b=backend();b.ctx.saveCoverage('session',payload);
  assert.equal(b.saved()[11],7);
  assert.equal(b.saved()[12],10);
  assert.equal(b.saved()[13],'لا');
  assert.equal(b.saved()[14],3);
  assert.equal(b.saved()[17],1);
  b.ctx.saveCoverage('session',{...payload,current:'12'});
  assert.equal(b.saved()[13],'نعم');assert.equal(b.saved()[14],0);
  b.ctx.saveCoverage('session',{...payload,current:'0'});
  assert.equal(b.saved()[11],0);assert.equal(b.saved()[14],10);
});

test('coverage rejects missing, negative, fractional and nonnumeric current counts',()=>{
  for(const value of [undefined,'', ' ', '-1', '1.5', 'abc']){
    const b=backend();assert.throws(()=>b.ctx.saveCoverage('session',{...payload,current:value}));
    assert.equal(b.saved(),undefined);
  }
});

test('coverage UI renders an editable current number before required and updates calculations',()=>{
  const html=fs.readFileSync('Index.html','utf8');
  const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
  const elements={};const el=id=>elements[id]??={value:'',innerHTML:'',addEventListener(){}};
  const ctx=vm.createContext({window:{},document:{getElementById:el}});
  vm.runInContext(code,ctx);
  vm.runInContext(`data={guards:{ministry:[],company:[]},coverage:[],options:{affiliation:[],classification:[],coverageType:[],coverageRange:[],risk:[]}};renderCoverage();`,ctx);
  const content=el('content').innerHTML;
  assert.match(content, /id="current" type="number"/);
  assert.ok(content.indexOf('id="current"')<content.indexOf('id="required"'));
  assert.ok(!content.includes('id="calCurrent"'));
  el('current').value='4';el('required').value='9';ctx.updateCoverageCalculations();
  assert.equal(el('calDeficit').value,5);
  el('current').value='12';ctx.updateCoverageCalculations();
  assert.equal(el('calSurplus').value,'نعم');assert.equal(el('calDeficit').value,0);
  el('current').value='';ctx.updateCoverageCalculations();assert.equal(el('calDeficit').value,'');
});
