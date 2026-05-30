-- members policies referenced members again → infinite recursion.
-- SELECT: own rows only. INSERT: no NOT EXISTS subquery (UNIQUE handles dupes).

CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.members WHERE user_id = auth.uid();
$$;

ALTER FUNCTION public.user_workspace_ids() SET row_security = off;

DROP POLICY IF EXISTS members_select_workspace ON members;
DROP POLICY IF EXISTS members_select_own ON members;
CREATE POLICY members_select_own ON members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS members_insert_demo ON members;
CREATE POLICY members_insert_demo ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IN (SELECT id FROM workspaces WHERE slug = 'coria-demo')
  );
