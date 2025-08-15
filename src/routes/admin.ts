import { Hono } from 'hono';
import { eq, desc, like, count, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, skillRoadmaps, roadmapTasks, skills, projects } from '../db/schema.js';
import { requireAdmin, checkAdminRole } from '../middleware/admin.js';

const admin = new Hono();

// Apply admin middleware to all routes
admin.use('/*', requireAdmin);

// ===== USER MANAGEMENT =====

// Get all users with pagination
admin.get('/users', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const search = c.req.query('search') || '';
    const role = c.req.query('role') || '';
    
    const offset = (page - 1) * limit;
    
    let allUsers;
    if (search && role) {
      allUsers = await db.select().from(users)
        .where(sql`${users.name} ILIKE ${`%${search}%`} AND ${users.role} = ${role}`)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);
    } else if (search) {
      allUsers = await db.select().from(users)
        .where(like(users.name, `%${search}%`))
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);
    } else if (role) {
      allUsers = await db.select().from(users)
        .where(eq(users.role, role))
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      allUsers = await db.select().from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);
    }

    // Get total count
    const totalCount = await db
      .select({ count: count() })
      .from(users);

    return c.json({
      success: true,
      data: allUsers.map(user => ({
        ...user,
        password: undefined // Never send password
      })),
      pagination: {
        page,
        limit,
        total: totalCount[0].count,
        pages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error: any) {
    console.error('Admin get users error:', error);
    return c.json({ error: 'Failed to fetch users' }, 500);
  }
});

// Get single user details
admin.get('/users/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get user's projects count
    const projectsCount = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.userId, userId));

    // Get user's skills count  
    const skillsCount = await db
      .select({ count: count() })
      .from(skills)
      .where(eq(skills.userId, userId));

    return c.json({
      success: true,
      data: {
        ...user[0],
        password: undefined,
        stats: {
          projectsCount: projectsCount[0].count,
          skillsCount: skillsCount[0].count
        }
      }
    });
  } catch (error: any) {
    console.error('Admin get user error:', error);
    return c.json({ error: 'Failed to fetch user' }, 500);
  }
});

// Update user role
admin.put('/users/:id/role', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const { role } = await c.req.json();
    
    if (!['user', 'admin'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error: any) {
    console.error('Admin update role error:', error);
    return c.json({ error: 'Failed to update user role' }, 500);
  }
});

// Toggle user active status
admin.put('/users/:id/status', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const { isActive } = await c.req.json();
    
    await db
      .update(users)
      .set({ isActive: Boolean(isActive), updatedAt: new Date() })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error: any) {
    console.error('Admin update status error:', error);
    return c.json({ error: 'Failed to update user status' }, 500);
  }
});

// Delete user (soft delete by deactivating)
admin.delete('/users/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    // @ts-ignore - Hono context typing issue with custom middleware
    const adminUser = c.get('adminUser') as any;
    
    // Prevent admin from deleting themselves
    if (userId === adminUser.id) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return c.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error: any) {
    console.error('Admin delete user error:', error);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

// ===== ROADMAP MANAGEMENT =====

// Get all skill roadmaps
admin.get('/roadmaps', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const search = c.req.query('search') || '';
    
    const offset = (page - 1) * limit;
    
    let roadmaps;
    if (search) {
      roadmaps = await db.select().from(skillRoadmaps)
        .where(like(skillRoadmaps.name, `%${search}%`))
        .orderBy(desc(skillRoadmaps.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      roadmaps = await db.select().from(skillRoadmaps)
        .orderBy(desc(skillRoadmaps.createdAt))
        .limit(limit)
        .offset(offset);
    }

    // Get task counts for each roadmap
    for (const roadmap of roadmaps) {
      const taskCount = await db
        .select({ count: count() })
        .from(roadmapTasks)
        .where(eq(roadmapTasks.roadmapId, roadmap.id));
      
      (roadmap as any).taskCount = taskCount[0].count;
    }

    return c.json({
      success: true,
      data: roadmaps
    });
  } catch (error: any) {
    console.error('Admin get roadmaps error:', error);
    return c.json({ error: 'Failed to fetch roadmaps' }, 500);
  }
});

// Create new roadmap
admin.post('/roadmaps', async (c) => {
  try {
    const {
      name,
      description,
      category,
      icon = 'fas fa-code',
      color = '#3B82F6',
      estimatedDuration,
      difficulty = 'intermediate',
      isActive = true
    } = await c.req.json();

    if (!name || !description || !category) {
      return c.json({ error: 'Name, description, and category are required' }, 400);
    }

    const newRoadmap = await db
      .insert(skillRoadmaps)
      .values({
        name,
        description,
        category,
        icon,
        color,
        estimatedDuration,
        difficulty,
        isActive
      })
      .returning();

    return c.json({
      success: true,
      data: newRoadmap[0],
      message: 'Roadmap created successfully'
    });
  } catch (error: any) {
    console.error('Admin create roadmap error:', error);
    return c.json({ error: 'Failed to create roadmap' }, 500);
  }
});

// Update roadmap
admin.put('/roadmaps/:id', async (c) => {
  try {
    const roadmapId = parseInt(c.req.param('id'));
    const {
      name,
      description,
      category,
      icon,
      color,
      estimatedDuration,
      difficulty,
      isActive
    } = await c.req.json();

    const updateData: any = { updatedAt: new Date() };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (estimatedDuration !== undefined) updateData.estimatedDuration = estimatedDuration;
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedRoadmap = await db
      .update(skillRoadmaps)
      .set(updateData)
      .where(eq(skillRoadmaps.id, roadmapId))
      .returning();

    return c.json({
      success: true,
      data: updatedRoadmap[0],
      message: 'Roadmap updated successfully'
    });
  } catch (error: any) {
    console.error('Admin update roadmap error:', error);
    return c.json({ error: 'Failed to update roadmap' }, 500);
  }
});

// Delete roadmap
admin.delete('/roadmaps/:id', async (c) => {
  try {
    const roadmapId = parseInt(c.req.param('id'));
    
    // Check if roadmap has tasks
    const taskCount = await db
      .select({ count: count() })
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, roadmapId));

    if (taskCount[0].count > 0) {
      return c.json({ error: 'Cannot delete roadmap with existing tasks' }, 400);
    }

    await db
      .delete(skillRoadmaps)
      .where(eq(skillRoadmaps.id, roadmapId));

    return c.json({
      success: true,
      message: 'Roadmap deleted successfully'
    });
  } catch (error: any) {
    console.error('Admin delete roadmap error:', error);
    return c.json({ error: 'Failed to delete roadmap' }, 500);
  }
});

// ===== TASK MANAGEMENT =====

// Get tasks for a roadmap
admin.get('/roadmaps/:id/tasks', async (c) => {
  try {
    const roadmapId = parseInt(c.req.param('id'));
    
    const tasks = await db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, roadmapId))
      .orderBy(roadmapTasks.orderIndex);

    return c.json({
      success: true,
      data: tasks
    });
  } catch (error: any) {
    console.error('Admin get tasks error:', error);
    return c.json({ error: 'Failed to fetch tasks' }, 500);
  }
});

// Create new task
admin.post('/roadmaps/:id/tasks', async (c) => {
  try {
    const roadmapId = parseInt(c.req.param('id'));
    const {
      title,
      description,
      orderIndex,
      estimatedHours,
      resources,
      prerequisites
    } = await c.req.json();

    if (!title) {
      return c.json({ error: 'Task title is required' }, 400);
    }

    const newTask = await db
      .insert(roadmapTasks)
      .values({
        roadmapId,
        title,
        description,
        orderIndex: orderIndex || 0,
        estimatedHours,
        resources: resources ? JSON.stringify(resources) : null,
        prerequisites: prerequisites ? JSON.stringify(prerequisites) : null
      })
      .returning();

    return c.json({
      success: true,
      data: newTask[0],
      message: 'Task created successfully'
    });
  } catch (error: any) {
    console.error('Admin create task error:', error);
    return c.json({ error: 'Failed to create task' }, 500);
  }
});

// Update task
admin.put('/tasks/:id', async (c) => {
  try {
    const taskId = parseInt(c.req.param('id'));
    const {
      title,
      description,
      orderIndex,
      estimatedHours,
      resources,
      prerequisites
    } = await c.req.json();

    const updateData: any = { updatedAt: new Date() };
    
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours;
    if (resources !== undefined) updateData.resources = JSON.stringify(resources);
    if (prerequisites !== undefined) updateData.prerequisites = JSON.stringify(prerequisites);

    const updatedTask = await db
      .update(roadmapTasks)
      .set(updateData)
      .where(eq(roadmapTasks.id, taskId))
      .returning();

    return c.json({
      success: true,
      data: updatedTask[0],
      message: 'Task updated successfully'
    });
  } catch (error: any) {
    console.error('Admin update task error:', error);
    return c.json({ error: 'Failed to update task' }, 500);
  }
});

// Delete task
admin.delete('/tasks/:id', async (c) => {
  try {
    const taskId = parseInt(c.req.param('id'));
    
    await db
      .delete(roadmapTasks)
      .where(eq(roadmapTasks.id, taskId));

    return c.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error: any) {
    console.error('Admin delete task error:', error);
    return c.json({ error: 'Failed to delete task' }, 500);
  }
});

// ===== SKILL MANAGEMENT =====

// Get all skills
admin.get('/skills', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const search = c.req.query('search') || '';
    const category = c.req.query('category') || '';
    
    const offset = (page - 1) * limit;
    
    let allSkills;
    if (search && category) {
      allSkills = await db.select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        level: skills.level,
        description: skills.description,
        icon: skills.icon,
        color: skills.color,
        userId: skills.userId,
        userName: users.name,
        userLastname: users.lastname,
        createdAt: skills.createdAt
      }).from(skills).leftJoin(users, eq(skills.userId, users.id))
        .where(sql`${skills.name} ILIKE ${`%${search}%`} AND ${skills.category} = ${category}`)
        .orderBy(desc(skills.createdAt))
        .limit(limit)
        .offset(offset);
    } else if (search) {
      allSkills = await db.select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        level: skills.level,
        description: skills.description,
        icon: skills.icon,
        color: skills.color,
        userId: skills.userId,
        userName: users.name,
        userLastname: users.lastname,
        createdAt: skills.createdAt
      }).from(skills).leftJoin(users, eq(skills.userId, users.id))
        .where(like(skills.name, `%${search}%`))
        .orderBy(desc(skills.createdAt))
        .limit(limit)
        .offset(offset);
    } else if (category) {
      allSkills = await db.select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        level: skills.level,
        description: skills.description,
        icon: skills.icon,
        color: skills.color,
        userId: skills.userId,
        userName: users.name,
        userLastname: users.lastname,
        createdAt: skills.createdAt
      }).from(skills).leftJoin(users, eq(skills.userId, users.id))
        .where(eq(skills.category, category))
        .orderBy(desc(skills.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      allSkills = await db.select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        level: skills.level,
        description: skills.description,
        icon: skills.icon,
        color: skills.color,
        userId: skills.userId,
        userName: users.name,
        userLastname: users.lastname,
        createdAt: skills.createdAt
      }).from(skills).leftJoin(users, eq(skills.userId, users.id))
        .orderBy(desc(skills.createdAt))
        .limit(limit)
        .offset(offset);
    }

    return c.json({
      success: true,
      data: allSkills
    });
  } catch (error: any) {
    console.error('Admin get skills error:', error);
    return c.json({ error: 'Failed to fetch skills' }, 500);
  }
});

// ===== DASHBOARD STATS =====

// Get admin dashboard statistics
admin.get('/stats', async (c) => {
  try {
    // Get user counts
    const totalUsers = await db.select({ count: count() }).from(users);
    const activeUsers = await db.select({ count: count() }).from(users).where(eq(users.isActive, true));
    const adminUsers = await db.select({ count: count() }).from(users).where(eq(users.role, 'admin'));
    
    // Get roadmap counts
    const totalRoadmaps = await db.select({ count: count() }).from(skillRoadmaps);
    const activeRoadmaps = await db.select({ count: count() }).from(skillRoadmaps).where(eq(skillRoadmaps.isActive, true));
    
    // Get skill and project counts
    const totalSkills = await db.select({ count: count() }).from(skills);
    const totalProjects = await db.select({ count: count() }).from(projects);

    return c.json({
      success: true,
      data: {
        users: {
          total: totalUsers[0].count,
          active: activeUsers[0].count,
          admins: adminUsers[0].count
        },
        roadmaps: {
          total: totalRoadmaps[0].count,
          active: activeRoadmaps[0].count
        },
        content: {
          skills: totalSkills[0].count,
          projects: totalProjects[0].count
        }
      }
    });
  } catch (error: any) {
    console.error('Admin get stats error:', error);
    return c.json({ error: 'Failed to fetch statistics' }, 500);
  }
});

export default admin;