// Generates the placeholder studio artwork in public/images.
//
// These are deliberately simple, neutral renderings so the storefront can be
// reviewed end to end before real product photography exists. Replace every
// file with photography of the actual goods before launch (see
// docs/LAUNCH_CHECKLIST.md). Run: node scripts/generate-placeholder-images.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "images");

// ---------- color helpers ----------
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const light = (c, t) => mix(c, "#ffffff", t);
const dark = (c, t) => mix(c, "#000000", t);

let uid = 0;
const id = (p) => `${p}${++uid}`;

// Horizontal "cylinder" shading: highlight left of center, falloff right.
function cylGrad(color, defs) {
  const g = id("cg");
  defs.push(`<linearGradient id="${g}" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="${dark(color, 0.18)}"/>
    <stop offset="0.22" stop-color="${light(color, 0.14)}"/>
    <stop offset="0.5" stop-color="${color}"/>
    <stop offset="0.85" stop-color="${dark(color, 0.2)}"/>
    <stop offset="1" stop-color="${dark(color, 0.3)}"/></linearGradient>`);
  return `url(#${g})`;
}
function vGrad(top, bottom, defs) {
  const g = id("vg");
  defs.push(`<linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`);
  return `url(#${g})`;
}
function dGrad(a, b, defs) {
  const g = id("dg");
  defs.push(`<linearGradient id="${g}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
  return `url(#${g})`;
}
function shadow(cx, cy, rx, ry, defs, opacity = 0.28) {
  const f = id("sh");
  defs.push(`<filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.max(6, ry * 0.6)}"/></filter>`);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2a241c" opacity="${opacity}" filter="url(#${f})"/>`;
}

// ---------- backdrops ----------
const BACKDROPS = {
  linen: ["#efebe4", "#e6e0d6", "#d9d1c4"],
  stone: ["#e9e8e4", "#dfddd7", "#cfccc4"],
  sage: ["#e3e6de", "#d7dbd0", "#c6cbbd"],
  clay: ["#eee2d8", "#e4d5c8", "#d4c1b0"],
  slate: ["#dfe2e4", "#d3d7da", "#c0c5c9"],
};
function backdrop(w, h, name, horizon, defs) {
  const [top, mid, floor] = BACKDROPS[name];
  const wall = vGrad(top, mid, defs);
  const fl = vGrad(mid, floor, defs);
  const hy = Math.round(h * horizon);
  return `<rect width="${w}" height="${hy}" fill="${wall}"/><rect y="${hy}" width="${w}" height="${h - hy}" fill="${fl}"/>
  <rect y="${hy - 1}" width="${w}" height="2" fill="#ffffff" opacity="0.25"/>`;
}

function svg(w, h, defs, body, viewBox = `0 0 ${w} ${h}`) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice"><defs>${defs.join("")}</defs>${body}</svg>\n`;
}

// ---------- objects (each draws with its base at (x, y), scale s) ----------
function mug(x, y, s, color, defs) {
  const w = 190 * s, h = 210 * s, rx = w / 2, ry = 26 * s;
  const body = cylGrad(color, defs);
  const inner = vGrad(dark(color, 0.35), dark(color, 0.12), defs);
  const hx = x + rx - 6 * s;
  return `${shadow(x + 20 * s, y + 4 * s, rx * 1.25, ry * 0.9, defs)}
  <path d="M${hx} ${y - h * 0.72} c ${70 * s} ${-8 * s} ${86 * s} ${92 * s} ${6 * s} ${110 * s}" fill="none" stroke="${dark(color, 0.12)}" stroke-width="${22 * s}" stroke-linecap="round"/>
  <path d="M${hx} ${y - h * 0.72} c ${70 * s} ${-8 * s} ${86 * s} ${92 * s} ${6 * s} ${110 * s}" fill="none" stroke="${light(color, 0.08)}" stroke-width="${8 * s}" stroke-linecap="round" opacity="0.5"/>
  <path d="M${x - rx} ${y - h} L${x - rx} ${y - 18 * s} Q${x - rx} ${y} ${x - rx + 30 * s} ${y + ry * 0.5} Q${x} ${y + ry} ${x + rx - 30 * s} ${y + ry * 0.5} Q${x + rx} ${y} ${x + rx} ${y - 18 * s} L${x + rx} ${y - h} Z" fill="${body}"/>
  <path d="M${x - rx} ${y - 34 * s} Q${x} ${y - 10 * s} ${x + rx} ${y - 34 * s} L${x + rx} ${y - 18 * s} Q${x + rx} ${y} ${x + rx - 30 * s} ${y + ry * 0.5} Q${x} ${y + ry} ${x - rx + 30 * s} ${y + ry * 0.5} Q${x - rx} ${y} ${x - rx} ${y - 18 * s} Z" fill="${mix(color, "#c9b9a3", 0.65)}" opacity="0.9"/>
  <ellipse cx="${x}" cy="${y - h}" rx="${rx}" ry="${ry}" fill="${light(color, 0.2)}"/>
  <ellipse cx="${x}" cy="${y - h + 3 * s}" rx="${rx - 10 * s}" ry="${ry - 7 * s}" fill="${inner}"/>`;
}

function pourOver(x, y, s, defs) {
  const glass = "#dfe6e6";
  const g = vGrad("#ffffff", "#c9d3d4", defs);
  const coffee = vGrad("#6b4a33", "#3d2a1d", defs);
  const wood = cylGrad("#9b6b45", defs);
  const sw = 4 * s;
  return `${shadow(x, y + 4 * s, 150 * s, 24 * s, defs)}
  <path d="M${x - 120 * s} ${y - 20 * s} Q${x - 130 * s} ${y - 150 * s} ${x - 52 * s} ${y - 230 * s} L${x + 52 * s} ${y - 230 * s} Q${x + 130 * s} ${y - 150 * s} ${x + 120 * s} ${y - 20 * s} Q${x} ${y + 14 * s} ${x - 120 * s} ${y - 20 * s} Z" fill="${g}" opacity="0.55" stroke="${glass}" stroke-width="${sw}"/>
  <path d="M${x - 124 * s} ${y - 92 * s} Q${x} ${y - 70 * s} ${x + 124 * s} ${y - 92 * s} Q${x + 126 * s} ${y - 40 * s} ${x + 118 * s} ${y - 22 * s} Q${x} ${y + 10 * s} ${x - 118 * s} ${y - 22 * s} Q${x - 126 * s} ${y - 40 * s} ${x - 124 * s} ${y - 92 * s} Z" fill="${coffee}" opacity="0.92"/>
  <path d="M${x - 96 * s} ${y - 180 * s} Q${x - 116 * s} ${y - 120 * s} ${x - 104 * s} ${y - 60 * s}" stroke="#ffffff" stroke-width="${10 * s}" fill="none" opacity="0.7" stroke-linecap="round"/>
  <path d="M${x - 52 * s} ${y - 230 * s} L${x - 46 * s} ${y - 300 * s} L${x + 46 * s} ${y - 300 * s} L${x + 52 * s} ${y - 230 * s} Z" fill="${g}" opacity="0.6" stroke="${glass}" stroke-width="${sw}"/>
  <rect x="${x - 58 * s}" y="${y - 270 * s}" width="${116 * s}" height="${44 * s}" rx="${10 * s}" fill="${wood}"/>
  <path d="M${x - 58 * s} ${y - 248 * s} h ${116 * s}" stroke="#4a3020" stroke-width="${3 * s}" opacity="0.6"/>
  <path d="M${x - 118 * s} ${y - 420 * s} L${x - 30 * s} ${y - 300 * s} L${x + 30 * s} ${y - 300 * s} L${x + 118 * s} ${y - 420 * s} Z" fill="${g}" opacity="0.7" stroke="${glass}" stroke-width="${sw}"/>
  <path d="M${x - 100 * s} ${y - 410 * s} L${x - 26 * s} ${y - 312 * s} L${x + 26 * s} ${y - 312 * s} L${x + 100 * s} ${y - 410 * s} Z" fill="#b7bcbd" opacity="0.55"/>
  <ellipse cx="${x}" cy="${y - 420 * s}" rx="${118 * s}" ry="${18 * s}" fill="#f4f7f7" stroke="${glass}" stroke-width="${sw}"/>
  <ellipse cx="${x}" cy="${y - 418 * s}" rx="${100 * s}" ry="${12 * s}" fill="#5a3e2a" opacity="0.85"/>`;
}

function cuttingBoard(x, y, s, defs, size = 1) {
  const w = 300 * s * size, h = 440 * s * size;
  const wood = dGrad("#c99a68", "#9a6a40", defs);
  const grain = [];
  for (let i = 0; i < 14; i++) {
    const gx = x - w / 2 + 18 * s + (i * (w - 36 * s)) / 13;
    grain.push(`<path d="M${gx} ${y - h + 70 * s} q ${8 * s} ${h * 0.25} ${-4 * s} ${h * 0.5} t ${6 * s} ${h * 0.42}" stroke="#7a4f2c" stroke-width="${1.5 * s}" fill="none" opacity="${0.15 + (i % 3) * 0.07}"/>`);
  }
  return `${shadow(x + 40 * s, y + 6 * s, w * 0.7, 26 * s, defs)}
  <g transform="rotate(-4 ${x} ${y})">
  <rect x="${x - w / 2 + 10 * s}" y="${y - h + 10 * s}" width="${w}" height="${h}" rx="${26 * s}" fill="#6f4a2c"/>
  <rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${26 * s}" fill="${wood}"/>
  ${grain.join("")}
  <rect x="${x - 34 * s}" y="${y - h + 34 * s}" width="${68 * s}" height="${26 * s}" rx="${13 * s}" fill="#5c3c22" opacity="0.85"/>
  </g>`;
}

function waffle(color, defs) {
  const p = id("wf");
  defs.push(`<pattern id="${p}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${color}"/><rect x="3" y="3" width="12" height="12" rx="2" fill="${dark(color, 0.07)}"/><rect x="4" y="4" width="10" height="4" rx="2" fill="${light(color, 0.06)}"/></pattern>`);
  return `url(#${p})`;
}
function throwBlanket(x, y, s, color, defs) {
  const fill = waffle(color, defs);
  const layers = [];
  for (let i = 0; i < 4; i++) {
    const ly = y - i * 62 * s;
    const w = (520 - i * 6) * s;
    layers.push(`<path d="M${x - w / 2} ${ly} L${x - w / 2} ${ly - 58 * s} Q${x - w / 2} ${ly - 70 * s} ${x - w / 2 + 16 * s} ${ly - 70 * s} L${x + w / 2 - 16 * s} ${ly - 70 * s} Q${x + w / 2} ${ly - 70 * s} ${x + w / 2} ${ly - 58 * s} L${x + w / 2} ${ly} Q${x} ${ly + 8 * s} ${x - w / 2} ${ly} Z" fill="${fill}"/>
    <path d="M${x - w / 2} ${ly} Q${x} ${ly + 8 * s} ${x + w / 2} ${ly}" stroke="${dark(color, 0.25)}" stroke-width="${5 * s}" fill="none" opacity="0.6"/>
    <rect x="${x + w / 2 - 70 * s}" y="${ly - 70 * s}" width="${70 * s}" height="${70 * s}" fill="${dark(color, 0.18)}" opacity="0.35"/>`);
  }
  const top = y - 4 * 62 * s;
  return `${shadow(x, y + 6 * s, 300 * s, 26 * s, defs)}${layers.join("")}
  <path d="M${x - 254 * s} ${top + 10 * s} Q${x} ${top - 24 * s} ${x + 254 * s} ${top + 10 * s} L${x + 254 * s} ${top + 2 * s} L${x - 254 * s} ${top + 2 * s} Z" fill="${light(color, 0.1)}" opacity="0.6"/>`;
}

function linen(color, defs) {
  const p = id("ln");
  defs.push(`<pattern id="${p}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${color}"/><path d="M0 1h6M0 4h6" stroke="${dark(color, 0.06)}" stroke-width="1"/><path d="M2 0v6" stroke="${light(color, 0.08)}" stroke-width="1"/></pattern>`);
  return `url(#${p})`;
}
function pillow(x, y, s, color, defs, size = 1) {
  const w = 420 * s * size, h = 380 * s * size;
  const fill = linen(color, defs);
  const shade = id("ps");
  defs.push(`<radialGradient id="${shade}" cx="0.4" cy="0.38" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="0.7" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></radialGradient>`);
  const l = x - w / 2, r = x + w / 2, t = y - h, b = y;
  const d = `M${l + 10 * s} ${t + 6 * s} Q${x} ${t + 34 * s} ${r - 10 * s} ${t + 6 * s} Q${r - 34 * s} ${(t + b) / 2} ${r - 6 * s} ${b - 4 * s} Q${x} ${b - 30 * s} ${l + 6 * s} ${b - 4 * s} Q${l + 34 * s} ${(t + b) / 2} ${l + 10 * s} ${t + 6 * s} Z`;
  return `${shadow(x, y + 2 * s, w * 0.55, 22 * s, defs)}<path d="${d}" fill="${fill}"/><path d="${d}" fill="url(#${shade})"/>
  <path d="${d}" fill="none" stroke="${dark(color, 0.15)}" stroke-width="${3 * s}" stroke-dasharray="${6 * s} ${5 * s}" transform="translate(${x} ${(t + b) / 2}) scale(0.93) translate(${-x} ${-(t + b) / 2})" opacity="0.5"/>`;
}

function planter(x, y, s, color, defs, size = 1) {
  const w = 280 * s * size, h = 330 * s * size, ry = 28 * s * size;
  const body = cylGrad(color, defs);
  const soil = vGrad(dark(color, 0.45), dark(color, 0.2), defs);
  const saucerW = w * 1.05;
  return `${shadow(x, y + 6 * s, saucerW * 0.62, 22 * s, defs)}
  <ellipse cx="${x}" cy="${y}" rx="${saucerW / 2}" ry="${ry * 0.9}" fill="${dark(color, 0.18)}"/>
  <path d="M${x - saucerW / 2} ${y - 22 * s * size} L${x - saucerW / 2} ${y} A${saucerW / 2} ${ry * 0.9} 0 0 0 ${x + saucerW / 2} ${y} L${x + saucerW / 2} ${y - 22 * s * size} Z" fill="${body}"/>
  <ellipse cx="${x}" cy="${y - 22 * s * size}" rx="${saucerW / 2}" ry="${ry * 0.9}" fill="${light(color, 0.12)}"/>
  <path d="M${x - w / 2} ${y - h} L${x - w * 0.4} ${y - 26 * s * size} A${w * 0.4} ${ry * 0.8} 0 0 0 ${x + w * 0.4} ${y - 26 * s * size} L${x + w / 2} ${y - h} Z" fill="${body}"/>
  <ellipse cx="${x}" cy="${y - h}" rx="${w / 2}" ry="${ry}" fill="${light(color, 0.18)}"/>
  <ellipse cx="${x}" cy="${y - h + 4 * s}" rx="${w / 2 - 12 * s}" ry="${ry - 8 * s}" fill="${soil}"/>`;
}

function felt(color, defs) {
  const p = id("ft");
  defs.push(`<pattern id="${p}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/><circle cx="2" cy="3" r="0.8" fill="${light(color, 0.1)}"/><circle cx="6" cy="6" r="0.7" fill="${dark(color, 0.1)}"/></pattern>`);
  return `url(#${p})`;
}
function deskPad(x, y, s, color, defs, size = 1) {
  const w = 760 * s * size, h = 300 * s, skew = 120 * s;
  const fill = felt(color, defs);
  const l = x - w / 2, r = x + w / 2;
  return `${shadow(x, y + 4 * s, w * 0.52, 18 * s, defs, 0.22)}
  <path d="M${l} ${y} L${l + skew} ${y - h} L${r + skew * 0.25} ${y - h} L${r} ${y} Z" fill="${fill}"/>
  <path d="M${l} ${y} L${r} ${y} L${r} ${y + 8 * s} L${l} ${y + 8 * s} Z" fill="#b48a5e"/>
  <path d="M${l + 16 * s} ${y - 10 * s} L${l + skew + 12 * s} ${y - h + 10 * s} L${r + skew * 0.25 - 16 * s} ${y - h + 10 * s} L${r - 14 * s} ${y - 10 * s} Z" fill="none" stroke="${light(color, 0.2)}" stroke-width="${2 * s}" stroke-dasharray="${5 * s} ${5 * s}" opacity="0.6"/>`;
}

function monitorStand(x, y, s, defs) {
  const w = 620 * s, d = 60 * s, t = 34 * s, legH = 110 * s;
  const top = dGrad("#8a5a3b", "#5b3a26", defs);
  const front = vGrad("#6a432b", "#4a2e1d", defs);
  const leg = vGrad("#3a3a3a", "#1d1d1d", defs);
  const l = x - w / 2, r = x + w / 2, ty = y - legH - t;
  return `${shadow(x, y + 4 * s, w * 0.55, 20 * s, defs)}
  <rect x="${l + 40 * s}" y="${y - legH}" width="${18 * s}" height="${legH}" fill="${leg}"/>
  <rect x="${r - 58 * s}" y="${y - legH}" width="${18 * s}" height="${legH}" fill="${leg}"/>
  <rect x="${l + 70 * s}" y="${y - legH - 4 * s}" width="${12 * s}" height="${legH - d}" fill="#2a2a2a" opacity="0.7"/>
  <rect x="${r - 84 * s}" y="${y - legH - 4 * s}" width="${12 * s}" height="${legH - d}" fill="#2a2a2a" opacity="0.7"/>
  <path d="M${l} ${ty} L${l + d} ${ty - d} L${r + d} ${ty - d} L${r} ${ty} Z" fill="${top}"/>
  <rect x="${l}" y="${ty}" width="${w}" height="${t}" fill="${front}"/>
  <path d="M${r} ${ty} L${r + d} ${ty - d} L${r + d} ${ty - d + t} L${r} ${ty + t} Z" fill="#3e2617"/>
  <path d="M${l + 30 * s} ${ty - d / 2} h ${w - 40 * s}" stroke="#d9b08a" stroke-width="${1.5 * s}" opacity="0.25"/>`;
}

function notebook(x, y, s, color, defs, angle = -8) {
  const w = 300 * s, h = 420 * s;
  const cover = dGrad(light(color, 0.08), dark(color, 0.12), defs);
  return `${shadow(x + 20 * s, y + 4 * s, w * 0.7, 18 * s, defs)}
  <g transform="rotate(${angle} ${x} ${y})">
  <rect x="${x - w / 2 + 12 * s}" y="${y - h + 6 * s}" width="${w}" height="${h}" rx="${8 * s}" fill="#efe9dd"/>
  <path d="M${x - w / 2 + 14 * s} ${y - 4 * s} h ${w - 6 * s}" stroke="#d8cfbf" stroke-width="${3 * s}"/>
  <rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${8 * s}" fill="${cover}"/>
  <rect x="${x - w / 2}" y="${y - h}" width="${18 * s}" height="${h}" rx="${6 * s}" fill="${dark(color, 0.2)}" opacity="0.6"/>
  <rect x="${x + w / 2 - 46 * s}" y="${y - h}" width="${12 * s}" height="${h}" fill="${dark(color, 0.35)}"/>
  <path d="M${x - 10 * s} ${y} l ${-6 * s} ${50 * s} l ${10 * s} ${-10 * s} l ${10 * s} ${10 * s} l ${-4 * s} ${-50 * s} Z" fill="#b8a27a"/>
  </g>`;
}

function weekender(x, y, s, color, defs) {
  const w = 600 * s, h = 300 * s;
  const body = vGrad(light(color, 0.06), dark(color, 0.22), defs);
  const leather = dGrad("#8a5634", "#5c3420", defs);
  const l = x - w / 2, r = x + w / 2;
  return `${shadow(x, y + 6 * s, w * 0.55, 26 * s, defs)}
  <path d="M${l + 140 * s} ${y - h + 6 * s} C${l + 150 * s} ${y - h - 150 * s} ${r - 150 * s} ${y - h - 150 * s} ${r - 140 * s} ${y - h + 6 * s}" fill="none" stroke="${leather}" stroke-width="${22 * s}" stroke-linecap="round"/>
  <path d="M${l + 20 * s} ${y - 30 * s} Q${l} ${y - h * 0.55} ${l + 50 * s} ${y - h} L${r - 50 * s} ${y - h} Q${r} ${y - h * 0.55} ${r - 20 * s} ${y - 30 * s} Q${r - 26 * s} ${y} ${r - 60 * s} ${y} L${l + 60 * s} ${y} Q${l + 26 * s} ${y} ${l + 20 * s} ${y - 30 * s} Z" fill="${body}"/>
  <path d="M${l + 50 * s} ${y - h + 22 * s} L${r - 50 * s} ${y - h + 22 * s}" stroke="#2d2a26" stroke-width="${5 * s}"/>
  <path d="M${l + 50 * s} ${y - h + 22 * s} L${r - 50 * s} ${y - h + 22 * s}" stroke="#bfa57a" stroke-width="${2 * s}" stroke-dasharray="${3 * s} ${3 * s}"/>
  <rect x="${r - 120 * s}" y="${y - h + 14 * s}" width="${16 * s}" height="${44 * s}" rx="${4 * s}" fill="#bfa57a"/>
  <rect x="${l + 128 * s}" y="${y - h + 4 * s}" width="${32 * s}" height="${70 * s}" rx="${6 * s}" fill="${leather}"/>
  <rect x="${r - 160 * s}" y="${y - h + 4 * s}" width="${32 * s}" height="${70 * s}" rx="${6 * s}" fill="${leather}"/>
  <path d="M${l + 24 * s} ${y - 40 * s} Q${l + 10 * s} ${y - h * 0.55} ${l + 54 * s} ${y - h + 8 * s} L${l + 90 * s} ${y - h + 8 * s} Q${l + 50 * s} ${y - h * 0.55} ${l + 64 * s} ${y - 10 * s} Z" fill="${leather}" opacity="0.92"/>
  <path d="M${r - 24 * s} ${y - 40 * s} Q${r - 10 * s} ${y - h * 0.55} ${r - 54 * s} ${y - h + 8 * s} L${r - 90 * s} ${y - h + 8 * s} Q${r - 50 * s} ${y - h * 0.55} ${r - 64 * s} ${y - 10 * s} Z" fill="${leather}" opacity="0.92"/>
  <path d="M${l + 120 * s} ${y - h * 0.45} q ${60 * s} ${20 * s} ${140 * s} ${-6 * s}" stroke="${dark(color, 0.25)}" stroke-width="${2 * s}" fill="none" opacity="0.4"/>
  <path d="M${r - 220 * s} ${y - h * 0.3} q ${50 * s} ${-16 * s} ${110 * s} ${8 * s}" stroke="${light(color, 0.2)}" stroke-width="${2 * s}" fill="none" opacity="0.35"/>`;
}

function mesh(defs) {
  const p = id("ms");
  defs.push(`<pattern id="${p}" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#2b2b2b" opacity="0.18"/><circle cx="3.5" cy="3.5" r="1.6" fill="#ffffff" opacity="0.25"/></pattern>`);
  return `url(#${p})`;
}
function packingCube(x, y, s, color, defs, w = 400, h = 150) {
  w *= s; h *= s;
  const body = vGrad(light(color, 0.08), dark(color, 0.15), defs);
  const topFace = light(color, 0.14);
  const d = 50 * s;
  const l = x - w / 2, r = x + w / 2;
  return `<path d="M${l} ${y - h} L${l + d} ${y - h - d * 0.6} L${r + d} ${y - h - d * 0.6} L${r} ${y - h} Z" fill="${topFace}"/>
  <rect x="${l + 30 * s}" y="${y - h - d * 0.5}" width="${w - 30 * s}" height="${d * 0.36}" fill="${mesh(defs)}" transform="skewX(-40)" transform-origin="${l} ${y - h}"/>
  <rect x="${l}" y="${y - h}" width="${w}" height="${h}" rx="${8 * s}" fill="${body}"/>
  <path d="M${r} ${y - h} L${r + d} ${y - h - d * 0.6} L${r + d} ${y - d * 0.6} L${r} ${y} Z" fill="${dark(color, 0.22)}"/>
  <path d="M${l + 10 * s} ${y - h + 12 * s} H${r - 10 * s}" stroke="${dark(color, 0.4)}" stroke-width="${4 * s}"/>
  <rect x="${l + 22 * s}" y="${y - h + 6 * s}" width="${30 * s}" height="${12 * s}" rx="${4 * s}" fill="#9a9a9a"/>
  <rect x="${l + 24 * s}" y="${y - h * 0.62}" width="${w - 48 * s}" height="${h * 0.42}" rx="${6 * s}" fill="${mesh(defs)}"/>`;
}
function cubeStack(x, y, s, color, defs) {
  return `${shadow(x + 20 * s, y + 6 * s, 260 * s, 22 * s, defs)}
  ${packingCube(x, y, s, color, defs, 440, 160)}
  ${packingCube(x - 10 * s, y - 166 * s, s, color, defs, 380, 130)}
  ${packingCube(x + 6 * s, y - 302 * s, s, color, defs, 300, 110)}`;
}

function zipPouch(x, y, s, color, defs) {
  const w = 440 * s, h = 270 * s;
  const body = dGrad(light(color, 0.06), dark(color, 0.16), defs);
  const l = x - w / 2, t = y - h;
  return `${shadow(x, y + 4 * s, w * 0.55, 16 * s, defs, 0.24)}
  <path d="M${l + 20 * s} ${t} H${l + w - 20 * s} Q${l + w} ${t} ${l + w} ${t + 30 * s} V${y - 20 * s} Q${l + w} ${y} ${l + w - 30 * s} ${y} H${l + 30 * s} Q${l} ${y} ${l} ${y - 20 * s} V${t + 30 * s} Q${l} ${t} ${l + 20 * s} ${t} Z" fill="${body}"/>
  <path d="M${l + 16 * s} ${t + 26 * s} H${l + w - 16 * s}" stroke="#2f2b27" stroke-width="${8 * s}"/>
  <path d="M${l + 16 * s} ${t + 26 * s} H${l + w - 16 * s}" stroke="#c7b28a" stroke-width="${3 * s}" stroke-dasharray="${3 * s} ${3 * s}"/>
  <rect x="${l + w - 92 * s}" y="${t + 16 * s}" width="${48 * s}" height="${20 * s}" rx="${4 * s}" fill="#b49a6a"/>
  <path d="M${l + w - 44 * s} ${t + 26 * s} q ${40 * s} ${4 * s} ${46 * s} ${40 * s}" stroke="#7c5236" stroke-width="${10 * s}" fill="none" stroke-linecap="round"/>
  <rect x="${l + 36 * s}" y="${y - 70 * s}" width="${120 * s}" height="${36 * s}" rx="${4 * s}" fill="${dark(color, 0.25)}" opacity="0.35"/>`;
}

// ---------- product scenes ----------
const W = 1200, H = 1500; // 4:5 product imagery

function scene(drawFn, bg, { zoom } = {}) {
  uid = 0;
  const defs = [];
  const body = backdrop(W, H, bg, 0.62, defs) + drawFn(defs);
  let viewBox;
  if (zoom) {
    const vw = W / zoom.scale, vh = H / zoom.scale;
    viewBox = `${zoom.cx - vw / 2} ${zoom.cy - vh / 2} ${vw} ${vh}`;
  }
  return svg(W, H, defs, body, viewBox);
}

const products = {
  "stoneware-mug-set": {
    colors: { sand: "#d8c6ad", slate: "#5d6670", moss: "#6f7a5a" },
    draw: (c) => (defs) => mug(420, 1130, 1.85, dark(c, 0.03), defs) + mug(780, 1240, 2.0, c, defs),
    bg: "linen",
    detail: { cx: 800, cy: 880, scale: 2 },
  },
  "glass-pour-over-set": {
    single: true,
    draw: () => (defs) => pourOver(600, 1180, 1.6, defs),
    bg: "stone",
    extra: [{ bg: "clay", draw: (defs) => pourOver(600, 1160, 1.5, defs) + mug(930, 1200, 0.9, "#d8c6ad", defs) }],
    detail: { cx: 600, cy: 620, scale: 2 },
  },
  "acacia-cutting-board": {
    single: true,
    draw: () => (defs) => cuttingBoard(600, 1180, 1.55, defs),
    bg: "linen",
    extra: [{ bg: "stone", draw: (defs) => cuttingBoard(500, 1150, 1.3, defs, 1.1) + cuttingBoard(760, 1210, 1.1, defs, 0.85) }],
    detail: { cx: 600, cy: 760, scale: 2.2 },
  },
  "waffle-knit-throw": {
    colors: { oatmeal: "#e2d6c2", charcoal: "#4a4a4c", sage: "#9aa58c" },
    draw: (c) => (defs) => throwBlanket(600, 1160, 1.6, c, defs),
    bg: "stone",
    detail: { cx: 600, cy: 900, scale: 2.6 },
  },
  "linen-blend-pillow-cover": {
    colors: { natural: "#ddd2bf", clay: "#b9846a" },
    draw: (c) => (defs) => pillow(600, 1180, 1.85, c, defs),
    bg: "linen",
    detail: { cx: 600, cy: 800, scale: 2.6 },
  },
  "ceramic-table-planter": {
    colors: { white: "#ecebe6", charcoal: "#45474a" },
    draw: (c) => (defs) => planter(600, 1200, 1.75, c, defs),
    bg: "sage",
    detail: { cx: 600, cy: 900, scale: 2 },
  },
  "wool-felt-desk-pad": {
    colors: { charcoal: "#3f4144", gray: "#8f9295" },
    draw: (c) => (defs) => deskPad(560, 1040, 1.25, c, defs) + notebook(520, 980, 0.55, "#2f3b4a", defs, 70),
    bg: "slate",
    detail: { cx: 760, cy: 900, scale: 2.6 },
  },
  "walnut-monitor-stand": {
    single: true,
    draw: () => (defs) => monitorStand(580, 1120, 1.45, defs),
    bg: "stone",
    extra: [{ bg: "slate", draw: (defs) => monitorStand(560, 1120, 1.4, defs) + notebook(820, 1250, 0.55, "#2f4a3c", defs, -4) }],
    detail: { cx: 600, cy: 900, scale: 2.4 },
  },
  "hardcover-dot-grid-notebook": {
    colors: { navy: "#2c3a52", forest: "#2f4a3c", black: "#252525" },
    draw: (c) => (defs) => notebook(600, 1200, 1.85, c, defs, -6),
    bg: "linen",
    detail: { cx: 640, cy: 740, scale: 2.2 },
  },
  "waxed-canvas-weekender": {
    colors: { olive: "#6c6a45", navy: "#2f3a4f" },
    draw: (c) => (defs) => weekender(600, 1180, 1.7, c, defs),
    bg: "stone",
    detail: { cx: 600, cy: 640, scale: 2.4 },
  },
  "packing-cube-set": {
    colors: { gray: "#6f7275", navy: "#34405a" },
    draw: (c) => (defs) => cubeStack(560, 1230, 1.65, c, defs),
    bg: "slate",
    detail: { cx: 540, cy: 1060, scale: 2.4 },
  },
  "canvas-zip-pouch": {
    colors: { natural: "#d9ccb4", black: "#2b2b2b" },
    draw: (c) => (defs) => zipPouch(600, 1140, 1.9, c, defs),
    bg: "clay",
    detail: { cx: 820, cy: 720, scale: 2.4 },
  },
};

const written = [];
function write(rel, content) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(rel);
}

for (const [slug, p] of Object.entries(products)) {
  if (p.single) {
    write(`products/${slug}/1.svg`, scene(p.draw(), p.bg));
    p.extra.forEach((e, i) => write(`products/${slug}/${i + 2}.svg`, scene(e.draw, e.bg)));
    write(`products/${slug}/detail.svg`, scene(p.draw(), p.bg, { zoom: p.detail }));
  } else {
    const entries = Object.entries(p.colors);
    for (const [name, color] of entries) write(`products/${slug}/${name}.svg`, scene(p.draw(color), p.bg));
    write(`products/${slug}/detail.svg`, scene(p.draw(entries[0][1]), p.bg, { zoom: p.detail }));
  }
}

// ---------- lifestyle / collection compositions ----------
function wide(w, h, bg, horizon, drawFn) {
  uid = 0;
  const defs = [];
  return svg(w, h, defs, backdrop(w, h, bg, horizon, defs) + drawFn(defs));
}

// Hero: a set table — pour-over, mugs, cutting board, notebook, planter.
write("lifestyle/hero.svg", wide(1600, 1200, "linen", 0.58, (defs) =>
  `<rect x="0" y="${1200 * 0.58}" width="1600" height="16" fill="#cfc4b3" opacity="0.6"/>` +
  cuttingBoard(330, 960, 1.15, defs) +
  pourOver(720, 1010, 1.25, defs) +
  mug(1010, 1040, 1.0, "#d8c6ad", defs) +
  mug(1180, 1090, 1.05, "#5d6670", defs) +
  planter(1400, 1000, 0.85, "#ecebe6", defs)));

write("collections/kitchen-dining.svg", wide(1200, 900, "linen", 0.6, (defs) =>
  cuttingBoard(340, 780, 1.0, defs) + pourOver(640, 800, 1.05, defs) + mug(900, 820, 0.95, "#d8c6ad", defs)));
write("collections/home-living.svg", wide(1200, 900, "sage", 0.6, (defs) =>
  throwBlanket(420, 800, 0.95, "#e2d6c2", defs) + pillow(820, 760, 0.85, "#b9846a", defs) + planter(1050, 800, 0.6, "#ecebe6", defs)));
write("collections/desk-office.svg", wide(1200, 900, "slate", 0.6, (defs) =>
  monitorStand(560, 760, 1.05, defs) + notebook(960, 820, 0.7, "#2f4a3c", defs, -5)));
write("collections/travel-carry.svg", wide(1200, 900, "stone", 0.6, (defs) =>
  weekender(480, 800, 1.0, "#6c6a45", defs) + zipPouch(930, 820, 0.8, "#d9ccb4", defs)));

// About page / shopping-info band.
write("lifestyle/workspace.svg", wide(1600, 1000, "stone", 0.6, (defs) =>
  deskPad(760, 820, 1.2, "#3f4144", defs) + notebook(560, 760, 0.5, "#2c3a52", defs, 60) + mug(1080, 760, 0.8, "#5d6670", defs) + planter(1320, 760, 0.6, "#45474a", defs)));

console.log(`Wrote ${written.length} images to public/images`);
