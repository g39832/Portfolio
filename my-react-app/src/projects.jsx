export const projects = [
  {
    id: 'dispodex',
    title: 'Dispodex — Refurb Shop Inventory',
    featured: true,
    stat: 'In daily use · 1,400+ items tracked',
    screenshot: '/Dispodex.jpg',
    alt: 'Dispodex status board with inventory cards grouped by stage, from Intake to Sold',
    tags: ['Python', 'Django', 'SQLite', 'JavaScript', 'Square API', 'Business Software'],
    summary:
      'A Django inventory app used daily by a computer refurbishing shop — intake, photos, a drag-and-drop status board, eBay listing tools, and Square sync. A full rewrite of my original PHP Pink Sheet.',
    writeup:
      'Rebuilt the shop\'s PHP + SQLite Pink Sheet as a Python/Django app that runs on the local network for the whole team. Items move from intake through eBay draft, review, listing, and the in-store shelf to sold on a drag-and-drop status board. Intake sheets autosave and catch two people editing the same SKU, photos are resized on upload, and every change is recorded in each item\'s history with who made it. Lookup searches every field and exports to CSV, ZIP, and Excel with embedded photos, and Zebra labels print straight from the browser.',
    problem:
      'The original PHP tool had outgrown itself — thousands of items, several people editing at once, and no history, backups, or link to the shop\'s Square point of sale.',
    solution:
      'Rewrote it in Django with a background worker, a retrying Square sync queue with signed webhooks, nightly verified backups, and an importer that moved every old record and photo over and checked each one.',
    impact:
      'Tracks 1,400+ items across six stages for the shop team, keeps old QR codes and bookmarks working, and is covered by 190+ automated tests.',
    github: 'https://github.com/g39832/Dispodex',
    caseStudy: '/case-studies/dispodex/',
  },
  {
    id: 'ventage',
    title: 'Regroove — Vintage Reseller Platform',
    featured: false,
    stat: 'Live eBay integration + AI assistant',
    screenshot: '/Ventage.png',
    alt: 'Regroove inventory, accounting and listing management dashboard for vintage resellers',
    tags: ['React', 'TypeScript', 'Supabase', 'Node.js', 'Express', 'Tailwind CSS', 'eBay API', 'OpenAI'],
    summary:
      'A full-stack inventory, accounting, and listing platform for vintage resellers — with real eBay integration, buy-research with sold comps, and an AI assistant. Previously named Ventage.',
    writeup:
      'Designed and built a multi-user web app that gives a reselling shop one source of truth for inventory, sales, expenses, and marketplaces. Every piece lives in one place — add pieces with brand, category, size, era, and condition; drag-and-drop photos; log sales with fees and shipping to get real payout and profit; and track expenses. A dashboard plus downloadable CSV/PDF reports (P&L, tax summary, inventory valuation, top sellers) powers the business side.',
    problem:
      'Vintage resellers juggled stock, sales, and marketplaces across spreadsheets and notes — with no live view of true profit or market value.',
    solution:
      'Built a React/TypeScript front end on Supabase (Postgres with Row-Level Security, auth, storage) with an Express server handling the eBay integration and AI assistant — secrets stay server-side.',
    impact:
      'Real eBay API integration for live listings and orders, a research tool that estimates resale value from sold comps before purchase, and 6 downloadable reports — with multi-tenant data isolation out of the box.',
    github: 'https://github.com/g39832/Ventage-Inventory',
  },
  {
    id: 'crm',
    title: 'CRM Tool',
    featured: false,
    stat: 'Shipped to local businesses',
    screenshot: '/CRM.png',
    alt: 'CRM Tool screenshot',
    tags: ['Supabase', 'PostgreSQL', 'JavaScript', 'Node.js', 'REST API'],
    summary:
      'A production CRM shipped to local businesses for client tracking, job management, invoicing, and analytics.',
    writeup:
      'Built and shipped a full-stack CRM platform to local businesses for client tracking, job management, invoicing, and data analytics. Designed the database schema, RESTful API, and frontend interface — delivering a production-ready business tool used daily by real customers.',
    problem:
      'Local businesses juggled clients, jobs, and invoices across scattered spreadsheets and notes.',
    solution:
      'Designed a relational schema and REST API with a clean frontend covering the full workflow from prospect to invoice.',
    impact:
      'A production-ready tool used daily by real customers for client tracking, job management, invoicing, and analytics.',
    github: 'https://github.com/g39832/Full_Devries',
  },
]

export const miniProjects = [
  {
    id: 'mp-selfhosted',
    title: 'Self Hosted',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 9h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zm2 2.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
      </svg>
    ),
    summary: 'A full web server on bare-metal Linux — Raspberry Pi 4 with Nginx, DNS, firewalls, and SSL.',
    tags: ['Raspberry Pi', 'Nginx'],
  },
  {
    id: 'mp-pi-diagnostics',
    title: 'Pi Diagnostic Station',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
    summary: 'A Raspberry Pi-powered diagnostic station for computer repair shops, built as a TypeScript monorepo.',
    tags: ['Raspberry Pi', 'TypeScript'],
    github: 'https://github.com/g39832/PI-tester',
  },
  {
    id: 'mp-joseph',
    title: 'Joseph Voice Assistant',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
      </svg>
    ),
    summary: 'A personal voice-ready AI assistant for reminders, natural-language queries, and productivity.',
    tags: ['Python', 'NLP'],
    github: 'https://github.com/g39832/Joseph',
  },
  {
    id: 'mp-homelab',
    title: 'Home Network Lab',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    summary: 'VLANs, DNS filtering, and firewall rules across my home network gear.',
    tags: ['Networking', 'Firewall'],
  },
  {
    id: 'mp-cancer-sim',
    title: 'Cancer Cell Sim',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.8 18.4 14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z"/>
      </svg>
    ),
    summary: 'An interactive simulation of cancer cell growth and spread — watch how tumors develop in real time.',
    tags: ['Simulation', 'Biology'],
  },
  {
    id: 'mp-jellyfish-timer',
    title: 'Jellyfish Pomodoro Timer',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15 1H9v2h6V1zm-2 13h-2V8h2v6zm6.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
      </svg>
    ),
    summary: 'A jellyfish-themed Pomodoro timer for focused study and work sessions.',
    tags: ['JavaScript', 'Productivity'],
  },
]
