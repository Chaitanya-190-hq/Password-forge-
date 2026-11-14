import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createVault,
  deleteRecord,
  destroyVault,
  exportVaultBackup,
  importVaultBackup,
  loadRecords,
  saveRecord,
  unlockVault,
  vaultExists,
  vaultInfo,
} from './vault.js';

const FAST = 100_000;
const PASSPHRASE = 'a long master passphrase';

function readStore(storeName) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('password-forge-vault');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
      request.onerror = () => {
        reject(request.error);
        db.close();
      };
    };
  });
}

async function seedVault() {
  const key = await createVault(PASSPHRASE, FAST);
  const record = await saveRecord(key, {
    title: 'Mail',
    username: 'someone@example.com',
    password: 'PLAINTEXT-MARKER-123',
    url: 'mail.example.com',
    notes: 'recovery codes inside',
  });
  return { key, record };
}

beforeEach(async () => {
  await destroyVault();
});

afterEach(async () => {
  await destroyVault();
});

describe('vault lifecycle', () => {
  it('starts empty', async () => {
    expect(await vaultExists()).toBe(false);
    expect((await vaultInfo()).exists).toBe(false);
  });

  it('rejects a weak master passphrase', async () => {
    await expect(createVault('short', FAST)).rejects.toMatchObject({ code: 'WEAK_PASSPHRASE' });
  });

  it('creates a vault and unlocks it with the right passphrase', async () => {
    const key = await createVault(PASSPHRASE, FAST);
    expect(key.extractable).toBe(false);
    expect(await vaultExists()).toBe(true);

    const unlocked = await unlockVault(PASSPHRASE);
    expect(unlocked.extractable).toBe(false);
    expect(unlocked.algorithm.name).toBe('AES-GCM');
  });

  it('refuses to create a second vault', async () => {
    await createVault(PASSPHRASE, FAST);
    await expect(createVault(PASSPHRASE, FAST)).rejects.toMatchObject({ code: 'VAULT_EXISTS' });
  });

  it('rejects an incorrect passphrase without exposing data', async () => {
    await createVault(PASSPHRASE, FAST);
    await expect(unlockVault('definitely wrong')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('rejects an empty passphrase', async () => {
    await createVault(PASSPHRASE, FAST);
    await expect(unlockVault('')).rejects.toMatchObject({ code: 'PASSPHRASE_REQUIRED' });
  });

  it('reports a missing vault', async () => {
    await expect(unlockVault('anything at all')).rejects.toMatchObject({ code: 'VAULT_MISSING' });
  });

  it('deletes all local vault data on request', async () => {
    await seedVault();
    expect((await vaultInfo()).recordCount).toBe(1);
    await destroyVault();
    expect(await vaultExists()).toBe(false);
  });
});

describe('record storage', () => {
  it('round trips encrypted records', async () => {
    const { key } = await seedVault();
    const { records, corrupted } = await loadRecords(key);
    expect(corrupted).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      title: 'Mail',
      username: 'someone@example.com',
      password: 'PLAINTEXT-MARKER-123',
    });
  });

  it('stores only ciphertext in IndexedDB', async () => {
    await seedVault();
    const rows = await readStore('records');
    expect(rows).toHaveLength(1);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('PLAINTEXT-MARKER-123');
    expect(serialized).not.toContain('someone@example.com');
    expect(serialized).not.toContain('Mail');
    expect(Object.keys(rows[0]).sort()).toEqual(['ciphertext', 'id', 'iv', 'updatedAt']);
    expect(rows[0].iv).toBeTruthy();
  });

  it('never stores the passphrase or a verifier plaintext', async () => {
    await createVault(PASSPHRASE, FAST);
    const meta = await readStore('meta');
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain(PASSPHRASE);
    expect(serialized).not.toContain('password-forge-vault-verifier-v1');
    expect(meta[0].salt).toBeTruthy();
    expect(meta[0].verifier.iv).toBeTruthy();
  });

  it('uses a unique IV for each record save', async () => {
    const key = await createVault(PASSPHRASE, FAST);
    await saveRecord(key, { title: 'One', password: 'a' });
    await saveRecord(key, { title: 'Two', password: 'b' });
    const rows = await readStore('records');
    expect(new Set(rows.map((row) => row.iv)).size).toBe(2);
  });

  it('updates and deletes records', async () => {
    const { key, record } = await seedVault();
    await saveRecord(key, {
      id: record.id,
      title: 'Mail updated',
      username: 'new@example.com',
      password: 'new-password',
    });
    let { records } = await loadRecords(key);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Mail updated');

    await deleteRecord(record.id);
    ({ records } = await loadRecords(key));
    expect(records).toHaveLength(0);
  });

  it('rejects records without a title or any content', async () => {
    const key = await createVault(PASSPHRASE, FAST);
    await expect(saveRecord(key, { title: '', password: 'x' })).rejects.toThrow(/title/i);
    await expect(saveRecord(key, { title: 'Empty' })).rejects.toThrow(/at least/i);
  });

  it('reports tampered records as corrupted instead of returning them', async () => {
    const { key } = await seedVault();
    const rows = await readStore('records');
    const ciphertext = rows[0].ciphertext;
    const flipped = ciphertext.slice(0, 4) + (ciphertext[4] === 'A' ? 'B' : 'A') + ciphertext.slice(5);

    await new Promise((resolve, reject) => {
      const open = indexedDB.open('password-forge-vault');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({ ...rows[0], ciphertext: flipped });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      open.onerror = () => reject(open.error);
    });

    const { records, corrupted } = await loadRecords(key);
    expect(records).toHaveLength(0);
    expect(corrupted).toHaveLength(1);
  });
});

describe('encrypted backups', () => {
  it('exports an encrypted backup that does not contain plaintext', async () => {
    const { key } = await seedVault();
    const payload = await exportVaultBackup(key, 'backup passphrase!!');
    expect(payload).not.toContain('PLAINTEXT-MARKER-123');
    const parsed = JSON.parse(payload);
    expect(parsed.meta.kind).toBe('vault-backup');
    expect(parsed.format).toBe('password-forge-encrypted');
  });

  it('imports a backup after decrypting it with the backup passphrase', async () => {
    const { key } = await seedVault();
    const payload = await exportVaultBackup(key, 'backup passphrase!!');
    const result = await importVaultBackup(key, payload, 'backup passphrase!!');
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);

    const { records } = await loadRecords(key);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.password === 'PLAINTEXT-MARKER-123')).toBe(true);
  });

  it('refuses a backup with the wrong passphrase', async () => {
    const { key } = await seedVault();
    const payload = await exportVaultBackup(key, 'backup passphrase!!');
    await expect(importVaultBackup(key, payload, 'wrong passphrase')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('refuses a payload that is not a vault backup', async () => {
    const { key } = await seedVault();
    const { encryptText } = await import('./crypto.js');
    const notABackup = await encryptText({
      text: '{"kind":"something-else"}',
      passphrase: 'backup passphrase!!',
      iterations: FAST,
    });
    await expect(importVaultBackup(key, notABackup, 'backup passphrase!!')).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
  });
});
