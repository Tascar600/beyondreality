const express = require('express');
const { db } = require('../db');
const { authRequired, rolesAllowed } = require('../auth');
const { reminderList, sendReminders, buildReminder, logNotification } = require('../lib/notify');
const { clientSummary, allClientSummaries } = require('../lib/stats');
const { sendEmail, isEmailConfigured, verifyEmailConnection, resetTransporter } = require('../lib/email');
const { saveEmailSettings, getEmailSettingsPublic } = require('../lib/settings');
const { normalizeLocation } = require('../lib/excel-config');

const router = express.Router();

router.get('/settings/email', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  res.json(getEmailSettingsPublic());
});

router.put('/settings/email', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  try {
    const { host, port, secure, user, pass, from } = req.body || {};
    saveEmailSettings({ host, port, secure, user, pass, from });
    resetTransporter();
    res.json(getEmailSettingsPublic());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/settings/email/test', authRequired, rolesAllowed('finance', 'admin'), async (req, res) => {
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

router.get('/reminders/recipients', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const location = normalizeLocation(req.query.location) || '';
  const q = String(req.query.search || '').trim().toLowerCase();
  let rows = allClientSummaries(location || 'All')
    .filter((c) => c.email && String(c.email).includes('@'))
    .map((c) => ({
      client_id: c.id,
      name: c.name,
      stand_no: c.stand_no || '—',
      email: c.email,
      location: c.location || 'Harare',
    }));
  if (q) {
    rows = rows.filter((c) =>
      c.name.toLowerCase().includes(q)
      || c.email.toLowerCase().includes(q)
      || String(c.stand_no).toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ count: rows.length, recipients: rows, emailConfigured: isEmailConfigured() });
});

router.get('/reminders', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  const days = Math.max(30, parseInt(req.query.days, 10) || 90);
  const location = req.query.location || '';
  const list = reminderList(days, location);
  res.json({ days, location: location || 'All', count: list.length, reminders: list, emailConfigured: isEmailConfigured() });
});

router.post('/reminders/send', authRequired, rolesAllowed('finance', 'admin'), async (req, res) => {
  try {
    const { client_ids, channel = 'email', days = 90, location = '' } = req.body || {};
    if (!client_ids?.length) {
      return res.status(400).json({ error: 'Select at least one client to send email to.' });
    }
    const result = await sendReminders({ clientIds: client_ids, channel, days, location });
    const parts = [`${result.sent} email(s) delivered`];
    if (result.skipped) parts.push(`${result.skipped} skipped (no email on file)`);
    if (result.errors.length) parts.push(`${result.errors.length} failed`);
    res.json({ ...result, note: parts.join('. ') + '.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/reminders/send-one', authRequired, rolesAllowed('finance', 'admin'), async (req, res) => {
  try {
    const { client_id, channel = 'email', message } = req.body || {};
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(client_id));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const summary = clientSummary(client);
    const reminder = buildReminder(summary);
    const text = message || reminder.message;

    if (channel === 'email') {
      if (!client.email) return res.status(400).json({ error: 'Client has no email on file. Add email in client record.' });
      if (!isEmailConfigured()) {
        return res.status(400).json({ error: 'Email is not configured. Go to Reports → Email Setup and save your Gmail App Password first.' });
      }
      const lastPaid = client.last_date_paid
        ? new Date(client.last_date_paid + 'T00:00:00').toLocaleDateString('en-GB')
        : 'Not recorded';
      await sendEmail({
        to: client.email,
        subject: `Beyond Reality — Payment Reminder (Stand ${client.stand_no || '—'})`,
        text,
        meta: {
          name: client.name,
          standNo: client.stand_no,
          location: client.location,
          category: client.category,
          balanceBroughtDown: client.balance_brought_down,
          totalPaid: summary.totalPaid,
          lastPaid,
          period: reminder.period,
          text,
        },
      });
    }

    logNotification(client.id, 'payment_reminder', channel, text);
    res.json({ ok: true, client_id: client.id, sentTo: client.email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/notifications', authRequired, rolesAllowed('finance', 'admin'), (req, res) => {
  res.json(db.prepare(`
    SELECT n.*, c.name AS client_name, c.stand_no FROM notifications n
    LEFT JOIN clients c ON c.id = n.client_id ORDER BY n.created_at DESC LIMIT 200
  `).all());
});

module.exports = router;
