/* Contract tests for the local food-recognition Worker; no provider request is sent. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (condition, name) => {
  if (condition) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
};

(async () => {
  const source = fs.readFileSync(path.join(root, 'server', 'worker.js'), 'utf8');
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const endpoint = 'https://worker.example/recognize';
  const env = { ACCESS_TOKEN: 'client-token', PROVIDER: 'custom', OPENAI_BASE: 'https://provider.example/v1/chat/completions', CUSTOM_KEY: 'upstream-key' };
  const image = 'A'.repeat(300);
  let calls = [];
  const originalFetch = global.fetch;
  try {
    const preflight = await worker.fetch(new Request(endpoint, { method: 'OPTIONS' }), env);
    check(preflight.status === 204 && /authorization/i.test(preflight.headers.get('Access-Control-Allow-Headers') || ''), 'CORS preflight permits Authorization');

    global.fetch = async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"米饭","grams":200,"kcal":230,"protein":4,"carb":50,"fat":1,"confidence":0.8,"uncertain":false}' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const bodyTokenOnly = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'client-token', image, model: 'unit-model' }) }), env);
    check(bodyTokenOnly.status === 401 && calls.length === 0, 'request-body token cannot authenticate or call the provider');

    const good = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer client-token' },
      body: JSON.stringify({ image, model: 'unit-model' }) }), env);
    const result = await good.json();
    check(good.status === 200 && result.ok && result.data.name === '米饭', 'Bearer request returns the client data envelope');
    check(calls.length === 1 && JSON.parse(calls[0][1].body).model === 'unit-model' && calls[0][1].headers.Authorization === 'Bearer upstream-key',
      'client model and server-only provider key use their intended sides of the proxy');
    check(!JSON.stringify(result).includes('client-token') && !JSON.stringify(result).includes('upstream-key'), 'credentials are absent from the response');

    const tooLarge = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { Authorization: 'Bearer client-token', 'Content-Length': String(9 * 1024 * 1024) }, body: '{}' }), env);
    check(tooLarge.status === 413 && calls.length === 1, 'oversized request is rejected before provider use');

    global.fetch = async () => new Response(JSON.stringify({ error: { message: 'upstream-key leaked by provider' } }), { status: 429 });
    const failed = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer client-token' },
      body: JSON.stringify({ image, model: 'unit-model' }) }), env);
    const failureText = await failed.text();
    check(failed.status === 502 && !failureText.includes('upstream-key'), 'provider error details are not returned to the app');

    const malformed = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { Authorization: 'Bearer client-token', 'Content-Type': 'application/json' }, body: '{' }), env);
    check(malformed.status === 400, 'malformed JSON is rejected');
  } finally {
    global.fetch = originalFetch;
  }
  console.log(`\n==== Worker 结果：${pass} PASS / ${fail} FAIL ====`);
  process.exitCode = fail ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
