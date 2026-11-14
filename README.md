# Password Forge

**Forge. Encrypt. Protect.**

A premium, local-first cryptography workstation built with React, Vite and the Web Crypto API. Eleven independent
workspaces let you generate passwords, inspect their weaknesses, encrypt text and files, hash and verify data,
create key material, audit a set of credentials and keep an encrypted vault — all inside the browser tab.

There is no backend, no account system, no cloud database, no paid API and no telemetry. The build is a set of
static files that can be served from GitHub Pages.

---

## Quick start

```bash
npm install      # install dependencies (lockfile is committed)
npm run dev      # http://localhost:5173
npm test         # Vitest: crypto, generation, analysis, vault
npm run build    # static production build in dist/
npm run preview  # serve the production build locally
```

Requires Node 20+.

## Deployment (GitHub Pages)

1. Push the repository to GitHub with `main` as the default branch.
2. In **Settings → Pages**, set *Source* to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs tests, builds the site and publishes `dist/`.

`vite.config.js` uses `base: './'` and the app uses `HashRouter`, so it works at a project path
(`user.github.io/repo/`), a user page, or a custom domain without server-side rewrites.

A restrictive Content Security Policy is injected into the built `index.html` (GitHub Pages cannot send
headers). It is build-only so the Vite dev server's React Fast Refresh keeps working. The policy allows
`'wasm-unsafe-eval'` for the Argon2id WebAssembly module and one external `connect-src`:

```
script-src 'self' 'wasm-unsafe-eval'
connect-src 'self' https://api.pwnedpasswords.com
```

### Installable web app (PWA)

Password Forge can be installed to the desktop, an Android home screen or an iOS home screen, launching in
its own window and working offline after the first visit.

* `public/manifest.webmanifest` declares the name, colours, standalone display, icons and three shortcuts
  (Forge, Encrypt, Vault). `start_url`/`scope` are relative, so the same file works at a GitHub Pages
  subpath.
* Icons are generated from `scripts/generate-icons.py` (Pillow) into `public/icons/`: 192 px, 512 px, a
  maskable 512 px and an Apple touch icon. Regenerate with `python3 scripts/generate-icons.py`.
* `pwa/sw.js` is a build template. `vite.config.js` injects a unique build id and the exact list of hashed
  assets into it, then emits `dist/sw.js`.
* Registration lives in `src/lib/pwa.js` and runs only in production builds, so the dev server is never
  cached. `initPwa()` also captures `beforeinstallprompt` for the Install button in Settings.

Caching rules are deliberately narrow: same-origin `GET` requests only, navigations are network-first with a
cached `index.html` fallback, and static assets are cache-first. Vault data lives in IndexedDB and is never
placed in the Cache Storage API; the optional breach-check request is cross-origin and explicitly bypassed.
A new deployment installs a new worker (new cache name) and deletes the previous caches on activation.

## Workspaces

| Route | Workspace | What it does |
| --- | --- | --- |
| `/` | Dashboard | Local system status, shortcuts, operating principles |
| `/forge` | Password Forge | CSPRNG passwords (8–128 chars, bulk 50) and passphrases |
| `/inspector` | Password Inspector | Length, diversity, repeats, sequences, dictionary patterns, entropy, opt-in breach check |
| `/encrypt` | Encryption Lab | AES-256-GCM text/file encryption with PBKDF2-SHA-256 and optional AAD |
| `/decrypt` | Decryption Lab | Validates, authenticates and decrypts Password Forge payloads |
| `/hash` | Hash Laboratory | SHA-256/384/512, HMAC-SHA-256, verification, Argon2id demonstration |
| `/keys` | Key Forge | Hex, base64, base64url, raw bytes, AES-256 and ECDSA P-256 key material |
| `/audit` | Security Audit | Session-only review of reuse, length, diversity and weak patterns |
| `/vault` | Encrypted Vault | Master-passphrase vault with encrypted records, auto-lock and encrypted backups |
| `/academy` | Security Academy | Ten plain-language topics on the primitives in use |
| `/settings` | Settings | KDF cost, benchmarking, auto-lock, clipboard behaviour, data removal |
| `/privacy` | Privacy & data flow | Exactly what stays local and what the optional request does |

## Architecture

```
src/
  lib/                 Pure, framework-free cryptography and domain logic
    bytes.js           base64/hex/UTF-8 helpers, downloads
    random.js          crypto.getRandomValues + rejection sampling (no modulo bias)
    passwords.js       Password/passphrase generation, pool construction
    wordlist.js        Bundled 500-word passphrase list (offline)
    crypto.js          Versioned AES-256-GCM envelope, PBKDF2, validation
    analysis.js        Local password heuristics and explanations
    breach.js          Optional k-anonymity breach lookup (opt-in only)
    hash.js            SHA-2, HMAC, Argon2id (lazy hash-wasm), verification
    keys.js            Random material and SubtleCrypto key generation
    vault.js           IndexedDB storage + record encryption
    settings.js        Non-sensitive preferences (localStorage)
    clipboard.js       Copy with best-effort clear
  components/          Layout, design-system primitives, toast, settings context
  pages/               One component per workspace
  navigation.js        Workspace metadata and route structure
```

Each library module is independent of React and is unit-tested directly. Pages never implement cryptography
inline; they call the library and render results. No component is a monolith.

### Design system

Tailwind tokens in `tailwind.config.js`: background `#111216`, surface `#1D2026`, elevated `#292C33`, muted gold
`#C5A36B`, primary text `#EAE7DF`, secondary text `#9699A3`, restrained danger/success tones. Display headings use
a serif stack; data uses a monospace stack. No external fonts, icon CDNs or images are loaded — Lucide icons are
bundled.

Layout: a collapsible sidebar on desktop (state remembered locally), a compact sticky header with a slide-over
navigation on mobile, and touch-friendly controls (44px minimum targets for primary actions).

## Cryptographic design

### Encrypted envelope (format v1)

```json
{
  "format": "password-forge-encrypted",
  "version": 1,
  "algorithm": "AES-256-GCM",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64, 16 bytes>" },
  "iv": "<base64, 12 bytes>",
  "meta": { "kind": "text | file | vault-backup", "filename": "", "mime": "", "createdAt": "ISO-8601", "aad": false },
  "ciphertext": "<base64, includes 128-bit GCM tag>"
}
```

* A fresh 16-byte salt and a fresh 96-bit IV are generated for **every** encryption, so an IV is never reused
  under the same key.
* The canonical header (format, version, algorithm, KDF parameters, salt, IV, metadata) is passed to AES-GCM as
  additional authenticated data together with any user-supplied AAD. Editing the header breaks authentication.
* Validation happens before key derivation: format identifier, version, algorithm, KDF name/hash, iteration
  bounds (100,000–3,000,000), salt length, exact IV length, ciphertext minimum size and metadata shape.
* Decryption output is returned only after the tag verifies. Wrong passphrase, wrong AAD and tampering all produce
  the same safe failure — no partial plaintext is ever returned.
* Passphrases, plaintext and derived keys are never persisted. Derived keys are non-extractable `CryptoKey`
  objects held in memory.

### Vault

* One IndexedDB database (`password-forge-vault`) with a `meta` store (salt, iterations, encrypted verifier) and a
  `records` store (id, base64 IV, base64 ciphertext, updatedAt).
* Records are AES-256-GCM ciphertext bound to their record id via AAD, so rows cannot be swapped undetected.
* The master key is derived on unlock, never stored, and dropped on manual lock or inactivity auto-lock; decrypted
  records are removed from React state at the same time.
* Backups are re-encrypted with a user-chosen backup passphrase using the same envelope format. Imports decrypt
  with the backup passphrase and re-encrypt with the current vault key.

### Password generation

`randomInt(max)` uses rejection sampling over `crypto.getRandomValues(new Uint32Array(1))`, so every value has
identical probability. Passwords guarantee one character from each enabled category (when the requested length
permits) and are shuffled with an unbiased Fisher–Yates pass. `Math.random` is not used in any security module —
a test asserts this statically.

## Testing

`npm test` runs Vitest in a Node environment with `fake-indexeddb` for vault persistence tests.

Covered:

* password length, category inclusion, exclusions, custom sets, bulk bounds, input validation
* unbiased sampling distribution and shuffle integrity
* encryption/decryption round trips (text and binary), AAD handling, unicode
* wrong passphrase, modified ciphertext, modified tag, modified header, swapped salt/IV
* salt/IV uniqueness and ciphertext non-determinism
* invalid imported metadata (version, algorithm, KDF, iterations, salt, IV, ciphertext, meta)
* SHA-2 published test vectors, RFC 4231 HMAC vector, hash verification/comparison
* Argon2id PHC generation and verification, random salt per hash
* vault create/unlock, wrong passphrase, missing vault, encrypted-at-rest inspection, tampered record detection,
  update/delete, encrypted backup export/import, full deletion
* analysis of common passwords, leetspeak, repeats, sequences, keyboard runs, years, short passwords, diversity

**Tests passing does not make an application secure.** They demonstrate that the specified behaviours work; they
do not prove the absence of flaws, side channels or browser-level attacks.

Mobile responsiveness was validated by building responsive layouts and a mobile drawer; automated viewport tests
are not included.

## Application security notes

* No `eval`, no `dangerouslySetInnerHTML`, no unsafe HTML rendering.
* No secrets in URLs, hash routes, page titles or browser history.
* File inputs are size-limited (2 MiB text / 10 MiB files for encryption, 25 MiB for hashing, 24 MiB envelopes).
* The only network request in the entire app is the opt-in breach check, which sends a 5-character SHA-1 hash
  prefix to `api.pwnedpasswords.com` and is disabled until the user explicitly consents.
* The service worker caches only first-party static files. It never sees vault records (IndexedDB), form
  values or clipboard content, and it ignores cross-origin requests entirely.
* Dependencies: React, React Router, Lucide (icons), hash-wasm (Argon2id), Tailwind (build-time). No analytics,
  no tracking, no auth service.

## Known limitations

* **Browser memory cannot be securely erased.** Clearing React state removes references; it cannot guarantee
  removal from the JS engine, swap or OS caches.
* **Clipboard.** Other applications can read copied secrets; auto-clear is best effort and clipboard history may
  retain values.
* **Device compromise.** Malware, malicious extensions and keyloggers defeat any in-browser protection.
* **No recovery.** Vault and encryption passphrases are never stored. Losing them loses the data.
* **PBKDF2, not Argon2id, for encryption.** Browser key derivation uses PBKDF2 because it is universally
  available in Web Crypto; Argon2id is demonstrated for password hashing only.
* **Vault scope.** Local to one browser profile; no sync, sharing, autofill integration or password-history UI.
  Imported backups are appended, not merged.
* **Breach checking** depends on a third-party service and its dataset. It reports nothing about credential
  reuse elsewhere, phishing or non-public breaches.
* **Argon2id in the browser** is educational; real authentication belongs on a server with rate limiting.
* **PWA updates** apply on the next online load after a deployment; an already-open tab keeps the old
  bundle until it is reloaded.
* **Offline mode** covers the application shell only. Data held in memory (inspections, plaintext, audit
  samples) is not restored offline because it is never persisted.
* **Heuristic strength scores** are pattern-based estimates, never guarantees.

## Privacy

See the in-app `/privacy` page for a field-by-field data-flow table. Short version: inputs, passphrases and keys
never leave the tab; the vault is ciphertext in IndexedDB; preferences are non-secret; there are no cookies or
analytics. The hosting provider (GitHub Pages) receives ordinary HTTP request data, as with any website.

## License

Released for personal and educational use. Review the code before trusting it with anything important.
