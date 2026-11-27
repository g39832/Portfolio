#!/usr/bin/env python3
"""The DevOps course: lessons, quizzes, auto-checked tasks and your progress, next to the terminals.

Runs inside the practice-terminal pod (see start.sh) on 127.0.0.1:7700; nginx in front of it
asks for the login and sends /term/ to the terminals (ttyd).

  course/modules/*.yaml   the course itself (one file per module, in order)
  envs/<lab>/missions.md  missions a task can point at with `mission: <title>` (same checks as `learn`)
  /work/.course/progress.json   what you've done (on the lab volume, so it survives restarts)

Checks and "on your cluster" panels only run commands written in the course files, never
anything sent by the browser. They run as the terminal's own user with the lab's environment,
so they can't do anything you couldn't do in that lab's terminal.
"""
import glob, hashlib, json, os, random, subprocess, threading, time
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

import yaml

SANDBOX = os.environ.get("SANDBOX", "/opt/sandbox")
WORK = os.environ.get("WORK", "/work")
HERE = os.path.dirname(os.path.abspath(__file__))
PROGRESS = os.path.join(WORK, ".course", "progress.json")
LOCK = threading.Lock()
XP = {"task": 15, "question": 5, "lesson": 25, "module": 100}
REVIEW_GAPS = [0, 1, 3, 7]          # days until a missed question comes back, by box


# ---------- course content ----------

def parse_missions(lab):
    """envs/<lab>/missions.md -> {title: {text, hints, check}} (the same format `learn` reads)."""
    path = os.path.join(SANDBOX, "envs", lab, "missions.md")
    out, cur = {}, None
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8").read().splitlines():
        if line.startswith("## "):
            cur = {"title": line[3:].strip(), "text": [], "hints": [], "check": ""}
            out[cur["title"]] = cur
        elif cur is None:
            continue
        elif line.startswith("hint:"):
            cur["hints"].append(line[5:].strip())
        elif line.startswith("check:"):
            cur["check"] = line[6:].strip()
        else:
            cur["text"].append(line)
    for m in out.values():
        m["text"] = "\n".join(m["text"]).strip()
    return out


def load_course():
    modules, problems = [], []
    missions = {}
    for path in sorted(glob.glob(os.path.join(HERE, "modules", "*.yaml"))):
        mod = yaml.safe_load(open(path, encoding="utf-8"))
        for lesson in mod["lessons"]:
            lesson["key"] = f"{mod['id']}/{lesson['id']}"
            for i, t in enumerate(lesson.get("tasks", [])):
                t.setdefault("lab", mod["lab"])
                if "mission" in t:
                    ms = missions.setdefault(t["lab"], parse_missions(t["lab"]))
                    m = ms.get(t["mission"])
                    if not m:
                        problems.append(f"{lesson['key']}: no mission {t['mission']!r} in {t['lab']}")
                        continue
                    t.setdefault("title", m["title"])
                    t.setdefault("text", m["text"])
                    t.setdefault("hints", m["hints"])
                    t.setdefault("check", m["check"])
                t["id"] = str(i)
                if not t.get("check"):
                    problems.append(f"{lesson['key']} task {i}: no check")
            for q in lesson.get("quiz", []):
                if not 0 <= q["answer"] < len(q["choices"]):
                    problems.append(f"{lesson['key']}: answer out of range in {q['q']!r}")
                    continue
                # Shuffle the choices so the right one isn't always in the same spot. Seeded by the
                # question, so the order stays the same between restarts (and in Review).
                right = q["choices"][q["answer"]]
                order = list(q["choices"])
                random.Random(hashlib.sha256(q["q"].encode()).digest()).shuffle(order)
                q["choices"], q["answer"] = order, order.index(right)
        modules.append(mod)
    return modules, problems


COURSE, PROBLEMS = load_course()
LESSONS = {l["key"]: (m, l) for m in COURSE for l in m["lessons"]}


def public_course():
    """The course without the check commands (the page never needs them)."""
    out = []
    for m in COURSE:
        mm = {k: v for k, v in m.items() if k != "lessons"}
        mm["lessons"] = []
        for l in m["lessons"]:
            ll = {k: v for k, v in l.items() if k not in ("tasks", "quiz", "live")}
            ll["tasks"] = [{k: t.get(k) for k in ("id", "title", "text", "hints", "lab")} for t in l.get("tasks", [])]
            ll["quiz"] = [{"q": q["q"], "choices": q["choices"]} for q in l.get("quiz", [])]
            ll["live"] = [{"title": x["title"], "note": x.get("note", "")} for x in l.get("live", [])]
            mm["lessons"].append(ll)
        out.append(mm)
    return out


# ---------- progress ----------

def blank():
    return {"lessons": {}, "events": [], "review": {}, "last": None, "unlock_all": False, "imported": False}


def load_progress():
    try:
        p = json.load(open(PROGRESS, encoding="utf-8"))
    except (OSError, ValueError):
        p = blank()
    for k, v in blank().items():
        p.setdefault(k, v)
    return p


def save_progress(p):
    os.makedirs(os.path.dirname(PROGRESS), exist_ok=True)
    tmp = PROGRESS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(p, f, indent=1)
    os.replace(tmp, PROGRESS)


def lp(p, key):
    return p["lessons"].setdefault(key, {"read": None, "quiz": None, "tasks": {}, "done": None})


def event(p, kind, ref, xp):
    p["events"].append({"t": int(time.time()), "kind": kind, "ref": ref, "xp": xp})
    p["events"] = p["events"][-5000:]


def lesson_done(p, key):
    _, l = LESSONS[key]
    s = p["lessons"].get(key)
    if not s or not s.get("read"):
        return False
    if l.get("quiz") and not (s.get("quiz") or {}).get("passed"):
        return False
    return all(t["id"] in s.get("tasks", {}) for t in l.get("tasks", []))


def settle(p, key):
    """Mark the lesson (and its module) done when everything in it is, and hand out the XP once."""
    if key not in LESSONS:
        return
    s = lp(p, key)
    if not s.get("done") and lesson_done(p, key):
        s["done"] = int(time.time())
        event(p, "lesson", key, XP["lesson"])
        mod = LESSONS[key][0]
        mods = p.setdefault("modules_done", {})
        if mod["id"] not in mods and all(lesson_done(p, l["key"]) for l in mod["lessons"]):
            mods[mod["id"]] = int(time.time())
            event(p, "module", mod["id"], XP["module"])


def import_learn(p):
    """Missions you already passed with `learn` in a terminal count here too (once, at first start)."""
    for m in COURSE:
        for l in m["lessons"]:
            for t in l.get("tasks", []):
                if "mission" not in t:
                    continue
                try:
                    done = set(json.load(open(os.path.join(WORK, t["lab"], ".learn-done"))))
                except (OSError, ValueError):
                    continue
                if t["mission"] in done:
                    s = lp(p, l["key"])
                    if t["id"] not in s["tasks"]:
                        s["tasks"][t["id"]] = int(time.time())
                        event(p, "task", f"{l['key']}#{t['id']}", XP["task"])
    p["imported"] = True


def unlocked(p):
    """Each lesson opens when the one before it is done (straight through the modules)."""
    if p.get("unlock_all"):
        return {k: True for k in LESSONS}
    out, prev_done = {}, True
    for m in COURSE:
        for l in m["lessons"]:
            done = bool(lp(p, l["key"]).get("done")) if l["key"] in p["lessons"] else False
            out[l["key"]] = prev_done or done
            prev_done = done
    return out


def today():
    return date.today()


def stats(p):
    xp = sum(e.get("xp", 0) for e in p["events"])
    level, need = 1, 100
    rest = xp
    while rest >= need:
        rest -= need
        level += 1
        need = 100 + (level - 1) * 50
    days = {}
    for e in p["events"]:
        d = datetime.fromtimestamp(e["t"]).date().isoformat()
        days[d] = days.get(d, 0) + max(1, e.get("xp", 0))
    streak, d = 0, today()
    if d.isoformat() not in days:
        d -= timedelta(days=1)          # today isn't over yet: a streak from yesterday still counts
    while d.isoformat() in days:
        streak += 1
        d -= timedelta(days=1)
    best, run, prev = 0, 0, None
    for k in sorted(days):
        cur = date.fromisoformat(k)
        run = run + 1 if prev and cur - prev == timedelta(days=1) else 1
        best, prev = max(best, run), cur
    total_tasks = sum(len(l.get("tasks", [])) for _, l in LESSONS.values())
    done_tasks = sum(len(s.get("tasks", {})) for s in p["lessons"].values())
    due = sum(1 for r in p["review"].values() if r["due"] <= time.time())
    return {"xp": xp, "level": level, "level_xp": rest, "level_need": need, "streak": streak, "best_streak": best,
            "days": days, "lessons_done": sum(1 for k in LESSONS if (p["lessons"].get(k) or {}).get("done")),
            "lessons_total": len(LESSONS), "tasks_done": done_tasks, "tasks_total": total_tasks, "review_due": due}


def state():
    with LOCK:
        p = load_progress()
        if not p["imported"]:
            import_learn(p)
            for k in LESSONS:
                settle(p, k)
            save_progress(p)
        return {"progress": p, "unlocked": unlocked(p), "stats": stats(p)}


# ---------- running checks ----------

def lab_env(lab):
    home = os.path.join(WORK, lab)
    env = dict(os.environ, LAB=lab, HOME=home, SANDBOX=SANDBOX, KUBECONFIG=os.path.join(WORK, ".kube", "config"))
    env["PATH"] = f"{home}/bin:" + env.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    return env, home


def run_in_lab(lab, cmd, timeout=30):
    env, home = lab_env(lab)
    prep = os.path.join(SANDBOX, "prep.sh")
    if os.path.exists(prep):        # makes the lab's home + kubeconfig the first time, like opening its terminal
        subprocess.run(["bash", prep, lab], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    try:
        r = subprocess.run(["bash", "-c", cmd], cwd=home, env=env, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr)[-4000:]
    except subprocess.TimeoutExpired:
        return 124, "(took too long)"


LIVE_CACHE = {}


def live(key, n):
    _, l = LESSONS[key]
    item = l["live"][n]
    hit = LIVE_CACHE.get((key, n))
    if hit and time.time() - hit[0] < 20:
        return hit[1]
    code, out = run_in_lab(item.get("lab", LESSONS[key][0]["lab"]), item["cmd"], timeout=20)
    res = {"cmd": item["cmd"], "out": out.rstrip() or "(no output)", "ok": code == 0, "at": int(time.time())}
    LIVE_CACHE[(key, n)] = (time.time(), res)
    return res


# ---------- actions ----------

def act_read(body):
    key = body["lesson"]
    with LOCK:
        p = load_progress()
        s = lp(p, key)
        p["last"] = key
        if not s.get("read"):
            s["read"] = int(time.time())
            event(p, "read", key, 0)
        settle(p, key)
        save_progress(p)
    return {"ok": True}


def act_open(body):
    with LOCK:
        p = load_progress()
        p["last"] = body["lesson"]
        save_progress(p)
    return {"ok": True}


def act_check(body):
    key, tid = body["lesson"], str(body["task"])
    _, l = LESSONS[key]
    t = next(t for t in l["tasks"] if t["id"] == tid)
    code, out = run_in_lab(t["lab"], t["check"])
    ok = code == 0
    with LOCK:
        p = load_progress()
        s = lp(p, key)
        first = ok and tid not in s["tasks"]
        if first:
            s["tasks"][tid] = int(time.time())
            event(p, "task", f"{key}#{tid}", XP["task"])
        elif not ok:
            event(p, "try", f"{key}#{tid}", 0)
        settle(p, key)
        save_progress(p)
    return {"ok": ok, "first": first, "already": ok and not first}


def review_add(p, ref):
    r = p["review"].setdefault(ref, {"box": 0, "due": 0, "misses": 0})
    r["box"], r["misses"], r["due"] = 0, r["misses"] + 1, time.time()


def review_right(p, ref):
    r = p["review"].get(ref)
    if not r:
        return
    r["box"] += 1
    if r["box"] >= len(REVIEW_GAPS):
        del p["review"][ref]
    else:
        r["due"] = time.time() + REVIEW_GAPS[r["box"]] * 86400 - 3600


def act_quiz(body):
    key, answers = body["lesson"], body["answers"]
    _, l = LESSONS[key]
    qs = l.get("quiz", [])
    results = []
    with LOCK:
        p = load_progress()
        s = lp(p, key)
        prev = s.get("quiz") or {}
        seen = set(prev.get("right", []))
        gained = 0
        for i, q in enumerate(qs):
            a = answers[i] if i < len(answers) else None
            right = a == q["answer"]
            results.append({"right": right, "answer": q["answer"], "why": q.get("why", "")})
            ref = f"{key}?{i}"
            if right:
                review_right(p, ref)
                if i not in seen:
                    seen.add(i)
                    gained += XP["question"]
            else:
                review_add(p, ref)
        score = sum(r["right"] for r in results)
        passed = score == len(qs)
        s["quiz"] = {"best": max(score, prev.get("best", 0)), "of": len(qs), "tries": prev.get("tries", 0) + 1,
                     "right": sorted(seen), "passed": prev.get("passed") or (int(time.time()) if passed else None)}
        event(p, "quiz", key, gained)
        settle(p, key)
        save_progress(p)
    return {"results": results, "score": score, "of": len(qs), "passed": passed}


def review_set(p, practice):
    now = time.time()
    if not practice:
        refs = [r for r, v in sorted(p["review"].items(), key=lambda kv: kv[1]["due"]) if v["due"] <= now]
    else:                                    # a mixed quiz from lessons you've finished
        refs = [f"{k}?{i}" for k, (_, l) in LESSONS.items() if (p["lessons"].get(k) or {}).get("done")
                for i in range(len(l.get("quiz", [])))]
        random.shuffle(refs)
    out = []
    for ref in refs[:10]:
        key, i = ref.rsplit("?", 1)
        if key not in LESSONS or int(i) >= len(LESSONS[key][1].get("quiz", [])):
            continue
        m, l = LESSONS[key]
        q = l["quiz"][int(i)]
        out.append({"ref": ref, "lesson": key, "module": m["title"], "lessonTitle": l["title"], "q": q["q"], "choices": q["choices"]})
    return out


def act_review_answer(body):
    ref, a = body["ref"], body["answer"]
    key, i = ref.rsplit("?", 1)
    q = LESSONS[key][1]["quiz"][int(i)]
    right = a == q["answer"]
    with LOCK:
        p = load_progress()
        if right:
            review_right(p, ref)
        else:
            review_add(p, ref)
        event(p, "review", ref, 2 if right else 0)
        save_progress(p)
    return {"right": right, "answer": q["answer"], "why": q.get("why", "")}


def act_settings(body):
    with LOCK:
        p = load_progress()
        if "unlock_all" in body:
            p["unlock_all"] = bool(body["unlock_all"])
        save_progress(p)
    return {"ok": True}


def act_reset_lesson(body):
    key = body["lesson"]
    with LOCK:
        p = load_progress()
        p["lessons"].pop(key, None)
        p.get("modules_done", {}).pop(LESSONS[key][0]["id"], None)
        save_progress(p)
    return {"ok": True}


ACTIONS = {"read": act_read, "open": act_open, "check": act_check, "quiz": act_quiz,
           "review-answer": act_review_answer, "settings": act_settings, "reset-lesson": act_reset_lesson}
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json"}


class Handler(BaseHTTPRequestHandler):
    server_version = "course"

    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/course":
                return self.send(200, {"modules": public_course(), "problems": PROBLEMS})
            if path == "/api/state":
                return self.send(200, state())
            if path.startswith("/api/live/"):
                key, n = unquote(path[len("/api/live/"):]).rsplit("/", 1)
                return self.send(200, live(key, int(n)))
            if path.startswith("/api/review"):
                with LOCK:
                    p = load_progress()
                return self.send(200, {"questions": review_set(p, "practice" in path)})
            name = "index.html" if path in ("/", "") else path.lstrip("/")
            full = os.path.normpath(os.path.join(HERE, "static", name))
            if not full.startswith(os.path.join(HERE, "static")) or not os.path.isfile(full):
                full = os.path.join(HERE, "static", "index.html")     # the page does its own routing
            ext = os.path.splitext(full)[1]
            return self.send(200, open(full, "rb").read(), TYPES.get(ext, "application/octet-stream"))
        except (KeyError, IndexError, ValueError, StopIteration):
            return self.send(404, {"error": "not found"})

    def do_POST(self):
        name = urlparse(self.path).path.removeprefix("/api/")
        fn = ACTIONS.get(name)
        if not fn:
            return self.send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 65536)) or b"{}")
            return self.send(200, fn(body))
        except (KeyError, IndexError, ValueError, StopIteration, TypeError):
            return self.send(400, {"error": "bad request"})


if __name__ == "__main__":
    for msg in PROBLEMS:
        print("course problem:", msg, flush=True)
    addr = os.environ.get("COURSE_ADDR", "127.0.0.1")
    port = int(os.environ.get("COURSE_PORT", "7700"))
    print(f"course on {addr}:{port}: {len(COURSE)} modules, {len(LESSONS)} lessons", flush=True)
    ThreadingHTTPServer((addr, port), Handler).serve_forever()
