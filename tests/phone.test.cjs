const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const server=vm.createContext({});vm.runInContext(fs.readFileSync('الرمز.js','utf8'),server);
const html=fs.readFileSync('Index.html','utf8'),client=vm.createContext({});
vm.runInContext(html.match(/function normalizePhone\(value\)\{[\s\S]*?function validPhone\(value\)\{[^\n]+/)[0],client);
test('client and server accept Saudi mobile numbers entered with Arabic digits, spacing and direction marks',()=>{
 for(const [input,expected] of [['0501234567','0501234567'],['٠٥٠١٢٣٤٥٦٧','0501234567'],['۰۵۰۱۲۳۴۵۶۷','0501234567'],['\u200f٠٥٠ ١٢٣ ٤٥٦٧\u200e','0501234567'],['+966 50-123-4567','+966501234567'],['00966 50 123 4567','+966501234567'],['966501234567','966501234567']]){
  assert.equal(client.validPhone(input),true,input);assert.equal(server.phone_(input),true,input);
  assert.equal(client.normalizePhone(input),expected);assert.equal(server.normalizePhone_(input),expected);
  const saved=server.validateGuards_([{name:'حارس',mobile:input}]);assert.equal(saved[0].mobile,expected);
 }
});
test('normalization does not accept wrong lengths, letters, nonmobile prefixes or embedded plus signs',()=>{
 for(const input of ['',null,'050123456','05012345678','050abc1234567','0111234567','+965501234567','05+01234567','0501234567 ext 2']){
  assert.equal(client.validPhone(input),false,String(input));assert.equal(server.phone_(input),false,String(input));
  assert.throws(()=>server.validateGuards_([{name:'حارس',mobile:input}]));
 }
});
