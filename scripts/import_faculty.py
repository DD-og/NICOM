"""Turn the institute's faculty list (.xlsx, one sheet per programme) into portal accounts.

Run: python3 scripts/import_faculty.py Faculty_List.xlsx
Writes (all git-ignored, they hold password data):
  data/faculty-import.csv            rows for the Sheet's Faculty tab (password hashes only)
  data/faculty-logins.local.xlsx     name, email, login ID and password per person, to hand out
  data/faculty-credentials.local.json  passwords, reused on re-runs so logins stay the same
The admin account is kept from data/seed.json (same ID and password as before).
Each faculty Area is mapped to the conference tracks in AREA_TRACKS; edit it when the real tracks are final.
"""
import csv, hashlib, json, os, re, secrets, sys
from pathlib import Path

import openpyxl

AREA_TRACKS = {
    "finance & accounting": ["Finance & Accounting"],
    "marketing": ["Marketing"],
    "om & ds": ["Operations & Supply Chain", "Business Analytics & AI"],
    "information management": ["Business Analytics & AI"],
    "mathematics": ["Business Analytics & AI"],
    "hrm": ["HR & Organizational Behaviour"],
    "ob & hr": ["HR & Organizational Behaviour"],
    "ob & communication": ["HR & Organizational Behaviour"],
    "communication": ["HR & Organizational Behaviour"],
    "strategy & entrepreneurship": ["Strategy & Entrepreneurship", "Sustainability & ESG"],
    "economics": ["Economics & Public Policy", "Sustainability & ESG"],
    "sociology": ["Economics & Public Policy", "Sustainability & ESG"],
}
MAX_PAPERS = 8
FIRST_ID = 101  # FAC101 onwards, so nothing left over from the demo accounts (FAC01-FAC10) can attach to a real person
CRED_FILE = Path("data/faculty-credentials.local.json")
ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alikes (0/O, 1/l/I)
HEADERS = ["Faculty ID", "Username", "Name", "Email", "Role", "Domains", "Max Papers", "Active", "Password Hash", "Area", "Programme"]


def new_password() -> str:
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3))


def hash_pw(pw: str) -> str:
    # Must match lib/password.ts (scrypt N=16384, r=8, p=1, 64 bytes)
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${dk.hex()}"


def area_key(area: str) -> str:
    return re.sub(r"\s*&\s*", " & ", re.sub(r"\s+", " ", area.strip())).lower()


def read_people(path: str):
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb:
        programme = "UG" if "UG" in ws.title.upper() else "PG"
        cols = None
        for row in ws.iter_rows(values_only=True):
            cells = [str(c).strip() if c is not None else "" for c in row]
            if cols is None:
                if any(c.lower().startswith("email") for c in cells):
                    lower = [c.lower() for c in cells]
                    cols = {
                        "name": next(i for i, c in enumerate(lower) if "staff" in c or c == "name"),
                        "area": lower.index("area"),
                        "email": next(i for i, c in enumerate(lower) if c.startswith("email")),
                    }
                continue
            if cells[cols["email"]] and cells[cols["name"]]:
                yield {"name": cells[cols["name"]], "area": cells[cols["area"]], "email": cells[cols["email"]].lower(), "programme": programme}


def main(src: str):
    creds = json.loads(CRED_FILE.read_text()) if CRED_FILE.exists() else {}
    seed = json.loads(Path("data/seed.json").read_text())
    admin = next(f for f in seed["faculty"] if f["role"] == "master")
    rows = [[admin["id"], admin["username"], admin["name"], admin["email"], "master", "", 0, "TRUE", admin["passwordHash"], "", ""]]
    logins, seen, problems = [], set(), []
    for n, p in enumerate(read_people(src), FIRST_ID):
        user = p["email"].split("@")[0]
        if user in seen:
            sys.exit(f"Two people would get the login ID {user!r}; fix the emails first.")
        seen.add(user)
        tracks = AREA_TRACKS.get(area_key(p["area"]))
        if not tracks:
            sys.exit(f"No track mapping for area {p['area']!r} ({p['name']}); add it to AREA_TRACKS.")
        if not p["email"].endswith("@nirmauni.ac.in"):
            problems.append(f"{p['name']}: email {p['email']} is not @nirmauni.ac.in")
        creds.setdefault(user, new_password())
        area = re.sub(r"\s*&\s*", " & ", p["area"].strip())
        rows.append([f"FAC{n}", user, p["name"], p["email"], "faculty", ", ".join(tracks), MAX_PAPERS, "TRUE", hash_pw(creds[user]), area, p["programme"]])
        logins.append([p["programme"], p["name"], area, p["email"], ", ".join(tracks), user, creds[user]])
    CRED_FILE.write_text(json.dumps(creds, indent=2))

    with open("data/faculty-import.csv", "w", newline="") as f:
        csv.writer(f).writerows([HEADERS, *rows])

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Logins"
    ws.append(["Programme", "Name", "Area", "Email", "Review tracks", "Login ID", "Password"])
    ws.append(["", admin["name"] + " (admin)", "", admin["email"], "All", admin["username"], json.loads(Path("data/credentials.local.json").read_text()).get("admin", "(unchanged)") if Path("data/credentials.local.json").exists() else "(unchanged)"])
    for r in logins:
        ws.append(r)
    for col, width in zip("ABCDEFG", [11, 30, 26, 36, 52, 22, 18]):
        ws.column_dimensions[col].width = width
    for c in ws[1]:
        c.font = openpyxl.styles.Font(bold=True)
    ws.freeze_panes = "A2"
    wb.save("data/faculty-logins.local.xlsx")

    print(f"{len(logins)} faculty + 1 admin -> data/faculty-import.csv, data/faculty-logins.local.xlsx")
    for msg in problems:
        print("note:", msg)


if __name__ == "__main__":
    main(sys.argv[1])
