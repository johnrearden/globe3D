# Temporary Deployment to rojosample.net/globe

A short, practical guide for putting the Globe3D static site behind a
simple HTTP Basic Auth password gate at `https://rojosample.net/globe/`
on the existing `rojosample.net` server. The host already has nginx,
a valid Let's Encrypt cert, and several other apps under sibling
sub-paths (`/forum`, `/expenses`, `/tirlan-tracker`, …). The plan is
to add a single `location /globe/` block to the existing server block.
Intended for a short-lived preview — there's a tear-down section at
the bottom.

## What gets deployed

Globe3D is a fully static site. The runtime bundle is:

| Path                        | Size       | Required |
|-----------------------------|------------|----------|
| `index.html`                | ~125 KB    | ✓        |
| `styles.css`                | ~55 KB     | ✓        |
| `js/**`                     | ~200 KB    | ✓        |
| `assets/world-mesh.bin`     | ~31 MB     | ✓        |
| `assets/world-id.bin`       | ~16 MB     | ✓ (picking) |
| `assets/country-palette.bin`| 1 KB       | ✓        |
| `assets/country-meta.json`  | ~76 KB     | ✓        |
| `label-config.json`         | ~18 KB     | optional (auto-loaded if present) |
| `country-colors.json`       | ~3 KB      | optional (auto-loaded if present) |

Do **not** upload: `node_modules/`, `build-textures.js`, `*.md`,
`test-load.html`, `wave_effect.html`, `script1.js`, `package*.json`,
`.git/`, `docs/`. They aren't needed at runtime.

Total payload is ~47 MB, dominated by the two `.bin` files. The build
output (`npm run build:globe`) regenerates `assets/*.bin` + `assets/country-meta.json`
from the GeoJSON inputs — run it once locally before deploying if those
files are stale or missing.

**Path safety:** all of index.html's CSS/JS includes and all asset
`fetch()` calls (`assets/world-id.bin`, `assets/world-mesh.bin`, etc.,
in `js/core/globe.js`) use *relative* paths with no leading slash, so
they resolve correctly under any sub-path. No source changes are
required to host at `/globe/`.

## 1. Create the password file

`htpasswd` lives in `apache2-utils` and isn't installed on this server
by default — grab it first:

```bash
sudo apt install apache2-utils
```

Pick a username (e.g. `preview`) and generate the hash:

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-globe preview
```

`htpasswd` prompts twice for the password. `-c` creates the file;
omit it when adding more users later.

Lock it down:

```bash
sudo chown root:www-data /etc/nginx/.htpasswd-globe
sudo chmod 640 /etc/nginx/.htpasswd-globe
```

## 2. Create the content directory

Keeping the static content in its own directory (separate from
`/var/www/rojosample/html`, which is the proxy fallback root) makes
the tear-down clean:

```bash
sudo mkdir -p /var/www/globe3d
sudo chown -R "$USER:www-data" /var/www/globe3d
sudo chmod 750 /var/www/globe3d
```

Owning the directory as your shell user lets the rsync step (next)
work without sudo every time.

## 3. Add the location block

Edit `/etc/nginx/sites-available/rojosample` and add the block below
*inside the existing `server { … }`*, alongside the other `location`
blocks. (You can put it just before the certbot-managed `listen 443`
lines; ordering between `location` blocks doesn't matter, nginx
matches on prefix specificity.)

```nginx
    # Globe3D static preview — temporary, password-gated.
    location /globe/ {
        alias /var/www/globe3d/;
        index index.html;
        try_files $uri $uri/ =404;

        auth_basic           "Globe3D preview";
        auth_basic_user_file /etc/nginx/.htpasswd-globe;

        # The .bin assets are large and unchanging — let the browser
        # cache them for the duration of the preview.
        location ~* \.(bin|json)$ {
            auth_basic           "Globe3D preview";
            auth_basic_user_file /etc/nginx/.htpasswd-globe;
            expires 7d;
            add_header Cache-Control "public, max-age=604800";
        }

        # gzip text assets. .bin files are already binary-packed and
        # don't compress well, but world-id.bin does (it's mostly
        # constant runs of country IDs).
        gzip on;
        gzip_types text/css application/javascript application/json application/octet-stream;
        gzip_min_length 1024;
    }

    # Redirect /globe (no trailing slash) to /globe/ so the alias
    # rules and relative URLs in index.html resolve correctly.
    location = /globe {
        return 301 /globe/;
    }
```

Notes:

- **`alias` vs `root`**: `alias` strips the `/globe/` prefix from the
  URI before file lookup, so a request for `/globe/index.html` reads
  `/var/www/globe3d/index.html`. Don't switch to `root` here unless
  you also rename the content directory to literally end in `/globe`.
- **Nested basic-auth**: the inner `location ~* \.(bin|json)$` block
  re-declares `auth_basic` because nginx doesn't inherit auth across
  nested locations. Without those two lines the heavy assets would be
  publicly fetchable, defeating the gate.
- **No new `listen` directives** are needed — the existing block
  already listens on 80 + 443 and has the cert wired up.
- The site's other apps (`/`, `/forum`, `/expenses`, `/tirlan-tracker`)
  are unaffected because nginx selects the most specific matching
  `location`.

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` should succeed before you reload — if it fails, fix the
syntax before reloading; a bad reload won't take effect but a typo in
a sibling block left unfixed will haunt the next reload.

## 4. Upload the bundle

From your local checkout (`/home/john/dev/personal/globe3D` on this
machine):

```bash
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='*.md' \
  --exclude='package*.json' \
  --exclude='build-textures.js' \
  --exclude='test-load.html' \
  --exclude='wave_effect.html' \
  --exclude='script1.js' \
  --exclude='docs/' \
  --exclude='.claude/' \
  ./ "rojo@rojosample.net:/var/www/globe3d/"
```

`--delete` keeps the remote in sync — removed local files vanish
remotely on subsequent runs. Drop the flag if you don't want that.

If `assets/*.bin` haven't been built yet, run `npm run build:globe`
locally first.

## 5. Smoke test

```bash
# Should 401 without credentials
curl -I https://rojosample.net/globe/

# Should 200 with credentials
curl -I -u preview:YOURPASS https://rojosample.net/globe/

# Heavy asset — also gated
curl -I -u preview:YOURPASS https://rojosample.net/globe/assets/world-mesh.bin

# /globe → /globe/ redirect
curl -I https://rojosample.net/globe   # expect 301 Location: /globe/

# Confirm the other apps still work (sanity check)
curl -I https://rojosample.net/expenses
curl -I https://rojosample.net/tirlan-tracker/
```

In a browser, log in once at `https://rojosample.net/globe/`. Confirm:

- Globe loads (the loading bar advances past 95% to "Complete")
- Country click highlights and tooltips work
- Quizzes start (Take Quiz → mode selector → questions)
- Animations fire as expected at quiz completion (bounce / pinball /
  shatter depending on score)

## Hardening before sharing

- The mobile-only dev buttons (`#bounce-btn`, `#shatter-btn`,
  `#pinball-btn`) and the `#dev-edit-toggle` are visible to anyone
  with the preview password. Either hide them in `styles.css` for
  the preview or remove the buttons from `index.html` before
  deploying.
- Confirm the HTTPS → HTTPS-only behaviour you expect: the existing
  server block listens on both 80 and 443. Basic-auth credentials sent
  over plain HTTP are recoverable — if you don't already redirect 80
  to 443 globally, share the `https://` URL only.

## Tear-down

When the preview is done:

1. Edit `/etc/nginx/sites-available/rojosample` and delete the two
   `location` blocks you added (`/globe/` and `= /globe`).
2. Reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Delete the content and password file:
   ```bash
   sudo rm -rf /var/www/globe3d
   sudo rm /etc/nginx/.htpasswd-globe
   ```

Nothing else needs to be touched — the cert, the other apps, and the
default proxy remain exactly as they were.
