import './App.css'
import JellyfishBackground from './JellyfishBackground'

const navLinks = [
  { href: '#hero', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#projects', label: 'Projects' },
  { href: '#skills', label: 'Skills' },
  { href: '#contact', label: 'Contact' },
]

function App() {
  const year = new Date().getFullYear()

  return (
    <div className="app">
      <JellyfishBackground />

      <div className="site-content">
        <header className="header">
          <nav className="nav" aria-label="Primary">
            <h1 className="logo">
              <span className="logo-jellyfish" aria-hidden="true">
                <span className="logo-jellyfish-bell" />
                <span className="logo-jellyfish-tentacles" />
              </span>
              <span>Grayson Cox</span>
            </h1>

            <ul className="nav-links">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main>
          <section id="hero" className="hero">
            <div className="hero-content">
              <p className="eyebrow">App Development · Backend · DevOps</p>
              <h2>Hi, I&apos;m Grayson Cox.</h2>
              <p className="hero-copy">
                Tech repair professional, CS &amp; CE student, and self-driven developer with a passion
                for building things — from fixing hardware to shipping software.
              </p>
            </div>
          </section>

          <section id="about" className="about">
            <div className="container">
              <h2>About Me</h2>
              <p className="section-copy">
                I work as a technician at a technology repair company, diagnosing and restoring computers
                and laptops back to life. Outside of work, I spend my time exploring the full breadth of
                computer science — with a particular focus on app development, backend engineering, and
                DevOps. This fall I&apos;ll be starting my journey as a Computer Science and Computer
                Engineering student, and I&apos;m excited to keep building along the way.
              </p>
            </div>
          </section>

          <section id="projects" className="projects">
            <div className="container">
              <h2>Projects</h2>
              <div className="project-grid">
                <article className="project-card">
                  <h3>CRM Tool</h3>
                  <p>
                    A customer relationship management tool built for and sold to local businesses in my
                    community. Handles client tracking, business workflows, and data management with a
                    full-stack architecture.
                  </p>
                  <div className="project-tags">
                    <span>Supabase</span>
                    <span>Render</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Full_Devries"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub →
                  </a>
                </article>
                <article className="project-card">
                  <h3>Raspberry Pi Student Computer</h3>
                  <p>
                    Built a fully functional microcomputer using a Raspberry Pi, paired with a custom
                    student-focused OS. Designed to give students an affordable, capable machine for
                    learning and everyday use.
                  </p>
                  <div className="project-tags">
                    <span>Raspberry Pi</span>
                    <span>Linux</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Pi-App"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub →
                  </a>
                </article>
                <article className="project-card">
                  <h3>Joseph — AI Assistant</h3>
                  <p>
                    A personal AI assistant built to help with daily tasks. Joseph handles things like
                    reminders, queries, and general productivity — a hands-on dive into applied AI
                    development.
                  </p>
                  <div className="project-tags">
                    <span>AI</span>
                    <span>Python</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Joseph"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub →
                  </a>
                </article>
              </div>
            </div>
          </section>

          <section id="skills" className="skills">
            <div className="container">
              <h2>Skills</h2>
              <ul className="skills-list">
                <li>HTML / CSS <span className="cert-badge">Certified</span></li>
                <li>Python <span className="cert-badge">Certified</span></li>
                <li>C</li>
                <li>JavaScript</li>
                <li>Node.js</li>
                <li>React</li>
                <li>Databases</li>
                <li>Supabase</li>
                <li>DevOps</li>
                <li>Hardware Repair</li>
                <li>Customer Service</li>
              </ul>
            </div>
          </section>

          <section id="contact" className="contact">
            <div className="container">
              <h2>Contact</h2>
              <p className="section-copy">Want to connect or collaborate? Find me on the platforms below.</p>
              <div className="contact-links">
                <a
                  href="https://github.com/g39832"
                  target="_blank"
                  rel="noreferrer"
                  className="contact-link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://www.linkedin.com/in/grayson-cox-4828b3345"
                  target="_blank"
                  rel="noreferrer"
                  className="contact-link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="container">
            <p>&copy; {year} Grayson Cox. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
