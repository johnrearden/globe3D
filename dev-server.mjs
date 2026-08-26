#!/usr/bin/env node
/**
 * dev-server.mjs — one local origin for both apps, the way production serves them.
 *
 * THE PROBLEM IT SOLVES: in production a single Cloudflare Pages project serves
 * the vanilla globe at `/` and the Astro country pages at `/country/*`, so the
 * landing panel's `<a href="/country/france/">` links just work. Locally they
 * were two servers on two ports — the repo root on 8011 and `astro dev` on
 * 4321 — so every one of those links 404'd, and the apex looked broken in
 * exactly the way it is not.
 *
 * This serves the repo root statically and proxies the Astro routes to the dev
 * server, so `http://localhost:8011/` and `http://localhost:8011/country/france/`
 * both work from one origin. That also keeps local behaviour honest about
 * origin-sensitive things — relative asset paths, same-origin fetches, the
 * app-owned pushState navigation — which is the class of bug that produced the
 * R2 CORS surprise.
 *
 * Usage:
 *   npm run dev            # both servers, one terminal, http://localhost:8011
 *   npm run dev -- --solo  # just this one; bring your own `npm run dev:web`
 *
 * By default it starts Astro itself, because the two-terminal version has one
 * obvious failure mode: forget the second terminal and every /country link 404s,
 * which looks like a bug in the site rather than a missing process.
 *
 * `astro dev` is a MANAGED DAEMON, not a foreground process — it forks, prints a
 * pid, and outlives whatever launched it (`astro dev status` / `astro dev stop`
 * are its controls; CLAUDE.md's stale-Vite-cache recipe uses them). So this does
 * not try to own its lifetime: it starts one if none is up, reuses one if it is,
 * waits for it to answer before reporting ready, and leaves it running on exit.
 * `--port` is passed explicitly so ASTRO_PORT actually governs both ends —
 * without it Astro takes its own default and the proxy points at nothing.
 *
 * The country pages stay optional: if Astro is not running and cannot be
 * started, the globe still works and `/country/*` returns a 502 that says what
 * to do, rather than a bare connection error.
 */
import { createServer, request as httpRequest, get as httpGet } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8011);
const ASTRO = { host: '127.0.0.1', port: Number(process.env.ASTRO_PORT || 4321) };

// Paths Astro/Vite owns outright. Checked BEFORE the filesystem, because some of
// them (`/node_modules/...`) also exist on disk — and serving Vite's raw source
// instead of its transformed module is a confusing failure.
//
// The trailing slash on `/country/` is load-bearing: `/country` alone also matches
// `/country-pages.json`, `/country-colors.json` and `/country-zoom.json`, which are
// repo-root files the globe fetches. Swallowing the first of those silently
// disables every "Read more" article link in the app.
export const ASTRO_PREFIXES = ['/country/', '/_astro/', '/@', '/src/', '/node_modules/.vite/'];

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.bin': 'application/octet-stream', '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

export const isAstroPath = (p) => ASTRO_PREFIXES.some((pre) => p === pre || p.startsWith(pre));

/** Resolve a URL path to a file on disk, or null. Directories map to index.html. */
function resolveLocal(pathname) {
    // normalize() collapses `..`, and the prefix check then keeps the result
    // inside ROOT — a path-traversal guard, not a tidiness measure.
    const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) return null;
    try {
        if (statSync(file).isDirectory()) file = join(file, 'index.html');
        return statSync(file).isFile() ? file : null;
    } catch {
        return null;
    }
}

function proxy(req, res, pathname) {
    const upstream = httpRequest(
        { ...ASTRO, method: req.method, path: req.url, headers: { ...req.headers, host: `${ASTRO.host}:${ASTRO.port}` } },
        (up) => {
            res.writeHead(up.statusCode || 502, up.headers);
            up.pipe(res);
        },
    );
    upstream.on('error', () => {
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<h1>502 — no Astro dev server</h1>
<p><code>${pathname}</code> is served by <code>apps/web</code>, and nothing is
listening on port ${ASTRO.port}.</p>
<pre>npm run dev:web</pre>
<p>The globe at <a href="/">/</a> does not need it.</p>`);
    });
    req.pipe(upstream);
}

const server = createServer((req, res) => {
    const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

    if (isAstroPath(pathname)) return proxy(req, res, pathname);

    const file = resolveLocal(pathname);
    if (file) {
        res.writeHead(200, {
            'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
            // No caching: a dev server that serves a stale bundle costs more time
            // than it saves.
            'cache-control': 'no-store',
        });
        return createReadStream(file).pipe(res);
    }

    // Unknown path: Astro may still own it (a route we have not listed).
    proxy(req, res, pathname);
});

// Vite's HMR socket. Without this the country pages work but never hot-reload,
// and the console fills with reconnection failures.
server.on('upgrade', (req, socket, head) => {
    const up = httpRequest({ ...ASTRO, path: req.url, headers: req.headers });
    up.on('upgrade', (upRes, upSocket, upHead) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n`
            + Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')
            + '\r\n\r\n');
        if (upHead?.length) upSocket.unshift(upHead);
        upSocket.pipe(socket).pipe(upSocket);
    });
    up.on('error', () => socket.destroy());
    if (head?.length) req.unshift?.(head);
    up.end();
});

/** Is something already serving the Astro port? */
function astroIsUp() {
    return new Promise((resolve) => {
        const req = httpGet({ ...ASTRO, path: '/', timeout: 700 }, (res) => {
            res.resume();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

/**
 * Start the Astro dev daemon on our port and wait until it answers.
 *
 * Waiting matters: `astro dev` returns as soon as the daemon is forked, well
 * before it serves anything, so announcing readiness immediately means the first
 * /country request 502s for no visible reason.
 *
 * @returns {Promise<boolean>} whether it came up
 */
async function startAstro() {
    const child = spawn('npm', ['--workspace', '@terragotcha/web', 'run', 'dev', '--',
                                '--port', String(ASTRO.port)], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const errors = [];
    child.stderr.on('data', (c) => errors.push(String(c)));
    child.stdout.resume();

    for (let i = 0; i < 60; i++) {
        if (await astroIsUp()) return true;
        if (child.exitCode !== null && !(await astroIsUp())) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    if (errors.length) console.error(errors.join('').trim().split('\n').slice(-4).join('\n'));
    return false;
}

async function main() {
    const solo = process.argv.includes('--solo');

    let web = solo ? 'not started (--solo)' : null;
    if (!solo) {
        if (await astroIsUp()) {
            web = `reused (already running on :${ASTRO.port})`;
        } else {
            process.stdout.write(`dev-server — starting astro dev on :${ASTRO.port}… `);
            const ok = await startAstro();
            process.stdout.write(ok ? 'ready\n' : 'FAILED\n');
            web = ok ? `started — stop it with: npx astro dev stop` : 'unavailable — /country/* will 502';
        }
    }

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\ndev-server — port ${PORT} is already in use.\n\n`
                + `Something else is serving it — most likely a leftover\n`
                + `  python3 -m http.server ${PORT}\n`
                + `from the old two-server setup. Stop that, or run this on another port:\n`
                + `  PORT=8012 npm run dev\n`);
            process.exit(1);
        }
        throw err;
    });

    server.listen(PORT, () => {
        console.log(`\ndev-server — http://localhost:${PORT}`);
        console.log(`  /            → ${ROOT} (the vanilla globe)`);
        console.log(`  /country/*   → astro dev on :${ASTRO.port}`);
        console.log(`  ${web}`);
    });
}

// Importable for tests without binding a port or spawning anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
