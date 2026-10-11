# Checkpoint and active working-copy persistence integrity

PR85 enforces a single server-side validation contract for both private
working-copy saves and named checkpoint saves. Earlier, a client directly
calling the `saveCheckpoint` server function could choose the reserved
`__kide_working_copy__` label, creating a record that the active project
loader could mistake for its own durable working copy.

All authenticated editor writes now require canonical, relative model paths
with supported KIDE DSL extensions (`.dml`, `.op`, `.mncspec`, `.cap`,
`.activity`) and reject dot segments, backslashes, unsafe characters and
case-insensitive duplicate paths. The same storage limits apply to checkpoint
and working-copy data: 100 files, 512 characters per path, 1,000,000
characters per file and 5,000,000 characters in total. Named checkpoint
labels cannot impersonate the private working-copy label; diagnostic counts
must be nonnegative integers.

On read, corrupt legacy source maps are never treated as valid saved
models. An invalid named checkpoint appears with an explanatory warning
and its Restore action disabled. The restoration handler also refuses a
null source map instead of replacing the user's models with an empty set.
An existing corrupt **active working-copy row** is a load error rather
than a legitimately empty project: the workspace stays inaccessible and
the existing recovery guard offers Retry and Choose another project.
No records are rewritten or deleted by this patch.

Verification: `bunx vitest run src/lib/project-working-copy.test.ts`,
`bash scripts/ci/test-role-gated-cx.sh`, and the real authenticated
`tests/e2e/checkpoint-integrity.spec.ts` PostgreSQL/Better Auth suite.

A malformed legacy snapshot must be recovered from a verified backup or a
different valid checkpoint, not restored through the unsafe path.
