const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function apiContext() {
  const calls = [];
  const context = {
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(text) { return { text, setMimeType() { return this; } }; }
    },
    db_() { return { getSheetByName() { return {}; } }; },
    SHEETS: { schools: 'schools' }
  };
  for (const name of ['loginByCode', 'getData', 'saveSchool', 'saveGuards', 'saveCoverage', 'approve', 'loginSupervisor', 'getMonitoring', 'logoutSupervisor']) {
    context[name] = (...args) => { calls.push({ name, args }); return { name, args }; };
  }
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Api.gs'), 'utf8'), context);
  return { calls, context, request(body) { return JSON.parse(context.doPost({ postData: { contents: body } }).text); } };
}

test('API allows school actions and rejects admin, setup, prototype and malformed requests', () => {
  const api = apiContext();
  for (const action of ['dashboard', 'reopen', 'setup', 'migrateGuardsColumns', 'constructor', '__proto__']) {
    assert.equal(api.request(JSON.stringify({ action, args: [] })).ok, false);
  }
  for (const body of ['null', '[]', '{', '{}', JSON.stringify({ action: 'saveSchool', args: ['session', null] }), 'x'.repeat(65537)]) {
    assert.equal(api.request(body).ok, false);
  }
  assert.equal(api.calls.length, 0);
  const result = api.request(JSON.stringify({ action: 'saveSchool', args: ['session', { principal: 'Example' }] }));
  assert.equal(result.ok, true);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].args[0], 'session');
  assert.equal(api.request(JSON.stringify({ action: 'health', args: [] })).result.ready, true);
});

test('API returns business validation errors without stack traces', () => {
  const api = apiContext();
  assert.equal(api.request(JSON.stringify({ action: 'loginByCode', args: [123] })).ok, false);
  assert.equal(api.request(JSON.stringify({ action: 'approve', args: [] })).ok, false);
  api.context.approve = () => { throw Error('record locked'); };
  assert.deepEqual(api.request(JSON.stringify({ action: 'approve', args: ['session'] })), { ok: false, error: 'record locked' });
});

function clientContext(fetch) {
  const context = { window: {}, fetch, AbortController, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'web-client.js'), 'utf8'), context);
  return context.window.schoolBackend;
}

test('static transport uses a simple POST, follows redirects, and carries session in body', async () => {
  let request;
  const client = clientContext(async (url, options) => {
    request = { url, options };
    return { ok: true, text: async () => JSON.stringify({ ok: true, result: { saved: true } }) };
  });
  const result = await client.call('saveSchool', ['private-session', { principal: 'Example' }]);
  assert.equal(result.saved, true);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'follow');
  assert.ok(!request.url.includes('private-session'));
  assert.equal(JSON.parse(request.options.body).args[0], 'private-session');
});

test('static transport surfaces server errors and does not retry writes or accept HTML', async () => {
  let count = 0;
  const client = clientContext(async () => {
    count++;
    return { ok: true, text: async () => JSON.stringify({ ok: false, error: 'record locked' }) };
  });
  await assert.rejects(client.call('saveGuards', ['token', {}]), /record locked/);
  assert.equal(count, 1);
  await assert.rejects(clientContext(async () => ({ ok: true, text: async () => '<html>Sign in</html>' })).call('getData', ['token']));
});

test('interface dispatches native Google calls or the static transport and preserves supervisor authentication', async () => {
  const html = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
  const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
  const element = { addEventListener() {} };
  let opened;
  const ctx = vm.createContext({
    clearTimeout() {}, setTimeout() {},
    window: { schoolBackend: { endpoint: 'https://example.test/exec', call: async (name, args) => ({ name, args }) }, open(...args) { opened = args; } },
    document: { getElementById() { return element; } }
  });
  vm.runInContext(code, ctx);
  const response = await vm.runInContext("run('getData','session')", ctx);
  assert.equal(response.name, 'getData');
  await ctx.showDashboard();
  assert.equal(opened[0], 'https://scoolslamh.github.io/greet1/monitor.html');
  assert.equal(opened[2], 'noopener,noreferrer');
  ctx.google = ctx.window.google = { script: { run: {
    withSuccessHandler(handler) { this.handler = handler; return this; },
    withFailureHandler() { return this; },
    getData(token) { this.handler({ native: token }); }
  } } };
  assert.equal((await vm.runInContext("run('getData','session')", ctx)).native, 'session');
});

test('Pages artifact has a lowercase entrypoint and only public frontend files', () => {
  require('../scripts/build-pages.cjs');
  const files = fs.readdirSync(path.join(root, '_site')).sort();
  assert.deepEqual(files, ['.nojekyll', 'index.html', 'monitor.html', 'web-client.js']);
  const output = fs.readFileSync(path.join(root, '_site/index.html'), 'utf8');
  assert.ok(output.includes('<script src="./web-client.js" defer></script>'));
  assert.ok(!output.includes('???? ?????'));
  new vm.Script(fs.readFileSync(path.join(root, 'الرمز.js'), 'utf8'));
  new vm.Script(fs.readFileSync(path.join(root, 'Api.gs'), 'utf8'));
});
