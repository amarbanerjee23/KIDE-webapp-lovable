CREATE TYPE public.app_role AS ENUM ('owner', 'administrator', 'engineer', 'reviewer', 'viewer');
CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'in_review', 'approved', 'released', 'archived');

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  job_title text,
  preferences jsonb NOT NULL DEFAULT '{"density":"compact","theme":"dark"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_roles TO authenticated;
GRANT ALL ON public.organization_roles TO service_role;
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_organization_role(_organization_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_roles
    WHERE organization_id = _organization_id
      AND user_id = auth.uid()
      AND role = ANY(_roles)
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, public.app_role[]) TO authenticated;

CREATE POLICY "organizations_member_read" ON public.organizations FOR SELECT TO authenticated USING (public.has_organization_role(id, ARRAY['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));
CREATE POLICY "organizations_create" ON public.organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "organizations_admin_update" ON public.organizations FOR UPDATE TO authenticated USING (public.has_organization_role(id, ARRAY['owner','administrator']::public.app_role[]));
CREATE POLICY "organizations_owner_delete" ON public.organizations FOR DELETE TO authenticated USING (public.has_organization_role(id, ARRAY['owner']::public.app_role[]));
CREATE POLICY "organization_roles_member_read" ON public.organization_roles FOR SELECT TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));
CREATE POLICY "organization_roles_admin_insert" ON public.organization_roles FOR INSERT TO authenticated WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','administrator']::public.app_role[]));
CREATE POLICY "organization_roles_admin_update" ON public.organization_roles FOR UPDATE TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator']::public.app_role[]));
CREATE POLICY "organization_roles_admin_delete" ON public.organization_roles FOR DELETE TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.create_organization(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.organizations(name, slug, created_by) VALUES (_name, _slug, auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.organization_roles(organization_id, user_id, role) VALUES (_id, auth.uid(), 'owner');
  RETURN _id;
END
$$;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '',
  status public.project_status NOT NULL DEFAULT 'draft',
  current_stage smallint NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 7),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_member_read" ON public.projects FOR SELECT TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));
CREATE POLICY "projects_engineer_insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer']::public.app_role[]));
CREATE POLICY "projects_engineer_update" ON public.projects FOR UPDATE TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer']::public.app_role[]));
CREATE POLICY "projects_admin_delete" ON public.projects FOR DELETE TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator']::public.app_role[]));
CREATE INDEX projects_organization_idx ON public.projects(organization_id, updated_at DESC);

CREATE TABLE public.model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  model_kind text NOT NULL CHECK (model_kind IN ('intent','knowledge','capability','activity','mnc','scenario')),
  source_text text NOT NULL DEFAULT '',
  model_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, model_kind, version)
);
GRANT SELECT, INSERT ON public.model_versions TO authenticated;
GRANT ALL ON public.model_versions TO service_role;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_versions_member_read" ON public.model_versions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::public.app_role[])));
CREATE POLICY "model_versions_engineer_insert" ON public.model_versions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer']::public.app_role[])));
CREATE INDEX model_versions_project_idx ON public.model_versions(project_id, model_kind, version DESC);

CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  change_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_member_read" ON public.audit_events FOR SELECT TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::public.app_role[]));
CREATE POLICY "audit_actor_insert" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND public.has_organization_role(organization_id, ARRAY['owner','administrator','engineer','reviewer']::public.app_role[]));
CREATE INDEX audit_events_scope_idx ON public.audit_events(organization_id, project_id, created_at DESC);