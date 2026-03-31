const { sendBulkEmail } = require('../services/mailService');
const connectDB = require('../config/database');
const MailLog = require('../models/MailLog');
const Company = require('../models/Company');

/** How long the emailed link and Start exam button remain valid (matches `surveyClosesAt` set on dispatch). */
const SURVEY_INVITE_START_WINDOW_HOURS = Math.max(
  1,
  Number(process.env.SURVEY_INVITE_START_WINDOW_HOURS) || 24,
);

const inviteHoursLabel =
  SURVEY_INVITE_START_WINDOW_HOURS === 1 ? '1 hour' : `${SURVEY_INVITE_START_WINDOW_HOURS} hours`;

/** Once started, participant must complete the exam within this many minutes. */
const SURVEY_EXAM_DURATION_MINUTES = Math.max(
  1,
  Number(process.env.SURVEY_EXAM_DURATION_MINUTES) || 30,
);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trimBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/$/, '');
}

/**
 * Default invite: HTML form with department field + GET submit to the configured survey/question-paper URL.
 * (Some mail clients strip forms — fallback link included.)
 */
async function buildDefaultSurveyInviteHtml({ surveyLink, companyId }) {
  let surveyActionUrl = '';
  let resolvedCompanyId = typeof companyId === 'string' && companyId.trim() ? companyId.trim() : '';

  try {
    const forParse = String(surveyLink || '').replace(/__RECIPIENT_EMAIL__/g, 'recipient@example.com');
    const u = new URL(forParse);
    surveyActionUrl = u.toString();
    const qCid = u.searchParams.get('companyId');
    if (qCid) resolvedCompanyId = qCid;
  } catch {
    const base = trimBaseUrl(process.env.PUBLIC_APP_BASE_URL || '');
    if (base) {
      try {
        const withProto = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(base) ? base : `http://${base}`;
        surveyActionUrl = new URL('/survey', `${withProto}/`).toString();
      } catch {
        surveyActionUrl = '';
      }
    }
  }

  let departments = [];
  if (resolvedCompanyId) {
    try {
      const c = await Company.findById(resolvedCompanyId).select('departments').lean();
      if (c && Array.isArray(c.departments)) {
        departments = c.departments.map((d) => String(d).trim()).filter(Boolean);
      }
    } catch {
      // ignore
    }
  }

  const deptFieldId = 'ohd-dept-field';
  const deptControl = departments.length
    ? `<select name="department" required id="${deptFieldId}" style="
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #1f2937;
          background-color: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 10px;
        ">
        <option value="">Select department…</option>
        ${departments
          .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
          .join('')}
      </select>`
    : `<input
        type="text"
        name="department"
        required
        id="${deptFieldId}"
        placeholder="Enter your department"
        style="
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #1f2937;
          border: 1px solid #d1d5db;
          border-radius: 10px;
        "
      />`;

  const hiddenCompanyIdInput = resolvedCompanyId
    ? `<input type="hidden" name="companyId" value="${escapeHtml(resolvedCompanyId)}" />`
    : '';
  const hiddenEmployeeEmailInput = `<input type="hidden" name="employeeEmail" value="__RECIPIENT_EMAIL_ATTR__" />`;

  const formBlock =
    surveyActionUrl
      ? `
              <div style="margin: 0 0 8px 0;">
                <label for="${deptFieldId}" style="display: block; margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #374151;">
                  Department
                </label>
                <form action="${escapeHtml(
                  surveyActionUrl.replace(/__RECIPIENT_EMAIL__/g, '__RECIPIENT_EMAIL_ATTR__'),
                )}" method="get" target="_blank" style="margin: 0; text-align: left;">
                  ${hiddenCompanyIdInput}
                  ${hiddenEmployeeEmailInput}
                  ${deptControl}
                  <div style="text-align: center; margin: 8px 0 0 0;">
                    <button type="submit" style="
                      display: inline-block;
                      padding: 12px 32px;
                      background-color: #2563eb;
                      color: #ffffff;
                      border: none;
                      border-radius: 999px;
                      font-weight: 600;
                      font-size: 14px;
                      cursor: pointer;
                      font-family: Arial, Helvetica, sans-serif;
                    ">
                      Start exam
                    </button>
                  </div>
                </form>
              </div>`
      : `
              <div style="text-align: center; margin: 24px 0;">
                <a
                  href="${surveyLink}"
                  style="
                    display: inline-block;
                    padding: 12px 32px;
                    background-color: #2563eb;
                    color: #ffffff;
                    border-radius: 999px;
                    font-weight: 600;
                    font-size: 14px;
                    text-decoration: none;
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start exam
                </a>
              </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Makes the submit button visually and functionally inactive until the required department field is filled/selected */
    #ohd-dept-field:invalid ~ div button[type="submit"] {
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 0;">
        <div style="font-family: Arial, sans-serif; background-color: #f6f7fb; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
            <div style="background-color: #2f9e44; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; line-height: 1.3; color: #ffffff; font-weight: 700;">
                Organization Health Diagnostic
              </h1>
            </div>

            <div style="padding: 24px 32px; color: #1f2933; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 12px;">Dear Employee,</p>
              <p style="margin: 0 0 16px;">
                You have been invited to participate in the <strong>Organization Health Diagnostic</strong> survey for your organization.
                Your feedback is valuable and will help us improve our organization's health and performance.
              </p>

              <h2 style="margin: 16px 0 8px; font-size: 16px; font-weight: 700;">
                Before You Begin – Please Read Carefully
              </h2>
              <ol style="margin: 0 0 16px 18px; padding: 0; color: #374151;">
                <li style="margin-bottom: 6px;">
                  <strong>There are no right or wrong answers.</strong>
                  This is not an exam or an aptitude test. It is a perception-based diagnostic designed to understand your genuine experience.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>Your responses are completely confidential.</strong>
                  Individual answers are not visible to management, leadership, or any internal authority.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>Even ‘Harbor &amp; Wells’, the administering agency, does not have access to individual responses.</strong>
                  Only aggregated, anonymized data is used for organizational analysis.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>No individual performance evaluation is linked to this assessment.</strong>
                  Your responses will not impact your appraisal, role, or compensation as it is anonymous.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>Only incomplete submissions are flagged.</strong>
                  If a form is left incomplete, only the employee number will be shared for the purpose of requesting completion — not the answers provided.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>You must finish the exam within ${SURVEY_EXAM_DURATION_MINUTES} minutes.</strong>
                  The timer starts once your exam questions have loaded (after you click “Start exam”); submit before time runs out.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>The email link and Start button are valid for ${inviteHoursLabel}</strong>
                  from when this email was sent. Please use the form below within that window.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>There is no time restriction per question.</strong>
                  However, the entire assessment must be completed within the ${SURVEY_EXAM_DURATION_MINUTES}-minute exam window.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>On average, you will have approximately 20 seconds per question.</strong>
                  Be instinctive in your responses rather than overthinking.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>Please provide sincere and honest feedback.</strong>
                  Let your true inner feelings come out – “What do I actually feel?”
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>Respond based on your current experience — not assumptions.</strong>
                  Answer according to what you truly experience in your role and environment today.
                </li>
              </ol>

              <p style="margin: 0 0 16px;">
                When you are ready, select your <strong>department</strong> below, then click <strong>Start exam</strong>.
                Your browser will open the question paper directly. The Start button stays available for ${inviteHoursLabel} from dispatch, and after you start you have ${SURVEY_EXAM_DURATION_MINUTES} minutes to finish.
              </p>

              ${formBlock}

              <p style="margin: 16px 0 8px; font-size: 12px; color: #6b7280;">
                If the form does not work in your email app, open this link instead (you will choose department on the next page):
              </p>
              <p style="margin: 0 0 16px; font-size: 12px; color: #1d4ed8; word-break: break-all;">
                <a href="${surveyLink}" target="_blank" rel="noopener noreferrer">${surveyLink}</a>
              </p>

              <p style="margin: 0; font-size: 13px; color: #4b5563;">
                Thank you for your participation!
              </p>
            </div>
          </div>
        </div>
</body>
</html>
      `;
}

exports.sendBulk = async (req, res, next) => {
  try {
    await connectDB();

    const { subject, html, recipients, companyId, notes, surveyLink } = req.body || {};

    // Allow either explicit HTML from client or at least a survey link to build HTML
    if (!subject || (!html && !surveyLink)) {
      return res.status(400).json({ error: 'Subject and survey link are required' });
    }

    const finalHtml = html || (await buildDefaultSurveyInviteHtml({ surveyLink, companyId }));

    // Normalize and validate recipients to ensure each email is well-formed
    const normalizedRecipients = Array.isArray(recipients)
      ? [...new Set(
          recipients
            .filter((r) => typeof r === 'string')
            .map((r) => r.trim().toLowerCase())
            .filter((r) => r && r.includes('@') && r.includes('.'))
        )]
      : [];

    if (!Array.isArray(normalizedRecipients) || normalizedRecipients.length === 0) {
      return res.status(400).json({ error: 'At least one valid recipient email is required' });
    }

    const info = await sendBulkEmail({ subject, html: finalHtml, recipients: normalizedRecipients });

    // Derive an overall status for this bulk operation
    let status = 'sent';
    if (info.failed && info.failed > 0 && info.sent > 0) {
      status = 'partial';
    } else if (info.failed && info.failed > 0 && (!info.sent || info.sent === 0)) {
      status = 'failed';
    }

    const log = await MailLog.create({
      companyId: companyId || null,
      subject,
      recipients: normalizedRecipients,
      notes: notes || '',
      status,
      providerMessageId: info.messageId || null,
    });

    // If a company is associated with this bulk send, mark survey as dispatched
    if (companyId) {
      const dispatchedAt = new Date();
      const closesAt = new Date(
        dispatchedAt.getTime() + SURVEY_INVITE_START_WINDOW_HOURS * 60 * 60 * 1000,
      );
      await Company.findByIdAndUpdate(
        companyId,
        {
          surveyDispatchedAt: dispatchedAt,
          surveyClosesAt: closesAt,
          surveyStatus: 'in_progress',
          status: 'active', // show in UI that survey is running
        },
        { new: true }
      );
    }

    return res.json({
      message: 'Emails processed',
      summary: {
        total: info.total,
        sent: info.sent,
        failed: info.failed,
      },
      log,
    });
  } catch (error) {
    // If configuration is missing, we want a clear message
    if (error.message && error.message.includes('not configured on the server yet')) {
      return res.status(500).json({ error: error.message });
    }
    console.error('Failed to send bulk emails', error);
    return res.status(500).json({ error: error.message || 'Failed to send emails' });
  }
};

function buildCompanyFormUrl() {
  const base = trimBaseUrl(process.env.PUBLIC_APP_BASE_URL);
  if (!base) return '';
  try {
    const withProto = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(base) ? base : `http://${base}`;
    return new URL('/companies', `${withProto}/`).toString();
  } catch {
    return `${base}/companies`;
  }
}

/**
 * Admin shares the public company registration page link with an external contact
 * (e.g. another organization). Does not tie to a Company record or start a survey.
 */
exports.sendCompanyFormLink = async (req, res, next) => {
  try {
    await connectDB();

    const { subject, notes, recipientEmail } = req.body || {};
    const subj = typeof subject === 'string' ? subject.trim() : '';
    const noteText = typeof notes === 'string' ? notes.trim() : '';
    const toRaw = typeof recipientEmail === 'string' ? recipientEmail.trim().toLowerCase() : '';

    if (!subj) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!toRaw || !toRaw.includes('@') || !toRaw.includes('.')) {
      return res.status(400).json({ error: 'A valid recipient email is required' });
    }

    const companyFormUrl = buildCompanyFormUrl();
    if (!companyFormUrl) {
      return res.status(500).json({
        error:
          'Company form URL is not configured. Set PUBLIC_APP_BASE_URL in the server environment.',
      });
    }

    const notesBlock = noteText
      ? `<p style="margin: 0 0 16px; padding: 12px 16px; background-color: #f3f4f6; border-radius: 8px; color: #374151; font-size: 14px; line-height: 1.5;">${escapeHtml(
          noteText,
        )}</p>`
      : '';

    const html = `
        <div style="font-family: Arial, sans-serif; background-color: #f6f7fb; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
            <div style="background-color: #0d9488; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; line-height: 1.3; color: #ffffff; font-weight: 700;">
                Company registration link
              </h1>
            </div>
            <div style="padding: 24px 32px; color: #1f2933; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 12px;">Hello,</p>
              <p style="margin: 0 0 16px;">
                You have been sent a link to register your organization for the <strong>Organization Health Diagnostic</strong> program.
                Use the button below to open the company registration form.
              </p>
              ${notesBlock}
              <div style="text-align: center; margin: 24px 0;">
                <a
                  href="${companyFormUrl}"
                  style="
                    display: inline-block;
                    padding: 12px 32px;
                    background-color: #0d9488;
                    color: #ffffff;
                    border-radius: 999px;
                    font-weight: 600;
                    font-size: 14px;
                    text-decoration: none;
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open company registration
                </a>
              </div>
              <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 16px; font-size: 12px; color: #0f766e; word-break: break-all;">
                <a href="${companyFormUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(companyFormUrl)}</a>
              </p>
              <p style="margin: 0; font-size: 13px; color: #4b5563;">
                Thank you.
              </p>
            </div>
          </div>
        </div>
      `;

    const info = await sendBulkEmail({ subject: subj, html, recipients: [toRaw] });

    const status =
      info.failed && info.failed > 0 && (!info.sent || info.sent === 0) ? 'failed' : 'sent';

    const log = await MailLog.create({
      companyId: null,
      subject: subj,
      recipients: [toRaw],
      notes: noteText,
      status,
      providerMessageId: info.messageId || null,
    });

    return res.json({
      message: 'Email processed',
      summary: {
        total: info.total,
        sent: info.sent,
        failed: info.failed,
      },
      log,
    });
  } catch (error) {
    if (error.message && error.message.includes('not configured on the server yet')) {
      return res.status(500).json({ error: error.message });
    }
    console.error('Failed to send company form link email', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
};

exports.getLogs = async (req, res, next) => {
  try {
    await connectDB();
    const { companyId, status } = req.query;
    const query = {};
    if (companyId) query.companyId = companyId;
    if (status) query.status = status;

    const logs = await MailLog.find(query).sort({ createdAt: -1 }).limit(200);
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load mail logs' });
  }
};

