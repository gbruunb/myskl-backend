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
import roadmaps from './routes/roadmaps.js'
import admin from './routes/admin.js'
import { initializeBucket } from './services/s3.js'
import { connectRedis, connectPubSub } from './utils/redis.js'
import { initializeSocket } from './utils/socket.js'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173', 
      'http://127.0.0.1:5173',
      'https://myskl.unbgbru.in.th',
      'https://bemyskl.unbgbru.in.th',
      'http://myskl-backend-hhizi7-b66d3d-45-154-24-202.traefik.me',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
    ],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Handle OPTIONS for all routes
app.options('*', (c) => {
  console.log('OPTIONS request received:', c.req.url)
  return new Response(null, { status: 204 })
})

// Also handle at root level
app.all('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    console.log('CORS preflight for:', c.req.url)
    return new Response(null, { status: 204 })
  }
  await next()
})

app.route('/api', users)
app.route('/api/files', files)
app.route('/api/projects', projects)
app.route('/api/skills', skills)
app.route('/api/chat', chat)
app.route('/api/roadmaps', roadmaps)
app.route('/api/admin', admin)

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
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:5173');
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
      const request = new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers: req.headers as any,
        body: hasBody ? req : undefined,
        duplex: hasBody ? 'half' : undefined,
      } as any);
      
      const responsePromise = app.fetch(request) as Promise<Response>;
      responsePromise.then((response: Response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
        if (response.body) {
          const reader = response.body.getReader()
          const pump = () => {
            reader.read().then((result) => {
              if (result.done) {
                res.end()
                return
              }
              res.write(result.value)
              pump()
            })
          }
          pump()
        } else {
          res.end()
        }
      }).catch((error: any) => {
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
