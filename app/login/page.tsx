import { config, googleSignInEnabled } from "@/lib/config";
import { BUILD_ID } from "@/lib/version";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  domain: `Please sign in with your @${config.allowedDomain} Google account.`,
  not_registered: "Your account isn't registered on the portal yet. Please contact the conference office to be added.",
  unverified: "Google could not verify this email address.",
  state: "Your sign-in session expired. Please try again.",
  cancelled: "Sign-in was cancelled.",
  google: "Google sign-in failed. Please try again.",
  not_configured: "Google sign-in hasn't been set up on this server yet.",
  session_ended: "Your session has ended (your access may have changed). Please sign in again.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const google = googleSignInEnabled();

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#1f3a68] p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-white font-bold text-[#1f3a68]">N</div>
          <div>
            <div className="font-semibold">Institute of Management</div>
            <div className="text-sm text-white/70">Nirma University, Ahmedabad</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">{config.conferenceName}<br />Paper Review Portal</h1>
          <p className="mt-4 max-w-md text-white/80">
            Distribute submissions by track, review papers double-blind, record decisions and prepare author emails, all in one place.
          </p>
        </div>
        <p className="text-xs text-white/60">For the conference committee and faculty reviewers only.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Use the login ID and password given to you by the conference office.</p>

          {error && ERRORS[error] && <p role="alert" className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{ERRORS[error]}</p>}

          <LoginForm />
          <p className="mt-6 text-center text-xs text-faint">version <span className="font-mono">{BUILD_ID}</span></p>

          {google && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
              <a href="/auth/google" className="btn btn-secondary w-full py-2.5 text-ink">
                <GoogleIcon /> Sign in with Google (@{config.allowedDomain})
              </a>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
