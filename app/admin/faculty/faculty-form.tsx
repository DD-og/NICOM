"use client";

import { useActionState, useState } from "react";
import { saveFaculty } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";
import type { Faculty, Role } from "@/lib/types";

export function FacultyForm({ faculty, domains, allowedDomain }: { faculty?: Faculty; domains: string[]; allowedDomain: string }) {
  const [state, action] = useActionState(saveFaculty, undefined);
  const [role, setRole] = useState<Role>(faculty?.role ?? "faculty");
  // After a failed save, keep what was typed (React resets the form to these defaults).
  const v = state?.values;
  const name = v ? String(v.name ?? "") : faculty?.name;
  const email = v ? String(v.email ?? "") : faculty?.email;
  const tracks = v ? ([] as string[]).concat(v.domains ?? []) : faculty?.domains ?? [];
  const maxLoad = v ? String(v.maxLoad ?? "") : String(faculty?.maxLoad ?? 8);

  return (
    <form action={action} className="space-y-4">
      {faculty && <input type="hidden" name="id" value={faculty.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label text-xs" htmlFor={`name-${faculty?.id ?? "new"}`}>Full name</label>
          <input id={`name-${faculty?.id ?? "new"}`} name="name" required defaultValue={name} className="input" placeholder="Dr. Firstname Lastname" />
        </div>
        <div>
          <label className="label text-xs" htmlFor={`email-${faculty?.id ?? "new"}`}>Google account email</label>
          <input id={`email-${faculty?.id ?? "new"}`} name="email" type="email" required defaultValue={email} className="input" placeholder={`name@${allowedDomain}`} />
        </div>
      </div>

      <fieldset>
        <legend className="label text-xs">Access</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["faculty", "Reviewer", "Reviews the papers assigned to them"],
            ["master", "Admin", "Full committee access: assign, decide, send emails"],
          ] as const).map(([value, label, help]) => (
            <label key={value} className="flex cursor-pointer gap-2 rounded-lg border border-line p-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-0.5" />
              <span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{help}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {role === "faculty" && (
        <>
          <fieldset>
            <legend className="label text-xs">Review tracks</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {domains.map((d) => (
                <label key={d} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="domains" value={d} defaultChecked={tracks.includes(d)} className="size-4" />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="w-40">
            <label className="label text-xs" htmlFor={`max-${faculty?.id ?? "new"}`}>Max papers</label>
            <input id={`max-${faculty?.id ?? "new"}`} name="maxLoad" type="number" min={0} defaultValue={maxLoad} className="input" />
          </div>
        </>
      )}

      {faculty ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={faculty.active} className="size-4" /> Active (can sign in{role === "faculty" ? " and receive papers" : ""})
        </label>
      ) : (
        <input type="hidden" name="active" value="on" />
      )}
      <p className="text-xs text-muted">Sign-in is with Google only. The person signs in with this @{allowedDomain} account; there is no password.</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{faculty ? "Save changes" : "Add account"}</SubmitButton>
        {state?.error && <span className="text-sm text-bad">{state.error}</span>}
        {state?.message && <span className="text-sm text-good">{state.message}</span>}
      </div>
    </form>
  );
}
