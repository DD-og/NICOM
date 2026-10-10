import Link from "next/link";
import { Badge } from "@/app/components/badges";
import { Meter, PageHeader, Section } from "@/app/components/ui";
import { config, DOMAINS } from "@/lib/config";
import { store } from "@/lib/db";
import { facultyLoads } from "@/lib/logic";
import { FacultyForm } from "./faculty-form";

export default async function FacultyPage() {
  const db = await store().snapshot();
  const loads = facultyLoads(db).sort((a, b) => a.faculty.name.localeCompare(b.faculty.name));
  const domains = [...new Set([...DOMAINS, ...db.papers.map((p) => p.domain)])];
  const master = db.faculty.filter((f) => f.role === "master");

  return (
    <>
      <PageHeader title="Faculty" subtitle="Reviewer accounts, track mapping and workload" />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Section title={`Reviewers (${loads.length})`}>
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
                        <div className="text-xs text-muted">{l.faculty.email}</div>
                        {!l.faculty.active && <Badge>Inactive</Badge>}
                      </td>
                      <td className="td"><div className="flex max-w-xs flex-wrap gap-1">{l.faculty.domains.map((d) => <Badge key={d}>{d}</Badge>)}</div></td>
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
        </div>
        <Section title="Add an account">
          <div className="p-4">
            <FacultyForm domains={domains} allowedDomain={config.allowedDomain} />
          </div>
        </Section>
      </div>
    </>
  );
}
