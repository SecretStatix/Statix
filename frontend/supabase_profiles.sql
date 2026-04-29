-- Run this in your Supabase SQL Editor
-- Creates a profiles table that auto-populates when a user signs up

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    date_of_birth DATE,
    is_approved BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    nda_accepted BOOLEAN DEFAULT FALSE,
    nda_accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read their own profile
CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Only service role (backend/admin) can update profiles
CREATE POLICY "Service role can update profiles"
    ON profiles FOR UPDATE
    USING (true);

-- Allow inserts from the trigger function
CREATE POLICY "Allow trigger inserts"
    ON profiles FOR INSERT
    WITH CHECK (true);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username, first_name, last_name, date_of_birth, nda_accepted, nda_accepted_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', ''),
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        CASE
            WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL
            THEN (NEW.raw_user_meta_data->>'date_of_birth')::date
            ELSE NULL
        END,
        COALESCE((NEW.raw_user_meta_data->>'nda_accepted')::boolean, false),
        CASE
            WHEN NEW.raw_user_meta_data->>'nda_accepted_at' IS NOT NULL
            THEN (NEW.raw_user_meta_data->>'nda_accepted_at')::timestamptz
            ELSE NULL
        END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
