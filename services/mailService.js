const nodemailer = require('nodemailer');
const RECIPIENT_EMAIL_TOKEN = '__RECIPIENT_EMAIL__';
/** Plain email for HTML attributes (e.g. form hidden fields); not URL-encoded. */
const RECIPIENT_EMAIL_ATTR_TOKEN = '__RECIPIENT_EMAIL_ATTR__';

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Email sending is not configured on the server yet.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

async function sendBulkEmail({ subject, html, recipients }) {
  const transport = getTransporter();

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error('No recipients provided');
  }

  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER;

  const results = [];

  for (const rawRecipient of recipients) {
    if (!rawRecipient || typeof rawRecipient !== 'string') continue;

    const recipient = rawRecipient.trim();
    if (!recipient) continue;
    let recipientHtml = typeof html === 'string' ? html : '';
    if (recipientHtml.includes(RECIPIENT_EMAIL_ATTR_TOKEN)) {
      recipientHtml = recipientHtml.split(RECIPIENT_EMAIL_ATTR_TOKEN).join(escapeHtmlAttr(recipient));
    }
    if (recipientHtml.includes(RECIPIENT_EMAIL_TOKEN)) {
      recipientHtml = recipientHtml.split(RECIPIENT_EMAIL_TOKEN).join(encodeURIComponent(recipient));
    }

    try {
      const info = await transport.sendMail({
        from,
        to: recipient,
        subject,
        html: recipientHtml,
      });

      results.push({
        recipient,
        status: 'sent',
        messageId: info.messageId || null,
      });
    } catch (error) {
      results.push({
        recipient,
        status: 'failed',
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  if (results.length === 0) {
    throw new Error('No valid recipients to send to');
  }

  const sent = results.filter((r) => r.status === 'sent');
  const failed = results.filter((r) => r.status === 'failed');

  if (sent.length === 0 && failed.length > 0) {
    // If every attempt failed, bubble up the first error for clearer feedback
    const firstError = failed[0];
    throw new Error(firstError.error || 'Failed to send emails');
  }

  return {
    total: results.length,
    sent: sent.length,
    failed: failed.length,
    results,
    // Keep a top-level messageId so existing callers can still log something
    messageId: sent[0]?.messageId || null,
  };
}

module.exports = {
  sendBulkEmail,
};

