import { useEffect, useRef, useState } from 'react'
import './App.css'
import JellyfishBackground from './JellyfishBackground'
import Reveal from './Reveal'
import { projects } from './projects'

const navLinks = [
  { href: '#hero', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#achievements', label: 'Achievements' },
  { href: '#projects', label: 'Projects' },
  { href: '#skills', label: 'Skills' },
  { href: '#working-on', label: 'Working On' },
  { href: '#contact', label: 'Contact' },
]

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const workingOn = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
      </svg>
    ),
    label: 'MERN Stack Development',
    note: 'Building a full-stack inventory API with React, Node, and MongoDB',
    progress: 60,
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      </svg>
    ),
    label: 'Arduino & Robotics Projects',
    note: 'Designing an obstacle-avoiding rover',
    progress: 40,
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
      </svg>
    ),
    label: 'Embedded Systems',
    note: 'Learning C and microcontroller fundamentals',
    progress: 30,
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
      </svg>
    ),
    label: 'Linux Projects',
    note: 'Hardening and scaling my Raspberry Pi server',
    progress: 70,
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6v-4zm6-6h4v3h-4V7zM6 7h5v5H6V7zm6 4h4v6h-4v-6z"/>
      </svg>
    ),
    label: 'Personal Engineering Projects',
    note: 'Prototyping the next build',
    progress: 35,
  },
]

const pillars = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
      </svg>
    ),
    title: 'Fix',
    copy: '200+ devices repaired with 1.5 years of professional IT experience.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
      </svg>
    ),
    title: 'Build',
    copy: 'Full-stack apps shipped to real businesses — from schema to interface.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-7v2h-2v2h2v2h-2v2h2v2h-2v2h2v2h-6c-1.1 0-2-.9-2-2v-2h-2v2c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-2h2v-2H3v-2h2v-2H3V9h2V7H3V5c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v2h2V5c0-1.1.9-2 2-2h6v2z"/>
      </svg>
    ),
    title: 'Learn',
    copy: 'A CS & CE student diving into embedded systems, robotics, and Linux.',
  },
]

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
)

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)

const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M9 5v14M15 5v14" />
  </svg>
)

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

function App() {
  const year = new Date().getFullYear()
  const [theme, setTheme] = useState(getInitialTheme)
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const progressRef = useRef(null)
  const modalCloseRef = useRef(null)
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12)
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progressRef.current && max > 0) {
        progressRef.current.style.transform = `scaleX(${Math.min(1, window.scrollY / max)})`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    )
    navLinks.forEach((link) => {
      const section = document.getElementById(link.href.slice(1))
      if (section) observer.observe(section)
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!selectedProject) return undefined

    document.body.style.overflow = 'hidden'
    modalCloseRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedProject(null)
        return
      }
      if (event.key === 'Tab') {
        const modal = document.querySelector('.modal')
        if (!modal) return
        const focusables = [...modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(
          (element) => element.getClientRects().length > 0
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !modal.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      const opener = lastFocusedRef.current
      if (opener && opener.isConnected && opener.getClientRects().length > 0) {
        opener.focus()
      }
    }
  }, [selectedProject])

  const featured = projects.find((project) => project.featured)
  const rest = projects.filter((project) => !project.featured)

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <JellyfishBackground theme={theme} paused={paused} />
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />

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
        <button
          type="button"
          className="control-btn"
          onClick={() => setPaused((current) => !current)}
          aria-pressed={paused}
          aria-label={paused ? 'Play jellyfish animation' : 'Pause jellyfish animation'}
          title={paused ? 'Play jellyfish animation' : 'Pause jellyfish animation'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      </div>

      <div className="site-content">
        <header className={`header${scrolled ? ' scrolled' : ''}`}>
          <nav className={`nav${menuOpen ? ' nav-open' : ''}`} aria-label="Primary">
            <span className="logo">
              <span className="logo-jellyfish" aria-hidden="true">
                <span className="logo-jellyfish-bell" />
                <span className="logo-jellyfish-tentacles" />
              </span>
              <span>Grayson Cox</span>
            </span>

            <button
              type="button"
              className={`nav-toggle${menuOpen ? ' is-open' : ''}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="primary-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>

            <ul className="nav-links" id="primary-menu">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={activeSection === link.href.slice(1) ? 'active' : ''}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main id="main-content">
          <section id="hero" className="hero">
            <div className="hero-content">
              <Reveal>
                <p className="eyebrow">App Development · Backend · DevOps</p>
              </Reveal>
              <Reveal delay={90}>
                <h1>
                  Hi, I&apos;m <span className="gradient-name">Grayson Cox.</span>
                </h1>
              </Reveal>
              <Reveal delay={180}>
                <p className="hero-copy">
                  Tech repair professional, CS &amp; CE student, and self-driven developer with a passion
                  for building things — from fixing hardware to shipping software.
                </p>
              </Reveal>
              <Reveal delay={250}>
                <div className="hero-stats">
                  <div className="hero-stat">
                    <strong>200+</strong>
                    <span>Devices Repaired</span>
                  </div>
                  <div className="hero-stat">
                    <strong>1.5 yrs</strong>
                    <span>IT Experience</span>
                  </div>
                  <div className="hero-stat">
                    <strong>2</strong>
                    <span>Apps Shipped</span>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={330}>
                <div className="hero-actions">
                  <a href="#projects" className="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/>
                    </svg>
                    See My Work
                  </a>
                  <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"/>
                    </svg>
                    View Resume
                  </a>
                </div>
              </Reveal>
            </div>
          </section>

          <section id="about" className="about">
            <div className="container">
              <Reveal>
                <h2>About Me</h2>
              </Reveal>
              <Reveal delay={80}>
                <p className="section-copy">
                  I&apos;m a Computer Science and Computer Engineering student with a passion for building systems from the hardware up.
                </p>
              </Reveal>
              <Reveal delay={160}>
                <p className="section-copy">
                  I have 1.5 years of professional IT experience repairing and troubleshooting computers, Linux systems, and hardware. I&apos;ve repaired more than 200 devices, built internal business software, hosted projects on Raspberry Pi systems, and enjoy working on embedded systems, robotics, full-stack development, and hardware projects.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <p className="section-copy">
                  My goal is to become a skilled engineer capable of building both software and hardware systems.
                </p>
              </Reveal>
              <div className="pillars-grid">
                {pillars.map((pillar, index) => (
                  <Reveal key={pillar.title} delay={index * 90}>
                    <div className="pillar-card">
                      <span className="pillar-icon">{pillar.icon}</span>
                      <h3>{pillar.title}</h3>
                      <p>{pillar.copy}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="achievements" className="achievements">
            <div className="container">
              <Reveal>
                <h2>Achievements</h2>
              </Reveal>
              <div className="achievements-grid">
                <Reveal delay={0}>
                  <div className="achievement-card">
                    <span className="achievement-number achievement-number-numeric">200+</span>
                    <span className="achievement-label">Devices Repaired &amp; Troubleshot</span>
                  </div>
                </Reveal>
                <Reveal delay={70}>
                  <div className="achievement-card">
                    <span className="achievement-number achievement-number-numeric">1.5 Years</span>
                    <span className="achievement-label">Professional IT Experience</span>
                  </div>
                </Reveal>
                <Reveal delay={140}>
                  <div className="achievement-card">
                    <span className="achievement-number achievement-number-numeric">2</span>
                    <span className="achievement-label">Major Software Projects Built</span>
                  </div>
                </Reveal>
                <Reveal delay={210}>
                  <div className="achievement-card">
                    <span className="achievement-number achievement-number-text">CS &amp; CE</span>
                    <span className="achievement-label">Engineering Student</span>
                  </div>
                </Reveal>
                <Reveal delay={280}>
                  <div className="achievement-card">
                    <span className="achievement-number achievement-number-text">STLP</span>
                    <span className="achievement-label">Engineer &amp; Ambassador</span>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          <section id="projects" className="projects">
            <div className="container">
              <Reveal>
                <h2>Projects</h2>
              </Reveal>

              <article className="featured-project">
                <Reveal variant="left">
                  <button
                    type="button"
                    className="featured-project-screenshot"
                    onClick={(event) => {
                      lastFocusedRef.current = event.currentTarget
                      setSelectedProject(featured)
                    }}
                    aria-label={`Open case study: ${featured.title}`}
                  >
                    <img
                      className="featured-project-screenshot-img"
                      src={featured.screenshot}
                      alt={featured.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                </Reveal>
                <Reveal variant="right" delay={120}>
                  <div className="featured-project-content">
                    <div className="featured-project-badge">Featured Project</div>
                    <h3>{featured.title}</h3>
                    <p>{featured.summary}</p>
                    <div className="project-tags">
                      {featured.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="featured-project-links">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={(event) => {
                          lastFocusedRef.current = event.currentTarget
                          setSelectedProject(featured)
                        }}
                      >
                        View Case Study
                      </button>
                      <a
                        className="btn btn-outline"
                        href={featured.github}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        GitHub
                      </a>
                    </div>
                  </div>
                </Reveal>
              </article>

              <div className="project-grid">
                {rest.map((project, index) => (
                  <Reveal key={project.id} delay={index * 90}>
                    <article className="project-card">
                      <button
                        type="button"
                        className="project-screenshot"
                        onClick={(event) => {
                          lastFocusedRef.current = event.currentTarget
                          setSelectedProject(project)
                        }}
                        aria-label={`Open case study: ${project.title}`}
                      >
                        <img
                          className="project-screenshot-img"
                          src={project.screenshot}
                          alt={project.alt}
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                      <h3>{project.title}</h3>
                      <p>{project.summary}</p>
                      <div className="project-tags">
                        {project.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="project-open"
                        onClick={(event) => {
                          lastFocusedRef.current = event.currentTarget
                          setSelectedProject(project)
                        }}
                      >
                        View Case Study <span aria-hidden="true">→</span>
                      </button>
                      <a
                        className="project-link"
                        href={project.github}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub →
                      </a>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="skills" className="skills">
            <div className="container">
              <Reveal>
                <h2>Skills</h2>
              </Reveal>
              <Reveal delay={80}>
                <p className="section-copy">Technologies and tools I work with regularly.</p>
              </Reveal>
              <div className="skills-categories">
                <Reveal delay={0}>
                  <div className="skill-category">
                    <h3>Software Development</h3>
                    <ul className="skills-list">
                      <li>Python <span className="cert-badge">Certified</span></li>
                      <li>PHP</li>
                      <li>HTML / CSS <span className="cert-badge">Certified</span></li>
                      <li>JavaScript</li>
                      <li>Node.js</li>
                      <li>React</li>
                      <li>Databases</li>
                      <li>Git / GitHub</li>
                    </ul>
                  </div>
                </Reveal>
                <Reveal delay={100}>
                  <div className="skill-category">
                    <h3>Systems &amp; IT</h3>
                    <ul className="skills-list">
                      <li>Linux</li>
                      <li>Windows</li>
                      <li>Hardware Repair</li>
                      <li>Diagnostics</li>
                      <li>Technical Support</li>
                      <li>DevOps</li>
                    </ul>
                  </div>
                </Reveal>
                <Reveal delay={200}>
                  <div className="skill-category">
                    <h3>Hardware &amp; Engineering</h3>
                    <ul className="skills-list">
                      <li>Raspberry Pi</li>
                      <li>Embedded Systems</li>
                      <li>Computer Hardware</li>
                      <li>C</li>
                    </ul>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          <section id="working-on" className="working-on">
            <div className="container">
              <Reveal>
                <h2>Currently Working On</h2>
              </Reveal>
              <div className="working-on-grid">
                {workingOn.map((item, index) => (
                  <Reveal key={item.label} delay={index * 60}>
                    <div className="working-on-card">
                      <div className="working-on-card-head">
                        {item.icon}
                        <strong>{item.label}</strong>
                        <span className="pct">{item.progress}%</span>
                      </div>
                      <p className="working-on-note">{item.note}</p>
                      <div className="working-on-progress" aria-hidden="true">
                        <span
                          className="working-on-progress-fill"
                          style={{ '--pct': `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section id="contact" className="contact">
            <div className="container">
              <Reveal>
                <h2>Contact</h2>
              </Reveal>
              <Reveal delay={80}>
                <p className="section-copy">Want to connect or collaborate? Find me on the platforms below.</p>
              </Reveal>
              <div className="contact-links">
                <Reveal delay={0}>
                  <a
                    href="https://github.com/g39832"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contact-link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                </Reveal>
                <Reveal delay={60}>
                  <a
                    href="https://www.linkedin.com/in/grayson-cox-4828b3345"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contact-link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    LinkedIn
                  </a>
                </Reveal>
                <Reveal delay={120}>
                  <a
                    href="https://www.instagram.com/grayson16692/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contact-link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                    Instagram
                  </a>
                </Reveal>
                <Reveal delay={180}>
                  <a
                    href="mailto:Grayson123007@gmail.com"
                    className="contact-link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    Email
                  </a>
                </Reveal>
                <Reveal delay={240}>
                  <a
                    href="/resume.pdf"
                    download
                    className="contact-link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"/>
                    </svg>
                    Resume
                  </a>
                </Reveal>
              </div>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="container">
            <Reveal>
              <p>&copy; {year} Grayson Cox</p>
              <p className="footer-subtitle">Computer Engineering &amp; Computer Science Student</p>
            </Reveal>
          </div>
        </footer>
      </div>

      {selectedProject && (
        <div className="modal-overlay" onClick={() => setSelectedProject(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={modalCloseRef}
              type="button"
              className="modal-close"
              onClick={() => setSelectedProject(null)}
              aria-label="Close case study"
            >
              ×
            </button>
            <img className="modal-img" src={selectedProject.screenshot} alt={selectedProject.alt} />
            <div className="modal-body">
              <div className="project-tags">
                {selectedProject.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <h2 id="modal-title">{selectedProject.title}</h2>
              <p>{selectedProject.writeup}</p>
              <div className="modal-details">
                <div className="modal-detail">
                  <strong>Problem</strong>
                  <span>{selectedProject.problem}</span>
                </div>
                <div className="modal-detail">
                  <strong>Solution</strong>
                  <span>{selectedProject.solution}</span>
                </div>
                <div className="modal-detail">
                  <strong>Impact</strong>
                  <span>{selectedProject.impact}</span>
                </div>
              </div>
              <div className="modal-actions">
                <a
                  className="btn btn-primary"
                  href={selectedProject.github}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
