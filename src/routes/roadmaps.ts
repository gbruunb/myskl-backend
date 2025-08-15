import { Hono } from 'hono';
import { db } from '../db/index.js';
import { 
  skillRoadmaps, 
  roadmapTasks, 
  userRoadmaps, 
  userTaskProgress, 
  taskCertificates, 
  taskProjects, 
  roadmapFinalProjects,
  projects
} from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import { uploadFile } from '../services/s3.js';

const roadmaps = new Hono();

// Get all available roadmaps
roadmaps.get('/', async (c) => {
  try {
    const roadmapsList = await db
      .select()
      .from(skillRoadmaps)
      .where(eq(skillRoadmaps.isActive, true))
      .orderBy(asc(skillRoadmaps.name));

    return c.json({
      success: true,
      data: roadmapsList
    });
  } catch (error) {
    console.error('Error fetching roadmaps:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch roadmaps'
    }, 500);
  }
});

// Get roadmap details with tasks
roadmaps.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const roadmap = await db
      .select()
      .from(skillRoadmaps)
      .where(eq(skillRoadmaps.id, parseInt(id)))
      .limit(1);

    if (roadmap.length === 0) {
      return c.json({
        success: false,
        message: 'Roadmap not found'
      }, 404);
    }

    const tasks = await db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, parseInt(id)))
      .orderBy(asc(roadmapTasks.orderIndex));

    return c.json({
      success: true,
      data: {
        ...roadmap[0],
        tasks
      }
    });
  } catch (error) {
    console.error('Error fetching roadmap details:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch roadmap details'
    }, 500);
  }
});

// Start a roadmap for a user
roadmaps.post('/:id/start', async (c) => {
  try {
    const id = c.req.param('id');
    const { userId } = await c.req.json();

    // Check if user already has this roadmap
    const existing = await db
      .select()
      .from(userRoadmaps)
      .where(
        and(
          eq(userRoadmaps.userId, userId),
          eq(userRoadmaps.roadmapId, parseInt(id))
        )
      );

    if (existing.length > 0) {
      return c.json({
        success: false,
        message: 'User already has this roadmap'
      }, 400);
    }

    // Create user roadmap
    const [userRoadmap] = await db
      .insert(userRoadmaps)
      .values({
        userId,
        roadmapId: parseInt(id)
      })
      .returning();

    // Get all tasks for this roadmap
    const tasks = await db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, parseInt(id)));

    // Create progress entries for all tasks
    const taskProgressEntries = tasks.map(task => ({
      userId,
      taskId: task.id,
      userRoadmapId: userRoadmap.id
    }));

    await db.insert(userTaskProgress).values(taskProgressEntries);

    return c.json({
      success: true,
      data: userRoadmap
    });
  } catch (error) {
    console.error('Error starting roadmap:', error);
    return c.json({
      success: false,
      message: 'Failed to start roadmap'
    }, 500);
  }
});

// Get user's roadmap progress
roadmaps.get('/users/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    const userRoadmapsData = await db
      .select({
        id: userRoadmaps.id,
        status: userRoadmaps.status,
        startedAt: userRoadmaps.startedAt,
        completedAt: userRoadmaps.completedAt,
        roadmapId: skillRoadmaps.id,
        roadmapName: skillRoadmaps.name,
        roadmapDescription: skillRoadmaps.description,
        roadmapIcon: skillRoadmaps.icon,
        roadmapColor: skillRoadmaps.color,
        estimatedDuration: skillRoadmaps.estimatedDuration,
        difficulty: skillRoadmaps.difficulty
      })
      .from(userRoadmaps)
      .leftJoin(skillRoadmaps, eq(userRoadmaps.roadmapId, skillRoadmaps.id))
      .where(eq(userRoadmaps.userId, parseInt(userId)))
      .orderBy(desc(userRoadmaps.createdAt));

    // Calculate progress percentage for each roadmap
    for (const roadmap of userRoadmapsData) {
      const totalTasks = await db
        .select()
        .from(roadmapTasks)
        .where(eq(roadmapTasks.roadmapId, roadmap.roadmapId!));

      const completedTasks = await db
        .select()
        .from(userTaskProgress)
        .where(
          and(
            eq(userTaskProgress.userRoadmapId, roadmap.id),
            eq(userTaskProgress.status, 'completed')
          )
        );

      const progressPercentage = totalTasks.length > 0 
        ? Math.round((completedTasks.length / totalTasks.length) * 100)
        : 0;

      (roadmap as any).progressPercentage = progressPercentage;
      (roadmap as any).completedTasks = completedTasks.length;
      (roadmap as any).totalTasks = totalTasks.length;
    }

    return c.json({
      success: true,
      data: userRoadmapsData
    });
  } catch (error) {
    console.error('Error fetching user roadmaps:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch user roadmaps'
    }, 500);
  }
});

// Get detailed progress for a specific user roadmap
roadmaps.get('/users/:userId/roadmaps/:roadmapId/progress', async (c) => {
  try {
    const userId = c.req.param('userId');
    const roadmapId = c.req.param('roadmapId');

    // Get user roadmap
    const [userRoadmap] = await db
      .select()
      .from(userRoadmaps)
      .where(
        and(
          eq(userRoadmaps.userId, parseInt(userId)),
          eq(userRoadmaps.roadmapId, parseInt(roadmapId))
        )
      );

    if (!userRoadmap) {
      return c.json({
        success: false,
        message: 'User roadmap not found'
      }, 404);
    }

    // Get all task progress with task details
    const taskProgress = await db
      .select({
        id: userTaskProgress.id,
        status: userTaskProgress.status,
        startedAt: userTaskProgress.startedAt,
        completedAt: userTaskProgress.completedAt,
        taskId: roadmapTasks.id,
        taskTitle: roadmapTasks.title,
        taskDescription: roadmapTasks.description,
        orderIndex: roadmapTasks.orderIndex,
        estimatedHours: roadmapTasks.estimatedHours,
        resources: roadmapTasks.resources,
        prerequisites: roadmapTasks.prerequisites
      })
      .from(userTaskProgress)
      .leftJoin(roadmapTasks, eq(userTaskProgress.taskId, roadmapTasks.id))
      .where(eq(userTaskProgress.userRoadmapId, userRoadmap.id))
      .orderBy(asc(roadmapTasks.orderIndex));

    // Get certificates and projects for each task
    for (const task of taskProgress) {
      const certificates = await db
        .select()
        .from(taskCertificates)
        .where(eq(taskCertificates.userTaskProgressId, task.id));

      const projects = await db
        .select()
        .from(taskProjects)
        .where(eq(taskProjects.userTaskProgressId, task.id));

      (task as any).certificates = certificates;
      (task as any).projects = projects;
    }

    // Get final project if exists
    const [finalProject] = await db
      .select()
      .from(roadmapFinalProjects)
      .where(eq(roadmapFinalProjects.userRoadmapId, userRoadmap.id));

    return c.json({
      success: true,
      data: {
        userRoadmap,
        taskProgress,
        finalProject
      }
    });
  } catch (error) {
    console.error('Error fetching roadmap progress:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch roadmap progress'
    }, 500);
  }
});

// Update task status
roadmaps.put('/task-progress/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    const updateData: any = { status };
    
    if (status === 'in_progress') {
      updateData.startedAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    await db
      .update(userTaskProgress)
      .set(updateData)
      .where(eq(userTaskProgress.id, parseInt(id)));

    return c.json({
      success: true,
      message: 'Task status updated'
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    return c.json({
      success: false,
      message: 'Failed to update task status'
    }, 500);
  }
});

// Add project for a task
roadmaps.post('/task-progress/:id/project', async (c) => {
  try {
    const id = c.req.param('id');
    const { title, description, githubUrl, demoUrl, technologies } = await c.req.json();

    const [project] = await db
      .insert(taskProjects)
      .values({
        userTaskProgressId: parseInt(id),
        title,
        description,
        githubUrl,
        demoUrl,
        technologies: JSON.stringify(technologies)
      })
      .returning();

    return c.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error adding task project:', error);
    return c.json({
      success: false,
      message: 'Failed to add project'
    }, 500);
  }
});

// Link existing project to a task
roadmaps.post('/task-progress/:id/link-project', async (c) => {
  try {
    const id = c.req.param('id');
    const { projectId } = await c.req.json();

    // Get the existing project details from projects table
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return c.json({
        success: false,
        message: 'Project not found'
      }, 404);
    }

    const project = existingProject[0];

    // Create a new task project record linking to the existing project
    const [taskProject] = await db
      .insert(taskProjects)
      .values({
        userTaskProgressId: parseInt(id),
        title: project.title,
        description: project.description,
        githubUrl: project.githubUrl,
        demoUrl: project.demoUrl,
        technologies: project.technologies
      })
      .returning();

    return c.json({
      success: true,
      data: taskProject
    });
  } catch (error) {
    console.error('Error linking existing project:', error);
    return c.json({
      success: false,
      message: 'Failed to link existing project'
    }, 500);
  }
});

// Submit final project
roadmaps.post('/user-roadmaps/:id/final-project', async (c) => {
  try {
    const id = c.req.param('id');
    const { title, description, githubUrl, demoUrl, technologies } = await c.req.json();

    const [finalProject] = await db
      .insert(roadmapFinalProjects)
      .values({
        userRoadmapId: parseInt(id),
        title,
        description,
        githubUrl,
        demoUrl,
        technologies: JSON.stringify(technologies)
      })
      .returning();

    // Update user roadmap status to completed
    await db
      .update(userRoadmaps)
      .set({
        status: 'completed',
        completedAt: new Date()
      })
      .where(eq(userRoadmaps.id, parseInt(id)));

    return c.json({
      success: true,
      data: finalProject
    });
  } catch (error) {
    console.error('Error submitting final project:', error);
    return c.json({
      success: false,
      message: 'Failed to submit final project'
    }, 500);
  }
});

export default roadmaps;