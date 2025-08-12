-- Migration: Add connection request and connections tables
-- Created: 2025-08-11
-- Description: Adds LinkedIn-style connection functionality

-- Create connection_requests table
CREATE TABLE IF NOT EXISTS "connection_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"receiver_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Create connections table
CREATE TABLE IF NOT EXISTS "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user1_id" integer NOT NULL,
	"user2_id" integer NOT NULL,
	"connected_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_user1_id_users_id_fk" FOREIGN KEY ("user1_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_connection_requests_receiver_status" ON "connection_requests" ("receiver_id", "status");
CREATE INDEX IF NOT EXISTS "idx_connection_requests_sender_status" ON "connection_requests" ("sender_id", "status");
CREATE INDEX IF NOT EXISTS "idx_connections_user1" ON "connections" ("user1_id");
CREATE INDEX IF NOT EXISTS "idx_connections_user2" ON "connections" ("user2_id");

-- Ensure unique connection pairs (prevent duplicate connections)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_connections" ON "connections" ("user1_id", "user2_id");