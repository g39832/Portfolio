export const projects = [
  {
    id: 'pink-sheet',
    title: 'Pink Sheet Inventory System',
    featured: false,
    screenshot: '/PInksheet.png',
    alt: 'Pink Sheet Inventory System screenshot',
    tags: ['PHP', 'MySQL', 'Database Design', 'Business Software'],
    summary:
      'An internal PHP inventory system that replaced paper-based tracking with a full digital workflow — designed and built entirely by me.',
    writeup:
      'Developed a PHP-based inventory management system used for internal business operations. The application streamlined inventory tracking and provided a centralized workflow for managing equipment and assets, replacing manual paper-based processes with a digital solution designed and implemented entirely by me.',
    problem:
      'Manual paper-based inventory tracking was inefficient and error-prone for business operations.',
    solution:
      'Built a full CRUD application with database-driven workflows, search, and reporting.',
    impact:
      'Streamlined equipment tracking and asset management for daily business use.',
    github: 'https://github.com/g39832',
  },
  {
    id: 'ventage',
    title: 'Regroove — Vintage Reseller Platform',
    featured: true,
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
    live: 'https://full-devries.vercel.app',
  },
  {
    id: 'self-hosted',
    title: 'Self Hosted',
    featured: false,
    screenshot: '/Server.jpeg',
    alt: 'Self Hosted Raspberry Pi server',
    tags: ['Raspberry Pi', 'Linux', 'Nginx', 'Networking', 'Self-Hosted'],
    summary:
      'A full web server running from bare-metal Linux on a Raspberry Pi 4 — Nginx, DNS, firewalls, and SSL.',
    writeup:
      'Self-hosting a full web server on a Raspberry Pi 4 — running Nginx, managing DNS, configuring firewalls, and deploying websites directly from bare-metal Linux. This hands-on setup taught me Linux system administration, network security, SSL/TLS certificate management, and the fundamentals of keeping production services alive on low-power hardware.',
    problem:
      'I wanted real production experience — not just localhost demos — and to run my own infrastructure.',
    solution:
      'Deployed a bare-metal Linux stack on a Raspberry Pi 4 with Nginx, DNS management, and firewall hardening.',
    impact:
      'Hands-on mastery of Linux administration, network security, SSL/TLS, and keeping production services alive on low-power hardware.',
    github: 'https://github.com/g39832/Pi-App',
  },
  {
    id: 'joseph',
    title: 'Joseph — AI Assistant',
    featured: false,
    screenshot: '/Joseph.png',
    alt: 'Joseph AI Assistant screenshot',
    tags: ['Python', 'NLP', 'AI', 'Speech Recognition'],
    summary:
      'A personal voice-ready AI assistant for reminders, natural-language queries, and productivity.',
    writeup:
      'Designed and built a personal AI assistant that handles daily tasks including reminders, natural language queries, and productivity management. Applied Python-based NLP techniques and conversational AI patterns to create a practical, voice-command-ready tool.',
    problem:
      'Daily tasks were scattered across reminders and apps — I wanted one natural-language interface.',
    solution:
      'Applied Python NLP techniques and conversational AI patterns to build a voice-command-ready assistant.',
    impact:
      'A practical daily assistant that handles reminders, queries, and productivity through natural language.',
    github: 'https://github.com/g39832/Joseph',
  },
]
