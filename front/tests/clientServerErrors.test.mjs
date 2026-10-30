import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// client.js reads import.meta.env, so it is loaded through Vite (as the app does).
let server;
let client;
const realFetch = globalThis.fetch;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  client = await server.ssrLoadModule('/src/api/client.js');
});

after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

const HTML_PAGE =
  '<!DOCTYPE html><html><head><title>520: Web server is returning an unknown error</title></head>' +
  '<body><h1>Error code 520</h1><p>Cloudflare</p></body></html>';

const answer = (status, body, type) => {
  globalThis.fetch = async () =>
    new Response(body, { status, headers: { 'content-type': type } });
};

async function failure(job) {
  try {
    await job();
  } catch (e) {
    return e;
  }
  assert.fail('expected the call to be rejected');
}

const TEMP = (n) => `تعذّر الاتصال بالخادم مؤقتاً (رمز ${n}). أعد المحاولة بعد لحظات.`;
const SERVER = (n) => `حدث خطأ في الخادم (رمز ${n}). أعد المحاولة.`;

test('serverErrorMessage picks the message by status', () => {
  for (const n of [502, 503, 504, 520, 521, 522, 523, 524]) assert.equal(client.serverErrorMessage(n), TEMP(n));
  for (const n of [500, 501, 505, 525, 526, 599]) assert.equal(client.serverErrorMessage(n), SERVER(n));
  for (const n of [200, 301, 400, 404, 422, 499]) assert.equal(client.serverErrorMessage(n), null);
});

test('request(): a 520 HTML page gives the Arabic message, never the HTML', async () => {
  answer(520, HTML_PAGE, 'text/html; charset=UTF-8');
  const e = await failure(() => client.request('/api/graduates/me/ticket'));
  assert.ok(e instanceof client.ApiError);
  assert.equal(e.status, 520);
  assert.equal(e.message, TEMP(520));
  assert.ok(!e.message.includes('<') && !e.message.includes('Cloudflare'));
});

test('request(): every temporary gateway status uses the temporary message', async () => {
  for (const n of [502, 503, 504, 521, 522, 523, 524]) {
    answer(n, HTML_PAGE, 'text/html');
    const e = await failure(() => client.request('/api/settings/public'));
    assert.equal(e.message, TEMP(n));
  }
});

test('request(): any other non-JSON 5xx uses the generic server message', async () => {
  for (const n of [500, 501, 505, 525]) {
    answer(n, HTML_PAGE, 'text/html');
    const e = await failure(() => client.request('/api/settings/public'));
    assert.equal(e.message, SERVER(n));
    assert.ok(!e.message.includes('<'));
  }
});

test('request(): a plain-text body is not shown either', async () => {
  answer(502, 'Bad Gateway: upstream refused the connection', 'text/plain');
  const e = await failure(() => client.request('/api/settings/public'));
  assert.equal(e.message, TEMP(502));
});

test('request(): a non-JSON 4xx keeps the default message (the body is not used)', async () => {
  answer(404, HTML_PAGE, 'text/html');
  const e = await failure(() => client.request('/api/settings/public'));
  assert.equal(e.message, 'حدث خطأ غير متوقع.');
});

test('request(): JSON error details are unchanged', async () => {
  answer(503, JSON.stringify({ detail: 'الخدمة متوقفة للصيانة.' }), 'application/json');
  let e = await failure(() => client.request('/api/settings/public'));
  assert.equal(e.message, 'الخدمة متوقفة للصيانة.');

  answer(422, JSON.stringify({ detail: [{ loc: ['body', 'email'], msg: 'بريد غير صالح' }] }), 'application/json');
  e = await failure(() => client.request('/api/settings/public'));
  assert.equal(e.message, 'يرجى التحقق من البيانات المدخلة.');
  assert.deepEqual(e.fieldErrors, { email: 'بريد غير صالح' });

  answer(409, JSON.stringify({ detail: { message: 'رقم مستخدم من قبل' } }), 'application/json');
  e = await failure(() => client.request('/api/settings/public'));
  assert.equal(e.message, 'رقم مستخدم من قبل');
});

test('requestBlob(): a 520 HTML page gives the Arabic message, never the HTML', async () => {
  answer(520, HTML_PAGE, 'text/html');
  const e = await failure(() => client.requestBlob('/api/admin/roster/export'));
  assert.ok(e instanceof client.ApiError);
  assert.equal(e.status, 520);
  assert.equal(e.message, TEMP(520));
  assert.ok(!e.message.includes('<'));
});

test('requestBlob(): other non-JSON 5xx use the generic server message', async () => {
  for (const n of [502, 503, 504, 524]) {
    answer(n, HTML_PAGE, 'text/html');
    assert.equal((await failure(() => client.requestBlob('/api/admin/roster/export'))).message, TEMP(n));
  }
  answer(500, HTML_PAGE, 'text/html');
  assert.equal((await failure(() => client.requestBlob('/api/admin/roster/export'))).message, SERVER(500));
});

test('requestBlob(): JSON details and the default 4xx message are unchanged', async () => {
  answer(400, JSON.stringify({ detail: 'عدد النتائج كبير جداً.' }), 'application/json');
  let e = await failure(() => client.requestBlob('/api/admin/roster/export'));
  assert.equal(e.message, 'عدد النتائج كبير جداً.');

  answer(404, HTML_PAGE, 'text/html');
  e = await failure(() => client.requestBlob('/api/admin/roster/export'));
  assert.equal(e.message, 'فشل تنزيل الملف.');
});
