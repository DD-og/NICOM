import "server-only";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config";
import type { EmailDraft } from "./email";

/** RFC 2047 encode a header value so non-ASCII (e.g. the en dash in subjects) survives. */
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);

/** Creates a real draft in the configured Gmail mailbox (needs GMAIL_* env vars). Returns the draft id. */
export async function createGmailDraft(e: EmailDraft): Promise<string> {
  if (!config.gmailEnabled) throw new Error("Gmail integration is not configured");
  const client = new OAuth2Client(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();

  const headers = [
    `To: ${e.to}`,
    ...(e.cc ? [`Cc: ${e.cc}`] : []),
    `Subject: ${encodeHeader(e.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const mime = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(e.body).toString("base64")}`;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: Buffer.from(mime).toString("base64url") } }),
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}
