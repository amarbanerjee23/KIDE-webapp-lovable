CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'administrator', 'engineer', 'reviewer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'in_review', 'approved', 'released', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  job_title text,
  preferences jsonb NOT NULL DEFAULT '{"density":"compact","theme":"dark"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.projects (
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
CREATE INDEX IF NOT EXISTS projects_organization_idx ON public.projects(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.model_versions (
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
CREATE INDEX IF NOT EXISTS model_versions_project_idx ON public.model_versions(project_id, model_kind, version DESC);

CREATE TABLE IF NOT EXISTS public.audit_events (
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
CREATE INDEX IF NOT EXISTS audit_events_scope_idx ON public.audit_events(organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_org_idx ON public.invitations(organization_id);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations(lower(email));

CREATE TABLE IF NOT EXISTS public.model_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_checkpoints_project_idx ON public.model_checkpoints(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  design_fingerprint text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_requests_project_idx ON public.review_requests(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  anchor text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_comments_review_idx ON public.review_comments(review_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  processor text NOT NULL DEFAULT 'hyperswitch',
  processor_payment_id text UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;

ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organization_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.model_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.model_checkpoints DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments DISABLE ROW LEVEL SECURITY;
