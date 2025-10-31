-- Migration: Create console_profiles table
-- Replaces previous attempts to define console profiles or related user structures.

-- Drop table if it exists to ensure a clean slate (optional, but good for starting fresh)
DROP TABLE IF EXISTS public.console_profiles;

-- Create the console_profiles table
CREATE TABLE public.console_profiles (
    id SERIAL PRIMARY KEY, -- Use SERIAL for auto-incrementing integer ID
    title TEXT NOT NULL UNIQUE, -- Make title unique as it seems to be used as an identifier
    username TEXT NOT NULL UNIQUE, -- Make username unique for login
    password TEXT NOT NULL, -- Store hashed passwords in a real app, TEXT for now
    region TEXT NOT NULL CHECK (region IN ('West', 'Central', 'East')),
    -- Store configured seasons as JSONB array. Supabase handles JSON well.
    -- Each object in the array should match the ConfiguredSeason type.
    seasons JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.console_profiles ENABLE ROW LEVEL SECURITY;

-- Policies:
-- Allow authenticated users to read all console profiles (needed for login checks etc.)
-- Adjust this if more specific read restrictions are needed.
CREATE POLICY "Allow authenticated read access"
ON public.console_profiles
FOR SELECT
TO authenticated
USING (true);

-- Allow ONLY the user themselves (or an admin role later) to update their profile?
-- For now, let's restrict updates heavily. Business Panel might need broader rights.
-- Consider creating an 'admin' role in Supabase later for management.
CREATE POLICY "Allow individual users to update their own profile (Placeholder)"
ON public.console_profiles
FOR UPDATE
TO authenticated
USING (false); -- Placeholder: Restrict updates for now.

-- Allow creating new profiles (e.g., from Business Panel) - Placeholder
CREATE POLICY "Allow profile creation (Placeholder)"
ON public.console_profiles
FOR INSERT
TO authenticated
WITH CHECK (false); -- Placeholder: Restrict inserts for now.

-- Add function and trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_console_profiles_timestamp
BEFORE UPDATE ON public.console_profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Add comments for clarity
COMMENT ON TABLE public.console_profiles IS 'Stores login and configuration profiles for Console users.';
COMMENT ON COLUMN public.console_profiles.seasons IS 'JSONB array storing ConfiguredSeason objects, including enabled status, payout logic, and enabled upsells.';
COMMENT ON COLUMN public.console_profiles.password IS 'Stores user password. Should be hashed in production.';