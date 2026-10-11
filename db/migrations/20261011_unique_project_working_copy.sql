-- Apply manually only after the read-only historical duplicate audit and
-- approved reconciliation. Never delete or merge customer source records here.
-- Transaction rolls back in full if any legacy project is ambiguous.
BEGIN;

DO $working_copy_integrity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.model_checkpoints
    WHERE label = '__kide_working_copy__'
    GROUP BY project_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active project working copies exist; audit and reconcile before index installation';
  END IF;
END
$working_copy_integrity$;

CREATE UNIQUE INDEX IF NOT EXISTS model_checkpoints_single_working_copy_idx
  ON public.model_checkpoints (project_id)
  WHERE label = '__kide_working_copy__';

COMMIT;
