# Terragotcha — Social & Favicon Assets

Drop these into your app (e.g. a `public/` or `static/assets/` folder) and add the tags below to your HTML `<head>`. Adjust the `href`/`content` paths to wherever you serve them.

## Files
- `og-image.png` — Open Graph / Twitter share image, 1200×630
- `favicon-16.png`, `favicon-32.png` — browser tab icons
- `favicon-180.png` — Apple touch icon (home-screen)
- `favicon-512.png` — high-res / PWA / app icon

## Head tags
```html
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">

<meta property="og:title" content="Terragotcha">
<meta property="og:description" content="Learn geography through quizzes">
<meta property="og:image" content="https://yourdomain.com/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

Notes
- `og:image` should be an absolute URL (most scrapers require it) — replace `yourdomain.com`.
- For a `favicon.ico`, you can convert `favicon-32.png` if you need legacy support, but the PNG `<link rel="icon">` tags above cover all modern browsers.
- Brand: navy `#0a1c30`, amber `#f59e4b`. The mark is a lightbulb with a globe filament; the og:image uses the Fredoka wordmark.
