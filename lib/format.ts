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
