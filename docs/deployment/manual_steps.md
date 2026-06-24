# Manual deployment steps

Steps that can't be automated in the repo or the Pages build — they require a
live URL and/or third-party dashboards. Do these **after** the frontend is
deployed to `https://terragotcha.com/`.

## SEO (after deploying the landing-page SEO changes — commit `21beba9`)

The `og:image`/`twitter:image` and `sitemap.xml` only resolve once the site is
live, so these two follow-ups can't be done before deploy:

### 1. Re-scrape the Open Graph / Twitter share image
Social platforms cache link previews aggressively, so a first share (or any
share from before the og tags existed) can show a stale/empty card. Force a
fresh scrape once live:

- **Facebook / WhatsApp / Messenger / LinkedIn** — [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/):
  enter `https://terragotcha.com/`, then click **Scrape Again**.
- **X / Twitter** — paste the URL into the post composer (or the card validator
  if available) and confirm a `summary_large_image` card renders.

Expect the 1200×630 `og-image.png` with the Terragotcha wordmark. If it's blank,
check that `https://terragotcha.com/og-image.png` loads directly.

### 2. Submit the sitemap to Google Search Console
- Verify ownership of `terragotcha.com` in [Google Search Console](https://search.google.com/search-console)
  (DNS TXT record via Cloudflare is easiest).
- **Indexing → Sitemaps** → submit `sitemap.xml`.
- Optionally **URL Inspection** on `https://terragotcha.com/` → **Request indexing**
  to prime the first crawl.

`robots.txt` already advertises the sitemap at
`https://terragotcha.com/sitemap.xml`, so crawlers will find it regardless, but
submitting it speeds up first indexing and surfaces crawl errors.
