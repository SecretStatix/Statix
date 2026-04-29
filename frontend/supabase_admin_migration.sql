-- Run this in your Supabase SQL Editor on the existing database.
-- Adds an is_admin flag to profiles. Defaults to FALSE; flip the flag to TRUE
-- for any user who should see the /admin page.
--
-- Read access is already covered by the existing
-- "Users can read own profile" SELECT policy on profiles.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Example: grant admin to a specific user (replace the email).
-- UPDATE profiles SET is_admin = TRUE WHERE email = 'you@example.com';
