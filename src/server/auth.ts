import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pgClient } from '../db/index.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: 'ADMIN' | 'CASHIER';
  status: 'PENDING' | 'APPROVED';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  let decoded: AuthUser;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch (jwtErr) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  try {
    // Verify user still exists in database and is APPROVED
    const userRes = await pgClient.query<any>(
      'SELECT id, name, email, phone, avatar_url, role, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists. Please login again.' });
    }

    const row = userRes.rows[0];
    if (row.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Your account is pending Admin approval.' });
    }

    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: row.role,
      status: row.status,
    };
    next();
  } catch (dbErr: any) {
    console.error('requireAuth database error:', dbErr?.message || dbErr);
    return res.status(503).json({ error: 'Database service temporarily unavailable. Please retry.' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin permission required for this operation.' });
  }
  next();
}
