import { useSyncExternalStore } from "react";
import type { SynthesisReport } from "@/lib/kide/synthesis";

export type ServerVerificationStatus = "idle" | "running" | "completed" | "failed";

export interface ServerVerificationState {
  status: ServerVerificationStatus;
  report: SynthesisReport | null;
  error: string | null;
}

const initialState: ServerVerificationState = {
  status: "idle",
  report: null,
  error: null,
};

let state = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function resetServerVerification() {
  state = initialState;
  emit();
}

export function setServerVerificationRunning() {
  state = { status: "running", report: null, error: null };
  emit();
}

export function setServerVerificationCompleted(report: SynthesisReport) {
  state = { status: "completed", report, error: null };
  emit();
}

export function setServerVerificationFailed(error: string) {
  state = { status: "failed", report: null, error };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ServerVerificationState {
  return state;
}

export function useServerVerificationState(): ServerVerificationState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
