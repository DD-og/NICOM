# NICOM Review Portal

A paper-review management system for **NICOM**, the annual national conference hosted by the
Institute of Management, Nirma University.

Authors submit through a Google Form. Responses land in a Google Sheet, with papers stored in Google Drive.
The portal sits on top of that Sheet:

- **Admins** (conference committee) distribute papers to faculty by track, track progress, finalise decisions and copy the drafted author emails.
- **Faculty reviewers** see only the papers assigned to them, open each paper from Drive, score it and submit a recommendation.

**Policies built in:** double-blind review · two reviewers per paper · decision emails written in the portal and sent by a committee member from their own mailbox.

---

## Features

**Admins**
- **Overview dashboard**: submissions, papers still needing reviewers, reviews done/pending/overdue, decisions, emails sent, a pipeline per track, faculty progress, and a "needs your attention" list.
- **Auto-distribution**: each paper gets **2 reviewers** from faculty mapped to its track (least-loaded first, respecting each person's max papers). Preview first, then confirm. Papers that can't be staffed are flagged with the reason. Faculty only ever review in the tracks listed for them (manual assignment too), and never a paper they authored (matched by email or name).
- **Manual assignment** per paper, due-date changes, reviewer removal.
- **Papers list** with search and filters, plus CSV export.
- **Accounts**: add reviewers or admins with a login ID and password, map tracks, set max papers, reset passwords, deactivate (takes effect immediately). Each faculty page has a ready-made reminder email. The institute's faculty list (with each person's tracks in an "All Area" column) is turned into the Faculty tab by `python3 scripts/import_faculty.py <file.xlsx>`; the website's submissions export becomes the papers tab with `python3 scripts/import_papers.py <export.csv>` (full papers only, duplicates resolved).
- **Decisions & emails**: *Needs decision*, *Ready to send* and *Sent* tabs. Once both reviews are in and the reviewers agree, the decision email is drafted automatically. When they disagree, an admin decides.
- **Decision emails**: copy the body, address and subject, send from any mailbox, then *Mark as sent*. Reviewer comments are included anonymously ("Reviewer 1/2"); confidential comments never are.

**Faculty**
- Home page with only their assigned papers, due dates and tracks.
- Review page: abstract, **Open full paper in Google Drive**, inline preview, 5 scored criteria, a recommendation
  (Accept / Minor revisions / Major revisions / Reject / **Recommended for Journal Publication**), comments to authors and confidential comments to the committee.
- Reviews stay editable until the author is notified. Author identities are never shown (double-blind).

---

## Sign-in

For now: **login ID + password**. The test accounts are 1 admin (`admin`) and 10 faculty
(`meera.iyer`, `rohan.desai`, `kavita.nair`, `arjun.malhotra`, `sneha.kulkarni`, `vikram.joshi`,
`ananya.rao`, `siddharth.mehta`, `pooja.trivedi`, `nikhil.bhatt`).

- Passwords are random, shared privately, and **never stored in this repository**. Only salted scrypt hashes are in `data/seed.json`.
  The plain list lives in `data/credentials.local.json` on the machine that generated it (git-ignored).
- Admins can set or reset any password on the **Faculty** page. Passwords can't be viewed, only reset.
- Login IDs are case-insensitive, and an account's email also works as its ID.

**Later:** Google sign-in restricted to `@nirmauni.ac.in` is already built (`/auth/google`) and switches on when
`GOOGLE_OAUTH_CLIENT_ID`/`SECRET` are set. It does **not** need Nirma's Google Cloud: an OAuth client in any personal
Google Cloud project works, and the code enforces the university domain on Google's verified token.

---

## Data: where it lives

| `DATA_BACKEND` | Data in | Needs | Use for |
|---|---|---|---|
| `local` (default) | `data/db.json`, seeded from `data/seed.json` | nothing | running on your own computer |
| **`appsscript`** | **the Google Sheet**, via a small Apps Script web app bound to it | pasting one script into the Sheet | **the deployed site (recommended)** |
| `sheets` | the Google Sheet, via the Sheets API | a Google Cloud service account | alternative if you ever have Cloud access |

The portal reads the Google Form responses tab (it never writes to it) and keeps its own data in four tabs it creates:
`Faculty`, `Assignments`, `Reviews`, `Decisions`. You can open the Sheet at any time and see every review and decision.

The dummy data is in Google Drive:
- Folder **NICOM 2026 (Dummy) – Review Portal**: https://drive.google.com/drive/folders/17FVeXr5Vy05urYibMpaO84o2AJfnusZj
  (24 dummy manuscripts in **Paper Submissions/**)
- **NICOM 2026 (Dummy) – Master Sheet**: https://docs.google.com/spreadsheets/d/1o3Nma4_jpZA5MlDOIBI3IEDQIV9c8iEE6Eo4PjVdHrc

Seed state: 24 papers across 8 tracks, 11 accounts, 20 completed and 16 pending reviews, 5 decisions (one auto-drafted,
2 emails sent), 5 papers where reviewers disagree, and 6 papers still unassigned (try the auto-distribution).
All names are fictional; all emails use reserved `example.com/.edu` domains.

---

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000, local dummy data
```
Run `npm run reset-demo` to start the local data over.

---

## Deploy (Vercel + Google Sheet), about 10 minutes

### 1. Connect the Sheet (Apps Script, no Google Cloud)
1. Open the Master Sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Set `SECRET` to a long random string
   (the same value goes into `APPS_SCRIPT_SECRET` below). Click **Save**.
3. **Deploy → New deployment → ⚙ Select type: Web app.** *Execute as:* **Me** · *Who has access:* **Anyone** → **Deploy**.
   Approve the permission prompt (Google may say the app is unverified. It's your own script: *Advanced → Go to …*).
4. Copy the **Web app URL** (ends in `/exec`).

The URL alone gives no access: every request must carry the secret.
If you later edit the script, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

### 2. Deploy the website
1. Go to **vercel.com** → sign in with GitHub → **Add New… → Project** → import **DD-og/NICOM**.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATA_BACKEND` | `appsscript` |
   | `APPS_SCRIPT_URL` | the Web app URL from step 1 |
   | `APPS_SCRIPT_SECRET` | the same secret as in `Code.gs` |
   | `SESSION_SECRET` | another long random string |
   | `SEED_DEMO_DATA` | `true` (fills a brand-new Sheet, one with no accounts yet, with the demo accounts and reviews; remove for real data) |

3. **Deploy.** Open the site, sign in as `admin`, and you'll see the four new tabs appear in the Sheet.

### 3. Paper access for faculty
Reviewers open papers straight from Drive. Share the submissions folder with them (or "Anyone with the link: Viewer"),
otherwise they'll hit "Request access".

### Going live with real submissions
- Create the Google Form with the questions below and link it to the Sheet (or a new one with the script installed).
- Remove `SEED_DEMO_DATA`, clear the demo rows from the portal tabs, and create the real accounts on the Faculty page.

| Form question | Type |
|---|---|
| Email Address | *Collect emails* setting |
| Corresponding Author Name, Phone Number, Affiliation, Co-Authors, Paper Title, Keywords | Short answer |
| Track / Domain | Dropdown with the 12 conference tracks, exactly as in `lib/config.ts → DOMAINS` |
| Abstract | Paragraph |
| Upload Paper | File upload (PDF/DOCX) |

Headers are matched loosely, so close wording works. If there's no `Paper ID` column, IDs come from row order
(`NICOM26-001`, …); don't delete or re-sort response rows (or add a `Paper ID` column).

Optional settings: `CONFERENCE_EMAIL` (added as Cc and contact address once decided), `REVIEWERS_PER_PAPER` (default 2),
`CONFERENCE_NAME`, `JOURNAL_NAME`, `PAPER_ID_PREFIX`. See `.env.example`.

---

## How it works

```
Google Form ──► Sheet: Form responses tab (read-only to the portal)
                       Faculty · Assignments · Reviews · Decisions tabs (written by the portal)
                              ▲
                              │  Apps Script web app (apps-script/Code.gs), shared secret
                              ▼
                   NICOM Review Portal (Next.js on Vercel) ◄── admins & faculty (ID + password)
                              │
                              ▼
                   Decision email → copied into the committee's mailbox
```

| Path | What |
|---|---|
| `app/admin/*`, `app/faculty/*` | Admin and faculty pages |
| `app/actions.ts` | All server actions; each re-checks the session role |
| `lib/db/apps-script.ts`, `lib/db/sheets.ts`, `lib/db/local.ts` | Data backends behind one interface |
| `apps-script/Code.gs` | The Sheet-side bridge script |
| `lib/sheet-columns.json` | Sheet tab and column definitions (with header aliases) |
| `lib/logic.ts` | Paper status, reviewer consensus, distribution |
| `lib/email.ts` | Decision email templates |
| `tests/` | Unit and end-to-end tests |

**Paper status:** `Unassigned → Under Review → Reviewed (both reviews in) → Decision Drafted → Author Notified`

**Security:** salted scrypt password hashes; signed HTTP-only session cookie, re-checked against the Sheet on every request
(deactivation and role changes apply immediately); faculty can open only their own assignments; admin pages and CSV export
are admin-only; the same error message for unknown IDs and wrong passwords.

---

## Testing

```bash
npm test             # logic, emails, passwords, Sheets adapters, and the real Code.gs on a fake spreadsheet (20 tests)
npm run test:e2e     # every journey in a real browser, run twice: local data, then Google Sheet via Code.gs (25 + 25)
                     # first time on a machine: npx playwright install chromium
```

The browser suite covers: sign-in (wrong passwords, case-insensitive IDs, forged Google callbacks), overview numbers,
filters, auto-distribution (2 reviewers, own track), double-blind review pages, validation without losing input, access
control, auto-drafted decisions, copy-to-clipboard, mark as sent, read-only reviews after notification, disagreement
decisions, adding reviewers/admins, password resets, instant deactivation, CSV export, and phone layout of every page.
Tests use throwaway data and their own passwords; your demo data is untouched.

---

## Suggested next steps
- **Email login without Google Cloud**: a one-time code sent to the @nirmauni.ac.in address (needs an email-sending service).
- **Conflict-of-interest check**: skip reviewers from the author's own institution.
- **Automatic reminder emails** for overdue reviews, once an official mailbox is decided.
- **Revision round** for "Major Revisions" papers.
