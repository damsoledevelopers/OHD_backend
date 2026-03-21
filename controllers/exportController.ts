import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/Backend/middleware/auth';
import { calculateOverallStats, calculateSectionStats } from '@/utils/calculations';
import Section from '@/models/Section';
import Company from '@/models/Company';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export async function exportPDF(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    await connectDB();
    requireAdmin(request);

    const company = await Company.findById(params.companyId);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const overallStats = await calculateOverallStats(params.companyId);
    const sections = await Section.find().sort({ order: 1 });
    const sectionStats = [];

    for (const section of sections) {
      const stats = await calculateSectionStats(section._id.toString(), params.companyId);
      sectionStats.push(stats);
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    // Set up event listeners before writing
    doc.on('data', (chunk) => chunks.push(chunk));

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
    doc.text('Rating Distribution:');
    doc.text(`  A: ${overallStats.ratingDistribution.A} (${overallStats.ratingDistributionPercentage.A.toFixed(2)}%)`);
    doc.text(`  B: ${overallStats.ratingDistribution.B} (${overallStats.ratingDistributionPercentage.B.toFixed(2)}%)`);
    doc.text(`  C: ${overallStats.ratingDistribution.C} (${overallStats.ratingDistributionPercentage.C.toFixed(2)}%)`);
    doc.text(`  D: ${overallStats.ratingDistribution.D} (${overallStats.ratingDistribution.D.toFixed(2)}%)`);
    doc.text(`  E: ${overallStats.ratingDistribution.E} (${overallStats.ratingDistribution.E.toFixed(2)}%)`);
    doc.moveDown();

    if (overallStats.bestSection) {
      doc.text(`Best Section: ${overallStats.bestSection.sectionName} (${overallStats.bestSection.percentage.toFixed(2)}%)`);
    }
    doc.moveDown();

    // Summary Insights
    doc.text('Summary Insights:', { underline: true });
    overallStats.summaryInsights.forEach((insight) => {
      doc.text(`  • ${insight}`);
    });
    doc.moveDown(2);

    // Section Stats
    doc.fontSize(14).text('Section Statistics', { underline: true });
    doc.moveDown();

    sectionStats.forEach((section, index) => {
      if (index > 0 && index % 3 === 0) {
        doc.addPage();
      }
      doc.fontSize(12).text(`${section.sectionName}: ${section.sectionPercentage.toFixed(2)}%`, { underline: true });
      doc.text(`Total Responses: ${section.totalResponses}`);
      doc.moveDown();
    });

    // Wait for PDF to be generated
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);
      doc.end();
    });

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ohd-report-${company.name}-${Date.now()}.pdf"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to export PDF' }, { status: 500 });
  }
}

export async function exportExcel(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    await connectDB();
    requireAdmin(request);

    const company = await Company.findById(params.companyId);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const overallStats = await calculateOverallStats(params.companyId);
    const sections = await Section.find().sort({ order: 1 });
    const sectionStats = [];

    for (const section of sections) {
      const stats = await calculateSectionStats(section._id.toString(), params.companyId);
      sectionStats.push(stats);
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // Overall Stats Sheet
    const overallSheet = workbook.addWorksheet('Overall Statistics');
    overallSheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    overallSheet.addRow({ metric: 'Overall Percentage', value: `${overallStats.overallPercentage.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Total Responses', value: overallStats.totalResponses });
    overallSheet.addRow({ metric: 'Total Companies', value: overallStats.totalCompanies });
    overallSheet.addRow({ metric: 'Rating A Count', value: overallStats.ratingDistribution.A });
    overallSheet.addRow({ metric: 'Rating A Percentage', value: `${overallStats.ratingDistributionPercentage.A.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Rating B Count', value: overallStats.ratingDistribution.B });
    overallSheet.addRow({ metric: 'Rating B Percentage', value: `${overallStats.ratingDistributionPercentage.B.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Rating C Count', value: overallStats.ratingDistribution.C });
    overallSheet.addRow({ metric: 'Rating C Percentage', value: `${overallStats.ratingDistributionPercentage.C.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Rating D Count', value: overallStats.ratingDistribution.D });
    overallSheet.addRow({ metric: 'Rating D Percentage', value: `${overallStats.ratingDistributionPercentage.D.toFixed(2)}%` });
    overallSheet.addRow({ metric: 'Rating E Count', value: overallStats.ratingDistribution.E });
    overallSheet.addRow({ metric: 'Rating E Percentage', value: `${overallStats.ratingDistributionPercentage.E.toFixed(2)}%` });
    if (overallStats.bestSection) {
      overallSheet.addRow({ metric: 'Best Section', value: overallStats.bestSection.sectionName });
      overallSheet.addRow({ metric: 'Best Section Percentage', value: `${overallStats.bestSection.percentage.toFixed(2)}%` });
    }

    // Section Stats Sheet
    const sectionSheet = workbook.addWorksheet('Section Statistics');
    sectionSheet.columns = [
      { header: 'Section Name', key: 'sectionName', width: 30 },
      { header: 'Percentage', key: 'percentage', width: 15 },
      { header: 'Total Responses', key: 'totalResponses', width: 15 },
    ];
    sectionStats.forEach((section) => {
      sectionSheet.addRow({
        sectionName: section.sectionName,
        percentage: `${section.sectionPercentage.toFixed(2)}%`,
        totalResponses: section.totalResponses,
      });
    });

    // Question Stats Sheet
    const questionSheet = workbook.addWorksheet('Question Statistics');
    questionSheet.columns = [
      { header: 'Section', key: 'section', width: 25 },
      { header: 'Question', key: 'question', width: 50 },
      { header: 'A Count', key: 'aCount', width: 10 },
      { header: 'A %', key: 'aPercent', width: 10 },
      { header: 'B Count', key: 'bCount', width: 10 },
      { header: 'B %', key: 'bPercent', width: 10 },
      { header: 'C Count', key: 'cCount', width: 10 },
      { header: 'C %', key: 'cPercent', width: 10 },
      { header: 'D Count', key: 'dCount', width: 10 },
      { header: 'D %', key: 'dPercent', width: 10 },
      { header: 'E Count', key: 'eCount', width: 10 },
      { header: 'E %', key: 'ePercent', width: 10 },
      { header: 'Total Responses', key: 'total', width: 15 },
    ];

    sectionStats.forEach((section) => {
      section.questionStats.forEach((question) => {
        questionSheet.addRow({
          section: section.sectionName,
          question: question.questionText,
          aCount: question.ratingCount.A,
          aPercent: `${question.ratingPercentage.A.toFixed(2)}%`,
          bCount: question.ratingCount.B,
          bPercent: `${question.ratingPercentage.B.toFixed(2)}%`,
          cCount: question.ratingCount.C,
          cPercent: `${question.ratingPercentage.C.toFixed(2)}%`,
          dCount: question.ratingCount.D,
          dPercent: `${question.ratingPercentage.D.toFixed(2)}%`,
          eCount: question.ratingCount.E,
          ePercent: `${question.ratingPercentage.E.toFixed(2)}%`,
          total: question.totalResponses,
        });
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ohd-report-${company.name}-${Date.now()}.xlsx"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to export Excel' }, { status: 500 });
  }
}

