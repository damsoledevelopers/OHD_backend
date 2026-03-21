import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/Backend/middleware/auth';
import { calculateOverallStats } from '@/utils/calculations';

export async function getCompanyReport(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    await connectDB();
    requireAdmin(request);

    const overallStats = await calculateOverallStats(params.companyId);

    return NextResponse.json({
      companyId: params.companyId,
      overallStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate company report' }, { status: 500 });
  }
}

export async function getSectionReport(request: NextRequest, { params }: { params: { sectionId: string } }) {
  try {
    return NextResponse.json({ error: 'Section-level reports are no longer available' }, { status: 410 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate section report' }, { status: 500 });
  }
}

export async function getOverallReport(request: NextRequest) {
  try {
    await connectDB();
    requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const overallStats = await calculateOverallStats(companyId || undefined);

    return NextResponse.json({
      overallStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate overall report' }, { status: 500 });
  }
}

