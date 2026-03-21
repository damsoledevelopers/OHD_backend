const connectDB = require('../config/database');
const { calculateOverallStats, calculateSectionStats } = require('../utils/calculations');
const QuestionPaper = require('../models/QuestionPaper');
const Company = require('../models/Company');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

async function getPublishedQuestionPaper() {
  const paper = await QuestionPaper.getOrCreateDefault();
  if (paper.published && Array.isArray(paper.published.pillars) && paper.published.pillars.length > 0) {
    return paper.published;
  }
  return paper.draft || { pillars: [] };
}

function getAllSections(questionPaper) {
  const result = [];
  if (!questionPaper || !Array.isArray(questionPaper.pillars)) return result;

  for (const pillar of questionPaper.pillars) {
    if (!pillar.sections) continue;
    for (const section of pillar.sections) {
      result.push({ section, pillar });
    }
  }

  result.sort((a, b) => {
    const ao = typeof a.section.order === 'number' ? a.section.order : 0;
    const bo = typeof b.section.order === 'number' ? b.section.order : 0;
    return ao - bo;
  });

  return result;
}

async function exportPDF(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const overallStats = await calculateOverallStats(req.params.companyId);
    const questionPaper = await getPublishedQuestionPaper();
    const sectionsWithPillars = getAllSections(questionPaper);
    const sectionStats = [];

    for (const { section } of sectionsWithPillars) {
      const stats = await calculateSectionStats(section._id.toString(), req.params.companyId);
      sectionStats.push(stats);
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    // Header
    doc.fontSize(20).text('Organization Health Diagnostic Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`Company: ${company.name}`, { align: 'center' });
    doc.moveDown(2);

    // Overall Stats
    doc.fontSize(14).text('Overall Statistics', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Overall Percentage: ${overallStats.overallPercentage.toFixed(2)}%`);
    doc.text(`Total Responses: ${overallStats.totalResponses}`);
    doc.text(`Total Companies: ${overallStats.totalCompanies}`);
    doc.moveDown();

    // Wait for PDF to be generated
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ohd-report-${company.name}-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to export PDF' });
  }
}

async function exportExcel(req, res) {
  try {
    await connectDB();

    const company = await Company.findById(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const overallStats = await calculateOverallStats(req.params.companyId);
    const questionPaper = await getPublishedQuestionPaper();
    const sectionsWithPillars = getAllSections(questionPaper);
    const sectionStats = [];

    for (const { section } of sectionsWithPillars) {
      const stats = await calculateSectionStats(section._id.toString(), req.params.companyId);
      sectionStats.push(stats);
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const overallSheet = workbook.addWorksheet('Overall Statistics');
    
    overallSheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    overallSheet.addRow({ metric: 'Overall Percentage', value: `${overallStats.overallPercentage.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Total Responses', value: overallStats.totalResponses });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ohd-report-${company.name}-${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to export Excel' });
  }
}

module.exports = {
  exportPDF,
  exportExcel
};

