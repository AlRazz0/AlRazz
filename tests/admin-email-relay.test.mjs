import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../integrations/admin-email/Code.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../integrations/admin-email/appsscript.json', import.meta.url), 'utf8'));
const secret = 'a'.repeat(64);
const recipient = 'administrator@example.com';
const start = 1_800_000_000;
const prefix = 'elcapo_email_request_';
const historyKey = 'elcapo_email_attempts';

function envelope(overrides = {}) {
  const data = { v: 1, timestamp: start, requestId: '1'.repeat(64), recipient, code: '012345', ...overrides };
  data.signature = createHmac('sha256', secret).update(JSON.stringify([
    'elcapo-admin-email-v1', data.timestamp, data.requestId, data.recipient, data.code,
  ])).digest('hex');
  return data;
}

function harness(options = {}) {
  const state = {
    now: start,
    held: false,
    quota: 100,
    quotaReads: 0,
    propertyReads: 0,
    lockAttempts: 0,
    releases: 0,
    messages: [],
    ...options,
  };
  const properties = new Map(Object.entries({
    ADMIN_EMAIL: recipient,
    ADMIN_EMAIL_RELAY_SECRET: secret,
    ...options.properties,
  }));
  const scriptProperties = {
    getProperty(key) { state.propertyReads++; return properties.get(key) ?? null; },
    getProperties() { state.propertyReads++; return Object.fromEntries(properties); },
    setProperty(key, value) {
      if (state.failMarkSent && key.startsWith(prefix) && JSON.parse(value).state === 'sent') throw new Error('Simulated storage failure');
      properties.set(key, value);
      return this;
    },
    setProperties(updates, deleteOthers) {
      assert.equal(deleteOthers, false);
      assert.equal(state.held, true);
      if (state.failBeforeSend) throw new Error('Simulated storage failure');
      for (const [key, value] of Object.entries(updates)) properties.set(key, value);
      return this;
    },
    deleteProperty(key) { properties.delete(key); return this; },
  };
  const context = vm.createContext({
    Date: class extends Date { static now() { return state.now * 1000; } },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      newBlob(raw) { return { getBytes() { return [...Buffer.from(raw, 'utf8')]; } }; },
      computeHmacSha256Signature(message, key, charset) {
        assert.equal(charset, 'UTF-8');
        return [...createHmac('sha256', key).update(message).digest()].map(byte => byte > 127 ? byte - 256 : byte);
      },
    },
    PropertiesService: { getScriptProperties() { return scriptProperties; } },
    LockService: {
      getScriptLock() {
        return {
          tryLock(timeout) {
            assert.equal(timeout, 5000);
            state.lockAttempts++;
            if (state.held || state.denyLock) return false;
            state.held = true;
            if (state.advanceOnLock) state.now += state.advanceOnLock;
            return true;
          },
          releaseLock() { assert.equal(state.held, true); state.held = false; state.releases++; },
        };
      },
    },
    MailApp: {
      getRemainingDailyQuota() { state.quotaReads++; return state.quota; },
      sendEmail(message) {
        assert.equal(state.held, true, 'send must be inside the lock');
        const records = [...properties.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => JSON.parse(value));
        assert.ok(records.some(record => record.at === state.now && record.state === 'pending'), 'durable marker must precede delivery');
        assert.ok(JSON.parse(properties.get(historyKey)).includes(state.now), 'rate attempt must precede delivery');
        state.messages.push(JSON.parse(JSON.stringify(message)));
        state.onSend?.();
        if (state.failSend) throw new Error('Simulated ambiguous email failure');
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return { text, setMimeType(type) { assert.equal(type, 'application/json'); return this; } };
      },
    },
  });
  // VM executes this repository-owned Apps Script only; never user-supplied content.
  vm.runInContext(source, context, { filename: 'Code.gs', timeout: 1000 });
  return {
    state,
    properties,
    context,
    post(data = envelope()) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text); },
    raw(contents) { return JSON.parse(context.doPost({ postData: { contents } }).text); },
  };
}

test('Apps Script requests only send-mail scope; GET and authorization never send mail', () => {
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/script.send_mail']);
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  const h = harness();
  assert.deepEqual(JSON.parse(h.context.doGet().text), { sent: false });
  assert.equal(h.state.propertyReads, 0);
  assert.equal(h.state.quotaReads, 0);
  assert.equal(h.context.authorizeEmail(), undefined);
  assert.equal(h.state.quotaReads, 1);
  assert.deepEqual(h.state.messages, []);
  assert.equal(h.state.lockAttempts, 0);
});

test('authenticated code sends fixed El capo content only to the configured administrator', () => {
  const h = harness({ properties: { ADMIN_EMAIL: '  Administrator@Example.com  ' } });
  const request = envelope();
  assert.deepEqual(h.post(request), { sent: true, requestId: request.requestId });
  assert.deepEqual(h.state.messages, [{
    to: recipient,
    subject: 'El capo · Código de verificación',
    body: 'Tu código para entrar al panel de El capo es:\n\n012345\n\nEste código caduca en unos minutos y solo se puede utilizar una vez.' +
      '\nNo compartas este código. Si no solicitaste entrar, ignora este mensaje.',
    name: 'El capo',
  }]);
  assert.equal(JSON.parse(h.properties.get(prefix + request.requestId)).state, 'sent');
  assert.equal(h.state.held, false);
  assert.equal(h.state.releases, 1);
  const storedDeliveryState = [...h.properties.entries()].filter(([key]) => key.startsWith(prefix) || key === historyKey);
  assert.equal(JSON.stringify(storedDeliveryState).includes(request.code), false, 'no code is persisted');
});

test('signature must use the literal UTF-8 secret and cover all request fields', () => {
  for (const data of [
    { ...envelope(), signature: '0'.repeat(64) },
    { ...envelope(), code: '987654' },
    { ...envelope(), timestamp: start + 1 },
    { ...envelope(), requestId: '2'.repeat(64) },
    { ...envelope(), signature: createHmac('sha256', Buffer.from(secret, 'hex')).update(JSON.stringify([
      'elcapo-admin-email-v1', start, '1'.repeat(64), recipient, '012345',
    ])).digest('hex') },
  ]) {
    const h = harness();
    assert.deepEqual(h.post(data), { sent: false });
    assert.equal(h.state.messages.length, 0);
    assert.equal(h.state.lockAttempts, 0);
  }
});

test('recipient restriction and fixed context reject arbitrary recipients and mail injection', () => {
  for (const overrides of [
    { recipient: 'someone-else@example.com' },
    { recipient: 'Administrator@example.com' },
    { recipient: recipient + '\nBcc: someone-else@example.com' },
    { code: '123456\nInjected body' },
    { subject: 'Injected subject' },
    { htmlBody: '<script>arbitrary content</script>' },
    { bcc: 'someone-else@example.com' },
    { v: 2 },
  ]) {
    const h = harness();
    assert.deepEqual(h.post(envelope(overrides)), { sent: false });
    assert.equal(h.state.messages.length, 0);
  }
});

test('malformed, oversized and incomplete inputs fail closed without details', () => {
  for (const input of ['', '{', 'null', '[]', 'true', '"value"', '{}', ' '.repeat(2049), 'é'.repeat(1025)]) {
    const h = harness();
    assert.deepEqual(h.raw(input), { sent: false });
    assert.equal(h.state.messages.length, 0);
    assert.equal(h.state.lockAttempts, 0);
  }
  for (const overrides of [
    { timestamp: start + 0.5 }, { timestamp: String(start) }, { requestId: '../properties' },
    { code: 123456 }, { signature: '00' },
  ]) {
    const h = harness();
    assert.deepEqual(h.post({ ...envelope(), ...overrides }), { sent: false });
  }
  const h = harness();
  assert.deepEqual(JSON.parse(h.context.doPost(undefined).text), { sent: false });
});

test('missing or invalid configuration never sends', () => {
  for (const properties of [{ ADMIN_EMAIL: '' }, { ADMIN_EMAIL_RELAY_SECRET: '' }, { ADMIN_EMAIL_RELAY_SECRET: 'g'.repeat(64) }]) {
    const h = harness({ properties });
    assert.deepEqual(h.post(), { sent: false });
    assert.equal(h.state.messages.length, 0);
  }
});

test('timestamp accepts at most 120 seconds of drift and rechecks after lock acquisition', () => {
  for (const offset of [-121, 121]) {
    const h = harness();
    assert.deepEqual(h.post(envelope({ timestamp: start + offset })), { sent: false });
    assert.equal(h.state.messages.length, 0);
  }
  for (const offset of [-120, 120]) {
    const h = harness();
    assert.equal(h.post(envelope({ timestamp: start + offset })).sent, true);
  }
  const h = harness({ advanceOnLock: 121 });
  assert.deepEqual(h.post(), { sent: false });
  assert.equal(h.state.messages.length, 0);
  assert.equal(h.state.releases, 1);
});

test('successful exact retries return the same acknowledgement without a second email', () => {
  const h = harness();
  const request = envelope();
  assert.deepEqual(h.post(request), { sent: true, requestId: request.requestId });
  assert.deepEqual(h.post(request), { sent: true, requestId: request.requestId });
  assert.deepEqual(h.post(envelope({ code: '987654' })), { sent: false });
  assert.deepEqual(h.post(envelope({ timestamp: start + 1 })), { sent: false });
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.quotaReads, 1);
});

test('concurrent request and lock contention cannot race the durable delivery marker', () => {
  const denied = harness({ denyLock: true });
  assert.deepEqual(denied.post(), { sent: false });
  assert.equal(denied.state.messages.length, 0);
  assert.equal(denied.state.releases, 0);
  const h = harness();
  let concurrent;
  h.state.onSend = () => { concurrent = h.post(); };
  assert.equal(h.post().sent, true);
  assert.deepEqual(concurrent, { sent: false });
  assert.equal(h.state.messages.length, 1);
});

test('ambiguous send failure is durable and a retry never duplicates delivery', () => {
  const h = harness({ failSend: true });
  assert.deepEqual(h.post(), { sent: false });
  assert.equal(JSON.parse(h.properties.get(prefix + '1'.repeat(64))).state, 'pending');
  h.state.failSend = false;
  assert.deepEqual(h.post(), { sent: false });
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.held, false);
});

test('replay protection survives a new Apps Script execution using the same durable properties', () => {
  for (const failSend of [false, true]) {
    const first = harness({ failSend });
    const original = first.post();
    const nextExecution = harness({ properties: Object.fromEntries(first.properties) });
    assert.deepEqual(nextExecution.post(), original);
    assert.equal(nextExecution.state.messages.length, 0);
    assert.equal(nextExecution.state.quotaReads, 0);
  }
});

test('storage failure after delivery fails closed, and before delivery sends nothing', () => {
  const after = harness({ failMarkSent: true });
  assert.deepEqual(after.post(), { sent: false });
  after.state.failMarkSent = false;
  assert.deepEqual(after.post(), { sent: false });
  assert.equal(after.state.messages.length, 1);
  const before = harness({ failBeforeSend: true });
  assert.deepEqual(before.post(), { sent: false });
  assert.equal(before.state.messages.length, 0);
});

test('60-second cooldown rejects early sends and permits its exact boundary', () => {
  const h = harness();
  assert.equal(h.post().sent, true);
  h.state.now += 59;
  assert.deepEqual(h.post(envelope({ timestamp: h.state.now, requestId: '2'.repeat(64) })), { sent: false });
  h.state.now++;
  assert.equal(h.post(envelope({ timestamp: h.state.now, requestId: '2'.repeat(64) })).sent, true);
  assert.equal(h.state.messages.length, 2);
});

test('rolling limits allow at most five messages per 15 minutes and ninety per 24 hours', () => {
  const h = harness();
  for (let i = 0; i < 5; i++) {
    h.state.now = start + i * 60;
    assert.equal(h.post(envelope({ timestamp: h.state.now, requestId: String(i + 1).repeat(64) })).sent, true);
  }
  h.state.now = start + 300;
  assert.deepEqual(h.post(envelope({ timestamp: h.state.now, requestId: '6'.repeat(64) })), { sent: false });
  h.state.now = start + 900;
  assert.equal(h.post(envelope({ timestamp: h.state.now, requestId: '6'.repeat(64) })).sent, true);
  const daily = harness({ properties: { [historyKey]: JSON.stringify(Array.from({ length: 90 }, (_, i) => start - 900 - i * 900)) } });
  assert.deepEqual(daily.post(), { sent: false });
  assert.equal(daily.state.messages.length, 0);
  daily.state.now = start + 6000;
  assert.equal(daily.post(envelope({ timestamp: daily.state.now })).sent, true);
  assert.ok(JSON.parse(daily.properties.get(historyKey)).length <= 90);
});

test('exhausted or invalid provider quota fails closed without consuming a send attempt', () => {
  for (const quota of [0, -1, NaN]) {
    const h = harness({ quota });
    assert.deepEqual(h.post(), { sent: false });
    assert.equal(h.state.messages.length, 0);
    assert.equal(h.properties.has(prefix + '1'.repeat(64)), false);
    assert.deepEqual(JSON.parse(h.properties.get(historyKey)), []);
  }
});

test('cleanup expires replay markers after ten minutes and old daily attempts without touching configuration', () => {
  const oldId = '3'.repeat(64);
  const freshId = '4'.repeat(64);
  const h = harness({ properties: {
    [prefix + oldId]: JSON.stringify({ at: start - 600, state: 'sent', signature: '0'.repeat(64) }),
    [prefix + freshId]: JSON.stringify({ at: start - 599, state: 'pending', signature: '0'.repeat(64) }),
    [historyKey]: JSON.stringify([start - 86400]),
    UNRELATED_PROPERTY: 'preserve-me',
  } });
  assert.equal(h.post().sent, true);
  assert.equal(h.properties.has(prefix + oldId), false);
  assert.equal(h.properties.has(prefix + freshId), true);
  assert.equal(h.properties.get('UNRELATED_PROPERTY'), 'preserve-me');
  assert.equal(h.properties.get('ADMIN_EMAIL_RELAY_SECRET'), secret);
  assert.deepEqual(JSON.parse(h.properties.get(historyKey)), [start]);
});

test('malformed durable rate or replay state fails closed', () => {
  for (const properties of [
    { [historyKey]: '{' },
    { [historyKey]: '["invalid"]' },
    { [historyKey]: JSON.stringify(Array(91).fill(start - 1000)) },
    { [prefix + '3'.repeat(64)]: '{}' },
  ]) {
    const h = harness({ properties });
    assert.deepEqual(h.post(), { sent: false });
    assert.equal(h.state.messages.length, 0);
    assert.equal(h.state.held, false);
  }
});
