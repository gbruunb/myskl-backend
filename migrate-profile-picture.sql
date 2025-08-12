-- Migration to add profile picture support
-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_profile_picture text;