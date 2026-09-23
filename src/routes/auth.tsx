import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Network, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getActiveBrowserSession } from "@/lib/auth/active-session";
import { consumePostAuthRedirect } from "@/lib/auth/post-auth-redirect";

const title = "Sign in — KIDE Systems Engineering";
const description = "Secure access to your KIDE engineering organization and projects.";
const OAUTH_PENDING_KEY = "kide:oauth-pending";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    isSupabaseConfigured
      ? ""
      : "Authentication is unavailable because Supabase environment variables are not configured.",
  );
  const [busy, setBusy] = useState(false);

  const completeAuthentication = useCallback(async (showValidationError: boolean) => {
    const activeSession = await getActiveBrowserSession();

    if (!activeSession) {
      if (showValidationError) {
        setMessage("Your sign-in session could not be validated. Please sign in again.");
      }
      return false;
    }

    window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
    window.location.replace(consumePostAuthRedirect());
    return true;
  }, []);

  useEffect(() => {
    if (
      !isSupabaseConfigured ||
      typeof window === "undefined" ||
      window.sessionStorage.getItem(OAUTH_PENDING_KEY) !== "1"
    ) {
      return;
    }

    let active = true;

    const finishOAuth = async () => {
      if (!active) return;
      await completeAuthentication(false);
    };

    void finishOAuth();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        active &&
        session &&
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED")
      ) {
        void finishOAuth();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [completeAuthentication]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setMessage(
        "Authentication is unavailable because Supabase environment variables are not configured.",
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Check your email to confirm your account.");
        return;
      }

      await completeAuthentication(true);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!isSupabaseConfigured) {
      setMessage(
        "Authentication is unavailable because Supabase environment variables are not configured.",
      );
      return;
    }

    setBusy(true);
    setMessage("");
    window.sessionStorage.setItem(OAUTH_PENDING_KEY, "1");

    const redirectUri = new URL("/auth", window.location.origin).toString();

    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
        extraParams: { prompt: "select_account" },
      });

      if (result.error) {
        window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
        setMessage(result.error.message);
        return;
      }

      if (!result.redirected) {
        await completeAuthentication(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden border-r border-border bg-card/70 p-12 lg:flex lg:flex-col">
        <a href="/" className="flex items-center gap-2 text-sm font-semibold">
          <img src="/favicon.png" alt="" className="size-8" />
          KIDE
        </a>
        <div className="my-auto max-w-lg">
          <div className="mb-6 grid size-12 place-items-center rounded-md border border-capability/40 bg-capability/10">
            <Network className="text-capability" />
          </div>
          <h1 className="text-4xl font-semibold leading-tight">
            Engineering decisions,
            <br />
            with evidence attached.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Create explainable control designs from requirements, device knowledge, and qualified
            synthesis rules.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <Benefit
              icon={ShieldCheck}
              title="Tenant isolated"
              body="Organization data is protected at every access boundary."
            />
            <Benefit
              icon={KeyRound}
              title="Auditable by design"
              body="Every synthesis result carries provenance and validation evidence."
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          KIDE · Knowledge-Integrated Design Environment
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Button asChild variant="ghost" size="sm" className="mb-8">
            <a href="/">
              <ArrowLeft />
              Back to KIDE
            </a>
          </Button>
          <p className="text-xs font-semibold uppercase text-primary">Secure workspace</p>
          <h2 className="mt-2 text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Continue to your engineering organization."
              : "Start a governed KIDE workspace for your team."}
          </p>

          {!isSupabaseConfigured && (
            <div
              role="alert"
              className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
              (or VITE_SUPABASE_ANON_KEY), then restart the application.
            </div>
          )}

          <Button
            variant="outline"
            className="mt-7 w-full"
            onClick={() => void google()}
            disabled={busy || !isSupabaseConfigured}
          >
            <span className="font-semibold">G</span>
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR USE EMAIL
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={!isSupabaseConfigured}
                className="mt-1.5"
                placeholder="engineer@company.com"
              />
            </div>
            <div>
              <div className="flex justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <span className="text-xs text-primary">Forgot password?</span>
                )}
              </div>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={!isSupabaseConfigured}
                className="mt-1.5"
              />
            </div>
            {message && (
              <p
                role="status"
                className="rounded-md border border-border bg-secondary/40 p-3 text-xs"
              >
                {message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy || !isSupabaseConfigured}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to KIDE?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary"
              disabled={!isSupabaseConfigured}
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function Benefit({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="border-l-2 border-primary pl-3">
      <Icon className="mb-2 size-4 text-primary" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
