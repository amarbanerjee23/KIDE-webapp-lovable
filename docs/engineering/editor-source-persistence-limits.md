# PR88 — Enforce durable source limits in the model editor

The model-set importer (PR87) validates every import against the PostgreSQL
working-copy storage contract. The first-party Monaco editor and New model
action previously bypassed that limit: engineers could create more than 100
files, paste more than 1,000,000 source characters into one file, or exceed
5,000,000 total characters. Autosave would then fail **after** the project
had been modified in browser memory.

PR88 checks the identical `validateWorkingCopySources` contract before
committing any local editor mutation (new, edit, rename, replace, or example
load). Invalid edits do not modify the shared workspace store, so synthesis
and releases never consume an unsaveable source map. Monaco shows an error
toast and restores the last accepted editor text if a paste goes over the
storage budget, instead of leaving visually unsaved content on screen.

The 100-file limit also applies to New model; deleting a model permits a
replacement file to be created. Normal first-run model creation is verified
in a browser against the production container, including persistence after
a full reload.

For a very large model set, importing and editing may still have noticeable
performance costs; this PR intentionally does not change the backend
persistence quotas or assert that all editing can be performed offline.
