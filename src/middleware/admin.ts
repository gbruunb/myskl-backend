import type { Context, Next } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Admin authentication middleware
export async function requireAdmin(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.substring(7);
    // For now, we'll use a simple token that contains the user ID
    // In production, use proper JWT verification
    const userId = parseInt(token);
    
    if (!userId || isNaN(userId)) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return c.json({ error: 'User not found' }, 401);
    }

    if (user[0].role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    if (!user[0].isActive) {
      return c.json({ error: 'Account is inactive' }, 403);
    }

    // Add user to context
    c.set('adminUser', user[0]);
    
    await next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
}

// Check if user has admin role (for frontend use)
export async function checkAdminRole(userId: number): Promise<boolean> {
  try {
    // Handle invalid userId
    if (!userId || isNaN(userId)) {
      return false;
    }

    // Try to get user with role column, fallback if column doesn't exist
    let user;
    try {
      user = await db
        .select({ role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    } catch (dbError: any) {
      // If role column doesn't exist yet, check if user exists and return false
      if (dbError.message?.includes('role') || dbError.message?.includes('is_active')) {
        console.log('Role columns not yet added to database. Run migration first.');
        // Try to get basic user info
        const basicUser = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        
        // Return false for any user until migration is run
        return false;
      }
      throw dbError;
    }

    return user.length > 0 && user[0].role === 'admin' && user[0].isActive === true;
  } catch (error) {
    console.error('Check admin role error:', error);
    // Return false for any database errors to prevent unauthorized access
    return false;
  }
}