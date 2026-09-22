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
routes. Any other client route without an active browser session must redirect to `/`. An active session
requires a cached Supabase session plus successful current-user validation; do not trust
`getSession()` alone and do not reintroduce preview/editor session brokerage. Every protected
pathname must be checked on navigation, and protected UI must not render until that exact pathname
has been verified. Do not add
competing page-level auth listeners or duplicate root redirect effects.
