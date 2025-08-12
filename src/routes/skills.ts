import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { skills } from '../db/schema.js';

const router = new Hono();

// Get all skills for a user
router.get('/user/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    
    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userSkills = await db
      .select()
      .from(skills)
      .where(eq(skills.userId, userId))
      .orderBy(desc(skills.createdAt));

    return c.json({
      message: 'Skills retrieved successfully',
      data: userSkills,
    });
  } catch (error: any) {
    console.error('Get skills error:', error);
    return c.json({ 
      error: 'Failed to retrieve skills',
      details: error.message 
    }, 500);
  }
});

// Get skills grouped by category for a user
router.get('/user/:userId/grouped', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    
    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userSkills = await db
      .select()
      .from(skills)
      .where(eq(skills.userId, userId))
      .orderBy(desc(skills.createdAt));

    // Group skills by category
    const groupedSkills: { [key: string]: any[] } = {};
    userSkills.forEach(skill => {
      if (!groupedSkills[skill.category]) {
        groupedSkills[skill.category] = [];
      }
      groupedSkills[skill.category].push(skill);
    });

    return c.json({
      message: 'Skills retrieved successfully',
      data: groupedSkills,
    });
  } catch (error: any) {
    console.error('Get grouped skills error:', error);
    return c.json({ 
      error: 'Failed to retrieve skills',
      details: error.message 
    }, 500);
  }
});

// Get single skill
router.get('/:id', async (c) => {
  try {
    const skillId = parseInt(c.req.param('id'));
    
    if (!skillId) {
      return c.json({ error: 'Skill ID is required' }, 400);
    }

    const skill = await db
      .select()
      .from(skills)
      .where(eq(skills.id, skillId))
      .limit(1);

    if (skill.length === 0) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    return c.json({
      message: 'Skill retrieved successfully',
      data: skill[0],
    });
  } catch (error: any) {
    console.error('Get skill error:', error);
    return c.json({ 
      error: 'Failed to retrieve skill',
      details: error.message 
    }, 500);
  }
});

// Create new skill
router.post('/', async (c) => {
  try {
    const { 
      name, 
      category, 
      level = 1, 
      description, 
      icon = 'fas fa-code',
      color = '#3B82F6',
      userId 
    } = await c.req.json();

    // Validate required fields
    if (!name || !category || !userId) {
      return c.json({ error: 'Name, category, and userId are required' }, 400);
    }

    // Validate level range
    if (level < 1 || level > 5) {
      return c.json({ error: 'Level must be between 1 and 5' }, 400);
    }

    const newSkill = await db
      .insert(skills)
      .values({
        name,
        category,
        level: parseInt(level),
        description,
        icon,
        color,
        userId: parseInt(userId),
      })
      .returning();

    return c.json({
      message: 'Skill created successfully',
      data: newSkill[0],
    }, 201);
  } catch (error: any) {
    console.error('Create skill error:', error);
    return c.json({ 
      error: 'Failed to create skill',
      details: error.message 
    }, 500);
  }
});

// Update skill
router.put('/:id', async (c) => {
  try {
    const skillId = parseInt(c.req.param('id'));
    const { 
      name, 
      category, 
      level, 
      description, 
      icon,
      color
    } = await c.req.json();

    if (!skillId) {
      return c.json({ error: 'Skill ID is required' }, 400);
    }

    // Check if skill exists
    const existingSkill = await db
      .select()
      .from(skills)
      .where(eq(skills.id, skillId))
      .limit(1);

    if (existingSkill.length === 0) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (level !== undefined) {
      if (level < 1 || level > 5) {
        return c.json({ error: 'Level must be between 1 and 5' }, 400);
      }
      updateData.level = parseInt(level);
    }
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;

    const updatedSkill = await db
      .update(skills)
      .set(updateData)
      .where(eq(skills.id, skillId))
      .returning();

    return c.json({
      message: 'Skill updated successfully',
      data: updatedSkill[0],
    });
  } catch (error: any) {
    console.error('Update skill error:', error);
    return c.json({ 
      error: 'Failed to update skill',
      details: error.message 
    }, 500);
  }
});

// Delete skill
router.delete('/:id', async (c) => {
  try {
    const skillId = parseInt(c.req.param('id'));
    
    if (!skillId) {
      return c.json({ error: 'Skill ID is required' }, 400);
    }

    // Check if skill exists
    const existingSkill = await db
      .select()
      .from(skills)
      .where(eq(skills.id, skillId))
      .limit(1);

    if (existingSkill.length === 0) {
      return c.json({ error: 'Skill not found' }, 404);
    }

    // Delete skill from database
    await db.delete(skills).where(eq(skills.id, skillId));

    return c.json({
      message: 'Skill deleted successfully',
      data: { id: skillId },
    });
  } catch (error: any) {
    console.error('Delete skill error:', error);
    return c.json({ 
      error: 'Failed to delete skill',
      details: error.message 
    }, 500);
  }
});

export default router;