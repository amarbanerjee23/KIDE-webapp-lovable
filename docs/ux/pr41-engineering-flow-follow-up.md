# PR41 engineering-flow UX follow-up

Date: 2026-09-30

## Scope

This pass continues the PR39/PR40 user-flow audit on the remaining engineering governance surfaces: Synthesis, Qualification, and Release.

## Verified gaps and actions

| Severity | Gap | User impact | Action |
| --- | --- | --- | --- |
| P2 | Synthesis, Qualification, and Release used fixed 56 px single-row headers. | Actions and context can overflow or become unreachable at narrow laptop/mobile widths. | Headers now wrap, grow vertically when required, and move action clusters onto a full-width row on small screens. |
| P2 | Synthesis candidate cards behaved like a single-choice selector but exposed only generic button semantics. | Keyboard users could activate candidates, but assistive technology did not receive the single-selection relationship or selected state. | Candidate collection now exposes a labelled radiogroup with radio semantics, checked state, and visible focus treatment. |
| P2 | Release bundle contents used an unconstrained wide table. | Long artefact names and hashes can create page-level horizontal overflow. | The table now scrolls inside its own bounded region with a stable minimum table width. |
| P3 | The remaining audit item referred to progress/cancel/retry for long-running synthesis/qualification/release work. | A fake progress model would misrepresent current behavior. | No spinner/cancel UI was added: these calculations are currently synchronous deterministic browser computations during render, not asynchronous jobs. Progress/cancellation should be introduced only if computation moves behind an actual interruptible task boundary. |

## Acceptance principles

- Narrow viewports must not make primary engineering actions unreachable.
- Single-choice interactive collections must expose their state to keyboard and assistive-technology users.
- Dense engineering data may scroll within its own region, but should not force the entire application viewport to scroll horizontally.
- KIDE must not present fake asynchronous progress or cancellation controls for synchronous work.
