const { db } = require('../db');

const EMAIL_KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value ?? ''));
}

function getEmailSettings() {
  const fromDb = {
    host: getSetting('smtp_host'),
    port: parseInt(getSetting('smtp_port') || '587', 10),
    secure: getSetting('smtp_secure') === 'true',
    user: getSetting('smtp_user'),
    pass: getSetting('smtp_pass'),
    from: getSetting('smtp_from'),
  };

  return {
    host: process.env.SMTP_HOST || fromDb.host,
    port: parseInt(process.env.SMTP_PORT || String(fromDb.port || 587), 10),
    secure: process.env.SMTP_SECURE === 'true' || fromDb.secure,
    user: process.env.SMTP_USER || fromDb.user,
    pass: process.env.SMTP_PASS || fromDb.pass,
    from: process.env.SMTP_FROM || fromDb.from || process.env.SMTP_USER || fromDb.user || 'finance@beyondreality.co.zw',
  };
}

function isEmailConfigured() {
  const s = getEmailSettings();
  return !!(s.host && s.user && s.pass);
}

function saveEmailSettings({ host, port, secure, user, pass, from }) {
  if (host !== undefined) setSetting('smtp_host', host.trim());
  if (port !== undefined) setSetting('smtp_port', String(port || 587));
  if (secure !== undefined) setSetting('smtp_secure', secure ? 'true' : 'false');
  if (user !== undefined) setSetting('smtp_user', user.trim());
  if (pass !== undefined && pass !== '' && pass !== '********') setSetting('smtp_pass', pass);
  if (from !== undefined) setSetting('smtp_from', from.trim());
}

function getEmailSettingsPublic() {
  const s = getEmailSettings();
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    user: s.user,
    from: s.from,
    hasPassword: !!s.pass,
    configured: isEmailConfigured(),
    source: process.env.SMTP_HOST ? 'environment' : 'database',
  };
}

function seedEmailDefaults() {
  if (getSetting('smtp_host')) return;
  setSetting('smtp_host', 'smtp.gmail.com');
  setSetting('smtp_port', '587');
  setSetting('smtp_secure', 'false');
  setSetting('smtp_user', 'zimhungar@gmail.com');
  setSetting('smtp_from', 'zimhungar@gmail.com');
}

module.exports = { getEmailSettings, isEmailConfigured, saveEmailSettings, getEmailSettingsPublic, seedEmailDefaults, EMAIL_KEYS };
