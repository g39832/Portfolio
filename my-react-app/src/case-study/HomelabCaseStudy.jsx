import { useEffect, useState } from 'react'
import CaseStudyLayout from './CaseStudyLayout'
import Reveal from '../Reveal'
// The very same file the homelab start page runs (cluster/start/tank.js), bundled as a hashed asset.
import tankSrc from '../../../cluster/start/tank.js?url'

const facts = [
  { value: '2', label: 'Raspberry Pis' },
  { value: '15', label: 'apps running' },
  { value: '0', label: 'open ports' },
  { value: 'Nightly', label: 'off-site backups' },
]

const stack = ['k3s (Kubernetes)', 'Docker', 'GitHub Actions', 'GHCR', 'Cloudflare Tunnel', 'Cloudflare Workers', 'CrowdSec', 'Nginx', 'Tailscale', 'Pi-hole', 'restic', 'Backblaze B2', 'Bash', 'Canvas']

const problems = [
  {
    title: 'A public website with no open ports',
    body: 'My router forwards nothing. Two cloudflared pods inside the cluster keep an outbound tunnel to Cloudflare, and Cloudflare sends visitors for graysoncodes.org and dnd.graysoncodes.org down it to an nginx pod. My home IP never appears in DNS, and moving an app to the other Pi doesn’t change anything outside the cluster.',
    tag: 'Cloudflare Tunnel',
  },
  {
    title: 'Stopping scanners before they reach the Pi',
    body: 'nginx logs the real visitor IP that Cloudflare passes along. CrowdSec reads those logs, spots scanners and brute-force attempts, and a Cloudflare Worker challenges banned IPs at the edge, so the Pi never even sees the request. Each ban is posted to Discord. One lesson: the Worker’s route is created “fail closed”, so after every restart I set it back to fail open, or a hiccup would take the site down.',
    tag: 'CrowdSec + Worker',
  },
  {
    title: 'Backups I have actually restored',
    body: 'A nightly CronJob snapshots each SQLite database with SQLite’s own backup API, checks the copy’s integrity, then uses restic to send it encrypted to Backblaze B2, keeping 7 daily, 4 weekly and 12 monthly copies. If anything fails, Discord hears about it. A restore script pulls the latest copy back and runs the integrity check, and I ran it before calling backups done.',
    tag: 'restic → B2',
  },
  {
    title: 'Ad blocking for every device, anywhere',
    body: 'Two Pi-holes, one on each Pi, so one can go down without breaking the internet at home. Tailscale hands Pi-hole to my phone and PC as their DNS even away from home. Setting it up uncovered an older Pi-hole I had once installed by hand, still quietly holding port 53 on the Pi 5. The Pis themselves use public DNS, so a broken Pi-hole can never lock the cluster out of the internet.',
    tag: 'Pi-hole + Tailscale',
  },
  {
    title: 'Rehearse first, then touch the real cluster',
    body: 'Before a change goes near the Pis, I run it in a throwaway k3s cluster in Docker on my PC: CrowdSec bans, backup and restore, the router labs, the Pi-hole setup. Mistakes there cost nothing. Every app is a YAML file in Git and every image is built by GitHub Actions for ARM64, so the whole setup can be rebuilt from the repo.',
    tag: 'Infrastructure as code',
  },
]

const lessons = [
  ['A Helm install failed with “server misbehaving”', 'Cluster DNS (CoreDNS) briefly couldn’t look anything up, then recovered on its own. My best guess was a DNS change on the Pi underneath it, which is part of why the Pis now use plain public DNS instead of depending on the Pi-holes they host.'],
  ['A config change that did nothing', 'Files mounted from a ConfigMap with subPath never refresh. The pod needs a rollout restart, so the deploy scripts do one every time.'],
  ['“metadata.annotations: Too long”', 'kubectl apply keeps a full copy of everything it applies in an annotation, capped at 256 KB. The start page’s files grew past that, so its deploy now uses kubectl replace.'],
  ['The Worker that wouldn’t deploy', 'Cloudflare’s Worker bouncer needs Analytics Engine turned on for the account, and it took about 8 minutes to take effect after I enabled it.'],
]

const ArchitectureDiagram = () => (
  <svg className="cs-diagram" viewBox="0 0 760 392" role="img" aria-labelledby="hl-diagram-title">
    <title id="hl-diagram-title">
      Visitors reach Cloudflare, which sends them through a tunnel to nginx in the k3s cluster on two Raspberry Pis. nginx serves the site, blog and D&amp;D app, and its logs go to CrowdSec, which sends bans back to Cloudflare. My own devices reach Pi-hole, Jellyfin and the start page over Tailscale. GitHub Actions builds the images, and nightly backups go to Backblaze B2.
    </title>
    <defs>
      <marker id="hl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10z" className="cs-diagram-arrowhead" />
      </marker>
    </defs>

    <g className="cs-diagram-group">
      <rect x="240" y="8" width="512" height="294" rx="18" />
      <text x="252" y="296">k3s cluster · Pi 5 + Pi 4</text>
    </g>

    <g className="cs-diagram-node">
      <rect x="10" y="20" width="150" height="56" rx="14" />
      <text x="85" y="53">Visitors</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="10" y="112" width="150" height="76" rx="14" />
      <text x="85" y="143">Cloudflare</text>
      <text x="85" y="163" className="cs-diagram-sub">tunnel + bouncer</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="10" y="222" width="150" height="62" rx="14" />
      <text x="85" y="249">My devices</text>
      <text x="85" y="268" className="cs-diagram-sub">over Tailscale</text>
    </g>

    <g className="cs-diagram-node cs-diagram-main">
      <rect x="270" y="110" width="150" height="70" rx="16" />
      <text x="345" y="141">nginx</text>
      <text x="345" y="161" className="cs-diagram-sub">real visitor IPs</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="480" y="30" width="250" height="60" rx="14" />
      <text x="605" y="56">Site · blog · D&amp;D app</text>
      <text x="605" y="75" className="cs-diagram-sub">images from GHCR</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="480" y="120" width="250" height="70" rx="14" />
      <text x="605" y="150">Pi-hole ×2 · Jellyfin</text>
      <text x="605" y="170" className="cs-diagram-sub">start page · labs · tools</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="270" y="215" width="150" height="62" rx="14" />
      <text x="345" y="242">CrowdSec</text>
      <text x="345" y="261" className="cs-diagram-sub">reads the logs</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="480" y="215" width="250" height="62" rx="14" />
      <text x="605" y="242">Nightly backups</text>
      <text x="605" y="261" className="cs-diagram-sub">SQLite snapshot + restic</text>
    </g>

    <g className="cs-diagram-node">
      <rect x="10" y="322" width="300" height="58" rx="14" />
      <text x="160" y="348">GitHub Actions</text>
      <text x="160" y="367" className="cs-diagram-sub">builds ARM64 images on push</text>
    </g>
    <g className="cs-diagram-node">
      <rect x="450" y="322" width="300" height="58" rx="14" />
      <text x="600" y="348">Backblaze B2</text>
      <text x="600" y="367" className="cs-diagram-sub">off-site, encrypted</text>
    </g>

    <g className="cs-diagram-edge" markerEnd="url(#hl-arrow)">
      <path d="M85 76V108" />
      <path d="M160 150H266" />
      <path d="M420 132C452 110 450 60 476 60" />
      <path d="M345 180V211" />
      <path d="M270 248C210 248 168 232 128 192" />
      <path d="M160 248C210 248 222 198 262 198H440C462 198 462 168 476 160" />
      <path d="M605 277V318" />
      <path d="M275 322V306" />
    </g>
    <text x="178" y="140" className="cs-diagram-label">tunnel</text>
    <text x="178" y="282" className="cs-diagram-label">bans</text>
    <text x="362" y="192" className="cs-diagram-label">DNS + apps</text>
    <text x="304" y="210" className="cs-diagram-label">logs</text>
  </svg>
)

/** The real axolotl tank from the start page, with switches that fake what the cluster would report. */
function TankDemo() {
  const [ready, setReady] = useState(() => !!window.homelabTank)
  const [busy, setBusy] = useState(false)
  const [pi4Down, setPi4Down] = useState(false)
  const [outage, setOutage] = useState(false)

  useEffect(() => {
    if (window.homelabTank) return
    let script = document.querySelector('script[data-homelab-tank]')
    if (!script) {
      script = document.createElement('script')
      script.src = tankSrc
      script.dataset.homelabTank = ''
      document.body.append(script)
    }
    const done = () => setReady(true)
    script.addEventListener('load', done)
    return () => script.removeEventListener('load', done)
  }, [])

  useEffect(() => {
    const tank = window.homelabTank
    if (!ready || !tank) return
    tank.sync([
      { name: 'raspberrypi', ready: true, cpu: busy ? 88 : 12 },
      { name: 'pi2', ready: !pi4Down, cpu: pi4Down ? 0 : busy ? 76 : 9 },
    ])
    tank.alarm(outage ? 1 : 0)
  }, [ready, busy, pi4Down, outage])

  const toggles = [
    ['Busy CPUs', busy, setBusy],
    ['Pi 4 goes down', pi4Down, setPi4Down],
    ['An app is down', outage, setOutage],
  ]

  return (
    <figure className="cs-tank-figure" id="tank-demo">
      <div className="cs-tank-bar">
        <span className="cs-tank-hint">Tap the water to feed them. Tap one to make it dart.</span>
        <div className="cs-tank-toggles" role="group" aria-label="Pretend cluster events">
          {toggles.map(([label, on, set]) => (
            <button key={label} type="button" className={`cs-toggle${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set(!on)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tank cs-tank" id="tank" role="button" tabIndex={0} aria-label="Axolotl tank. Press to feed them." />
      <figcaption>
        <span id="tank-mood" /> <span id="tank-fed" className="cs-tank-fed" />
        <br />
        The same code that runs in my homelab dashboard. There, the switches are real: each axolotl is one Pi, and it
        reacts to that Pi’s CPU, its health, and whether every app is answering.
      </figcaption>
    </figure>
  )
}

function HomelabCaseStudy() {
  return (
    <CaseStudyLayout>
      <Reveal>
        <p className="eyebrow">Case study · Kubernetes / DevOps</p>
        <h1 className="cs-title">
          Homelab: a two-Pi <span className="gradient-name">Kubernetes cluster</span> that runs my corner of the internet
        </h1>
        <p className="cs-lede">
          This website, my blog, my D&amp;D app, a media server and ad-blocking DNS for every device I own all run as
          containers on a Raspberry Pi 5 and a Pi 4. I built the cluster to learn DevOps by doing it for real: CI-built
          images, infrastructure as code, zero open ports, intrusion blocking at the edge, and backups I have restored.
        </p>
        <div className="cs-actions">
          <a className="btn btn-primary" href="#tank-demo">Meet the axolotls</a>
          <a className="btn btn-outline" href="https://github.com/g39832/Portfolio/tree/main/cluster" target="_blank" rel="noreferrer">
            Browse the cluster code
          </a>
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
        <figure className="cs-video">
          <img
            src="/Homelab.jpg"
            alt="The homelab start page: a daily DevOps lesson, live up/down checks for every app, and CPU and memory for both Raspberry Pis"
            loading="lazy"
          />
          <figcaption>
            My start page: every app with a live up/down check, both Pis’ CPU and memory, and a DevOps lesson a day to
            try on the cluster.
          </figcaption>
        </figure>
      </Reveal>

      <section className="cs-section" aria-labelledby="before">
        <Reveal>
          <h2 id="before">Where it started</h2>
          <div className="cs-compare">
            <div className="cs-card">
              <h3>One Pi, set up by hand</h3>
              <ul>
                <li>A pile of services started by hand, each a little differently</li>
                <li>Updating meant SSH in and hope</li>
                <li>Nothing written down, so nothing could be rebuilt</li>
                <li>No idea when something broke, or who was poking at it</li>
                <li>Backups that had never been tested</li>
              </ul>
            </div>
            <div className="cs-card cs-card-after">
              <h3>A k3s cluster</h3>
              <ul>
                <li>Every app is a YAML file in Git, pinned to the right Pi</li>
                <li>Push to main and GitHub Actions builds the images</li>
                <li>Health checks on every app, alerts on my phone</li>
                <li>Attackers challenged at Cloudflare and posted to Discord</li>
                <li>Encrypted nightly backups off-site, with a tested restore</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="cs-section" aria-labelledby="how">
        <Reveal>
          <h2 id="how">How it fits together</h2>
          <p>
            The Pi 5 is the k3s server and the Pi 4 is an agent. Public traffic only ever comes in through the tunnel;
            my own devices reach everything else privately over Tailscale.
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

      <section className="cs-section" aria-labelledby="broke">
        <Reveal>
          <h2 id="broke">Things that broke, and what they taught me</h2>
          <dl className="cs-lessons">
            {lessons.map(([what, why]) => (
              <div key={what}>
                <dt>{what}</dt>
                <dd>{why}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section className="cs-section" aria-labelledby="pets">
        <Reveal>
          <h2 id="pets">The fun part: a status page with pets</h2>
          <p>
            Dashboards are easy to ignore, so mine has two axolotls. The pink one is the Pi 5 and the black one is the Pi
            4. When a Pi is busy, its axolotl gets more active. If a Pi stops reporting ready, its axolotl lies grey on
            the sand. If any app stops answering, the water turns red. I notice that from across the room.
          </p>
          <p>
            Each axolotl is a chain of spine points that follows its head, with feathery gills, legs that tuck in or
            paddle or walk, and a 3D head with a smile, all drawn on a single canvas. They have their own personalities,
            explore, nap in their cave in the corner (sometimes together), come to the glass to look at you, and react to food.
            It pauses when it’s off screen so it costs the Pi nothing.
          </p>
        </Reveal>
        <Reveal>
          <TankDemo />
        </Reveal>
      </section>

      <section className="cs-section" aria-labelledby="result">
        <Reveal>
          <h2 id="result">The result</h2>
          <p>
            Fifteen apps run across both Pis with live health checks and phone alerts, the router has no open ports,
            attackers are blocked at the edge before they reach my network, and the whole setup can be rebuilt from the
            repo. I also built router labs (FRR and OSPF in Containerlab) and browser terminals to practise networking
            and Linux on the same hardware.
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
          <a className="btn btn-outline" href="/#contact">
            Ask me about it
          </a>
        </div>
      </Reveal>
    </CaseStudyLayout>
  )
}

export default HomelabCaseStudy
