# RefreshAI

**Turn stale content into top-ranking articles.** Paste a URL, and RefreshAI researches Google's top 10 results for your article's keyword, analyzes every content gap, then uses Claude to produce a fully rewritten, publish-ready article.

---

## How It Works

The pipeline runs 5 sequential Claude API stages:

| Stage | What happens |
|-------|-------------|
| **1 — Ingest & Extract** | Scrapes your article via Jina AI, extracts headings, keyword, angle, and word count |
| **1b — SERP Research** | Hits ValueSERP for the top 10 ranking URLs, scrapes each one via Jina AI |
| **2 — Gap Analysis** | Claude identifies missing sections, weak areas, and unanswered questions |
| **3 — Refresh Plan** | Claude produces a section-by-section blueprint: keep / rewrite / expand / cut / add |
| **4 — Write Sections** | Each section is written in a separate Claude call for focused quality |
| **5 — Polish & Assembly** | Claude polishes the full draft, writes a headline and meta description |

---

## Features

- Live progress indicator as each stage completes
- Side-by-side original vs refreshed article view
- One-click copy of the full refreshed article
- Optional content enrichment: upload a transcript, media file (Claude transcribes it), or paste raw text

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/refresh-ai.git
cd refresh-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Add API keys

Edit `.env.local` in the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
VALUESERP_API_KEY=...
```

- **ANTHROPIC_API_KEY** — Get one at [console.anthropic.com](https://console.anthropic.com)
- **VALUESERP_API_KEY** — Get one at [valueserp.com](https://valueserp.com)

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Import to [Vercel](https://vercel.com) and add the two env variables
3. Deploy

> **Note:** The pipeline can take 2–5 minutes. Vercel's free Hobby plan has a 10-second timeout on serverless functions. You'll need **Vercel Pro** (or self-host) to use the full pipeline with `maxDuration = 300`.

---

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **@anthropic-ai/sdk** — All LLM calls (Claude only, no OpenAI)
- **Jina AI** — Article scraping (`https://r.jina.ai/{url}`)
- **ValueSERP** — Google SERP data

---

## Project Structure

```
app/
  page.tsx              # Landing page
  refresh/
    page.tsx            # Results page (live progress + split view)
  api/
    refresh/
      route.ts          # SSE pipeline orchestrator
  globals.css
  layout.tsx
lib/
  types.ts              # Shared TypeScript interfaces
  scraper.ts            # Jina AI scraper
  serp.ts               # ValueSERP + competitor scraping
  pipeline.ts           # All 5 Claude pipeline stages
.env.local              # API keys (not committed)
```
