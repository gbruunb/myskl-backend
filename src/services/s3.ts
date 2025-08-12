import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import 'dotenv/config';

// S3 Client Configuration
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin123',
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'uploads';

// Initialize bucket if it doesn't exist and set public read policy
export async function initializeBucket(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`✓ S3 bucket '${BUCKET_NAME}' already exists`);
  } catch (error: any) {
    if (error.name === 'NotFound') {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`✓ S3 bucket '${BUCKET_NAME}' created successfully`);
      } catch (createError) {
        console.error('Failed to create S3 bucket:', createError);
        throw createError;
      }
    } else {
      console.error('Error checking S3 bucket:', error);
      throw error;
    }
  }

  // Set bucket policy for public read access
  try {
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
        },
      ],
    };

    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify(bucketPolicy),
      })
    );
    console.log(`✓ S3 bucket '${BUCKET_NAME}' public read policy applied`);
  } catch (policyError) {
    console.warn('Warning: Failed to set bucket policy (this is normal for some MinIO setups):', policyError);
  }
}

// Upload file to S3
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string = 'application/octet-stream'
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    
    // Return the file URL
    return `${process.env.S3_ENDPOINT}/${BUCKET_NAME}/${key}`;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
}

// Generate signed URL for file upload
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned upload URL:', error);
    throw error;
  }
}

// Generate signed URL for file download
export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned download URL:', error);
    throw error;
  }
}

// Delete file from S3
export async function deleteFile(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`✓ File '${key}' deleted from S3`);
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw error;
  }
}

// Get file URL (for public files)
export function getFileUrl(key: string): string {
  return `${process.env.S3_ENDPOINT}/${BUCKET_NAME}/${key}`;
}

// Generate unique file key
export function generateFileKey(originalName: string, userId?: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const extension = originalName.split('.').pop();
  const baseName = originalName.split('.').slice(0, -1).join('.');
  
  if (userId) {
    return `users/${userId}/${timestamp}-${random}-${baseName}.${extension}`;
  }
  
  return `uploads/${timestamp}-${random}-${baseName}.${extension}`;
}