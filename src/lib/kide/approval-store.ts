import { useEffect, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveProject, useActiveProject } from "@/lib/active-project";
import {
  loadProjectReleaseApproval,
  type PersistedReleaseApproval,
} from "@/lib/release-approval.functions";
import type { GraphSynthesisInputEvidence } from "./graph-synthesis-promotion";
import { sha256 } from "./sha256";

export interface Approval extends Omit<PersistedReleaseApproval, "approvedBy"> {
  approvedBy?: string;
}

interface ApprovalSnapshot {
  selectedId: string | null;
  approval: Approval | null;
}

const EMPTY_SNAPSHOT: ApprovalSnapshot = { selectedId: null, approval: null };
const listeners = new Set<() => void>();
const snapshots = new Map<string, ApprovalSnapshot>();

function activeProjectId() {
  return getActiveProject()?.projectId ?? null;
}

function snapshotFor(projectId: string | null): ApprovalSnapshot {
  if (!projectId) return EMPTY_SNAPSHOT;
  return snapshots.get(projectId) ?? EMPTY_SNAPSHOT;
}

function setProjectSnapshot(projectId: string, next: ApprovalSnapshot) {
  snapshots.set(projectId, next);
  for (const listener of listeners) listener();
}

export function selectCandidate(id: string | null) {
  const projectId = activeProjectId();
  if (!projectId) return;
  const current = snapshotFor(projectId);
  setProjectSnapshot(projectId, { ...current, selectedId: id });
}

export function approveCandidate(entry: Approval) {
  const projectId = activeProjectId();
  if (!projectId) return;
  setProjectSnapshot(projectId, {
    selectedId: entry.candidateId,
    approval: entry,
  });
}

export function revokeApproval() {
  const projectId = activeProjectId();
  if (!projectId) return;
  const current = snapshotFor(projectId);
  setProjectSnapshot(projectId, { ...current, approval: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApprovalState() {
  const project = useActiveProject();
  const projectId = project?.projectId ?? null;
  const load = useServerFn(loadProjectReleaseApproval);

  useEffect(() => {
    if (!projectId) return;

    let active = true;
    void load({ data: { projectId } })
      .then((approval) => {
        if (!active) return;
        setProjectSnapshot(projectId, {
          selectedId: approval?.candidateId ?? null,
          approval,
        });
      })
      .catch((error) => {
        console.warn(
          "[Approval] Could not load persisted release approval:",
          error instanceof Error ? error.message : String(error),
        );
      });

    return () => {
      active = false;
    };
  }, [load, projectId]);

  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(projectId),
    () => EMPTY_SNAPSHOT,
  );
}

/** An approval only counts while the generated design identity is unchanged. */
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
  return current.fingerprint === approvalFingerprint(generatedMnc);
}
