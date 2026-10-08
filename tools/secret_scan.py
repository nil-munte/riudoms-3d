"""Scan for credentials before publishing.

    python tools/secret_scan.py            # every blob in the git history of the current repo
    python tools/secret_scan.py --tree DIR # every text file under DIR (also ignored ones)

Exits with status 1 when something is found. Matches are printed masked.
"""
import os
import re
import subprocess
import sys

PATTERNS = {
    "Google API key": r"AIza[0-9A-Za-z_\-]{35}",
    "Google OAuth client secret": r"GOCSPX-[0-9A-Za-z_\-]{20,}",
    "GitHub token": r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})",
    "AWS access key": r"\b(AKIA|ASIA)[0-9A-Z]{16}\b",
    "AWS secret": r"aws_secret_access_key\s*[:=]\s*\S{20,}",
    "Slack token": r"\bxox[abprs]-[0-9A-Za-z\-]{10,}",
    "Stripe live key": r"\b(sk|rk|pk)_live_[0-9A-Za-z]{16,}",
    "OpenAI key": r"\bsk-(proj-)?[A-Za-z0-9_\-]{32,}",
    "Anthropic key": r"\bsk-ant-[A-Za-z0-9_\-]{20,}",
    "Mapbox token": r"\b(pk|sk)\.eyJ[0-9A-Za-z_\-]{20,}\.[0-9A-Za-z_\-]{10,}",
    "Private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "JWT": r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
    "Azure storage key": r"AccountKey=[A-Za-z0-9+/=]{40,}",
    "Credentials in URL": r"\bhttps?://[^/\s:@'\"]+:[^@\s/'\"]{3,}@",
    "Key in URL parameter": r"[?&](key|api_key|apikey|access_token|token|client_secret|signature)=[A-Za-z0-9_\-]{16,}",
    "Assigned secret": r"(?i)\b(api[_-]?key|client[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd)\b[\"']?\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']",
}
RX = {k: re.compile(v.encode()) for k, v in PATTERNS.items()}
SKIP_DIRS = {"node_modules", ".venv", ".git", "__pycache__"}


def mask(s: bytes) -> str:
    t = s.decode("utf-8", "replace")
    return t[:6] + "…" + t[-3:] if len(t) > 12 else t[:3] + "…"


def scan_bytes(name: str, data: bytes, hits: list):
    if b"\0" in data[:8000]:
        return  # binary
    for k, rx in RX.items():
        for m in rx.finditer(data):
            hits.append((k, name, mask(m.group(0))))


def scan_history(hits):
    objs = subprocess.run(["git", "rev-list", "--objects", "--all"], capture_output=True, check=True).stdout.decode()
    names = {}
    for line in objs.splitlines():
        sha, _, path = line.partition(" ")
        names.setdefault(sha, path)
    p = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    n = 0
    for sha, path in names.items():
        p.stdin.write((sha + "\n").encode())
        p.stdin.flush()
        head = p.stdout.readline().split()
        size = int(head[2])
        data = p.stdout.read(size)
        p.stdout.read(1)
        if head[1] == b"blob":
            n += 1
            scan_bytes(path, data, hits)
    p.stdin.close()
    return n


def scan_tree(root, hits):
    n = 0
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for f in fns:
            fp = os.path.join(dp, f)
            try:
                if os.path.getsize(fp) > 50_000_000:
                    continue
                data = open(fp, "rb").read()
            except OSError:
                continue
            n += 1
            scan_bytes(os.path.relpath(fp, root), data, hits)
    return n


if __name__ == "__main__":
    hits = []
    if "--tree" in sys.argv:
        n = scan_tree(sys.argv[sys.argv.index("--tree") + 1], hits)
        what = "files"
    else:
        n = scan_history(hits)
        what = "blobs in history"
    seen = set()
    for k, name, m in hits:
        if (k, name, m) in seen:
            continue
        seen.add((k, name, m))
        print(f"{k:28s} {name}  {m}")
    print(f"scanned {n} {what}: {len(seen)} findings")
    sys.exit(1 if seen else 0)
