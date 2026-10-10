"use client";

import { useActionState } from "react";
import { saveFaculty } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";
import type { Faculty } from "@/lib/types";

type Editable = Omit<Faculty, "passwordHash">;

export function FacultyForm({ faculty, domains }: { faculty?: Editable; domains: string[] }) {
  const [state, action] = useActionState(saveFaculty, undefined);
  const isMaster = faculty?.role === "master";
  return (
    <form action={action} className="space-y-4">
      {faculty && <input type="hidden" name="id" value={faculty.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label text-xs">Full name</label>
          <input name="name" required defaultValue={faculty?.name} className="input" placeholder="Dr. Firstname Lastname" />
        </div>
        <div>
          <label className="label text-xs">Email (login)</label>
          <input name="email" type="email" required defaultValue={faculty?.email} className="input" placeholder="name@nirmauni.ac.in" />
        </div>
      </div>
      {!isMaster && (
        <fieldset>
          <legend className="label text-xs">Review tracks</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {domains.map((d) => (
              <label key={d} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="domains" value={d} defaultChecked={faculty?.domains.includes(d)} className="size-4" />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {!isMaster && (
          <div>
            <label className="label text-xs">Max papers</label>
            <input name="maxLoad" type="number" min={0} defaultValue={faculty?.maxLoad ?? 5} className="input" />
          </div>
        )}
        <div className={isMaster ? "sm:col-span-3" : "sm:col-span-2"}>
          <label className="label text-xs">{faculty ? "Reset password (leave blank to keep)" : "Initial password"}</label>
          <input name="password" type="text" minLength={8} required={!faculty} className="input" autoComplete="new-password" placeholder="min. 8 characters" />
        </div>
      </div>
      {faculty && !isMaster && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={faculty.active} className="size-4" /> Active (can log in and receive papers)
        </label>
      )}
      {!faculty && <input type="hidden" name="active" value="on" />}
      <div className="flex items-center gap-3">
        <SubmitButton>{faculty ? "Save changes" : "Add faculty"}</SubmitButton>
        {state?.error && <span className="text-sm text-bad">{state.error}</span>}
        {state?.message && <span className="text-sm text-good">{state.message}</span>}
      </div>
    </form>
  );
}
