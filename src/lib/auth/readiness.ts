export type AuthRequirementState = "ready" | "missing" | "too_short";

export interface AuthReadiness {
  configured: boolean;
  googleConfigured: boolean;
  requirements: {
    databaseUrl: Extract<AuthRequirementState, "ready" | "missing">;
    betterAuthUrl: Extract<AuthRequirementState, "ready" | "missing">;
    betterAuthSecret: AuthRequirementState;
  };
}

export interface AuthReadinessIssue {
  code:
    | "DATABASE_URL_MISSING"
    | "BETTER_AUTH_URL_MISSING"
    | "BETTER_AUTH_SECRET_MISSING"
    | "BETTER_AUTH_SECRET_TOO_SHORT";
  message: string;
  operatorHint: string;
}

export function authReadinessIssues(readiness: AuthReadiness): AuthReadinessIssue[] {
  const issues: AuthReadinessIssue[] = [];

  if (readiness.requirements.databaseUrl === "missing") {
    issues.push({
      code: "DATABASE_URL_MISSING",
      message: "The PostgreSQL database is not configured.",
      operatorHint: "Set DATABASE_URL to a reachable PostgreSQL connection string.",
    });
  }

  if (readiness.requirements.betterAuthUrl === "missing") {
    issues.push({
      code: "BETTER_AUTH_URL_MISSING",
      message: "The public authentication URL is not configured.",
      operatorHint: "Set BETTER_AUTH_URL to this deployment's public KIDE URL.",
    });
  }

  if (readiness.requirements.betterAuthSecret === "missing") {
    issues.push({
      code: "BETTER_AUTH_SECRET_MISSING",
      message: "The authentication signing secret is not configured.",
      operatorHint: "Set BETTER_AUTH_SECRET to a random value of at least 32 characters.",
    });
  } else if (readiness.requirements.betterAuthSecret === "too_short") {
    issues.push({
      code: "BETTER_AUTH_SECRET_TOO_SHORT",
      message: "The authentication signing secret is configured but too short.",
      operatorHint: "Replace BETTER_AUTH_SECRET with a random value of at least 32 characters.",
    });
  }

  return issues;
}

export function authReadinessSummary(readiness: AuthReadiness): string {
  const issues = authReadinessIssues(readiness);
  if (issues.length === 0) return "Authentication is configured.";
  return issues.map((issue) => issue.message).join(" ");
}
