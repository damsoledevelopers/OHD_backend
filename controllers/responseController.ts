import { NextRequest, NextResponse } from 'next/server';
import EmployeeResponse from '@/models/EmployeeResponse';
import Company from '@/models/Company';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/Backend/middleware/auth';

export async function submitResponse(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { companyId, employeeEmail, employeeName, answers, service } = body;

    if (!companyId || !answers) {
      return NextResponse.json({ error: 'Company ID and answers are required' }, { status: 400 });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Basic validation of ratings
    const validRatings = ['A', 'B', 'C', 'D', 'E'];
    for (const answer of answers) {
      if (!validRatings.includes(answer.rating)) {
        return NextResponse.json({ error: `Invalid rating: ${answer.rating}. Must be A, B, C, D, or E` }, { status: 400 });
      }
    }

    const response = await EmployeeResponse.create({
      companyId,
      service,
      employeeEmail: employeeEmail?.trim().toLowerCase() || undefined,
      employeeName,
      answers,
      submittedAt: new Date(),
    });

    return NextResponse.json({ response }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to submit response' }, { status: 500 });
  }
}

export async function getCompanyResponses(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    await connectDB();
    requireAdmin(request);

    const responses = await EmployeeResponse.find({ companyId: params.companyId })
      .populate('companyId', 'name')
      .sort({ submittedAt: -1 });

    return NextResponse.json({ responses });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch responses' }, { status: 500 });
  }
}

