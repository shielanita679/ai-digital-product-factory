import { randomInt } from "node:crypto";

// Unambiguous characters only (no 0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Customer-facing order reference, e.g. "CH-7K4M-Q2RX". */
export function createOrderReference(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `CH-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}
