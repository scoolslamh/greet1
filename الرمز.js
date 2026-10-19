/** تحديث بيانات التغطية الأمنية - Google Apps Script */
const SHEETS = { schools:'المدارس', guards:'الحراس', coverage:'التغطية الأمنية', status:'المتابعة', settings:'الإعدادات' };
const SCHOOL_HEADERS=['معرف السجل','الرقم الوزاري','اسم المدرسة','المدينة/القرية','المحافظة','المرحلة','مكتب التعليم','جنس المدرسة','نوع المدرسة','اسم مدير المدرسة','جوال مدير المدرسة','العنوان','البريد الإلكتروني'];
const GUARD_HEADERS=['معرف السجل','الرقم الوزاري','اسم المدرسة','اسم مدير المدرسة','المحافظة','المدينة/القرية','جوال مدير المدرسة','عدد الحراس الرسميين','عدد حراس الشركة','آخر تحديث'];
const COVER_HEADERS=['معرف السجل','منطقة التعليم','المدينة','اسم المدرسة','تبعية المدرسة','تصنيف المدرسة','الكثافة البشرية للمدرسة','عدد البوابات الإجمالي','البوابات المستخدمة للدخول والخروج','نوع التغطية','مدى التغطية','عدد أفراد التغطية الحالي','إجمالي أفراد التغطية اللازم لمدى التغطية','هل يوجد فائض أفراد؟','العجز','خطورة المدرسة','عدد البوابين الحاليين (تطوير)','عدد الحراس (الوزارة)','آخر تحديث'];
const STATUS_HEADERS=['معرف السجل','الحالة','آخر تحديث','تاريخ الاعتماد'];
const SETTING_HEADERS=['بريد المشرف'];
const OPTIONS={affiliation:['حكومي','أهلي','أخرى'],classification:['ابتدائي','متوسط','ثانوي','طفولة مبكرة','مجمع','أخرى'],coverageType:['بوابين تطوير','حراس الوزارة','كلاهما'],coverageRange:['على مدار اليوم','جزئية ٨ ساعات'],risk:['منخفضة','متوسطة','عالية']};
function doGet(e){
  if(e&&e.parameter&&e.parameter.api==='health'){
    try{return jsonResponse_({ok:true,result:apiHealth_()});}
    catch(error){return jsonResponse_({ok:false,error:'تعذر الاتصال بقاعدة البيانات'});}
  }
  const page=HtmlService.createHtmlOutputFromFile('Index').setTitle('تحديث بيانات التغطية الأمنية لمدارس تعليم عسير').addMetaTag('viewport','width=device-width,initial-scale=1');
  if(e&&e.parameter&&e.parameter.admin==='1')page.append('<script>window.addEventListener("load",function(){showDashboard();});</script>');
  return page;
}
function db_(){
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id || !/^[A-Za-z0-9_-]{20,}$/.test(id.trim())) {
    throw new Error('خاصية SPREADSHEET_ID غير مضبوطة بصورة صحيحة في إعدادات Apps Script');
  }
  return SpreadsheetApp.openById(id.trim());
}
function sheet_(name){const s=db_().getSheetByName(name);if(!s)throw Error('الورقة غير موجودة: '+name);return s;}
function setup(){const specs=[[SHEETS.schools,SCHOOL_HEADERS],[SHEETS.guards,GUARD_HEADERS],[SHEETS.coverage,COVER_HEADERS],[SHEETS.status,STATUS_HEADERS],[SHEETS.settings,SETTING_HEADERS]];for(const [name,headers] of specs){let s=db_().getSheetByName(name)||db_().insertSheet(name);if(s.getLastRow()===0){s.getRange(1,1,1,headers.length).setValues([headers]);s.setFrozenRows(1);s.getRange(1,1,1,headers.length).setBackground('#087b69').setFontColor('#ffffff').setFontWeight('bold');}s.setRightToLeft(true);}return 'تم تجهيز الأوراق. انسخ بيانات المدارس وفق رؤوس الأعمدة المحددة.';}
function records_(name){
  const s=sheet_(name);
  if(s.getLastRow()<2)return [];
  const v=s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getDisplayValues();
  return v.map((a,i)=>({row:i+2,values:a})).filter(x=>x.values.some(Boolean));
}
function find_(name,id){return records_(name).find(x=>x.values[0]===id);}
function upsert_(name,id,values){
  const s=sheet_(name),r=find_(name,id);
  const row=r?r.row:Math.max(2,s.getLastRow()+1);
  s.getRange(row,1,1,values.length).setValues([values]);
}
function normalizeCode_(v){return String(v||'').trim().toUpperCase().replace(/[\u0660-\u0669]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\u06F0-\u06F9]/g,c=>String(c.charCodeAt(0)-1776)).replace(/\s+/g,'');}
function splitCodes_(v){return String(v||'').split(/\s*[-–—,،;؛\n]+\s*/).map(normalizeCode_).filter(Boolean);}
function schoolByCode_(code){const needle=normalizeCode_(code);if(!/^[A-Z0-9]{2,30}$/.test(needle))throw Error('الرقم الوزاري غير صالح');const found=records_(SHEETS.schools).filter(r=>splitCodes_(r.values[1]).includes(needle));if(found.length!==1)throw Error(found.length?'الرقم مرتبط بأكثر من سجل؛ تواصل مع المشرف':'لم يُعثر على الرقم الوزاري');return found[0];}
function email_(v){return String(v||'').trim().toLowerCase();}
function phone_(v){return /^(?:\+?9665|05)\d{8}$/.test(String(v||'').trim());}
function isEmail_(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_(v));}
function hash_(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,v).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function tokenKey_(token){return 'session_'+hash_(token);}
// دخول مباشر بالرقم الوزاري فقط. لا يعد الرقم الوزاري وسيلة تحقق من الهوية.
function loginByCode(code){
  const r=schoolByCode_(code);
  const id=String(r.values[0]||'').trim();
  if(!id)throw Error('معرف سجل المدرسة مفقود؛ راجع المشرف');
  const token=Utilities.getUuid()+Utilities.getUuid();
  CacheService.getScriptCache().put(tokenKey_(token),id,21600);
  return {token:token,data:load_(id)};
}
function auth_(token){const id=CacheService.getScriptCache().get(tokenKey_(String(token||'')));if(!id)throw Error('انتهت الجلسة؛ سجل الدخول مجدداً');return id;}
function guardsFromRow_(values){
  // التوافق مع التخزين القديم لحين تنفيذ الترحيل
  if(String(values[0]||'') && !isNaN(Number(values[1])) && !isNaN(Number(values[2]))){
    try{return {ministry:JSON.parse(values[3]||'[]'),company:JSON.parse(values[4]||'[]')};}
    catch(e){throw Error('تعذر قراءة بيانات الحراس القديمة: '+e.message);}
  }
  const ministry=[],company=[];
  for(let i=10;i+2<values.length;i+=3){
    const name=String(values[i]||'').trim(),mobile=String(values[i+1]||'').trim(),job=String(values[i+2]||'').trim();
    if(!name&&!mobile&&!job)continue;
    if(job==='رسمي')ministry.push({name,mobile});
    else if(job==='شركة')company.push({name,mobile});
    else throw Error('نوع وظيفة الحارس غير معروف في ورقة الحراس');
  }
  return {ministry,company};
}
function load_(id){
  const r=find_(SHEETS.schools,id);if(!r)throw Error('السجل غير موجود');
  const g=find_(SHEETS.guards,id),c=find_(SHEETS.coverage,id),st=find_(SHEETS.status,id);
  const guards=g?guardsFromRow_(g.values):{ministry:[],company:[]};
  return {school:{id,code:r.values[1],name:r.values[2],village:r.values[3],governorate:r.values[4],stage:r.values[5],office:r.values[6],gender:r.values[7],type:r.values[8],principal:r.values[9],mobile:r.values[10],address:r.values[11],email:r.values[12]},guards,coverage:c?c.values.slice(1,18):null,status:st?st.values[1]:'لم يبدأ',options:OPTIONS};
}
function getData(token){return load_(auth_(token));}
function editable_(id){const st=find_(SHEETS.status,id);if(st&&st.values[1]==='مكتمل')throw Error('السجل معتمد؛ تواصل مع المشرف لإعادة فتحه');}
function touch_(id,complete){const old=find_(SHEETS.status,id),now=new Date();upsert_(SHEETS.status,id,[id,complete?'مكتمل':'قيد الاستكمال',now,complete?now:(old?old.values[3]:'')]);}
function saveSchool(token,p){const id=auth_(token);if(!p||!isEmail_(p.email)||!phone_(p.mobile)||!String(p.principal||'').trim()||!String(p.address||'').trim())throw Error('تحقق من اسم المدير والجوال والعنوان والبريد');const lock=LockService.getScriptLock();lock.waitLock(10000);try{editable_(id);const r=find_(SHEETS.schools,id);const v=r.values.slice(0,13);v[9]=String(p.principal).trim().slice(0,150);v[10]=String(p.mobile).trim();v[11]=String(p.address).trim().slice(0,500);v[12]=email_(p.email);sheet_(SHEETS.schools).getRange(r.row,1,1,13).setValues([v]);touch_(id,false);return load_(id);}finally{lock.releaseLock();}}
function validateGuards_(arr){if(!Array.isArray(arr)||arr.length>50)throw Error('عدد الحراس غير صالح');return arr.map(g=>{const name=String(g.name||'').trim(),mobile=String(g.mobile||'').trim();if(!name||name.length>150||!phone_(mobile))throw Error('أكمل اسم كل حارس وجواله بشكل صحيح');return {name,mobile};});}
function guardsHeaders_(n){
  const h=GUARD_HEADERS.slice();
  for(let i=1;i<=n;i++)h.push('اسم الحارس '+i,'جوال الحارس '+i,'الوظيفة '+i);
  return h;
}
function guardsRow_(school,ministry,company,updated){
  const v=school.values;
  const out=[v[0],v[1],v[2],v[9],v[4],v[3],v[10],ministry.length,company.length,updated||new Date()];
  for(const g of ministry)out.push(g.name,g.mobile,'رسمي');
  for(const g of company)out.push(g.name,g.mobile,'شركة');
  return out;
}
function migrateGuardsColumns(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return migrateGuardsColumns_();}finally{lock.releaseLock();}
}
function migrateGuardsColumns_(){
  const ss=db_(),sheet=sheet_(SHEETS.guards);
  if(String(sheet.getRange(1,2).getDisplayValue())==='الرقم الوزاري')return 'ورقة الحراس محدثة بالفعل';
  if(String(sheet.getRange(1,4).getDisplayValue())!=='حراس الوزارة JSON')throw Error('هيكل ورقة الحراس غير متوقع؛ لم يتم تغيير البيانات');
  const old=records_(SHEETS.guards),schools=new Map(records_(SHEETS.schools).map(r=>[r.values[0],r]));
  const rows=[];
  for(const r of old){
    const school=schools.get(r.values[0]);if(!school)throw Error('لا يوجد سجل مدرسة للحراس: '+r.values[0]);
    const guards=guardsFromRow_(r.values);
    rows.push(guardsRow_(school,guards.ministry,guards.company,r.values[5]));
  }
  // نسخة احتياطية قبل تعديل الورقة الأصلية
  const backup=sheet.copyTo(ss);
  backup.setName('نسخة الحراس '+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'MMdd-HHmmss'));
  const max=Math.max(0,...rows.map(r=>(r.length-10)/3));
  const headers=guardsHeaders_(max),width=headers.length;
  if(sheet.getMaxColumns()<width)sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
  sheet.clearContents();
  sheet.getRange(1,1,1,width).setValues([headers]);
  if(rows.length)sheet.getRange(2,1,rows.length,width).setValues(rows.map(r=>r.concat(Array(width-r.length).fill(''))));
  sheet.getRange(1,1,1,width).setBackground('#087b69').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);sheet.setRightToLeft(true);
  sheet.getRange('G:G').setNumberFormat('@');
  for(let i=11;i<=width;i+=3)sheet.getRange(1,i+1,sheet.getMaxRows(),1).setNumberFormat('@');
  return 'تم تحويل '+rows.length+' سجلات، وإنشاء نسخة احتياطية: '+backup.getName();
}
function saveGuards(token,p){
  const id=auth_(token),ministry=validateGuards_(p.ministry),company=validateGuards_(p.company);
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    editable_(id);
    migrateGuardsColumns_();
    const school=find_(SHEETS.schools,id);if(!school)throw Error('سجل المدرسة غير موجود');
    const sh=sheet_(SHEETS.guards),old=find_(SHEETS.guards,id);
    const row=old?old.row:Math.max(2,sh.getLastRow()+1);
    const values=guardsRow_(school,ministry,company,new Date());
    const width=Math.max(sh.getLastColumn(),values.length);
    if(sh.getMaxColumns()<width)sh.insertColumnsAfter(sh.getMaxColumns(),width-sh.getMaxColumns());
    if(sh.getLastColumn()<width)sh.getRange(1,1,1,width).setValues([guardsHeaders_((width-10)/3)]);
    sh.getRange(row,1,1,width).clearContent();
    sh.getRange(row,1,1,values.length).setValues([values]);
    touch_(id,false);return load_(id);
  }finally{lock.releaseLock();}
}
function saveCoverage(token,p){const id=auth_(token),r=find_(SHEETS.schools,id),g=find_(SHEETS.guards,id);if(!g)throw Error('أدخل بيانات الحراس أولاً');const required=['affiliation','classification','population','gates','usedGates','coverageType','coverageRange','required','risk'];for(const k of required)if(p[k]===undefined||p[k]===null||String(p[k]).trim()==='')throw Error('أكمل جميع حقول التغطية');for(const [k,opt] of [['affiliation',OPTIONS.affiliation],['classification',OPTIONS.classification],['coverageType',OPTIONS.coverageType],['coverageRange',OPTIONS.coverageRange],['risk',OPTIONS.risk]])if(!opt.includes(p[k]))throw Error('قيمة اختيار غير صالحة');for(const k of ['population','gates','usedGates','required'])if(!Number.isSafeInteger(Number(p[k]))||Number(p[k])<0)throw Error('الأعداد يجب أن تكون صحيحة وغير سالبة');if(Number(p.usedGates)>Number(p.gates))throw Error('البوابات المستخدمة لا تتجاوز الإجمالي');const guards=guardsFromRow_(g.values),current=guards.ministry.length+guards.company.length,requiredCount=Number(p.required);const values=[id,'تعليم عسير',r.values[3],r.values[2],p.affiliation,p.classification,Number(p.population),Number(p.gates),Number(p.usedGates),p.coverageType,p.coverageRange,current,requiredCount,current>requiredCount?'نعم':'لا',Math.max(0,requiredCount-current),p.risk,guards.company.length,guards.ministry.length,new Date()];const lock=LockService.getScriptLock();lock.waitLock(10000);try{editable_(id);upsert_(SHEETS.coverage,id,values);touch_(id,false);return load_(id);}finally{lock.releaseLock();}}
function approve(token){const id=auth_(token),lock=LockService.getScriptLock();lock.waitLock(10000);try{editable_(id);const s=find_(SHEETS.schools,id),g=find_(SHEETS.guards,id),c=find_(SHEETS.coverage,id);if(!s||!g||!c||!s.values.slice(9,13).every(Boolean))throw Error('يجب إكمال المراحل الثلاث قبل الاعتماد');touch_(id,true);return load_(id);}finally{lock.releaseLock();}}
function supervisor_(){const user=email_(Session.getActiveUser().getEmail());if(!user)throw Error('تعذر التحقق من حساب المشرف؛ استخدم حساب Google Workspace مؤسسياً');const allowed=records_(SHEETS.settings).some(r=>email_(r.values[0])===user);if(!allowed)throw Error('لا توجد صلاحية مشرف لهذا الحساب');return user;}
function dashboard(){supervisor_();const status=new Map(records_(SHEETS.status).map(r=>[r.values[0],r.values]));const schools=records_(SHEETS.schools).map(r=>({id:r.values[0],code:r.values[1],name:r.values[2],governorate:r.values[4],status:(status.get(r.values[0])||[])[1]||'لم يبدأ'}));return {total:schools.length,complete:schools.filter(s=>s.status==='مكتمل').length,schools};}
function reopen(id){supervisor_();const lock=LockService.getScriptLock();lock.waitLock(10000);try{if(!find_(SHEETS.schools,String(id)))throw Error('السجل غير موجود');touch_(String(id),false);return dashboard();}finally{lock.releaseLock();}}


/** اختبار الاتصال؛ قراءة فقط ولا يعدل بيانات Google Sheets. */
function testSpreadsheetConnection() {
  const ss=db_();
  const sheets=ss.getSheets().map(s=>({
    name:s.getName(),rows:s.getLastRow(),columns:s.getLastColumn()
  }));
  console.log(JSON.stringify({success:true,spreadsheetName:ss.getName(),sheets},null,2));
}

/** اختبار البحث برقم وزاري ضمن سجل موحد؛ قراءة فقط. */
function testSchoolLookup() {
  const testNumber='62919';
  const needle=normalizeCode_(testNumber);
  const matches=records_(SHEETS.schools).filter(r=>
    splitCodes_(r.values[1]).includes(needle)
  );
  const result={
    searchedNumber:testNumber,
    matchesCount:matches.length,
    records:matches.map(r=>({
      recordId:r.values[0],ministryNumbers:r.values[1],schoolName:r.values[2]
    }))
  };
  console.log(JSON.stringify(result,null,2));
  if(matches.length!==1){
    throw new Error('يجب العثور على سجل واحد فقط؛ عدد السجلات: '+matches.length);
  }
  return result;
}
