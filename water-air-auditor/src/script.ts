import {
  ZIP_DATA,
  STANDARDS,
  STATE_DATA,
  STATE_NAME_TO_CODE,
  classify,
  lookupZip,
  severityForState,
  type MapFilter,
  type ZipEntry,
} from "./data";

// Declare Leaflet global
declare const L: any;

// ===========================================================================
// ZIP CODE LOOKUP + RESULTS RENDERING
// ===========================================================================

const form = document.getElementById("zip-form") as HTMLFormElement | null;
const input = document.getElementById("zip-input") as HTMLInputElement | null;
const results = document.getElementById("results") as HTMLDivElement | null;

const STATUS_LABELS: { [key: string]: string } = {
  clean:    "Clean",
  ok:       "OK",
  elevated: "Elevated",
  high:     "High",
  severe:   "Severe"
};

const PRODUCT_RECOMMENDATIONS = {
  pfas:    { name: "AquaTru Reverse Osmosis", reason: "RO removes >95% of PFAS — far above what carbon pitchers achieve." },
  lead:    { name: "Berkey + PF-2 (or AquaTru)", reason: "NSF 53-certified lead reduction at the kitchen tap." },
  pm25:    { name: "Blueair Blue Pure 211i Max", reason: "True HEPA sized for whole-room PM2.5 reduction." },
  combo:   { name: "AquaTru + Blueair 211i Max", reason: "Cover both water (PFAS/lead) and air (PM2.5) with proven hardware." },
  monitor: { name: "Tap Score water test + Airthings monitor", reason: "Verify your specific tap and indoor air before committing to gear." }
};

function renderResults(zip: string, data: ZipEntry | null) {
  if (!results) return;

  if (!data) {
    results.hidden = false;
    results.innerHTML = `
      <div class="results-error">
        <strong>No data for ZIP ${escapeHtml(zip)}</strong>
        <p>Try one of the samples below the input, or look up your area at <a href="https://www.ewg.org/tapwater/" target="_blank" rel="noopener">EWG Tap Water Database</a> and <a href="https://www.airnow.gov" target="_blank" rel="noopener">AirNow</a>.</p>
      </div>
    `;
    return;
  }

  const pfasClass  = classify("pfas_ppt", data.pfas_ppt);
  const leadClass  = classify("lead_ppb", data.lead_ppb);
  const pm25Class  = classify("pm25",     data.pm25);

  const overall = worstOf([pfasClass, leadClass, pm25Class]);
  const summary = buildSummary(pfasClass, leadClass, pm25Class, data);
  const recommendation = recommendProduct(pfasClass, leadClass, pm25Class);

  // Personalize the share text now that we know the user's audit result.
  lastAuditShareSnippet =
    `My ${data.city} audit: ${STATUS_LABELS[overall].toLowerCase()} risk across PFAS, lead, and PM2.5.`;

  results.hidden = false;
  results.innerHTML = `
    <div class="results-header">
      <div>
        <div class="results-zip">ZIP ${escapeHtml(zip)}</div>
        <div class="results-city">${escapeHtml(data.city)}</div>
        <div class="results-source">Source: ${escapeHtml(data.source)}</div>
      </div>
      <div class="results-overall">
        Overall risk
        <div class="overall-score score-${overall}">${STATUS_LABELS[overall]}</div>
      </div>
    </div>

    <div class="results-metrics">
      ${metricCard("PFAS", data.pfas_ppt, "ppt", pfasClass, STANDARDS.pfas_ppt.epaMCL || 4, "EPA limit 4 ppt")}
      ${metricCard("Lead", data.lead_ppb, "ppb", leadClass, STANDARDS.lead_ppb.epaActionLevel || 15, "Action level 15 ppb")}
      ${metricCard("PM2.5", data.pm25, "µg/m³", pm25Class, STANDARDS.pm25.epaAnnualNAAQS || 9, "EPA annual 9 µg/m³")}
    </div>

    <div class="results-summary">${summary} <em>${escapeHtml(data.notes)}</em></div>

    <div class="results-recommendation">
      <div class="recommendation-text">
        <strong>${escapeHtml(recommendation.name)}</strong> — ${escapeHtml(recommendation.reason)}
      </div>
      <a href="#shop" class="btn btn-sm btn-primary">See Recommended Gear →</a>
    </div>

    <div class="results-share">
      <span class="share-share-text">Share this result:</span>
      <button type="button" class="share-btn share-x" data-share="twitter" aria-label="Share to X">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        <span>X</span>
      </button>
      <button type="button" class="share-btn share-facebook" data-share="facebook" aria-label="Share to Facebook">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
        <span>Facebook</span>
      </button>
      <button type="button" class="share-btn share-instagram" data-share="instagram" aria-label="Share on Instagram">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85 0 3.2-.01 3.58-.07 4.85-.15 3.22-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07-3.2 0-3.58-.01-4.85-.07-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85 0-3.2.01-3.58.07-4.85.15-3.23 1.66-4.77 4.92-4.92 1.27-.06 1.65-.07 4.85-.07zM12 0c-3.26 0-3.67.01-4.95.07C2.69.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12c0 3.26.01 3.67.07 4.95.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24c3.26 0 3.67-.01 4.95-.07 4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95 0-3.26-.01-3.67-.07-4.95-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zm0 10.16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/></svg>
        <span>Instagram</span>
      </button>
      <button type="button" class="share-btn share-copy" data-share="copy" aria-label="Copy share link">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
  `;

  // Smooth-scroll the results into view
  setTimeout(() => results.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}

function metricCard(label: string, value: number, unit: string, cls: string, ref: number, refLabel: string) {
  // Bar fill: 100% at the ref value; cap at 200%
  const pct = Math.min(200, (value / ref) * 100);
  return `
    <div class="metric metric-${cls}">
      <div class="metric-label">
        <span>${label}</span>
        <span class="metric-status status-${cls}">${STATUS_LABELS[cls]}</span>
      </div>
      <div class="metric-value">${formatNumber(value)} <span class="metric-unit">${unit}</span></div>
      <div class="metric-bar"><div class="metric-bar-fill bar-${cls}" style="width: ${Math.min(100, pct)}%"></div></div>
      <div class="metric-ref">${refLabel} · ${Math.round(pct)}% of limit</div>
    </div>
  `;
}

function buildSummary(pfasClass: string, leadClass: string, pm25Class: string, data: ZipEntry) {
  const concerns = [];
  if (rank(pfasClass) >= 2) concerns.push(`PFAS at ${data.pfas_ppt} ppt (${STATUS_LABELS[pfasClass].toLowerCase()})`);
  if (rank(leadClass) >= 2) concerns.push(`lead at ${data.lead_ppb} ppb (${STATUS_LABELS[leadClass].toLowerCase()})`);
  if (rank(pm25Class) >= 2) concerns.push(`PM2.5 at ${data.pm25} µg/m³ (${STATUS_LABELS[pm25Class].toLowerCase()})`);

  if (concerns.length === 0) {
    return `Your area looks clean across the three pollutants we track. Maintain a basic carbon filter and keep an eye on Consumer Confidence Reports as utilities turn over.`;
  }
  if (concerns.length === 1) {
    return `Primary concern: <strong style="color:var(--text)">${concerns[0]}</strong>. Targeted filtration matched to this single risk gives the best return on spend.`;
  }
  return `Multiple elevated readings detected: <strong style="color:var(--text)">${concerns.join(" · ")}</strong>. A combined water + air solution is justified.`;
}

function recommendProduct(pfasClass: string, leadClass: string, pm25Class: string) {
  const waterRisk = Math.max(rank(pfasClass), rank(leadClass));
  const airRisk = rank(pm25Class);

  if (waterRisk >= 2 && airRisk >= 2) return PRODUCT_RECOMMENDATIONS.combo;
  if (waterRisk >= 2 && rank(pfasClass) >= rank(leadClass)) return PRODUCT_RECOMMENDATIONS.pfas;
  if (waterRisk >= 2) return PRODUCT_RECOMMENDATIONS.lead;
  if (airRisk >= 2) return PRODUCT_RECOMMENDATIONS.pm25;
  return PRODUCT_RECOMMENDATIONS.monitor;
}

const RANK: { [key: string]: number } = { clean: 0, ok: 1, elevated: 2, high: 3, severe: 4 };
const rank = (c: string) => RANK[c] ?? 0;
const worstOf = (classes: string[]) => classes.reduce((acc, c) => (rank(c) > rank(acc) ? c : acc), "clean");

function formatNumber(n: number) {
  if (n === 0)  return "0";
  if (n < 1)    return n.toFixed(1);
  if (n < 10)   return n.toFixed(1);
  return Math.round(n).toString();
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

// ===========================================================================
// SOCIAL SHARE
// ===========================================================================

/** Personalized prefix set after an audit, e.g. "My Wilmington, NC audit: high risk…" */
let lastAuditShareSnippet: string | null = null;

const BASE_SHARE_TEXT = "Check your local water and air quality by ZIP code — PFAS, lead, and PM2.5 with filter recommendations.";
const SHARE_HASHTAGS = "PFAS,LeadInWater,PM25,WaterQuality";

/** Canonical, public URL for sharing. Always points at the deployed domain so
 *  Facebook/LinkedIn/etc. can scrape Open Graph metadata even when the page is
 *  opened locally (file://) or from a preview deploy. */
const CANONICAL_SITE_URL = "https://waterairaudit.com/";

function getSiteUrl(): string {
  if (typeof window === "undefined") return CANONICAL_SITE_URL;
  const { protocol, origin, hostname, pathname } = window.location;
  // file:// or sandboxed about:srcdoc returns "null" — fall back to canonical.
  if (protocol === "file:" || origin === "null") return CANONICAL_SITE_URL;
  // Localhost / preview hosts can't be scraped by social crawlers — use canonical.
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".vercel.app") ||
    hostname.endsWith(".netlify.app") ||
    hostname.endsWith(".github.io")
  ) {
    return CANONICAL_SITE_URL;
  }
  return `${origin}${pathname}`;
}

function currentShareText(): string {
  return lastAuditShareSnippet
    ? `${lastAuditShareSnippet} ${BASE_SHARE_TEXT}`
    : BASE_SHARE_TEXT;
}

function buildShareUrl(platform: string): string | null {
  const url = encodeURIComponent(getSiteUrl());
  const text = encodeURIComponent(currentShareText());
  switch (platform) {
    case "facebook":
      // Facebook deprecated the `quote` parameter — the share dialog only renders
      // the link card built from Open Graph tags scraped from `u`. Pass only `u`.
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case "twitter":
      return `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${encodeURIComponent(SHARE_HASHTAGS)}`;
    default:
      return null;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;
function showToast(msg: string) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  // Force reflow so the transition runs even when the toast is reused.
  void toastEl.offsetWidth;
  toastEl.classList.add("toast-visible");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl?.classList.remove("toast-visible");
  }, 2600);
}

async function handleShare(platform: string) {
  const url = getSiteUrl();
  const text = currentShareText();
  const combined = `${text} ${url}`;

  switch (platform) {
    case "facebook":
    case "twitter": {
      const target = buildShareUrl(platform);
      if (target) window.open(target, "_blank", "noopener,noreferrer,width=620,height=540");
      break;
    }
    case "instagram": {
      // Instagram has no public web-share URL, so copy the message + link
      // and direct the user to paste it into a story or DM.
      const ok = await copyToClipboard(combined);
      showToast(ok
        ? "Link copied — paste it into your Instagram story or DM."
        : "Couldn't copy link. Long-press to copy manually.");
      break;
    }
    case "copy": {
      const ok = await copyToClipboard(combined);
      showToast(ok ? "Link copied to clipboard." : "Couldn't access clipboard.");
      break;
    }
    case "native": {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (typeof nav.share === "function") {
        try {
          await nav.share({ title: "WaterAirAudit", text, url });
        } catch {
          /* user cancelled */
        }
      } else {
        const ok = await copyToClipboard(combined);
        showToast(ok ? "Link copied — share it anywhere." : "Sharing isn't supported here.");
      }
      break;
    }
  }
}

// Delegated click handler — works for both the hero share bar and the
// share row that's rendered dynamically inside the results panel.
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement | null;
  const btn = target?.closest("[data-share]") as HTMLElement | null;
  if (!btn) return;
  const platform = btn.getAttribute("data-share");
  if (!platform) return;
  e.preventDefault();
  handleShare(platform);
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] || c);
}

// ===========================================================================
// EVENT WIRING — ZIP form + sample buttons
// ===========================================================================

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!input) return;
  const zip = (input.value || "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) {
    input.focus();
    return;
  }
  renderResults(zip, lookupZip(zip));
});

document.querySelectorAll(".sample-zip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const zip = (btn as HTMLElement).dataset.zip;
    if (zip && input) {
      input.value = zip;
      renderResults(zip, lookupZip(zip));
    }
  });
});

// ===========================================================================
// NAV / SCROLL BEHAVIOR
// ===========================================================================

const header = document.getElementById("site-header") as HTMLElement | null;
const navLinks = document.querySelector(".nav-links") as HTMLElement | null;
const navLinkItems = document.querySelectorAll('.nav-links a[href^="#"]');
const navToggle = document.querySelector(".nav-toggle") as HTMLElement | null;

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (this: HTMLAnchorElement, e: Event) {
    const href = this.getAttribute("href");
    if (!href || href === "#") return;
    // Map the "Look Up" nav alias to the actual hero section.
    const target = href === "#lookup"
      ? document.getElementById("hero")
      : document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      navLinks?.classList.remove("nav-open");
      navToggle?.setAttribute("aria-expanded", "false");
      if (href === "#lookup") setTimeout(() => input?.focus(), 350);
    }
  });
});

let lastScroll = 0;
window.addEventListener(
  "scroll",
  () => {
    if (!header) return;
    const currentScroll = window.scrollY;
    header.classList.toggle("scrolled", currentScroll > 40);
    if (currentScroll > 300) {
      header.classList.toggle("hidden", currentScroll > lastScroll);
    } else {
      header.classList.remove("hidden");
    }
    lastScroll = Math.max(0, currentScroll);
  },
  { passive: true }
);

const sections = document.querySelectorAll("section[id]");
const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute("id");
        navLinkItems.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
        });
      }
    });
  },
  { rootMargin: "-20% 0px -70% 0px" }
);
sections.forEach((section) => sectionObserver.observe(section));

navToggle?.addEventListener("click", () => {
  if (!navLinks || !navToggle) return;
  const isOpen = navLinks.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (e: MouseEvent) => {
  if (
    navLinks?.classList.contains("nav-open") &&
    !navLinks.contains(e.target as Node) &&
    !navToggle?.contains(e.target as Node)
  ) {
    navLinks.classList.remove("nav-open");
    navToggle?.setAttribute("aria-expanded", "false");
  }
});

// ===========================================================================
// INTERACTIVE NATIONAL RISK MAP
// ===========================================================================

let map: any = null;
let geoLayer: any = null;
let activeFilter: MapFilter = "overall";

const FILTER_LEGENDS: Record<MapFilter, { title: string; scale: string }> = {
  overall: {
    title: "Overall risk",
    scale: "Worst-of-three across PFAS, lead, and PM2.5.",
  },
  pfas: {
    title: "PFAS (PFOA + PFOS)",
    scale: "EPA MCL 4 ppt. Clean ≤2, OK ≤4, Elevated ≤10, High ≤30, Severe >30.",
  },
  lead: {
    title: "Lead at the tap",
    scale: "EPA action level 15 ppb. Clean ≤1, OK ≤5, Elevated ≤15, High ≤30, Severe >30.",
  },
  pm25: {
    title: "PM2.5 (annual avg)",
    scale: "EPA NAAQS 9 µg/m³. Clean ≤6, OK ≤9, Elevated ≤12, High ≤18, Severe >18.",
  },
};

function getRiskColor(cls: string) {
  switch (cls) {
    case "clean":    return "#10b981";
    case "ok":       return "#06b6d4";
    case "elevated": return "#f59e0b";
    case "high":     return "#ef4444";
    case "severe":   return "#7f1d1d";
    default:         return "#475569";
  }
}

function styleForFeature(feature: any) {
  const stateName: string = feature?.properties?.name || "";
  const code = STATE_NAME_TO_CODE[stateName];
  if (!code || !STATE_DATA[code]) {
    return {
      fillColor: "#1f2a3a",
      weight: 0.8,
      color: "rgba(255,255,255,0.18)",
      fillOpacity: 0.25,
    };
  }
  const sev = severityForState(code, activeFilter);
  return {
    fillColor: getRiskColor(sev),
    weight: 0.9,
    color: "rgba(255,255,255,0.45)",
    fillOpacity: 0.62,
  };
}

function repaintMap() {
  if (!geoLayer) return;
  geoLayer.eachLayer((layer: any) => {
    layer.setStyle(styleForFeature(layer.feature));
  });
}

function updateLegend() {
  const titleEl = document.getElementById("legend-title");
  const scaleEl = document.getElementById("legend-scale");
  if (titleEl) titleEl.textContent = FILTER_LEGENDS[activeFilter].title;
  if (scaleEl) scaleEl.textContent = FILTER_LEGENDS[activeFilter].scale;
}

function setActiveFilter(next: MapFilter) {
  if (next === activeFilter) return;
  activeFilter = next;
  document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((btn) => {
    const isActive = btn.dataset.filter === next;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  repaintMap();
  updateLegend();
}

document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter as MapFilter | undefined;
    if (filter) setActiveFilter(filter);
  });
});

function popupHtml(stateName: string, code: string) {
  const s = STATE_DATA[code];
  if (!s) return `<strong>${escapeHtml(stateName)}</strong>`;
  const overall = severityForState(code, "overall");
  return `
    <div class="popup-state">${escapeHtml(s.name)}</div>
    <div class="popup-row"><span>PFAS</span><strong>${formatNumber(s.pfas_ppt)} ppt</strong></div>
    <div class="popup-row"><span>Lead</span><strong>${formatNumber(s.lead_ppb)} ppb</strong></div>
    <div class="popup-row"><span>PM2.5</span><strong>${formatNumber(s.pm25)} µg/m³</strong></div>
    <div class="popup-row" style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.12);padding-top:6px;">
      <span>Overall</span><strong style="color:${getRiskColor(overall)}">${STATUS_LABELS[overall]}</strong>
    </div>
    <div class="popup-cta">Click to audit ${escapeHtml(s.representativeZip)}</div>
  `;
}

function initMap() {
  const mapEl = document.getElementById("risk-map");
  if (!mapEl) return;

  if (typeof L === "undefined") {
    mapEl.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text-muted);">Map library failed to load. Please check your connection.</div>';
    return;
  }

  try {
    map = L.map("risk-map", {
      center: [39.5, -98.35],
      zoom: 4,
      minZoom: 3,
      maxZoom: 8,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }
    ).addTo(map);

    fetch(
      "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
    )
      .then((res) => res.json())
      .then((geoData: any) => {
        geoLayer = L.geoJson(geoData, {
          style: styleForFeature,
          onEachFeature: (feature: any, layer: any) => {
            const stateName: string = feature?.properties?.name || "";
            const code = STATE_NAME_TO_CODE[stateName];

            layer.bindPopup(popupHtml(stateName, code), { closeButton: true });

            layer.on({
              mouseover: (e: any) => {
                const l = e.target;
                l.setStyle({
                  weight: 2,
                  color: "rgba(255,255,255,0.95)",
                  fillOpacity: 0.78,
                });
                l.bringToFront();
              },
              mouseout: () => {
                layer.setStyle(styleForFeature(feature));
              },
              click: () => {
                if (!code || !STATE_DATA[code]) return;
                const repZip = STATE_DATA[code].representativeZip;
                if (input) input.value = repZip;
                renderResults(repZip, lookupZip(repZip));
              },
            });
          },
        }).addTo(map);

        // Fit the layer once it's loaded so the user sees the whole country.
        try {
          map.fitBounds(geoLayer.getBounds(), { padding: [12, 12] });
        } catch {
          /* noop */
        }
      })
      .catch((err) => {
        console.error("Could not load states GeoJSON:", err);
        // Fall back to per-state circle markers using STATE_DATA centers.
        Object.values(STATE_DATA).forEach((s) => {
          const sev = severityForState(s.code, activeFilter);
          L.circleMarker(s.center, {
            radius: 9,
            fillColor: getRiskColor(sev),
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85,
          })
            .bindPopup(popupHtml(s.name, s.code))
            .addTo(map);
        });
      });

    // ZIP-marker overlay for known hotspot ZIPs (always shown over polygons).
    const HOTSPOT_ZIPS: Array<{ zip: string; coords: [number, number]; label: string }> = [
      { zip: "05401", coords: [44.4756, -73.2121], label: "Burlington, VT (clean)" },
      { zip: "28401", coords: [34.2104, -77.8868], label: "Wilmington, NC (PFAS hotspot)" },
      { zip: "48503", coords: [43.0125, -83.6875], label: "Flint, MI (lead legacy)" },
      { zip: "93301", coords: [35.3733, -119.0187], label: "Bakersfield, CA (PM2.5 hotspot)" },
      { zip: "60644", coords: [41.8818, -87.7504], label: "Chicago, IL (lead pipes)" },
    ];

    HOTSPOT_ZIPS.forEach((m) => {
      const data = ZIP_DATA[m.zip];
      if (!data) return;
      const overall = worstOf([
        classify("pfas_ppt", data.pfas_ppt),
        classify("lead_ppb", data.lead_ppb),
        classify("pm25", data.pm25),
      ]);
      const marker = L.circleMarker(m.coords, {
        radius: 7,
        fillColor: getRiskColor(overall),
        color: "#ffffff",
        weight: 1.4,
        opacity: 1,
        fillOpacity: 0.95,
      }).addTo(map);
      marker.bindPopup(
        `<div class="popup-state">${escapeHtml(m.label)}</div>` +
          `<div class="popup-cta">Click to audit ${escapeHtml(m.zip)}</div>`
      );
      marker.on("click", () => {
        if (!input) return;
        input.value = m.zip;
        renderResults(m.zip, lookupZip(m.zip));
      });
    });

    updateLegend();
  } catch (err) {
    console.error("Error initializing map:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
