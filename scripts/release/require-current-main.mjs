function fail(message) {
  throw new Error(`Release main-head guard rejected: ${message}`);
}
const [checkedOut, dispatched, currentMain, branch] = process.argv.slice(2);
const isSha = (value) => /^[0-9a-f]{40}$/.test(value ?? "");
if (![checkedOut, dispatched, currentMain].every(isSha)) {
  fail("expected three full lowercase Git commit IDs");
}
if (branch !== "refs/heads/main") fail("official release must be manually dispatched from main");
if (checkedOut !== dispatched || checkedOut !== currentMain) {
  fail("main changed after dispatch or evidence qualification; do not publish a stale commit");
}
console.log(`Fresh main tip and dispatched SHA match: ${checkedOut}`);
