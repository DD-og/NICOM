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

export const config = {
  conferenceName: process.env.CONFERENCE_NAME || "NICOM 2026",
  conferenceEmail: process.env.CONFERENCE_EMAIL || "nicom@example.edu",
  journalName: process.env.JOURNAL_NAME || "Nirma University Journal of Business and Management Studies",
  paperIdPrefix: process.env.PAPER_ID_PREFIX || "NICOM26-",
  blindReview: (process.env.BLIND_REVIEW ?? "true").toLowerCase() !== "false",
  backend: (process.env.DATA_BACKEND || "local") as "local" | "sheets",
  gmailEnabled: Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN,
  ),
};
