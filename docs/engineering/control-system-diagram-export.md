# Downloading KIDE control-system engineering diagrams

## How to export

Sign in, choose the correct organization and project, open **Model languages**, and
select **Download diagrams**. KIDE creates a self-contained
`kide-engineering-diagrams-<project-id>.zip` in the browser. The action is
available to members who can read the loaded project, including read-only
reviewers. It does not change the workspace, call cloud diagram services or
deploy generated control software.

## What is included

- `diagrams/00-system-architecture.svg` — a model inventory grouped by KIDE's
  five engineering languages.
- A **separate SVG for every model file** currently loaded in the project:
  - **Data (.dml):** typed fields, data-model composition and containment.
  - **Operations (.op):** computation operations and their typed inputs/results.
  - **Control topology (.mncspec):** controllers, implemented interfaces,
    commands, events, alarms, datapoints, responses and operating states.
  - **Capabilities (.cap):** interface bindings, callable command interfaces,
    outcomes and initialization actions.
  - **Activities (.activity):** process activities, ordering, conditional
    continuations, capability/operation bindings and produced results.
- `modelset.json` — all model source files with SHA-256 checksums in the existing
  `kide.modelset/1` interchange format, suitable for KIDE's model importer.
- `manifest.json` — the organization/project identifiers, source file paths and
  checksums, diagram node/edge counts, export time and current browser save status.

SVG diagrams are vector graphics and can be printed, inspected and edited in
standard SVG-capable diagram editors. Every diagram node is based on the current
parsed model; if the project contains syntax or cross-model errors, KIDE refuses
the export rather than silently omitting incomplete engineering content.

## Snapshot versus approved release

These files are an engineering **snapshot**, not an approved or verified
machine-safety design. Exporting when edits are still in memory may include
unsaved changes; the manifest explicitly records the workspace save state and
the `snapshot-not-release-approved` status. KIDE's separate synthesis approval,
code generation, tests and guarded release checks remain mandatory.

An existing ZIP is not a substitute for the approved source revision, Cloud Run
provenance or a retained release artifact. No raw HTML, external JavaScript,
remote image assets or cross-project data are embedded in the SVG files.
