"use client";

import type { DatasetDTO } from "./types";

const DB_NAME = "llminfo";
const DB_VERSION = 1;
const STORE = "dataset";
const KEY = "latest";

interface CachedRecord {
  version: string;
  payload: DatasetDTO;
  storedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Local snapshot cache: lets a cold start paint instantly from the last
 * dataset, then revalidate against the server ETag in the background.
 */
export async function readCachedDataset(): Promise<DatasetDTO | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const record = await new Promise<CachedRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as CachedRecord | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return record?.payload ?? null;
  } catch {
    return null;
  }
}

export async function writeCachedDataset(payload: DatasetDTO): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const record: CachedRecord = { version: payload.version, payload, storedAt: Date.now() };
      tx.objectStore(STORE).put(record, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // caching is best-effort
  }
}
