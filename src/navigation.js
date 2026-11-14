import {
  ClipboardCheck,
  Fingerprint,
  GraduationCap,
  Hash,
  KeyRound,
  LayoutDashboard,
  Lock,
  LockOpen,
  ScanSearch,
  Settings as SettingsIcon,
  ShieldCheck,
  Vault,
} from 'lucide-react';

export const WORKSPACES = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    description: 'Orientation, system status and workspace shortcuts.',
  },
  {
    id: 'forge',
    name: 'Password Forge',
    path: '/forge',
    icon: KeyRound,
    description: 'Generate random passwords and passphrases with a CSPRNG.',
  },
  {
    id: 'inspector',
    name: 'Password Inspector',
    path: '/inspector',
    icon: ScanSearch,
    description: 'Local analysis of length, patterns, entropy and weak spots.',
  },
  {
    id: 'encrypt',
    name: 'Encryption Lab',
    path: '/encrypt',
    icon: Lock,
    description: 'AES-256-GCM with PBKDF2-SHA-256, text or files.',
  },
  {
    id: 'decrypt',
    name: 'Decryption Lab',
    path: '/decrypt',
    icon: LockOpen,
    description: 'Authenticate and restore Password Forge payloads.',
  },
  {
    id: 'hash',
    name: 'Hash Laboratory',
    path: '/hash',
    icon: Hash,
    description: 'SHA-2 digests, HMAC-SHA-256, verification and Argon2id.',
  },
  {
    id: 'keys',
    name: 'Key Forge',
    path: '/keys',
    icon: Fingerprint,
    description: 'Random hex, base64url tokens and cryptographic key material.',
  },
  {
    id: 'audit',
    name: 'Security Audit',
    path: '/audit',
    icon: ClipboardCheck,
    description: 'Session-local review of reuse, length and weak patterns.',
  },
  {
    id: 'vault',
    name: 'Encrypted Vault',
    path: '/vault',
    icon: Vault,
    description: 'Unlockable local credential records, encrypted at rest.',
  },
  {
    id: 'academy',
    name: 'Security Academy',
    path: '/academy',
    icon: GraduationCap,
    description: 'Plain-language explanations of the primitives in use.',
  },
  {
    id: 'settings',
    name: 'Settings',
    path: '/settings',
    icon: SettingsIcon,
    description: 'Local preferences, KDF cost and data removal.',
  },
];

export const NAV_GROUPS = [
  { label: 'Overview', items: ['dashboard'] },
  { label: 'Generation', items: ['forge', 'inspector'] },
  { label: 'Cryptography', items: ['encrypt', 'decrypt', 'hash', 'keys'] },
  { label: 'Defense', items: ['audit', 'vault', 'academy'] },
  { label: 'System', items: ['settings'] },
];

export const WORKSPACE_BY_ID = Object.fromEntries(WORKSPACES.map((item) => [item.id, item]));

export const PRIVACY_PAGE = { name: 'Privacy & data flow', path: '/privacy', icon: ShieldCheck };
