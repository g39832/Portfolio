import { useEffect, useState } from 'react'
import '../App.css'
import './case-study.css'
import JellyfishBackground from '../JellyfishBackground'
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

/** The frame every case study shares: background, header with the theme switch, and footer. */
function CaseStudyLayout({ children }) {
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
          <div className="cs-container">{children}</div>
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

export default CaseStudyLayout
