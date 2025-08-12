import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';
import { deleteFile, uploadFile, generateFileKey } from '../services/s3.js';

const router = new Hono();

// Get all projects for a user
router.get('/user/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    
    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));

    // Parse technologies JSON for each project
    const projectsWithParsedTech = userProjects.map(project => ({
      ...project,
      technologies: project.technologies ? JSON.parse(project.technologies) : [],
    }));

    return c.json({
      message: 'Projects retrieved successfully',
      data: projectsWithParsedTech,
    });
  } catch (error: any) {
    console.error('Get projects error:', error);
    return c.json({ 
      error: 'Failed to retrieve projects',
      details: error.message 
    }, 500);
  }
});

// Get all published projects (public)
router.get('/public', async (c) => {
  try {
    const publicProjects = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        content: projects.content,
        imageUrl: projects.imageUrl,
        technologies: projects.technologies,
        demoUrl: projects.demoUrl,
        githubUrl: projects.githubUrl,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.status, 'published'))
      .orderBy(desc(projects.createdAt));

    // Parse technologies JSON for each project
    const projectsWithParsedTech = publicProjects.map(project => ({
      ...project,
      technologies: project.technologies ? JSON.parse(project.technologies) : [],
    }));

    return c.json({
      message: 'Public projects retrieved successfully',
      data: projectsWithParsedTech,
    });
  } catch (error: any) {
    console.error('Get public projects error:', error);
    return c.json({ 
      error: 'Failed to retrieve public projects',
      details: error.message 
    }, 500);
  }
});

// Get single project
router.get('/:id', async (c) => {
  try {
    const projectId = parseInt(c.req.param('id'));
    
    if (!projectId) {
      return c.json({ error: 'Project ID is required' }, 400);
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Parse technologies JSON
    const projectWithParsedTech = {
      ...project[0],
      technologies: project[0].technologies ? JSON.parse(project[0].technologies) : [],
    };

    return c.json({
      message: 'Project retrieved successfully',
      data: projectWithParsedTech,
    });
  } catch (error: any) {
    console.error('Get project error:', error);
    return c.json({ 
      error: 'Failed to retrieve project',
      details: error.message 
    }, 500);
  }
});

// Create new project
router.post('/', async (c) => {
  try {
    const { 
      title, 
      description, 
      content, 
      technologies = [], 
      demoUrl, 
      githubUrl, 
      status = 'draft',
      userId 
    } = await c.req.json();

    // Validate required fields
    if (!title || !userId) {
      return c.json({ error: 'Title and userId are required' }, 400);
    }

    // Convert technologies array to JSON string
    const techJson = JSON.stringify(technologies);

    const newProject = await db
      .insert(projects)
      .values({
        title,
        description,
        content,
        technologies: techJson,
        demoUrl,
        githubUrl,
        status,
        userId: parseInt(userId),
      })
      .returning();

    // Parse technologies back for response
    const projectWithParsedTech = {
      ...newProject[0],
      technologies: JSON.parse(newProject[0].technologies || '[]'),
    };

    return c.json({
      message: 'Project created successfully',
      data: projectWithParsedTech,
    }, 201);
  } catch (error: any) {
    console.error('Create project error:', error);
    return c.json({ 
      error: 'Failed to create project',
      details: error.message 
    }, 500);
  }
});

// Update project
router.put('/:id', async (c) => {
  try {
    const projectId = parseInt(c.req.param('id'));
    const { 
      title, 
      description, 
      content, 
      technologies, 
      demoUrl, 
      githubUrl, 
      status 
    } = await c.req.json();

    if (!projectId) {
      return c.json({ error: 'Project ID is required' }, 400);
    }

    // Check if project exists
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    if (technologies !== undefined) updateData.technologies = JSON.stringify(technologies);
    if (demoUrl !== undefined) updateData.demoUrl = demoUrl;
    if (githubUrl !== undefined) updateData.githubUrl = githubUrl;
    if (status !== undefined) updateData.status = status;

    const updatedProject = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning();

    // Parse technologies back for response
    const projectWithParsedTech = {
      ...updatedProject[0],
      technologies: JSON.parse(updatedProject[0].technologies || '[]'),
    };

    return c.json({
      message: 'Project updated successfully',
      data: projectWithParsedTech,
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    return c.json({ 
      error: 'Failed to update project',
      details: error.message 
    }, 500);
  }
});

// Upload project image
router.post('/:id/upload-image', async (c) => {
  try {
    const projectId = parseInt(c.req.param('id'));
    
    if (!projectId) {
      return c.json({ error: 'Project ID is required' }, 400);
    }

    // Check if project exists
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const project = existingProject[0];

    // Get file from request
    const body = await c.req.parseBody();
    const file = body['image'] as File;
    
    if (!file) {
      return c.json({ error: 'No image file provided' }, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400);
    }

    // Delete old image if exists
    if (project.imageKey) {
      try {
        await deleteFile(project.imageKey);
      } catch (error) {
        console.warn('Failed to delete old image:', error);
      }
    }

    // Convert File to Buffer
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);
    
    // Generate unique key for project image
    const fileKey = generateFileKey(`project-${projectId}-${file.name}`, project.userId);
    
    // Upload to S3
    const fileUrl = await uploadFile(fileKey, fileBuffer, file.type);
    
    // Update project with new image
    const updatedProject = await db
      .update(projects)
      .set({
        imageUrl: fileUrl,
        imageKey: fileKey,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    // Parse technologies back for response
    const projectWithParsedTech = {
      ...updatedProject[0],
      technologies: JSON.parse(updatedProject[0].technologies || '[]'),
    };

    return c.json({
      message: 'Project image uploaded successfully',
      data: projectWithParsedTech,
    });
  } catch (error: any) {
    console.error('Upload project image error:', error);
    return c.json({ 
      error: 'Failed to upload project image',
      details: error.message 
    }, 500);
  }
});

// Delete project
router.delete('/:id', async (c) => {
  try {
    const projectId = parseInt(c.req.param('id'));
    
    if (!projectId) {
      return c.json({ error: 'Project ID is required' }, 400);
    }

    // Check if project exists and get image key
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const project = existingProject[0];

    // Delete associated image from S3 if exists
    if (project.imageKey) {
      try {
        await deleteFile(project.imageKey);
      } catch (error) {
        console.warn('Failed to delete project image:', error);
      }
    }

    // Delete project from database
    await db.delete(projects).where(eq(projects.id, projectId));

    return c.json({
      message: 'Project deleted successfully',
      data: { id: projectId },
    });
  } catch (error: any) {
    console.error('Delete project error:', error);
    return c.json({ 
      error: 'Failed to delete project',
      details: error.message 
    }, 500);
  }
});

export default router;