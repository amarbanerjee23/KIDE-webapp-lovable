import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { getWorkspace, updateProfile } from "@/lib/teams.functions";
import { authClient } from "@/lib/auth-client";
import { clearPostAuthRedirect } from "@/lib/auth/post-auth-redirect";
import {
  applyUiPreferences,
  normalizeUiPreferences,
  UI_DENSITIES,
  UI_THEMES,
} from "@/lib/ui-preferences";

const title = "KIDE Profile — your account and working preferences";
const description =
  "Set your display name, job title, interface density and theme for the KIDE engineering workspace.";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const load = useServerFn(getWorkspace);
  const save = useServerFn(updateProfile);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [density, setDensity] = useState("compact");
  const [theme, setTheme] = useState("dark");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const data = await load();
      setEmail(data.email);
      setDisplayName(data.profile?.display_name ?? "");
      setJobTitle(data.profile?.job_title ?? "");
      const prefs = normalizeUiPreferences(data.profile?.preferences);
      setDensity(prefs.density);
      setTheme(prefs.theme);
      applyUiPreferences(prefs);
      setOrgs(data.organizations.map((org) => ({ id: org.id, name: org.name, role: org.role })));
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load your profile.";
      setLoadError(message);
      throw error;
    }
  }, [load]);

  useEffect(() => {
    void loadProfile().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load your profile."),
    );
  }, [loadProfile]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Profile" />
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>

        {loadError ? (
          <div
            role="alert"
            className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-4"
          >
            <p className="text-sm font-medium">Could not load your profile</p>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                void loadProfile().catch((error) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not load your profile.",
                  ),
                )
              }
            >
              Retry
            </Button>
          </div>
        ) : null}

        <div className="mt-6 space-y-4 rounded-md border border-border bg-card p-5">
          <Field label="Display name" value={displayName} onChange={setDisplayName} />
          <Field
            label="Job title"
            value={jobTitle}
            onChange={setJobTitle}
            placeholder="Control systems engineer"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="Density"
              value={density}
              onChange={setDensity}
              options={[...UI_DENSITIES]}
            />
            <Choice
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[...UI_THEMES]}
            />
          </div>
          <Button
            disabled={busy || Boolean(loadError)}
            onClick={async () => {
              setBusy(true);
              try {
                const preferences = normalizeUiPreferences({ density, theme });
                await save({
                  data: {
                    displayName,
                    jobTitle,
                    density: preferences.density,
                    theme: preferences.theme,
                  },
                });
                applyUiPreferences(preferences);
                toast.success("Profile saved");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Could not save your profile.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save profile
          </Button>
        </div>

        <section className="mt-6 rounded-md border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            Your organizations
          </h2>
          {orgs.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              You are not in an organization yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orgs.map((org) => (
                <li key={org.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{org.name}</span>
                  <span className="text-[11px] text-muted-foreground">{org.role}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await authClient.signOut();
            clearPostAuthRedirect();
            window.location.replace("/");
          }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
