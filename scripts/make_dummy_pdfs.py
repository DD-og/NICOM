"""Render one dummy manuscript PDF per paper in data/dummy_source.json -> out dir (arg 1)."""
import json, sys
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
src = json.loads(Path("data/dummy_source.json").read_text())
ss = getSampleStyleSheet()
LOREM = ("This section is placeholder text for a dummy NICOM 2026 submission used to test the review portal. "
         "In a real manuscript, the authors would present the motivation, theoretical background, hypotheses, "
         "methodology, results and discussion here. ") * 3

for p in src["papers"]:
    doc = SimpleDocTemplate(str(out / f"{p['id']}.pdf"), pagesize=A4, title=p["title"])
    story = [
        Paragraph("NICOM 2026 &mdash; Dummy Submission", ss["Italic"]), Spacer(1, 8),
        Paragraph(p["title"], ss["Title"]),
        Paragraph(f"Track: {p['domain']} &nbsp;|&nbsp; Paper ID: {p['id']}", ss["Normal"]), Spacer(1, 12),
        Paragraph("Abstract", ss["Heading2"]), Paragraph(p["abstract"], ss["BodyText"]),
        Paragraph(f"<b>Keywords:</b> {p['keywords']}", ss["BodyText"]),
    ]
    for h in ["1. Introduction", "2. Literature Review", "3. Methodology", "4. Results", "5. Conclusion"]:
        story += [Paragraph(h, ss["Heading2"]), Paragraph(LOREM, ss["BodyText"])]
    doc.build(story)
print("done", len(src["papers"]))
