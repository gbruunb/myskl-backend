import { uploadFile, generatePresignedUploadUrl, initializeBucket } from './src/services/s3.ts';

async function testS3() {
  try {
    console.log('🧪 Testing MinIO S3 setup...');
    
    // Initialize bucket
    await initializeBucket();
    
    // Test file upload
    const testContent = Buffer.from('Hello MinIO! This is a test file.', 'utf8');
    const testKey = 'test/hello-world.txt';
    
    console.log('📤 Uploading test file...');
    const fileUrl = await uploadFile(testKey, testContent, 'text/plain');
    console.log('✓ File uploaded successfully:', fileUrl);
    
    // Test presigned URL generation
    console.log('🔗 Generating presigned URL...');
    const presignedUrl = await generatePresignedUploadUrl('test/presigned-test.txt', 'text/plain');
    console.log('✓ Presigned URL generated successfully:', presignedUrl);
    
    console.log('🎉 All tests passed!');
    console.log('📝 MinIO Console: http://localhost:9001');
    console.log('🔑 Login: minioadmin / minioadmin123');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testS3();