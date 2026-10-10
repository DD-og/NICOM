import Link from "next/link";
import { runDistribution } from "@/app/actions";
import { Badge } from "@/app/components/badges";
import { SubmitButton } from "@/app/components/client";
import { Empty, PageHeader, Section } from "@/app/components/ui";
import { DOMAINS } from "@/lib/config";
import { store } from "@/lib/db";
import { planDistribution } from "@/lib/logic";

export default async function DistributePage({
  searchParams,
}: {
  searchParams: Promise<{ perPaper?: string; dueDays?: string; respectMaxLoad?: string; preview?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const perPaper = Math.min(3, Math.max(1, Number(sp.perPaper) || 2));
  const dueDays = Math.max(1, Number(sp.dueDays) || 14);
  const respectMaxLoad = sp.respectMaxLoad ? sp.respectMaxLoad === "on" : !sp.preview;
  const db = await store().snapshot();
  const plan = planDistribution(db, { perPaper, respectMaxLoad });

  const paper = (id: string) => db.papers.find((p) => p.id === id)!;
  const fac = (id: string) => db.faculty.find((f) => f.id === id)!;
  const load = (id: string) => db.assignments.filter((a) => a.facultyId === id).length;
  const domains = [...new Set([...DOMAINS, ...db.papers.map((p) => p.domain)])];
  const reviewers = db.faculty.filter((f) => f.role === "faculty" && f.active);
  const byPaper = new Map<string, string[]>();
  for (const pr of plan.proposals) byPaper.set(pr.paperId, [...(byPaper.get(pr.paperId) ?? []), pr.facultyId]);

  return (
    <>
      <PageHeader
        title="Distribute papers"
        subtitle="Assign reviewers automatically by track. Each paper goes to the least-loaded faculty mapped to its domain."
      />

      {sp.done && (
        <div className="mb-6 rounded-xl bg-good-soft p-4 text-sm text-good">
          ✓ Created {sp.done} assignment{sp.done === "1" ? "" : "s"}. Faculty will see them on their home page right away.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Section title="1 · Settings">
            <form className="space-y-4 p-4">
              <input type="hidden" name="preview" value="1" />
              <div>
                <label className="label" htmlFor="perPaper">Reviewers per paper</label>
                <select id="perPaper" name="perPaper" defaultValue={perPaper} className="input">
                  <option value="1">1 reviewer</option>
                  <option value="2">2 reviewers (recommended)</option>
                  <option value="3">3 reviewers</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="dueDays">Review deadline (days from today)</label>
                <input id="dueDays" name="dueDays" type="number" min={1} max={90} defaultValue={dueDays} className="input" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="respectMaxLoad" defaultChecked={respectMaxLoad} className="size-4" />
                Respect each faculty member&apos;s max papers
              </label>
              <button className="btn btn-secondary w-full">Update preview</button>
            </form>
          </Section>

          <Section title="Reviewer pool by track">
            <ul className="divide-y divide-line text-sm">
              {domains.map((d) => {
                const pool = reviewers.filter((f) => f.domains.includes(d));
                return (
                  <li key={d} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d}</span>
                      {pool.length === 0 ? <Badge t="bad">! No reviewers</Badge> : <span className="text-xs text-muted">{pool.length} faculty</span>}
                    </div>
                    {pool.length > 0 && (
                      <div className="mt-1 text-xs text-muted">
                        {pool.map((f) => `${f.name.replace(/^Dr\.\s*/, "")} (${load(f.id)}/${f.maxLoad || "∞"})`).join(" · ")}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Section
            title={`2 · Preview: ${plan.proposals.length} new assignment${plan.proposals.length === 1 ? "" : "s"} across ${byPaper.size} paper${byPaper.size === 1 ? "" : "s"}`}
          >
            {plan.proposals.length === 0 ? (
              <div className="p-4">
                <Empty>
                  Every undecided paper already has {perPaper} reviewer{perPaper > 1 ? "s" : ""}
                  {plan.shortfalls.length ? ", or no eligible faculty are available (see below)" : ""}. Nothing to distribute.
                </Empty>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-line">
                      <tr><th className="th">Paper</th><th className="th">Track</th><th className="th">New reviewer(s)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...byPaper.entries()].map(([pid, fids]) => (
                        <tr key={pid}>
                          <td className="td">
                            <div className="font-mono text-xs text-muted">{pid}</div>
                            <Link href={`/admin/papers/${pid}`} className="text-ink">{paper(pid).title}</Link>
                          </td>
                          <td className="td"><Badge t="brand">{paper(pid).domain}</Badge></td>
                          <td className="td text-sm">{fids.map((f) => fac(f).name).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <form action={runDistribution} className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
                  <input type="hidden" name="perPaper" value={perPaper} />
                  <input type="hidden" name="dueDays" value={dueDays} />
                  {respectMaxLoad && <input type="hidden" name="respectMaxLoad" value="on" />}
                  <span className="text-sm text-muted">Deadline: {new Date(Date.now() + dueDays * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <SubmitButton pendingText="Assigning…">✓ Confirm &amp; assign {plan.proposals.length}</SubmitButton>
                </form>
              </>
            )}
          </Section>

          {plan.shortfalls.length > 0 && (
            <Section title={`Could not fully staff ${plan.shortfalls.length} paper${plan.shortfalls.length > 1 ? "s" : ""}`}>
              <ul className="divide-y divide-line text-sm">
                {plan.shortfalls.map((s) => (
                  <li key={s.paperId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span>
                      <Link href={`/admin/papers/${s.paperId}`} className="font-mono text-xs">{s.paperId}</Link>{" "}
                      needs {s.needed} more: <span className="text-muted">{s.reason}</span>
                    </span>
                    <Link href={`/admin/papers/${s.paperId}`} className="btn btn-secondary btn-sm">Assign manually</Link>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
                Fix by mapping more faculty to the track on the Faculty page, raising max papers, or assigning manually.
              </p>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
