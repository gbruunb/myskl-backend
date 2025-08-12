import { serve } from '@hono/node-server'
import { createServer } from 'http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import 'dotenv/config'
import users from './routes/users.js'
import files from './routes/files.js'
import projects from './routes/projects.js'
import skills from './routes/skills.js'
import chat from './routes/chat.js'
import { initializeBucket } from './services/s3.js'
import { connectRedis, connectPubSub } from './utils/redis.js'
import { initializeSocket } from './utils/socket.js'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/api', users)
app.route('/api/files', files)
app.route('/api/projects', projects)
app.route('/api/skills', skills)
app.route('/api/chat', chat)

// Initialize services and start server
async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  try {
    // Initialize S3
    await initializeBucket()
    console.log('✓ S3 service initialized')

    // Initialize Redis
    await connectRedis()
    await connectPubSub()
    console.log('✓ Redis services initialized')

    // Create HTTP server with proper request handling
    const server = createServer((req, res) => {
      // Set CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Handle request with Hono
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      app.fetch(new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers: req.headers as any,
        body: hasBody ? req : undefined,
        duplex: hasBody ? 'half' : undefined,
      } as any)).then((response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
        if (response.body) {
          const reader = response.body.getReader()
          const pump = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                res.end()
                return
              }
              res.write(value)
              pump()
            })
          }
          pump()
        } else {
          res.end()
        }
      }).catch((error) => {
        console.error('Request handling error:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      });
    });
    
    // Initialize Socket.IO after server creation
    const io = initializeSocket(server)

    // Start server
    server.listen(port, () => {
      console.log(`🚀 Server is running on http://localhost:${port}`)
      console.log(`🔌 Socket.IO is ready for real-time connections`)
      console.log(`📦 MinIO Console: http://localhost:9001`)
    })

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
