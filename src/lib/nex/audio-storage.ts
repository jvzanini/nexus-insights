/**
 * audio-storage — IndexedDB wrapper para áudios gravados na bolha do Nex.
 *
 * Por que IndexedDB e não localStorage?
 *  - localStorage é string-only (~5 MB) e síncrono — não cabe Blob.
 *  - IndexedDB armazena Blob nativamente, é assíncrono e tem cota maior.
 *
 * Fluxo:
 *  1. Ao gravar/enviar → `saveAudio(id, blob)` persiste o binário.
 *  2. localStorage (em outro lugar) persiste só metadados das mensagens
 *     com `hasStoredAudio: true` (sem o blob URL, que é por sessão).
 *  3. No reload, o panel chama `getAudio(id)` → retorna Blob ou null.
 *     Se Blob existe: `URL.createObjectURL(blob)` → repõe player.
 *  4. "Limpar conversa" → `clearAllAudios()` zera tudo.
 *
 * API só é segura no client (browser). No servidor (SSR) `indexedDB` é
 * undefined — todas as funções retornam early com no-op para não quebrar.
 */

const DB_NAME = "nex-audio-storage";
const STORE = "audios";
const DB_VERSION = 1;

/* -------------------------------------------------------------------------- */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/** Abre (e migra, se necessário) o IDBDatabase. Promise-wrapper. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isClient()) {
      reject(new Error("IndexedDB indisponível (não-cliente)"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open error"));
    req.onblocked = () => reject(new Error("IDB open blocked"));
  });
}

/* -------------------------------------------------------------------------- */

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  if (!isClient()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IDB tx error"));
      tx.onabort = () => reject(tx.error ?? new Error("IDB tx aborted"));
      tx.objectStore(STORE).put(blob, id);
    });
    db.close();
  } catch {
    // Silencia erros — áudio é UX nice-to-have, não bloqueia o fluxo do chat.
  }
}

export async function getAudio(id: string): Promise<Blob | null> {
  if (!isClient()) return null;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const result = req.result;
        resolve(result instanceof Blob ? result : null);
      };
      req.onerror = () => reject(req.error ?? new Error("IDB get error"));
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteAudio(id: string): Promise<void> {
  if (!isClient()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IDB tx error"));
      tx.objectStore(STORE).delete(id);
    });
    db.close();
  } catch {
    /* noop */
  }
}

export async function clearAllAudios(): Promise<void> {
  if (!isClient()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IDB tx error"));
      tx.objectStore(STORE).clear();
    });
    db.close();
  } catch {
    /* noop */
  }
}
