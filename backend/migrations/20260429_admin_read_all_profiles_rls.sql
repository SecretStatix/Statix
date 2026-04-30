-- Allow users with is_admin = true to SELECT all rows on public.profiles.
-- Without this, the client Supabase query on /admin only returns the caller's
-- own row ("Users can read own profile"), so the Activity panel cannot list
-- every account.
--
-- Run in Supabase SQL Editor (or your migration runner) after reviewing.

CREATE POLICY "Admins can read all profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles AS self
            WHERE self.id = auth.uid()
              AND COALESCE(self.is_admin, false) = true
        )
    );
