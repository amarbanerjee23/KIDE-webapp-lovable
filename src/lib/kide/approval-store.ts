import { useSyncExternalStore } from "react";
import { getActiveProject, useActiveProject } from "@/lib/active-project";
import type { GraphSynthesisInputEvidence } from "./graph-synthesis-promotion";
import { sha256 } from "./sha256";

const STORAGE_KEY = "kide:approval-state:v1";

export interface Approval {
  candidateId: string;
  candidateName: string;
  fingerprint: string;
  approvedAt: string;
  graphAssistance?: {
    graphSnapshotFingerprint: string;
    baselineSynthesisFingerprint: string;
    sourceFingerprints: string[];
  };
  graphSynthesisInputs?: GraphSynthesisInputEvidence;
}

interface ApprovalSnapshot {
  selectedId: string | null;
  approval: Approval | null;
}

const EMPTY_SNAPSHOT: ApprovalSnapshot = { selectedId: null, approval: null };
const listeners = new Set<() => void>();
const snapshots = new Map<string, ApprovalSnapshot>();
let hydrated = false;

function readStored(): Record<string, ApprovalSnapshot> {
  if (typeof window === "undefined") return {};
  const value = window.localStorage.getItem(STORAGE_KEY);
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, ApprovalSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  for (const [projectId, entry] of Object.entries(readStored())) {
    if (!entry || typeof entry !== "object") continue;
    snapshots.set(projectId, {
      selectedId: typeof entry.selectedId === "string" ? entry.selectedId : null,
      approval: entry.approval ?? null,
    });
  }
}

function writeStored() {
  if (typeof window === "undefined") return;
  const payload = Object.fromEntries(snapshots.entries());
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function activeProjectId() {
  return getActiveProject()?.projectId ?? null;
}

function snapshotFor(projectId: string | null): ApprovalSnapshot {
  hydrate();
  if (!projectId) return EMPTY_SNAPSHOT;
  return snapshots.get(projectId) ?? EMPTY_SNAPSHOT;
}

function updateActiveProject(next: ApprovalSnapshot) {
  hydrate();
  const projectId = activeProjectId();
  if (!projectId) return;

  snapshots.set(projectId, next);
  writeStored();
  for (const listener of listeners) listener();
}

export function selectCandidate(id: string | null) {
  const current = snapshotFor(activeProjectId());
  updateActiveProject({ ...current, selectedId: id });
}

export function approveCandidate(entry: Approval) {
  updateActiveProject({
    selectedId: entry.candidateId,
    approval: entry,
  });
}

export function revokeApproval() {
  const current = snapshotFor(activeProjectId());
  updateActiveProject({ ...current, approval: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    hydrated = false;
    snapshots.clear();
    hydrate();
    for (const current of listeners) current();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useApprovalState() {
  const project = useActiveProject();
  const projectId = project?.projectId ?? null;

  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(projectId),
    () => EMPTY_SNAPSHOT,
  );
}

/** An approval only counts while the generated design is byte-identical. */
export function approvalIsCurrent(current: Approval | null, fingerprint: string | null) {
  return Boolean(current && fingerprint && current.fingerprint === fingerprint);
}

export function approvalFingerprint(
  generatedMnc: string,
  graphSynthesisInputs?: GraphSynthesisInputEvidence | null,
) {
  return sha256(
    JSON.stringify({
      generatedMnc,
      graphSynthesisInputs: graphSynthesisInputs ?? null,
    }),
  );
}

export function approvalIsCurrentForSynthesisContext(
  current: Approval | null,
  generatedMnc: string | null,
  graphSynthesisInputs: GraphSynthesisInputEvidence | null,
) {
  if (!current || !generatedMnc) return false;

  if (graphSynthesisInputs) {
    if (!current.graphSynthesisInputs) return false;
    if (JSON.stringify(current.graphSynthesisInputs) !== JSON.stringify(graphSynthesisInputs)) {
      return false;
    }
    return current.fingerprint === approvalFingerprint(generatedMnc, graphSynthesisInputs);
  }

  if (current.graphSynthesisInputs) return false;
  return current.fingerprint === generatedMnc;
}
