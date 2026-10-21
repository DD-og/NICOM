"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">Login ID</label>
        <input id="username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={String(state?.values?.username ?? "")} className="input" placeholder="e.g. firstname.lastname" aria-describedby="username-help" />
        <p id="username-help" className="mt-1 text-xs text-muted">Usually the part of your university email before the @.</p>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" className="input pr-16" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls="password"
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-ink"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
