import { ForgeError, decryptEnvelope, deriveAesKey, encryptBytes, serializeEnvelope, DEFAULT_ITERATIONS } from './crypto.js';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes.js';

/**
 * Encrypted vault backed by IndexedDB.
 *
 * Stored data:
 *  - meta:     { id:'main', salt, iterations, verifier:{iv,ct}, createdAt }
 *  - records:  { id, iv, ciphertext, updatedAt }
 *
 * Records are AES-256-GCM ciphertext bound to their record id via AAD. The
 * derived key lives only in memory, held by the React component while unlocked.
 * No plaintext, master passphrase or derived key is ever written to storage.
 */

const DB_NAME = 'password-forge-vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const RECORDS_STORE = 'records';
const VERIFIER_PLAINTEXT = 'password-forge-vault-verifier-v1';
const VERIFIER_AAD = 'password-forge/vault/verifier';

export const RECORD_LIMITS = Object.freeze({
  title: 120,
  username: 200,
  password: 400,
  url: 500,
  notes: 4000,
});

const RECORD_FIELDS = Object.keys(RECORD_LIMITS);

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(RECORDS_STORE)) db.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local vault database.'));
    request.onblocked = () => reject(new Error('Vault database is blocked by another tab. Close other Password Forge tabs and retry.'));
  });
}

async function withStore(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = action(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result && 'result' in result ? result.result : result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Vault storage operation failed.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Vault storage operation was aborted.'));
    };
  });
}

async function readMeta() {
  const meta = await withStore(META_STORE, 'readonly', (store) => store.get('main'));
  return meta || null;
}

async function writeMeta(meta) {
  await withStore(META_STORE, 'readwrite', (store) => store.put({ ...meta, id: 'main' }));
}

export async function vaultExists() {
  try {
    const meta = await readMeta();
    return Boolean(meta && meta.salt && meta.verifier);
  } catch {
    return false;
  }
}

export async function vaultInfo() {
  try {
    const meta = await readMeta();
    if (!meta) return { exists: false, recordCount: 0 };
    const count = await withStore(RECORDS_STORE, 'readonly', (store) => store.count());
    return {
      exists: true,
      createdAt: meta.createdAt,
      iterations: meta.iterations,
      recordCount: count || 0,
    };
  } catch {
    return { exists: false, recordCount: 0, unavailable: true };
  }
}

export async function createVault(passphrase, iterations = DEFAULT_ITERATIONS) {
  if (typeof passphrase !== 'string' || passphrase.length < 10) {
    throw new ForgeError('WEAK_PASSPHRASE', 'The master passphrase must be at least 10 characters long.');
  }
  if (await vaultExists()) {
    throw new ForgeError('VAULT_EXISTS', 'A vault already exists on this device. Unlock it instead of creating a new one.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKey(passphrase, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8Encode(VERIFIER_AAD), tagLength: 128 },
      key,
      utf8Encode(VERIFIER_PLAINTEXT),
    ),
  );

  await writeMeta({
    salt: toBase64(salt),
    iterations,
    verifier: { iv: toBase64(iv), ct: toBase64(ciphertext) },
    createdAt: new Date().toISOString(),
  });

  return key;
}

export async function unlockVault(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new ForgeError('PASSPHRASE_REQUIRED', 'Enter your master passphrase.');
  }
  const meta = await readMeta();
  if (!meta) throw new ForgeError('VAULT_MISSING', 'No vault exists on this device yet.');

  const salt = fromBase64(meta.salt);
  const iv = meta.verifier ? fromBase64(meta.verifier.iv) : null;
  const ciphertext = meta.verifier ? fromBase64(meta.verifier.ct) : null;
  if (!salt || !iv || !ciphertext) {
    throw new ForgeError('VAULT_CORRUPT', 'Vault metadata is corrupted and cannot be read.');
  }

  const key = await deriveAesKey(passphrase, salt, meta.iterations);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: utf8Encode(VERIFIER_AAD), tagLength: 128 },
      key,
      ciphertext,
    );
    if (utf8Decode(new Uint8Array(plaintext)) !== VERIFIER_PLAINTEXT) {
      throw new Error('Verifier mismatch');
    }
  } catch {
    throw new ForgeError('AUTH_FAILED', 'Incorrect master passphrase.');
  }

  return key;
}

async function encryptRecord(key, record) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = utf8Encode(JSON.stringify(record));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8Encode(`password-forge/record/${record.id}`), tagLength: 128 },
      key,
      payload,
    ),
  );
  return { id: record.id, iv: toBase64(iv), ciphertext: toBase64(ciphertext), updatedAt: record.updatedAt };
}

async function decryptRecord(key, row) {
  const iv = fromBase64(row.iv);
  const ciphertext = fromBase64(row.ciphertext);
  if (!iv || !ciphertext) throw new Error('Stored record is corrupted.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: utf8Encode(`password-forge/record/${row.id}`), tagLength: 128 },
    key,
    ciphertext,
  );
  const record = JSON.parse(utf8Decode(new Uint8Array(plaintext)));
  return { ...record, id: row.id, updatedAt: record.updatedAt || row.updatedAt };
}

export function sanitizeRecord(input) {
  const record = {};
  for (const field of RECORD_FIELDS) {
    const value = input?.[field];
    if (typeof value !== 'string') record[field] = '';
    else record[field] = value.slice(0, RECORD_LIMITS[field]);
  }
  if (!record.title.trim()) throw new Error('A title is required.');
  if (!record.password && !record.username && !record.notes) {
    throw new Error('Add at least a password, username or note to the record.');
  }
  return record;
}

export async function loadRecords(key) {
  const rows = await withStore(RECORDS_STORE, 'readonly', (store) => store.getAll());
  const records = [];
  const corrupted = [];
  for (const row of rows || []) {
    try {
      records.push(await decryptRecord(key, row));
    } catch {
      corrupted.push(row.id);
    }
  }
  records.sort((a, b) => a.title.localeCompare(b.title));
  return { records, corrupted };
}

export async function saveRecord(key, input) {
  const record = sanitizeRecord(input);
  const id = input.id || crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const row = await encryptRecord(key, { ...record, id, updatedAt });
  await withStore(RECORDS_STORE, 'readwrite', (store) => store.put(row));
  return { ...record, id, updatedAt };
}

export async function deleteRecord(id) {
  await withStore(RECORDS_STORE, 'readwrite', (store) => store.delete(id));
}

export async function exportVaultBackup(key, backupPassphrase) {
  const { records } = await loadRecords(key);
  const bundle = {
    kind: 'password-forge-vault-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    records: records.map(({ title, username, password, url, notes, updatedAt }) => ({
      title,
      username,
      password,
      url,
      notes,
      updatedAt,
    })),
  };
  const envelope = await encryptBytes({
    plaintext: utf8Encode(JSON.stringify(bundle)),
    passphrase: backupPassphrase,
    kind: 'vault-backup',
    filename: 'password-forge-vault.json',
    mime: 'application/json',
  });
  return serializeEnvelope(envelope);
}

export async function importVaultBackup(key, payload, backupPassphrase) {
  const { bytes, envelope } = await decryptEnvelope(payload, { passphrase: backupPassphrase });
  if (envelope.meta.kind !== 'vault-backup') {
    throw new ForgeError('BACKUP_INVALID', 'This encrypted payload is not a vault backup.');
  }

  let bundle;
  try {
    bundle = JSON.parse(utf8Decode(bytes));
  } catch {
    throw new ForgeError('BACKUP_INVALID', 'The decrypted backup is not valid JSON.');
  }
  if (!bundle || bundle.kind !== 'password-forge-vault-backup' || !Array.isArray(bundle.records)) {
    throw new ForgeError('BACKUP_INVALID', 'The decrypted backup does not have the expected structure.');
  }
  if (bundle.records.length > 5000) {
    throw new ForgeError('BACKUP_INVALID', 'Backup contains too many records.');
  }

  let imported = 0;
  let skipped = 0;
  for (const raw of bundle.records) {
    try {
      const record = sanitizeRecord(raw);
      const id = crypto.randomUUID();
      const updatedAt = new Date().toISOString();
      const row = await encryptRecord(key, { ...record, id, updatedAt });
      await withStore(RECORDS_STORE, 'readwrite', (store) => store.put(row));
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped, createdAt: bundle.createdAt };
}

export async function destroyVault() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Could not delete the vault database.'));
    request.onblocked = () => resolve();
  });
}
