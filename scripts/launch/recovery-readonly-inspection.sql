-- Execute ONLY via a verified Cloud SQL Auth Proxy bound to the new isolated
-- recovery instance, using a SELECT-only PostgreSQL account.
-- Example: psql -X -v ON_ERROR_STOP=1 -v known_project_id='<uuid>'
--          -f scripts/launch/recovery-readonly-inspection.sql
-- Do not connect to production; never dump emails, passwords or model sources.
\set ON_ERROR_STOP on
\if :{?known_project_id}
\else
  \echo 'Missing known_project_id from operator-reviewed production recovery point'
  \quit 1
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT
  (to_regclass('public.user') IS NOT NULL) AS auth_user_table,
  (to_regclass('public.session') IS NOT NULL) AS auth_session_table,
  (to_regclass('public.account') IS NOT NULL) AS auth_account_table,
  (to_regclass('public.verification') IS NOT NULL) AS auth_verification_table,
  (to_regclass('public.organizations') IS NOT NULL) AS organizations_table,
  (to_regclass('public.projects') IS NOT NULL) AS projects_table,
  (to_regclass('public.model_checkpoints') IS NOT NULL) AS checkpoints_table;

SELECT
  EXISTS (SELECT 1 FROM public."user") AS recovered_auth_user_present,
  EXISTS (SELECT 1 FROM public.organizations) AS recovered_organization_present,
  EXISTS (SELECT 1 FROM public.projects p
          JOIN public.organizations o ON o.id = p.organization_id
          WHERE p.id = :'known_project_id'::uuid) AS known_project_and_org_recovered,
  NOT EXISTS (
    SELECT 1 FROM public.model_checkpoints
    WHERE label = '__kide_working_copy__'
    GROUP BY project_id HAVING count(*) > 1
  ) AS no_duplicate_internal_working_copies
\gset

\if :recovered_auth_user_present
\else
  \echo 'RECOVERY REJECTED: no restored Better Auth user'
  \quit 1
\endif
\if :recovered_organization_present
\else
  \echo 'RECOVERY REJECTED: no restored organization'
  \quit 1
\endif
\if :known_project_and_org_recovered
\else
  \echo 'RECOVERY REJECTED: expected historical organization/project not recovered'
  \quit 1
\endif
\if :no_duplicate_internal_working_copies
\else
  \echo 'RECOVERY REJECTED: duplicate active working copies in restored database'
  \quit 1
\endif
COMMIT;
\echo 'PASS: read-only recovery inspection. Retain secured operator evidence.'
