-- Invitations to join an organization
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_org_idx ON public.invitations(organization_id);
CREATE INDEX invitations_email_idx ON public.invitations(lower(email));

GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_admin_read ON public.invitations FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','administrator']::app_role[]));
CREATE POLICY invitations_admin_insert ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid() AND public.has_organization_role(organization_id, ARRAY['owner','administrator']::app_role[]));
CREATE POLICY invitations_admin_update ON public.invitations FOR UPDATE TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','administrator']::app_role[]));

-- Named model checkpoints
CREATE TABLE public.model_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_checkpoints_project_idx ON public.model_checkpoints(project_id, created_at DESC);
GRANT SELECT, INSERT ON public.model_checkpoints TO authenticated;
GRANT ALL ON public.model_checkpoints TO service_role;
ALTER TABLE public.model_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY model_checkpoints_member_read ON public.model_checkpoints FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::app_role[])));
CREATE POLICY model_checkpoints_engineer_insert ON public.model_checkpoints FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer']::app_role[])));

-- Review requests and comments
CREATE TABLE public.review_requests (
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
CREATE INDEX review_requests_project_idx ON public.review_requests(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.review_requests TO authenticated;
GRANT ALL ON public.review_requests TO service_role;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_requests_member_read ON public.review_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::app_role[])));
CREATE POLICY review_requests_engineer_insert ON public.review_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer']::app_role[])));
CREATE POLICY review_requests_reviewer_update ON public.review_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','reviewer']::app_role[])));

CREATE TABLE public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  anchor text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_comments_review_idx ON public.review_comments(review_id, created_at);
GRANT SELECT, INSERT ON public.review_comments TO authenticated;
GRANT ALL ON public.review_comments TO service_role;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_comments_member_read ON public.review_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.review_requests r JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = review_id AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer','reviewer','viewer']::app_role[])));
CREATE POLICY review_comments_member_insert ON public.review_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.review_requests r JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = review_id AND public.has_organization_role(p.organization_id, ARRAY['owner','administrator','engineer','reviewer']::app_role[])));

-- Notifications
CREATE TABLE public.notifications (
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
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());