<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


## KIDE architecture rule

All KIDE domain computation runs in the browser in TypeScript. This includes parsing, AST/linking,
diagnostics, synthesis, scoring, scenarios, assurance/qualification calculations, code generation,
and engineering transforms.

The TanStack/Node backend is only an authenticated I/O boundary for database queries/mutations,
persistence, file/object storage, payments/webhooks, and secret-backed infrastructure calls.

Do not add server-side KIDE computation, duplicate parsers, background compute workers, Java,
Python, Celery, RabbitMQ, or Jena/Fuseki without an explicit architecture decision that supersedes
`docs/architecture/client-compute-reference.md`.

Session lifecycle is centralized at the application root. Only `/` and `/auth` are public UI
routes. Any other client route without an active Better Auth session must redirect to `/`.
Protected UI must not render until the current pathname has been verified. Anonymous protected
routes must use a browser-level replacement to `/`; do not rely solely on an in-app router
transition for this auth boundary. Server functions independently validate the signed Better Auth
cookie and must never trust browser route state as an authorization boundary. Do not add competing
page-level auth listeners or duplicate root redirect effects.

Authentication entry invariant: visiting `/auth` must never auto-enter a protected route.
Home-page Sign In / Start Engineering actions must clear stale post-auth redirect state and stay on
`/auth` until authentication succeeds and the resulting session is validated. OAuth may leave
`/auth` only when KIDE itself initiated the OAuth flow.

Project workspace invariant: authenticated engineering pages must never fabricate sample project
content. Persisted source-map filenames are authoritative and DSL kinds are derived from their file
extensions. Demo/reference sources may enter a project only through an explicit user action. Do not
hard-code sample filenames such as `MissionPlanning.activity` into project editors or designers.

Working-copy concurrency invariant: project autosave must be optimistic and fail closed. A browser
may update the hidden working copy only against the exact persisted version it loaded. On version
mismatch, preserve local edits, stop further autosaves for that project, and surface a conflict;
never silently apply last-write-wins. Empty project source maps are valid.

Model file lifecycle invariant: create, rename, and delete operations for KIDE DSL files belong in
the browser workspace store. Validate path shape, DSL extension, and duplicate names before mutating
the source map. Do not add a separate file-management backend; persistence must continue through the
existing authenticated working-copy source-map save path.

Authentication/data-platform invariant: KIDE is self-hostable and must not require Supabase,
Firebase, Auth0, or another hosted BaaS. Better Auth owns authentication/session handling and
PostgreSQL is the application persistence boundary. Production secrets stay server-side.
