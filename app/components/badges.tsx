import type { PaperStatus, Recommendation } from "@/lib/types";

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
const STATUS_ICON: Record<PaperStatus, string> = {
  Unassigned: "○",
  "Under Review": "◔",
  Reviewed: "◑",
  "Decision Drafted": "◕",
  "Author Notified": "●",
};

export function StatusBadge({ status }: { status: PaperStatus }) {
  return (
    <Badge t={STATUS_TONE[status]}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {status}
    </Badge>
  );
}

const DECISION_TONE: Record<Recommendation, keyof typeof tone> = {
  Accept: "good",
  "Accept with Minor Revisions": "good",
  "Major Revisions": "warn",
  Reject: "bad",
  "Recommended for Journal Publication": "brand",
};
const DECISION_ICON: Record<Recommendation, string> = {
  Accept: "✓",
  "Accept with Minor Revisions": "✓",
  "Major Revisions": "↻",
  Reject: "✕",
  "Recommended for Journal Publication": "★",
};

export function DecisionBadge({ value }: { value: Recommendation }) {
  return (
    <Badge t={DECISION_TONE[value]}>
      <span aria-hidden>{DECISION_ICON[value]}</span>
      {value}
    </Badge>
  );
}

export function DueBadge({ dueDate, status }: { dueDate: string; status: string }) {
  if (status === "Completed") return <Badge t="good">✓ Reviewed</Badge>;
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate && dueDate < today) return <Badge t="bad">! Overdue</Badge>;
  const days = dueDate ? Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86_400_000) : null;
  if (days !== null && days <= 3) return <Badge t="warn">⏱ Due in {days}d</Badge>;
  return <Badge t="info">◔ Pending</Badge>;
}
