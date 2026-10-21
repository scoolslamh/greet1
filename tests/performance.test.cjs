const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function backend(source=fs.readFileSync('الرمز.js','utf8')){
  const tables={schools:[['id','code','name'],['s1','123','School','','','','','','','Principal','0500000000','Address','principal@example.edu.sa']],guards:[['id','code','name'],['s1','123','School','','','','',0,0,'']],coverage:[['id'],['s1']],status:[['id','state'],['s1','قيد الاستكمال']]};
  const names={'المدارس':'schools','الحراس':'guards','التغطية الأمنية':'coverage','المتابعة':'status'};
  const metrics={opens:0,reads:0,writes:0};
  const sheets={};for(const [label,key] of Object.entries(names))sheets[label]={
    getLastRow:()=>tables[key].length,getLastColumn:()=>Math.max(...tables[key].map(row=>row.length)),
    getRange:(row,column,height=1,width=1)=>({
      getDisplayValues:()=>{metrics.reads++;return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(tables[key][row+i-1]?.[column+j-1]??'')));},
      setValues:values=>{metrics.writes++;values.forEach((cells,i)=>{tables[key][row+i-1]??=[];cells.forEach((cell,j)=>tables[key][row+i-1][column+j-1]=cell);});}
    })
  };
  const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'spreadsheet_12345678901234567890'})},SpreadsheetApp:{flush(){},openById:()=>{metrics.opens++;return {getSheetByName:name=>sheets[name]};}},CacheService:{getScriptCache:()=>({get:()=> 's1',put(){}})},Utilities:{getUuid:()=> 'uuid'},LockService:{getScriptLock:()=>({tryLock(){return true;},releaseLock(){}})}});
  vm.runInContext(source,ctx);ctx.hash_=value=>value;
  return {ctx,metrics,tables};
}
test('login reads each table once and opens the spreadsheet once',()=>{
  const b=backend();assert.equal(b.ctx.loginByCode('123').data.school.id,'s1');
  assert.equal(b.metrics.opens,1);assert.equal(b.metrics.reads,4);
});
test('save returns freshly written school and status values',()=>{
  const b=backend();const result=b.ctx.saveSchool('token',{principal:'Changed',mobile:'0500000001',address:'New address',email:'changed@example.edu.sa'});
  assert.equal(result.school.principal,'Changed');assert.equal(result.school.mobile,'0500000001');
  assert.equal(b.metrics.opens,1);assert.equal(b.metrics.writes,2);
  assert.ok(b.metrics.reads<=6);
});
test('new requests read external changes and mutations invalidate row indexes',()=>{
  const b=backend();b.ctx.getData('token');b.tables.schools[1][2]='Externally edited';
  assert.equal(b.ctx.getData('token').school.name,'Externally edited');
  b.ctx.upsert_('المتابعة','s1',['s1','مكتمل']);assert.equal(b.ctx.find_('المتابعة','s1').values[1],'مكتمل');
});
test('lock acquisition refreshes status before allowing a write',()=>{
  const b=backend();b.ctx.find_('المتابعة','s1');
  b.ctx.LockService.getScriptLock=()=>({tryLock(){b.tables.status[1][1]='مكتمل';return true;},releaseLock(){}});
  assert.throws(()=>b.ctx.saveSchool('token',{principal:'Changed',mobile:'0500000001',address:'Address',email:'changed@example.edu.sa'}));
  assert.equal(b.metrics.writes,0);
});
module.exports={backend};
