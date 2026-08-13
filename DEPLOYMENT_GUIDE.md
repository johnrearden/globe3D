# Production Deployment Guide
## 3D World Map - Globe Visualization

---

## Table of Contents
1. [Cloudflare Pages Deployment](#cloudflare-pages-deployment)
2. [Cost Analysis](#cost-analysis)
3. [Google AdSense Integration](#google-adsense-integration)
4. [Google Analytics Integration](#google-analytics-integration)
5. [SEO Optimization Strategy](#seo-optimization-strategy)
6. [Frontend Hosting: Cloudflare Pages + R2 + Access](#6-frontend-hosting-cloudflare-pages--r2--access)

> **Backend API server.** This guide covers the **static frontend** (Cloudflare Pages + R2).
> The Daily Challenge **API** is a Django app deployed separately to a self-hosted VPS
> (PostgreSQL + Redis + gunicorn behind nginx, Cloudflare Origin Cert). Its complete,
> version-controlled runbook — Ubuntu 24.04 provisioning, Postgres setup, systemd units,
> TLS, and the nightly backup strategy — lives at [`backend/deploy/README.md`](backend/deploy/README.md).
> The frontend talks to it via `window.GLOBE3D_API_BASE` (production: `https://api.terragotcha.com/api`,
> set in `index.html` for `*.terragotcha.com` hosts; proxied through Cloudflare).

---

## 1. Cloudflare Pages Deployment

### Project Overview
- **Type**: Static Three.js WebGL application
- **Main File**: index.html (~95KB)
- **Assets**: world.glb (~5.2MB)
- **Total Size**: ~5.3MB
- **Dependencies**: Three.js, draco3d, earcut, flag-icons, world-geojson

### Deployment Steps

#### Step 1: Prepare the Project
```bash
# Ensure all assets are optimized
npm run build:globe

# Test locally before deployment
python3 -m http.server 8000
# Visit http://localhost:8000 to verify functionality
```

#### Step 2: Create Cloudflare Pages Project
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **Create application** > **Pages**
3. Choose **Connect to Git** or **Direct Upload**

#### Step 3: Git Integration (Recommended)
```bash
# Ensure your repo is on GitHub/GitLab
git remote -v  # Verify remote exists

# Push latest changes
git add .
git commit -m "Prepare for production deployment"
git push origin main
```

In Cloudflare:
1. Select your repository
2. Configure build settings:
   - **Build command**: Leave empty (static site)
   - **Build output directory**: `/`
   - **Root directory**: `/`
3. Click **Save and Deploy**

#### Step 4: Custom Domain (Optional)
1. Go to **Custom domains** in your Pages project
2. Add your domain (e.g., `globe.yourdomain.com`)
3. Cloudflare will automatically provision SSL certificate
4. Update DNS records as instructed

#### Step 5: Analytics / AdSense IDs (no environment variables needed)
Analytics and AdSense IDs are **not** Cloudflare environment variables. They live in the
committed config file **`js/data/site-config.js`** (`GA_MEASUREMENT_ID`, `ADSENSE_CLIENT_ID`,
`ADSENSE_RAIL_SLOT`, `ADSENSE_LANDING_SLOT`). These are public client-side identifiers, so
committing them is fine; an empty value means that integration stays disabled. See Sections 3 & 4
below for the exact steps.

#### Step 6: Configure _headers File
Create a `_headers` file in the root directory for optimal performance:

```
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: interest-cohort=()

/*.glb
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=3600, must-revalidate
```

#### Step 7: Configure _redirects (if needed)
Create a `_redirects` file for SPA routing:

```
/* /index.html 200
```

---

## 2. Cost Analysis

### Cloudflare Pages Free Tier
- **Requests**: Unlimited
- **Bandwidth**: Unlimited
- **Builds**: 500 per month
- **Concurrent builds**: 1
- **Custom domains**: Unlimited
- **SSL**: Free (automatic)

### Paid Tier ($20/month)
**You will NEVER exceed the free tier for bandwidth/requests** with Cloudflare Pages.

However, if you exceed 500 builds/month, you'll need the paid tier:
- **Builds**: 5,000 per month
- **Concurrent builds**: 5
- **Additional features**: Instant Rollbacks, Advanced metrics

### Cost Projections

**Scenario 1: Low Traffic (0-100K visitors/month)**
- **Cost**: $0/month
- **Cloudflare Pages**: Free tier sufficient
- **Bandwidth**: ~500GB-1TB (well within free tier)

**Scenario 2: Medium Traffic (100K-1M visitors/month)**
- **Cost**: $0/month
- **Cloudflare Pages**: Free tier sufficient
- **Bandwidth**: ~5-10TB (still free)
- **Note**: May want paid tier ($20/month) for advanced analytics

**Scenario 3: High Traffic (1M-10M visitors/month)**
- **Cost**: $0-20/month
- **Cloudflare Pages**: Free tier likely sufficient
- **Bandwidth**: ~50-100TB (still free!)
- **Recommendation**: Upgrade to paid tier for better support and metrics

**Scenario 4: Enterprise Traffic (>10M visitors/month)**
- **Cost**: Contact Cloudflare for Enterprise pricing
- **Estimated**: $200-500/month (negotiable)

### Key Insight
**Cloudflare Pages has NO bandwidth charges.** Your primary costs will be:
1. Domain registration (~$10-15/year)
2. Optional paid tier for advanced features ($20/month)
3. External services (Analytics, AdSense, etc.) - all free

### Comparison with Other Platforms
| Platform | Free Tier Bandwidth | Overage Cost |
|----------|---------------------|--------------|
| Cloudflare Pages | Unlimited | $0 |
| Vercel | 100GB | $0.12/GB |
| Netlify | 100GB | $0.20/GB |
| AWS S3 + CloudFront | 1TB (first year) | $0.085/GB |

**Winner**: Cloudflare Pages (unlimited bandwidth at no cost)

---

## 3. Google AdSense Integration

> **Status (2026-07): the code is already implemented as modules** — see
> `js/features/ads/adsense.js` (loader + `mountAd`), `js/features/ads/ad-rail.js` (desktop side
> rail), `js/data/site-config.js` (IDs), `ads.txt`, and `privacy/index.html`. Do **not** paste the
> inline snippets that older revisions of this guide described — that would double-integrate. The
> only remaining work is external: get approved, fill in the IDs, and flip two dashboard settings
> (below).

### Prerequisites
1. Google account
2. Approved AdSense account (application process takes 1-2 weeks)
3. Valid payment information

### Step 1: Apply for AdSense
1. Visit [Google AdSense](https://www.google.com/adsense/)
2. Sign up with your Google account
3. Provide website URL (your Cloudflare Pages domain)
4. Wait for approval (typically 1-2 weeks)

### Step 2: Get Your AdSense Code
After approval:
1. Log in to AdSense dashboard
2. Go to **Ads** > **Overview** > **By site**
3. Click **Get code**
4. Copy your AdSense script tag

### Step 3: Fill in the IDs

> ✅ **Done (2026-08-05):** `ADSENSE_CLIENT_ID = 'ca-pub-2820812359000429'` and `ads.txt` carries the
> real publisher id. Only the two **slot ids** remain (they need ad units to exist in the dashboard).

1. ~~In **`js/data/site-config.js`**, set `ADSENSE_CLIENT_ID` to your `ca-pub-…` id.~~ Done. Note it
   is duplicated in the static loader `<script>` in `index.html`'s `<head>` — **keep the two in
   sync**. The `/borders/<slug>` pages need no edit: `build-landing.mjs` reads `site-config.js`.
2. In the AdSense dashboard, create the display ad units, then set `ADSENSE_RAIL_SLOT` (desktop side
   rail) and `ADSENSE_LANDING_SLOT` (the in-content unit on the `/borders/<slug>` landing pages) in
   the same file. **Until these are set, no ad unit is mounted at all** — that is deliberate: a
   slot-less `<ins>` paints a blank box under an "Advertisement" label, which is a policy problem.
3. ~~In **`ads.txt`**, replace `pub-XXXXXXXXXXXXXXXX` with your publisher id.~~ Done.

**Where the loader lives.** `adsbygoogle.js` is a **static `<script async src>` in `index.html`'s
`<head>`**, immediately after the `google-adsense-account` meta (and emitted into every
`/borders/<slug>` page by `build-landing.mjs`). It has to be in the raw HTML: injecting it from
`js/features/ads/adsense.js` put it behind `init()`'s WebGL `try/catch` and a 6s `afterIntro`
deferral, so a WebGL-less or non-executing crawler saw **no ad code**, and AdSense review stalled at
"Getting ready". This is a documented exception to the "no new `<script>` in `index.html`" rule in
`CLAUDE.md` — vendor markup, not logic. `adsense.js` still owns the ad *units* (deferred behind the
splash) and its `loadAdsenseScript()` no-ops when the static tag is present, so there is never a
second loader.

### Step 4: Ad placements (already built — do NOT add inline `<ins>` tags)
This is a WebGL SPA, so ads sit in the page chrome, never over the canvas:

- **Desktop side rail** — `js/features/ads/ad-rail.js` mounts a responsive unit in the left margin.
- **Mobile bottom anchor** — served by **Auto Ads set to Anchor-only** (AdSense dashboard →
  Auto ads). Keep all other Auto-Ads formats **off** so nothing overlays the globe.
- **Landing pages** — `build-landing.mjs` injects an in-content unit into each `/borders/<slug>`
  page at build time, gated on the config IDs.

Do not follow the old "Auto Ads / manual banner" snippets — the app's own canvas is not a valid ad
surface, and Auto Ads left fully on would overlay it (a policy risk).

### Step 5: Consent (required for EEA/UK) + verify
1. In the AdSense dashboard, enable **Privacy & messaging → GDPR + US-states** (Google's certified
   CMP). The code already emits **Consent Mode v2** defaults (denied) via
   `js/features/analytics.js`, so ads/analytics honour the CMP automatically once it's on.
2. Confirm `privacy/index.html` (linked from the app + landing pages) is live.
3. After deploy: verify `https://terragotcha.com/ads.txt` resolves, and that ads render only in the
   margins/anchor (never over the canvas, on the splash, or beside buttons).

> ⚠️ **Ordering caveat.** Because the AdSense loader is now static in `<head>`, it runs *before*
> `initConsentDefaults()` and before the Funding Choices CMP (still deferred behind `afterIntro` in
> `js/features/consent-cmp.js`). EEA/UK/CH ad requests therefore fire with no `__tcfapi` present →
> little or no EEA fill. Not an approval blocker (a US reviewer is unaffected, and Consent Mode
> grants everything outside EEA/UK/CH). Fix after approval by hoisting `initConsentCmp()` to the
> top-level module block beside `initConsentDefaults()`, and/or emitting the Funding Choices tag
> statically above the AdSense tag exactly as `build-landing.mjs` already does.

### Step 6: Verify what a crawler sees
Use `curl`, not the browser — `curl` shows the raw HTML, which is what AdSense's reviewer and ad
crawler parse. (A browser would pass even if the loader were only reachable via JS.)

```bash
curl -s https://terragotcha.com/ads.txt                                        # → pub-2820812359000429
curl -s https://terragotcha.com/ | grep -c googlesyndication                   # → 1
curl -s https://terragotcha.com/borders/france | grep -c googlesyndication     # → 1
curl -s https://terragotcha.com/borders/france | grep -c 'class="adsbygoogle"' # → 0 until slot ids are set
```

Locally, `npm run build:pages` then serve `dist/` and load `/?ads=1` (the `?ads` override in
`site-config.js` forces prod behaviour): expect exactly one `adsbygoogle.js` tag, no `#ad-rail`, and
**no blank "Advertisement" boxes** at any width. A `display:none` 0×0 `<ins>` with no
`data-ad-client` may appear — that is Google's own Auto Ads probe, not one of ours.

### Expected Revenue
**Estimates for educational/geography niche**:
- **RPM (Revenue per 1000 visitors)**: $2-$10
- **10K visitors/month**: $20-$100
- **100K visitors/month**: $200-$1000
- **1M visitors/month**: $2000-$10000

*Note: Actual revenue varies by geography, niche, ad placement, and user engagement.*

---

## 4. Google Analytics Integration

> **Status (2026-07): the code is already implemented as a module** — see
> `js/features/analytics.js` (Consent Mode v2 + `gtag.js` loader + `track()`) and
> `js/data/site-config.js` (`GA_MEASUREMENT_ID`). Do **not** paste the inline `gtag` snippet or
> hand-write event functions that older revisions described — the events are already wired. The only
> remaining work is to create the property and paste the Measurement ID.

### Step 1: Create Google Analytics Property
1. Go to [Google Analytics](https://analytics.google.com/)
2. Click **Admin** (bottom left)
3. Create Account/Property
4. Choose **Web** data stream
5. Enter your website URL
6. Get your **Measurement ID** (format: G-XXXXXXXXXX)

### Step 2: Paste the Measurement ID
Set `GA_MEASUREMENT_ID` in **`js/data/site-config.js`** to your `G-XXXXXXXXXX` id, then deploy.
That's it — `js/features/analytics.js` sets Consent Mode v2 defaults, loads `gtag.js` (deferred
behind the intro splash so LCP isn't taxed, and prod-gated so no hits fire from local dev), and
sends `page_view` + custom events. Verify in **GA4 → Realtime / DebugView** (append `?ads=1` locally
to force the prod path for a smoke test).

### Step 3: Custom events (already wired)
Five events fire from the app already — no code to add:

| Event | Fires when | Where |
|-------|-----------|-------|
| `quiz_start` | a quiz begins (with `mode`) | `analytics.js` via `state.subscribe('quiz.active')` |
| `quiz_complete` | a quiz finishes (`mode`, `score`, `total`) | `js/features/quiz/quiz-ui.js` |
| `country_select` | a country is tapped on the globe | `js/features/pointer-controls.js` |
| `daily_complete` | the Daily Challenge is finished (`score`) | `js/features/daily-quiz/daily-quiz.js` |
| `share` | a result is shared/copied | `js/features/quiz/quiz-results-modal.js` |

To add more, import `track` from `js/features/analytics.js` and call `track('name', {…})`.

### Step 4: Configure Enhanced Measurement
In GA4 dashboard:
1. Go to **Admin** > **Data Streams** > Your stream
2. Click **Enhanced measurement**
3. Enable:
   - Scrolls
   - Outbound clicks
   - Site search
   - Video engagement
   - File downloads

### Step 5: Create Custom Dashboards
**Recommended Reports**:
1. **User Engagement Report**
   - Average session duration
   - Bounce rate
   - Pages per session

2. **Geographic Report**
   - User locations
   - Most popular countries viewed

3. **Technology Report**
   - Browser/device breakdown
   - WebGL support rate
   - Performance metrics

### Step 6: Set Up Conversion Goals
1. Go to **Admin** > **Events** > **Create event**
2. Create events for:
   - Extended session (>2 minutes)
   - Multiple country clicks (>5 interactions)
   - Social share clicks
   - Return visits

---

## 5. SEO Optimization Strategy

### Phase 1: Technical SEO (Week 1)

#### A. Update HTML Metadata
Modify your `<head>` section:

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Primary Meta Tags -->
    <title>Interactive 3D World Globe | Explore Countries, Geography & Flags</title>
    <meta name="title" content="Interactive 3D World Globe | Explore Countries, Geography & Flags">
    <meta name="description" content="Explore the world in stunning 3D! Interactive globe with detailed country information, flags, and geography. Built with WebGL for smooth, immersive experience.">
    <meta name="keywords" content="3D globe, world map, interactive map, geography, countries, flags, WebGL, Three.js, earth visualization">
    <meta name="author" content="Your Name">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://yourdomain.com/" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://yourdomain.com/">
    <meta property="og:title" content="Interactive 3D World Globe | Explore Countries, Geography & Flags">
    <meta property="og:description" content="Explore the world in stunning 3D! Interactive globe with detailed country information, flags, and geography.">
    <meta property="og:image" content="https://yourdomain.com/og-image.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://yourdomain.com/">
    <meta property="twitter:title" content="Interactive 3D World Globe | Explore Countries, Geography & Flags">
    <meta property="twitter:description" content="Explore the world in stunning 3D! Interactive globe with detailed country information, flags, and geography.">
    <meta property="twitter:image" content="https://yourdomain.com/twitter-image.jpg">

    <!-- Favicon -->
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

    <!-- Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Interactive 3D World Globe",
        "url": "https://yourdomain.com",
        "description": "Explore the world in stunning 3D! Interactive globe with detailed country information, flags, and geography.",
        "applicationCategory": "Educational",
        "operatingSystem": "Web Browser",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        },
        "browserRequirements": "Requires WebGL support",
        "screenshot": "https://yourdomain.com/screenshot.jpg"
    }
    </script>
</head>
```

#### B. Create robots.txt
```
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /
```

#### C. Create sitemap.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://yourdomain.com/</loc>
        <lastmod>2025-10-12</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>
```

#### D. Add Accessibility Features
```html
<!-- Add to your HTML -->
<div id="container" role="main" aria-label="Interactive 3D world globe">
    <!-- Your canvas/WebGL content -->
</div>

<!-- Add alt text descriptions -->
<div id="sr-only" class="sr-only">
    Interactive 3D globe showing all countries of the world.
    Click and drag to rotate. Hover over countries to see their names and flags.
</div>
```

Add CSS for screen readers:
```css
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
}
```

### Phase 2: Content Optimization (Week 2-3)

#### A. Add Descriptive Content
Below your globe container, add SEO-rich content:

```html
<div style="display: none;" id="seo-content">
    <h1>Interactive 3D World Globe - Explore Geography</h1>
    <p>Welcome to the most immersive way to explore our planet! This interactive 3D world globe
    allows you to discover countries, view national flags, and learn about world geography in
    stunning detail.</p>

    <h2>Features</h2>
    <ul>
        <li>High-quality 3D rendering with WebGL technology</li>
        <li>Interactive rotation and zoom controls</li>
        <li>Detailed country information and flags</li>
        <li>Real-time sea level adjustment</li>
        <li>Smooth, performant experience on all devices</li>
    </ul>

    <h2>How to Use</h2>
    <p>Click and drag to rotate the globe. Hover over countries to see their names and flags.
    Use the controls to adjust visualization settings.</p>

    <h2>Educational Value</h2>
    <p>Perfect for students, teachers, geography enthusiasts, and anyone curious about our world.
    Learn country locations, explore geopolitical boundaries, and discover the beauty of Earth
    from space.</p>
</div>
```

Make it visible with better styling:
```css
#seo-content {
    display: block;
    max-width: 800px;
    margin: 40px auto;
    padding: 20px;
    color: #fff;
    background: rgba(0,0,0,0.7);
}
```

#### B. Add Loading Text
Replace generic "Loading..." with SEO-friendly content:

```html
<div id="loading">
    <h2>Loading Interactive 3D Globe...</h2>
    <p>Preparing your journey around the world</p>
</div>
```

### Phase 3: Performance Optimization (Week 3-4)

#### A. Optimize Assets
```bash
# Compress world.glb further if possible
# Already at 5.2MB - check if you can reduce to <3MB

# Minify HTML/CSS/JS in production
npm install -g html-minifier clean-css-cli terser

html-minifier --collapse-whitespace --remove-comments index.html -o index.min.html
```

#### B. Implement Lazy Loading
```javascript
// Load globe model only after page load
window.addEventListener('load', function() {
    loadGlobeModel();
});
```

#### C. Add Service Worker (PWA)
Create `sw.js`:
```javascript
const CACHE_NAME = 'globe-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/assets/world.glb'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
```

Register in index.html:
```javascript
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('Service Worker registered'));
}
```

### Phase 4: Link Building & Promotion (Week 4+)

#### A. Submit to Directories
1. **Product Hunt** - Launch as "Interactive 3D Globe"
2. **Hacker News** - Show HN post
3. **Reddit** - r/InternetIsBeautiful, r/dataisbeautiful, r/WebGL
4. **Designer News**
5. **GitHub** - Make repo public, add to awesome lists

#### B. Educational Outreach
1. Contact geography teachers/educators
2. Submit to educational resource directories
3. Reach out to geography/map enthusiast communities
4. Partner with geography education platforms

#### C. Social Media Strategy
1. **Twitter/X**: Share screenshots, country highlights
2. **Instagram**: Visual posts of interesting globe views
3. **TikTok**: Short videos showing cool interactions
4. **YouTube**: Tutorial video on features

#### D. Content Marketing
Create blog posts (host on subdomain or Medium):
1. "10 Surprising Things You Can Learn from an Interactive Globe"
2. "The Technology Behind Our 3D World Globe"
3. "Geography Made Fun: Interactive Learning Tools"
4. "WebGL Performance Optimization: Lessons from Building a 3D Globe"

### Phase 5: Technical SEO Monitoring (Ongoing)

#### A. Google Search Console
1. Verify your property
2. Submit sitemap
3. Request indexing
4. Monitor Core Web Vitals:
   - **LCP** (Largest Contentful Paint): <2.5s
   - **FID** (First Input Delay): <100ms
   - **CLS** (Cumulative Layout Shift): <0.1

#### B. Page Speed Optimization
Target scores:
- **Google PageSpeed**: >90/100
- **GTmetrix**: Grade A
- **WebPageTest**: Speed Index <3s

Actions:
```bash
# Enable compression in _headers
/*.glb
  Content-Encoding: gzip

/*.js
  Content-Encoding: br
```

#### C. Monitor Backlinks
Use tools:
- Ahrefs (paid)
- SEMrush (paid)
- Google Search Console (free)

### Phase 6: Advanced SEO (Month 2+)

#### A. Create Country-Specific Pages
Generate static pages for popular searches:
- `/country/united-states`
- `/country/china`
- `/country/india`

Each with:
- Country name in title
- Flag image
- Basic facts
- Link to main globe

#### B. International SEO
Add hreflang tags:
```html
<link rel="alternate" hreflang="en" href="https://yourdomain.com/" />
<link rel="alternate" hreflang="es" href="https://yourdomain.com/es/" />
<link rel="alternate" hreflang="fr" href="https://yourdomain.com/fr/" />
```

#### C. Rich Snippets
Implement additional schema types:
- BreadcrumbList
- FAQPage
- VideoObject (if you create tutorials)

---

## Checklist

### Pre-Deployment
- [ ] Test application locally
- [ ] Optimize assets (compress images, minify code)
- [ ] Create robots.txt
- [ ] Create sitemap.xml
- [ ] Add meta tags and structured data
- [ ] Create social media images (og-image.jpg, twitter-image.jpg)
- [ ] Create favicon files
- [ ] Set up _headers file
- [ ] Test on multiple browsers and devices

### Deployment
- [ ] Create Cloudflare Pages project
- [ ] Connect GitHub repository
- [ ] Configure build settings
- [ ] Deploy and test live site
- [ ] Set up custom domain (if applicable)
- [ ] Verify SSL certificate

### Analytics & Monetization
- [x] Install Analytics code — `js/features/analytics.js` (Consent Mode v2, deferred, prod-gated)
- [x] Install AdSense code — static loader tag in `index.html <head>`; units in
      `js/features/ads/adsense.js` + `ad-rail.js`; `ads.txt`, `privacy/`
- [x] Set up custom events — quiz_start / quiz_complete / country_select / daily_complete / share
- [x] Create Google Analytics property → paste `GA_MEASUREMENT_ID` in `js/data/site-config.js`
- [x] Apply for Google AdSense (needs the live site to have content — the landing pages)
- [x] Paste `ADSENSE_CLIENT_ID` in `site-config.js` + `index.html`, pub id in `ads.txt`
- [ ] Create the two ad units → paste `ADSENSE_RAIL_SLOT` + `ADSENSE_LANDING_SLOT` in `site-config.js`
      (no unit mounts until these exist — see §3 Step 3)
- [ ] Confirm ads.txt validates in the AdSense console (Google recrawls on its own schedule)
- [ ] Enable Google CMP (Privacy & messaging) + set Auto Ads → Anchor-only
- [ ] After approval: fix the EEA consent/loader ordering caveat in §3 Step 5
- [ ] Test ad placements (off-canvas) and monitor performance impact

### SEO
- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Verify site ownership in search consoles
- [ ] Request indexing
- [ ] Share on social media
- [ ] Submit to directories
- [ ] Create backlinks
- [ ] Monitor rankings and traffic

### Ongoing Maintenance
- [ ] Weekly: Check Analytics for traffic patterns
- [ ] Weekly: Monitor AdSense revenue
- [ ] Monthly: Review search console performance
- [ ] Monthly: Check and fix broken links
- [ ] Monthly: Update content if needed
- [ ] Quarterly: Audit SEO performance
- [ ] Quarterly: Review and optimize ads

---

## Expected Timeline

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **Week 1** | Initial Setup | Cloudflare deployment, basic SEO |
| **Week 2** | Analytics | GA4 + AdSense integration |
| **Week 3** | Content | SEO content, meta tags, structured data |
| **Week 4** | Optimization | Performance tuning, PWA features |
| **Month 2** | Promotion | Link building, social media |
| **Month 3+** | Growth | Advanced SEO, content marketing |

---

## Key Metrics to Track

### Traffic Goals
- **Month 1**: 1,000 visitors
- **Month 3**: 10,000 visitors
- **Month 6**: 50,000 visitors
- **Year 1**: 200,000+ visitors

### SEO Goals
- **Week 1**: Site indexed by Google
- **Month 1**: Ranking for brand name
- **Month 3**: Ranking for "interactive 3D globe" (page 5)
- **Month 6**: Ranking for "interactive 3D globe" (page 1)
- **Year 1**: Ranking for "world map", "3D earth" (page 1-3)

### Revenue Goals (AdSense)
- **Month 1**: $10-50
- **Month 3**: $100-300
- **Month 6**: $500-1,500
- **Year 1**: $2,000-10,000

---

## Support & Resources

### Cloudflare Resources
- [Pages Documentation](https://developers.cloudflare.com/pages/)
- [Community Forum](https://community.cloudflare.com/)
- [Status Page](https://www.cloudflarestatus.com/)

### Google Resources
- [AdSense Help](https://support.google.com/adsense/)
- [Analytics Help](https://support.google.com/analytics/)
- [Search Console](https://search.google.com/search-console/)

### SEO Tools
- [Google PageSpeed Insights](https://pagespeed.web.dev/)
- [GTmetrix](https://gtmetrix.com/)
- [Ahrefs Free Tools](https://ahrefs.com/free-seo-tools)
- [SEMrush Site Audit](https://www.semrush.com/)

---

## 6. Frontend Hosting: Cloudflare Pages + R2 + Access

The current production frontend split. **Pages** serves the app shell (`index.html`, `js/`,
`styles.css`, the small root JSON); **R2** serves the baked binary/geo assets at
`assets.terragotcha.com` (because `planet-z9.pmtiles` ~1.5 GB and `world-mesh.bin` ~31 MB
exceed Pages' **25 MiB/file** limit); **Cloudflare Access** gates the site during development;
the **API** stays at `api.terragotcha.com` on the VPS. The frontend points at R2 and the API
via `window.GLOBE3D_ASSET_BASE` / `window.GLOBE3D_API_BASE`, set in `index.html` and guarded
to `*.terragotcha.com` (local/LAN dev keeps relative `./assets` + the dev API server).

> Asset keys live at the **bucket root** (e.g. `world-mesh.bin`), not under an `assets/`
> prefix — `ASSET_BASE` is already `https://assets.terragotcha.com`.

**Prerequs:** local `assets/` populated (incl. the gitignored 1.5 GB pmtiles); `rclone`
installed; an R2-enabled Cloudflare account (free tier: 10 GB, zero egress).

### 6.1 Create the R2 bucket
Dashboard → **R2** → *Create bucket* → name **`terragotcha-assets`**, location Automatic.

### 6.2 Create an R2 API token (for upload)
R2 → **Manage R2 API Tokens** → *Create* → **Object Read & Write**, scoped to the bucket.
Save the **Access Key ID**, **Secret**, and **Endpoint**
`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 6.3 Upload `assets/` to the bucket root
`~/.config/rclone/rclone.conf`:
```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET_ACCESS_KEY>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
acl = private
```
The upload is **two passes**, and they must not be merged — see the warning below.

```bash
# From the repo root.
# Pass 1 — the pmtiles tileset (and anything else), stored verbatim.
rclone copy ./assets r2:terragotcha-assets --progress \
  --exclude "*.bin" --exclude "country-meta.json" --exclude "capitals.json" \
  --header-upload "Cache-Control: public, max-age=86400"

# Pass 2 — the six globe assets, pre-compressed. Object keys are unchanged
# (world-mesh.bin, NOT world-mesh.bin.br), so nothing in js/ needs editing.
npm run build:assets                       # writes dist-assets/, ~2 min
rclone copy ./dist-assets r2:terragotcha-assets --progress \
  --header-upload "Cache-Control: public, max-age=86400" \
  --header-upload "Content-Encoding: br"

rclone ls r2:terragotcha-assets   # verify keys are at the root (no assets/ prefix)
```

> **Never put `Content-Encoding` on the pmtiles.** `planet-z9.pmtiles` is read by
> **HTTP Range request** — that is the whole point of the format, and §6.7 verifies it with a
> `206`. A ranged read of an object declared `Content-Encoding: br` returns a slice of the
> *compressed* stream, which the client cannot decode: the map would break completely while
> every check that only looks at status codes still passed. Hence the two passes. The globe's
> `.bin` files are fetched whole, never ranged, which is what makes compressing them safe.

**Why pre-compress at all:** `_headers`' note that "compression is applied automatically by the
platform" is true, but `_headers` governs **Pages**, not R2. The edge does not compress
`application/octet-stream`, and nothing here set `Content-Encoding`, so visitors were pulling
**51 MB raw where 12.3 MB would do** — brotli -11 takes `world-mesh.bin` alone from 31.6 MB to
11.7 MB. R2 stores bytes verbatim and returns whatever metadata was set on them, and browsers
decompress transparently, so this is purely an upload-side change.

**Caching — why `max-age=86400` and not `immutable`:** these assets are **not** regenerated
by a deploy — `npm run build:pages` only stages the shell and excludes `assets/`. They change
only when you deliberately re-run `npm run build:globe` / `build:geo-data` or re-extract the
pmtiles (rare), and 8 of the 9 files are git-tracked artifacts. But the filenames are **fixed**
(no content hash) and the app doesn't cache-bust the binaries, so `immutable` would pin stale
bytes the day you do rebuild. A 1-day max-age + R2's **ETag revalidation** gives near-immutable
performance (unchanged files cost a cheap `304`, never re-downloading the 1.5 GB) while letting
a rebuild propagate. **Operational rule:** when you re-upload rebuilt assets, **purge the
Cloudflare cache** for `assets.terragotcha.com` (Caching → Purge, or scoped to changed files).

### 6.4 Public custom domain
R2 → bucket → **Settings → Public access → Custom Domains** → *Connect* → `assets.terragotcha.com`
(Cloudflare auto-creates the proxied record). Leave the `r2.dev` URL disabled.

### 6.5 CORS policy
R2 → bucket → **Settings → CORS Policy**:
```json
[
  {
    "AllowedOrigins": ["https://terragotcha.com", "https://www.terragotcha.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "If-Match", "If-None-Match"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "ETag", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

### 6.6 Deploy the Pages shell
**Git (recommended):** Workers & Pages → *Create* → **Pages** → connect the repo → preset
**None**, build command `npm run build:pages`, output dir `dist` → deploy. Then **Custom
domains** → add `terragotcha.com` + `www.terragotcha.com`.
**Direct:** `npm run build:pages && npx wrangler pages deploy dist --project-name terragotcha`.

> **If the build fails with “Asset too large … `node_modules/.../workerd` (119 MiB)”:** the
> project is publishing the **repo root** (which contains `node_modules` after `npm install`),
> not the staged shell. Fix in the project's **Build configuration**: build command
> `npm run build:pages`, **Build output directory `dist`**, then redeploy. `dist/` contains only
> the allow-listed shell — no `node_modules`, no `assets/`, nothing over 25 MiB.

### 6.7 Cloudflare Access (development gate)
**Zero Trust** → **Access → Applications → Add → Self-hosted**. Domain `terragotcha.com`
(+ `www`); Identity **One-time PIN**; Policy **Allow → Emails →** your address(es). Visiting
the site now requires an emailed PIN. **To launch: delete this application.** Do **not** add
`api.` or `assets.` to Access — gating them breaks the app's cross-origin fetches.

> ⚠️ **The site is publicly reachable until this application exists.** Pages serves the app
> the moment DNS is live, with no gate by default. Confirm the gate by loading the domain in a
> private window — you should get the one-time-PIN login, **not** the globe.

### 6.8 DNS cleanup
Delete the Porkbun parking leftovers (apex `A` records, the `*` and `www` CNAMEs). **Keep**
`api` A (VPS), both `MX`, and the SPF `TXT`.

### 6.9 Verify
```bash
curl -I https://assets.terragotcha.com/world-mesh.bin                              # 200
curl -r 0-1023 -s -o /dev/null -w "%{http_code}\n" https://assets.terragotcha.com/planet-z9.pmtiles   # 206
curl -H "Origin: https://terragotcha.com" -I https://assets.terragotcha.com/country-meta.json | grep -i access-control-allow-origin
```
Then in a browser: `terragotcha.com` → Access login → globe loads (mesh from R2), 2D map
renders (pmtiles range requests), a daily-quiz round works against `api.terragotcha.com`,
console clean of CORS/4xx.

### 6.10 Troubleshooting & lessons learned
Failure modes actually hit during the first deploy — symptom → cause → fix.

**Globe fails with `JSON.parse: unexpected character at line 1 column 1`; assets `302`-redirect
to `…l.ink` / a parking page.** A leftover **`*.terragotcha.com` wildcard CNAME → Porkbun
parking** (`uixie.porkbun.com`) shadows any subdomain without its own record, so `assets.`
(and `api.`) resolve to parking and return HTML, which the asset loader can't parse. *Fix:*
delete the wildcard and every Porkbun parking record (apex `A`s, `www`/`*` CNAMEs); keep `api`,
`MX`, SPF. Confirm: `dig +short assets.terragotcha.com` → Cloudflare IPs, **not**
`uixie.porkbun.com`.

**CORS works from a hash preview but not the bare project alias.**
`https://*.globe3d-3s7.pages.dev` matches `<hash>.globe3d-3s7.pages.dev` but **not** the bare
`globe3d-3s7.pages.dev` — the `*` needs a label to match. *Fix:* put **both** in the R2 CORS
`AllowedOrigins`. (Production `terragotcha.com`/`www` are unaffected.)

**Only the JSON assets 404 (binaries load fine).** A `--include "*.bin"` upload skips all JSON,
and even `--include "*.json"` misses **`countries.geojson`** (different extension). *Fix:*
upload with **no filter** — `rclone copy ./assets r2:terragotcha-assets` — so every key lands.
Verify each expected key returns `200`.

**"Still broken / still parked" after the DNS is already correct.** Your OS and browser DNS
caches still hold the old answer. *Fix:* `sudo resolvectl flush-caches` and **fully restart the
browser**. Check the real state, not your cache: `dig @1.1.1.1 +short <host>` (authoritative),
and bypass DNS entirely by forcing the Cloudflare edge IP —
`curl -I --resolve <host>:443:104.21.55.211 https://<host>/<key>` — to test the actual R2/Pages
config regardless of local caching.

**Asset keys live at the bucket root** (e.g. `world-mesh.bin`), never under an `assets/` prefix
— `ASSET_BASE` is already `https://assets.terragotcha.com` (see §6.3).

---

## Conclusion

This deployment strategy leverages Cloudflare Pages' unlimited bandwidth to eliminate scaling costs, while Google AdSense provides revenue potential. With proper SEO implementation, your 3D globe can rank highly for geography, educational, and interactive map searches.

**Estimated Total Cost (Year 1)**: $10-20/month (domain + optional CF paid tier)
**Estimated Revenue Potential (Year 1)**: $2,000-$10,000 (if traffic goals met)
**Net Outcome**: Profitable after 3-6 months

The key to success is consistent content marketing, link building, and maintaining excellent user experience with your interactive WebGL globe.

Good luck with your deployment!
