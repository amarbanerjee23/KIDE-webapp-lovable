CREATE TABLE public.release_approvals (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id text NOT NULL CHECK (char_length(candidate_id) BETWEEN 1 AND 160),
  candidate_name text NOT NULL CHECK (char_length(candidate_name) BETWEEN 1 AND 160),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  graph_assistance jsonb,
  graph_synthesis_inputs jsonb,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX release_approvals_approved_at_idx
  ON public.release_approvals(approved_at DESC);
