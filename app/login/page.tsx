import { config } from "@/lib/config";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const demo = config.backend === "local";
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
            Distribute submissions by track, review papers, record decisions and send author emails, all in one place.
          </p>
        </div>
        <p className="text-xs text-white/60">For the conference committee and faculty reviewers only.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Use your committee or reviewer account.</p>
          <LoginForm />
          {demo && (
            <div className="mt-8 rounded-lg border border-line bg-panel p-4 text-xs text-muted">
              <div className="mb-2 font-semibold text-ink">Demo accounts (dummy data)</div>
              <p><span className="font-medium text-ink">Master admin:</span> nicom.admin@example.edu / nicom@admin</p>
              <p className="mt-1"><span className="font-medium text-ink">Faculty:</span> meera.iyer@example.edu / nicom@faculty</p>
              <p className="mt-1">Any faculty in the Faculty page works with password nicom@faculty.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
