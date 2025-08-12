import { createClient } from 'redis';

// Create Redis client
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Handle connection events
client.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

client.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

client.on('ready', () => {
  console.log('✅ Redis client ready');
});

// Connect to Redis
async function connectRedis() {
  try {
    await client.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // For development, continue without Redis
    console.log('⚠️ Continuing without Redis (chat features may be limited)');
  }
}

// Pub/Sub client (Redis requires separate client for pub/sub)
const pubClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const subClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Connect pub/sub clients
async function connectPubSub() {
  try {
    await Promise.all([
      pubClient.connect(),
      subClient.connect()
    ]);
  } catch (error) {
    console.error('Failed to connect pub/sub Redis clients:', error);
  }
}

export { client as redis, pubClient, subClient, connectRedis, connectPubSub };