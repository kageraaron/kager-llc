// Generates a branded, embeddable drug-combination safety chart (SVG + PNG)
// from the live interaction data in src/pages/interactions.astro, so the chart
// never drifts from the interactive checker. Run: node scripts/build-interaction-chart.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url);
const CHECKER_URL = 'https://www.ravewellness.org/interactions.html';

// --- Substance order + display names (matches the interactions.astro tiles) ---
const SUBS = [
  ['mdma', 'MDMA'], ['lsd', 'LSD'], ['psilocybin', 'Psilocybin'], ['ketamine', 'Ketamine'],
  ['cocaine', 'Cocaine'], ['nitrous', 'Nitrous'], ['cannabis', 'Cannabis'], ['alcohol', 'Alcohol'],
  ['caffeine', 'Caffeine'], ['ssri', 'SSRIs'], ['maoi', 'MAOIs'], ['benzo', 'Benzos'],
  ['amphetamine', 'Amphetamine'], ['2cb', '2C-B'], ['lithium', 'Lithium'], ['ghb', 'GHB / GBL'],
  ['tramadol', 'Tramadol'], ['poppers', 'Poppers'], ['nicotine', 'Nicotine'], ['dmt', 'DMT'],
  ['opioids', 'Opioids'], ['mescaline', 'Mescaline'], ['viagra', 'Viagra / PDE5'],
];
const NAME = Object.fromEntries(SUBS.map(([id, n]) => [id, n]));

// --- Pull every pair + severity straight from the source of truth ---
const src = readFileSync(new URL('src/pages/interactions.astro', ROOT), 'utf8');
const re = /\[key\('([^']+)','([^']+)'\)\]:\s*{\s*severity:\s*'([^']+)'/g;
const sev = {};
let m, pairCount = 0;
while ((m = re.exec(src))) { sev[[m[1], m[2]].sort().join('|')] = m[3]; pairCount++; }
const sevOf = (a, b) => sev[[a, b].sort().join('|')] || 'unknown';

// --- Palette (matches the site's severity + brand colors) ---
const C = {
  bg: '#06061a', panel: '#10102e', line: 'rgba(255,255,255,0.10)',
  text: '#e2e8f0', muted: '#94a3b8', dim: '#788899',
  purple: '#8b5cf6', purpleLight: '#a78bfa',
  danger: '#ef4444', caution: '#f59e0b', moderate: '#06b6d4', low: '#10b981',
  unknown: '#23233f', self: '#191934',
};
const SEV_FILL = { danger: C.danger, caution: C.caution, moderate: C.moderate, low: C.low, unknown: C.unknown };
const LEGEND = [
  ['danger', 'Dangerous'], ['caution', 'High risk'], ['moderate', 'Caution'],
  ['low', 'Low risk'], ['unknown', 'No data'],
];

// --- Geometry: FULL mirrored square matrix, labels on all four edges, so any
//     pair can be found from either substance's row or column. ---
const N = SUBS.length;
const cell = 32, gridW = N * cell;
const padX = 40, labelW = 132;           // side label gutters (left + right)
const labelH = 132;                       // rotated label gutters (top + bottom)
const headerH = 200, legendH = 46, footerH = 92;
const gx = padX + labelW;                 // grid origin x
const gy = headerH + legendH + labelH;    // grid origin y
const W = padX + labelW + gridW + labelW + padX;
const H = gy + gridW + labelH + footerH;
const FONT = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let svg = '';
const push = (s) => { svg += s; };

// Background
push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);

// --- Header: wordmark + title (left), QR card (right) ---
push(`<g font-family="${FONT}">`);
push(`<circle cx="${padX + 14}" cy="44" r="14" fill="${C.purple}"/>`);
push(`<text x="${padX + 36}" y="50" font-size="22" font-weight="800" fill="${C.text}">Rave<tspan fill="${C.purpleLight}">Wellness</tspan></text>`);
push(`<text x="${padX}" y="104" font-size="36" font-weight="800" fill="${C.text}">Drug Combination Safety Chart</text>`);
push(`<text x="${padX}" y="134" font-size="15" fill="${C.muted}">Pairwise interaction risks for 23 common festival and nightlife substances.</text>`);
push(`<text x="${padX}" y="156" font-size="15" fill="${C.muted}">Find any pair from either edge: pick one substance on a side, the other on the top or bottom, read where they cross.</text>`);
push(`</g>`);

// QR card (drawn as rects for clean rasterization), top-right of header
const qr = QRCode.create(CHECKER_URL, { errorCorrectionLevel: 'M' });
const qn = qr.modules.size, qdata = qr.modules.data;
const qrPx = 116, qmod = qrPx / qn, quiet = qmod * 3;
const cardW = qrPx + quiet * 2;
const qcardX = W - padX - cardW, qcardY = 28;
push(`<rect x="${qcardX}" y="${qcardY}" width="${cardW}" height="${cardW}" rx="10" fill="#ffffff"/>`);
push(`<g fill="#150e33">`);
for (let r = 0; r < qn; r++) for (let c = 0; c < qn; c++) {
  if (qdata[r * qn + c]) {
    const rx = (qcardX + quiet + c * qmod).toFixed(2), ry = (qcardY + quiet + r * qmod).toFixed(2);
    push(`<rect x="${rx}" y="${ry}" width="${qmod.toFixed(2)}" height="${qmod.toFixed(2)}"/>`);
  }
}
push(`</g>`);
push(`<text x="${qcardX + cardW / 2}" y="${qcardY + cardW + 20}" font-family="${FONT}" font-size="12.5" font-weight="700" fill="${C.text}" text-anchor="middle">Scan for the live checker</text>`);
push(`<text x="${qcardX + cardW / 2}" y="${qcardY + cardW + 37}" font-family="${FONT}" font-size="11.5" fill="${C.muted}" text-anchor="middle">ravewellness.org/interactions</text>`);

// --- Legend strip (horizontal), centered over the grid ---
const legendY = headerH + legendH / 2;
const legendItems = LEGEND.map(([k, lbl]) => ({ k, lbl, w: 26 + lbl.length * 7.6 + 24 }));
const legendTotal = legendItems.reduce((a, it) => a + it.w, 0);
let lx = gx + (gridW - legendTotal) / 2;
push(`<g font-family="${FONT}">`);
legendItems.forEach(({ k, lbl, w }) => {
  push(`<rect x="${lx}" y="${legendY - 9}" width="18" height="18" rx="4" fill="${SEV_FILL[k]}" fill-opacity="${k === 'unknown' ? 1 : 0.92}" stroke="${C.line}"/>`);
  push(`<text x="${lx + 26}" y="${legendY + 5}" font-size="14" font-weight="600" fill="${C.text}">${esc(lbl)}</text>`);
  lx += w;
});
push(`</g>`);

// --- Column labels (top + bottom), rotated ---
push(`<g font-family="${FONT}" font-size="12.5" font-weight="600" fill="${C.text}">`);
SUBS.forEach(([, name], j) => {
  const cx = gx + j * cell + cell / 2 + 4;
  push(`<text x="${cx}" y="${gy - 8}" transform="rotate(-90 ${cx} ${gy - 8})" text-anchor="start">${esc(name)}</text>`);
  const bx = gx + j * cell + cell / 2 + 4, by = gy + gridW + 8;
  push(`<text x="${bx}" y="${by}" transform="rotate(-90 ${bx} ${by})" text-anchor="end">${esc(name)}</text>`);
});
push(`</g>`);

// --- Row labels (left + right) ---
push(`<g font-family="${FONT}" font-size="12.5" font-weight="600" fill="${C.text}">`);
SUBS.forEach(([, name], i) => {
  const y = gy + i * cell + cell / 2 + 4;
  push(`<text x="${gx - 10}" y="${y}" text-anchor="end">${esc(name)}</text>`);
  push(`<text x="${gx + gridW + 10}" y="${y}" text-anchor="start">${esc(name)}</text>`);
});
push(`</g>`);

// --- Matrix cells: full square, both triangles mirrored ---
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = gx + j * cell, y = gy + i * cell;
    if (i === j) {
      // self / diagonal: dark with a subtle slash so it reads as "n/a"
      push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${C.self}" stroke="${C.bg}" stroke-width="1.5"/>`);
      push(`<line x1="${x + 6}" y1="${y + cell - 6}" x2="${x + cell - 6}" y2="${y + 6}" stroke="${C.line}" stroke-width="1.5"/>`);
    } else {
      const s = sevOf(SUBS[i][0], SUBS[j][0]);
      push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${SEV_FILL[s]}" fill-opacity="${s === 'unknown' ? 1 : 0.92}" stroke="${C.bg}" stroke-width="1.5"/>`);
    }
  }
}

// --- Footer ---
push(`<g font-family="${FONT}">`);
push(`<line x1="${padX}" y1="${H - footerH + 16}" x2="${W - padX}" y2="${H - footerH + 16}" stroke="${C.line}"/>`);
push(`<text x="${padX}" y="${H - footerH + 42}" font-size="13" fill="${C.muted}">Not medical advice. Risks summarize published evidence and harm-reduction consensus; a "No data" square means insufficient evidence, not safety.</text>`);
push(`<text x="${padX}" y="${H - footerH + 62}" font-size="13" fill="${C.muted}">When in doubt, research both substances independently and start low.</text>`);
push(`<text x="${padX}" y="${H - 20}" font-size="14" font-weight="700" fill="${C.purpleLight}">ravewellness.org/interactions</text>`);
push(`<text x="${W - padX}" y="${H - 20}" font-size="12" fill="${C.dim}" text-anchor="end">© Rave Wellness · ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</text>`);
push(`</g>`);

const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${svg}</svg>`;
const svgPath = fileURLToPath(new URL('public/drug-interaction-chart.svg', ROOT));
const pngPath = fileURLToPath(new URL('public/drug-interaction-chart.png', ROOT));
writeFileSync(svgPath, out);
await sharp(Buffer.from(out), { density: 192 }).png().toFile(pngPath);

console.log(`Chart built: ${N} substances, ${pairCount} pairs, ${W}x${H}px`);
console.log(`  -> public/drug-interaction-chart.svg`);
console.log(`  -> public/drug-interaction-chart.png`);
