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
