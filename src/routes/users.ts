import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, connectionRequests, connections } from '../db/schema.js';
import { getGoogleAuthUrl, getGoogleUserInfo, generateJWT } from '../config/google-auth.js';
import { uploadFile, deleteFile, generateFileKey, getFileUrl } from '../services/s3.js';

const router = new Hono();

// Google Auth - Get auth URL
router.get('/auth/google', async (c) => {
  try {
    const authUrl = getGoogleAuthUrl();
    return c.json({ authUrl });
  } catch (error) {
    return c.json({ error: 'Google OAuth not configured' }, 500);
  }
});

// Google Auth - Handle callback
router.post('/auth/google/callback', async (c) => {
  try {
    const { code } = await c.req.json();

    if (!code) {
      return c.json({ error: 'Authorization code is required' }, 400);
    }

    // Get user info from Google
    const googleUser = await getGoogleUserInfo(code);

    if (!googleUser.email || !googleUser.id) {
      return c.json({ error: 'Failed to get user information from Google' }, 400);
    }

    // Check if user exists
    let existingUser = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.googleId, googleUser.id),
          eq(users.email, googleUser.email!)
        )
      );

    let user;
    
    if (existingUser.length > 0) {
      // Update existing user with Google info if not already set
      user = existingUser[0];
      if (!user.googleId) {
        await db
          .update(users)
          .set({
            googleId: googleUser.id,
            authProvider: 'google',
            profilePicture: googleUser.picture || null,
            googleProfilePicture: googleUser.picture || null,
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));
      } else if (googleUser.picture && user.googleProfilePicture !== googleUser.picture) {
        // Update Google profile picture if it has changed
        const updateData: any = {
          googleProfilePicture: googleUser.picture,
          updatedAt: new Date()
        };
        
        // If user doesn't have a custom profile picture, also update the main profile picture
        if (!user.profilePictureKey) {
          updateData.profilePicture = googleUser.picture;
        }
        
        await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, user.id));
        
        user.googleProfilePicture = googleUser.picture;
        if (!user.profilePictureKey) {
          user.profilePicture = googleUser.picture;
        }
      }
    } else {
      // Create new user
      const newUserData = {
        name: googleUser.given_name || googleUser.name || 'Unknown',
        lastname: googleUser.family_name || 'User',
        email: googleUser.email!,
        googleId: googleUser.id,
        authProvider: 'google' as const,
        profilePicture: googleUser.picture || null,
        googleProfilePicture: googleUser.picture || null,
      };

      const newUser = await db
        .insert(users)
        .values(newUserData)
        .returning({
          id: users.id,
          name: users.name,
          lastname: users.lastname,
          username: users.username,
          email: users.email,
          authProvider: users.authProvider,
          profilePicture: users.profilePicture,
          googleProfilePicture: users.googleProfilePicture,
          createdAt: users.createdAt,
        });

      user = newUser[0];
    }

    // Generate JWT token
    const token = generateJWT(user);

    // Return user data and token
    const userData = {
      id: user.id,
      name: user.name,
      lastname: user.lastname,
      username: user.username,
      email: user.email,
      authProvider: user.authProvider,
      profilePicture: user.profilePicture,
      googleProfilePicture: user.googleProfilePicture,
    };

    return c.json({
      message: 'Google login successful',
      user: userData,
      token
    });

  } catch (error) {
    console.error('Google auth callback error:', error);
    return c.json({ error: 'Google authentication failed' }, 500);
  }
});

// Register endpoint
router.post('/register', async (c) => {
  try {
    const { name, lastname, username, password } = await c.req.json();

    // Validate required fields
    if (!name || !lastname || !username || !password) {
      return c.json({ error: 'All fields are required' }, 400);
    }

    // Check if username already exists
    const existingUser = await db.select().from(users).where(eq(users.username, username));
    if (existingUser.length > 0) {
      return c.json({ error: 'Username already exists' }, 409);
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await db.insert(users).values({
      name,
      lastname,
      username,
      password: hashedPassword,
    }).returning({
      id: users.id,
      name: users.name,
      lastname: users.lastname,
      username: users.username,
      email: users.email,
      authProvider: users.authProvider,
      profilePicture: users.profilePicture,
      profilePictureKey: users.profilePictureKey,
      googleProfilePicture: users.googleProfilePicture,
      createdAt: users.createdAt,
    });

    return c.json({ 
      message: 'User registered successfully', 
      user: newUser[0] 
    }, 201);
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Login endpoint
router.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    // Validate required fields
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    // Find user by username
    const user = await db.select().from(users).where(eq(users.username, username));
    if (user.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user[0].password);
    if (!isPasswordValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Return user data (without password)
    const userData = {
      id: user[0].id,
      name: user[0].name,
      lastname: user[0].lastname,
      username: user[0].username,
      email: user[0].email,
      authProvider: user[0].authProvider,
      profilePicture: user[0].profilePicture,
      profilePictureKey: user[0].profilePictureKey,
      googleProfilePicture: user[0].googleProfilePicture,
    };

    return c.json({ 
      message: 'Login successful', 
      user: userData 
    });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update user profile
router.put('/profile/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const { name, lastname, username } = await c.req.json();

    // Validate required fields
    if (!name || !lastname) {
      return c.json({ error: 'Name and lastname are required' }, 400);
    }

    // Prepare update data
    const updateData: any = {
      name,
      lastname,
      updatedAt: new Date()
    };

    // If username is provided, validate and include it
    if (username !== undefined) {
      if (!username.trim()) {
        return c.json({ error: 'Username cannot be empty' }, 400);
      }

      // Check if username is already taken by another user
      if (username.trim()) {
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.username, username.trim()));
        
        if (existingUser.length > 0 && existingUser[0].id !== userId) {
          return c.json({ error: 'Username is already taken' }, 409);
        }
      }

      updateData.username = username.trim();
    }

    // Update user profile
    const updatedUser = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        lastname: users.lastname,
        username: users.username,
        email: users.email,
        authProvider: users.authProvider,
        profilePicture: users.profilePicture,
        profilePictureKey: users.profilePictureKey,
        googleProfilePicture: users.googleProfilePicture,
        updatedAt: users.updatedAt,
      });

    if (updatedUser.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      message: 'Profile updated successfully',
      user: updatedUser[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Upload profile picture
router.post('/profile-picture/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const body = await c.req.parseBody();
    const file = body['profilePicture'] as File;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'Only image files are allowed' }, 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 5MB' }, 400);
    }

    // Get current user to check if they have an existing profile picture
    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (currentUser.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Delete old profile picture from S3 if exists
    if (currentUser[0].profilePictureKey) {
      try {
        await deleteFile(currentUser[0].profilePictureKey);
      } catch (error) {
        console.warn('Failed to delete old profile picture:', error);
      }
    }

    // Generate unique file key for the new image
    const fileKey = generateFileKey(`profile-picture.${file.type.split('/')[1]}`, userId);
    
    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to S3
    const fileUrl = await uploadFile(fileKey, buffer, file.type);

    // Update user record with new profile picture
    const updatedUser = await db
      .update(users)
      .set({
        profilePicture: fileUrl,
        profilePictureKey: fileKey,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        lastname: users.lastname,
        username: users.username,
        email: users.email,
        authProvider: users.authProvider,
        profilePicture: users.profilePicture,
        profilePictureKey: users.profilePictureKey,
        googleProfilePicture: users.googleProfilePicture,
        updatedAt: users.updatedAt,
      });

    if (updatedUser.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      message: 'Profile picture updated successfully',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Profile picture upload error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete profile picture
router.delete('/profile-picture/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));

    // Get current user
    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (currentUser.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Delete profile picture from S3 if exists
    if (currentUser[0].profilePictureKey) {
      try {
        await deleteFile(currentUser[0].profilePictureKey);
      } catch (error) {
        console.warn('Failed to delete profile picture from S3:', error);
      }
    }

    // Update user record to remove profile picture
    const updatedUser = await db
      .update(users)
      .set({
        profilePicture: null,
        profilePictureKey: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        lastname: users.lastname,
        username: users.username,
        email: users.email,
        authProvider: users.authProvider,
        profilePicture: users.profilePicture,
        profilePictureKey: users.profilePictureKey,
        googleProfilePicture: users.googleProfilePicture,
        updatedAt: users.updatedAt,
      });

    return c.json({
      message: 'Profile picture deleted successfully',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Profile picture deletion error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Revert to Google profile picture
router.put('/profile-picture/revert-google/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));

    // Get current user
    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (currentUser.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = currentUser[0];

    // Check if user has Google profile picture
    if (!user.googleProfilePicture) {
      return c.json({ error: 'No Google profile picture available' }, 400);
    }

    // Delete current uploaded profile picture from S3 if exists
    if (user.profilePictureKey) {
      try {
        await deleteFile(user.profilePictureKey);
      } catch (error) {
        console.warn('Failed to delete current profile picture from S3:', error);
      }
    }

    // Update user record to use Google profile picture
    const updatedUser = await db
      .update(users)
      .set({
        profilePicture: user.googleProfilePicture,
        profilePictureKey: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        lastname: users.lastname,
        username: users.username,
        email: users.email,
        authProvider: users.authProvider,
        profilePicture: users.profilePicture,
        profilePictureKey: users.profilePictureKey,
        googleProfilePicture: users.googleProfilePicture,
        updatedAt: users.updatedAt,
      });

    return c.json({
      message: 'Reverted to Google profile picture successfully',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Revert to Google profile picture error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Change password
router.put('/change-password/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const { currentPassword, newPassword } = await c.req.json();

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current password and new password are required' }, 400);
    }

    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters long' }, 400);
    }

    // Get current user
    const user = await db.select().from(users).where(eq(users.id, userId));
    if (user.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user[0].password);
    if (!isCurrentPasswordValid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db
      .update(users)
      .set({ 
        password: hashedNewPassword,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return c.json({ message: 'Password changed successfully' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Search users
router.get('/search', async (c) => {
  try {
    const query = c.req.query('q');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = (page - 1) * limit;

    if (!query || query.trim().length < 2) {
      return c.json({ 
        users: [], 
        total: 0, 
        page, 
        totalPages: 0 
      });
    }

    const searchTerm = `%${query.trim()}%`;
    
    // Search users by name, lastname, or username
    const searchResults = await db.select({
      id: users.id,
      name: users.name,
      lastname: users.lastname,
      username: users.username,
      profilePicture: users.profilePicture,
      googleProfilePicture: users.googleProfilePicture,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      or(
        sql`${users.name} ILIKE ${searchTerm}`,
        sql`${users.lastname} ILIKE ${searchTerm}`,
        sql`${users.username} ILIKE ${searchTerm}`,
        sql`CONCAT(${users.name}, ' ', ${users.lastname}) ILIKE ${searchTerm}`
      )
    )
    .limit(limit)
    .offset(offset);

    // Get total count for pagination
    const totalResult = await db.select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(
      or(
        sql`${users.name} ILIKE ${searchTerm}`,
        sql`${users.lastname} ILIKE ${searchTerm}`,
        sql`${users.username} ILIKE ${searchTerm}`,
        sql`CONCAT(${users.name}, ' ', ${users.lastname}) ILIKE ${searchTerm}`
      )
    );

    const total = totalResult[0].count;
    const totalPages = Math.ceil(total / limit);

    return c.json({
      users: searchResults,
      total,
      page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });

  } catch (error) {
    console.error('User search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

// Get public profile by user ID
router.get('/profile/:id', async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    
    if (isNaN(userId)) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    const userProfile = await db.select({
      id: users.id,
      name: users.name,
      lastname: users.lastname,
      username: users.username,
      email: users.email,
      authProvider: users.authProvider,
      profilePicture: users.profilePicture,
      googleProfilePicture: users.googleProfilePicture,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

    if (userProfile.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: userProfile[0] });

  } catch (error) {
    console.error('Get public profile error:', error);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

// Get all users (for testing - remove in production)
router.get('/users', async (c) => {
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    lastname: users.lastname,
    username: users.username,
    createdAt: users.createdAt,
  }).from(users);
  return c.json(allUsers);
});

// Contact form submission
router.post('/contact', async (c) => {
  try {
    const { name, email, subject, message } = await c.req.json();

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return c.json({ error: 'All fields are required' }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Log the contact form submission (in a real app, you'd save to database or send email)
    console.log('Contact form submission:', {
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      timestamp: new Date().toISOString()
    });

    // Here you would typically:
    // 1. Save to a contacts table in your database
    // 2. Send an email notification to yourself
    // 3. Send a confirmation email to the sender
    // 4. Integrate with services like SendGrid, Mailgun, etc.

    // For now, we'll just return success
    return c.json({ 
      success: true, 
      message: 'Thank you for your message! We\'ll get back to you soon.' 
    });

  } catch (error) {
    console.error('Contact form error:', error);
    return c.json({ error: 'Failed to send message. Please try again.' }, 500);
  }
});

// Send connection request
router.post('/connections/request', async (c) => {
  try {
    const { senderId, receiverId, message } = await c.req.json();

    if (!senderId || !receiverId) {
      return c.json({ error: 'Sender ID and Receiver ID are required' }, 400);
    }

    if (senderId === receiverId) {
      return c.json({ error: 'Cannot send connection request to yourself' }, 400);
    }

    // Check if receiver exists
    const receiver = await db.select().from(users).where(eq(users.id, receiverId));
    if (receiver.length === 0) {
      return c.json({ error: 'Receiver not found' }, 404);
    }

    // Check if they're already connected
    const existingConnection = await db.select().from(connections)
      .where(
        or(
          sql`(${connections.user1Id} = ${senderId} AND ${connections.user2Id} = ${receiverId})`,
          sql`(${connections.user1Id} = ${receiverId} AND ${connections.user2Id} = ${senderId})`
        )
      );

    if (existingConnection.length > 0) {
      return c.json({ error: 'Already connected with this user' }, 409);
    }

    // Check if there's already a pending request
    const existingRequest = await db.select().from(connectionRequests)
      .where(
        or(
          sql`(${connectionRequests.senderId} = ${senderId} AND ${connectionRequests.receiverId} = ${receiverId} AND ${connectionRequests.status} = 'pending')`,
          sql`(${connectionRequests.senderId} = ${receiverId} AND ${connectionRequests.receiverId} = ${senderId} AND ${connectionRequests.status} = 'pending')`
        )
      );

    if (existingRequest.length > 0) {
      return c.json({ error: 'Connection request already exists' }, 409);
    }

    // Create connection request
    const newRequest = await db.insert(connectionRequests).values({
      senderId,
      receiverId,
      message: message?.trim() || null,
      status: 'pending'
    }).returning();

    return c.json({
      success: true,
      message: 'Connection request sent successfully',
      request: newRequest[0]
    });

  } catch (error) {
    console.error('Send connection request error:', error);
    return c.json({ error: 'Failed to send connection request' }, 500);
  }
});

// Accept connection request
router.put('/connections/accept/:requestId', async (c) => {
  try {
    const requestId = parseInt(c.req.param('requestId'));
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Find the connection request
    const request = await db.select().from(connectionRequests)
      .where(eq(connectionRequests.id, requestId));

    if (request.length === 0) {
      return c.json({ error: 'Connection request not found' }, 404);
    }

    const connectionRequest = request[0];

    // Verify that the user is the receiver
    if (connectionRequest.receiverId !== userId) {
      return c.json({ error: 'Unauthorized to accept this request' }, 403);
    }

    if (connectionRequest.status !== 'pending') {
      return c.json({ error: 'Request is not pending' }, 400);
    }

    // Create connection (user with smaller ID becomes user1)
    const user1Id = Math.min(connectionRequest.senderId, connectionRequest.receiverId);
    const user2Id = Math.max(connectionRequest.senderId, connectionRequest.receiverId);

    await db.insert(connections).values({
      user1Id,
      user2Id
    });

    // Update request status
    await db.update(connectionRequests)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(connectionRequests.id, requestId));

    return c.json({
      success: true,
      message: 'Connection request accepted successfully'
    });

  } catch (error) {
    console.error('Accept connection request error:', error);
    return c.json({ error: 'Failed to accept connection request' }, 500);
  }
});

// Reject connection request
router.put('/connections/reject/:requestId', async (c) => {
  try {
    const requestId = parseInt(c.req.param('requestId'));
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Find the connection request
    const request = await db.select().from(connectionRequests)
      .where(eq(connectionRequests.id, requestId));

    if (request.length === 0) {
      return c.json({ error: 'Connection request not found' }, 404);
    }

    const connectionRequest = request[0];

    // Verify that the user is the receiver
    if (connectionRequest.receiverId !== userId) {
      return c.json({ error: 'Unauthorized to reject this request' }, 403);
    }

    if (connectionRequest.status !== 'pending') {
      return c.json({ error: 'Request is not pending' }, 400);
    }

    // Update request status
    await db.update(connectionRequests)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(connectionRequests.id, requestId));

    return c.json({
      success: true,
      message: 'Connection request rejected successfully'
    });

  } catch (error) {
    console.error('Reject connection request error:', error);
    return c.json({ error: 'Failed to reject connection request' }, 500);
  }
});

// Get connection requests for a user
router.get('/connections/requests/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const type = c.req.query('type') || 'received'; // received, sent, all

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    let whereCondition;
    if (type === 'received') {
      whereCondition = eq(connectionRequests.receiverId, userId);
    } else if (type === 'sent') {
      whereCondition = eq(connectionRequests.senderId, userId);
    } else {
      whereCondition = or(
        eq(connectionRequests.receiverId, userId),
        eq(connectionRequests.senderId, userId)
      );
    }

    const requests = await db.select({
      id: connectionRequests.id,
      senderId: connectionRequests.senderId,
      receiverId: connectionRequests.receiverId,
      status: connectionRequests.status,
      message: connectionRequests.message,
      createdAt: connectionRequests.createdAt,
      senderName: users.name,
      senderLastname: users.lastname,
      senderUsername: users.username,
      senderProfilePicture: users.profilePicture,
    })
    .from(connectionRequests)
    .innerJoin(users, eq(users.id, connectionRequests.senderId))
    .where(whereCondition)
    .orderBy(sql`${connectionRequests.createdAt} DESC`);

    return c.json({ requests });

  } catch (error) {
    console.error('Get connection requests error:', error);
    return c.json({ error: 'Failed to fetch connection requests' }, 500);
  }
});

// Get user's connections
router.get('/connections/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userConnections = await db.select({
      id: connections.id,
      connectedAt: connections.connectedAt,
      connectedUserId: sql<number>`CASE WHEN ${connections.user1Id} = ${userId} THEN ${connections.user2Id} ELSE ${connections.user1Id} END`,
      connectedUserName: users.name,
      connectedUserLastname: users.lastname,
      connectedUserUsername: users.username,
      connectedUserProfilePicture: users.profilePicture,
    })
    .from(connections)
    .innerJoin(users, sql`${users.id} = CASE WHEN ${connections.user1Id} = ${userId} THEN ${connections.user2Id} ELSE ${connections.user1Id} END`)
    .where(
      or(
        eq(connections.user1Id, userId),
        eq(connections.user2Id, userId)
      )
    )
    .orderBy(sql`${connections.connectedAt} DESC`);

    return c.json({ connections: userConnections });

  } catch (error) {
    console.error('Get connections error:', error);
    return c.json({ error: 'Failed to fetch connections' }, 500);
  }
});

// Check connection status between two users
router.get('/connections/status/:userId/:otherUserId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));
    const otherUserId = parseInt(c.req.param('otherUserId'));

    if (!userId || !otherUserId) {
      return c.json({ error: 'Both user IDs are required' }, 400);
    }

    if (userId === otherUserId) {
      return c.json({ status: 'self' });
    }

    // Check if connected
    const connection = await db.select().from(connections)
      .where(
        or(
          sql`(${connections.user1Id} = ${userId} AND ${connections.user2Id} = ${otherUserId})`,
          sql`(${connections.user1Id} = ${otherUserId} AND ${connections.user2Id} = ${userId})`
        )
      );

    if (connection.length > 0) {
      return c.json({ status: 'connected', connectionId: connection[0].id });
    }

    // Check for pending requests
    const pendingRequest = await db.select().from(connectionRequests)
      .where(
        sql`((${connectionRequests.senderId} = ${userId} AND ${connectionRequests.receiverId} = ${otherUserId}) OR 
            (${connectionRequests.senderId} = ${otherUserId} AND ${connectionRequests.receiverId} = ${userId})) 
            AND ${connectionRequests.status} = 'pending'`
      );

    if (pendingRequest.length > 0) {
      const request = pendingRequest[0];
      if (request.senderId === userId) {
        return c.json({ status: 'request_sent', requestId: request.id });
      } else {
        return c.json({ status: 'request_received', requestId: request.id });
      }
    }

    return c.json({ status: 'not_connected' });

  } catch (error) {
    console.error('Check connection status error:', error);
    return c.json({ error: 'Failed to check connection status' }, 500);
  }
});

// Disconnect from another user
router.delete('/connections/disconnect', async (c) => {
  try {
    const { userId, otherUserId } = await c.req.json();

    if (!userId || !otherUserId) {
      return c.json({ error: 'Both user IDs are required' }, 400);
    }

    if (userId === otherUserId) {
      return c.json({ error: 'Cannot disconnect from yourself' }, 400);
    }

    // Find and delete the connection
    const deletedConnection = await db.delete(connections)
      .where(
        or(
          sql`(${connections.user1Id} = ${userId} AND ${connections.user2Id} = ${otherUserId})`,
          sql`(${connections.user1Id} = ${otherUserId} AND ${connections.user2Id} = ${userId})`
        )
      )
      .returning();

    if (deletedConnection.length === 0) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    return c.json({
      success: true,
      message: 'Successfully disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
});

export default router;
