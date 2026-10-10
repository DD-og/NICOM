# NICOM Review Portal

A paper-review management system for **NICOM**, the annual national conference hosted by the
Institute of Management, Nirma University.

Authors submit through a Google Form. The responses land in a Google Sheet, with papers stored in
Google Drive. This portal sits on top of that data:

- **Admins** (the conference committee) distribute papers to faculty by track, track progress, finalise decisions and copy the drafted author emails.
- **Faculty reviewers** see only the papers assigned to them, open each paper from Drive, score it, and submit a recommendation.

---

## Features

**Master admin**
- **Overview dashboard**: submissions, papers still needing reviewers, reviews done/pending/overdue, decisions, emails sent, a pipeline per track, a progress table per faculty member, and a "needs your attention" list.
- **Auto-distribution**: each paper goes to the least-loaded active faculty mapped to its track, with **2 reviewers per paper** (policy), a deadline and a max-papers cap. You see a preview first and confirm with one click. Papers that can't be staffed are flagged with the reason.
- **Manual assignment** per paper (track experts listed first), due-date changes, reviewer removal.
- **Papers list** with search and filters (track, status), plus a CSV export.
- **Accounts**: add reviewers or admins by their @nirmauni.ac.in email, map tracks, set max papers, deactivate accounts (takes effect immediately). Each faculty page includes a ready-made reminder email.
- **Decisions & emails**: three tabs (*Needs decision*, *Ready to send*, *Sent*). Once **both** reviews are in and the reviewers agree, the decision email is **drafted automatically**. When they disagree, the paper is flagged for an admin's call.
- **Decision emails are written in the portal**: **Copy email body** / copy address / copy subject, send from whichever mailbox the committee member uses, then *Mark as sent*. (Optional shortcut: open it in Gmail web or the default mail app.) Reviewer comments are included anonymously as "Reviewer 1/2"; confidential comments never are.

**Faculty**
- Home page with only *their* assigned papers, due-date badges and their tracks.
- Review page with abstract, **Open full paper in Google Drive**, optional inline preview, 5 scored criteria,
  a recommendation (Accept / Minor revisions / Major revisions / Reject / **Recommended for Journal Publication**),
  comments to authors and confidential comments to the committee.
- Reviews stay editable until the author is notified.
- **Double-blind**: reviewers never see author names, emails or affiliations.

---

## Quick start (demo mode, dummy data)

```bash
npm install
npm run dev          # http://localhost:3000
```

Sign-in is **Google only, restricted to @nirmauni.ac.in**. Until Google sign-in is configured, the demo shows a
clearly-marked **Demo sign-in** picker on the login page: choose *NICOM Conference Office* (admin) or any faculty reviewer.
The picker only exists in demo mode (`DATA_BACKEND=local`) and disappears once the portal is connected to the real Sheet.

Demo data lives in `data/seed.json`. Your changes go to `data/db.json` (git-ignored). Run `npm run reset-demo` to start over.

The same dummy data is also in Google Drive (in the account that was connected while building this):

- Folder **NICOM 2026 (Dummy) – Review Portal**: https://drive.google.com/drive/folders/17FVeXr5Vy05urYibMpaO84o2AJfnusZj
  - **Paper Submissions/**: 24 dummy manuscripts (Google Docs), one per paper
  - **NICOM 2026 (Dummy) – Master Sheet**: https://docs.google.com/spreadsheets/d/1o3Nma4_jpZA5MlDOIBI3IEDQIV9c8iEE6Eo4PjVdHrc

The seed state has 24 papers across 8 tracks and 10 faculty: 20 completed and 16 pending reviews (two reviewers per paper),
5 decisions (one auto-drafted, 2 emails already sent), 5 papers where reviewers disagree, and 6 papers still unassigned,
so you can try the distribution yourself.
All names are fictional and all emails use reserved `example.com/.edu` domains.

---

## Going live

### 1. Google Form (author submissions)
Create the form with these questions. The portal matches column headers loosely, so close wording works:

| Question | Type |
|---|---|
| Email Address | *Collect emails* setting |
| Corresponding Author Name | Short answer |
| Phone Number | Short answer |
| Affiliation | Short answer |
| Co-Authors | Short answer |
| Paper Title | Short answer |
| Track / Domain | Dropdown with the exact track names (see `lib/config.ts → DOMAINS`) |
| Keywords | Short answer |
| Abstract | Paragraph |
| Upload Paper | File upload (PDF/DOCX). Files go to a Drive folder automatically |

Link the form to a Google Sheet. That spreadsheet becomes the portal's database.

> **Paper IDs:** if the response tab has no `Paper ID` column, IDs are derived from row order (`NICOM26-001`, …).
> Never delete or re-sort response rows. Better: add a `Paper ID` column filled by a formula or an Apps Script trigger.

### 2. Google sign-in (@nirmauni.ac.in only)
1. Google Cloud Console → **APIs & Services → OAuth consent screen**: choose **Internal** if the project is in the
   nirmauni.ac.in Google Workspace (recommended; only university accounts can even see it), otherwise External.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI: `https://<your-portal-domain>/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local testing).
3. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APP_URL`, and `MASTER_ADMIN_EMAILS` (the first admin's
   @nirmauni.ac.in address). That admin signs in and adds everyone else on the **Faculty** page.

The domain is enforced on Google's verified ID token (not just the account picker), and a person must also be
registered and active on the Faculty page, so a random university account can't get in.

### 3. Google Sheets access (service account)
1. In Google Cloud Console, create a project, enable the **Google Sheets API**, and create a **service account**. Download its JSON key.
2. Share the spreadsheet with the service account's email as **Editor**.
3. Copy `.env.example` to `.env.local` and fill in `DATA_BACKEND=sheets`, `GOOGLE_SHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` and a long random `SESSION_SECRET`.
4. Run `npm run sheets:init` to add the portal's own tabs (`Faculty`, `Assignments`, `Reviews`, `Decisions`) next to the
   form responses. The portal **never writes to the form responses tab**.
5. Sign in with the `MASTER_ADMIN_EMAILS` account and add the faculty reviewers (and any other admins) on the **Faculty** page.

### 4. Paper access for faculty
Reviewers open papers straight from Drive. Share the form's upload folder with the faculty
(or with "Anyone at nirmauni.ac.in with the link", Viewer), otherwise they'll hit "Request access".

### 5. Decision emails
Emails are written in the portal for a committee member to copy and send from whichever mailbox is used.
When the committee settles on an official address, set `CONFERENCE_EMAIL` and it is added as Cc and named as the
contact address in every email (until then emails say "please reply to this email").

### 6. Deploy
Any Node host works. On Vercel, import the repo and add the env vars. In Sheets mode all state lives in the Sheet,
so serverless hosting is fine. (In demo mode on serverless, changes are kept in memory only.)

---

## How it works

```
Google Form ──► Sheet "Form Responses" tab ──┐
                (+ Drive upload folder)      │ read-only
                                             ▼
                              ┌──── NICOM Review Portal (Next.js) ────┐
 Faculty  ── review ────────► │ Faculty · Assignments · Reviews ·     │ ──► Sheet tabs written by the portal
 Master   ── assign/decide ─► │ Decisions                             │
                              └───────────────┬───────────────────────┘
                                              ▼
                               Decision email → copied into the committee's mailbox
```

| Path | What |
|---|---|
| `app/admin/*` | Master admin pages (overview, papers, distribute, faculty, decisions) |
| `app/faculty/*` | Faculty home and review page |
| `app/actions.ts` | All server actions; each re-checks the session role |
| `lib/db/local.ts` / `lib/db/sheets.ts` | Demo JSON store / Google Sheets store behind one interface |
| `lib/sheet-columns.json` | Sheet tab and column definitions (with header aliases) |
| `lib/logic.ts` | Paper status, reviewer consensus, distribution algorithm |
| `lib/email.ts` | Decision email templates |
| `lib/google-signin.ts`, `app/auth/*` | Google sign-in (domain-restricted) |
| `tests/` | Unit tests and end-to-end browser tests |
| `scripts/` | Dummy-data generators and `sheets-init` |

**Paper status:** `Unassigned → Under Review → Reviewed → Decision Drafted → Author Notified`

**Paper status rule:** a paper is *Reviewed* only when both reviewers have submitted.

**Auth:** Google sign-in (verified @nirmauni.ac.in token + an active Faculty-tab account), signed HTTP-only session
cookie that is re-checked on every request. Faculty can only open their own assignments; admin pages and the CSV export
are admin-only.

---

## Testing

```bash
npm test             # logic, emails, sign-in rules, Google Sheets adapter (15 tests)
npm run test:e2e     # full browser run of every journey on the dummy data (21 tests)
                     # first time on a machine: npx playwright install chromium
```

The browser suite covers: sign-in restrictions and forged callbacks, overview numbers, filters, auto-distribution
(2 reviewers, own track), double-blind review pages, form validation without losing input, access control,
auto-drafted decisions, copy-to-clipboard, mark as sent, read-only reviews after notification, disagreement decisions,
adding reviewers/admins (@nirmauni.ac.in only), instant deactivation, CSV export, and phone-width layout of every page.
It uses its own throwaway database, so your demo data is untouched.

---

## Suggested next steps
- **Conflict-of-interest check**: skip reviewers from the author's own institution.
- **Automatic reminder emails** for overdue reviews, once an official mailbox is decided.
- **Revision round** for "Major Revisions" papers (resubmission linked to the original Paper ID).
