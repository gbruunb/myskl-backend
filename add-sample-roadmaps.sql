-- Insert Frontend Web Development Roadmap
INSERT INTO skill_roadmaps (name, description, category, icon, color, estimated_duration, difficulty, is_active) 
VALUES (
  'Frontend Web Development',
  'Master modern frontend development with HTML, CSS, JavaScript, and popular frameworks. Build beautiful, responsive, and interactive web applications.',
  'frontend',
  'fab fa-react',
  '#61DAFB',
  '4-6 months',
  'beginner',
  true
);

-- Get the ID of the roadmap we just inserted
-- Note: This assumes the roadmap ID will be 1 for the first insert

-- Insert tasks for Frontend Web Development Roadmap
INSERT INTO roadmap_tasks (roadmap_id, title, description, order_index, estimated_hours, resources, prerequisites) VALUES
(1, 'HTML Fundamentals', 'Learn the basics of HTML including semantic elements, forms, tables, and accessibility best practices.', 1, 20, '["MDN HTML Guide", "HTML5 specification", "Accessibility guidelines"]', '[]'),
(1, 'CSS Fundamentals', 'Master CSS styling, layouts, flexbox, grid, animations, and responsive design principles.', 2, 30, '["CSS MDN Documentation", "Flexbox Guide", "CSS Grid Guide", "Responsive Design Patterns"]', '[1]'),
(1, 'JavaScript Fundamentals', 'Learn JavaScript basics, DOM manipulation, events, async programming, and ES6+ features.', 3, 40, '["JavaScript MDN Guide", "You Don''t Know JS", "JavaScript30 course"]', '[2]'),
(1, 'CSS Framework (Bootstrap/Tailwind)', 'Learn a popular CSS framework to speed up development and create consistent designs.', 4, 15, '["Bootstrap Documentation", "Tailwind CSS Documentation"]', '[3]'),
(1, 'Component Library (DaisyUI)', 'Learn to use component libraries to build beautiful UIs faster with pre-built components.', 5, 10, '["DaisyUI Documentation", "Component Design Patterns"]', '[4]'),
(1, 'Modern Framework (Svelte/React)', 'Master a modern JavaScript framework for building dynamic, component-based applications.', 6, 50, '["Svelte Tutorial", "React Documentation", "Component Lifecycle"]', '[5]');

-- Insert Backend Development Roadmap
INSERT INTO skill_roadmaps (name, description, category, icon, color, estimated_duration, difficulty, is_active) 
VALUES (
  'Backend Development with Node.js',
  'Learn server-side development with Node.js, Express.js, databases, APIs, and deployment strategies.',
  'backend',
  'fab fa-node-js',
  '#339933',
  '3-5 months',
  'intermediate',
  true
);

-- Insert tasks for Backend Development Roadmap
INSERT INTO roadmap_tasks (roadmap_id, title, description, order_index, estimated_hours, resources, prerequisites) VALUES
(2, 'Node.js Fundamentals', 'Learn Node.js runtime, modules, file system, and core concepts for server-side development.', 1, 25, '["Node.js Documentation", "Node.js Best Practices"]', '[]'),
(2, 'Express.js Framework', 'Master Express.js for building RESTful APIs, middleware, routing, and error handling.', 2, 30, '["Express.js Documentation", "RESTful API Design"]', '[1]'),
(2, 'Database Integration', 'Learn to work with databases (PostgreSQL/MongoDB), ORMs, and data modeling.', 3, 35, '["PostgreSQL Tutorial", "MongoDB University", "Drizzle ORM Documentation"]', '[2]'),
(2, 'Authentication & Security', 'Implement user authentication, authorization, JWT, password hashing, and security best practices.', 4, 25, '["JWT Guide", "OWASP Security Guidelines", "Passport.js Documentation"]', '[3]'),
(2, 'API Testing & Documentation', 'Learn to test APIs, write documentation, and implement proper error handling.', 5, 20, '["Jest Documentation", "Swagger/OpenAPI", "API Testing Best Practices"]', '[4]'),
(2, 'Deployment & DevOps', 'Deploy applications, set up CI/CD, containerization, and monitoring.', 6, 30, '["Docker Documentation", "GitHub Actions", "Deployment Guides"]', '[5]');

-- Insert Full Stack Development Roadmap
INSERT INTO skill_roadmaps (name, description, category, icon, color, estimated_duration, difficulty, is_active) 
VALUES (
  'Full Stack Web Development',
  'Complete web development journey covering both frontend and backend technologies, databases, and deployment.',
  'fullstack',
  'fas fa-layer-group',
  '#FF6B6B',
  '6-9 months',
  'advanced',
  true
);

-- Insert tasks for Full Stack Development Roadmap
INSERT INTO roadmap_tasks (roadmap_id, title, description, order_index, estimated_hours, resources, prerequisites) VALUES
(3, 'Web Development Foundations', 'Master HTML, CSS, and JavaScript fundamentals for web development.', 1, 50, '["MDN Web Docs", "JavaScript30", "CSS Grid & Flexbox"]', '[]'),
(3, 'Frontend Framework Mastery', 'Learn a modern frontend framework (React/Vue/Svelte) and state management.', 2, 60, '["React Documentation", "Vue.js Guide", "Svelte Tutorial", "State Management Patterns"]', '[1]'),
(3, 'Backend API Development', 'Build RESTful APIs with Node.js/Express or Python/Django and implement authentication.', 3, 55, '["Express.js Guide", "API Design Best Practices", "Authentication Patterns"]', '[2]'),
(3, 'Database Design & Management', 'Learn database design, SQL/NoSQL, ORMs, and data relationships.', 4, 40, '["Database Design Fundamentals", "SQL Tutorial", "MongoDB University"]', '[3]'),
(3, 'Full Stack Integration', 'Connect frontend and backend, handle real-time features, and optimize performance.', 5, 45, '["WebSocket Tutorial", "Performance Optimization", "Full Stack Architecture"]', '[4]'),
(3, 'Production Deployment', 'Deploy full stack applications, set up monitoring, and implement DevOps practices.', 6, 35, '["AWS/Vercel Deployment", "Docker Containerization", "CI/CD Pipelines"]', '[5]');