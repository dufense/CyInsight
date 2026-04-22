-- Add missing columns to the existing users table
-- The original 0000 migration created users without auth-related columns.
-- Migration 0023 used CREATE TABLE IF NOT EXISTS, so the table was never recreated.
-- This migration adds the missing columns idempotently.

-- Add username column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        ALTER TABLE users ADD COLUMN username varchar(100);
    END IF;
END $$;

-- Add password_hash column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ADD COLUMN password_hash varchar(255);
    END IF;
END $$;

-- Add mfa_enabled column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mfa_enabled'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_enabled boolean DEFAULT false;
    END IF;
END $$;

-- Add mfa_secret column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mfa_secret'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_secret varchar(255);
    END IF;
END $$;

-- Add sso_provider column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'sso_provider'
    ) THEN
        ALTER TABLE users ADD COLUMN sso_provider varchar(50);
    END IF;
END $$;

-- Add sso_external_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'sso_external_id'
    ) THEN
        ALTER TABLE users ADD COLUMN sso_external_id varchar(255);
    END IF;
END $$;

-- Add phone_number column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'phone_number'
    ) THEN
        ALTER TABLE users ADD COLUMN phone_number varchar(30);
    END IF;
END $$;

-- Add unique constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_email_unique' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE(email);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_username_unique' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE(username);
    END IF;
END $$;
