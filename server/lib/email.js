const nodemailer = require('nodemailer');
const { getEmailSettings, isEmailConfigured } = require('./settings');

let transporter = null;
let transporterKey = null;

function resetTransporter() {
  transporter = null;
  transporterKey = null;
}

function buildTransporter(config) {
  const key = `${config.host}|${config.port}|${config.user}|${config.pass}`;
  if (transporter && transporterKey === key) return transporter;
  transporterKey = key;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port === 587,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: 'TLSv1.2' },
  });
  return transporter;
}

function reminderHtml({ name, standNo, location, category, balanceBroughtDown, totalPaid, lastPaid, period, text }) {
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Beyond Reality Payment Reminder</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <strong style="font-size:18px;color:#2563eb">Beyond Reality Housing</strong>
    <div style="color:#666;font-size:13px">Payment Reminder</div>
  </div>
  <p>Dear <strong>${name}</strong>,</p>
  <p>This is a friendly reminder regarding your stand instalment payment.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Stand No</td><td style="padding:8px;border:1px solid #e5e7eb">${standNo || '—'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Location</td><td style="padding:8px;border:1px solid #e5e7eb">${location || 'Harare'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Category</td><td style="padding:8px;border:1px solid #e5e7eb">${category || 'General'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Balance Brought Down</td><td style="padding:8px;border:1px solid #e5e7eb">${money(balanceBroughtDown)}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Total Paid</td><td style="padding:8px;border:1px solid #e5e7eb">${money(totalPaid)}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Last Payment</td><td style="padding:8px;border:1px solid #e5e7eb">${lastPaid || 'Not recorded'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb">Period</td><td style="padding:8px;border:1px solid #e5e7eb">${period || '—'}</td></tr>
  </table>
  <p>Please contact the finance office to make your instalment payment at your earliest convenience.</p>
  <p style="color:#666;font-size:12px;margin-top:24px">${text ? text.replace(/\n/g, '<br>') : ''}</p>
  <p style="color:#999;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px">
    Beyond Reality Housing Portal · This is an automated reminder. Please do not reply to this email.
  </p>
</body>
</html>`;
}

async function verifyEmailConnection() {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Go to Reports → Email Setup and enter your SMTP details.');
  }
  const config = getEmailSettings();
  const t = buildTransporter(config);
  await t.verify();
  return { ok: true, host: config.host, user: config.user };
}

async function sendEmail({ to, subject, text, html, meta }) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
    throw new Error(`Invalid email address: ${to || '(empty)'}`);
  }
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Go to Reports → Email Setup and save your SMTP settings (Gmail, Outlook, or your company mail server).');
  }

  const config = getEmailSettings();
  const t = buildTransporter(config);
  const from = config.from;

  const bodyHtml = html || (meta ? reminderHtml({ ...meta, text }) : `<p>${String(text).replace(/\n/g, '<br>')}</p>`);

  const info = await t.sendMail({
    from: `"Beyond Reality Housing" <${from}>`,
    to: String(to).trim(),
    subject,
    text,
    html: bodyHtml,
  });

  return { messageId: info.messageId, to, accepted: info.accepted };
}

module.exports = { sendEmail, verifyEmailConnection, resetTransporter, isEmailConfigured, reminderHtml };
