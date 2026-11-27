/* DevOps Path: the course page. Talks to course/server.py (/api/...), shows the terminal for the
   lesson's lab in an iframe (/term/?arg=<lab>&embed=1) and types commands into it with postMessage. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view"), pane = $("#termpane"), frame = $("#term"), tabs = $("#tabs");
  const wide = matchMedia("(min-width: 1000px)");
  let COURSE = null, S = null, termLab = null, termHidden = localStorage.getItem("termHidden") === "1";

  const LAB_NAMES = { linux: "Linux & the shell", bash: "Bash scripting", git: "Git & GitHub", k8s: "Kubernetes", net: "Networking",
    containers: "Containers", docker: "Docker & networking", security: "Security", backups: "Backups", ci: "CI/CD & YAML",
    iac: "Ansible & OpenTofu", pi: "Real Pi (SSH)" };

  // ---------- data ----------
  const api = async (path, body) => {
    const r = await fetch("/api/" + path, body === undefined ? { cache: "no-store" } :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  };
  const refresh = async () => { S = await api("state"); paintDue(); };
  const lessonState = (key) => (S.progress.lessons[key] || { tasks: {} });
  const allLessons = () => COURSE.modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ m, l, mi, li, key: `${m.id}/${l.id}` })));
  const find = (key) => allLessons().find((x) => x.key === key);
  const isDone = (key) => !!lessonState(key).done;
  const isOpen = (key) => !!S.unlocked[key];
  const modPct = (m) => {
    const n = m.lessons.length, d = m.lessons.filter((l) => isDone(`${m.id}/${l.id}`)).length;
    return { n, d, pct: n ? Math.round((100 * d) / n) : 0 };
  };
  const nextLesson = () => {
    const all = allLessons();
    const last = S.progress.last && find(S.progress.last);
    if (last && !isDone(last.key) && isOpen(last.key)) return last;
    return all.find((x) => !isDone(x.key) && isOpen(x.key)) || null;
  };

  // ---------- little helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  /* A small Markdown: paragraphs, ### headings, - and 1. lists, > tips, and ``` code. Lines in a
     code block that start with "$ " become commands with a Run button. */
  const md = (src) => {
    const out = [], lines = String(src || "").replace(/\r/g, "").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const body = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
        i++;
        if (body.some((l) => l.startsWith("$ "))) {
          out.push('<div class="code">' + body.filter((l) => l.trim()).map((l) => l.startsWith("$ ")
            ? `<div class="cmdline"><code>${esc(l.slice(2))}</code><button type="button" class="run" data-run="${esc(l.slice(2))}">Run ▸</button></div>`
            : `<pre>${esc(l)}</pre>`).join("") + "</div>");
        } else out.push(`<div class="code"><pre>${esc(body.join("\n"))}</pre></div>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = /^(#{2,4})\s+(.*)/.exec(line))) { out.push(`<h3>${inline(m[2])}</h3>`); i++; continue; }
      if (/^>\s?/.test(line)) {
        const body = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote><p>${inline(body.join(" "))}</p></blockquote>`);
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += " " + lines[i++].trim();
          items.push(`<li>${inline(item)}</li>`);
        }
        out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{2,4}\s|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
  };
  // A mission's own text (missions.md): plain paragraphs, with 4-space-indented lines as commands.
  const missionText = (t) => md(String(t || "").split("\n\n").map((p) =>
    p.split("\n").every((l) => /^ {4}/.test(l)) ? "```\n" + p.split("\n").map((l) => "$ " + l.trim()).join("\n") + "\n```" : p).join("\n\n"));

  let toastTimer;
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600); };
  const ago = (t) => {
    const s = Date.now() / 1000 - t;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
  };
  const paintDue = () => { const d = S.stats.review_due, el = $("#due"); el.hidden = !d; el.textContent = d; };

  // ---------- terminal ----------
  const isPhone = () => !wide.matches;
  const setTerm = (lab) => {
    if (!lab) return;
    $("#termlab").textContent = LAB_NAMES[lab] || lab;
    $("#termfull").href = `/term/?arg=${encodeURIComponent(lab)}`;
    if (termLab !== lab) { termLab = lab; frame.dataset.ready = "0"; frame.src = `/term/?arg=${encodeURIComponent(lab)}&embed=1`; }
  };
  const showTab = (which) => {
    document.body.classList.toggle("show-term", which === "term");
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === which)));
    if (which === "term") setTimeout(() => { try { frame.contentWindow.focus(); } catch {} }, 50);
    else view.focus({ preventScroll: true });
  };
  const runCmd = (cmd, enter = true) => {
    if (!termLab) return;
    if (isPhone()) showTab("term");
    else if (termHidden) { termHidden = false; localStorage.setItem("termHidden", "0"); document.body.classList.add("with-term"); }
    const go = () => frame.contentWindow.postMessage({ send: cmd, enter }, location.origin);
    if (frame.dataset.ready === "1") go(); else frame.addEventListener("load", go, { once: true });
  };
  frame.addEventListener("load", () => { frame.dataset.ready = "1"; });
  tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
  $("#termhide").addEventListener("click", () => { termHidden = true; localStorage.setItem("termHidden", "1"); document.body.classList.remove("with-term"); });
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-run]");
    if (r) { e.preventDefault(); runCmd(r.dataset.run, !r.dataset.noenter); return; }
    if (e.target.closest(".open-term")) { termHidden = false; localStorage.setItem("termHidden", "0"); document.body.classList.add("with-term"); }
  });
  // iPhone: the keyboard covers the page instead of shrinking it, so size the terminal to what's
  // really visible. Then the terminal's own Send box and key bar stay above the keyboard.
  if (window.visualViewport) {
    const fitVV = () => {
      const vv = visualViewport, topH = $(".top").getBoundingClientRect().height;
      const kb = window.innerHeight - vv.height > 120;
      document.body.classList.toggle("kb", kb && document.body.classList.contains("show-term"));
      if (kb) document.documentElement.style.setProperty("--term-h", Math.max(160, vv.height - topH + vv.offsetTop) + "px");
      else document.documentElement.style.removeProperty("--term-h");
    };
    visualViewport.addEventListener("resize", fitVV);
    visualViewport.addEventListener("scroll", fitVV);
  }

  // ---------- pages ----------
  const setNav = (name) => document.querySelectorAll(".top nav a").forEach((a) => a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const lessonPage = (on) => {
    document.body.classList.toggle("lesson-page", on);
    document.body.classList.toggle("with-term", on && !termHidden);
    pane.hidden = !on; tabs.hidden = !on;
    if (!on) document.body.classList.remove("show-term");
  };

  const heatmap = (days) => {
    const cells = [], end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 7 * 17 - end.getDay());
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const v = days[k] || 0, l = v === 0 ? 0 : v < 30 ? 1 : v < 80 ? 2 : 3;
      cells.push(`<i data-l="${l}" class="${+d === +end ? "today" : ""}" title="${k}: ${v} XP"></i>`);
    }
    return `<div class="heat" aria-label="Activity, last 18 weeks">${cells.join("")}</div>
      <div class="legend">Less <i style="background:var(--panel-2)"></i><i style="background:#2b3a73"></i><i style="background:#4a5fb5"></i><i style="background:#8aa0ff"></i> More</div>`;
  };

  const describe = (e) => {
    const [key, sub] = e.ref.split(/[#?]/), x = find(key);
    const name = x ? x.l.title : key;
    if (e.kind === "task") { const t = x && x.l.tasks[+sub]; return `Task done: ${t ? t.title : name}`; }
    if (e.kind === "lesson") return `Finished lesson: ${name}`;
    if (e.kind === "module") { const m = COURSE.modules.find((m) => m.id === e.ref); return `Finished module: ${m ? m.title : e.ref}`; }
    if (e.kind === "quiz") return `Quiz: ${name}`;
    if (e.kind === "read") return `Read: ${name}`;
    if (e.kind === "review") return `Review question`;
    return null;
  };

  const home = () => {
    setNav("home"); lessonPage(false);
    const st = S.stats, nx = nextLesson();
    const recent = S.progress.events.slice().reverse().filter((e) => e.kind !== "try").slice(0, 8);
    const modsDone = S.progress.modules_done || {};
    view.innerHTML = `
      <p class="eyebrow">Your DevOps course</p>
      <h1 class="page-title">${st.lessons_done ? "Welcome back." : "Let's start."}</h1>
      <p class="sub">Read a short lesson, see it on your own cluster, answer a quiz, then do the tasks in a real terminal. Every task is checked for you.</p>
      ${nx ? `<a class="continue" href="#/l/${nx.key}" style="text-decoration:none;color:inherit">
        <span class="eyebrow">${isDone(nx.key) ? "Review" : lessonState(nx.key).read ? "Continue" : "Up next"} · Module ${nx.mi + 1}: ${esc(nx.m.title)}</span>
        <h2>${esc(nx.l.title)}</h2>
        <span class="muted">${nx.l.minutes || 15} min · ${nx.l.tasks.length} task${nx.l.tasks.length === 1 ? "" : "s"} · ${nx.l.quiz.length} questions</span>
        <span class="btn">${lessonState(nx.key).read ? "Pick up where you left off" : "Start lesson"} →</span></a>`
        : `<div class="continue"><h2>You finished the whole course. 🎉</h2><span class="muted">Keep your streak going in Review, or head to the capstone projects again.</span></div>`}
      <div class="stats">
        <div class="card stat"><div class="n">Level ${st.level}</div><div class="l">${st.level_xp} / ${st.level_need} XP to the next · ${st.xp} total</div><div class="bar"><i style="width:${Math.round((100 * st.level_xp) / st.level_need)}%"></i></div></div>
        <div class="card stat"><div class="n">${st.streak} day${st.streak === 1 ? "" : "s"}</div><div class="l">streak · best ${st.best_streak}</div></div>
        <div class="card stat"><div class="n">${st.lessons_done}<span class="muted" style="font-size:16px"> / ${st.lessons_total}</span></div><div class="l">lessons done</div><div class="bar ok"><i style="width:${Math.round((100 * st.lessons_done) / st.lessons_total)}%"></i></div></div>
        <div class="card stat"><div class="n">${st.tasks_done}<span class="muted" style="font-size:16px"> / ${st.tasks_total}</span></div><div class="l">hands-on tasks passed</div><div class="bar ok"><i style="width:${Math.round((100 * st.tasks_done) / st.tasks_total)}%"></i></div></div>
      </div>
      ${st.review_due ? `<a class="card row" href="#/review" style="margin-top:10px;text-decoration:none;color:inherit"><span class="pill">${st.review_due}</span><span style="flex:1">question${st.review_due === 1 ? "" : "s"} to review: the ones you missed come back until they stick.</span><span>→</span></a>` : ""}
      <h2>Activity</h2>
      <div class="card">${heatmap(st.days)}</div>
      <h2>Modules</h2>
      <div class="mods">${COURSE.modules.map((m, i) => {
        const p = modPct(m), open = isOpen(`${m.id}/${m.lessons[0].id}`);
        return `<a class="card mod ${p.d === p.n ? "done" : ""} ${open ? "" : "locked"}" href="#/m/${m.id}">
          <span class="num">${p.d === p.n ? "✓" : open ? i + 1 : "🔒"}</span>
          <span><b>${esc(m.title)}</b><small>${p.d}/${p.n} lessons · ${esc(m.summary || "")}</small><div class="bar ok"><i style="width:${p.pct}%"></i></div></span>
          <span class="pct">${p.pct}%</span></a>`;
      }).join("")}</div>
      <h2>Badges</h2>
      <div class="badges">${COURSE.modules.map((m) => `<span class="badge ${modsDone[m.id] ? "on" : ""}">${modsDone[m.id] ? "★" : "☆"} ${esc(m.badge || m.title)}</span>`).join("")}
        <span class="badge ${st.best_streak >= 7 ? "on" : ""}">${st.best_streak >= 7 ? "★" : "☆"} 7-day streak</span>
        <span class="badge ${st.best_streak >= 30 ? "on" : ""}">${st.best_streak >= 30 ? "★" : "☆"} 30-day streak</span></div>
      <h2>Recent</h2>
      ${recent.length ? `<ul class="feed">${recent.map((e) => { const d = describe(e); return d ? `<li><span>${esc(d)}</span>${e.xp ? `<span class="xp">+${e.xp}</span>` : ""}<span class="muted">${ago(e.t)}</span></li>` : ""; }).join("")}</ul>` : `<p class="muted">Nothing yet. Your first lesson is waiting above.</p>`}
      <h2>Settings</h2>
      <label class="switch"><input type="checkbox" id="unlockall" ${S.progress.unlock_all ? "checked" : ""}> Open every lesson (skip the "finish the one before" rule)</label>
      <p class="muted" style="font-size:14px">Your progress is saved on the Pi (in the labs' volume), so it's the same on your phone and PC. Missions you already passed with <code>learn</code> in a terminal count here too.</p>`;
    $("#unlockall").addEventListener("change", async (e) => { await api("settings", { unlock_all: e.target.checked }); await refresh(); toast(e.target.checked ? "Every lesson is open" : "Lessons open one at a time"); });
  };

  const map = () => {
    setNav("map"); lessonPage(false);
    view.innerHTML = `<p class="eyebrow">The path</p><h1 class="page-title">Course</h1>
      <p class="sub">${COURSE.modules.length} modules, in order. Each one builds on the last and ends on your real cluster.</p>
      <div class="mods">${COURSE.modules.map((m, i) => { const p = modPct(m), open = isOpen(`${m.id}/${m.lessons[0].id}`);
        return `<a class="card mod ${p.d === p.n ? "done" : ""} ${open ? "" : "locked"}" href="#/m/${m.id}"><span class="num">${p.d === p.n ? "✓" : i + 1}</span>
          <span><b>${esc(m.title)}</b><small>${esc(m.summary || "")}</small><div class="bar ok"><i style="width:${p.pct}%"></i></div></span><span class="pct">${p.d}/${p.n}</span></a>`; }).join("")}</div>`;
  };

  const modulePage = (id) => {
    setNav("map"); lessonPage(false);
    const mi = COURSE.modules.findIndex((m) => m.id === id), m = COURSE.modules[mi];
    if (!m) return notFound();
    const nx = nextLesson();
    view.innerHTML = `<div class="crumbs"><a href="#/map">Course</a><span>/</span><span>Module ${mi + 1}</span></div>
      <h1 class="page-title">${esc(m.title)}</h1><p class="sub">${esc(m.summary || "")}</p>
      ${m.intro ? `<div class="prose">${md(m.intro)}</div>` : ""}
      <div class="lessons">${m.lessons.map((l, li) => { const key = `${m.id}/${l.id}`, done = isDone(key), open = isOpen(key);
        return `<a class="card lesson-row ${done ? "done" : ""} ${nx && nx.key === key ? "next" : ""} ${open ? "" : "locked"}" href="#/l/${key}">
          <span class="st">${done ? "✓" : open ? "" : "🔒"}</span>
          <span><b>${li + 1}. ${esc(l.title)}</b><br><small>${l.minutes || 15} min · ${l.tasks.length} tasks · ${l.quiz.length} questions</small></span><span class="muted">→</span></a>`; }).join("")}</div>
      <p class="muted" style="margin-top:20px;font-size:14px">Terminal for this module: <b>${esc(LAB_NAMES[m.lab] || m.lab)}</b>. <a href="/term/?arg=${m.lab}" target="_blank" rel="noopener">Open it on its own ↗</a></p>`;
  };

  const lesson = async (key) => {
    const x = find(key);
    if (!x) return notFound();
    setNav("map");
    const { m, l, mi, li } = x;
    if (!isOpen(key)) {
      lessonPage(false);
      const prev = allLessons()[allLessons().findIndex((y) => y.key === key) - 1];
      view.innerHTML = `<div class="crumbs"><a href="#/map">Course</a><span>/</span><a href="#/m/${m.id}">${esc(m.title)}</a></div>
        <h1 class="page-title">${esc(l.title)}</h1>
        <div class="card locked-note"><p>🔒 This one opens when you finish <b>${esc(prev ? prev.l.title : "the lesson before it")}</b>.</p>
        ${prev ? `<a class="btn" href="#/l/${prev.key}">Go to that lesson</a>` : ""}
        <p class="muted" style="font-size:14px;margin-bottom:0">Or open every lesson in Settings on the Home page.</p></div>`;
      return;
    }
    lessonPage(true); showTab("lesson"); setTerm(m.lab);
    api("open", { lesson: key }).catch(() => {});
    const s = lessonState(key), all = allLessons(), idx = all.findIndex((y) => y.key === key), nextL = all[idx + 1];
    const read = !!s.read, quizPassed = !!(s.quiz && s.quiz.passed), tasksDone = l.tasks.filter((t) => s.tasks && s.tasks[t.id]).length;
    view.innerHTML = `
      <div class="crumbs"><a href="#/map">Course</a><span>/</span><a href="#/m/${m.id}">${mi + 1}. ${esc(m.title)}</a><span>/</span><span>Lesson ${li + 1} of ${m.lessons.length}</span></div>
      <h1 class="page-title">${esc(l.title)}</h1>
      <div class="row muted" style="font-size:14px">${l.minutes || 15} min · terminal: ${esc(LAB_NAMES[m.lab] || m.lab)}
        <button type="button" class="btn ghost small open-term">Show terminal</button></div>
      <div class="steps"><span class="${read ? "on" : ""}">${read ? "✓" : "1"} Learn</span>${l.quiz.length ? `<span class="${quizPassed ? "on" : ""}">${quizPassed ? "✓" : "2"} Quiz</span>` : ""}<span class="${tasksDone === l.tasks.length ? "on" : ""}">${tasksDone === l.tasks.length ? "✓" : "3"} Tasks ${tasksDone}/${l.tasks.length}</span></div>

      <article class="prose section" style="margin-top:18px">${md(l.teach)}</article>

      ${l.live.length ? `<section class="section"><h2>On your cluster, right now</h2>
        <p class="muted" style="margin-top:-6px">Pulled live from your Pis when you open the lesson (read-only).</p>
        ${l.live.map((v, n) => `<div class="card live" data-live="${n}"><header><b>${esc(v.title)}</b><button type="button" class="btn ghost small" data-refresh="${n}">Refresh</button></header>
          ${v.note ? `<p class="note">${inline(v.note)}</p>` : ""}<div class="cmd"></div><pre><span class="spin"></span> asking the cluster…</pre></div>`).join("")}</section>` : ""}

      ${l.sources && l.sources.length ? `<section class="section"><h2>Where this comes from</h2>
        <p class="muted" style="margin-top:-6px">The lesson is drawn from these. Open one when you want the full story.</p>
        <div class="sources">${l.sources.map((src) => `<a class="card" href="${esc(src.url)}" target="_blank" rel="noopener"><span>${esc(src.title)}<small>${esc(src.url.replace(/^https?:\/\//, ""))}</small></span><span>↗</span></a>`).join("")}</div></section>` : ""}

      <div class="section">${read ? "" : `<button type="button" class="btn" id="readbtn">I've read it, on to the ${l.quiz.length ? "quiz" : "tasks"} →</button>`}</div>

      ${l.quiz.length ? `<section class="section" id="quiz"><h2>Quiz</h2><p class="muted" style="margin-top:-6px">Get them all right to pass. Wrong answers come back later in Review.</p>
        <form id="quizform">${l.quiz.map((q, qi) => `<div class="card q" data-q="${qi}"><fieldset><legend>${qi + 1}. ${inline(q.q)}</legend>
          ${q.choices.map((c, ci) => `<label class="choice"><input type="radio" name="q${qi}" value="${ci}"><span>${inline(c)}</span></label>`).join("")}
          </fieldset><div class="why" hidden></div></div>`).join("")}
          <div class="row"><button class="btn" type="submit">Check answers</button><span class="result" id="quizres">${quizPassed ? `<span class="result ok">✓ Passed (${s.quiz.best}/${s.quiz.of})</span>` : ""}</span></div></form></section>` : ""}

      <section class="section" id="tasks"><h2>Hands-on tasks</h2>
        <p class="muted" style="margin-top:-6px">Do these in the terminal${isPhone() ? " (the Terminal tab below)" : " on the right"}, then press Check: it looks at what you really did.</p>
        ${l.tasks.map((t) => taskCard(key, t, s)).join("")}</section>
      <div id="finish"></div>
      <div class="row section" style="justify-content:space-between">
        ${idx > 0 ? `<a class="btn ghost" href="#/l/${all[idx - 1].key}">← ${esc(all[idx - 1].l.title)}</a>` : "<span></span>"}
        ${nextL ? `<a class="btn ghost" href="#/l/${nextL.key}">${esc(nextL.l.title)} →</a>` : ""}</div>`;
    window.scrollTo(0, 0);
    paintFinish(key);

    // live panels
    const loadLive = async (n) => {
      const card = view.querySelector(`[data-live="${n}"]`);
      card.querySelector("pre").innerHTML = '<span class="spin"></span> asking the cluster…';
      try {
        const r = await api(`live/${key}/${n}`);
        card.querySelector(".cmd").innerHTML = `$ ${esc(r.cmd)} <button type="button" class="run" data-run="${esc(r.cmd)}" style="margin-left:6px">Run it yourself ▸</button>`;
        card.querySelector("pre").textContent = r.out;
      } catch { card.querySelector("pre").textContent = "Couldn't reach the cluster just now. Try Refresh."; }
    };
    l.live.forEach((_, n) => loadLive(n));
    view.querySelectorAll("[data-refresh]").forEach((b) => b.addEventListener("click", () => loadLive(+b.dataset.refresh)));

    const rb = $("#readbtn");
    if (rb) rb.addEventListener("click", async () => {
      await api("read", { lesson: key }); await refresh();
      rb.remove(); view.querySelector(".steps span").className = "on"; view.querySelector(".steps span").textContent = "✓ Learn";
      ($("#quiz") || $("#tasks")).scrollIntoView({ behavior: "smooth", block: "start" });
      paintFinish(key);
    });

    const qf = $("#quizform");
    if (qf) qf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const answers = l.quiz.map((_, qi) => { const c = qf.querySelector(`input[name="q${qi}"]:checked`); return c ? +c.value : null; });
      if (answers.includes(null)) { toast("Answer every question first"); return; }
      if (!lessonState(key).read) await api("read", { lesson: key });
      const r = await api("quiz", { lesson: key, answers });
      r.results.forEach((res, qi) => {
        const box = qf.querySelector(`[data-q="${qi}"]`), why = box.querySelector(".why");
        box.querySelectorAll(".choice").forEach((c, ci) => { c.classList.toggle("right", ci === res.answer); c.classList.toggle("wrong", ci === answers[qi] && !res.right); });
        why.hidden = false; why.className = "why " + (res.right ? "right" : "wrong");
        why.innerHTML = (res.right ? "<b>Right.</b> " : "<b>Not quite.</b> ") + inline(res.why);
      });
      $("#quizres").innerHTML = r.passed ? `<span class="result ok">✓ ${r.score}/${r.of}: passed!</span>` : `<span class="result bad">${r.score}/${r.of}. Read the notes, then try again.</span>`;
      await refresh(); paintSteps(key); paintFinish(key);
      if (r.passed) toast("Quiz passed");
    });
    qf && qf.addEventListener("change", () => qf.querySelectorAll(".choice").forEach((c) => c.classList.remove("right", "wrong")));

    view.querySelectorAll("[data-check]").forEach((b) => b.addEventListener("click", () => check(key, b.dataset.check, b)));
    view.querySelectorAll("[data-hint]").forEach((b) => b.addEventListener("click", () => {
      const box = b.closest(".task").querySelector(".hints"), hidden = box.querySelectorAll(".hint[hidden]");
      if (hidden.length) hidden[0].hidden = false;
      if (hidden.length <= 1) b.remove(); else b.textContent = `Another hint (${hidden.length - 1} more)`;
    }));
  };

  const taskCard = (key, t, s) => {
    const done = !!(s.tasks && s.tasks[t.id]);
    const hints = (t.hints || []).map((h) => { const cmd = h.replace(/\s{2,}\(.*\)$/, "").replace(/^(then[^:]*:|check:)\s*/i, "");
      const looksLikeCmd = /^[a-z~.$(]/.test(cmd) && !/^(then|or|quote|compare|use|look|run it|press)\b/i.test(cmd) && !/<[a-z ]+>/.test(cmd);
      return `<div class="hint" hidden><code>${esc(h)}</code>${looksLikeCmd ? `<button type="button" class="run" data-run="${esc(cmd)}" data-noenter="1" title="Type it into the terminal without pressing Enter">Type ▸</button>` : ""}</div>`; }).join("");
    return `<div class="card task ${done ? "done" : ""}" data-task="${t.id}">
      <h3><span class="st">${done ? "✓" : ""}</span>${esc(t.title)}</h3>
      <div class="prose" style="font-size:15.5px">${missionText(t.text)}</div>
      <div class="row"><button type="button" class="btn ${done ? "ghost" : ""}" data-check="${t.id}">${done ? "Check again" : "Check my work"}</button>
        ${t.hints && t.hints.length ? `<button type="button" class="btn ghost small" data-hint>Hint (${t.hints.length})</button>` : ""}
        <span class="result" data-res>${done ? '<span class="result ok">✓ Done</span>' : ""}</span></div>
      <div class="hints">${hints}</div></div>`;
  };

  const check = async (key, tid, btn) => {
    const card = btn.closest(".task"), res = card.querySelector("[data-res]");
    btn.disabled = true; res.innerHTML = '<span class="spin"></span> checking…';
    try {
      const r = await api("check", { lesson: key, task: tid });
      if (r.ok) {
        res.innerHTML = '<span class="result ok">✓ Done' + (r.first ? " · +15 XP" : "") + "</span>";
        card.classList.add("done"); card.querySelector(".st").textContent = "✓"; btn.textContent = "Check again"; btn.classList.add("ghost");
        if (r.first) toast("Task passed: +15 XP");
      } else res.innerHTML = '<span class="result bad">Not yet. Look again, or take a hint.</span>';
      await refresh(); paintSteps(key); paintFinish(key);
    } catch { res.innerHTML = '<span class="result bad">The check couldn\'t run. Try again in a moment.</span>'; }
    btn.disabled = false;
  };

  const paintSteps = (key) => {
    const x = find(key), s = lessonState(key), spans = view.querySelectorAll(".steps span");
    if (!spans.length) return;
    let i = 1;
    if (x.l.quiz.length) { const ok = !!(s.quiz && s.quiz.passed); spans[i].className = ok ? "on" : ""; spans[i].textContent = (ok ? "✓" : "2") + " Quiz"; i++; }
    const d = x.l.tasks.filter((t) => s.tasks && s.tasks[t.id]).length, all = d === x.l.tasks.length;
    spans[i].className = all ? "on" : ""; spans[i].textContent = `${all ? "✓" : "3"} Tasks ${d}/${x.l.tasks.length}`;
  };
  const paintFinish = (key) => {
    const box = $("#finish"); if (!box) return;
    if (!isDone(key)) { box.innerHTML = ""; return; }
    const all = allLessons(), idx = all.findIndex((y) => y.key === key), nx = all[idx + 1];
    const modDone = !!(S.progress.modules_done || {})[all[idx].m.id];
    box.innerHTML = `<div class="done-banner"><h2>${modDone && (!nx || nx.m.id !== all[idx].m.id) ? `Module done: ${esc(all[idx].m.badge || all[idx].m.title)} ★` : "Lesson complete ✓"}</h2>
      <p class="muted" style="margin:0 0 12px">${nx ? `Next up: <b>${esc(nx.l.title)}</b>${nx.m.id !== all[idx].m.id ? ` (starts Module ${nx.mi + 1}: ${esc(nx.m.title)})` : ""}` : "That was the last lesson in the course."}</p>
      ${nx ? `<a class="btn ok-btn" href="#/l/${nx.key}">Next lesson →</a>` : `<a class="btn" href="#/">Back home</a>`}</div>`;
  };

  // ---------- review ----------
  const review = async (practice) => {
    setNav("review"); lessonPage(false);
    view.innerHTML = '<p class="muted"><span class="spin"></span> loading…</p>';
    const { questions } = await api(practice ? "review/practice" : "review");
    let i = 0, right = 0;
    const tabsHtml = `<div class="row" style="margin-bottom:16px"><a class="btn ${practice ? "ghost" : ""} small" href="#/review">Missed questions${S.stats.review_due ? ` (${S.stats.review_due})` : ""}</a><a class="btn ${practice ? "" : "ghost"} small" href="#/practice">Practice quiz</a></div>`;
    const head = `<p class="eyebrow">Review</p><h1 class="page-title">${practice ? "Practice quiz" : "Missed questions"}</h1>
      <p class="sub">${practice ? "Ten random questions from lessons you've finished." : "Questions you got wrong come back after 0, 1, 3 and 7 days until you get them right each time."}</p>${tabsHtml}`;
    if (!questions.length) {
      view.innerHTML = head + `<div class="card"><p style="margin:0">${practice ? "Finish a lesson first, then its questions show up here." : "Nothing to review right now. Nice."}</p></div>`;
      return;
    }
    const show = () => {
      if (i >= questions.length) {
        view.innerHTML = head + `<div class="card"><h2 style="margin-top:0">${right}/${questions.length} right</h2><p class="muted">${right === questions.length ? "Every one. They'll stay away for a while." : "The ones you missed will be back."}</p>
          <div class="row"><a class="btn" href="#/">Home</a><button class="btn ghost" id="again">Another round</button></div></div>`;
        $("#again").addEventListener("click", () => review(practice)); refresh(); return;
      }
      const q = questions[i];
      view.innerHTML = head + `<p class="muted" style="font-size:14px">${i + 1} of ${questions.length} · from <a href="#/l/${q.lesson}">${esc(q.lessonTitle)}</a> (${esc(q.module)})</p>
        <form class="card q" id="rq"><fieldset><legend>${inline(q.q)}</legend>${q.choices.map((c, ci) => `<label class="choice"><input type="radio" name="a" value="${ci}"><span>${inline(c)}</span></label>`).join("")}</fieldset>
        <div class="why" hidden></div><div class="row" style="margin-top:12px"><button class="btn" type="submit">Check</button></div></form>`;
      const f = $("#rq");
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = f.querySelector("button");
        if (btn.dataset.next) { i++; show(); return; }
        const c = f.querySelector("input:checked"); if (!c) { toast("Pick an answer"); return; }
        const r = await api("review-answer", { ref: q.ref, answer: +c.value });
        if (r.right) right++;
        f.querySelectorAll(".choice").forEach((el, ci) => { el.classList.toggle("right", ci === r.answer); el.classList.toggle("wrong", ci === +c.value && !r.right); });
        const why = f.querySelector(".why"); why.hidden = false; why.className = "why " + (r.right ? "right" : "wrong");
        why.innerHTML = (r.right ? "<b>Right.</b> " : "<b>Not quite.</b> ") + inline(r.why);
        btn.textContent = i + 1 < questions.length ? "Next →" : "Finish"; btn.dataset.next = "1";
      });
    };
    show();
  };

  const notFound = () => { lessonPage(false); view.innerHTML = `<h1 class="page-title">Not found</h1><p><a href="#/">Home</a></p>`; };

  const route = async () => {
    const h = location.hash.replace(/^#\/?/, "");
    try {
      if (!h) home();
      else if (h === "map") map();
      else if (h === "review") await review(false);
      else if (h === "practice") await review(true);
      else if (h.startsWith("m/")) modulePage(h.slice(2));
      else if (h.startsWith("l/")) await lesson(decodeURIComponent(h.slice(2)));
      else notFound();
    } catch (e) { console.error(e); view.innerHTML = `<div class="card"><p>Something went wrong loading this page. <a href="">Reload</a></p></div>`; }
    if (!h.startsWith("l/")) window.scrollTo(0, 0);
  };

  window.addEventListener("hashchange", async () => { await refresh().catch(() => {}); route(); });
  wide.addEventListener("change", () => { if (!isPhone()) showTab("lesson"); });

  (async () => {
    try {
      [COURSE] = await Promise.all([api("course"), refresh()]);
      if (COURSE.problems && COURSE.problems.length) console.warn("course problems:", COURSE.problems);
      route();
    } catch (e) {
      view.innerHTML = `<div class="card"><p>Couldn't load the course. Is the server up? <a href="">Try again</a></p></div>`;
    }
  })();
})();
