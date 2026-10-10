export const DOMAINS = [
  "Finance & Accounting",
  "Marketing",
  "HR & Organizational Behaviour",
  "Operations & Supply Chain",
  "Business Analytics & AI",
  "Strategy & Entrepreneurship",
  "Economics & Public Policy",
  "Sustainability & ESG",
];

const list = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const backend = (process.env.DATA_BACKEND || "local") as "local" | "sheets" | "appsscript";

export const config = {
  conferenceName: process.env.CONFERENCE_NAME || "NICOM 2026",
  /** Optional. When set, it is added as Cc and named in emails as the contact address. */
  conferenceEmail: process.env.CONFERENCE_EMAIL || "",
  journalName: process.env.JOURNAL_NAME || "Nirma University Journal of Business and Management Studies",
  paperIdPrefix: process.env.PAPER_ID_PREFIX || "NICOM26-",
  /** Double-blind: reviewers never see author identities. */
  blindReview: (process.env.BLIND_REVIEW ?? "true").toLowerCase() !== "false",
  reviewersPerPaper: Math.max(1, Number(process.env.REVIEWERS_PER_PAPER) || 2),
  backend,

  /** Only Google accounts on this domain can sign in. */
  allowedDomain: (process.env.ALLOWED_EMAIL_DOMAIN || "nirmauni.ac.in").toLowerCase(),
  /** Emails that are always master admins (bootstrap), in addition to Admin rows in the Faculty tab. */
  masterAdminEmails: list(process.env.MASTER_ADMIN_EMAILS),
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  appUrl: (process.env.APP_URL || "").replace(/\/$/, ""),
  /** Apps Script web app that reads/writes the Google Sheet (DATA_BACKEND=appsscript). */
  appsScriptUrl: process.env.APPS_SCRIPT_URL || "",
  appsScriptSecret: process.env.APPS_SCRIPT_SECRET || "",
  /** Fill empty portal tabs in the Sheet with the demo faculty/reviews once (testing only). */
  seedDemoData: process.env.SEED_DEMO_DATA === "true",
};

export const googleSignInEnabled = () => Boolean(config.googleClientId && config.googleClientSecret);

export function isAllowedEmail(email: string) {
  return email.toLowerCase().endsWith(`@${config.allowedDomain}`);
}
