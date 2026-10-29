# CA Final Lecture Tracker

A personal lecture tracker for CA Final — **Direct Tax**, **Financial Reporting** and **Audit**.
Plan every chapter, tick off each lecture part, run a focus timer, and keep a permanent
study history with a full audit trail.

Runs in **two modes from one codebase**:

| Mode | Storage | Best for |
| --- | --- | --- |
| Server (`npm run build`) | PostgreSQL via Drizzle ORM | Full deployment, permanent history |
| Static (`npm run build:static`) | Browser `localStorage` | GitHub Pages, no backend needed |

---

## Deploy to GitHub Pages

The app exports to plain HTML/CSS/JS, so it hosts anywhere static.

### Automatic (recommended)

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys.

Your site lands at `https://<user>.github.io/<repo-name>/`.

> The workflow sets `NEXT_PUBLIC_BASE_PATH=/<repo-name>` so assets resolve on a
> project page. For a **user** site (`<user>.github.io`), remove that env var
> from the workflow.

### Manual

```bash
NEXT_PUBLIC_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/your-repo-name npm run build:static
# upload the ./out folder to your Pages branch
```

A `.nojekyll` file is included so GitHub Pages serves the `_next/` directory.

---

## Local development

```bash
npm install
npm run dev        # server mode against PostgreSQL
```

Create `.env` with a `DATABASE_URL`. On first load the app seeds all three
subjects with realistic progress:

| Subject | Chapters | Sessions | Planned |
| --- | --- | --- | --- |
| Direct Tax | 44 | 161 | 483h |
| Financial Reporting | 33 | 239 | 290.4h |
| Audit | 18 | 157 | 166.1h |

To try the static mode locally:

```bash
NEXT_PUBLIC_STATIC_EXPORT=1 npm run build && npx serve out
```

---

## Features

- **Full CRUD** for subjects, chapters, lectures and study-log entries
- **Per-part lecture tracking** — exact runtimes for split lectures (`Day 32, Part 1a`)
- **Test milestones** as tickable items, with a dedicated Tests tab
- **Focus timer** that persists across navigation and writes real hours to your history
- **Command palette** — ⌘K / Ctrl-K to jump anywhere or trigger actions
- **Consistency heatmap** — 14 weeks of study hours
- **Today ring** — daily target, streak, pace projection, exam countdown
- **Offline support** — installable PWA with a service worker
- **Import / export** round-trips losslessly, including lecture labels and runtimes
- **Activity trail** — append-only log of every change
- **iPhone-optimised** — safe areas, bottom tab bar, no input zoom, no layout shift

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl-K` | Open command palette |
| `↑` `↓` | Navigate results |
| `⏎` | Open selection |
| `Esc` | Close |

---

## Data model

Five tables: `subjects`, `chapters`, `lectures`, `study_sessions`, `activity_log`.
Applying schema changes:

```bash
npx drizzle-kit push
```

## Tech

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Drizzle ORM · PostgreSQL
