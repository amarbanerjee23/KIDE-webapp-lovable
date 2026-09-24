import { describe, expect, it } from "vitest";
import type { KideDatabase } from "./database.server";
import type { KideDatabase } from "./database.server";
import {
  ADMIN_ROLES,
  EDIT_ROLES,
  REVIEW_ROLES,
  createNotifications,
  iso,
  recordAudit,
  requireOrganizationAccess,
  requireProjectAccess,
  roleOf,
} from "./data-access.server";

type Row = Record<string, unknown>;

function mockDb(rowsByCall: Row[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const queue = [...rowsByCall];

  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("?"), values });
    return queue.shift() ?? [];
  };

  const db = Object.assign(query, {
    json: (value: unknown) => value,
  }) as unknown as KideDatabase;

  return { db, calls };
}

describe("server-side organization/project authorization", () => {
  it("fails closed when the user has no organization role", async () => {
    const { db } = mockDb([[]]);
    await expect(requireOrganizationAccess(db, "user-1", "org-1")).rejects.toThrow("not available");
  });

  it("allows membership reads but blocks viewer writes", async () => {
    const { db: readDb } = mockDb([[{ role: "viewer" }]]);
    await expect(requireOrganizationAccess(readDb, "user-1", "org-1")).resolves.toBe("viewer");

    const { db: writeDb } = mockDb([[{ role: "viewer" }]]);
    await expect(requireOrganizationAccess(writeDb, "user-1", "org-1", EDIT_ROLES)).rejects.toThrow(
      "does not allow",
    );
  });

  it("allows engineers to edit but not administer or review", async () => {
    const { db: editDb } = mockDb([[{ role: "engineer" }]]);
    await expect(requireOrganizationAccess(editDb, "user-1", "org-1", EDIT_ROLES)).resolves.toBe(
      "engineer",
    );

    const { db: adminDb } = mockDb([[{ role: "engineer" }]]);
    await expect(
      requireOrganizationAccess(adminDb, "user-1", "org-1", ADMIN_ROLES),
    ).rejects.toThrow("does not allow");

    const { db: reviewDb } = mockDb([[{ role: "engineer" }]]);
    await expect(
      requireOrganizationAccess(reviewDb, "user-1", "org-1", REVIEW_ROLES),
    ).rejects.toThrow("does not allow");
  });

  it("fails closed when a project is outside the user's memberships", async () => {
    const { db } = mockDb([[]]);
    await expect(requireProjectAccess(db, "user-1", "project-1")).rejects.toThrow("not available");
  });

  it("preserves read-only project access and blocks edits for viewers", async () => {
    const project = {
      id: "project-1",
      name: "Flight Control",
      organization_id: "org-1",
      status: "active",
      current_stage: 3,
      role: "viewer",
    };

    const { db: readDb } = mockDb([[project]]);
    await expect(requireProjectAccess(readDb, "user-1", "project-1")).resolves.toMatchObject({
      role: "viewer",
      id: "project-1",
    });

    const { db: editDb } = mockDb([[project]]);
    await expect(requireProjectAccess(editDb, "user-1", "project-1", EDIT_ROLES)).rejects.toThrow(
      "does not allow",
    );
  });

  it("does not silently widen the role capability sets", () => {
    expect(ADMIN_ROLES).toEqual(["owner", "administrator"]);
    expect(EDIT_ROLES).toEqual(["owner", "administrator", "engineer"]);
    expect(REVIEW_ROLES).toEqual(["owner", "administrator", "reviewer"]);
  });
});

describe("server-side audit and notification helpers", () => {
  it("deduplicates notification recipients", async () => {
    const { db, calls } = mockDb([[], []]);

    await createNotifications(
      db,
      ["user-a", "user-a", "user-b"],
      "org-1",
      "review.requested",
      "Review",
      "Please review",
      "/reviews",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toContain("user-a");
    expect(calls[1]?.values).toContain("user-b");
  });

  it("records audit context including project and actor", async () => {
    const { db, calls } = mockDb([[]]);

    await recordAudit(
      db,
      "actor-1",
      "org-1",
      "project.created",
      "project",
      "project-1",
      { name: "Flight Control" },
      "project-1",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual(
      expect.arrayContaining(["org-1", "project-1", "actor-1", "project.created", "project"]),
    );
  });

  it("returns null rather than fabricating an unknown role", async () => {
    const { db } = mockDb([[]]);
    await expect(roleOf(db, "user-1", "org-1")).resolves.toBeNull();
  });

  it("normalizes database dates without mutating string timestamps", () => {
    expect(iso(null)).toBeNull();
    expect(iso("2026-09-24T10:00:00.000Z")).toBe("2026-09-24T10:00:00.000Z");
    expect(iso(new Date("2026-09-24T10:00:00.000Z"))).toBe("2026-09-24T10:00:00.000Z");
  });
});
