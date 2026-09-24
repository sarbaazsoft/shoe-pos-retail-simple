import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from '../../db/index.ts';
import { generateToken, requireAuth } from '../auth.ts';
import type { AuthenticatedRequest, AuthUser } from '../auth.ts';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pgClient.query(
      'SELECT id, name, email, phone, avatar_url, password_hash, role, status FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user: any = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'PENDING') {
      return res.status(403).json({
        error: 'Your account is currently PENDING approval by the Shop Owner/Admin.',
        status: 'PENDING',
      });
    }

    const authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatarUrl: user.avatar_url || '',
      role: user.role,
      originalRole: user.role,
      status: user.status,
    };

    const token = generateToken(authUser);
    res.json({ token, user: authUser });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const confirmPassword = req.body.confirmPassword || req.body.confirm_password;
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const existing = await pgClient.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userPhone = typeof phone === 'string' ? phone.trim() : '';

    // Register as CASHIER with PENDING status (requires Owner approval)
    const result = await pgClient.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status) 
       VALUES ($1, $2, $3, $4, 'CASHIER', 'PENDING') 
       RETURNING id, name, email, phone, role, status`,
      [name.trim(), email.trim(), userPhone, passwordHash]
    );

    res.status(201).json({
      message: 'Registration submitted successfully. Your account is pending Admin approval before you can log in.',
      user: result.rows[0],
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// Get current user profile
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRes = await pgClient.query(
      'SELECT id, name, email, phone, avatar_url, role, status FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const row: any = userRes.rows[0];
    res.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        avatarUrl: row.avatar_url || '',
        role: row.role,
        originalRole: row.role,
        status: row.status,
      },
    });
  } catch (err) {
    res.json({ user: req.user });
  }
});

// Update Profile (Name, Phone, and optional Avatar Image; Email is strictly unchangeable)
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, avatarUrl } = req.body;
    const userId = req.user!.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    // Allow empty string to reset/remove the profile image, or updated base64/URL string
    const sanitizedAvatarUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : (req.user?.avatarUrl || '');

    // IMPORTANT: Email is strictly unchangeable. It is intentionally omitted from the UPDATE query.
    const result = await pgClient.query(
      'UPDATE users SET name = $1, phone = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4 RETURNING id, name, email, phone, avatar_url, role, status',
      [trimmedName, trimmedPhone, sanitizedAvatarUrl, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const row: any = result.rows[0];
    const updatedUser: AuthUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: row.role,
      status: row.status,
    };
    const token = generateToken(updatedUser);

    res.json({
      message: 'Profile updated successfully.',
      user: updatedUser,
      token,
    });
  } catch (err: any) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// Change Password (Requires previous password, new password, and confirm password)
router.put('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Please enter your current/previous password.' });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Please enter both new password and confirm password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }

    // Verify current password against database
    const userRes = await pgClient.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const user: any = userRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect previous/current password. Please check and try again.' });
    }

    // Hash new password and save
    const newHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

    res.json({ message: 'Password changed successfully. Please remember your new password.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

// Forgot Password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const userRes = await pgClient.query('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (userRes.rows.length === 0) {
      // Avoid leaking whether an email exists
      return res.json({ message: 'If the email exists in our system, a password reset link has been generated.' });
    }

    const user: any = userRes.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any previous tokens
    await pgClient.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    await pgClient.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    // In a production server this would send an email, in desktop POS counter we return the token/link for immediate testing
    res.json({
      message: 'Password reset token generated successfully.',
      resetToken,
      info: 'For testing counter recovery, you may use this token directly to reset your password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Forgot password failed: ' + err.message });
  }
});

// Reset Password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const tokenRes = await pgClient.query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const { user_id, expires_at } = tokenRes.rows[0] as any;
    if (new Date() > new Date(expires_at)) {
      await pgClient.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      return res.status(400).json({ error: 'Password reset token has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, user_id]);
    await pgClient.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    res.json({ message: 'Password has been reset successfully. You may now log in with your new password.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Reset password failed: ' + err.message });
  }
});

export default router;
