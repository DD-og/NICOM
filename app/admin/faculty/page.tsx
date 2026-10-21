import Link from "next/link";
import { Badge } from "@/app/components/badges";
import { Meter, PageHeader, Section } from "@/app/components/ui";
import { config } from "@/lib/config";
import { store } from "@/lib/db";
import { facultyLoads, trackList } from "@/lib/logic";
import { FacultyForm } from "./faculty-form";

export default async function FacultyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const db = await store().snapshot();
  const all = facultyLoads(db).sort((a, b) => a.faculty.name.localeCompare(b.faculty.name));
  const needle = q.trim().toLowerCase();
  const loads = needle
    ? all.filter(({ faculty: f }) => [f.name, f.username, f.email, ...f.domains].some((x) => x.toLowerCase().includes(needle)))
    : all;
  const domains = trackList(db);
  const master = db.faculty.filter((f) => f.role === "master");

  return (
    <>
      <PageHeader title="Faculty" subtitle="Reviewer accounts, track mapping and workload" />
      <details className="card group mb-6">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
          <span>+ Add an account</span>
          <span className="text-xs font-normal text-muted group-open:hidden">Reviewer or admin, with a login ID and password</span>
        </summary>
        <div className="max-w-3xl border-t border-line p-4">
          <FacultyForm domains={domains} allowedDomain={config.allowedDomain} />
        </div>
      </details>
      <Section
        title={needle ? `Reviewers (${loads.length} of ${all.length})` : `Reviewers (${all.length})`}
        actions={
          <form className="flex gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="Search name, ID or track" aria-label="Search faculty" className="input w-56 py-1.5 text-sm" />
            <button className="btn btn-secondary btn-sm">Search</button>
            {needle && <Link href="/admin/faculty" className="btn btn-secondary btn-sm">Clear</Link>}
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Faculty</th><th className="th">Tracks</th>
                <th className="th text-right">Load</th><th className="th text-right">Pending</th><th className="th w-40">Done</th><th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loads.map((l) => (
                <tr key={l.faculty.id} className={l.faculty.active ? "" : "opacity-60"}>
                  <td className="td">
                    <Link href={`/admin/faculty/${l.faculty.id}`} className="font-medium">{l.faculty.name}</Link>
                    <div className="text-xs text-muted">ID: <span className="font-mono">{l.faculty.username}</span> · {l.faculty.email}</div>
                    {!l.faculty.active && <Badge>Inactive</Badge>}
                  </td>
                  <td className="td min-w-64 text-xs leading-relaxed text-muted">
                    {l.faculty.domains.length ? l.faculty.domains.join(" · ") : <Badge t="warn">No tracks</Badge>}
                  </td>
                  <td className="td text-right tabular-nums">{l.assigned}/{l.faculty.maxLoad || "∞"}</td>
                  <td className="td text-right tabular-nums">
                    {l.pending}
                    {l.overdue > 0 && <div><Badge t="bad">! {l.overdue} overdue</Badge></div>}
                  </td>
                  <td className="td"><Meter value={l.completed} max={l.assigned} /></td>
                  <td className="td text-right"><Link href={`/admin/faculty/${l.faculty.id}`} className="btn btn-secondary btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="mt-3 text-xs text-muted">
        Admin{master.length > 1 ? "s" : ""}: {master.map((m) => <Link key={m.id} href={`/admin/faculty/${m.id}`}>{m.email}</Link>)}
      </p>
    </>
  );
}
