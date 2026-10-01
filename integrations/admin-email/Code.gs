// Deploy as the owner, with access for anyone. The HMAC authenticates the Worker.
// Set ADMIN_EMAIL and ADMIN_EMAIL_RELAY_SECRET in Script Properties, never here.
var EMAIL_RELAY_REQUEST_PREFIX = 'elcapo_email_request_';
var EMAIL_RELAY_HISTORY_KEY = 'elcapo_email_attempts';

function doGet() {
  return emailRelayResponse_({ sent: false });
}

// Run once from the editor to grant only the permission to send email.
function authorizeEmail() {
  MailApp.getRemainingDailyQuota();
}

function doPost(event) {
  var lock;
  var locked = false;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (typeof raw !== 'string' || raw.length > 2048 || Utilities.newBlob(raw).getBytes().length > 2048) {
      return emailRelayResponse_({ sent: false });
    }
    var request = JSON.parse(raw);
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).sort().join(',') !== 'code,recipient,requestId,signature,timestamp,v' ||
        request.v !== 1 || !Number.isSafeInteger(request.timestamp) || request.timestamp <= 0 ||
        typeof request.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(request.requestId) ||
        typeof request.recipient !== 'string' || request.recipient.length > 254 ||
        !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(request.recipient) ||
        typeof request.code !== 'string' || !/^\d{6}$/.test(request.code) ||
        typeof request.signature !== 'string' || !/^[a-fA-F0-9]{64}$/.test(request.signature)) {
      return emailRelayResponse_({ sent: false });
    }
    var now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - request.timestamp) > 120) return emailRelayResponse_({ sent: false });

    var properties = PropertiesService.getScriptProperties();
    var adminEmail = (properties.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
    var secret = properties.getProperty('ADMIN_EMAIL_RELAY_SECRET') || '';
    if (!/^[a-fA-F0-9]{64}$/.test(secret) || request.recipient !== adminEmail) {
      return emailRelayResponse_({ sent: false });
    }
    var message = JSON.stringify(['elcapo-admin-email-v1', request.timestamp, request.requestId, request.recipient, request.code]);
    var expected = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
    var mismatch = 0;
    for (var i = 0; i < 32; i++) {
      mismatch |= (expected[i] & 255) ^ parseInt(request.signature.slice(i * 2, i * 2 + 2), 16);
    }
    if (mismatch !== 0) return emailRelayResponse_({ sent: false });

    lock = LockService.getScriptLock();
    locked = lock.tryLock(5000);
    if (!locked) return emailRelayResponse_({ sent: false });

    // All replay, quota and rate decisions happen while holding the same lock.
    now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - request.timestamp) > 120) return emailRelayResponse_({ sent: false });
    var allProperties = properties.getProperties();
    Object.keys(allProperties).forEach(function (key) {
      if (key.indexOf(EMAIL_RELAY_REQUEST_PREFIX) !== 0) return;
      var record = JSON.parse(allProperties[key]);
      if (!record || !Number.isSafeInteger(record.at) || record.at <= 0) throw new Error('Invalid relay state');
      if (record.at <= now - 600) properties.deleteProperty(key);
    });
    var recordKey = EMAIL_RELAY_REQUEST_PREFIX + request.requestId;
    var existingValue = properties.getProperty(recordKey);
    if (existingValue) {
      var existing = JSON.parse(existingValue);
      // A request ID cannot be reused for another code, timestamp or recipient.
      if (existing.state === 'sent' && existing.signature === request.signature.toLowerCase()) {
        return emailRelayResponse_({ sent: true, requestId: request.requestId });
      }
      return emailRelayResponse_({ sent: false });
    }

    var history = JSON.parse(properties.getProperty(EMAIL_RELAY_HISTORY_KEY) || '[]');
    if (!Array.isArray(history) || history.length > 90 || !history.every(function (at) {
      return Number.isSafeInteger(at) && at > 0;
    })) throw new Error('Invalid relay state');
    history = history.filter(function (at) { return at > now - 86400; });
    properties.setProperty(EMAIL_RELAY_HISTORY_KEY, JSON.stringify(history));
    var mostRecent = history.length ? Math.max.apply(null, history) : 0;
    if ((mostRecent && now - mostRecent < 60) ||
        history.filter(function (at) { return at > now - 900; }).length >= 5 ||
        history.length >= 90 || !(MailApp.getRemainingDailyQuota() > 0)) {
      return emailRelayResponse_({ sent: false });
    }

    var record = { at: now, state: 'pending', signature: request.signature.toLowerCase() };
    history.push(now);
    var updates = {};
    updates[recordKey] = JSON.stringify(record);
    updates[EMAIL_RELAY_HISTORY_KEY] = JSON.stringify(history);
    // Persist BEFORE sending. A timeout or ambiguous MailApp error must never resend.
    properties.setProperties(updates, false);
    MailApp.sendEmail({
      to: adminEmail,
      subject: 'El capo · Código de verificación',
      body: 'Tu código para entrar al panel de El capo es:\n\n' + request.code +
        '\n\nEste código caduca en unos minutos y solo se puede utilizar una vez.' +
        '\nNo compartas este código. Si no solicitaste entrar, ignora este mensaje.',
      name: 'El capo'
    });
    record.state = 'sent';
    properties.setProperty(recordKey, JSON.stringify(record));
    return emailRelayResponse_({ sent: true, requestId: request.requestId });
  } catch (_) {
    // Neither public responses nor logs reveal codes, credentials or configuration.
    return emailRelayResponse_({ sent: false });
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (_) { /* The execution releases its lock on exit. */ }
    }
  }
}

function emailRelayResponse_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
