import { useState } from 'react';
import { ChevronDown, GraduationCap, Lightbulb, ShieldCheck } from 'lucide-react';
import { Badge, Notice, PageHeader, Panel, SectionTitle, cx } from '../components/ui.jsx';

const TOPICS = [
  {
    id: 'encryption-vs-hashing',
    title: 'Encryption versus hashing',
    summary: 'One is reversible with a key; the other is not reversible at all.',
    body: [
      'Encryption transforms readable data into ciphertext that can be turned back into the original with the right key. It is designed to be reversible, and the whole point is that only the key holder can undo it.',
      'Hashing is a one-way fingerprint. The same input always produces the same digest, but you cannot work backwards from a digest to the input. It is used to check integrity and, with special slow hashes, to store passwords.',
      'A practical consequence: never encrypt passwords with a key you keep on the server and never hash data you need to read later. Password storage needs slow hashing; protecting a note needs encryption.',
    ],
    example: [
      'Encryption: AES-256-GCM(plaintext, key) → ciphertext ⇄ decrypt',
      'Hashing:   SHA-256(bytes) → 64 hex characters, one-way',
      'Password storage: Argon2id(password, salt) → PHC string, verified by recomputing',
    ],
    takeaway: 'Use encryption for confidentiality and hashing for fingerprints and password verification.',
  },
  {
    id: 'aes-gcm',
    title: 'AES-GCM',
    summary: 'AES in Galois/Counter Mode: confidentiality plus tamper detection in one operation.',
    body: [
      'AES is a symmetric block cipher: the same key encrypts and decrypts. GCM turns it into an authenticated mode, producing ciphertext and a 128-bit authentication tag. If a single bit of ciphertext or authenticated metadata changes, decryption fails instead of returning corrupted data.',
      'GCM needs a unique 96-bit initialization vector (IV) for every encryption under the same key. Reusing an IV with the same key is catastrophic — it can expose relationships between plaintexts and allow forgery. This is why every operation here generates a fresh random IV.',
      'Additional authenticated data (AAD) is data that is authenticated but not encrypted. Password Forge feeds the entire non-secret envelope header, plus any user-supplied AAD, into the tag. That is what makes header tampering detectable.',
    ],
    example: [
      'Key: 256-bit, derived from a passphrase',
      'IV: 96-bit random, fresh per message',
      'Tag: 128-bit, verified before any plaintext is returned',
      'AAD: version, algorithm, KDF parameters, salt, IV, metadata',
    ],
    takeaway: 'GCM gives you confidentiality and integrity, but only if the IV is unique and the tag is checked.',
  },
  {
    id: 'pbkdf2',
    title: 'PBKDF2',
    summary: 'A deliberately slow key-derivation function built on HMAC.',
    body: [
      'Passphrases are not keys. They are low-entropy, human-chosen strings. PBKDF2 runs an HMAC construction hundreds of thousands of times with a random salt, so each guess costs an attacker real CPU time.',
      'The salt prevents precomputed tables and stops two users with the same passphrase from producing the same key. The iteration count is the cost knob: 600,000 PBKDF2-SHA-256 iterations is a reasonable 2026 default for interactive use, and you should measure it on your slowest device.',
      'PBKDF2 is old and GPU-friendly compared with modern memory-hard functions, but it is universally supported in browsers and FIPS-approved. For password storage prefer Argon2id; for deriving an encryption key in a browser, PBKDF2 remains a sound, widely reviewed choice.',
    ],
    example: [
      'PBKDF2-HMAC-SHA-256(passphrase, salt, 600000) → 256-bit AES key',
      'Salt: 16 random bytes, stored with the ciphertext',
      'Changing the iteration count changes the derived key — parameters must be stored',
    ],
    takeaway: 'PBKDF2 converts a passphrase into a key at a tunable cost. The cost is your defence against guessing.',
  },
  {
    id: 'argon2id',
    title: 'Argon2id',
    summary: 'The current recommendation for password storage: memory-hard and side-channel resistant.',
    body: [
      'Argon2id combines data-independent and data-dependent memory access. Attackers cannot cheaply parallelise it on GPUs because each guess requires a configurable amount of RAM, not just computation. The "id" variant is the recommended hybrid.',
      'Typical parameters are m=64 MiB, t=3 iterations, p=1 lane — the OWASP baseline used in the Hash Laboratory. The salt is random per password, and the output includes the parameters in a PHC string such as $argon2id$v=19$m=65536,t=3,p=1$…$…',
      'Hashing in the browser is useful for learning and for local demonstrations, but real authentication must happen on a server that owns the hashes, enforces rate limits and can upgrade parameters over time.',
    ],
    example: [
      'Argon2id(password, salt, m=65536 KiB, t=3, p=1) → 32-byte digest',
      'PHC string stores algorithm, version, parameters, salt and digest',
      'Verification re-runs the same parameters and compares in constant time',
    ],
    takeaway: 'Argon2id makes each password guess expensive in memory as well as time. Use it for storage, on the server.',
  },
  {
    id: 'hmac',
    title: 'HMAC',
    summary: 'A keyed hash that proves integrity and origin, not confidentiality.',
    body: [
      'HMAC combines a hash function with a secret key. Anyone with the key can produce the tag; anyone without it cannot forge one. It is used for API request signing, webhook verification, session tokens and message authentication.',
      'HMAC-SHA-256 output is 32 bytes. Verifying a tag must compare in constant time to avoid leaking information through timing — this app uses a constant-time comparison for small digests.',
      'HMAC does not hide the message. If you need both secrecy and authenticity, encrypt first with an AEAD mode such as AES-GCM, which already authenticates.',
    ],
    example: [
      'HMAC-SHA-256(key, message) → 64 hex characters',
      'Compare tags in constant time, never with a short-circuiting loop',
      'Rotate keys carefully; old tags become unverifiable after rotation',
    ],
    takeaway: 'HMAC answers "did someone with the key vouch for these exact bytes?"',
  },
  {
    id: 'salts-ivs',
    title: 'Salts and IVs',
    summary: 'Both add randomness per operation — and both are usually public.',
    body: [
      'A salt is random data mixed into password hashing or key derivation so identical passphrases produce different keys. It defeats precomputed rainbow tables and prevents shared-key collisions between users. Salts do not need to be secret, only unique.',
      'An IV (initialization vector) or nonce makes each encryption under the same key unique. In AES-GCM the IV must never repeat with the same key. A 96-bit random IV has a negligible collision probability for realistic message counts, but the rule is absolute.',
      'Neither a salt nor an IV is a secret. They are stored alongside the ciphertext and authenticated as part of the header. Storing them in plaintext is normal and safe; reusing them is not.',
    ],
    example: [
      'Salt: 16 random bytes per derivation → stored in kdf.salt',
      'IV:  12 random bytes per encryption → stored in iv',
      'Both are base64 in the envelope and covered by the GCM tag',
    ],
    takeaway: 'Fresh salt for every derivation, fresh IV for every encryption, both public and authenticated.',
  },
  {
    id: 'entropy',
    title: 'Entropy',
    summary: 'A measure of unpredictability — and why "P@ssw0rd!" is weaker than it looks.',
    body: [
      'Entropy is measured in bits. Each independent random bit doubles the number of possibilities an attacker must try. A 16-character password drawn uniformly from 94 printable characters has about 105 bits of theoretical entropy; a 24-character lowercase-only password has about 113 bits.',
      'Humans are bad at randomness. Substituting @ for a, appending a year, or turning a phrase into leetspeak produces patterns that cracking tools model explicitly. That is why the Inspector reduces its estimate when it finds dictionary words, keyboard runs or repeated blocks.',
      'Passphrases work because word choices multiply: six words from a 512-word list is about 54 bits, and eight words is about 72 bits, while remaining memorable. Length beats symbol gymnastics.',
    ],
    example: [
      'Entropy ≈ length × log2(pool size)  (independent uniform choices)',
      '6 words × log2(512) ≈ 54 bits',
      'A 24-char password from 94 characters ≈ 157 bits (theoretical upper bound)',
    ],
    takeaway: 'Entropy estimates are upper bounds. Patterns, reuse and breaches reduce real security far below them.',
  },
  {
    id: 'password-managers',
    title: 'Password managers',
    summary: 'The practical way to use a unique, long password for every account.',
    body: [
      'A password manager generates and stores a unique password per account behind one strong master passphrase. This removes the trade-off between remembering passwords and using different ones everywhere.',
      'Most managers encrypt the vault locally before syncing, so the provider stores ciphertext. The master passphrase is the single point of failure, which is why it must be long, unique and protected by multi-factor authentication.',
      'The Encrypted Vault in this app is a small, local version of the same idea: one master passphrase, AES-256-GCM records in IndexedDB, auto-lock and encrypted backups. It is not a replacement for a full manager with sync, browser integration and recovery workflows.',
    ],
    example: [
      'One strong master passphrase → many unique generated passwords',
      'Encrypted export for backup; store the backup passphrase separately',
      'Enable MFA on the manager account itself',
    ],
    takeaway: 'Unique passwords everywhere are only realistic with a manager. Protect the master passphrase above all.',
  },
  {
    id: 'mfa',
    title: 'Multi-factor authentication',
    summary: 'A stolen password should not be enough.',
    body: [
      'Multi-factor authentication requires something you know plus something you have or are. Even a correct password fails without the second factor, which breaks most credential-stuffing attacks.',
      'Prefer hardware security keys (FIDO2/WebAuthn) or authenticator apps with time-based codes. SMS codes are far better than nothing but are vulnerable to SIM swapping and interception. Push notifications should be number-matched to resist approval fatigue.',
      'Recovery codes matter: store them offline, and remember that MFA protects the account, not a service that has already been breached.',
    ],
    example: [
      'Something you know: password or passphrase',
      'Something you have: authenticator app, hardware key',
      'Something you are: biometrics, used locally to unlock a key',
    ],
    takeaway: 'Turn on MFA everywhere it is offered, and prefer phishing-resistant factors.',
  },
  {
    id: 'phishing-reuse',
    title: 'Phishing and password reuse',
    summary: 'The two most common ways accounts fall, and what actually helps.',
    body: [
      'Phishing steals credentials by impersonating a login page. A password manager helps because it will not autofill a saved credential on a look-alike domain, and because generated passwords are not memorable enough to type into a fake page.',
      'Reuse turns one breach into many. When a service leaks a password, attackers replay it across email, banking and social accounts — credential stuffing. Unique passwords contain the damage to a single account.',
      'Practical defences: navigate to sites directly, verify the domain, use a manager, enable MFA, and treat urgency as a warning sign. If you have reused a password, change it everywhere it appears — not just where it leaked.',
    ],
    example: [
      'A breach at a hobby forum should never expose your email account',
      'Password managers refuse to fill credentials on unknown origins',
      'Check breach exposure only with an explicit, privacy-preserving lookup',
    ],
    takeaway: 'Assume phishing will reach you and assume breaches will happen: unique passwords plus MFA limit the blast radius.',
  },
];

export default function SecurityAcademy() {
  const [openId, setOpenId] = useState(TOPICS[0].id);

  return (
    <div>
      <PageHeader
        index="Workspace 10 — Security Academy"
        title="The primitives, explained plainly"
        description="Short, practical explanations of the cryptography this workstation uses, written for people who are not cryptographers. No maths proofs — just what each tool does and where it fails."
        actions={
          <Badge tone="gold">
            <GraduationCap size={11} /> 10 topics
          </Badge>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-6 space-y-0.5">
            <p className="mb-2 px-3 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-muted/50">Topics</p>
            {TOPICS.map((topic, index) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => setOpenId(topic.id)}
                className={cx(
                  'flex w-full items-baseline gap-2.5 rounded-md px-3 py-2 text-left text-[12px] transition-colors',
                  openId === topic.id
                    ? 'bg-gold/[0.08] text-parchment'
                    : 'text-muted hover:bg-white/[0.03] hover:text-parchment/85',
                )}
              >
                <span className="font-mono text-[10px] text-muted/50">{String(index + 1).padStart(2, '0')}</span>
                {topic.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="space-y-2.5">
          {TOPICS.map((topic, index) => {
            const open = openId === topic.id;
            return (
              <section
                key={topic.id}
                className={cx(
                  'overflow-hidden rounded-xl2 border transition-colors',
                  open ? 'border-gold/25 bg-surface' : 'border-line bg-surface/60 hover:border-line',
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? '' : topic.id)}
                  aria-expanded={open}
                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] text-gold/60">{String(index + 1).padStart(2, '0')}</span>
                      <h2 className="text-[15px] text-parchment/95">{topic.title}</h2>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{topic.summary}</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={cx(
                      'mt-1 shrink-0 text-muted transition-transform duration-200',
                      open && 'rotate-180 text-gold',
                    )}
                    aria-hidden="true"
                  />
                </button>

                {open && (
                  <div className="animate-fade border-t border-line px-4 pb-5 pt-4 sm:px-5">
                    <div className="space-y-3 text-[12.5px] leading-relaxed text-muted">
                      {topic.body.map((paragraph) => (
                        <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                      ))}
                    </div>

                    <div className="mt-4 rounded-lg border border-line bg-ink/50 p-3.5">
                      <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted/70">Practical</p>
                      <ul className="space-y-1.5">
                        {topic.example.map((line) => (
                          <li key={line} className="font-mono text-[11px] leading-relaxed text-gold/80">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-success/20 bg-success/[0.05] px-3 py-2.5">
                      <Lightbulb size={13} className="mt-0.5 shrink-0 text-success/80" aria-hidden="true" />
                      <p className="text-[11.5px] leading-relaxed text-muted">{topic.takeaway}</p>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          <div className="pt-4">
            <Notice tone="info" title="A note on guarantees">
              This Academy explains how the tools work, not that any particular configuration is perfect for
              your threat model. Cryptography is easy to misuse; if you are protecting something critical,
              consult current guidance and a professional.
              <span className="mt-2 block text-[11px]">
                None of the text here is a substitute for auditing the code you actually deploy.
              </span>
            </Notice>
          </div>

          <Panel className="mt-5">
            <SectionTitle title="Quick reference" hint="Where each primitive appears in this app." />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted/70">
                    <th className="pb-2 pr-4 font-medium">Primitive</th>
                    <th className="pb-2 pr-4 font-medium">Purpose</th>
                    <th className="pb-2 font-medium">Workspace</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  {[
                    ['crypto.getRandomValues', 'Unbiased randomness', 'Forge, Key Forge'],
                    ['AES-256-GCM', 'Authenticated encryption', 'Encryption / Decryption Lab, Vault'],
                    ['PBKDF2-SHA-256', 'Passphrase → key', 'Encryption Lab, Vault'],
                    ['Argon2id', 'Slow password hashing', 'Hash Laboratory'],
                    ['SHA-256/384/512', 'Integrity digests', 'Hash Laboratory'],
                    ['HMAC-SHA-256', 'Keyed integrity', 'Hash Laboratory'],
                    ['SHA-1 prefix', 'Breach lookup only (opt-in)', 'Password Inspector'],
                  ].map(([primitive, purpose, where]) => (
                    <tr key={primitive} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-[10.5px] text-parchment/80">{primitive}</td>
                      <td className="py-2 pr-4">{purpose}</td>
                      <td className="py-2">{where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted/70">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-gold/60" aria-hidden="true" />
              Every one of these operations is executed in your browser by a standard platform API or a
              reviewed library.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
