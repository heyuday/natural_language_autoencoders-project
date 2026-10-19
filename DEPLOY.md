# Deploying the site

The site is static: every number and every steered output is precomputed into
`web/public/data/`. It needs no GPU, no API key, and no database.

## 1. Regenerate data (only if texts or experiments change)

See `analysis/README.md`. Then check the page against the data:

```bash
cd web
npm install
npm run build
npm run verify        # fails if any rendered number disagrees with web/public/data
```

## 2. Deploy to Vercel

The Vercel project (`nla-steering`, root directory `web`) already exists.

```bash
cd web
npx vercel            # preview deployment from the current branch
npx vercel --prod     # production, once the preview looks right
```

No environment variables are required. Remove the old ones from the project settings if they
are still there (`ANTHROPIC_API_KEY`, `MODAL_*`, `DEMO_KEY`, `UPSTASH_*`,
`NEXT_PUBLIC_LIVE_ENABLED`); nothing reads them any more.

## 3. Optional: a public live backend at no cost

Without it, the "Try it" panel lets readers connect to a backend on their own machine. To make
it work for everyone, run `serve/live/` as a free CPU Hugging Face Space (instructions in
`serve/live/README.md`), then set one variable in Vercel and redeploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_LIVE_URL` | `https://<you>-nla-steering-live.hf.space` |

It is read at build time, so the redeploy is required.

## Retired

`serve/modal_app.py` and the Anthropic-backed `/api/compile-text` route were the August design
(GPU on Modal, an LLM to draft the texts). The routes have been removed from `web/`;
`serve/modal_app.py` is kept for reference.
