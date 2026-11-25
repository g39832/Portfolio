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
    repoPrivate: true,
    caseStudy: '/case-studies/dispodex/',
  },
  {
    id: 'campaign-ledger',
    title: 'Campaign Ledger — D&D Campaign Tracker',
    featured: false,
    stat: '113 automated tests · players join from their own devices',
    screenshot: '/CampaignLedger.jpg',
    alt: 'Campaign Ledger battle map with fog of war, character tokens and the 3D dice tray showing a damage roll',
    tags: ['Python', 'Flask', 'SQLite', 'JavaScript', 'Canvas 3D', 'Pillow'],
    summary:
      'A self-hosted Dungeons & Dragons companion: character sheets, combat tracker, battle map with fog of war, 3D dice, and a join code so friends can play from their own phones.',
    writeup:
      'A web app I run on my own machine for D&D nights. It covers full 5e character sheets with derived stats, a morality and alignment tracker, an initiative and HP combat tracker with undo, a campaign journal, and a creature library. Dice are real 3D polyhedra drawn on a canvas that tumble across the table and land on the result the server rolled. Friends join with a code and get a player screen with the shared battle map, the turn order, their own character, and live dice.',
    problem:
      'Running a game meant juggling paper sheets, a separate dice app, and a map, and nothing kept HP, turns, and what players were allowed to see in sync.',
    solution:
      'Built it with Flask and SQLite, with every edit autosaved through a conflict-safe save queue. The server is the source of truth for rolls, HP, and visibility. Fog of war is burned into the map image server-side, so players never receive anything the DM has hidden.',
    impact:
      'One app runs the whole session: 113 automated tests, verified backups and restores, DM-only rolls and hidden enemies enforced on the server, and it works on phones, tablets, and desktops.',
    github: 'https://github.com/g39832/campaign-ledger',
  },
  {
    id: 'homelab',
    title: 'Homelab — Raspberry Pi Kubernetes Cluster',
    featured: false,
    logo: '/homelab-icon.svg',
    logoAlt: 'Homelab logo: a jellyfish with a server for a head and network cables for tentacles',
    stat: '2 Raspberry Pis · 15 apps · 0 open ports',
    screenshot: '/Homelab.jpg',
    alt: 'The homelab start page: a daily DevOps lesson, live up/down checks for every app, and CPU and memory for both Raspberry Pis',
    tags: ['Kubernetes (k3s)', 'Docker', 'GitHub Actions', 'Cloudflare', 'Nginx', 'Linux', 'Networking'],
    summary:
      'A two-node Kubernetes cluster on a Raspberry Pi 5 and Pi 4 that runs this website, my blog, a media server, ad-blocking DNS, my D&D app and more, all as containers built by CI.',
    writeup:
      'I moved everything I self-host off hand-run services and onto a k3s cluster I built on two Raspberry Pis. GitHub Actions builds the container images on every push, and every app is a YAML file in Git. This site and dnd.graysoncodes.org reach the internet through a Cloudflare Tunnel, so my router has no open ports. CrowdSec reads the web server logs, spots scanners and brute-force attempts, has Cloudflare challenge them at the edge, and posts each ban to Discord. Two Pi-hole servers block ads and trackers for my devices, including my phone anywhere over Tailscale. Jellyfin serves movies with a nightly config backup, and Uptime Kuma sends phone alerts if anything goes down. I also built a custom start page with live health checks, cluster CPU and memory, and a daily DevOps lesson, plus router labs (FRR, OSPF) for practising networking.',
    problem:
      'My Pi was running a pile of separate services set up by hand. Nothing was written down, updates meant SSH and hoping, the site needed open ports, and I had no idea when something broke or who was poking at it.',
    solution:
      'Rebuilt it as infrastructure as code: k3s on two Pis, images built by GitHub Actions and published to GHCR, each app pinned to the right node with its own storage, a Cloudflare Tunnel instead of port forwarding, and CrowdSec plus a Cloudflare Worker for security. I rehearse every change in a throwaway k3s-in-Docker cluster before it touches the real one.',
    impact:
      '15 apps running across both Pis with live monitoring and phone alerts, zero open ports on my home network, attackers blocked before they reach the Pi, and the whole setup can be rebuilt from the repo.',
    github: 'https://github.com/g39832/Portfolio/tree/main/cluster',
    caseStudy: '/case-studies/homelab/',
  },
  {
    id: 'tumorsim',
    title: 'TumorSim — Cancer Cell Evolution Simulator',
    featured: false,
    stat: 'Thousands of cells · 6 organs · runs in your browser',
    screenshot: '/TumorSim.jpg',
    alt: 'TumorSim: a tumour spreading through healthy tissue, with a body map showing which organs it has reached',
    tags: ['TypeScript', 'Web Workers', 'Canvas', 'Simulation', 'Vitest'],
    summary:
      'An interactive simulation of cancer: thousands of cells grow, mutate and compete, tumours spread to other organs, and you can try treatments and watch resistance evolve. Click any organ to zoom in.',
    writeup:
      'Every dot is a cell with its own age, health and mutations. Nothing is scripted: tumour growth, clonal evolution, immune attack and drug resistance all emerge from simple per-cell rules. Cells that gain the motility mutation can break away and seed new tumours in the lymph nodes, lungs, liver, bones or brain, and each organ runs as its own full simulation with different "soil" (food, immune cells, drug access). A body map shows the spread, and you can zoom into any organ. Runs end with a summary when the tumour is cleared, overwhelms a vital organ, or a year passes. A welcome screen, guided tour and plain-English help make it usable by anyone.',
    problem:
      'Ideas like clonal evolution, metastasis and treatment resistance are hard to picture from a textbook diagram, and most simulations are either too simple to be interesting or too technical to use.',
    solution:
      'Built an agent-based engine in TypeScript that runs each tissue in its own Web Worker, so six simulations tick in parallel on one clock while the page stays smooth. A dependency-free canvas renderer, charts and an evolution tree sit on top, with a guided first-run flow for beginners.',
    impact:
      'Handles 10,000+ cells per tissue at interactive speed while staying inside a fixed CPU budget (it never maxes out your machine), works on phones with pinch-to-zoom, and the simulation core is covered by 56 automated tests, including deterministic replays.',
    live: '/tumorsim/',
    gallery: [
      { src: '/TumorSim.jpg', alt: 'A tumour growing as a mass in healthy tissue, with the body map showing where it has spread', caption: 'A tumour grows outward from where it started; the body map lights up as cells reach other organs.' },
      { src: '/TumorSim-organ.jpg', alt: 'Zoomed into the lymph nodes, with the Body tab listing every organ', caption: 'Zoomed into an organ. The Body tab shows each site and why it behaves differently.' },
      { src: '/TumorSim-inspect.jpg', alt: 'A selected tumour cell in the inspector next to the Evolution tab', caption: 'Click any cell to inspect it; the Evolution tab shows which mutant families are winning.' },
      { src: '/TumorSim-treatment.jpg', alt: 'Chemotherapy shrinking a tumour, with the treatment-response chart', caption: 'Chemotherapy shrinks the tumour; the response chart shades when each dose is active.' },
      { src: '/TumorSim-end.jpg', alt: 'End-of-run summary showing where the tumour spread and which mutations won', caption: 'Every run ends with a summary: where it spread, which mutations won, and what to try next.' },
      { src: '/TumorSim-phone.jpg', alt: 'TumorSim on a phone', caption: 'Works on phones too, with pinch-to-zoom.', fit: 'contain' },
    ],
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
    title: 'Bluegrass CRM',
    featured: false,
    logo: '/bluegrass-logo.webp',
    logoAlt: 'Bluegrass Software logo',
    stat: 'Shipped to local businesses',
    screenshot: '/CRM.png',
    alt: 'Bluegrass CRM screenshot',
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
    id: 'mp-network-labs',
    title: 'Router Network Labs',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>
      </svg>
    ),
    summary: 'Five virtual router labs on my Pi (Containerlab + FRR): static routes, OSPF, and a broken network to troubleshoot.',
    tags: ['Networking', 'Containerlab'],
    github: 'https://github.com/g39832/Portfolio/tree/main/cluster/labs',
  },
  {
    id: 'mp-devops-path',
    title: 'Pi to DevOps Path',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 7l10-4 10 4-10 4z"/><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9"/>
      </svg>
    ),
    summary: 'My DevOps learning guide, hosted on the cluster: 140+ checked resources, projects to build, and a Pomodoro timer.',
    tags: ['DevOps', 'Learning'],
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
