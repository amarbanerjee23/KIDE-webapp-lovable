# PR22 — Payment-method management portal

Status: planned implementation PR.

## Scope
- add authenticated Hyperswitch customer-session creation;
- expose payment-method management from the billing experience;
- validate account/organization ownership server-side;
- use safe return/cancel handling;
- never expose provider secrets to the browser;
- add regression tests for unauthorized access, invalid sessions and provider failures.

## Merge gate
Billing security tests, typecheck, test suite, production build and CI must be green before merge.
