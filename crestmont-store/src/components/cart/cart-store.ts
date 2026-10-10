"use client";

import type { CartLine } from "@/lib/cart";

/**
 * Browser cart persistence. Stores only SKUs and quantities in
 * localStorage (no cookies, nothing sent to the server until checkout).
 * Falls back to memory when storage is unavailable, and syncs across tabs.
 */
const KEY = "crestmont.cart.v1";
const listeners = new Set<() => void>();
let memory = "[]";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return memory;
  }
}

export function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export const getSnapshot = read;
export const getServerSnapshot = () => "[]";

export function parseLines(raw: string): CartLine[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function writeLines(lines: CartLine[]) {
  memory = JSON.stringify(lines);
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    // Storage blocked (private mode / quota): keep the in-memory copy.
  }
  listeners.forEach((l) => l());
}
