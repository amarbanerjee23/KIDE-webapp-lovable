/**
 * Pure autosave transition guards. Prevent stale project responses from
 * masquerading as success and avoid parallel writes with the same CAS version.
 */
export interface AutosaveTicket {
  projectId: string;
  generation: number;
}

export function isCurrentAutosaveTicket(
  ticket: AutosaveTicket,
  currentGeneration: number,
  loadedProjectId: string | null,
): boolean {
  return ticket.generation === currentGeneration && ticket.projectId === loadedProjectId;
}

export type AutosaveDecision = "clean" | "wait" | "send";

export function autosaveDecision(
  latestSerialized: string,
  lastCommittedSerialized: string | null,
  inFlight: boolean,
): AutosaveDecision {
  if (inFlight) return "wait";
  return latestSerialized === lastCommittedSerialized ? "clean" : "send";
}

export function hasQueuedAutosave(
  justCommittedSerialized: string,
  latestSerialized: string,
): boolean {
  return justCommittedSerialized !== latestSerialized;
}

/** A project can only change when the committed source map is current. */
export function blocksProjectSwitch(
  serializedSources: string,
  lastSavedSources: string | null,
  inFlight: boolean,
): boolean {
  return lastSavedSources !== null && (inFlight || serializedSources !== lastSavedSources);
}
