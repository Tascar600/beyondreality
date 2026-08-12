const { db } = require('../db');
const { allClientSummaries, needsReminder } = require('./stats');
const { normalizeLocation } = require('./excel-config');
const { sendEmail, isEmailConfigured } = require('./email');

function buildReminder(client) {
  const last = client.payments?.length ? client.payments[client.payments.length - 1] : null;
  const period = last ? last.month_label : 'recent period';
  const lastPaid = client.lastDate ? new Date(client.lastDate + 'T00:00:00').toLocaleDateString('en-GB') : 'not recorded';
  return {
    client_id: client.id,
    name: client.name,
    stand_no: client.stand_no || '—',
    location: client.location || 'Harare',
    category: client.category || 'General',
    email: client.email || '',
    contact: client.contact || '',
    balance_brought_down: client.balance_brought_down,
    total_paid: client.totalPaid,
    last_date_paid: client.lastDate,
    period,
    message: `BEYOND REALITY: Dear ${client.name}, friendly payment reminder for stand ${client.stand_no || '—'} (${client.location || 'Harare'}), category ${client.category || 'General'}. Balance brought down $${Number(client.balance_brought_down || 0).toFixed(2)}. Total paid $${Number(client.totalPaid || 0).toFixed(2)}. Last payment: ${lastPaid}. Period: ${period}. Please contact finance to make your instalment.`,
  };
}

function reminderList(days = 90, location = '') {
  const loc = normalizeLocation(location);
  return allClientSummaries(loc || 'All')
    .filter((s) => needsReminder(s, days))
    .map(buildReminder);
}

function logNotification(clientId, type, channel, message) {
  db.prepare('INSERT INTO notifications (client_id, type, channel, message) VALUES (?,?,?,?)')
    .run(clientId, type, channel, message);
}

async function sendReminders({ clientIds, channel = 'email', days = 90, location = '' }) {
  if (channel === 'email' && !isEmailConfigured()) {
    throw new Error('Email is not configured. Go to Reports → Email Setup and save your SMTP settings first.');
  }

  const loc = normalizeLocation(location);
  const summaries = allClientSummaries(loc || 'All');
  const targets = clientIds?.length
    ? summaries.filter((s) => clientIds.includes(s.id)).map(buildReminder)
    : reminderList(days, location);

  const results = { sent: 0, skipped: 0, errors: [] };

  for (const r of targets) {
    if (channel === 'email') {
      if (!r.email) {
        results.skipped++;
        continue;
      }
      try {
        await sendEmail({
          to: r.email,
          subject: `Beyond Reality — Payment Reminder (Stand ${r.stand_no})`,
          text: r.message,
          meta: {
            name: r.name,
            standNo: r.stand_no,
            location: r.location,
            category: r.category,
            balanceBroughtDown: r.balance_brought_down,
            totalPaid: r.total_paid,
            lastPaid: r.last_date_paid ? new Date(r.last_date_paid + 'T00:00:00').toLocaleDateString('en-GB') : 'Not recorded',
            period: r.period,
            text: r.message,
          },
        });
        logNotification(r.client_id, 'payment_reminder', 'email', r.message);
        results.sent++;
      } catch (err) {
        results.errors.push({ client_id: r.client_id, name: r.name, error: err.message });
      }
    } else {
      logNotification(r.client_id, 'payment_reminder', 'sms', r.message);
      results.sent++;
    }
  }

  return results;
}

module.exports = { buildReminder, reminderList, logNotification, sendReminders };
