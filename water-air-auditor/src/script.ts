import { ZIP_DATA, STANDARDS, classify, lookupZip, type ZipEntry } from "./data";

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
        <p>This MVP includes ~50 representative ZIP codes. Try one of the samples below the input, or look up your area at <a href="https://www.ewg.org/tapwater/" target="_blank" rel="noopener">EWG Tap Water Database</a> and <a href="https://www.airnow.gov" target="_blank" rel="noopener">AirNow</a>.</p>
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

  results.hidden = false;
  results.innerHTML = `
    <div class="results-header">
      <div>
        <div class="results-zip">ZIP ${escapeHtml(zip)}</div>
        <div class="results-city">${escapeHtml(data.city)}</div>
        <div class="results-source">Water source: ${escapeHtml(data.source)}</div>
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

  // Both sides elevated → combo
  if (waterRisk >= 2 && airRisk >= 2) return PRODUCT_RECOMMENDATIONS.combo;
  // Water-only elevated
  if (waterRisk >= 2 && rank(pfasClass) >= rank(leadClass)) return PRODUCT_RECOMMENDATIONS.pfas;
  if (waterRisk >= 2) return PRODUCT_RECOMMENDATIONS.lead;
  // Air-only elevated
  if (airRisk >= 2) return PRODUCT_RECOMMENDATIONS.pm25;
  // Everything OK → suggest verification
  return PRODUCT_RECOMMENDATIONS.monitor;
}

const RANK: { [key: string]: number } = { clean: 0, ok: 1, elevated: 2, high: 3, severe: 4 };
const rank = (c: string) => RANK[c] ?? 0;
const worstOf = (classes: string[]) => classes.reduce((acc, c) => (rank(c) > rank(acc) ? c : acc), "clean");

function formatNumber(n: number) {
  if (n === 0) return "0";
  if (n < 1)   return n.toFixed(1);
  if (n < 10)  return n.toFixed(1);
  return Math.round(n).toString();
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c as keyof typeof escapeMap])
  );
}

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// ===========================================================================
// EVENT WIRING
// ===========================================================================

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!input) return;
  const zip = (input.value || "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) {
    input.focus();
    return;
  }
  const data = lookupZip(zip);
  renderResults(zip, data);
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
// HARM-REDUCTION-STYLE NAV / SCROLL BEHAVIOR
// ===========================================================================

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (this: HTMLAnchorElement, e: Event) {
    const href = this.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      navLinks?.classList.remove("nav-open");
      navToggle?.setAttribute("aria-expanded", "false");
    }
  });
});

const header = document.getElementById("site-header") as HTMLElement | null;
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
const navLinks = document.querySelector(".nav-links") as HTMLElement | null;
const navLinkItems = document.querySelectorAll('.nav-links a[href^="#"]');
const navToggle = document.querySelector(".nav-toggle") as HTMLElement | null;

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

// Map the "Look Up" nav link to the hero (hero has #hero, but nav uses #lookup).
// Make #lookup also scroll to #hero so the user lands on the input.
const lookupTarget = document.querySelector('a[href="#lookup"]');
if (lookupTarget) {
  lookupTarget.addEventListener("click", (e: Event) => {
    e.preventDefault();
    document.getElementById("hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => input?.focus(), 400);
  });
}

// ===========================================================================
// INTERACTIVE MAP
// ===========================================================================

let map: any;
function initMap() {
  const mapEl = document.getElementById("risk-map");
  if (!mapEl) return;

  if (typeof L === "undefined") {
    console.warn("Leaflet library (L) not loaded. Map will not render.");
    mapEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Map library failed to load. Please check your connection.</div>';
    return;
  }

  try {
    map = L.map("risk-map", {
      center: [39.8283, -98.5795],
      zoom: 4,
      minZoom: 3,
      maxZoom: 10,
      scrollWheelZoom: false
    });

    // Dark-themed tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20
    }).addTo(map);

    // Add States Layer for "clickable" regions
    fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json")
      .then(res => res.json())
      .then(geoData => {
        L.geoJson(geoData, {
          style: (feature: any) => {
            // Find a zip in this state to represent risk
            const state = feature.properties.name;
            const representativeZip = Object.keys(ZIP_DATA).find(z => ZIP_DATA[z].city.includes(state));
            let color = "#334155"; // Default grey
            if (representativeZip) {
              const d = ZIP_DATA[representativeZip];
              const c = worstOf([classify("pfas_ppt", d.pfas_ppt), classify("lead_ppb", d.lead_ppb), classify("pm25", d.pm25)]);
              color = getRiskColor(c);
            }
            return {
              fillColor: color,
              weight: 1,
              opacity: 0.3,
              color: 'white',
              fillOpacity: 0.1
            };
          },
          onEachFeature: (feature: any, layer: any) => {
            layer.on({
              mouseover: (e: any) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.4, weight: 2 });
              },
              mouseout: (e: any) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.1, weight: 1 });
              },
              click: (e: any) => {
                if (!input) return;
                const state = feature.properties.name;
                const representativeZip = Object.keys(ZIP_DATA).find(z => ZIP_DATA[z].city.includes(state)) || "10001";
                input.value = representativeZip;
                renderResults(representativeZip, lookupZip(representativeZip));
                // Zoom to the state
                map.fitBounds(e.target.getBounds());
              }
            });
          }
        }).addTo(map);
      })
      .catch(err => console.error("Could not load states GeoJSON:", err));

    // Add some representative markers for hotspots and clean areas
    const markers = [
      { zip: "05401", coords: [44.4756, -73.2121], label: "Burlington, VT (Clean)" },
      { zip: "28401", coords: [34.2104, -77.8868], label: "Wilmington, NC (PFAS High)" },
      { zip: "48503", coords: [43.0125, -83.6875], label: "Flint, MI (Lead Legacy)" },
      { zip: "93301", coords: [35.3733, -119.0187], label: "Bakersfield, CA (PM2.5 High)" },
      { zip: "60644", coords: [41.8818, -87.7504], label: "Chicago, IL (Lead Pipes)" },
      { zip: "10001", coords: [40.7501, -73.9973], label: "New York, NY (Urban Baseline)" }
    ];

    markers.forEach(m => {
      const data = lookupZip(m.zip);
      if (!data) return;
      
      const pfasClass = classify("pfas_ppt", data.pfas_ppt);
      const leadClass = classify("lead_ppb", data.lead_ppb);
      const pm25Class = classify("pm25", data.pm25);
      const overall = worstOf([pfasClass, leadClass, pm25Class]);

      const circle = L.circleMarker(m.coords, {
        radius: 8,
        fillColor: getRiskColor(overall),
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);

      circle.bindPopup(`<strong>${m.label}</strong><br>Click to audit this location`);
      circle.on("click", () => {
        if (!input) return;
        input.value = m.zip;
        renderResults(m.zip, data);
      });
    });

    // Click on map to "guess" location (simple demo behavior)
    map.on("click", (e: any) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      let closestZip = "10001";
      let minDist = Infinity;
      
      const anchors = [
        { zip: "90011", coords: [34.0522 as number, -118.2437 as number] }, // LA
        { zip: "60606", coords: [41.8781 as number, -87.6298 as number] }, // Chicago
        { zip: "77002", coords: [29.7604 as number, -95.3698 as number] }, // Houston
        { zip: "33101", coords: [25.7617 as number, -80.1918 as number] }, // Miami
        { zip: "98101", coords: [47.6062 as number, -122.3321 as number] }, // Seattle
        { zip: "30303", coords: [33.7490 as number, -84.3880 as number] }  // Atlanta
      ];

      anchors.forEach(a => {
        const d = Math.sqrt(Math.pow(lat - a.coords[0], 2) + Math.pow(lng - a.coords[1], 2));
        if (d < minDist) {
          minDist = d;
          closestZip = a.zip;
        }
      });

      if (minDist < 5) {
        if (input) {
          input.value = closestZip;
          renderResults(closestZip, lookupZip(closestZip));
        }
      } else {
        const fakeZip = (Math.floor((Math.abs(lat) * 1000 + Math.abs(lng) * 1000) % 90000) + 10000).toString();
        if (input) {
          input.value = fakeZip;
          renderResults(fakeZip, lookupZip(fakeZip));
        }
      }
    });
  } catch (err) {
    console.error("Error initializing map:", err);
  }
}

function getRiskColor(cls: string) {
  switch(cls) {
    case "clean": return "#10b981";
    case "ok": return "#06b6d4";
    case "elevated": return "#f59e0b";
    case "high": return "#ef4444";
    case "severe": return "#7f1d1d";
    default: return "#94a3b8";
  }
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
