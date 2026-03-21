const EmployeeResponse = require('../models/EmployeeResponse');
const Company = require('../models/Company');
const connectDB = require('../config/database');
const axios = require('axios');
const XLSX = require('xlsx');

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

    // Check if employee already submitted (only when email is provided)
    if (employeeEmail) {
      const existingResponse = await EmployeeResponse.findOne({ companyId, employeeEmail: employeeEmail.trim().toLowerCase() });
      if (existingResponse) {
        return res.status(400).json({ error: 'Response already submitted for this email' });
      }
    }

    const response = await EmployeeResponse.create({
      companyId,
      service,
      employeeEmail: employeeEmail ? employeeEmail.trim().toLowerCase() : undefined,
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

async function getCompanyResponses(req, res) {
  try {
    await connectDB();

    const responses = await EmployeeResponse.find({ companyId: req.params.companyId })
      .populate('companyId', 'name')
      .sort({ submittedAt: -1 });

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

    // Load invited emails from the company's Excel file (if available)
    let invitedEmails = [];
    const departmentsFromExcel = new Set();
    if (company.excelFileUrl) {
      try {
        const response = await axios.get(company.excelFileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Try to infer a file name / extension from the URL
        const urlLower = company.excelFileUrl.toLowerCase();
        let fileName = 'file.xlsx';
        if (urlLower.includes('?')) {
          const base = urlLower.split('?')[0];
          fileName = base.substring(base.lastIndexOf('/') + 1) || fileName;
        } else {
          fileName = urlLower.substring(urlLower.lastIndexOf('/') + 1) || fileName;
        }

        if (fileName.endsWith('.csv')) {
          const text = buffer.toString('utf-8');
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              const columns = line.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
              for (const col of columns) {
                if (col.includes('@') && col.includes('.')) {
                  invitedEmails.push(col.toLowerCase());
                  break;
                }
              }
            }
          }
        } else {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          let emailColumnIndex = -1;
          let deptColumnIndex = -1;
          if (data.length > 0) {
            const headerRow = data[0];
            emailColumnIndex = headerRow.findIndex(
              (cell) =>
                cell &&
                (cell.toString().toLowerCase().includes('email') ||
                  cell.toString().toLowerCase().includes('mail'))
            );
            deptColumnIndex = headerRow.findIndex(
              (cell) =>
                cell &&
                /department|dept\.?|division|team/i.test(cell.toString())
            );
          }

          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (deptColumnIndex >= 0 && row[deptColumnIndex]) {
              const d = row[deptColumnIndex].toString().trim();
              if (d) departmentsFromExcel.add(d);
            }
            if (emailColumnIndex >= 0 && row[emailColumnIndex]) {
              const email = row[emailColumnIndex].toString().trim().toLowerCase();
              if (email.includes('@') && email.includes('.')) {
                invitedEmails.push(email);
              }
            } else {
              for (const cell of row) {
                if (cell && cell.toString().includes('@') && cell.toString().includes('.')) {
                  invitedEmails.push(cell.toString().trim().toLowerCase());
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        // If Excel parsing fails, continue with zero invited emails rather than failing the request.
        console.error('Failed to parse company Excel for summary', error.message || error);
      }
    }

    invitedEmails = [...new Set(invitedEmails)];

    const responses = await EmployeeResponse.find({ companyId });

    const completedEmailsSet = new Set(
      responses
        .map((r) => (r.employeeEmail || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@') && e.includes('.'))
    );

    const completedEmails = [...completedEmailsSet];
    const pendingEmails = invitedEmails.filter((email) => !completedEmailsSet.has(email));

    const totalInvited = invitedEmails.length;
    const completedCount = completedEmails.length || responses.length;
    const pendingCount = totalInvited > 0 ? Math.max(totalInvited - completedCount, 0) : 0;

    // Simple department-level breakdown based on submitted responses
    const departmentBreakdown = {};
    for (const r of responses) {
      const dept = (r.department || 'Unknown').trim() || 'Unknown';
      if (!departmentBreakdown[dept]) {
        departmentBreakdown[dept] = { responses: 0 };
      }
      departmentBreakdown[dept].responses += 1;
    }

    // Start from any departments explicitly configured for this company, then
    // merge in departments inferred from the Excel file and from submitted responses.
    const departmentOptions = new Set(Array.isArray(company.departments) ? company.departments : []);
    for (const d of departmentsFromExcel) departmentOptions.add(d);
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
      pendingEmails,
      invitedEmails,
      departmentBreakdown,
      departments,
      totalResponses: responses.length,
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
  submitResponse,
  getCompanyResponses,
  getCompanyResponseSummary,
  getCompaniesWithResponses,
};

