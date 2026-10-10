# PR72 — Project creation and progressively guided real-world examples

## User-reported production symptom

Users reported that creating a new project does not work. The live Cloud Run site could not be accessed with the available test environment, so the exact production response is unconfirmed. Source review established two actionable issues:

1. The project-creation form was displayed even for `reviewer` and `viewer` roles, but the server rejects those roles. The user only received a transient toast.
2. A one-character project name passed the server's first validation but violates the PostgreSQL projects table (`char_length(name) >= 2`), producing a generic database error. Valid creations showed only a transient toast and stayed on the same page without a clear next action.

Fixes: role-gated forms and template destination; inline project-specific errors; matching 2–120 character name validation; a persistent success panel linking into the selected project's model workspace; server-side authorization remains mandatory. All creations are authenticated and tenant-scoped.

## Starter projects

These are **prebuilt reference blueprints** available to every authorized organization owner/administrator/engineer. Clicking **Use example** creates a **private project copy** with its own five model-language files, a fresh project UUID, project description and working-copy row. Nothing is silently added to or overwritten in a customer's existing projects.

| Level | Real-world starter project | Focus |
| --- | --- | --- |
| 1 / Beginner | Commercial building air-quality control | Occupancy, ventilation and safe fallback |
| 2 / Foundational | Precision irrigation controller | Sensor-to-valve loop and reservoir protection |
| 3 / Intermediate | Municipal water treatment process | Treatment stages, telemetry and protective recovery |
| 4 / Advanced | Solar microgrid orchestration | Inverter dispatch and storage reserves |
| 5 / Expert | Autonomous warehouse fleet | Route planning, device control, battery alarms and recovery |

The levels grade **scenario/domain concepts**. The reference designs use the existing validated five-DSL example generator (DML, operations, MNC, capabilities and activities); they are **not** certified production device recipes or fully detailed industrial digital twins. All five source maps are validated before insertion.

## Invariant and transaction

The server performs authorization and input validation, then inserts the project, optional reference working copy, and audit event **in one PostgreSQL transaction**. A failure rolls the whole operation back. It reuses the existing `projects` and hidden `__kide_working_copy__` checkpoint tables—no new persistence backend or schema migration.

Blank project creation remains blank. Every template creation is opt-in and independent. The browser selects the newly persisted project and shows a persistent **Open new project** link. Non-editing roles see a clear explanation and no creation controls.

## Tests and acceptance

- Unit: exactly five ordered templates, unique domains/IDs, all five linked file formats, zero diagnostic errors, bounded valid source maps, invalid template rejected.
- Production-container E2E: brand-new account and organization; create two blank projects in an existing organization; create all five example projects; open each, reload, verify source files survive; confirm blank-project isolation; verify visible creation success.
- Existing CI: roles, invitation acceptance, checkpoint persistence, synthesis, code generation, release gates and browser compatibility remain enabled.

Before claiming the user's specific Cloud Run bug resolved, merge after all 18 CI jobs pass, redeploy the exact green `main` SHA, and conduct a live create-project test under an authorized engineer/owner identity **and** a read-only identity. Confirm Cloud SQL persistence and error messages on the actual deployment; do not use real customer data for destructive tests.

## PR76 complete-source and production journey acceptance

The browser test downloads the complete five-file model set for each example,
independently computes SHA-256 for every source, reloads the project and
compares every persisted source string byte-for-byte. Blank projects must
remain empty. Independent users must not enumerate another organization's
projects before an authorized invitation is accepted.

Production qualification now runs three browser suites (release journey, five
project templates and independent tenant isolation) rather than treating a
single successful signup-to-release account as proof of every CX boundary.
This produces disposable production QA records that require accountable
retention and cleanup. Isolated CI success is not a substitute for the
production workflow and its exact-commit acceptance evidence.
