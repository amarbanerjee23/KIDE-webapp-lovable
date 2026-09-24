# PR20 — Accessibility, keyboard navigation and WCAG hardening

Status: planned implementation PR.

## Scope
- complete keyboard-only navigation across public and protected application surfaces;
- enforce predictable focus order and visible focus states;
- add accessible names/roles/descriptions for interactive controls;
- verify modal, menu, editor and designer focus trapping/return behavior;
- harden contrast and reduced-motion behavior;
- add automated accessibility regression checks to CI;
- retain the existing client-compute architecture and session/security gates.

## Merge gate
Implementation, tests, production build and CI must be green before merge.
