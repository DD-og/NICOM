export function fmtDate(value: string | undefined, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // e.g. a Google Form timestamp in a locale format
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

/** Extract a Drive file id from the many link shapes Google Forms/Drive produce. */
export function driveFileId(link: string): string | null {
  const m = link.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Embeddable preview URL (works for viewers who have access to the file). */
export function drivePreviewUrl(link: string): string | null {
  const id = driveFileId(link);
  if (!id) return null;
  if (link.includes("docs.google.com/document")) return `https://docs.google.com/document/d/${id}/preview`;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/** Google Forms file-upload answers can hold several comma-separated links; use the first. */
export function firstLink(link: string): string {
  return (link || "").split(/[\s,]+/).find((s) => s.startsWith("http")) ?? "";
}

/** Today's date (YYYY-MM-DD) in India, where the conference runs; the server itself is on UTC. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** The date `days` days from today, India time (YYYY-MM-DD). */
export function addDaysIST(days: number): string {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today (India time) to an ISO date; negative when the date has passed. */
export function daysUntil(date: string): number | null {
  if (!date) return null;
  const ms = new Date(date.slice(0, 10)).getTime() - new Date(todayIST()).getTime();
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000);
}

/** "in 3 days", "tomorrow", "today", "2 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Button text for a paper link: Drive files, PDFs on the conference website, or anything else. */
export function paperLinkLabel(link: string): string {
  if (driveFileId(link)) return "Open full paper in Google Drive";
  if (/\.pdf($|\?)/i.test(link)) return "Open full paper (PDF)";
  return "Open full paper";
}
