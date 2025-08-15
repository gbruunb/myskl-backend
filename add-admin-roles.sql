-- Add admin role and user management columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create an admin user (password: admin123)
-- Note: Replace with actual admin credentials in production
INSERT INTO users (name, lastname, username, email, password, auth_provider, role) 
VALUES (
  'Admin', 
  'User', 
  'admin', 
  'admin@myskl.com', 
  '$2b$10$K7L/8Y2IgFZB0PXD2zQA5eF.qJZ9X2VrCJvK0q7YmJ8J.mV6H0K4a', -- admin123 hashed
  'local', 
  'admin'
) ON CONFLICT (username) DO NOTHING;

-- Update existing first user to be admin if no admin exists
UPDATE users 
SET role = 'admin' 
WHERE id = 1 AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');