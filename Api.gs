/** HTTP transport for the public GitHub Pages school interface. */
const API_VERSION = 'github-pages-v1';

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function apiHealth_() {
  const ss = db_();
  const ready = Object.values(SHEETS).every(name => !!ss.getSheetByName(name));
  return { version: API_VERSION, ready: ready };
}

function doPost(e) {
  beginRequest_();
  try {
    const body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 65536) throw Error('طلب غير صالح');
    let request;
    try { request = JSON.parse(body); }
    catch (_) { throw Error('طلب غير صالح'); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('طلب غير صالح');
    // Only explicit routes; monitoring functions enforce their own separate sessions and scope.
    const routes = {
      health: { count: 0, call: apiHealth_ },
      loginSupervisor: { count: 1, call: loginSupervisor },
      getMonitoring: { count: 1, call: getMonitoring },
      logoutSupervisor: { count: 1, call: logoutSupervisor },
      loginByCode: { count: 1, call: loginByCode },
      getData: { count: 1, call: getData },
      saveSchool: { count: 2, call: saveSchool },
      saveGuards: { count: 2, call: saveGuards },
      saveCoverage: { count: 2, call: saveCoverage },
      approve: { count: 1, call: approve }
    };
    if (typeof request.action !== 'string' || !Object.prototype.hasOwnProperty.call(routes, request.action)) throw Error('العملية غير مسموحة');
    const route = routes[request.action];
    if (!Array.isArray(request.args) || request.args.length !== route.count) throw Error('طلب غير صالح');
    if (request.action === 'loginByCode') {
      if (typeof request.args[0] !== 'string' || request.args[0].length > 100) throw Error('الرقم الوزاري غير صالح');
    } else if (request.action !== 'health') {
      if (typeof request.args[0] !== 'string' || request.args[0].length > 200) throw Error('الجلسة غير صالحة');
    }
    if (route.count === 2 && (!request.args[1] || typeof request.args[1] !== 'object' || Array.isArray(request.args[1]))) throw Error('طلب غير صالح');
    return jsonResponse_({ ok: true, result: route.call.apply(null, request.args) });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error && error.message ? String(error.message) : 'تعذر تنفيذ الطلب' });
  }
}
