import './App.css'
import JellyfishBackground from './JellyfishBackground'

const navLinks = [
  { href: '#hero', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#achievements', label: 'Achievements' },
  { href: '#projects', label: 'Projects' },
  { href: '#skills', label: 'Skills' },
  { href: '#working-on', label: 'Working On' },
  { href: '#contact', label: 'Contact' },
]

function App() {
  const year = new Date().getFullYear()

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to content</a>
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

        <main id="main-content">
          <section id="hero" className="hero">
            <div className="hero-content">
              <p className="eyebrow">App Development · Backend · DevOps</p>
              <h2>Hi, I&apos;m Grayson Cox.</h2>
              <p className="hero-copy">
                Tech repair professional, CS &amp; CE student, and self-driven developer with a passion
                for building things — from fixing hardware to shipping software.
              </p>
              <div className="hero-actions">
                <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"/>
                  </svg>
                  View Resume
                </a>
                <a href="/resume.pdf" download className="btn btn-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                  Download Resume
                </a>
              </div>
            </div>
          </section>

          <section id="about" className="about">
            <div className="container">
              <h2>About Me</h2>
              <p className="section-copy">
                I&apos;m an incoming University of Louisville Speed School student pursuing Computer Science and Computer Engineering.
              </p>
              <p className="section-copy">
                I have 1.5 years of professional IT experience repairing and troubleshooting computers, Linux systems, and hardware. I&apos;ve repaired more than 200 devices, built internal business software, hosted projects on Raspberry Pi systems, and enjoy working on embedded systems, robotics, full-stack development, and hardware projects.
              </p>
              <p className="section-copy">
                My goal is to become a skilled engineer capable of building both software and hardware systems.
              </p>
            </div>
          </section>

          <section id="achievements" className="achievements">
            <div className="container">
              <h2>Achievements</h2>
              <div className="achievements-grid">
                <div className="achievement-card">
                  <span className="achievement-number achievement-number-numeric">200+</span>
                  <span className="achievement-label">Devices Repaired &amp; Troubleshot</span>
                </div>
                <div className="achievement-card">
                  <span className="achievement-number achievement-number-numeric">1.5 Years</span>
                  <span className="achievement-label">Professional IT Experience</span>
                </div>
                <div className="achievement-card">
                  <span className="achievement-number achievement-number-numeric">2</span>
                  <span className="achievement-label">Major Software Projects Built</span>
                </div>
                <div className="achievement-card">
                  <span className="achievement-number achievement-number-text">University of Louisville</span>
                  <span className="achievement-label">Speed School Student</span>
                </div>
                <div className="achievement-card">
                  <span className="achievement-number achievement-number-text">STLP</span>
                  <span className="achievement-label">Engineer &amp; Ambassador</span>
                </div>
              </div>
            </div>
          </section>

          <section id="projects" className="projects">
            <div className="container">
              <h2>Projects</h2>

              <article className="featured-project">
                <div className="featured-project-screenshot" aria-label="Pink Sheet Inventory System screenshot">
                  <div className="project-screenshot-placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                    </svg>
                    <span>Featured Project Screenshot</span>
                  </div>
                </div>
                <div className="featured-project-content">
                  <div className="featured-project-badge">Featured Project</div>
                  <h3>Pink Sheet Inventory System</h3>
                  <p>
                    Developed a PHP-based inventory management system used for internal business operations. The application streamlined inventory tracking and provided a centralized workflow for managing equipment and assets, replacing manual paper-based processes with a digital solution designed and implemented entirely by me.
                  </p>
                  <div className="project-tags">
                    <span>PHP</span>
                    <span>MySQL</span>
                    <span>Database Design</span>
                    <span>Business Software</span>
                  </div>
                  <div className="featured-project-details">
                    <div className="featured-project-detail">
                      <strong>Problem:</strong>
                      <span>Manual inventory tracking was inefficient and error-prone for business operations.</span>
                    </div>
                    <div className="featured-project-detail">
                      <strong>Solution:</strong>
                      <span>Built a full CRUD application with database-driven workflows, search, and reporting.</span>
                    </div>
                    <div className="featured-project-detail">
                      <strong>Impact:</strong>
                      <span>Streamlined equipment tracking and asset management for daily business use.</span>
                    </div>
                  </div>
                  <div className="featured-project-links">
                    <a
                      className="btn btn-primary"
                      href="https://github.com/g39832"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                      </svg>
                      View on GitHub
                    </a>
                  </div>
                </div>
              </article>

              <div className="project-grid">
                <article className="project-card">
                  <div className="project-screenshot" aria-label="CRM Tool screenshot placeholder">
                    <div className="project-screenshot-placeholder">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                      </svg>
                      <span>Add Screenshot</span>
                    </div>
                  </div>
                  <h3>CRM Tool</h3>
                  <p>
                    Built and shipped a full-stack CRM platform to local businesses for client tracking, job management, invoicing, and data analytics. Designed the database schema, RESTful API, and frontend interface — delivering a production-ready business tool used daily by real customers.
                  </p>
                  <div className="project-tags">
                    <span>Supabase</span>
                    <span>PostgreSQL</span>
                    <span>JavaScript</span>
                    <span>Node.js</span>
                    <span>REST API</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Full_Devries"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub →
                  </a>
                </article>
                <article className="project-card">
                  <div className="project-screenshot" aria-label="Raspberry Pi Portfolio Website screenshot placeholder">
                    <div className="project-screenshot-placeholder">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                      </svg>
                      <span>Add Screenshot</span>
                    </div>
                  </div>
                  <h3>Raspberry Pi Portfolio Website</h3>
                  <p>
                    Built and self-hosted a portfolio website on Raspberry Pi hardware, gaining hands-on experience with Linux administration, server deployment, networking configuration, DNS setup, and web hosting — bridging hardware and software skills.
                  </p>
                  <div className="project-tags">
                    <span>Raspberry Pi</span>
                    <span>Linux</span>
                    <span>Nginx</span>
                    <span>Networking</span>
                    <span>Self-Hosted</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Pi-App"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub →
                  </a>
                </article>
                <article className="project-card">
                  <div className="project-screenshot" aria-label="Joseph AI Assistant screenshot placeholder">
                    <div className="project-screenshot-placeholder">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                      </svg>
                      <span>Add Screenshot</span>
                    </div>
                  </div>
                  <h3>Joseph — AI Assistant</h3>
                  <p>
                    Designed and built a personal AI assistant that handles daily tasks including reminders, natural language queries, and productivity management. Applied Python-based NLP techniques and conversational AI patterns to create a practical, voice-command-ready tool.
                  </p>
                  <div className="project-tags">
                    <span>Python</span>
                    <span>NLP</span>
                    <span>AI</span>
                    <span>Speech Recognition</span>
                  </div>
                  <a
                    className="project-link"
                    href="https://github.com/g39832/Joseph"
                    target="_blank"
                    rel="noopener noreferrer"
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
              <p className="section-copy">Technologies and tools I work with regularly.</p>
              <div className="skills-categories">
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
                <div className="skill-category">
                  <h3>Hardware &amp; Engineering</h3>
                  <ul className="skills-list">
                    <li>Raspberry Pi</li>
                    <li>Embedded Systems</li>
                    <li>Computer Hardware</li>
                    <li>C</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section id="working-on" className="working-on">
            <div className="container">
              <h2>Currently Working On</h2>
              <div className="working-on-grid">
                <div className="working-on-card">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
                  </svg>
                  <span>MERN Stack Development</span>
                </div>
                <div className="working-on-card">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                  </svg>
                  <span>Arduino &amp; Robotics Projects</span>
                </div>
                <div className="working-on-card">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
                  </svg>
                  <span>Embedded Systems</span>
                </div>
                <div className="working-on-card">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
                  </svg>
                  <span>Linux Projects</span>
                </div>
                <div className="working-on-card">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14zM6 13h5v4H6v-4zm6-6h4v3h-4V7zM6 7h5v5H6V7zm6 4h4v6h-4v-6z"/>
                  </svg>
                  <span>Personal Engineering Projects</span>
                </div>
              </div>
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
                  rel="noopener noreferrer"
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
                  rel="noopener noreferrer"
                  className="contact-link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
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
                <a
                  href="mailto:Grayson123007@gmail.com"
                  className="contact-link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  Email
                </a>
                <a
                  href="/resume.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"/>
                  </svg>
                  Resume
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="container">
            <p>&copy; {year} Grayson Cox</p>
            <p className="footer-subtitle">Computer Engineering &amp; Computer Science Student &mdash; University of Louisville Speed School</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
