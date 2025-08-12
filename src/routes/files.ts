import { Hono } from 'hono';
import multer from 'multer';
import { uploadFile, generatePresignedUploadUrl, generatePresignedDownloadUrl, deleteFile, getFileUrl, generateFileKey } from '../services/s3.js';

const router = new Hono();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed') as any, false);
    }
  },
});

// Direct file upload endpoint
router.post('/upload', async (c) => {
  try {
    // Note: In a real Hono app, you'd need to use a different approach for file uploads
    // This is a simplified example. You might want to use hono/middleware for multipart
    
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Convert File to Buffer
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);
    
    // Generate unique key
    const fileKey = generateFileKey(file.name);
    
    // Upload to S3
    const fileUrl = await uploadFile(fileKey, fileBuffer, file.type);
    
    return c.json({
      message: 'File uploaded successfully',
      data: {
        key: fileKey,
        url: fileUrl,
        originalName: file.name,
        size: file.size,
        contentType: file.type,
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return c.json({ 
      error: 'Upload failed',
      details: error.message 
    }, 500);
  }
});

// Generate presigned URL for direct upload to S3
router.post('/presigned-upload-url', async (c) => {
  try {
    const { fileName, contentType, userId } = await c.req.json();
    
    if (!fileName || !contentType) {
      return c.json({ 
        error: 'fileName and contentType are required' 
      }, 400);
    }
    
    // Generate unique key
    const fileKey = generateFileKey(fileName, userId);
    
    // Generate presigned URL
    const presignedUrl = await generatePresignedUploadUrl(fileKey, contentType);
    
    return c.json({
      message: 'Presigned URL generated successfully',
      data: {
        presignedUrl,
        fileKey,
        expiresIn: 3600, // 1 hour
      }
    });
  } catch (error: any) {
    console.error('Presigned URL generation error:', error);
    return c.json({ 
      error: 'Failed to generate presigned URL',
      details: error.message 
    }, 500);
  }
});

// Generate presigned URL for download
router.post('/presigned-download-url', async (c) => {
  try {
    const { fileKey } = await c.req.json();
    
    if (!fileKey) {
      return c.json({ error: 'fileKey is required' }, 400);
    }
    
    const presignedUrl = await generatePresignedDownloadUrl(fileKey);
    
    return c.json({
      message: 'Presigned download URL generated successfully',
      data: {
        presignedUrl,
        expiresIn: 3600, // 1 hour
      }
    });
  } catch (error: any) {
    console.error('Presigned download URL generation error:', error);
    return c.json({ 
      error: 'Failed to generate presigned download URL',
      details: error.message 
    }, 500);
  }
});

// Get file URL (for public access)
router.get('/url/:fileKey', async (c) => {
  try {
    const fileKey = c.req.param('fileKey');
    
    if (!fileKey) {
      return c.json({ error: 'fileKey is required' }, 400);
    }
    
    const fileUrl = getFileUrl(fileKey);
    
    return c.json({
      message: 'File URL retrieved successfully',
      data: {
        url: fileUrl,
        key: fileKey,
      }
    });
  } catch (error: any) {
    console.error('Get file URL error:', error);
    return c.json({ 
      error: 'Failed to get file URL',
      details: error.message 
    }, 500);
  }
});

// Delete file
router.delete('/:fileKey', async (c) => {
  try {
    const fileKey = c.req.param('fileKey');
    
    if (!fileKey) {
      return c.json({ error: 'fileKey is required' }, 400);
    }
    
    await deleteFile(fileKey);
    
    return c.json({
      message: 'File deleted successfully',
      data: {
        key: fileKey,
      }
    });
  } catch (error: any) {
    console.error('Delete file error:', error);
    return c.json({ 
      error: 'Failed to delete file',
      details: error.message 
    }, 500);
  }
});

export default router;