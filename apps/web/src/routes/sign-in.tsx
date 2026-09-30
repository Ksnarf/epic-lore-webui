import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fetchAuthStatus } from "../api/lore-client.js";

/**
 * v1 task 8 (Okta auth). Sign-in screen -- also where an already-signed-in
 * visit or a completed-elsewhere login lands, since it checks status once on
 * mount regardless of how it was reached.
 *
 * **Why "Sign in" opens a NEW window instead of navigating this tab:**
 * `epic-lore-authz`'s own login flow (unmodified -- see
 * apps/bff/src/routes/auth.ts's doc comment) ends the browser on a static
 * "you are signed in, you may close this tab" page with no redirect back
 * into this app. Navigating THIS tab to `/login` would stay stuck there
 * with no JS of ours left running to notice the login completed. Opening it
 * in a separate window instead lets this tab stay alive, polling
 * `GET /api/auth/status` (which the BFF answers by polling `GetAuthSession`
 * itself -- see that route's doc comment) until the session lands, then
 * redirecting into the app. The separate window ending on
 * `epic-lore-authz`'s "close this tab" page is exactly what that page's own
 * text already tells the user to do.
 */
export function SignInRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const popupRef = useRef<Window | null>(null);

  // Covers both "already signed in" (direct visit, refresh) and "signed in
  // in a tab that's since been closed, this one just needs to notice" --
  // either way, one status check on mount is enough to skip the button.
  useEffect(() => {
    let cancelled = false;
    fetchAuthStatus().then((status) => {
      if (!cancelled && status.authenticated) {
        navigate(next, { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // Deliberately run once on mount only -- `navigate`/`next` are stable
    // enough for this repo's router setup that re-running this effect on
    // their identity would just repeat the same one-shot check.
  }, []);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const interval = setInterval(() => {
      fetchAuthStatus()
        .then((status) => {
          if (status.authenticated) {
            clearInterval(interval);
            navigate(next, { replace: true });
          } else if (status.expired) {
            clearInterval(interval);
            setPending(false);
            setError("Sign-in timed out. Please try again.");
          }
        })
        .catch(() => {
          // Transient network blip while polling -- keep trying until the
          // window itself expires (surfaced via `expired` above).
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [pending, navigate, next]);

  function handleSignIn() {
    setError(undefined);
    setPending(true);
    popupRef.current = window.open("/login", "lore-webui-login", "width=480,height=640");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Sign in to epic-lore</h1>
        <p className="mb-6 text-sm text-slate-400">
          Signs in via your organization's identity provider through epic-lore-authz.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Waiting for sign-in in the other window…" : "Sign in"}
        </button>
        {pending && (
          <p className="mt-4 text-xs text-slate-500">
            A sign-in window opened separately. Finish signing in there; this page will continue automatically.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
