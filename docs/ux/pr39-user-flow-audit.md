# PR39 user-flow UX audit

Date: 2026-09-28

## Scope

This audit follows KIDE as three users:

1. a new engineer creating an organization and first project;
2. a returning engineer continuing an existing project;
3. a reviewer or administrator moving between governance surfaces.

The review covers the public entry point, authentication hand-off, project selection,
model editing, the engineering workbench, examples, persistence feedback, navigation,
review/checkpoint project context, notifications, profile recovery, and responsive behavior.

The audit is intentionally user-centered: a surface is considered defective when it
misrepresents project state, can cause unintended data replacement, silently loses
confidence in persistence, or forces the engineer to infer which project or artifact is active.

## Findings

| Severity | Gap | User impact | PR39 disposition |
| --- | --- | --- | --- |
| P1 | Loading a reference example immediately replaced every source file in the active workspace. Global autosave could persist that replacement about 750 ms later. | An engineer could overwrite real project work while intending only to inspect an example. | **Fixed.** Non-empty workspaces require an explicit destructive-action confirmation that explains autosave and checkpoints. |
| P1 | The Workbench was disconnected from the real project workspace. It used a toy parser plus hard-coded Warehouse Fleet / Mission Planning / trace data. | Users could mistake demo evidence for their own project and make decisions from fabricated context. | **Fixed.** Workbench now derives model, capability, workflow, synthesis and assurance state only from the active persisted project. |
| P1 | Every project card advertised Ecre.dml, Ecre.op, Ecre.mncspec, Ecre.cap and MissionPlanning.activity even when the project was empty or unrelated. | The project list claimed files existed when they did not. | **Fixed.** Project cards now offer truthful workspace actions rather than fabricated filenames. |
| P1 | Normal autosave failures were console-only. | Users could navigate away believing edits were saved. | **Fixed.** Autosave failure produces a visible error toast and persistent save-state badge. |
| P1 | Review/checkpoint selection silently chose the first project when no project was explicitly active. | A reviewer could act on the wrong project without noticing the context switch. | **Fixed.** Existing active selection is preserved only when valid; otherwise the user must choose a project. |
| P2 | The authenticated Overview header contained a “Sign in” action. | Breaks session confidence and makes the authenticated state look inconsistent. | **Fixed.** Overview uses the shared authenticated header. |
| P2 | Overview displayed “Warehouse Fleet — Autonomous Routing” regardless of the selected project. | Users could lose project context and confuse reference content with their project. | **Fixed.** Project name, organization, status and stage come from the real active project. |
| P2 | The top navigation exposed fourteen destinations in a wrapping row. | Navigation wrapped unpredictably and increased scanning cost, especially on laptop widths. | **Fixed.** Primary engineering destinations remain visible; governance/workspace destinations move into an accessible More menu. |
| P2 | An empty project could mark the Intent stage complete because it had zero parse errors. | “No content” was presented as “complete.” | **Fixed.** Intent requires at least one model file as well as zero errors. |
| P2 | The Models toolbar used a fixed 56 px row despite many controls. | Controls could overflow or become difficult to reach on smaller screens. | **Fixed.** Toolbar wraps without hiding destructive or synthesis controls. |
| P2 | Project-list load errors left the page looking permanently busy. | User could not distinguish server failure from a slow load. | **Fixed.** Inline failure state with Retry. |
| P2 | Notification and profile initial-load errors had no explicit recovery path. | Blank or stale account state could be mistaken for valid data. | **Fixed.** Inline error states, retry actions and user-visible toasts. |
| P2 | Save state had no positive or intermediate feedback. | Engineers could not tell whether edits were pending, saved, read-only, conflicted or failed. | **Fixed.** Workspace persistence publishes Loading, Saving, Saved, Read-only, Save conflict and Save failed states; Models displays them with aria-live feedback. |
| P3 | Global authenticated navigation varied between pages. | Users had to re-learn navigation position and available destinations page by page. | **Improved.** Overview and Workbench now use the shared header; existing authenticated pages continue converging on the same component. |
| P3 | Some account/workspace error recovery remains toast-centric. | Toasts can be missed after a long session. | **Follow-up candidate.** PR39 adds inline recovery to Projects, Profile and Notifications; other surfaces should adopt the same pattern when their data-loading paths are revisited. |

## User-flow invariants added in PR39

The browser suite now proves that:

- an empty project does not advertise warehouse example files;
- Overview shows the actual project name and does not show an authenticated “Sign in” CTA;
- secondary destinations remain available through the More menu;
- Workbench shows the actual project and contains no Warehouse Fleet / fabricated trace copy;
- an empty project Workbench reports that no model files exist;
- the first explicit example load into an empty project is allowed;
- loading an example over a non-empty workspace requires a confirmation dialog;
- cancelling the confirmation preserves the current workspace;
- the Overview does not introduce horizontal page overflow at a 1024 px laptop viewport;
- the audited Overview has no serious or critical WCAG 2A/2AA violations.

## Remaining UX work worth a separate pass

These are not release blockers for PR39 but should be evaluated in later focused PRs:

- verify visual hierarchy, density and touch targets at 768 px and mobile widths across every engineering editor;
- add unsaved/save-state presentation to Designer and other editing surfaces, not only Models;
- add keyboard-only journey tests for the full engineering flow, including the More menu and destructive dialog;
- add explicit offline/reconnect behavior for project persistence;
- review long-running synthesis/qualification/release operations for progress, cancellation and retry semantics;
- verify that saved profile density/theme preferences are applied consistently on the next session and, where appropriate, immediately.

## Acceptance principle

KIDE must never fabricate engineering state to make an empty or incomplete project look
finished. When data is absent, the UI must say it is absent. When an action replaces project
data, the UI must say so before it happens. When persistence fails, the user must know before
leaving the page.
