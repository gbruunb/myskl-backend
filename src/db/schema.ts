import { pgTable, serial, text, varchar, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  lastname: text('lastname').notNull(),
  username: varchar('username', { length: 50 }).unique(),
  password: text('password'),
  email: text('email').unique(),
  googleId: text('google_id').unique(),
  authProvider: varchar('auth_provider', { length: 20 }).default('local'), // 'local' or 'google'
  role: varchar('role', { length: 20 }).default('user'), // 'user', 'admin'
  isActive: boolean('is_active').default(true), // For admin to enable/disable users
  profilePicture: text('profile_picture'), // URL for profile picture
  profilePictureKey: text('profile_picture_key'), // S3 key for uploaded images
  googleProfilePicture: text('google_profile_picture'), // Original Google profile picture URL
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  content: text('content'),
  imageUrl: text('image_url'),
  imageKey: text('image_key'), // S3 key for image management
  technologies: text('technologies'), // JSON string array
  demoUrl: text('demo_url'),
  githubUrl: text('github_url'),
  status: varchar('status', { length: 20 }).default('draft'), // draft, published, archived
  userId: integer('user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const skills = pgTable('skills', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: varchar('category', { length: 50 }).notNull(), // frontend, backend, tools, etc.
  level: integer('level').notNull().default(1), // 1-5 skill level
  description: text('description'),
  icon: text('icon'), // Font Awesome icon class
  color: varchar('color', { length: 20 }).default('#3B82F6'), // hex color for styling
  userId: integer('user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const connectionRequests = pgTable('connection_requests', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  receiverId: integer('receiver_id').references(() => users.id).notNull(),
  status: varchar('status', { length: 20 }).default('pending'), // pending, accepted, rejected
  message: text('message'), // Optional message when sending request
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const connections = pgTable('connections', {
  id: serial('id').primaryKey(),
  user1Id: integer('user1_id').references(() => users.id).notNull(),
  user2Id: integer('user2_id').references(() => users.id).notNull(),
  connectedAt: timestamp('connected_at').defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  user1Id: integer('user1_id').references(() => users.id).notNull(),
  user2Id: integer('user2_id').references(() => users.id).notNull(),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id).notNull(),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 20 }).default('text'), // text, image, file
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Skill roadmap templates
export const skillRoadmaps = pgTable('skill_roadmaps', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // e.g., "Frontend Web Development"
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull(),
  icon: text('icon').default('fas fa-code'),
  color: varchar('color', { length: 20 }).default('#3B82F6'),
  estimatedDuration: text('estimated_duration'), // e.g., "3-6 months"
  difficulty: varchar('difficulty', { length: 20 }).default('intermediate'), // beginner, intermediate, advanced
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tasks within a roadmap
export const roadmapTasks = pgTable('roadmap_tasks', {
  id: serial('id').primaryKey(),
  roadmapId: integer('roadmap_id').references(() => skillRoadmaps.id).notNull(),
  title: text('title').notNull(), // e.g., "HTML Fundamentals"
  description: text('description'),
  orderIndex: integer('order_index').notNull(), // To maintain task order
  estimatedHours: integer('estimated_hours'), // Time needed to complete
  resources: text('resources'), // JSON array of learning resources
  prerequisites: text('prerequisites'), // JSON array of prerequisite task IDs
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User's progress on roadmaps
export const userRoadmaps = pgTable('user_roadmaps', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  roadmapId: integer('roadmap_id').references(() => skillRoadmaps.id).notNull(),
  status: varchar('status', { length: 20 }).default('active'), // active, completed, paused
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User's progress on individual tasks
export const userTaskProgress = pgTable('user_task_progress', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  taskId: integer('task_id').references(() => roadmapTasks.id).notNull(),
  userRoadmapId: integer('user_roadmap_id').references(() => userRoadmaps.id).notNull(),
  status: varchar('status', { length: 20 }).default('pending'), // pending, in_progress, completed
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Certificates uploaded for tasks
export const taskCertificates = pgTable('task_certificates', {
  id: serial('id').primaryKey(),
  userTaskProgressId: integer('user_task_progress_id').references(() => userTaskProgress.id).notNull(),
  certificateName: text('certificate_name').notNull(),
  certificateUrl: text('certificate_url'), // S3 URL
  certificateKey: text('certificate_key'), // S3 key
  source: text('source'), // Where the certificate is from
  issueDate: timestamp('issue_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Projects submitted for tasks
export const taskProjects = pgTable('task_projects', {
  id: serial('id').primaryKey(),
  userTaskProgressId: integer('user_task_progress_id').references(() => userTaskProgress.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  githubUrl: text('github_url'),
  demoUrl: text('demo_url'),
  imageUrl: text('image_url'), // S3 URL
  imageKey: text('image_key'), // S3 key
  technologies: text('technologies'), // JSON string array
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Final projects for completed roadmaps
export const roadmapFinalProjects = pgTable('roadmap_final_projects', {
  id: serial('id').primaryKey(),
  userRoadmapId: integer('user_roadmap_id').references(() => userRoadmaps.id).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  githubUrl: text('github_url'),
  demoUrl: text('demo_url').notNull(), // Required for final project
  imageUrl: text('image_url'), // S3 URL
  imageKey: text('image_key'), // S3 key
  technologies: text('technologies'), // JSON string array of all technologies used
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
