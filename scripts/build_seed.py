"""Combine dummy_source.json + drive_ids.json into the app seed and a multi-tab .xlsx
that is uploaded to Google Drive (auto-converted to a Google Sheet).

Run: python3 scripts/build_seed.py [xlsx_out_path]
Demo passwords: master -> nicom@admin, faculty -> nicom@faculty
"""
import hashlib, json, os, random, sys
from datetime import datetime, timedelta
from pathlib import Path

random.seed(7)
src = json.loads(Path("data/dummy_source.json").read_text())
drive = json.loads(Path("data/drive_ids.json").read_text())


def hash_pw(pw: str) -> str:
    # Must match lib/password.ts (scrypt N=16384, r=8, p=1, 64 bytes)
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${dk.hex()}"


faculty = []
for f in src["faculty"]:
    faculty.append({**f, "active": True,
                    "passwordHash": hash_pw("nicom@admin" if f["role"] == "master" else "nicom@faculty")})

papers = []
for p in src["papers"]:
    papers.append({**p, "driveLink": f"https://docs.google.com/document/d/{drive['papers'][p['id']]}/view"})

reviewers = [f for f in faculty if f["role"] == "faculty"]
load = {f["id"]: 0 for f in reviewers}
assignments, reviews, decisions = [], [], []
RECS = ["Accept", "Accept with Minor Revisions", "Major Revisions", "Reject", "Recommended for Journal Publication"]
COMMENTS = {
    "Accept": "The paper is well structured with a clear research question and a sound methodology. The contribution to the Indian context is evident.",
    "Accept with Minor Revisions": "A relevant study with an adequate design. Please tighten the literature review, report robustness checks and fix minor formatting issues.",
    "Major Revisions": "The topic is interesting, but the methodology section needs substantial work: justify the sample, address endogeneity and expand the discussion of limitations.",
    "Reject": "The paper lacks a clear theoretical framing and the empirical analysis does not support the stated conclusions. The contribution is limited in its current form.",
    "Recommended for Journal Publication": "An excellent, rigorous paper with a strong contribution. I recommend it for the Nirma University Journal of Business and Management Studies.",
}

base = datetime(2026, 9, 26, 10, 0)
for idx, p in enumerate(papers, start=1):
    if idx > 18:  # 19-24 left unassigned for the master admin to distribute
        continue
    n_rev = 2 if idx <= 6 else 1
    pool = sorted([f for f in reviewers if p["domain"] in f["domains"]], key=lambda f: (load[f["id"]], f["id"]))
    for f in pool[:n_rev]:
        load[f["id"]] += 1
        a_id = f"ASG-{len(assignments) + 1:03d}"
        assigned_at = base + timedelta(hours=idx)
        done = idx <= 10
        assignments.append({
            "id": a_id, "paperId": p["id"], "facultyId": f["id"],
            "assignedAt": assigned_at.isoformat(), "dueDate": (assigned_at + timedelta(days=14)).date().isoformat(),
            "status": "Completed" if done else "Pending", "assignedBy": "MASTER",
        })
        if done:
            rec = random.choice(RECS)
            s = {"Accept": 4, "Accept with Minor Revisions": 4, "Major Revisions": 3, "Reject": 2, "Recommended for Journal Publication": 5}[rec]
            scores = {k: max(1, min(5, s + random.choice([-1, 0, 0, 1]))) for k in ["originality", "methodology", "relevance", "clarity"]}
            reviews.append({
                "id": f"REV-{len(reviews) + 1:03d}", "assignmentId": a_id, "paperId": p["id"], "facultyId": f["id"],
                **scores, "overall": s, "recommendation": rec,
                "commentsToAuthors": COMMENTS[rec],
                "confidentialComments": "" if random.random() < 0.6 else "Check for overlap with an earlier working paper by the same group.",
                "submittedAt": (assigned_at + timedelta(days=random.randint(2, 9))).isoformat(),
            })

# Final decisions for the first four papers; two of the emails already sent.
for i, p in enumerate(papers[:4]):
    revs = [r for r in reviews if r["paperId"] == p["id"]]
    decisions.append({
        "paperId": p["id"], "finalDecision": revs[0]["recommendation"], "decidedBy": "MASTER",
        "decidedAt": (base + timedelta(days=12, hours=i)).isoformat(),
        "emailStatus": "Sent" if i < 2 else "Draft",
        "emailSentAt": (base + timedelta(days=12, hours=i + 2)).isoformat() if i < 2 else "",
        "notes": "",
    })

seed = {"domains": src["domains"], "faculty": faculty, "papers": papers,
        "assignments": assignments, "reviews": reviews, "decisions": decisions,
        "settings": {"conferenceName": "NICOM 2026", "conferenceEmail": "nicom@example.edu",
                     "driveFolder": f"https://drive.google.com/drive/folders/{drive['submissionsFolder']}"}}
Path("data/seed.json").write_text(json.dumps(seed, indent=2))
print(f"seed: {len(papers)} papers, {len(assignments)} assignments, {len(reviews)} reviews, {len(decisions)} decisions")

# ---------- XLSX (becomes the Google Sheet) ----------
if len(sys.argv) > 1:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    sys.path.insert(0, str(Path(__file__).parent))
    cols = json.loads(Path("lib/sheet-columns.json").read_text())
    wb = Workbook(); wb.remove(wb.active)
    tables = {"Submissions": papers, "Faculty": faculty, "Assignments": assignments, "Reviews": reviews, "Decisions": decisions}
    for tab, rows in tables.items():
        ws = wb.create_sheet(tab)
        spec = cols[tab]
        ws.append([c["header"] for c in spec])
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A68")
        for r in rows:
            out = []
            for c in spec:
                v = r.get(c["key"], "")
                if isinstance(v, list): v = ", ".join(v)
                if isinstance(v, bool): v = "TRUE" if v else "FALSE"
                out.append(v)
            ws.append(out)
        ws.freeze_panes = "A2"
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(48, max(12, max(len(str(c.value or "")) for c in col) + 2))
    wb.save(sys.argv[1])
    print("xlsx:", sys.argv[1])
