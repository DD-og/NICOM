import { daysUntil, fmtDate, relativeDays } from "@/lib/format";
import { SHORT_LABEL, type PaperStatus, type Recommendation } from "@/lib/types";

const tone = {
  neutral: "bg-surface text-muted border-line",
  info: "bg-info-soft text-info border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  brand: "bg-brand-soft text-brand border-transparent",
} as const;

export function Badge({ children, t = "neutral", title }: { children: React.ReactNode; t?: keyof typeof tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tone[t]}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<PaperStatus, keyof typeof tone> = {
  Unassigned: "warn",
  "Under Review": "info",
  Reviewed: "brand",
  "Decision Drafted": "neutral",
  "Author Notified": "good",
};

export function StatusBadge({ status }: { status: PaperStatus }) {
  return (
    <Badge t={STATUS_TONE[status]}>
      <Dot hollow={status === "Unassigned"} />
      {status}
    </Badge>
  );
}

const DECISION_TONE: Record<Recommendation, keyof typeof tone> = {
  "Accept as Submitted with Minor Formatting changes if required": "good",
  "Accept With Suggested Minor Revisions": "good",
  "Accept After Major Revision": "warn",
  Reject: "bad",
};
const DECISION_ICON: Record<Recommendation, string> = {
  "Accept as Submitted with Minor Formatting changes if required": "✓",
  "Accept With Suggested Minor Revisions": "✓",
  "Accept After Major Revision": "↻",
  Reject: "✕",
};

/** Short label in the badge; the committee's full wording on hover. */
export function DecisionBadge({ value }: { value: Recommendation }) {
  return (
    <Badge t={DECISION_TONE[value] ?? "neutral"} title={value}>
      <span aria-hidden>{DECISION_ICON[value]}</span>
      {SHORT_LABEL[value] ?? value}
    </Badge>
  );
}

/** Yes/No answers to the internal nomination questions (Journal of NIRMA, SCOPUS, Best Paper). */
export function YesNoBadge({ label, value }: { label: string; value?: string }) {
  return (
    <Badge t={value === "Yes" ? "brand" : "neutral"} title={`${label}: ${value || "not answered"}`}>
      {label}: {value || "—"}
    </Badge>
  );
}

/** Small status dot drawn with CSS, so it looks the same on every device (unicode circles don't). */
function Dot({ hollow = false }: { hollow?: boolean }) {
  return <span aria-hidden className={`inline-block size-1.5 rounded-full border border-current ${hollow ? "" : "bg-current"}`} />;
}

export function DueBadge({ dueDate, status }: { dueDate: string; status: string }) {
  if (status === "Completed") return <Badge t="good">✓ Reviewed</Badge>;
  const days = daysUntil(dueDate);
  if (days === null) return <Badge t="info"><Dot />Pending</Badge>;
  if (days < 0) return <Badge t="bad" title={`Due ${fmtDate(dueDate)}`}>! Overdue by {-days} {-days === 1 ? "day" : "days"}</Badge>;
  return (
    <Badge t={days <= 3 ? "warn" : "info"} title={`Due ${fmtDate(dueDate)}`}>
      <Dot />Due {relativeDays(days)}
    </Badge>
  );
}
