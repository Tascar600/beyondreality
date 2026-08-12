const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { db, UPLOAD_DIR } = require('./db');
const { authRequired, rolesAllowed, verifyPassword, signToken, seedUsers, findClientByLogin } = require('./auth');
const { LOCATIONS } = require('./lib/excel-config');
const { registerReportRoutes } = require('./lib/report-routes');
const { saveEmailSettings, getEmailSettingsPublic, seedEmailDefaults } = require('./lib/settings');
const { sendEmail, verifyEmailConnection, resetTransporter, isEmailConfigured } = require('./lib/email');

const API_VERSION = '2026-08-12-email-v2';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${req.params.id}-${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|png|jpe?g|webp|xlsx?|docx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only pdf, images and office documents allowed'), ok);
  },
});

app.get('/api/health', (req, res) => {
  const clients = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const byLocation = db.prepare('SELECT location, COUNT(*) AS c FROM clients GROUP BY location ORDER BY location').all();
  res.json({
    ok: true,
    version: API_VERSION,
    emailRoutes: true,
    emailConfigured: isEmailConfigured(),
    clients,
    locations: LOCATIONS,
    byLocation,
    exports: '/api/reports/ledger/download',
  });
});

registerReportRoutes(app);

app.get('/api/locations', (req, res) => {
  const counts = db.prepare('SELECT location, COUNT(*) AS stands FROM clients GROUP BY location ORDER BY location').all();
  res.json({ locations: LOCATIONS, counts });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role, client_id: user.client_id } });
});

app.post('/api/auth/client-login', (req, res) => {
  try {
    const { first_name, username, surname, stand_no, stand, password, location } = req.body || {};
    const loginName = first_name ?? username ?? surname;
    const standNum = password ?? stand_no ?? stand;
    let client;
    try {
      client = findClientByLogin(loginName, standNum, location);
    } catch (err) {
      if (err.code === 'MULTIPLE_MATCH') {
        return res.status(409).json({ error: err.message, locations: err.locations, needLocation: true });
      }
      throw err;
    }
    if (!client) {
      return res.status(401).json({
        error: 'No account found. Use your first name or surname and your stand number (e.g. Abigail + 1429 or ZHANJE + 1429).',
      });
    }
    const tokenUser = {
      id: client.id,
      role: 'client',
      client_id: client.id,
      name: client.name,
      location: client.location,
    };
    res.json({
      token: signToken(tokenUser),
      user: {
        id: client.id,
        name: client.name,
        role: 'client',
        client_id: client.id,
        location: client.location,
        stand_no: client.stand_no,
      },
    });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const base = { id: req.user.id, name: req.user.name, role: req.user.role, client_id: req.user.client_id };
  if (req.user.role === 'client' && req.user.client_id) {
    const c = db.prepare('SELECT location, stand_no FROM clients WHERE id = ?').get(req.user.client_id);
    if (c) return res.json({ ...base, location: c.location, stand_no: c.stand_no });
  }
  res.json(base);
});

app.use('/api', require('./routes/clients'));
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/notify'));
app.use('/api', require('./routes/import'));
app.use('/api', require('./routes/payments'));

app.get('/api/settings/email', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  res.json(getEmailSettingsPublic());
});

app.put('/api/settings/email', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const { host, port, secure, user, pass, from } = req.body || {};
    saveEmailSettings({ host, port, secure, user, pass, from });
    resetTransporter();
    res.json(getEmailSettingsPublic());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/settings/email/test', authRequired, rolesAllowed('finance', 'admin'), async (req, res) => {
  try {
    const { to } = req.body || {};
    await verifyEmailConnection();
    const settings = getEmailSettingsPublic();
    const testTo = (to || settings.user || '').trim();
    if (!testTo) return res.status(400).json({ error: 'Enter a test email address.' });
    await sendEmail({
      to: testTo,
      subject: 'Beyond Reality — Test Email',
      text: 'This is a test email from the Beyond Reality Housing Portal. If you received this, reminder emails are working correctly.',
    });
    res.json({ ok: true, sentTo: testTo, message: `Test email sent to ${testTo}. Check your inbox (and spam folder).` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/clients/:id/uploads', authRequired, rolesAllowed('finance', 'admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const known = ['Offer Letter', 'Receipt', 'Application Form', 'Statement', 'Affidavit', 'Other'];
  const raw = String(req.body.kind || '').trim();
  const kind = known.includes(raw) ? raw : (raw.slice(0, 80) || 'Other');
  const info = db.prepare('INSERT INTO uploads (client_id, kind, filename, original_name) VALUES (?,?,?,?)')
    .run(Number(req.params.id), kind, req.file.filename, req.file.originalname);
  res.status(201).json({ id: Number(info.lastInsertRowid), kind, filename: req.file.filename, original_name: req.file.originalname });
});

app.delete('/api/uploads/:id', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const u = db.prepare('SELECT id, filename FROM uploads WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Upload not found' });
  db.prepare('DELETE FROM uploads WHERE id = ?').run(u.id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, u.filename)); } catch {}
  res.json({ ok: true });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}. Restart START.bat if you recently updated.` });
});

if (isProd) {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(400).json({ error: err.message || 'Server error' });
});

seedUsers();
seedEmailDefaults();

const PORT = process.env.PORT || 4040;
app.listen(PORT, () => {
  console.log(`Beyond Reality Housing Portal API on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  console.log(`[api] version ${API_VERSION} — email routes: GET/PUT /api/settings/email, POST /api/settings/email/test`);
  if (isEmailConfigured()) {
    console.log('[email] SMTP configured — reminder emails will be sent live');
  } else {
    console.log('[email] SMTP not configured — save Gmail App Password in Reports → Email Setup');
  }
});
