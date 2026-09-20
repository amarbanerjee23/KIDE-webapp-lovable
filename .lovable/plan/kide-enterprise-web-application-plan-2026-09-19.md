# KIDE Enterprise Web Application Plan

## Goal

Build a production web application for enterprise systems-engineering teams, based on the KIDE thesis and repository concepts. The product will support the complete journey:

```text
System intent → device/domain knowledge → capability matching → activity design
→ synthesis → validation and explanation → generated control design
→ scenario verification → review and release
```

The current browser demonstrator will become this product. The Eclipse application and GitHub repository remain reference implementations; this phase will not modify Eclipse code.

## Product principles

- **Workflow before files:** organize work around engineering decisions, not DSL extensions.
- **Visual-first, source-capable:** forms and diagrams lead; DSL source remains available for experts.
- **Evidence beside automation:** every match, rejection, composition, finding, and generated element explains why it exists.
- **Safe collaboration:** version history, review states, audit records, and no silent overwrite.
- **One synchronized system:** requirements, capabilities, workflows, generated designs, and evidence share stable trace links.
- **Honest scope:** model discrete/event-driven control; do not claim low-level continuous-control simulation or runtime guarantees.
- **Correctness before convenience:** synthesis is treated as a safety-relevant compiler pipeline, with explicit semantics, proofs/checks, deterministic results, and release-blocking verification.

## Main product experience

### 1. Enterprise workspace

- Email/password and Google sign-in, password recovery, session-safe sign-out.
- User profiles with display name, avatar, role, preferences, and organization membership.
- Organizations, invitations, and project roles: Owner, Administrator, Engineer, Reviewer, Viewer.
- Project switcher, recent work, assigned reviews, notifications, and organization administration.
- All authorization enforced on the server and in row-level access policies; roles live in a dedicated role table.

### 2. System dashboard

- Project health, workflow progress, artefact counts, open findings, pending reviews, and latest synthesis.
- Seven stages: **Intent, Knowledge, Capabilities, Activities, Synthesis, Verification, Release**.
- One recommended next action based on project state.
- Timeline of meaningful changes with actor, timestamp, and affected artefacts.
- Starter systems based on warehouse robotics, vehicle entry, smart meeting room, and the repository’s Loading example.

### 3. Intent and requirements

- Structured goals, triggers, outcomes, constraints, priorities, and acceptance criteria.
- Form, source, and trace views over the same model.
- Coverage status for unmatched, partially satisfied, and satisfied requirements.
- Comments, assignments, review state, and immutable decision records.

### 3A. Engineering-grade editors

- Purpose-built editors for requirements, knowledge/device models, capabilities, activities, MNC designs, scenarios, and generated artefacts.
- Every model offers coordinated **Visual, Form, Source, Trace, and History** modes where the underlying metamodel supports them.
- Monaco-class source editing: semantic syntax highlighting, completion, parameter hints, hover documentation, outline, folding, formatting, rename, find references, go-to definition, breadcrumbs, minimap, multi-cursor, bracket matching, snippets, command palette, and keyboard shortcuts.
- Inline diagnostics explain the engineering problem and impact, not parser jargon; quick fixes show a semantic preview before changing the model.
- Split views preserve synchronized selection, cursor location, diagnostics, and undo/redo across source, forms, and diagrams.
- Autosave uses recoverable drafts; named checkpoints and model history remain explicit. Concurrent edits never silently overwrite a newer version.
- Large-model ergonomics include incremental validation, virtualized lists, cancellable indexing, persisted panel layouts, focus mode, and accessible keyboard navigation.
- Importing malformed DSL text opens a non-destructive recovery editor with exact source ranges and partial-model isolation; invalid content never enters an approved baseline.

### 4. Knowledge and capability catalogue

- Search and filter by device, role, inputs, outputs, preconditions, outcomes, properties, and availability.
- Capability details show meaning, source, dependencies, usage, validation, and ownership.
- Compare eligible candidates and explain why alternatives were rejected.
- Add a capability to an activity, create a controlled variant, or inspect references.
- Clearly distinguish authored, imported, inferred, and assumed knowledge.

### 5. Activity designer

- Large desktop canvas with catalogue on the left, activity graph in the center, and contextual properties on the right.
- Nodes for triggers, capabilities, decisions, parallel paths, failures, and outcomes.
- Drag/add capabilities, connect flows, edit inline, auto-layout, minimap, zoom, undo/redo, and reusable subflows.
- Optional overlays for data flow, conditions, outcomes, timing constraints, and exception paths.
- Explicit device-failure and degraded-mode paths.
- Synchronized visual and DSL views, including mirrored selection and diagnostics.

### 6. Synthesis review

- Guided preflight checks before synthesis.
- Deterministic candidate compositions with side-by-side scoring and trade-offs.
- “Why this design?” evidence linking requirements, capabilities, knowledge facts, and transformation rules.
- Generated MNC preview with semantic differences against the previous result.
- Explicit conflict resolution, cancellation, progress, versioned outputs, and no silent overwrite.
- Durable synthesis report attached to the project version.

### 6A. Synthesis correctness programme

“Perfect” will be implemented as an evidence-backed correctness target rather than an unsupported claim.

- Extract a normative synthesis specification from the thesis, grammars, metamodels, validators, and existing activity-to-MNC transformation; resolve contradictions before porting behavior.
- Define typed input/output contracts, preconditions, postconditions, invariants, failure states, and deterministic tie-breaking for every synthesis stage.
- Separate candidate discovery, constraint evaluation, ranking, composition, MNC generation, and provenance into independently testable pure modules.
- Reject incomplete or inconsistent inputs before generation; never silently guess missing engineering facts. Assumptions must be explicit, reviewable records.
- Validate every candidate for type compatibility, pre/postcondition satisfaction, data-flow completeness, control-flow reachability, cycle/deadlock rules, resource conflicts, and required failure outcomes.
- Revalidate the generated MNC model independently from the synthesizer that created it, preventing the same implementation mistake from approving itself.
- Produce a machine-readable proof/evidence ledger for each accepted or rejected candidate, including rule IDs, model element IDs, inputs, outputs, and generator version.
- Guarantee reproducibility: identical versioned inputs and algorithm configuration produce byte-equivalent canonical output and the same evidence ledger.
- Use exhaustive checks for bounded small models, property-based and mutation testing for general models, golden examples from the thesis, and differential tests against the current repository transformation.
- Add metamorphic tests: renaming identifiers cannot change semantics; reordering independent declarations cannot change output; adding an ineligible capability cannot alter the selected valid design.
- Establish explicit performance and state-space limits. When exhaustive search is infeasible, report truncation and optimality status; never label a heuristic result as proven optimal.
- Block approval and release when synthesis evidence is incomplete, independent validation fails, output is non-deterministic, or the algorithm version is not qualified.
- Version synthesis semantics and provide migration/requalification reports whenever an algorithm, grammar, constraint rule, or metamodel changes.

### 7. Trust Centre

- Findings grouped by workflow stage, severity, rule, owner, and status.
- Each finding states the problem, engineering impact, evidence, and recommended repair.
- Previewable quick fixes and safe batch repair.
- Traceability matrix: requirement ↔ capability ↔ activity ↔ generated MNC element.
- Review workflow with comments, approvals, requested changes, and signed audit history.
- Baseline comparison and impact analysis before imported or regenerated changes are accepted.

### 8. Scenario runner and reconfiguration

- Define discrete event sequences, device availability/failure, inputs, and expected outcomes.
- Step, pause, replay, and highlight the execution path on activity and generated-design views.
- Compare nominal and failure scenarios.
- Show goals affected by device failure or upgrade, eligible substitutes, and recomposition preview.
- Save results as reviewable verification evidence.

### 9. Release centre

- Select generation target and release profile.
- Gate release on model health, required approvals, scenario results, and unresolved findings.
- Show generator version, source versions, checksums, and trace coverage.
- Produce a versioned export bundle, manifest, evidence report, and downloadable source artefacts.
- Keep direct deployment behind a future adapter until a supported orchestration runtime is defined.

## Information architecture

```text
Public
├── Sign in / Sign up / Password recovery
└── Invitation acceptance

Authenticated
├── Home
├── Organization
│   ├── Members and roles
│   └── Audit history
└── Project
    ├── Dashboard
    ├── Intent
    ├── Knowledge
    ├── Capabilities
    ├── Activities
    ├── Synthesis
    ├── Verification
    ├── Releases
    └── Settings
```

The project shell will use persistent workflow navigation, breadcrumbs, global search/command palette, notifications, and a contextual inspector. Major areas receive separate shareable routes; editor modes remain tabs within their domain area.

## Visual direction

- A precise engineering workbench rather than a marketing dashboard.
- Dense but calm information hierarchy, restrained surfaces, square-to-small-radius controls, visible grid and alignment.
- Preserve semantic colors: capability blue, activity amber, data/outcome green, structure slate. Status colors remain separate and always include an icon and label.
- Clear provenance lines and selection relationships across panels.
- Compact and comfortable density modes; light, dark, and high-contrast support.
- Full keyboard operation, visible focus, scalable text/icons, screen-reader names, and reduced-motion behavior.
- Responsive priority: optimized for large engineering displays; tablets support review and catalogue tasks; phones support notifications and approvals, not graph authoring.

## Data and security model

Use Lovable Cloud for authentication, relational data, file storage, and server-side operations.

Core records:

- organizations, memberships, invitations, profiles, and dedicated user roles
- projects, project members, project settings, and model versions
- requirements, knowledge sources, devices, capabilities, activities, graph nodes/edges
- synthesis runs, candidates, generated artefacts, provenance links
- validation findings, scenarios, scenario runs, reviews, comments, approvals
- releases, release artefacts, and append-only audit events

Security rules:

- Every organization/project record is tenant-scoped and protected by row-level policies.
- Server actions independently verify authentication and permission; hidden controls are never the security boundary.
- Invitations are single-use, expiring, and organization-bound.
- Roles are stored separately from profiles and checked through server-side permission helpers.
- Generated files and evidence exports use private storage with short-lived download links.
- Optimistic concurrency prevents one editor from silently overwriting another’s version.
- Mutations create audit events recording actor, action, target, and safe change metadata.
- Inputs are schema-validated in browser and server paths; rich text is sanitized.

## Technical approach

- TanStack Start and React for routes and server functions; Tailwind v4 and the existing accessible component library for presentation.
- TanStack Query for server state and cache invalidation.
- Lovable Cloud authentication with protected route groups and authenticated server functions.
- PostgreSQL with normalized project metadata plus versioned JSON model snapshots where graph-shaped payloads benefit from atomic versioning.
- A typed domain layer separates model operations from UI code.
- A deterministic, testable synthesis engine runs server-side; the browser receives only validated candidate and provenance data.
- A dedicated graph/canvas package may be selected during implementation after verifying SSR compatibility, keyboard support, and large-graph performance.
- Background-style jobs expose progress and idempotency; long-running synthesis will be split into restartable stages compatible with the hosted runtime.
- Import/export adapters support current KIDE DSL artefacts; parsing failures report source locations and never partially persist.

## Delivery sequence

### Phase 0 — Foundation

- Enable Lovable Cloud and configure authentication.
- Create profiles, organizations, memberships, roles, invitations, projects, and audit foundations with grants and row-level policies.
- Build public authentication and invitation flows plus the protected application shell.
- Establish domain types, permission checks, route-level metadata, error states, and test fixtures.

**Exit:** enterprise users can securely create/join an organization and access only authorized projects.

### Phase 1 — Complete clickable core journey

- Build the project dashboard and workflow navigator.
- Deliver capability catalogue, activity canvas, synthesis review, and Trust Centre using deterministic thesis-aligned sample data.
- Make selection, filtering, graph editing, candidate comparison, provenance navigation, and representative repairs functional.
- Persist projects, versions, findings, and synthesis reports.
- Deliver polished source, form, visual, trace, and history editor interactions for the reference workflow.

**Exit:** all three requested areas form one usable, saved workflow.

### Phase 2 — Real modelling and synthesis

- Implement requirements, device knowledge, capabilities, and activities as editable domain models.
- Add DSL import/export and synchronized source/visual editing.
- Port or reimplement validated activity-to-MNC behavior behind a tested synthesis service.
- Add semantic diff, conflict protection, version history, and trace construction.
- Complete the synthesis correctness programme: normative semantics, independent output validator, evidence ledger, exhaustive bounded checks, differential/property/mutation/metamorphic tests, determinism, and algorithm qualification.

**Exit:** teams can create or import a real system model and generate a traceable control design.

### Phase 3 — Collaboration and verification

- Add comments, assignments, reviews, approvals, and notifications.
- Add scenario authoring, discrete execution, evidence capture, and reconfiguration analysis.
- Add baseline comparison and change-impact review.

**Exit:** distributed teams can review, verify, and approve changes with auditable evidence.

### Phase 4 — Release and enterprise hardening

- Add governed release profiles, downloadable bundles, manifests, checksums, and evidence reports.
- Complete accessibility, responsiveness, migration, recovery, observability, rate/size limits, dependency scanning, and administrative controls.
- Validate with warehouse robotics, vehicle entry, smart meeting room, and Loading reference projects.

**Exit:** a secure, supportable enterprise release candidate.

## Verification and release gates

- Unit tests for parsing, validation, matching, synthesis, traceability, permissions, and version conflicts.
- Integration tests for every protected server action and tenant boundary.
- Browser journeys for onboarding, modelling, synthesis, repair, review, scenarios, and release.
- Explicit adversarial tests proving users cannot access another organization’s records or assign themselves roles.
- Golden-model tests for the four reference systems and deterministic generation.
- Differential conformance against the Eclipse transformation for every shared supported construct, with every intentional difference documented and approved.
- 100% branch coverage for safety-critical synthesis rules, surviving mutation-test thresholds, and zero unexplained counterexamples from bounded exhaustive checks.
- Independent validation of every golden generated model and byte-stable canonical output across repeated runs.
- Editor contract tests for synchronized selections, undo/redo, quick-fix previews, draft recovery, version conflicts, and malformed imports.
- Editor usability tests covering completion relevance, diagnostic comprehension, keyboard workflows, and representative large models.
- Accessibility checks plus keyboard-only completion of the core journey.
- Desktop checks at 1280×800 and 1920×1080; tablet review-flow checks; phone approval-flow checks.
- Security scan, dependency scan, audit-log verification, backup/export test, and recovery rehearsal before production release.

## Initial success measures

- At least 80% of first-time engineers complete the reference workflow without external instruction.
- Median time from project creation to a validated synthesized design under 15 minutes.
- Every generated MNC element has a navigable source trace.
- Seeded modelling faults are diagnosed at least 30% faster than in the current Problems-view workflow.
- No cross-tenant access, model corruption, or silent overwrite in release testing.
- Core authoring is keyboard accessible; review and approval work on tablet and phone.
- Zero incorrect synthesis results across the qualified reference corpus; every result carries complete provenance and independent validation evidence.

## Scope controls

- Build the end-to-end web product; do not modify the Eclipse application in this phase.
- Do not claim unsupported continuous-control simulation, hard real-time guarantees, or live orchestration deployment.
- Start with deterministic KIDE logic and explicit evidence; do not add opaque AI-generated engineering decisions.
- AI may explain models or suggest edits, but it cannot approve synthesis, alter qualified rules, or create release evidence; deterministic algorithms remain authoritative.
- Direct deployment adapters and external enterprise identity federation follow after the governed single-product workflow is stable.
