"""Turn the conference website's submissions export (.csv, one row per author) into the Sheet's papers tab.

Run: python3 scripts/import_papers.py nicom_data_YYYYMMDD.csv
Writes data/papers-import.csv (git-ignored: it holds author names and emails), with only full papers.

- One paper per row; the other author rows become Co-Authors and Author Emails (used to stop a faculty
  member from reviewing their own paper). Phone numbers and addresses are left out.
- The same paper submitted more than once (same title) is kept once: the latest submission.
- When two different papers carry the same code, the later one gets "-B" ("-C", ...) so every Paper ID is
  unique. Codes are otherwise kept, so importing a newer export keeps existing assignments and reviews.
"""
import csv, re, sys
from pathlib import Path

OUT = Path("data/papers-import.csv")
HEADERS = ["Paper ID", "Timestamp", "Email Address", "Corresponding Author Name", "Affiliation", "Co-Authors",
           "Paper Title", "Track / Domain", "Upload Paper", "Author Emails"]
TRACKS = re.findall(r'"([^"]+)"', re.search(r"DOMAINS = \[(.*?)\];", Path("lib/config.ts").read_text(), re.S).group(1))


def person(name: str) -> str:
    return re.sub(r"[^a-z]", "", re.sub(r"^(?:\s*(?:prof|dr|mr|mrs|ms)\b\.?)+", "", name.lower()))


def title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", title.lower().replace("&", "and"))


def read_papers(path: str):
    """Group the export's author rows under the paper row above them (the export lists the paper row first)."""
    papers = []
    for pos, r in enumerate(csv.DictReader(open(path, encoding="utf-8-sig", newline=""))):
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        if r.get("Title Of the Paper"):
            papers.append({"row": r, "authors": [r], "pos": pos})
        elif papers:
            papers[-1]["authors"].append(r)
    return papers


def main(src: str):
    papers = [p for p in read_papers(src) if p["row"].get("File link (Full Paper)")]
    total_full = len(papers)

    # Same paper submitted twice: keep the latest (newest date; same day -> the row listed first, as the export is newest-first).
    papers.sort(key=lambda p: (p["row"]["Created Date"], -p["pos"]), reverse=True)
    kept, dropped, seen = [], [], {}
    for p in papers:
        key = title_key(p["row"]["Title Of the Paper"])
        if key in seen:
            dropped.append((p["row"]["Paper code"], seen[key]))
        else:
            seen[key] = p["row"]["Paper code"]
            kept.append(p)

    # Different papers sharing a code: the earliest keeps it, later ones get -B, -C, ...
    kept.sort(key=lambda p: (p["row"]["Created Date"], -p["pos"]))
    used, renamed = {}, []
    for p in kept:
        code = p["row"]["Paper code"]
        n = used.get(code, 0)
        used[code] = n + 1
        p["id"] = code if n == 0 else f"{code}-{chr(ord('A') + n)}"
        if n:
            renamed.append((code, p["id"], p["row"]["Title Of the Paper"][:60]))

    rows, unknown_tracks = [], []
    for p in kept:
        r = p["row"]
        corr = r.get("Corresponding Author") or r.get("Author Name", "")
        lead = next((a for a in p["authors"] if person(a.get("Author Name", "")) == person(corr)), p["authors"][0])
        others = [a["Author Name"] for a in p["authors"] if a is not lead and a.get("Author Name")]
        emails = list(dict.fromkeys(a["Email ID"].lower() for a in p["authors"] if a.get("Email ID")))
        affiliation = ", ".join(x for x in (lead.get("Institute"), lead.get("City")) if x)
        if r["Theme Area"] not in TRACKS:
            unknown_tracks.append((p["id"], r["Theme Area"]))
        rows.append([p["id"], r["Created Date"], (lead.get("Email ID") or r.get("Email ID", "")).lower(), corr, affiliation,
                     ", ".join(others), r["Title Of the Paper"], r["Theme Area"], r["File link (Full Paper)"], "; ".join(emails)])

    rows.sort(key=lambda x: (x[1], x[0]))
    with OUT.open("w", newline="") as f:
        csv.writer(f).writerows([HEADERS, *rows])

    print(f"{total_full} full papers in the export -> {len(rows)} papers in {OUT}")
    for old, kept_code in dropped:
        print(f"  duplicate: dropped {old} (kept the later submission {kept_code})")
    for code, new, title in renamed:
        print(f"  shared code: {code} -> {new} ({title})")
    for pid, t in unknown_tracks:
        print(f"  WARNING {pid}: track {t!r} is not one of the conference tracks")


if __name__ == "__main__":
    main(sys.argv[1])
