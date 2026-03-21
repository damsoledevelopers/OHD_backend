import { NextRequest } from 'next/server';
import { verifyToken, JWTPayload } from '@/utils/jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function getAuthToken(request: NextRequest): string | null {
  // Check cookie first (for frontend)
  const cookieToken = request.cookies.get('token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  // Fallback to header (for API clients)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function authenticateRequest(request: NextRequest): JWTPayload {
  const token = getAuthToken(request);
  
  if (!token) {
    throw new Error('Authentication token required');
  }

  try {
    return verifyToken(token);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function requireAdmin(request: NextRequest): JWTPayload {
  const user = authenticateRequest(request);
  
  if (user.role !== 'super_admin') {
    throw new Error('Admin access required');
  }

  return user;
}

