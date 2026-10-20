"""One-click deploy of the graduation system to cPanel over FTP(S).

Usage (from anywhere):
    python deploy/deploy.py front            build the frontend and upload it
    python deploy/deploy.py back             upload the backend and restart it
    python deploy/deploy.py all              front + back
    python deploy/deploy.py check            only run the health checks
    python deploy/deploy.py rollback-front   restore the previous frontend
Options:
    --full       (back) upload every file, ignore the "already uploaded" cache
    --no-build   (front) upload the existing dist/ without rebuilding
    --yes        don't ask for confirmation

Settings live in deploy/deploy.config.json (copy deploy.config.example.json).
The FTP password is NEVER stored in that file: it is read from the
DEPLOY_FTP_PASSWORD environment variable, or asked for when the script runs.
"""

import argparse
import fnmatch
import ftplib
import getpass
import hashlib
import io
import json
import os
import posixpath
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "deploy.config.json"
CACHE_PATH = SCRIPT_DIR / ".deploy_cache.json"

# Remote folders this script must never replace or delete.
PROTECTED_REMOTE = {
    "", ".", "/", "public_html", "public_html/app", "public_html/api",
    "public_html/guide", "public_html/yawmi", "public_html/gradapi",
    "wijhatak", "virtualenv",
}

# Backend files/folders that are never uploaded.
BACK_ALWAYS_EXCLUDE = [
    "__pycache__", "*.pyc", ".pytest_cache", "tests", ".venv", "venv", "env",
    ".env", ".env.*", "*.log", ".git", "node_modules", "*.docx", "*.pdf",
    "Dockerfile", ".dockerignore", "pytest.ini", "requirements-dev.txt",
    "tmp", "stderr.log",
]


# --------------------------------------------------------------------------- utils

class DeployError(Exception):
    pass


def say(msg=""):
    print(msg, flush=True)


def step(msg):
    say("")
    say(f"==> {msg}")


def load_config():
    if not CONFIG_PATH.exists():
        raise DeployError(
            f"Missing {CONFIG_PATH.name}. Copy deploy.config.example.json to "
            f"deploy.config.json next to this script and fill it in."
        )
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    if "password" in cfg.get("ftp", {}):
        raise DeployError(
            "Remove 'password' from deploy.config.json. The password is read from "
            "DEPLOY_FTP_PASSWORD or asked for when the script runs."
        )
    repo = cfg.get("repo_root") or ".."
    cfg["_repo"] = (SCRIPT_DIR / repo).resolve()
    return cfg


def norm_remote(path):
    p = posixpath.normpath(path.strip().strip("/"))
    if p.startswith("..") or "/../" in f"/{p}/":
        raise DeployError(f"Remote path may not contain '..': {path}")
    return "" if p == "." else p


def guard_remote(path, what):
    p = norm_remote(path)
    if p in PROTECTED_REMOTE:
        raise DeployError(f"Refusing to use protected remote folder for {what}: '{p or '/'}'")
    return p


def confirm(question, assume_yes):
    if assume_yes:
        return True
    ans = input(f"{question} [y/N] ").strip().lower()
    return ans in ("y", "yes", "ن", "نعم")


def load_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=1, sort_keys=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def excluded(rel_parts, patterns):
    for part in rel_parts:
        for pat in patterns:
            if fnmatch.fnmatch(part, pat):
                return True
    rel = "/".join(rel_parts)
    return any(fnmatch.fnmatch(rel, pat) for pat in patterns)


def list_local_files(root, patterns):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        dir_parts = [] if str(rel_dir) == "." else list(rel_dir.parts)
        dirnames[:] = sorted(d for d in dirnames if not excluded(dir_parts + [d], patterns))
        for name in sorted(filenames):
            parts = dir_parts + [name]
            if not excluded(parts, patterns):
                files.append(("/".join(parts), Path(dirpath) / name))
    return files


# --------------------------------------------------------------------------- FTP

class Remote:
    def __init__(self, cfg):
        ftp_cfg = cfg["ftp"]
        self.host = ftp_cfg["host"]
        self.port = int(ftp_cfg.get("port", 21))
        self.user = ftp_cfg["user"]
        self.use_tls = ftp_cfg.get("tls", True)
        self.verify_tls = ftp_cfg.get("verify_tls", False)
        self.password = os.environ.get("DEPLOY_FTP_PASSWORD") or getpass.getpass(
            f"FTP password for {self.user}: "
        )
        self.ftp = None

    def connect(self):
        step(f"Connecting to {self.host}:{self.port} as {self.user} "
             f"({'FTPS' if self.use_tls else 'plain FTP'})")
        try:
            if self.use_tls:
                ctx = ssl.create_default_context() if self.verify_tls else ssl._create_unverified_context()
                ftp = ftplib.FTP_TLS(context=ctx, timeout=60)
                ftp.connect(self.host, self.port)
                ftp.login(self.user, self.password)
                ftp.prot_p()
            else:
                ftp = ftplib.FTP(timeout=60)
                ftp.connect(self.host, self.port)
                ftp.login(self.user, self.password)
        except ftplib.error_perm as e:
            raise DeployError(f"FTP login failed: {e}") from None
        except (OSError, ssl.SSLError) as e:
            raise DeployError(f"Could not connect to FTP: {e}") from None
        ftp.set_pasv(True)
        ftp.encoding = "utf-8"
        self.ftp = ftp
        say(f"    connected, FTP root is '{ftp.pwd()}'")
        self.root = ftp.pwd().rstrip("/") or ""
        return self

    def close(self):
        if self.ftp:
            try:
                self.ftp.quit()
            except Exception:
                pass

    def _abs(self, path):
        return f"{self.root}/{path}" if path else (self.root or "/")

    def exists(self, path):
        parent, name = posixpath.split(path)
        try:
            names = [posixpath.basename(n) for n in self.ftp.nlst(self._abs(parent))]
        except ftplib.error_perm:
            return False
        return name in names

    def is_dir(self, path):
        cur = self.ftp.pwd()
        try:
            self.ftp.cwd(self._abs(path))
            return True
        except ftplib.error_perm:
            return False
        finally:
            self.ftp.cwd(cur)

    def makedirs(self, path, made):
        if not path or path in made:
            return
        parts = path.split("/")
        for i in range(1, len(parts) + 1):
            sub = "/".join(parts[:i])
            if sub in made:
                continue
            try:
                self.ftp.mkd(self._abs(sub))
            except ftplib.error_perm:
                pass  # already exists
            made.add(sub)

    def upload(self, local_path, remote_path, made_dirs):
        self.makedirs(posixpath.dirname(remote_path), made_dirs)
        with open(local_path, "rb") as f:
            self.ftp.storbinary(f"STOR {self._abs(remote_path)}", f)

    def upload_bytes(self, data, remote_path, made_dirs):
        self.makedirs(posixpath.dirname(remote_path), made_dirs)
        self.ftp.storbinary(f"STOR {self._abs(remote_path)}", io.BytesIO(data))

    def read_bytes(self, remote_path):
        buf = io.BytesIO()
        try:
            self.ftp.retrbinary(f"RETR {self._abs(remote_path)}", buf.write)
        except ftplib.error_perm:
            return None
        return buf.getvalue()

    def _entries(self, path):
        """Return [(name, is_dir)] for a remote directory."""
        out = []
        try:
            for name, facts in self.ftp.mlsd(self._abs(path)):
                if name in (".", ".."):
                    continue
                out.append((name, facts.get("type") == "dir"))
            return out
        except ftplib.error_perm:
            pass
        for full in self.ftp.nlst(self._abs(path)):
            name = posixpath.basename(full)
            if name in (".", ".."):
                continue
            out.append((name, self.is_dir(f"{path}/{name}")))
        return out

    def rmtree(self, path):
        guard_remote(path, "delete")
        for name, is_dir in self._entries(path):
            child = f"{path}/{name}"
            if is_dir:
                self.rmtree(child)
            else:
                self.ftp.delete(self._abs(child))
        self.ftp.rmd(self._abs(path))

    def rename(self, src, dst):
        self.ftp.rename(self._abs(src), self._abs(dst))


# --------------------------------------------------------------------------- checks

def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "graduation-deploy/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        return None, str(e)


def check_front(cfg):
    url = cfg["front"]["site_url"].rstrip("/") + "/"
    base = cfg["front"]["env"]["VITE_BASE_PATH"]
    status, body = http_get(url)
    ok = status == 200 and f"{base}assets/" in body
    say(f"    {'OK ' if ok else 'FAIL'} {url} -> {status}")
    deep = url + "login"
    status2, body2 = http_get(deep)
    ok2 = status2 == 200 and f"{base}assets/" in body2
    say(f"    {'OK ' if ok2 else 'FAIL'} {deep} -> {status2} (SPA refresh / .htaccess)")
    return ok and ok2


def check_back(cfg, wait_seconds=0):
    url = cfg["back"]["health_url"]
    deadline = time.time() + wait_seconds
    while True:
        status, body = http_get(url, timeout=30)
        ok = status == 200 and '"healthy"' in body
        if ok or time.time() >= deadline:
            break
        time.sleep(5)
    say(f"    {'OK ' if ok else 'FAIL'} {url} -> {status} {body[:160]}")
    return ok


# --------------------------------------------------------------------------- front

def build_front(cfg):
    front_dir = cfg["_repo"] / cfg["front"].get("dir", "front")
    if not (front_dir / "package.json").exists():
        raise DeployError(f"No package.json in {front_dir}")
    env = os.environ.copy()
    env.update({k: str(v) for k, v in cfg["front"]["env"].items()})
    shell = os.name == "nt"
    if cfg["front"].get("npm_ci", False):
        step("npm ci")
        subprocess.run("npm ci", cwd=front_dir, env=env, shell=shell, check=True) if shell \
            else subprocess.run(["npm", "ci"], cwd=front_dir, env=env, check=True)
    step("npm run build  (" + ", ".join(f"{k}={v}" for k, v in cfg["front"]["env"].items()) + ")")
    try:
        if shell:
            subprocess.run("npm run build", cwd=front_dir, env=env, shell=True, check=True)
        else:
            subprocess.run(["npm", "run", "build"], cwd=front_dir, env=env, check=True)
    except subprocess.CalledProcessError:
        raise DeployError("npm run build failed (see the output above). Nothing was uploaded.") from None
    except FileNotFoundError:
        raise DeployError("npm was not found. Install Node.js or run from a terminal where npm works.") from None


def verify_dist(cfg):
    dist = cfg["_repo"] / cfg["front"].get("dir", "front") / "dist"
    base = cfg["front"]["env"]["VITE_BASE_PATH"]
    index = dist / "index.html"
    if not index.exists():
        raise DeployError(f"{index} not found. Build first.")
    html = index.read_text(encoding="utf-8")
    if f"{base}assets/" not in html:
        raise DeployError(
            f"dist/index.html does not reference '{base}assets/'. The build did not use "
            f"VITE_BASE_PATH={base}. Refusing to upload."
        )
    if not (dist / ".htaccess").exists():
        raise DeployError("dist/.htaccess is missing (front/public/.htaccess). Refusing to upload.")
    files = list_local_files(dist, [])
    say(f"    dist OK: {len(files)} files, base '{base}', .htaccess present")
    return dist, files


def deploy_front(cfg, remote, args):
    if not args.no_build:
        build_front(cfg)
    step("Checking dist/")
    dist, files = verify_dist(cfg)

    target = guard_remote(cfg["front"]["remote_dir"], "frontend")
    staging, backup = f"{target}__new", f"{target}__old"
    if not confirm(f"Upload {len(files)} files and replace '{target}'?", args.yes):
        raise DeployError("Cancelled.")

    remote.connect()
    if remote.exists(staging):
        step(f"Removing leftover '{staging}'")
        remote.rmtree(staging)

    step(f"Uploading to '{staging}'")
    made = set()
    remote.makedirs(staging, made)
    for i, (rel, path) in enumerate(files, 1):
        remote.upload(path, f"{staging}/{rel}", made)
        say(f"    [{i}/{len(files)}] {rel}")

    step("Switching to the new version")
    if remote.exists(backup):
        remote.rmtree(backup)
    if remote.exists(target):
        remote.rename(target, backup)
        say(f"    previous version kept as '{backup}' (python deploy/deploy.py rollback-front)")
    remote.rename(staging, target)
    say(f"    '{target}' is live")

    step("Checking the site")
    if not check_front(cfg):
        say("    !! The frontend check failed. Open the site and check, or roll back with:")
        say("       python deploy/deploy.py rollback-front")
        return False
    return True


def rollback_front(cfg, remote, args):
    target = guard_remote(cfg["front"]["remote_dir"], "frontend")
    backup, failed = f"{target}__old", f"{target}__failed"
    remote.connect()
    if not remote.exists(backup):
        raise DeployError(f"No backup '{backup}' on the server.")
    if not remote.exists(target):
        raise DeployError(f"Nothing to roll back: '{target}' does not exist on the server.")
    if not confirm(f"Replace '{target}' with the previous version '{backup}'?", args.yes):
        raise DeployError("Cancelled.")
    if remote.exists(failed):
        remote.rmtree(failed)
    if remote.exists(target):
        remote.rename(target, failed)
    remote.rename(backup, target)
    say(f"    restored. The version you rolled back from is in '{failed}'.")
    return check_front(cfg)


# --------------------------------------------------------------------------- back

def deploy_back(cfg, remote, args):
    back_dir = cfg["_repo"] / cfg["back"].get("dir", "back")
    if not (back_dir / "app" / "main.py").exists():
        raise DeployError(f"{back_dir} does not look like the backend (no app/main.py).")
    target = guard_remote(cfg["back"]["remote_dir"], "backend")
    patterns = BACK_ALWAYS_EXCLUDE + list(cfg["back"].get("skip", []))
    files = list_local_files(back_dir, patterns)

    cache = load_cache()
    cache_key = f"back:{cfg['ftp']['host']}:{target}"
    uploaded = {} if args.full else cache.get(cache_key, {})
    hashes = {rel: sha256(path) for rel, path in files}
    changed = [(rel, path) for rel, path in files if uploaded.get(rel) != hashes[rel]]

    step(f"Backend: {len(files)} files, {len(changed)} changed since last deploy")
    skipped = cfg["back"].get("skip", [])
    if skipped:
        say(f"    never uploaded (config 'skip'): {', '.join(skipped)}")
    if not changed:
        say("    nothing to upload (use --full to force). Only checking the API.")
        return check_back(cfg)
    if not confirm(f"Upload {len(changed)} files into '{target}' and restart the app?", args.yes):
        raise DeployError("Cancelled.")

    remote.connect()
    if not remote.is_dir(target):
        raise DeployError(f"Remote '{target}' does not exist. Create the Python app in cPanel first.")

    remote_req = remote.read_bytes(f"{target}/requirements.txt")
    local_req = (back_dir / "requirements.txt").read_bytes()

    made = {target}
    for i, (rel, path) in enumerate(changed, 1):
        remote.upload(path, f"{target}/{rel}", made)
        uploaded[rel] = hashes[rel]
        say(f"    [{i}/{len(changed)}] {rel}")
        if i % 20 == 0:
            cache[cache_key] = uploaded
            save_cache(cache)
    cache[cache_key] = uploaded
    save_cache(cache)

    step("Restarting the app (tmp/restart.txt)")
    remote.upload_bytes(str(time.time()).encode(), f"{target}/tmp/restart.txt", made)

    req_changed = remote_req is not None and remote_req.replace(b"\r\n", b"\n") != local_req.replace(b"\r\n", b"\n")
    if req_changed:
        venv_py = cfg["back"].get(
            "venv_python", "/home/USER/virtualenv/graduation_back/3.11/bin/python")
        app_root = cfg["back"].get("app_root_abs", "/home/USER/graduation_back")
        say("")
        say("    !! requirements.txt changed. Install the new packages with ONE cron job")
        say("       (Once Per Minute, delete it after the first run):")
        say(f"       [ -f ~/pip_started ] || {{ touch ~/pip_started; {venv_py} -m pip install "
            f"-r {app_root}/requirements.txt > ~/pip_log.txt 2>&1; echo EXIT=$? >> ~/pip_log.txt; }}")
        say("       Then delete ~/pip_started and restart the app.")

    if cfg["back"].get("has_migrations_hint", True) and any(r.startswith("alembic/versions/") for r, _ in changed):
        say("")
        say("    !! New alembic migration files were uploaded. Run scripts/run_migrations.py on the server.")

    step("Checking the API (waiting up to 60s for the restart)")
    return check_back(cfg, wait_seconds=60)


# --------------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description="Deploy the graduation system to cPanel.")
    parser.add_argument("target", choices=["front", "back", "all", "check", "rollback-front"])
    parser.add_argument("--full", action="store_true", help="backend: upload every file")
    parser.add_argument("--no-build", action="store_true", help="frontend: skip npm run build")
    parser.add_argument("--yes", action="store_true", help="don't ask for confirmation")
    args = parser.parse_args()

    cfg = load_config()
    say(f"Repo: {cfg['_repo']}")

    if args.target == "check":
        step("Health checks")
        ok = check_back(cfg) & check_front(cfg)
        return 0 if ok else 1

    remote = Remote(cfg)
    try:
        ok = True
        if args.target in ("back", "all"):
            ok = deploy_back(cfg, remote, args) and ok
        if args.target in ("front", "all"):
            ok = deploy_front(cfg, remote, args) and ok
        if args.target == "rollback-front":
            ok = rollback_front(cfg, remote, args)
    finally:
        remote.close()

    say("")
    say("DONE ✅" if ok else "DONE, but a check failed ⚠️  (see above)")
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DeployError as e:
        say("")
        say(f"ERROR: {e}")
        sys.exit(2)
    except KeyboardInterrupt:
        say("\nCancelled.")
        sys.exit(130)
