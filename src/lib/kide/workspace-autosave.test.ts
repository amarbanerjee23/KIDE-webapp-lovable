import { describe, expect, it } from "vitest";
import {
  autosaveDecision,
  blocksProjectSwitch,
  hasQueuedAutosave,
  isCurrentAutosaveTicket,
} from "./workspace-autosave";

describe("project-scoped sequential autosave", () => {
  it("ignores responses from a previous project, a reload, or an anonymous session", () => {
    const oldRequest = { projectId: "alpha", generation: 4 };
    expect(isCurrentAutosaveTicket(oldRequest, 4, "alpha")).toBe(true);
    expect(isCurrentAutosaveTicket(oldRequest, 5, "alpha")).toBe(false);
    expect(isCurrentAutosaveTicket(oldRequest, 5, "beta")).toBe(false);
    expect(isCurrentAutosaveTicket(oldRequest, 4, null)).toBe(false);
    expect(isCurrentAutosaveTicket(oldRequest, 4, "beta")).toBe(false);
  });

  it("serializes rapid edits instead of sending concurrent stale-version writes", () => {
    const original = JSON.stringify({ "device.dml": "initial" });
    const first = JSON.stringify({ "device.dml": "edit A" });
    const second = JSON.stringify({ "device.dml": "edit B" });

    expect(autosaveDecision(original, original, false)).toBe("clean");
    expect(autosaveDecision(first, original, false)).toBe("send");
    // Edit B arrived while A was in flight: B is queued, never dispatched
    // with A's old expectedSavedAt.
    expect(autosaveDecision(second, original, true)).toBe("wait");
    expect(hasQueuedAutosave(first, second)).toBe(true);
    // After A commits, a new request with its latest CAS revision may send B.
    expect(autosaveDecision(second, first, false)).toBe("send");
    expect(hasQueuedAutosave(second, second)).toBe(false);
    expect(autosaveDecision(second, second, false)).toBe("clean");
  });

  it("does not declare saved when a user reverts to the old value while a write is pending", () => {
    const original = JSON.stringify({ "device.dml": "original" });
    const pending = JSON.stringify({ "device.dml": "draft" });
    expect(autosaveDecision(original, original, true)).toBe("wait");
    expect(hasQueuedAutosave(pending, original)).toBe(true);
    expect(autosaveDecision(original, pending, false)).toBe("send");
  });
  it("blocks selection during debounce, pending commit and failed offline edits", () => {
    const old = JSON.stringify({ "model.dml": "old" });
    const edited = JSON.stringify({ "model.dml": "edited" });
    expect(blocksProjectSwitch(old, old, false)).toBe(false);
    expect(blocksProjectSwitch(edited, old, false)).toBe(true);
    expect(blocksProjectSwitch(edited, old, true)).toBe(true);
    expect(blocksProjectSwitch(old, old, true)).toBe(true);
    expect(blocksProjectSwitch(old, null, false)).toBe(false);
  });

});
