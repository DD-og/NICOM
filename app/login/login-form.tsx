"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@nirmauni.ac.in" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
