#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Cloud SQL restore operation contract failed: $*" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

node - "$tmp" <<'JS'
const fs = require("fs");
const path = process.argv[2];
const now = new Date().toISOString();
const source = {
  name: "kide-web-app", project: "test-project", state: "RUNNABLE",
  region: "us-central1", databaseVersion: "POSTGRES_17",
  settings: { backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: true } },
};
const recovery = { ...source, name: "recovery-qa" };
const op = {
  name: "op-123", targetId: "recovery-qa", targetProject: "test-project",
  operationType: "CLONE", status: "DONE", endTime: now,
};
for (const [name, data] of Object.entries({
  "source.json": source, "recovery.json": recovery, "operation.json": op,
  "databases.json": [{ name: "kide", instance: "recovery-qa" }],
})) fs.writeFileSync(`${path}/${name}`, JSON.stringify(data));
JS

cat >"$tmp/bin/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"sql operations describe op-123"*) cat "$RESTORE_MOCK_DIR/operation.json" ;;
  *"sql instances describe kide-web-app"*) cat "$RESTORE_MOCK_DIR/source.json" ;;
  *"sql instances describe recovery-qa"*) cat "$RESTORE_MOCK_DIR/recovery.json" ;;
  *"sql databases list --instance=recovery-qa"*) cat "$RESTORE_MOCK_DIR/databases.json" ;;
  *) echo "unexpected gcloud command" >&2; exit 98 ;;
esac
MOCK
chmod +x "$tmp/bin/gcloud"

run() {
  PATH="$tmp/bin:$PATH" RESTORE_MOCK_DIR="$tmp" \
  PROJECT_ID=test-project CLOUD_SQL_INSTANCE=kide-web-app \
  RESTORE_DRILL_REF=op-123 RESTORE_DRILL_RECOVERY_INSTANCE=recovery-qa \
  OUTPUT_FILE="$tmp/evidence.json" bash scripts/launch/check-restore-drill.sh
}

run >"$tmp/passed.log"
node - "$tmp/evidence.json" <<'JS'
const data = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
if (data.operationType !== "CLONE" || data.operationStatus !== "DONE" ||
    data.recoveryInstance !== "recovery-qa" ||
    data.contentQueriesVerified !== false || data.sourceRequestVerified !== false) {
  throw new Error("CI clone metadata acceptance contract did not pass");
}
JS

for failure in other-target failed-clone no-pitr wrong-version stale-operation; do
  node - "$tmp" "$failure" <<'JS'
const fs = require("fs");
const path = process.argv[2], reason = process.argv[3];
const op = JSON.parse(fs.readFileSync(`${path}/operation.json`, "utf8"));
const source = JSON.parse(fs.readFileSync(`${path}/source.json`, "utf8"));
const recovery = JSON.parse(fs.readFileSync(`${path}/recovery.json`, "utf8"));
if (reason === "other-target") op.targetId = "kide-web-app";
if (reason === "failed-clone") op.status = "FAILED";
if (reason === "no-pitr") source.settings.backupConfiguration.pointInTimeRecoveryEnabled = false;
if (reason === "wrong-version") recovery.databaseVersion = "MYSQL_8_0";
if (reason === "stale-operation") op.endTime = "2020-01-01T00:00:00Z";
fs.writeFileSync(`${path}/operation.json`, JSON.stringify(op));
fs.writeFileSync(`${path}/source.json`, JSON.stringify(source));
fs.writeFileSync(`${path}/recovery.json`, JSON.stringify(recovery));
JS
  if run >"$tmp/rejected.log" 2>&1; then
    fail "accepted invalid recovery: $failure"
  fi
  node - "$tmp" <<'JS'
const fs = require("fs");
const path = process.argv[2];
const op = JSON.parse(fs.readFileSync(`${path}/operation.json`, "utf8"));
const source = JSON.parse(fs.readFileSync(`${path}/source.json`, "utf8"));
const recovery = JSON.parse(fs.readFileSync(`${path}/recovery.json`, "utf8"));
op.targetId = "recovery-qa"; op.status = "DONE"; op.endTime = new Date().toISOString();
source.settings.backupConfiguration.pointInTimeRecoveryEnabled = true;
recovery.databaseVersion = "POSTGRES_17";
for (const [key, data] of Object.entries({
  "operation.json": op, "source.json": source, "recovery.json": recovery,
})) fs.writeFileSync(`${path}/${key}`, JSON.stringify(data));
JS
done

echo "Cloud SQL live recovery metadata gate and failure cases validated."
