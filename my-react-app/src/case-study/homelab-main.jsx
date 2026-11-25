import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import HomelabCaseStudy from './HomelabCaseStudy.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HomelabCaseStudy />
  </StrictMode>,
)
