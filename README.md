# NICOM Review Portal

A paper-review management system for **NICOM**, the annual national conference hosted by the
Institute of Management, Nirma University.

Authors submit through a Google Form. The responses land in a Google Sheet, with papers stored in
Google Drive. This portal sits on top of that data:

- **Master admin** distributes papers to faculty by track, tracks progress, finalises decisions and sends author emails.
- **Faculty reviewers** see only the papers assigned to them, open each paper from Drive, score it, and submit a recommendation.

---

## Features

**Master admin**
- **Overview dashboard**: submissions, unassigned papers, reviews done/pending/overdue, decisions, emails sent, a pipeline per track, a progress table per faculty member, and a "needs your attention" list.
- **Auto-distribution**: each paper goes to the least-loaded active faculty mapped to its track, with 1–3 reviewers per paper, a deadline and a max-papers cap. You see a preview first and confirm with one click. Papers that can't be staffed are flagged with the reason.
- **Manual assignment** per paper (track experts listed first), due-date changes, reviewer removal.
- **Papers list** with search and filters (track, status), plus a CSV export.
- **Faculty management**: add reviewers, map tracks, set max papers, reset passwords, deactivate accounts. Each faculty page includes a ready-made reminder email.
- **Decisions & emails**: three tabs (*Needs decision*, *Ready to send*, *Sent*). When all reviewers of a paper agree, the decision email is **drafted automatically**. When they disagree, the paper is flagged for your call.
- **Email drafts**: Copy, **Open in Gmail** (a pre-filled compose window that Gmail keeps in Drafts), default mail app, or **Save to Gmail Drafts** via the Gmail API (optional), then *Mark as sent*.

**Faculty**
- Home page with only *their* assigned papers, due-date badges and their tracks.
- Review page with abstract, **Open full paper in Google Drive**, optional inline preview, 5 scored criteria,
  a recommendation (Accept / Minor revisions / Major revisions / Reject / **Recommended for Journal Publication**),
  comments to authors and confidential comments to the committee.
- Reviews stay editable until the author is notified.
- **Double-blind by default**: reviewers don't see author names, emails or affiliations (`BLIND_REVIEW=false` to change).

---

## Quick start (demo mode, dummy data)

```bash
npm install
npm run dev          # http://localhost:3000
```

| Role | Email | Password |
|---|---|---|
| Master admin | `nicom.admin@example.edu` | `nicom@admin` |
| Faculty (any of the 10) | e.g. `meera.iyer@example.edu`, `kavita.nair@example.edu` | `nicom@faculty` |

Demo data lives in `data/seed.json`. Your changes go to `data/db.json` (git-ignored). Run `npm run reset-demo` to start over.

The same dummy data is also in Google Drive (in the account that was connected while building this):

- Folder **NICOM 2026 (Dummy) – Review Portal**: https://drive.google.com/drive/folders/17FVeXr5Vy05urYibMpaO84o2AJfnusZj
  - **Paper Submissions/**: 24 dummy manuscripts (Google Docs), one per paper
  - **NICOM 2026 (Dummy) – Master Sheet**: https://docs.google.com/spreadsheets/d/1o3Nma4_jpZA5MlDOIBI3IEDQIV9c8iEE6Eo4PjVdHrc

The seed state has 24 papers across 8 tracks, 10 faculty, 16 completed reviews, 8 pending reviews,
4 decisions (2 emails already sent) and 6 papers still unassigned, so you can try the distribution yourself.
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

### 2. Google Sheets access (service account)
1. In Google Cloud Console, create a project, enable the **Google Sheets API**, and create a **service account**. Download its JSON key.
2. Share the spreadsheet with the service account's email as **Editor**.
3. Copy `.env.example` to `.env.local` and fill in `DATA_BACKEND=sheets`, `GOOGLE_SHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` and a long random `SESSION_SECRET`.
4. Run `npm run sheets:init -- --admin you@nirmauni.ac.in:YourPassword` to add the portal's own tabs
   (`Faculty`, `Assignments`, `Reviews`, `Decisions`) next to the form responses and create the master admin account.
   (Add `--seed` to also copy the demo faculty and reviews into empty tabs.)
   The portal **never writes to the form responses tab**.
5. Log in as master admin and add the faculty reviewers on the **Faculty** page.

### 3. Paper access for faculty
Reviewers open papers straight from Drive. Share the form's upload folder with the faculty
(or with "Anyone at nirmauni.ac.in with the link", Viewer), otherwise they'll hit "Request access".

### 4. Gmail drafts (optional)
Without setup, **Open in Gmail** already opens a pre-filled draft in whichever Gmail account you're signed into.
For one-click **Save to Gmail Drafts**, create an OAuth client, get a refresh token with the
`https://www.googleapis.com/auth/gmail.compose` scope for the conference mailbox, and set the `GMAIL_*` variables.

### 5. Deploy
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
                               Decision email → Gmail compose / Drafts
```

| Path | What |
|---|---|
| `app/admin/*` | Master admin pages (overview, papers, distribute, faculty, decisions) |
| `app/faculty/*` | Faculty home and review page |
| `app/actions.ts` | All server actions; each re-checks the session role |
| `lib/db/local.ts` / `lib/db/sheets.ts` | Demo JSON store / Google Sheets store behind one interface |
| `lib/sheet-columns.json` | Sheet tab and column definitions (with header aliases) |
| `lib/logic.ts` | Paper status, reviewer consensus, distribution algorithm |
| `lib/email.ts` | Decision email templates, Gmail compose links |
| `scripts/` | Dummy-data generators and `sheets-init` |

**Paper status:** `Unassigned → Under Review → Reviewed → Decision Drafted → Author Notified`

**Auth:** email + password (scrypt-hashed, stored in the Faculty tab), signed HTTP-only session cookie.
Faculty can only open their own assignments, and admin pages and the CSV export are master-only.

---

## Suggested next steps
- **Google Sign-In** restricted to `@nirmauni.ac.in`, so there are no passwords to manage.
- **Conflict-of-interest check**: skip reviewers from the author's own institution.
- **Automatic reminder emails** for overdue reviews (Gmail API + a daily cron).
- **Revision round** for "Major Revisions" papers (resubmission linked to the original Paper ID).
