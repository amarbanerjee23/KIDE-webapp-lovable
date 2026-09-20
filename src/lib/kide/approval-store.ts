import { useSyncExternalStore } from "react";

/**
 * Which design the team selected and approved, shared by the synthesis
 * review, the Trust Centre and the Release Centre. Approvals are recorded
 * against the design name and the exact generated control model, so an
 * edit to the models invalidates them.
 */
export interface Approval {
  candidateId: string;
  candidateName: string;
  fingerprint: string;
  approvedAt: string;
}

let selectedId: string | null = null;
let approval: Approval | null = null;
const listeners = new Set<() => void>();
let snapshot: { selectedId: string | null; approval: Approval | null } = { selectedId, approval };

function emit() {
  snapshot = { selectedId, approval };
  for (const listener of listeners) listener();
}

export function selectCandidate(id: string | null) {
  selectedId = id;
  emit();
}

export function approveCandidate(entry: Approval) {
  approval = entry;
  selectedId = entry.candidateId;
  emit();
}

export function revokeApproval() {
  approval = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApprovalState() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** An approval only counts while the generated design is byte-identical. */
export function approvalIsCurrent(current: Approval | null, fingerprint: string | null) {
  return Boolean(current && fingerprint && current.fingerprint === fingerprint);
}
