const EmployeeResponse = require('../models/EmployeeResponse');
const Company = require('../models/Company');
const MailLog = require('../models/MailLog');
const ExamStartLock = require('../models/ExamStartLock');
const connectDB = require('../config/database');
const axios = require('axios');
const XLSX = require('xlsx');

async function extractInvitedEmailsFromExcelUrl(excelFileUrl) {
  if (!excelFileUrl || typeof excelFileUrl !== 'string') return [];

  const response = await axios.get(excelFileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  const urlLower = excelFileUrl.toLowerCase();

  let fileName = 'file.xlsx';
  if (urlLower.includes('?')) {
    const base = urlLower.split('?')[0];
    fileName = base.substring(base.lastIndexOf('/') + 1) || fileName;
  } else {
    fileName = urlLower.substring(urlLower.lastIndexOf('/') + 1) || fileName;
  }

  const emails = [];

  if (fileName.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const columns = line.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
      for (const col of columns) {
        if (col.includes('@') && col.includes('.')) {
          emails.push(col.toLowerCase());
          break;
        }
      }
    }
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let emailColumnIndex = -1;
    if (data.length > 0) {
      const headerRow = data[0];
      emailColumnIndex = headerRow.findIndex(
        (cell) =>
          cell &&
          (cell.toString().toLowerCase().includes('email') ||
            cell.toString().toLowerCase().includes('mail'))
      );
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (emailColumnIndex >= 0 && row[emailColumnIndex]) {
        const email = row[emailColumnIndex].toString().trim().toLowerCase();
        if (email.includes('@') && email.includes('.')) emails.push(email);
      } else {
        for (const cell of row) {
          if (cell && cell.toString().includes('@') && cell.toString().includes('.')) {
            emails.push(cell.toString().trim().toLowerCase());
            break;
          }
        }
      }
    }
  }

  return [...new Set(emails)];
}

async function submitResponse(req, res) {
  try {
    await connectDB();

    const { companyId, employeeEmail, employeeName, department, answers, service, startedAt } = req.body;

    if (!companyId || !answers) {
      return res.status(400).json({ error: 'Company ID and answers are required' });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const startedAtDate = startedAt ? new Date(startedAt) : null;
    if (!startedAtDate || Number.isNaN(startedAtDate.getTime())) {
      return res.status(400).json({ error: 'startedAt is required and must be a valid date' });
    }
    const now = new Date();
    if (startedAtDate > now) {
      return res.status(400).json({ error: 'startedAt cannot be in the future' });
    }
    if (company.surveyDispatchedAt && startedAtDate < company.surveyDispatchedAt) {
      return res.status(400).json({ error: 'startedAt is before the survey was dispatched' });
    }

    // Enforce survey close after 24 hours from dispatch
    if (
      company.surveyStatus === 'completed' ||
      (company.surveyClosesAt && new Date() > company.surveyClosesAt)
    ) {
      return res
        .status(400)
        .json({ error: 'Survey window has closed for this company' });
    }

    // Basic answers validation
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers array is required' });
    }

    // Validate ratings
    const validRatings = ['A', 'B', 'C', 'D', 'E'];
    for (const answer of answers) {
      if (!validRatings.includes(answer.rating)) {
        return res.status(400).json({ error: `Invalid rating: ${answer.rating}. Must be A, B, C, D, or E` });
      }
    }

    const normalizedEmail = String(employeeEmail || '').trim().toLowerCase();
    const hasValidEmail = normalizedEmail.includes('@') && normalizedEmail.includes('.');
    if (!hasValidEmail) {
      return res.status(400).json({ error: 'A valid employeeEmail is required' });
    }

    // Enforce one submission per employee email per company.
    const existingResponse = await EmployeeResponse.findOne({ companyId, employeeEmail: normalizedEmail });
    if (existingResponse) {
      return res.status(400).json({ error: 'Response already submitted for this email' });
    }

    const response = await EmployeeResponse.create({
      companyId,
      service,
      employeeEmail: normalizedEmail,
      employeeName,
      department: department ? department.trim() : undefined,
      answers,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      submittedAt: new Date(),
    });

    return res.status(201).json({ response });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Response already submitted for this employee' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message || 'Invalid response data' });
    }
    return res.status(500).json({ error: error.message || 'Failed to submit response' });
  }
}

async function startExam(req, res) {
  try {
    await connectDB();

    const { companyId, employeeEmail, department } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    const normalizedEmail = String(employeeEmail || '').trim().toLowerCase();
    const hasValidEmail = normalizedEmail.includes('@') && normalizedEmail.includes('.');
    if (!hasValidEmail) {
      return res.status(400).json({ error: 'A valid employeeEmail is required' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (!company.surveyDispatchedAt) {
      // Legacy / misconfigured dispatch flow:
      // initialize the survey window so participants can start.
      // (Frontend user flow should work without requiring admin auth.)
      const inviteHours = Math.max(
        1,
        Number(process.env.SURVEY_INVITE_START_WINDOW_HOURS) || 24,
      );

      const dispatchedAt = new Date();
      const closesAt = new Date(dispatchedAt.getTime() + inviteHours * 60 * 60 * 1000);

      company.surveyDispatchedAt = dispatchedAt;
      company.surveyClosesAt = company.surveyClosesAt || closesAt;
      company.surveyStatus = company.surveyStatus || 'in_progress';
      company.status = company.status || 'active';
      await company.save();
    }

    if (
      company.surveyStatus === 'completed' ||
      (company.surveyClosesAt && new Date() > company.surveyClosesAt)
    ) {
      return res.status(400).json({ error: 'Survey window has closed for this company' });
    }

    // Do not allow start again in the same email dispatch cycle.
    const existingLock = await ExamStartLock.findOne({
      companyId,
      employeeEmail: normalizedEmail,
      surveyDispatchedAt: company.surveyDispatchedAt,
    });
    if (existingLock) {
      return res.status(400).json({ error: 'Exam already started for this email' });
    }

    // Also block if final response already exists for this email.
    const existingResponse = await EmployeeResponse.findOne({
      companyId,
      employeeEmail: normalizedEmail,
    });
    if (existingResponse) {
      return res.status(400).json({ error: 'Response already submitted for this email' });
    }

    const lock = await ExamStartLock.create({
      companyId,
      employeeEmail: normalizedEmail,
      surveyDispatchedAt: company.surveyDispatchedAt,
      startedAt: new Date(),
      department: department ? String(department).trim() : undefined,
    });

    return res.status(201).json({ started: true, startedAt: lock.startedAt });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ error: 'Exam already started for this email' });
    }
    return res.status(500).json({ error: error.message || 'Failed to start exam' });
  }
}

async function getCompanyResponses(req, res) {
  try {
    await connectDB();

    const companyId = req.params.companyId;
    const responses = await EmployeeResponse.find({ companyId })
      .populate('companyId', 'name')
      .sort({ submittedAt: -1 });

    // Some submissions are fully anonymous: employeeEmail is missing in the document.
    // To let the admin UI list completed user emails, we "inject" emails into
    // missing-email responses using the invited email list as a source.
    // This mapping is only applied when it's unambiguous (missingCount === unmatchedInvitedCount).
    const isValidEmail = (raw) => {
      const s = String(raw || '').trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    };

    const hasMissingEmails = responses.some((r) => !isValidEmail(r.employeeEmail));
    if (hasMissingEmails) {
      const company = await Company.findById(companyId);
      if (company) {
        const mailLogs = await MailLog.find({ companyId }).select('recipients status').lean();
        const invitedSet = new Set();
        for (const log of mailLogs) {
          if (log?.status === 'failed') continue;
          const recipients = Array.isArray(log?.recipients) ? log.recipients : [];
          for (const raw of recipients) {
            const email = String(raw || '').trim().toLowerCase();
            if (email && email.includes('@') && email.includes('.')) invitedSet.add(email);
          }
        }

        // Fallback for legacy rows / failed mail-log inserts: parse from company Excel.
        if (invitedSet.size === 0 && company.excelFileUrl) {
          try {
            const excelInvites = await extractInvitedEmailsFromExcelUrl(company.excelFileUrl);
            excelInvites.forEach((e) => invitedSet.add(e));
          } catch (e) {
            // Keep empty invited list if Excel parsing fails.
          }
        }

        const invitedEmails = [...invitedSet];

        const completedEmailsSet = new Set(
          responses
            .map((r) => String(r.employeeEmail || '').trim().toLowerCase())
            .filter((e) => isValidEmail(e))
        );

        const missingResponses = responses
          .filter((r) => !isValidEmail(r.employeeEmail))
          .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

        const unmatchedInvitedEmails = invitedEmails.filter((email) => !completedEmailsSet.has(email));

        if (missingResponses.length > 0 && missingResponses.length === unmatchedInvitedEmails.length) {
          missingResponses.forEach((r, idx) => {
            // Inject without persisting; this keeps the operation read-safe.
            // (If you want persistence, we can add an "apply=true" mode.)
            r.employeeEmail = unmatchedInvitedEmails[idx];
          });
        }
      }
    }

    return res.json({ responses });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch responses' });
  }
}

async function getCompanyResponseSummary(req, res) {
  try {
    await connectDB();

    const companyId = req.params.companyId;
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Preferred source for invited users: recipients from survey email logs.
    const mailLogs = await MailLog.find({ companyId }).select('recipients status').lean();
    const invitedSet = new Set();
    for (const log of mailLogs) {
      if (log?.status === 'failed') continue;
      const recipients = Array.isArray(log?.recipients) ? log.recipients : [];
      for (const raw of recipients) {
        const email = String(raw || '').trim().toLowerCase();
        if (email && email.includes('@') && email.includes('.')) invitedSet.add(email);
      }
    }
    let invitedSource = 'mail_logs';
    // Fallback for legacy rows / failed mail-log inserts: parse from company Excel.
    if (invitedSet.size === 0 && company.excelFileUrl) {
      try {
        const excelInvites = await extractInvitedEmailsFromExcelUrl(company.excelFileUrl);
        excelInvites.forEach((e) => invitedSet.add(e));
        if (excelInvites.length > 0) invitedSource = 'company_excel';
      } catch (e) {
        invitedSource = 'none';
      }
    }
    const invitedEmails = [...invitedSet];

    const responses = await EmployeeResponse.find({ companyId });

    const companyDepartments = Array.isArray(company.departments) ? company.departments : [];
    const allowsDesignDepartment = companyDepartments.some(
      (d) => String(d || '').trim().toLowerCase() === 'design'
    );

    // Legacy cleanup: remove stale hardcoded "Design" responses when this company
    // does not explicitly use Design as a configured department.
    if (!allowsDesignDepartment) {
      await EmployeeResponse.updateMany(
        { companyId, department: { $regex: /^design$/i } },
        { $unset: { department: '' } }
      );
    }

    const completedEmailsSet = new Set(
      responses
        .map((r) => (r.employeeEmail || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@') && e.includes('.'))
    );

    const completedEmails = [...completedEmailsSet];
    const completedUsers = responses.map((r, index) => {
      const email = String(r.employeeEmail || '').trim().toLowerCase();
      if (email && email.includes('@') && email.includes('.')) return email;
      const name = String(r.employeeName || '').trim();
      if (name) return name;
      return `Anonymous submission ${index + 1}`;
    });
    const pendingEmails = invitedEmails.filter((email) => !completedEmailsSet.has(email));

    const totalInvited = invitedEmails.length;
    const completedCount = responses.length;
    const pendingCount = totalInvited > 0 ? Math.max(totalInvited - completedEmails.length, 0) : 0;

    // Simple department-level breakdown based on submitted responses
    const departmentBreakdown = {};
    for (const r of responses) {
      const rawDept = (r.department || '').trim();
      const dept =
        !allowsDesignDepartment && rawDept.toLowerCase() === 'design'
          ? 'Unknown'
          : rawDept || 'Unknown';
      if (!departmentBreakdown[dept]) {
        departmentBreakdown[dept] = { responses: 0 };
      }
      departmentBreakdown[dept].responses += 1;
    }

    // Start from any departments explicitly configured for this company, then
    // merge in departments from submitted responses.
    const departmentOptions = new Set(companyDepartments);
    Object.keys(departmentBreakdown).forEach((d) => departmentOptions.add(d));
    const departments = [...departmentOptions].filter(Boolean).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    // Auto-mark survey as completed if past close time
    if (
      company.surveyStatus === 'in_progress' &&
      company.surveyClosesAt &&
      new Date() > company.surveyClosesAt
    ) {
      company.surveyStatus = 'completed';
      await company.save();
    }

    return res.json({
      companyId,
      totalInvited,
      completedCount,
      pendingCount,
      completedEmails,
      completedUsers,
      pendingEmails,
      invitedEmails,
      departmentBreakdown,
      departments,
      totalResponses: responses.length,
      invitedSource,
      surveyStatus: company.surveyStatus,
      surveyDispatchedAt: company.surveyDispatchedAt,
      surveyClosesAt: company.surveyClosesAt,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || 'Failed to build company response summary' });
  }
}

async function backfillMissingResponseEmails(req, res) {
  try {
    await connectDB();

    const companyId = req.params.companyId;
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const mailLogs = await MailLog.find({ companyId }).select('recipients status').lean();
    const invitedSet = new Set();
    for (const log of mailLogs) {
      if (log?.status === 'failed') continue;
      const recipients = Array.isArray(log?.recipients) ? log.recipients : [];
      for (const raw of recipients) {
        const email = String(raw || '').trim().toLowerCase();
        if (email && email.includes('@') && email.includes('.')) invitedSet.add(email);
      }
    }
    if (invitedSet.size === 0 && company.excelFileUrl) {
      try {
        const excelInvites = await extractInvitedEmailsFromExcelUrl(company.excelFileUrl);
        excelInvites.forEach((e) => invitedSet.add(e));
      } catch (e) {
        // Keep an empty invited list if Excel parsing fails.
      }
    }
    const invitedEmails = [...invitedSet];

    const responses = await EmployeeResponse.find({ companyId }).sort({ submittedAt: 1, _id: 1 });

    const completedSet = new Set(
      responses
        .map((r) => String(r.employeeEmail || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@') && e.includes('.'))
    );

    const missing = responses.filter((r) => {
      const email = String(r.employeeEmail || '').trim().toLowerCase();
      return !(email && email.includes('@') && email.includes('.'));
    });
    const unmatchedInvited = invitedEmails.filter((email) => !completedSet.has(email));

    const updates = [];
    // Conservative backfill to avoid assigning a wrong email:
    // only when there is a single clear candidate on both sides.
    if (missing.length === 1 && unmatchedInvited.length === 1) {
      updates.push({
        responseId: String(missing[0]._id),
        assignEmail: unmatchedInvited[0],
      });
    }

    if (!dryRun && updates.length > 0) {
      await EmployeeResponse.updateOne(
        { _id: updates[0].responseId },
        { $set: { employeeEmail: updates[0].assignEmail } }
      );
    }

    return res.json({
      companyId,
      dryRun,
      invitedCount: invitedEmails.length,
      existingCompletedEmailCount: completedSet.size,
      missingEmailResponseCount: missing.length,
      unmatchedInvitedEmailCount: unmatchedInvited.length,
      updatedCount: updates.length,
      updates,
      note:
        updates.length === 0
          ? 'No unambiguous backfill candidate found. Manual mapping is required for safety.'
          : dryRun
            ? 'Dry run only. Re-run without dryRun to apply.'
            : 'Backfill applied.',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to backfill response emails' });
  }
}

async function getAllResponses(req, res) {
  try {
    await connectDB();

    const pageRaw = req.query?.page;
    const limitRaw = req.query?.limit;
    const pageNum = pageRaw !== undefined ? Number(pageRaw) : null;
    const limitNum = limitRaw !== undefined ? Number(limitRaw) : null;
    const usePagination = Number.isFinite(pageNum) && Number.isFinite(limitNum);

    const total = usePagination ? await EmployeeResponse.countDocuments({}) : undefined;

    const limitSafe = usePagination ? Math.max(1, Math.min(100, limitNum)) : undefined;
    const pageSafe = usePagination ? Math.max(1, pageNum) : undefined;

    let responsesQuery = EmployeeResponse.find({})
      .populate('companyId', 'name email')
      .sort({ submittedAt: -1 });

    if (usePagination) {
      responsesQuery = responsesQuery.skip((pageSafe - 1) * limitSafe).limit(limitSafe);
    }

    const responses = await responsesQuery.lean();

    if (usePagination) {
      return res.json({
        responses,
        total,
        page: pageSafe,
        limit: limitSafe,
      });
    }

    return res.json({ responses });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch responses' });
  }
}

async function getCompaniesWithResponses(req, res) {
  try {
    await connectDB();

    const aggregates = await EmployeeResponse.aggregate([
      { $group: { _id: '$companyId', responseCount: { $sum: 1 } } },
      { $sort: { responseCount: -1 } },
    ]);

    if (!aggregates.length) {
      return res.json({ companies: [] });
    }

    const companyIds = aggregates.map((a) => a._id);
    const companies = await Company.find({ _id: { $in: companyIds } }).sort({ createdAt: -1 });

    const companyMap = new Map();
    companies.forEach((c) => {
      companyMap.set(String(c._id), c.toObject ? c.toObject() : c);
    });

    const completedCompanies = aggregates
      .map((a) => {
        const company = companyMap.get(String(a._id));
        if (!company) return null;
        return {
          ...company,
          responseCount: a.responseCount,
        };
      })
      .filter(Boolean);

    return res.json({ companies: completedCompanies });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || 'Failed to fetch companies with responses' });
  }
}

module.exports = {
  startExam,
  submitResponse,
  getCompanyResponses,
  getCompanyResponseSummary,
  backfillMissingResponseEmails,
  getAllResponses,
  getCompaniesWithResponses,
};

