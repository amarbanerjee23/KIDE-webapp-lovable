# KIDE release-blocking UX and functional acceptance

## Scope and evidence boundary

This audit covers source-level routes, session policy, data editing, authorization entrypoints, Playwright CI and actual mutation controls. The **live Google Cloud Run interface has not been interactively driven from this environment**: outbound HTTP/DNS and browser navigation to the Cloud Run host are unavailable here. A CI-green result must not be represented as comprehensive live-production certification.

PR66 fixes concrete source defects and adds automated regression coverage. The existing GitHub CI exercises Dockerized KIDE with isolated PostgreSQL, Chromium/Firefox/WebKit public surfaces, authentication, model synthesis, release export, persistence and restart recovery.

## Functional acceptance matrix

| Journey | Automated evidence | Release-quality acceptance |
| --- | --- | --- |
| Public home and sign-in | Existing Chrome/Firefox/WebKit smoke | Landing and auth load without exceptions; invalid credentials fail closed |
| Anonymous route security | Configured/unconfigured/missing/unreachable database suites | Every protected route denies unauthenticated access; no project data leaks |
| Organization/project onboarding | Auth lifecycle and release journeys | Create, choose, reopen and persist organization/project state |
| Multi-project isolation | Existing working-copy persistence and contract tests | Switching projects never displays or writes another project's models; concurrency conflicts block overwrites |
| Model editing | Existing engineering journey | Create, rename, edit, delete and persist each supported DSL model |
| Model exchange | **PR66 unit and browser regression** | Arbitrary safe model names import/export with mandatory checksums, duplicate/path validation and no partial changes |
| Checkpoints | **PR66 browser regression** | Save, preview, cancel and atomically restore exact model set, including deletion of extra files |
| Activity designer / catalogue | Existing release journey and route traversal | All editing, capability links and generated diagrams match the active project |
| Synthesis, scenario and qualification | Existing deterministic-domain and E2E suites | Unapproved/invalid models cannot generate a release; evidence tracks the correct candidate |
| Trust, approval and release | Existing release journey and artifact integrity suites | Approval invalidates on source changes; export checksums and generated files agree |
| Team and invitations | **PR66 cross-account browser regression** | Single-use invite link is transparently communicated; invitee identity and role are enforced |
| Reviews, comments and notifications | Existing route traversal plus **PR66 acceptance notification** | Request, decision, comment and read state persist; actor permissions enforced |
| Billing and checkout | **PR66 browser regression** | Current plan is organization-specific; no inert sales actions; errors/permissions never leave endless loading |
| Profile and preferences | Existing auth lifecycle browser suite | Preferences survive reload and authentication cycles |
| Mobile/tablet navigation | **PR66 mobile regression** | No full-page horizontal overflow at 375px/768px; overflowed navigation remains actionable |
| Accessibility | Axe on public, configured and **PR66 management** screens | No serious/critical WCAG A/AA findings on audited screens; remaining moderate findings should be triaged |

## Concrete source defects found and corrected in PR66

1. Checkpoint restore used `setSource` for existing files only, so it threw for deleted files and retained unrelated new files. Replaced with guarded atomic model-set restoration and explicit overwrite confirmation.
2. Model-set import required example-specific filenames, silently accepted missing SHA-256 metadata and overwrote matching files without removing unrelated files. Imports now support arbitrary safe DSL paths, verify mandatory hashes/kinds, reject duplicates and import only after confirmation.
3. Organization switching could leave stale team membership controls visible while the next organization loaded, and a slower response could overwrite the newly selected organization. Hide stale data and ignore out-of-date responses.
4. Invitations were labelled “Send invite” without actually sending email. Show and copy the single-use link explicitly, with a safe clipboard-failure fallback.
5. Checkout showed an indefinite spinner on API errors or without an eligible organization, and treated an unconfirmed payment response as success. Added recoverable error/no-org states and distinguished payment submission from confirmed success.
6. Billing combined plans and payments across organizations and displayed a non-functional enterprise “Contact sales” button. Show selected-organization data and transparently mark unavailable inquiries.

## Live go/no-go validation still required

Complete the live production qualification workflow on the exact deployed main SHA and retain its artifact. In addition, an authorized product tester must validate actual input ergonomics, keyboard focus/assistive-technology experience and visible feedback on desktop and mobile, using test users from different organizations. A paid launch requires a real Hyperswitch provider integration, declined/3DS/payment-pending scenarios, webhook replay and reconciliation; CI cannot fabricate this proof.

Any failed production gate requires a corrective PR, successful post-merge CI, repeat deployment and requalification. Never override a failing release gate or claim absolute absence of defects.
