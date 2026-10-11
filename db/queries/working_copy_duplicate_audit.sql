-- Read-only production preflight. No source content or customer secrets.
-- Any returned row blocks the uniqueness migration and production release.
SELECT
  project_id,
  count(*) AS active_working_copies,
  min(created_at) AS oldest_saved_at,
  max(created_at) AS newest_saved_at
FROM public.model_checkpoints
WHERE label = '__kide_working_copy__'
GROUP BY project_id
HAVING count(*) > 1
ORDER BY active_working_copies DESC, project_id;
