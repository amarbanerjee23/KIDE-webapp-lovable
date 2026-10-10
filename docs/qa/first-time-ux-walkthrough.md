# KIDE first-time user UX, visual and functional acceptance

**Scope:** KIDE SaaS UI at desktop (1440 × 900), tablet (768 × 900), narrow mobile (375 × 812); new/returning user; owner, engineer, reviewer and read-only roles; authenticated and anonymous sessions.

## Evidence boundary

- **Source reviewed:** routes and components from the named PR head.
- **Isolated browser execution:** `tests/e2e/first-run-ux-acceptance.spec.ts`, plus established authentication, permissions, lifecycle, semantic modelling, model-set integrity, E2E release and billing suites. Playwright launches a real production-built KIDE Docker container with isolated PostgreSQL in CI, not the public Cloud Run host.
- **Visual evidence:** `test-results/ux-gallery/*.png` uploaded in CI's `pr26-playwright-evidence` artifact, including empty-account and empty-project screenshots. These are *review material*, not proof that a human visually approved every screen.
- **Live production:** the assistant's runtime could not resolve the Cloud Run endpoint, so no production login or visual walkthrough was performed, and no customer account data was modified. Do not use the supplied production credentials in CI or store them in tickets. A browser-capable operator must sign off on the final deployed SHA.

## User journey catalogue

Status notation: **CI** = explicit automated acceptance already exists (must pass on PR and post-merge main); **NEW** = newly introduced PR71 coverage; **LIVE** = independent real Cloud Run verification still required. Passing a route-load smoke check does **not** imply that its buttons function.

| ID | Journey/scenario | Expected user-observable result | Evidence |
| --- | --- | --- | --- |
| VIS-01 | Home at 375/768/1440px | Hero understandable, CTAs visible and actionable, no page-wide horizontal clipping | NEW, LIVE |
| VIS-02 | Auth form, signup and sign-in | Clear intent; public **Create account** opens signup directly; Sign in opens returning-user form | NEW |
| VIS-03 | Legal/navigation links | Privacy and Terms reachable, browser Back works; no deceptive dead buttons | NEW, LIVE |
| VIS-04 | Mobile menu at 375px | Visible More control exposes **all** engineering and governance destinations without hidden scroll dependency | NEW |
| VIS-05 | Keyboard-only navigation | All interactive controls reachable and operable, visible focus indication and menu escape behavior | LIVE |
| VIS-06 | Screen reader and WCAG A/AA | Labels, headings, roles, and contrast usable; no serious/critical axe findings on audited routes | CI, NEW, LIVE |
| VIS-07 | Theme, density, zoom | Light, dark, high-contrast, compact/comfortable, 200% zoom maintain usability | CI, LIVE |
| AUTH-01 | First-time email signup | Account created, cookie issued, redirected to own empty projects | CI, NEW |
| AUTH-02 | Existing-user sign-in | Good credentials navigate to own projects, incorrect credentials show actionable error | CI |
| AUTH-03 | Google auth when configured | OAuth round trip persists intended same-origin return target; failure not endless loader | CI contracts, LIVE |
| AUTH-04 | Missing DB/secret/network | No fake workspace; explicit unavailable/retry behavior | CI |
| AUTH-05 | Unauthorized deep links | /projects, /overview, /models, /designer, /release etc. fail closed without session | CI |
| AUTH-06 | Session expiration/sign out | Protected content removed; Back/reload cannot display stale tenant data | CI, LIVE |
| AUTH-07 | Rapid route changes/relogin | Auth server checks do not spuriously log out or discard autosaved edits | CI |
| ONB-01 | Brand-new account | Clear create-organization CTA; no sample project pretending to belong to user | CI, NEW |
| ONB-02 | First organization | Confirmation, accessible name, next step explains create project | NEW |
| ONB-03 | First project | Next step links to **Model languages** with correct project context | NEW |
| ONB-04 | No project selected | Engineering pages show true empty state + Choose project, not demo data | CI |
| ONB-05 | Multiple organizations and projects | Active organization/project explicit, no stale selector response changes tenant | CI |
| ONB-06 | Rapid tenant switching | Old role/projects/reviews/checkpoints never displayed or actionable under new org | CI |
| ONB-07 | Invalid/duplicate/long names | Form validation visible and no phantom entity created | LIVE |
| MOD-01 | Empty modelling workspace | Explicit explanation of five DSLs; options to author or load reference | NEW |
| MOD-02 | Load example into empty project | Correct set of linked files appears and persists after reload | CI, NEW |
| MOD-03 | Replace authored example | Explicit confirmation; cancel preserves current files | CI |
| MOD-04 | Create/rename/delete each DSL file | Safe path checks; editor/diagnostics stay on active project | CI, LIVE |
| MOD-05 | Monaco key shortcuts and tooltips | Completion, reference navigation, diagnostics and undo/redo work on real keyboard | CI contracts, LIVE |
| MOD-06 | Offline and reconnect | Offline status truthful; no silent data loss or cross-project autosave | CI |
| MOD-07 | Concurrent edit conflict | Detect and fail closed; no overwrite without recovery | CI |
| MOD-08 | Import/export full model sets | Exact files and SHA-256 integrity preserved; unsafe/tampered entries rejected | CI |
| DES-01 | Activity designer | Canvas/graph opens for active model and reflects edits, no stale example | CI, LIVE |
| DES-02 | Catalogue and knowledge graph | Correct device capabilities, ontology references and empty/loading states | CI, LIVE |
| SYN-01 | Synthesis readiness | Invalid models block synthesis with human-readable findings | CI |
| SYN-02 | Candidate generation | Generated semantic control artifact corresponds to project DSLs | CI |
| SYN-03 | Scenario execution | Simulation results, errors and evidence reflect active candidate | CI, LIVE |
| SYN-04 | Generated code downloads | Actual artifacts generated, correct languages, file format and deterministic contents | CI |
| GOV-01 | Trust/qualification evidence | Traceability, warnings and release gates reflect real design; unapproved export blocked | CI |
| GOV-02 | Reviews request, comment, decision | Role-authorized mutation, durable comments, notifications and approval tracking | CI, LIVE |
| GOV-03 | Checkpoint save/cancel/restore | Exact atomic full-file restoration, including deletion of extras | CI |
| GOV-04 | Change after approval | Invalidates approval and blocks stale release evidence | CI |
| GOV-05 | Release/export | Evidence package contains correct provenance, manifests and checksums | CI, LIVE |
| ORG-01 | Invite existing reviewer | Single-use link, exact recipient email and role, no unearned admin controls | CI |
| ORG-02 | Invite brand-new reviewer | Anonymous landing hides metadata, signup returns to invitation, acceptance works | CI |
| ORG-03 | Revoked/expired/mismatched invite | Safe error and no membership mutation | CI server rules, LIVE |
| ORG-04 | Team role changes/removal | Owner protected, forbidden changes fail; audit recorded | CI, LIVE |
| ORG-05 | Notifications | Mark-read changes persist; no stale unseen count | CI, LIVE |
| BILL-01 | Free tier | Correct organization-specific plan and truthful feature availability | CI |
| BILL-02 | Billing not configured | No infinite spinner; explicit unavailable/permission states | CI |
| BILL-03 | Real paid checkout (if offered) | Provider init/3DS/declines/retry/webhook/reconciliation and plan activation | LIVE only |
| PROFILE-01 | Account preferences | Save and reload display name, role context, theme and density | CI |
| PROFILE-02 | Sign out | Ends server session; browser Back cannot reenter private routes | CI |
| PERF-01 | First load/route changes | No console errors or infinite spinners; sensible perceived load time | CI smoke, LIVE |
| PERF-02 | 375px/768px screen navigation | All primary/secondary destinations reachable, no top-level overflow | CI, NEW |
| PERF-03 | Production networks/devices | Slow 3G, spotty connection, keyboard, touch, iOS Safari, Android Chrome | LIVE |
| SEC-01 | Tenant data isolation | Forged IDs, viewer mutations and stale async requests rejected server-side | CI |
| SEC-02 | Secrets/redaction | No private credentials, auth tokens or PII in screenshot gallery, commits or artifacts | CI process, LIVE |

## PR71 source-level findings and changes

1. **Misdirected signup CTA (confirmed):** Home's Create account link opened the default **Welcome back** sign-in form. It now points to `/auth?mode=signup` and the auth form initializes in signup mode.
2. **First-project dead-end (confirmed UX friction):** After organization creation, the projects page gave little direction beyond a small project form. It now provides first-project instructions and an action to open Model languages with the correct project selected.
3. **Hard-to-discover mobile navigation (confirmed source design):** The More dropdown was inside a horizontally scrolling nav with hidden scrollbar. The More button is now fixed outside that scroll region; phones use it to access all engineering and governance destinations.
4. **Form accessibility:** The first-organization and project-creation inputs now have explicit accessible labels.

These changes are **not a claim that the live site was visually audited**. CI screenshots should be reviewed before merging, and the final deployed URL must be separately tested with authorized production accounts.

## Required hands-on live walkthrough

Use dedicated QA identities with owner, engineer, reviewer and read-only roles, and isolated disposable QA organizations/projects. Do not make destructive changes to pre-existing real customer workspaces. Sign in on a clean browser profile, check first impressions and all actions, then repeat on 375px and 768px widths and with keyboard only. Use the same production URL for OAuth/Better Auth trusted-origin verification. Record the deployed SHA and Cloud Run revision, browser/device, evidence screenshot or trace, observed result and severity for every anomaly.

**Severity:** P0 = cross-tenant/security, destructive loss, impossible sign-in; P1 = primary journey blocked or misleading success; P2 = usability/accessibility friction; P3 = cosmetic. P0/P1 block customer launch. All P2 accessibility failures should be triaged, not ignored. No UX verdict is final until the human-reviewed screenshots and independent live qualification pass.

**Release linkage:** [Go-live Issue #65](https://github.com/amarbanerjee23/KIDE-webapp-lovable/issues/65); post-merge CI → Cloud Run redeployment of exact approved SHA → restore-drill evidence → real browser qualification → controlled v1.0.0 publication.
