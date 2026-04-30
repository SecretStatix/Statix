-- Replace "Admins can read all profiles" EXISTS(subquery on profiles) with a
-- SECURITY DEFINER helper. A subquery on the same table under RLS can recurse
-- or fail evaluation so the client sees zero rows — then is_approved is read
-- as false and users stay on /pending despite being approved in the table.
--
-- Safe to run after 20260429_admin_read_all_profiles_rls.sql (drops that policy).

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.auth_profile_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.auth_profile_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_profile_is_admin() TO authenticated;

CREATE POLICY "Admins can read all profiles"
    ON public.profiles FOR SELECT
    USING (public.auth_profile_is_admin());
