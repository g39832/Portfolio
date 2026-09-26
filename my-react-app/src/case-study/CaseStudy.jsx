import { useEffect, useState } from 'react'
import '../App.css'
import './case-study.css'
import JellyfishBackground from '../JellyfishBackground'
import Reveal from '../Reveal'
import { MoonIcon, SunIcon } from '../icons'

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const facts = [
  { value: '1,400+', label: 'items tracked' },
  { value: '6', label: 'workflow stages' },
  { value: '190+', label: 'automated tests' },
  { value: 'Nightly', label: 'verified backups' },
]

const stack = ['Python 3.11', 'Django 5.2', 'SQLite (WAL)', 'Waitress', 'Vanilla JS', 'Pillow', 'openpyxl', 'Square API', 'pytest']

const problems = [
  {
    title: 'Two people, one item, no lost typing',
    body: 'Intake sheets autosave as you type. Each open page has its own ID and remembers which draft version it last saw. If someone else saved a newer version in between, the server answers with a conflict instead of silently overwriting their work. The old app’s docs promised this, but it had never been built.',
    tag: 'Versioned drafts',
  },
  {
    title: 'Square can be slow; the shop can’t wait',
    body: 'Every save, price change or photo change adds a job to a queue instead of calling Square directly, so pages never hang on a slow API. A background worker sends each job within seconds and retries failures with growing delays, from 30 seconds up to 8 hours. After 10 tries it stops and shows the job on a System page with a retry button. A nightly check compares both sides and fixes the mismatches that are safe to fix.',
    tag: 'Job queue + retries',
  },
  {
    title: 'Moving 1,400 records safely',
    body: 'An importer copies every item and photo from the PHP database and then checks each one. Old QR codes already stuck on shelves and old bookmarks (card.php, intake.php…) still work because they redirect to the new pages. Label printing had to stay identical, so a test compares every Zebra label byte for byte against output captured from the PHP code.',
    tag: 'Verified migration',
  },
  {
    title: 'Knowing who changed what',
    body: 'Every change is recorded in the item’s History with who made it, the old value and the new value. Quick successive edits by one person are merged into a single entry. Sales and refunds coming from Square show up there too, so the team can answer “what happened to this laptop?” in seconds.',
    tag: 'Audit history',
  },
]

const ArchitectureDiagram = () => (
  <svg className="cs-diagram" viewBox="0 0 760 330" role="img" aria-labelledby="diagram-title">
    <title id="diagram-title">
      Shop computers and phones use the Django app. It saves to SQLite and photo files, and adds Square jobs to a queue that a background worker sends to Square. Square sends sales back through webhooks. Nightly backups are verified and copied off the server.
    </title>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10z" className="cs-diagram-arrowhead" />
      </marker>
    </defs>

    <g className="cs-diagram-node">
      <rect x="10" y="125" width="150" height="80" rx="14" />
      <text x="85" y="160">Shop PCs</text>
      <text x="85" y="180" className="cs-diagram-sub">&amp; phones</text>
    </g>
    <g className="cs-diagram-node cs-diagram-main">
      <rect x="230" y="105" width="190" height="120" rx="16" />
      <text x="325" y="145">Django app</text>
      <text x="325" y="167" className="cs-diagram-sub">views → services</text>
      <text x="325" y="187" className="cs-diagram-sub">(Waitress)</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="230" y="258" width="190" height="62" rx="14" />
      <text x="325" y="285">SQLite + photos</text>
      <text x="325" y="304" className="cs-diagram-sub">one live item per SKU</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="490" y="20" width="160" height="62" rx="14" />
      <text x="570" y="47">Job queue</text>
      <text x="570" y="66" className="cs-diagram-sub">worker + retries</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="600" y="134" width="150" height="62" rx="14" />
      <text x="675" y="161">Square</text>
      <text x="675" y="180" className="cs-diagram-sub">POS + catalog</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="490" y="258" width="200" height="62" rx="14" />
      <text x="590" y="285">Nightly backups</text>
      <text x="590" y="304" className="cs-diagram-sub">verified + mirrored</text>
    </g>

    <g className="cs-diagram-edge" markerEnd="url(#arrow)">
      <path d="M160 165h66" />
      <path d="M325 225v29" />
      <path d="M420 130 C455 105 460 60 486 55" />
      <path d="M650 60 C680 70 690 100 684 130" />
      <path d="M600 178 C520 190 470 190 424 180" />
      <path d="M420 290h66" />
    </g>
    <text x="512" y="206" className="cs-diagram-label">sales &amp; refunds (webhooks)</text>
    <text x="352" y="92" className="cs-diagram-label">after save</text>
  </svg>
)

function CaseStudy() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <JellyfishBackground theme={theme} />

      <div className="site-content">
        <header className="header scrolled">
          <nav className="nav" aria-label="Primary">
            <a className="logo cs-logo" href="/">
              <span className="logo-jellyfish" aria-hidden="true">
                <span className="logo-jellyfish-bell" />
                <span className="logo-jellyfish-tentacles" />
              </span>
              <span>Grayson Cox</span>
            </a>
            <a className="cs-back" href="/#projects">← All projects</a>
            <div className="controls">
              <button
                type="button"
                className="control-btn"
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </nav>
        </header>

        <main id="main-content" className="cs-main">
          <div className="cs-container">
            <Reveal>
              <p className="eyebrow">Case study · Python / Django</p>
              <h1 className="cs-title">
                Dispodex: rebuilding a shop&apos;s <span className="gradient-name">daily inventory tool</span>
              </h1>
              <p className="cs-lede">
                A computer refurbishing shop ran on a PHP + SQLite tool I had built earlier, called the Pink Sheet.
                It had outgrown itself, so I rewrote it from scratch in Django as Dispodex and moved every record
                and photo across, with each one checked on the way in.
              </p>
              <div className="cs-actions">
                <a className="btn btn-primary" href="https://github.com/g39832/Dispodex" target="_blank" rel="noopener noreferrer">
                  View the code on GitHub
                </a>
                <a className="btn btn-outline" href="#demo">Watch it in action</a>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <dl className="cs-facts">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal>
              <figure className="cs-video" id="demo">
                <video
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/dispodex-demo-poster.jpg"
                  aria-label="Dragging a card from Intake to eBay Draft on the status board, then searching Lookup for Dell Latitude"
                >
                  <source src="/dispodex-demo.webm" type="video/webm" />
                  <source src="/dispodex-demo.mp4" type="video/mp4" />
                </video>
                <figcaption>
                  Moving a card to the next stage, then searching every field from Lookup. Recorded on a demo copy with
                  made-up items.
                </figcaption>
              </figure>
            </Reveal>

            <section className="cs-section" aria-labelledby="before">
              <Reveal>
                <h2 id="before">Where it started</h2>
                <div className="cs-compare">
                  <div className="cs-card">
                    <h3>The PHP Pink Sheet</h3>
                    <ul>
                      <li>Scheduled scripts that had to be kept in sync by hand</li>
                      <li>Two people editing the same item could overwrite each other</li>
                      <li>Square updates that silently skipped repeats</li>
                      <li>No record of who changed what</li>
                      <li>Desktop-only screens</li>
                    </ul>
                  </div>
                  <div className="cs-card cs-card-after">
                    <h3>Dispodex</h3>
                    <ul>
                      <li>One process runs the website and the background worker</li>
                      <li>Autosave that detects conflicts instead of losing work</li>
                      <li>Every Square change goes through a retrying queue</li>
                      <li>Full history on every item, with names</li>
                      <li>Works from 320 px phones to wide monitors</li>
                    </ul>
                  </div>
                </div>
              </Reveal>
            </section>

            <section className="cs-section" aria-labelledby="how">
              <Reveal>
                <h2 id="how">How it fits together</h2>
                <p>
                  Views stay thin and every business rule lives in one service layer, so a rule changed once applies
                  on every page. Nothing that talks to Square ever runs inside a web request.
                </p>
                <ArchitectureDiagram />
              </Reveal>
            </section>

            <section className="cs-section" aria-labelledby="hard">
              <Reveal>
                <h2 id="hard">The hard parts</h2>
              </Reveal>
              <div className="cs-problems">
                {problems.map((problem, index) => (
                  <Reveal key={problem.title} delay={index * 80}>
                    <article className="cs-card">
                      <span className="cs-tag">{problem.tag}</span>
                      <h3>{problem.title}</h3>
                      <p>{problem.body}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </section>

            <section className="cs-section" aria-labelledby="result">
              <Reveal>
                <h2 id="result">The result</h2>
                <p>
                  The shop team uses Dispodex every day to take in, test, list and sell more than 1,400 items. Staff move
                  cards on a drag-and-drop board (or with a Move button on phones), print Zebra labels from the browser,
                  export filtered lists to Excel with photos, and look up any item from a QR code. Backups run and are
                  verified every night, and the database is backed up automatically before any update.
                </p>
                <p>
                  More than 190 automated tests cover saving, conflicts, photos, search, exports, labels, every Square
                  path, backups and the migration, and they run before every change ships.
                </p>
                <ul className="project-tags cs-stack" aria-label="Tech stack">
                  {stack.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Reveal>
            </section>

            <Reveal>
              <div className="cs-footer-cta">
                <a className="btn btn-primary" href="/#projects">← Back to all projects</a>
                <a className="btn btn-outline" href="https://github.com/g39832/Dispodex" target="_blank" rel="noopener noreferrer">
                  Read the source
                </a>
              </div>
            </Reveal>
          </div>
        </main>

        <footer className="footer">
          <div className="container">
            <p>&copy; {new Date().getFullYear()} Grayson Cox</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default CaseStudy
