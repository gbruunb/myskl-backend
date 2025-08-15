import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { redis, pubClient, subClient } from './redis.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { conversations, messages } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface AuthenticatedSocket extends SocketIOServer {
  userId?: number;
  userInfo?: {
    id: number;
    name: string;
    lastname: string;
  };
}

let io: SocketIOServer;

// Store online users
const onlineUsers = new Map<number, string>(); // userId -> socketId

// Initialize database connection
const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);
const db = drizzle(sql);

export function initializeSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://myskl.unbgbru.in.th",
        "https://bemyskl.unbgbru.in.th",
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
      ],
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["Content-Type"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', async (socket: any) => {
    console.log('👤 User connected:', socket.id);

    // Authentication - user must send auth data when connecting
    socket.on('authenticate', async (data: { userId: number; userInfo: any }) => {
      try {
        socket.userId = data.userId;
        socket.userInfo = data.userInfo;
        
        // Store in online users
        onlineUsers.set(data.userId, socket.id);
        
        // Cache user session in Redis
        if (redis.isReady) {
          await redis.setEx(`user:${data.userId}:session`, 3600, JSON.stringify({
            socketId: socket.id,
            lastSeen: Date.now(),
            status: 'online',
            userInfo: data.userInfo
          }));
        }

        // Join user to their personal room
        socket.join(`user:${data.userId}`);
        
        // Notify user is online
        socket.broadcast.emit('user-online', { 
          userId: data.userId, 
          userInfo: data.userInfo 
        });

        console.log(`✅ User authenticated: ${data.userInfo.name} (${data.userId})`);
        
        socket.emit('authenticated', { success: true });
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('auth-error', { message: 'Authentication failed' });
      }
    });

    // Join conversation room
    socket.on('join-conversation', (conversationId: number) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      socket.join(`conversation:${conversationId}`);
      console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);
    });

    // Leave conversation room  
    socket.on('leave-conversation', (conversationId: number) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`👋 User ${socket.userId} left conversation ${conversationId}`);
    });

    // Send message
    socket.on('send-message', async (data: {
      conversationId: number;
      content: string;
      receiverId: number;
    }) => {
      try {
        if (!socket.userId || !socket.userInfo) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Save message to database first
        const savedMessage = await db
          .insert(messages)
          .values({
            conversationId: data.conversationId,
            senderId: socket.userId,
            content: data.content,
            messageType: 'text',
            isRead: false,
          })
          .returning();

        // Update conversation's last message time
        await db
          .update(conversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversations.id, data.conversationId));

        // Create message object for socket emission
        const message = {
          id: savedMessage[0].id,
          conversationId: data.conversationId,
          senderId: socket.userId,
          senderInfo: socket.userInfo,
          content: data.content,
          timestamp: savedMessage[0].createdAt,
          createdAt: savedMessage[0].createdAt,
          isRead: false
        };

        // Emit to conversation room
        io.to(`conversation:${data.conversationId}`).emit('new-message', message);
        
        // Send notification to receiver (whether online or offline)
        const receiverSocket = Array.from(io.sockets.sockets.values())
          .find(s => (s as any).userId === data.receiverId);
        
        if (receiverSocket) {
          // If receiver is online but not in the conversation room, send notification
          if (!receiverSocket.rooms.has(`conversation:${data.conversationId}`)) {
            io.to(`user:${data.receiverId}`).emit('message-notification', {
              ...message,
              preview: data.content.substring(0, 50) + (data.content.length > 50 ? '...' : '')
            });
          }
          // If receiver is in the conversation room, they already got the message via conversation room
        } else {
          // Receiver is offline - message is already saved in database
          // They will see it when they come back online and load messages
          console.log(`📱 Message sent to offline user ${data.receiverId}`);
        }

        // NOTE: Redis pub/sub disabled to prevent duplicate messages
        // Uncomment when scaling to multiple server instances
        // if (pubClient.isReady) {
        //   await pubClient.publish('chat:message', JSON.stringify(message));
        // }

        console.log(`💬 Message sent in conversation ${data.conversationId} by user ${socket.userId}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (data: { conversationId: number; isTyping: boolean }) => {
      if (!socket.userId || !socket.userInfo) return;
      
      socket.to(`conversation:${data.conversationId}`).emit('user-typing', {
        userId: socket.userId,
        userInfo: socket.userInfo,
        isTyping: data.isTyping
      });
    });

    // Mark messages as read
    socket.on('mark-read', async (data: { conversationId: number; messageIds: number[] }) => {
      try {
        if (!socket.userId) return;
        
        // Emit to conversation that messages were read
        socket.to(`conversation:${data.conversationId}`).emit('messages-read', {
          conversationId: data.conversationId,
          readByUserId: socket.userId,
          messageIds: data.messageIds
        });
      } catch (error) {
        console.error('Mark read error:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      if (socket.userId) {
        // Remove from online users
        onlineUsers.delete(socket.userId);
        
        // Update Redis session
        if (redis.isReady) {
          await redis.del(`user:${socket.userId}:session`);
        }
        
        // Notify user is offline
        socket.broadcast.emit('user-offline', { 
          userId: socket.userId,
          userInfo: socket.userInfo 
        });
        
        console.log(`👋 User ${socket.userId} disconnected`);
      }
      console.log('🔌 Socket disconnected:', socket.id);
    });
  });

  // NOTE: Redis pub/sub disabled to prevent duplicate messages
  // Uncomment when scaling to multiple server instances
  // if (subClient.isReady) {
  //   subClient.subscribe('chat:message', (message) => {
  //     try {
  //       const data = JSON.parse(message);
  //       // Re-emit message to all connected sockets
  //       io.to(`conversation:${data.conversationId}`).emit('new-message', data);
  //     } catch (error) {
  //       console.error('Redis pub/sub error:', error);
  //     }
  //   });
  // }

  console.log('🚀 Socket.IO server initialized');
  return io;
}

// Helper functions
export function getOnlineUsers(): Map<number, string> {
  return onlineUsers;
}

export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId);
}

export function getSocketIO(): SocketIOServer {
  return io;
}

export { io };