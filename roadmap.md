# KIDE enterprise web application

- [x] Secure enterprise foundation: authentication, profiles, organizations, roles, projects, invitations and audit history
- [x] Engineering workbench: project dashboard and seven-stage workflow navigation
- [x] Engineering-grade editors: Monaco code editors for all five languages with syntax highlighting, completion, hover docs, snippets, live semantic diagnostics and cross-model checks
- [x] All five KIDE languages implemented from the Eclipse Xtext grammars (.dml, .op, .mncspec, .cap, .activity): parsers, validators, cross-model reference resolution, conformance tests against the repository golden models
- [x] Knowledge and capability catalogue with eligibility evidence
- [x] Activity designer at /designer: drag-and-drop canvas with snap-to-grid, capability drop-in, branch drawing, failure paths shown as dashed red edges, auto-layout, zoom, undo/redo, live problem list and deterministic two-way sync with the activity source
- [x] Deterministic synthesis pipeline with preflight, ranked candidates, provenance, evidence ledger and independent re-validation of the generated control model
- [x] Synthesis qualification at /qualification: ten rules traced to the thesis (composition assumptions, interface validity, recursive control architecture, determinism, failure handling, independent validation, provenance, validated scale) plus three algorithm properties (determinism, irrelevance, order independence); qualification is a release gate and its evidence ships in the bundle
- [x] Trust Centre and release centre: findings with impact and repair, seven release gates, traceability matrix, checksummed versioned bundle
- [x] Review workflow at /reviews: request a review of the current design, comment in thread, approve or send back with a recorded reason, all notified and audited
- [x] Saved checkpoints at /checkpoints: named snapshots of every model with error/warning counts, one-click restore
- [x] Model set import/export: single checksummed JSON document, refused on tampering or a missing language
- [x] Notification centre at /notifications: review requests, decisions, comments and membership changes, with mark-all-read
- [x] Comparison corpus against the desktop KIDE transformation: four reference cases run on every qualification, reported on /qualification and shipped as evidence/desktop-conformance.json; a difference blocks qualification
- [ ] Remaining: accessibility pass; extending the comparison corpus with outputs captured from a running Eclipse installation

Current scope excludes changes to the Eclipse application.

## Billing & projects home
- [x] Projects home page: all organizations + their projects on sign-in landing (/projects, linked from both headers; sign-in now lands there)
- [x] Plan/subscription page: current plan, tiers, upgrade (/billing)
- [x] Open-source, platform-agnostic payments via self-hosted Hyperswitch: checkout page (/checkout), signed webhook at /api/public/hyperswitch-webhook, subscriptions + payments tables, live plan status and invoice list on /billing
- [ ] Payment details: payment-method management portal (Hyperswitch customer session) — pending
- [ ] Go live: user adds HYPERSWITCH_BASE_URL / API_KEY / PUBLISHABLE_KEY / WEBHOOK_SECRET secrets and points the Hyperswitch webhook at /api/public/hyperswitch-webhook
- [x] GitHub repo KIDE-webapp-lovable created and source pushed (148 files)
- [x] GitHub Actions CI on push/PR: install, typecheck, test (50), build — first run green
