import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, or, desc, asc, ne } from 'drizzle-orm';
import { conversations, messages, users } from '../db/schema.js';

const router = new Hono();

// Initialize database connection
const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);
const db = drizzle(sql);

// Get or create conversation between two users
router.post('/conversations', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received conversation request:', body);
    
    const { user1Id, user2Id } = body;

    if (!user1Id || !user2Id) {
      console.log('Missing user IDs:', { user1Id, user2Id });
      return c.json({ error: 'Both user IDs are required' }, 400);
    }

    if (user1Id === user2Id) {
      return c.json({ error: 'Cannot create conversation with yourself' }, 400);
    }

    // Check if conversation already exists (either direction)
    console.log('Checking for existing conversation between users:', user1Id, 'and', user2Id);
    let existingConversation = await db
      .select()
      .from(conversations)
      .where(
        or(
          and(eq(conversations.user1Id, user1Id), eq(conversations.user2Id, user2Id)),
          and(eq(conversations.user1Id, user2Id), eq(conversations.user2Id, user1Id))
        )
      )
      .limit(1);

    console.log('Existing conversation found:', existingConversation);

    if (existingConversation.length > 0) {
      return c.json({
        success: true,
        conversation: existingConversation[0]
      });
    }

    // Create new conversation
    console.log('Creating new conversation');
    const newConversation = await db
      .insert(conversations)
      .values({
        user1Id: Math.min(user1Id, user2Id), // Ensure consistent ordering
        user2Id: Math.max(user1Id, user2Id),
      })
      .returning();

    console.log('New conversation created:', newConversation[0]);

    return c.json({
      success: true,
      conversation: newConversation[0]
    });

  } catch (error: any) {
    console.error('Create conversation error:', error);
    console.error('Error stack:', error.stack);
    return c.json({ 
      error: 'Failed to create conversation',
      details: error.message 
    }, 500);
  }
});

// Get user's conversations with last message info
router.get('/conversations/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Get conversations where user is participant
    const userConversations = await db
      .select({
        id: conversations.id,
        user1Id: conversations.user1Id,
        user2Id: conversations.user2Id,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        or(
          eq(conversations.user1Id, userId),
          eq(conversations.user2Id, userId)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));

    // For each conversation, get the other user's info and last message
    const conversationsWithDetails = await Promise.all(
      userConversations.map(async (conv) => {
        // Determine other user ID
        const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

        // Get other user's info
        const otherUser = await db
          .select({
            id: users.id,
            name: users.name,
            lastname: users.lastname,
            username: users.username,
            profilePicture: users.profilePicture,
            googleProfilePicture: users.googleProfilePicture,
          })
          .from(users)
          .where(eq(users.id, otherUserId))
          .limit(1);

        // Get last message
        const lastMessage = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        // Get unread message count
        const unreadCount = await db
          .select({ count: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conv.id),
              eq(messages.isRead, false),
              eq(messages.senderId, otherUserId) // Only count messages from other user
            )
          );

        return {
          ...conv,
          otherUser: otherUser[0] || null,
          lastMessage: lastMessage[0] || null,
          unreadCount: unreadCount.length
        };
      })
    );

    return c.json({
      success: true,
      conversations: conversationsWithDetails
    });

  } catch (error: any) {
    console.error('Get conversations error:', error);
    return c.json({ error: 'Failed to get conversations' }, 500);
  }
});

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', async (c) => {
  try {
    const conversationId = parseInt(c.req.param('conversationId'));
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    if (!conversationId) {
      return c.json({ error: 'Conversation ID is required' }, 400);
    }

    // Get messages with sender info
    const conversationMessages = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        messageType: messages.messageType,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        senderName: users.name,
        senderLastname: users.lastname,
        senderUsername: users.username,
        senderProfilePicture: users.profilePicture,
        senderGoogleProfilePicture: users.googleProfilePicture,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    // Reverse to show oldest first
    conversationMessages.reverse();

    return c.json({
      success: true,
      messages: conversationMessages,
      page,
      hasMore: conversationMessages.length === limit
    });

  } catch (error: any) {
    console.error('Get messages error:', error);
    return c.json({ error: 'Failed to get messages' }, 500);
  }
});

// Send a message (also handled via Socket.IO, but this is for HTTP fallback)
router.post('/messages', async (c) => {
  try {
    const { conversationId, senderId, content, messageType = 'text' } = await c.req.json();

    if (!conversationId || !senderId || !content?.trim()) {
      return c.json({ error: 'Conversation ID, sender ID, and content are required' }, 400);
    }

    // Verify conversation exists and user is participant
    const conversation = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          or(
            eq(conversations.user1Id, senderId),
            eq(conversations.user2Id, senderId)
          )
        )
      )
      .limit(1);

    if (conversation.length === 0) {
      return c.json({ error: 'Conversation not found or access denied' }, 404);
    }

    // Insert message
    const newMessage = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content: content.trim(),
        messageType,
      })
      .returning();

    // Update conversation's last message time
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // Get sender info for response
    const sender = await db
      .select({
        id: users.id,
        name: users.name,
        lastname: users.lastname,
        username: users.username,
        profilePicture: users.profilePicture,
        googleProfilePicture: users.googleProfilePicture,
      })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    const messageWithSender = {
      ...newMessage[0],
      sender: sender[0] || null
    };

    return c.json({
      success: true,
      message: messageWithSender
    });

  } catch (error: any) {
    console.error('Send message error:', error);
    return c.json({ error: 'Failed to send message' }, 500);
  }
});

// Mark messages as read
router.put('/messages/read', async (c) => {
  try {
    const { conversationId, userId } = await c.req.json();

    if (!conversationId || !userId) {
      return c.json({ error: 'Conversation ID and user ID are required' }, 400);
    }

    // Mark all unread messages from other users in this conversation as read
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.isRead, false),
          ne(messages.senderId, userId) // Mark messages NOT from current user (from other user) as read
        )
      );

    return c.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error: any) {
    console.error('Mark read error:', error);
    return c.json({ error: 'Failed to mark messages as read' }, 500);
  }
});

// Get unread message count for a user
router.get('/unread-count/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Get all conversations for this user
    const userConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        or(
          eq(conversations.user1Id, userId),
          eq(conversations.user2Id, userId)
        )
      );

    let totalUnread = 0;

    // Count unread messages in each conversation
    for (const conv of userConversations) {
      // Get the conversation details to determine the other user
      const conversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conv.id))
        .limit(1);

      if (conversation.length === 0) continue;

      const otherUserId = conversation[0].user1Id === userId 
        ? conversation[0].user2Id 
        : conversation[0].user1Id;

      const unreadMessages = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conv.id),
            eq(messages.isRead, false),
            // Only count messages sent by OTHER user (not current user)
            eq(messages.senderId, otherUserId)
          )
        );

      totalUnread += unreadMessages.length;
    }

    return c.json({
      success: true,
      unreadCount: totalUnread
    });

  } catch (error: any) {
    console.error('Get unread count error:', error);
    return c.json({ error: 'Failed to get unread count' }, 500);
  }
});

export default router;