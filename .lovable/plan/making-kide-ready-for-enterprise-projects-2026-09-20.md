# Making KIDE ready for enterprise projects

Three things stand between the current product and real enterprise use: teams cannot be set up, workflows cannot be edited comfortably, and the synthesis results are not yet formally qualified. This plan closes all three, plus the enterprise essentials that large, complex projects assume.

## What the thesis adds to the qualification work

The later chapters confirm the assumptions the checker must enforce: the composition algorithm assumes deterministic transition systems and valid interface specifications; incorrect interface mappings or missing knowledge must fail loudly rather than produce an invalid configuration; the control architecture is recursive and hierarchical, where every node exposes a command, a data, and an event interface; reconfiguration reuses existing knowledge instead of regenerating from scratch; and the approach was validated at roughly 200 devices, so scale limits must be stated rather than implied. Each of these becomes a named, testable qualification rule.

## 1. Teams, profiles and invitations

- Personal profile page: name, job title, avatar, display density and theme, saved to the account.
- Organization settings: rename, member list with roles (Owner, Administrator, Engineer, Reviewer, Viewer), change a member's role, remove a member.
- Invitations: invite by email, single-use token with expiry, pending/accepted/revoked states, an accept page that joins the signed-in user to the organization, resend and revoke.
- Project membership: projects belong to an organization; every action page respects the viewer's role (Viewers read, Engineers edit, Reviewers approve, Administrators manage people).
- Every membership and role change is written to the audit history already in place.

## 2. Richer workflow editing

Replace the read-only diagram with a real activity designer:

- Drag nodes on a canvas, snap to grid, connect steps by dragging from a port.
- Add a step from the capability catalogue by dragging a capability onto the canvas; the step is pre-filled with its device, commands and alarms.
- Failure and degraded paths as first-class branch edges, drawn distinctly and labelled with the outcome that triggers them.
- Auto-layout button, zoom controls, minimap and fit-to-view for large workflows.
- Inline problem markers on the offending node, with the same plain-language message the editor shows.
- Two-way sync: every canvas change rewrites the activity source, and editing the source redraws the canvas. Undo/redo covers both.
- Multi-select, copy/paste, delete, and rename in place.

## 3. Formal synthesis qualification

- A written specification of the algorithm — inputs, preconditions, per-stage rules, tie-breaking order, failure states — each rule given a stable identifier.
- Rule checks derived from the thesis assumptions: deterministic transitions, every referenced interface resolvable, every command implemented by the bound device, command/data/event interface completeness per control node, no unreachable or deadlocked step, no conflicting resource use, required failure outcomes handled, and reuse of existing knowledge on reconfiguration instead of silent regeneration.
- Evidence ledger extended so every candidate records which rule fired on which model element, with the generator version.
- A qualification corpus of worked models (valid, and deliberately broken one rule at a time) with expected outcomes, run as tests.
- Property tests: renaming identifiers, reordering independent declarations, or adding an ineligible capability must not change the selected design; the same input must produce byte-identical output.
- Independent re-validation of the generated control model stays mandatory, and stated scale limits are reported rather than assumed.
- A qualification report page showing which rules are covered, which tests pass, and the resulting release gate; approval and export stay blocked when qualification is incomplete.

## 4. Enterprise essentials for complex projects

- Multiple projects per organization with a switcher, search, status and stage at a glance.
- Model versioning: named checkpoints, history, diff between versions, restore.
- Review workflow: request review, reviewer comments on findings, approve or send back with reasons, all recorded.
- Import and export of model sets so existing KIDE artefacts can be brought in and taken out.
- Notifications for invitations, review requests and approvals.
- Accessibility pass (keyboard paths, focus states, contrast) and a responsive review layout for tablets.

## Technical notes

- New tables: `invitations` (org, email, role, token hash, expiry, status), `project_members` if per-project scoping is wanted beyond org roles, `model_checkpoints`, `review_requests` and `review_comments`, `notifications`; each with row-level security scoped through the existing `has_organization_role` function and explicit grants.
- Invitation accept and role changes run server-side so the token and permission checks cannot be bypassed from the browser.
- The activity designer is a custom SVG/canvas layer over the existing parser AST, with a deterministic printer so canvas edits produce stable, diff-friendly source.
- Qualification rules live as pure, individually testable modules alongside the existing synthesis engine, each exporting its rule identifier so the ledger and the report are generated, not hand-written.

## Delivery order

1. Teams, profiles, invitations and role enforcement.
2. Activity designer with failure paths, auto-layout and two-way sync.
3. Synthesis qualification: specification, rules, corpus, property tests, report and gate.
4. Versioning, review workflow, import/export, notifications, accessibility.
