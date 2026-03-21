const Company = require('../models/Company');
const EmployeeResponse = require('../models/EmployeeResponse');
const connectDB = require('../config/database');
const cloudinary = require('../config/cloudinary');
const axios = require('axios');
const XLSX = require('xlsx');

const SURVEY_START_ACTIVE_MINUTES = Math.max(
  0,
  Number(process.env.SURVEY_START_ACTIVE_MINUTES) || 60,
);

function parseDepartments(rawDepartments) {
  if (rawDepartments === undefined) return undefined;

  if (Array.isArray(rawDepartments)) {
    return rawDepartments.map((d) => String(d).trim()).filter(Boolean);
  }

  if (typeof rawDepartments === 'string') {
    // UI can send either:
    // - comma separated: "Engineering, Marketing, Sales"
    // - newline/semicolon separated: "Engineering\nMarketing;Sales"
    return rawDepartments
      .split(/[,\n;\r]+/g)
      .map((d) => d.trim())
      .filter(Boolean);
  }

  return undefined;
}

async function getCompanies(req, res) {
  try {
    await connectDB();
    const companies = await Company.find().sort({ createdAt: -1 });

    const now = new Date();
    for (const company of companies) {
      // Finalize admin portal status when the "start window" ends.
      // This should not block exam submissions; those are controlled by `surveyClosesAt`.
      await maybeFinalizeByStartWindow(company, now);

      if (
        company.surveyStatus === 'in_progress' &&
        company.surveyClosesAt &&
        now > company.surveyClosesAt
      ) {
        company.surveyStatus = 'completed';
        // Preserve `session_ended` so the portal doesn't incorrectly mark incomplete sessions.
        if (company.status !== 'session_ended') company.status = 'completed';
        await company.save();
      }
    }

    return res.json({ companies });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch companies' });
  }
}

async function createCompany(req, res) {
  try {
    await connectDB();

    const {
      name: rawName,
      email: rawEmail,
      industry,
      employeeCount,
      departments: rawDepartments,
      excelFileUrl,
      contactPerson,
      phone,
    } = req.body || {};

    const name = typeof rawName === 'string' ? rawName.trim() : rawName;
    const email = typeof rawEmail === 'string' ? rawEmail.trim() : rawEmail;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email already exists
    const existingCompany = await Company.findOne({ email });
    if (existingCompany) {
      return res.status(400).json({ error: 'Company with this email already exists' });
    }

    // Resolve Excel file URL: either from body or from uploaded file
    let resolvedExcelFileUrl = excelFileUrl;
    if (req.file) {
      try {
        const uploadResult = await uploadExcelToCloudinary(req.file);
        resolvedExcelFileUrl = uploadResult.secure_url;
      } catch (uploadError) {
        return res
          .status(500)
          .json({ error: uploadError.message || 'Failed to upload Excel file' });
      }
    }

    const departments = parseDepartments(rawDepartments) || [];

    const company = await Company.create({
      name,
      email,
      industry,
      employeeCount: employeeCount || 0,
      status: 'new',
      excelFileUrl: resolvedExcelFileUrl,
      departments,
      contactPerson,
      phone,
    });

    return res.status(201).json({ company });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create company' });
  }
}

async function getCompanyById(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Auto-refresh survey status on read
    const now = new Date();
    await maybeFinalizeByStartWindow(company, now);
    if (company.surveyStatus === 'in_progress' && company.surveyClosesAt && now > company.surveyClosesAt) {
      company.surveyStatus = 'completed';
      if (company.status !== 'session_ended') company.status = 'completed';
      await company.save();
    }

    return res.json({ company });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch company' });
  }
}

// Public, read-only company lookup for survey participants.
// Only exposes minimal fields needed by the survey (id and name).
async function getPublicCompanyById(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.id).select(
      '_id name departments surveyDispatchedAt surveyClosesAt surveyStatus',
    );
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const companyObj = company.toObject();
    if (companyObj.surveyDispatchedAt) {
      companyObj.surveyStartClosesAt = new Date(
        new Date(companyObj.surveyDispatchedAt).getTime() +
          SURVEY_START_ACTIVE_MINUTES * 60 * 1000,
      );
    } else {
      companyObj.surveyStartClosesAt = null;
    }

    return res.json({ company: companyObj });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch company' });
  }
}

async function updateCompany(req, res) {
  try {
    await connectDB();

    const {
      name,
      email,
      industry,
      employeeCount,
      status,
      contactPerson,
      phone,
      departments: rawDepartments,
    } = req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check email uniqueness if email is being updated
    if (email && email !== company.email) {
      const existingCompany = await Company.findOne({ email });
      if (existingCompany) {
        return res.status(400).json({ error: 'Company with this email already exists' });
      }
    }

    const updateData = {
      name,
      email,
      industry,
      employeeCount,
      status,
      contactPerson,
      phone,
    };

    if (rawDepartments !== undefined) {
      updateData.departments = parseDepartments(rawDepartments) || [];
    }

    // If an excel file is uploaded by admin, upload to Cloudinary and update the URL
    if (req.file) {
      try {
        const uploadResult = await uploadExcelToCloudinary(req.file);
        updateData.excelFileUrl = uploadResult.secure_url;
      } catch (uploadError) {
        return res
          .status(500)
          .json({ error: uploadError.message || 'Failed to upload Excel file' });
      }
    }

    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.json({ company: updatedCompany });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update company' });
  }
}

async function deleteCompany(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    await Company.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete company' });
  }
}

async function publicCreateCompany(req, res) {
  try {
    await connectDB();

    const { name, email, industry, employeeCount, contactPerson, phone, departments: rawDepartments } =
      req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let excelFileUrl;
    if (req.file) {
      const uploadResult = await uploadExcelToCloudinary(req.file);
      excelFileUrl = uploadResult.secure_url;
    }

    const departments = parseDepartments(rawDepartments) || [];

    const company = await Company.create({
      name,
      email,
      industry,
      employeeCount: employeeCount || 0,
      status: 'new',
      excelFileUrl,
      departments,
      contactPerson,
      phone,
    });

    return res.status(201).json({ company });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to submit company details' });
  }
}

async function getCompanyEmails(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (!company.excelFileUrl) {
      return res.status(400).json({ error: 'No Excel file uploaded for this company' });
    }

    const emails = await extractInvitedEmailsFromExcelUrl(company.excelFileUrl);
    return res.json({ emails });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load company emails' });
  }
}

async function getCompaniesWithSurvey(req, res) {
  try {
    await connectDB();

    const companies = await Company.find({ surveyDispatchedAt: { $ne: null } }).sort({
      createdAt: -1,
    });

    const now = new Date();
    for (const company of companies) {
      await maybeFinalizeByStartWindow(company, now);
      if (
        company.surveyStatus === 'in_progress' &&
        company.surveyClosesAt &&
        now > company.surveyClosesAt
      ) {
        company.surveyStatus = 'completed';
        if (company.status !== 'session_ended') company.status = 'completed';
        await company.save();
      }
    }

    return res.json({ companies });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || 'Failed to fetch companies with survey' });
  }
}

async function maybeFinalizeByStartWindow(company, now) {
  if (!company) return;
  if (company.surveyStatus !== 'in_progress') return;
  if (!company.surveyDispatchedAt) return;
  // Only finalize once: when the portal status is currently "active".
  if (company.status !== 'active' && company.status !== 'pending') return;

  const startClosesAt = new Date(company.surveyDispatchedAt.getTime() + SURVEY_START_ACTIVE_MINUTES * 60 * 1000);

  if (now <= startClosesAt) return;

  // Decide final admin status based on whether all invited users have submitted.
  // This intentionally does NOT modify `surveyStatus` (which gates submissions).
  let invitedEmails = [];
  if (company.excelFileUrl) {
    try {
      invitedEmails = await extractInvitedEmailsFromExcelUrl(company.excelFileUrl);
    } catch (e) {
      // If we can't parse the invited list, treat it as "no pending users".
      invitedEmails = [];
    }
  }

  const completedResponses = await EmployeeResponse.find(
    { companyId: company._id },
    { employeeEmail: 1 }
  ).lean();

  const completedEmailsSet = new Set(
    completedResponses
      .map((r) => (r.employeeEmail || '').trim().toLowerCase())
      .filter((e) => e && e.includes('@') && e.includes('.'))
  );

  const totalInvited = invitedEmails.length;
  const completedCount = totalInvited
    ? invitedEmails.filter((email) => completedEmailsSet.has(email.toLowerCase())).length
    : completedEmailsSet.size;

  const pendingCount = totalInvited > 0 ? Math.max(totalInvited - completedCount, 0) : 0;

  company.status = pendingCount > 0 ? 'session_ended' : 'completed';
  await company.save();
}

async function extractInvitedEmailsFromExcelUrl(excelFileUrl) {
  const response = await axios.get(excelFileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  // Try to infer a file name / extension from the URL.
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
      if (line.trim()) {
        const columns = line.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
        for (const col of columns) {
          if (col.includes('@') && col.includes('.')) {
            emails.push(col.toLowerCase());
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
        if (email.includes('@') && email.includes('.')) {
          emails.push(email);
        }
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

async function uploadExcelToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_FOLDER || 'ohd/company-excels',
        resource_type: 'raw',
        public_id: file.originalname?.split('.')[0],
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });
}

module.exports = {
  getCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  publicCreateCompany,
  getCompanyEmails,
  getPublicCompanyById,
  getCompaniesWithSurvey,
};

