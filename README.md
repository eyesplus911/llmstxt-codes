# llmstxt.codes

**AI Readiness Scanner & Web Standards Hub**

Check how AI-ready any website is. Scan `robots.txt`, `llms.txt`, `ai.txt`, and `sitemap.xml` in one place, get a 0-100 score, and generate the files you're missing.

**Live site:** [https://llmstxt.codes](https://llmstxt.codes)

[![AI Readiness](https://llmstxt.codes/api/v1/badge/llmstxt.codes)](https://llmstxt.codes/?domain=llmstxt.codes)

---

## What it does

1. **Scan** — Enter any domain. We fetch 4 AI-related files in parallel, parse them client-side, and compute a weighted AI Readiness Score.
2. **Learn** — Deep guides on each standard: what it does, how to configure it, real examples from major companies.
3. **Generate** — Step-by-step generators for `llms.txt`, `robots.txt`, and `ai.txt`. Copy-paste output.
4. **API** — Free REST API. No auth, no sign-up. CORS enabled. Embed scores, badges, and scan results anywhere.

## Scoring

| File | Weight | What we check |
|------|--------|---------------|
| `llms.txt` | 44% | Exists, title, description, sections, links, content type, size |
| `robots.txt` | 28% | Exists, AI bot rules, coverage of known bots, sitemap directive |
| `sitemap.xml` | 17% | Exists, accessible, valid XML |
| `ai.txt` | 11% | Exists, parseable policies |

**Tiers:** AI-Ready (90-100) · Getting There (70-89) · Needs Work (50-69) · Not Configured (0-49)

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Astro 6 (SSR) |
| Runtime | Cloudflare Workers + Pages |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Language | TypeScript (strict) |
| Testing | Vitest |
| Package manager | Bun |

## Quick start

```bash
# Install dependencies
bun install

# Start dev server (localhost:4321)
bun dev

# Run tests
bun test

# Build for production
bun build

# Preview production build
bun preview
```

### Environment

Copy `.env.example` to `.env`. D1 and R2 bindings are configured in `wrangler.toml`.

For Cloudflare deployment:
```bash
npx wrangler pages deploy dist
```

## API

Base URL: `https://llmstxt.codes/api/v1`

| Endpoint | Description |
|----------|-------------|
| `GET /scan?domain=example.com` | Full scan: fetch + parse + score |
| `GET /score/:domain` | Read cached score from DB |
| `GET /badge/:domain` | SVG badge for READMEs |
| `GET /fetch?domain=example.com` | Raw file proxy (internal) |

### Badge embed

```markdown
[![AI Readiness](https://llmstxt.codes/api/v1/badge/YOUR-DOMAIN)](https://llmstxt.codes/?domain=YOUR-DOMAIN)
```

### curl example

```bash
curl "https://llmstxt.codes/api/v1/scan?domain=stripe.com" | jq .
```

Full docs: [llmstxt.codes/docs/api](https://llmstxt.codes/docs/api)

## Project structure

```
src/
├── lib/              # Core logic
│   ├── scanner.ts    # Orchestrator: fetch → parse → score → save
│   ├── scoring.ts    # Weighted score computation (0-100)
│   ├── parsers.ts    # Client-side parsers for all 4 file types
│   ├── domain.ts     # Domain validation + SSRF protection
│   └── errors.ts     # Structured API error codes
├── pages/
│   ├── index.astro   # Homepage + scanner UI
│   ├── about.astro   # Scoring methodology + mission
│   ├── report/[domain].astro  # Shareable report pages
│   ├── learn/        # Deep guides (llms.txt, robots.txt, ai.txt, sitemap)
│   ├── tools/        # Generators + playground
│   ├── docs/         # API documentation
│   └── api/v1/       # REST API endpoints
├── components/       # ScoreGauge, SubScoreCard
├── layouts/          # Base layout with nav, footer, SEO
└── styles/           # CSS design tokens
public/
├── robots.txt        # Our own robots.txt
├── llms.txt          # Our own llms.txt (dogfooding)
└── favicon.*
chrome-extension/     # Manifest V3 Chrome extension
test/                 # Vitest test suites
```

## Chrome Extension

The `chrome-extension/` directory contains a Manifest V3 extension that scans the current tab's domain via the hosted API. Install it locally for development:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select the `chrome-extension/` folder

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `bun test` to verify
4. Submit a PR

## License

MIT
