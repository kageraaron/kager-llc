// ============================================================================
// EMBEDDED POLLUTANT DATASET
// ============================================================================
// Values are illustrative composites derived from publicly-available data:
//   - EPA Safe Drinking Water Information System (SDWIS) + UCMR 5
//   - EWG Tap Water Database
//   - EPA AirNow + AQS annual PM2.5 averages (most recent reporting year)
//   - State health department PFAS surveys
//
// These are demo values for educational use. Real-time data should be
// retrieved from the appropriate authority before making health decisions.
// ============================================================================

export interface ZipEntry {
  city: string;
  state?: string;
  pfas_ppt: number;
  lead_ppb: number;
  pm25: number;
  source: string;
  notes: string;
}

export interface Standards {
  [key: string]: {
    label: string;
    epaMCL?: number;
    epaActionLevel?: number;
    healthAdvisory?: number;
    healthGoal?: number;
    epaAnnualNAAQS?: number;
    whoGuideline?: number;
    thresholds: {
      good: number;
      ok: number;
      elevated: number;
      high: number;
    };
  };
}

// EPA reference standards (effective 2024)
export const STANDARDS: Standards = {
  pfas_ppt: {
    label: "PFOA + PFOS (parts per trillion)",
    epaMCL: 4,                  // EPA MCL set in April 2024
    healthAdvisory: 0.02,       // Lifetime HA — far below MCL
    thresholds: { good: 2, ok: 4, elevated: 10, high: 30 }
  },
  lead_ppb: {
    label: "Lead (parts per billion at tap, 90th percentile)",
    epaActionLevel: 15,         // EPA Lead and Copper Rule action level
    healthGoal: 0,              // EPA MCLG is zero
    thresholds: { good: 1, ok: 5, elevated: 15, high: 30 }
  },
  pm25: {
    label: "PM2.5 (µg/m³ annual average)",
    epaAnnualNAAQS: 9,          // Tightened from 12 to 9 in Feb 2024
    whoGuideline: 5,
    thresholds: { good: 6, ok: 9, elevated: 12, high: 18 }
  }
};

// Risk classification — returns "clean" | "ok" | "elevated" | "high" | "severe"
export function classify(pollutant: string, value: number): string {
  const t = STANDARDS[pollutant].thresholds;
  if (value <= t.good) return "clean";
  if (value <= t.ok) return "ok";
  if (value <= t.elevated) return "elevated";
  if (value <= t.high) return "high";
  return "severe";
}

// ============================================================================
// ZIP DATABASE — representative ZIPs across low/mid/high contamination profiles
// ============================================================================
export const ZIP_DATA: { [key: string]: ZipEntry } = {

  // --- VERY CLEAN PROFILES ---
  "05401": { city: "Burlington, VT", state: "VT", pfas_ppt: 0.4, lead_ppb: 0.8, pm25: 5.4,
    source: "Lake Champlain (Champlain Water District)",
    notes: "One of the cleanest large municipal supplies in the Northeast." },
  "96720": { city: "Hilo, HI", state: "HI", pfas_ppt: 0.0, lead_ppb: 0.6, pm25: 4.1,
    source: "Volcanic aquifer (deep wells)",
    notes: "Pristine groundwater; vog can episodically affect air during eruptions." },
  "97201": { city: "Portland, OR (Downtown)", state: "OR", pfas_ppt: 0.3, lead_ppb: 1.4, pm25: 7.2,
    source: "Bull Run watershed (unfiltered surface water)",
    notes: "Famously clean source; some lead risk from older service lines and home fixtures." },
  "87501": { city: "Santa Fe, NM", state: "NM", pfas_ppt: 0.2, lead_ppb: 1.1, pm25: 5.7,
    source: "Rio Grande + Buckman Direct Diversion",
    notes: "High-elevation desert air typically clean; episodic wildfire smoke." },
  "04101": { city: "Portland, ME", state: "ME", pfas_ppt: 1.1, lead_ppb: 1.9, pm25: 5.9,
    source: "Sebago Lake (Portland Water District)",
    notes: "High-quality source water; aging service lines mean some lead risk." },
  "99701": { city: "Fairbanks, AK", state: "AK", pfas_ppt: 0.5, lead_ppb: 1.2, pm25: 13.4,
    source: "Subarctic groundwater wells",
    notes: "Excellent water, but PM2.5 spikes severely in winter from wood-stove inversion." },
  "03301": { city: "Concord, NH", state: "NH", pfas_ppt: 1.8, lead_ppb: 1.0, pm25: 5.2,
    source: "Penacook Lake reservoir",
    notes: "Generally clean; statewide PFAS investigations ongoing." },
  "99501": { city: "Anchorage, AK", state: "AK", pfas_ppt: 0.9, lead_ppb: 2.1, pm25: 6.8,
    source: "Eklutna Lake + Ship Creek",
    notes: "Clean source water; episodic winter PM2.5 from wood smoke and inversion." },

  // --- PFAS HOTSPOTS ---
  "28401": { city: "Wilmington, NC", state: "NC", pfas_ppt: 47.2, lead_ppb: 1.2, pm25: 7.8,
    source: "Cape Fear River (CFPUA)",
    notes: "Severe GenX/PFAS contamination from upstream Chemours Fayetteville Works." },
  "12090": { city: "Hoosick Falls, NY", state: "NY", pfas_ppt: 38.5, lead_ppb: 1.0, pm25: 6.0,
    source: "Tomhannock backup + treated municipal",
    notes: "Saint-Gobain plant contamination; carbon filtration since 2016." },
  "26101": { city: "Parkersburg, WV", state: "WV", pfas_ppt: 22.7, lead_ppb: 1.5, pm25: 9.4,
    source: "Ohio River intake",
    notes: "Decades of DuPont/Chemours C8 (PFOA) contamination — original 'Dark Waters' site." },
  "02601": { city: "Hyannis, MA", state: "MA", pfas_ppt: 18.4, lead_ppb: 0.9, pm25: 5.6,
    source: "Cape Cod groundwater (Maher wells)",
    notes: "Joint Base Cape Cod firefighting foam plume — multiple wells removed from service." },
  "03801": { city: "Portsmouth, NH", state: "NH", pfas_ppt: 14.8, lead_ppb: 1.3, pm25: 6.1,
    source: "Bedrock + Haven well field",
    notes: "Pease AFB AFFF contamination shut Haven well in 2014; treatment now in place." },
  "49423": { city: "Holland, MI", state: "MI", pfas_ppt: 11.3, lead_ppb: 1.1, pm25: 7.3,
    source: "Lake Michigan",
    notes: "Statewide PFAS investigation underway; several sites with elevated PFOS." },
  "53703": { city: "Madison, WI", state: "WI", pfas_ppt: 9.6, lead_ppb: 2.4, pm25: 7.0,
    source: "Confined sandstone aquifer (24 wells)",
    notes: "Truax Field contamination shut Well 15; others actively monitored." },
  "19131": { city: "Philadelphia, PA (Overbrook)", state: "PA", pfas_ppt: 8.2, lead_ppb: 4.7, pm25: 10.1,
    source: "Schuylkill + Delaware Rivers",
    notes: "Multiple PFAS sources; aging lead service lines in row-home neighborhoods." },
  "85323": { city: "Avondale, AZ", state: "AZ", pfas_ppt: 12.1, lead_ppb: 2.0, pm25: 9.8,
    source: "Salt River Project + groundwater",
    notes: "Luke AFB AFFF plume affecting West Valley wells." },
  "08540": { city: "Princeton, NJ", state: "NJ", pfas_ppt: 7.8, lead_ppb: 5.1, pm25: 8.4,
    source: "Stony Brook + Trenton aquifer",
    notes: "New Jersey has the most stringent state PFAS standards in the U.S.; widespread legacy detections." },

  // --- LEAD CONCERNS (legacy infrastructure) ---
  "48503": { city: "Flint, MI", state: "MI", pfas_ppt: 2.8, lead_ppb: 8.4, pm25: 9.2,
    source: "Lake Huron (Great Lakes Water Authority since 2017)",
    notes: "Source water now clean; service-line replacement >95% complete but legacy risk in some homes." },
  "07102": { city: "Newark, NJ", state: "NJ", pfas_ppt: 3.4, lead_ppb: 12.6, pm25: 10.7,
    source: "Pequannock + Wanaque reservoirs",
    notes: "Citywide lead service line replacement program completed 2021 — testing residual risk." },
  "60644": { city: "Chicago, IL (Austin)", state: "IL", pfas_ppt: 2.1, lead_ppb: 9.2, pm25: 10.4,
    source: "Lake Michigan",
    notes: "Chicago has the most lead service lines of any U.S. city (~400,000)." },
  "21217": { city: "Baltimore, MD", state: "MD", pfas_ppt: 3.1, lead_ppb: 11.8, pm25: 9.9,
    source: "Loch Raven + Liberty reservoirs",
    notes: "Older row-home plumbing; documented elevated blood lead in children." },
  "14202": { city: "Buffalo, NY", state: "NY", pfas_ppt: 1.7, lead_ppb: 7.6, pm25: 8.3,
    source: "Lake Erie",
    notes: "~40,000 lead service lines remaining; replacement underway." },
  "44103": { city: "Cleveland, OH (Hough)", state: "OH", pfas_ppt: 1.9, lead_ppb: 10.4, pm25: 10.6,
    source: "Lake Erie",
    notes: "High lead service line density; CWD running aggressive replacement program." },
  "53206": { city: "Milwaukee, WI", state: "WI", pfas_ppt: 2.6, lead_ppb: 9.1, pm25: 9.2,
    source: "Lake Michigan",
    notes: "~70,000 lead service lines citywide; orthophosphate added since 1996." },
  "63103": { city: "St. Louis, MO", state: "MO", pfas_ppt: 3.2, lead_ppb: 6.8, pm25: 10.0,
    source: "Missouri + Mississippi Rivers",
    notes: "Historic industrial area; some lead risk in older homes." },
  "02118": { city: "Boston, MA (South End)", state: "MA", pfas_ppt: 1.4, lead_ppb: 5.2, pm25: 6.9,
    source: "Quabbin + Wachusett reservoirs (MWRA)",
    notes: "Excellent source water; elevated lead risk from pre-1986 home plumbing." },
  "15213": { city: "Pittsburgh, PA (Oakland)", state: "PA", pfas_ppt: 3.5, lead_ppb: 9.2, pm25: 10.1,
    source: "Allegheny River (Pittsburgh Water and Sewer Authority)",
    notes: "PWSA citywide lead service line replacement program ongoing; legacy risk in older neighborhoods." },

  // --- HIGH PM2.5 ---
  "93301": { city: "Bakersfield, CA", state: "CA", pfas_ppt: 1.8, lead_ppb: 1.5, pm25: 17.6,
    source: "Kern River + groundwater",
    notes: "San Joaquin Valley — among the worst annual PM2.5 in the U.S." },
  "93706": { city: "Fresno, CA", state: "CA", pfas_ppt: 2.1, lead_ppb: 1.4, pm25: 16.1,
    source: "Kings River + groundwater",
    notes: "Persistent valley fog + agricultural dust; chronic PM2.5 exceedances." },
  "84101": { city: "Salt Lake City, UT", state: "UT", pfas_ppt: 0.9, lead_ppb: 1.1, pm25: 11.4,
    source: "Wasatch snowpack",
    notes: "Winter temperature inversions trap PM2.5 in the valley for weeks." },
  "85001": { city: "Phoenix, AZ", state: "AZ", pfas_ppt: 1.3, lead_ppb: 1.0, pm25: 10.3,
    source: "Salt + Verde Rivers (SRP)",
    notes: "Fine dust + vehicle emissions; brown cloud most visible in winter." },
  "90011": { city: "Los Angeles, CA (South LA)", state: "CA", pfas_ppt: 2.4, lead_ppb: 2.1, pm25: 12.8,
    source: "MWD imported (Colorado + Sierra)",
    notes: "Port-adjacent diesel exposure; one of the most polluted ZIPs in California." },
  "95202": { city: "Stockton, CA", state: "CA", pfas_ppt: 1.7, lead_ppb: 1.3, pm25: 13.9,
    source: "Mokelumne + Calaveras Rivers",
    notes: "Central Valley PM2.5 hotspot." },
  "30303": { city: "Atlanta, GA", state: "GA", pfas_ppt: 2.8, lead_ppb: 2.4, pm25: 10.5,
    source: "Chattahoochee River",
    notes: "Hot-humid stagnant air + traffic; ozone is also a chronic concern." },
  "77002": { city: "Houston, TX", state: "TX", pfas_ppt: 3.1, lead_ppb: 1.8, pm25: 10.2,
    source: "Trinity + San Jacinto Rivers + Lake Houston",
    notes: "Petrochemical corridor — episodic spikes from refinery upsets." },
  "89101": { city: "Las Vegas, NV", state: "NV", pfas_ppt: 1.5, lead_ppb: 1.2, pm25: 9.8,
    source: "Lake Mead (Colorado River)",
    notes: "Drought-stressed source; PM mostly mineral dust from surrounding desert." },
  "95814": { city: "Sacramento, CA", state: "CA", pfas_ppt: 2.5, lead_ppb: 2.0, pm25: 11.0,
    source: "Sacramento + American Rivers",
    notes: "Northern Central Valley — wildfire smoke episodes drive annual PM2.5 well above NAAQS." },

  // --- MIXED / MAJOR METROS ---
  "10001": { city: "New York, NY (Chelsea)", state: "NY", pfas_ppt: 1.6, lead_ppb: 3.9, pm25: 8.4,
    source: "Catskill/Delaware reservoirs (unfiltered)",
    notes: "World-class source water; lead risk from pre-war building plumbing." },
  "60606": { city: "Chicago, IL (Loop)", state: "IL", pfas_ppt: 2.0, lead_ppb: 5.7, pm25: 10.1,
    source: "Lake Michigan",
    notes: "Lead service lines pervasive even in newer downtown buildings." },
  "94102": { city: "San Francisco, CA (Tenderloin)", state: "CA", pfas_ppt: 0.7, lead_ppb: 1.8, pm25: 7.4,
    source: "Hetch Hetchy (Tuolumne River, unfiltered)",
    notes: "Among the cleanest urban supplies in the U.S.; coastal air dilutes pollution." },
  "98101": { city: "Seattle, WA (Downtown)", state: "WA", pfas_ppt: 0.8, lead_ppb: 1.6, pm25: 7.9,
    source: "Cedar + Tolt River watersheds",
    notes: "Excellent source water; episodic wildfire smoke spikes summer PM2.5." },
  "20001": { city: "Washington, DC (Shaw)", state: "DC", pfas_ppt: 2.4, lead_ppb: 6.1, pm25: 8.7,
    source: "Potomac River (Washington Aqueduct)",
    notes: "Legacy lead pipes; DC Water replacing service lines through 2030." },
  "33101": { city: "Miami, FL (Downtown)", state: "FL", pfas_ppt: 4.2, lead_ppb: 1.5, pm25: 8.1,
    source: "Biscayne Aquifer",
    notes: "Shallow porous aquifer vulnerable to surface contamination + saltwater intrusion." },
  "80202": { city: "Denver, CO", state: "CO", pfas_ppt: 1.4, lead_ppb: 2.6, pm25: 8.6,
    source: "South Platte + Colorado River (Denver Water)",
    notes: "Anti-corrosion treatment program lowering lead risk; brown cloud days continue." },
  "73101": { city: "Oklahoma City, OK", state: "OK", pfas_ppt: 2.2, lead_ppb: 2.0, pm25: 8.4,
    source: "Atoka + McGee Creek + Hefner reservoirs",
    notes: "Generally clean; episodic high PM during wildfires + dust events." },
  "37201": { city: "Nashville, TN", state: "TN", pfas_ppt: 1.9, lead_ppb: 2.3, pm25: 8.2,
    source: "Cumberland River",
    notes: "Moderate baseline; growing development pressure on watershed." },
  "75201": { city: "Dallas, TX", state: "TX", pfas_ppt: 2.5, lead_ppb: 1.9, pm25: 9.0,
    source: "Trinity River reservoirs",
    notes: "Texas Triangle ozone + PM corridor." },
  "02139": { city: "Cambridge, MA", state: "MA", pfas_ppt: 1.2, lead_ppb: 2.6, pm25: 7.0,
    source: "Hobbs Brook + Stony Brook + MWRA backup",
    notes: "Independent supply with good baseline; some PFAS detected at low levels." },
  "19143": { city: "Philadelphia, PA (West Philly)", state: "PA", pfas_ppt: 6.4, lead_ppb: 5.8, pm25: 9.8,
    source: "Schuylkill River",
    notes: "Combined PFAS + lead concerns; older row homes." },
  "48823": { city: "East Lansing, MI", state: "MI", pfas_ppt: 7.1, lead_ppb: 2.0, pm25: 7.4,
    source: "Saginaw aquifer wells",
    notes: "Statewide PFAS investigation; multiple legacy industrial sites." },
  "55401": { city: "Minneapolis, MN", state: "MN", pfas_ppt: 2.8, lead_ppb: 2.1, pm25: 7.8,
    source: "Mississippi River",
    notes: "3M legacy PFAS in east metro suburbs; central city less affected." },
  "55102": { city: "St. Paul, MN", state: "MN", pfas_ppt: 6.2, lead_ppb: 3.4, pm25: 7.6,
    source: "Mississippi River + chain-of-lakes",
    notes: "East metro — adjacent to 3M Cottage Grove plume; granular activated carbon treatment in service." },
  "23219": { city: "Richmond, VA", state: "VA", pfas_ppt: 1.6, lead_ppb: 3.4, pm25: 8.0,
    source: "James River",
    notes: "Aging infrastructure in historic neighborhoods." },
  "29401": { city: "Charleston, SC", state: "SC", pfas_ppt: 5.3, lead_ppb: 1.4, pm25: 7.6,
    source: "Edisto + Bushy Park Reservoir",
    notes: "Multiple PFAS detections in regional supplies under investigation." },

  // --- ADDITIONAL CITIES (broaden coverage) ---
  "17601": { city: "Lancaster, PA", state: "PA", pfas_ppt: 4.2, lead_ppb: 4.6, pm25: 8.4,
    source: "Susquehanna River (Lancaster City Bureau of Water)",
    notes: "Moderate PFAS detected in multiple PA Susquehanna basin utilities; lead risk from older row homes." },
  "17101": { city: "Harrisburg, PA", state: "PA", pfas_ppt: 3.8, lead_ppb: 6.1, pm25: 8.7,
    source: "Susquehanna River (Capital Region Water)",
    notes: "Replacing remaining lead service lines through 2030; UCMR 5 detections in basin." },
  "16801": { city: "State College, PA", state: "PA", pfas_ppt: 2.4, lead_ppb: 3.2, pm25: 7.1,
    source: "State College Borough Water Authority wells",
    notes: "Clean source aquifer; PM2.5 rises during regional wildfire smoke events." },
  "02903": { city: "Providence, RI", state: "RI", pfas_ppt: 3.6, lead_ppb: 6.8, pm25: 7.5,
    source: "Scituate Reservoir",
    notes: "Older housing stock = elevated lead risk; PFAS detections in some RI suburbs." },
  "06103": { city: "Hartford, CT", state: "CT", pfas_ppt: 3.2, lead_ppb: 5.9, pm25: 7.4,
    source: "Nepaug + Barkhamsted reservoirs",
    notes: "Generally clean source; pre-war housing carries lead plumbing risk." },
  "14642": { city: "Rochester, NY", state: "NY", pfas_ppt: 2.8, lead_ppb: 7.5, pm25: 7.6,
    source: "Hemlock + Canadice Lakes",
    notes: "Aging service lines under active replacement; otherwise high-quality supply." },
  "22201": { city: "Arlington, VA", state: "VA", pfas_ppt: 4.0, lead_ppb: 5.8, pm25: 8.7,
    source: "Potomac River (Washington Aqueduct)",
    notes: "Same supply as DC; UCMR 5 detected low-level PFAS." },
  "28202": { city: "Charlotte, NC", state: "NC", pfas_ppt: 5.4, lead_ppb: 3.7, pm25: 8.9,
    source: "Catawba River (Charlotte Water)",
    notes: "Outside the Cape Fear plume but PFAS detections under monitoring." },
  "32801": { city: "Orlando, FL", state: "FL", pfas_ppt: 3.6, lead_ppb: 2.4, pm25: 7.4,
    source: "Floridan Aquifer (OUC wells)",
    notes: "Confined aquifer; some PFAS detections from historic AFFF use at OIA." },
  "35203": { city: "Birmingham, AL", state: "AL", pfas_ppt: 4.2, lead_ppb: 6.1, pm25: 9.6,
    source: "Cahaba River + Lake Purdy",
    notes: "Industrial legacy in Jefferson County; PM2.5 chronically elevated." },
  "37402": { city: "Chattanooga, TN", state: "TN", pfas_ppt: 3.0, lead_ppb: 4.8, pm25: 9.5,
    source: "Tennessee River (Tennessee American)",
    notes: "Mountain valley topology traps PM2.5; otherwise moderate baseline." },
  "40202": { city: "Louisville, KY", state: "KY", pfas_ppt: 3.6, lead_ppb: 6.0, pm25: 9.7,
    source: "Ohio River (Louisville Water Company)",
    notes: "Award-winning treatment but Ohio River intake faces upstream PFAS pressure." },
  "43215": { city: "Columbus, OH", state: "OH", pfas_ppt: 4.4, lead_ppb: 6.7, pm25: 9.4,
    source: "Scioto + Big Walnut reservoirs",
    notes: "Multiple Ohio utilities reporting UCMR 5 PFAS detections." },
  "46202": { city: "Indianapolis, IN", state: "IN", pfas_ppt: 3.5, lead_ppb: 6.4, pm25: 9.7,
    source: "White River + Eagle Creek Reservoir",
    notes: "Citizens Energy Group running lead service line inventory + replacement." },
  "53202": { city: "Milwaukee, WI (Downtown)", state: "WI", pfas_ppt: 2.7, lead_ppb: 7.9, pm25: 9.0,
    source: "Lake Michigan",
    notes: "Same supply as 53206 — citywide lead service line replacement underway." },
  "64101": { city: "Kansas City, MO", state: "MO", pfas_ppt: 4.0, lead_ppb: 6.5, pm25: 9.0,
    source: "Missouri River (KC Water)",
    notes: "Aging downtown infrastructure; corrosion control treatment in place." },
  "70112": { city: "New Orleans, LA", state: "LA", pfas_ppt: 3.4, lead_ppb: 5.2, pm25: 9.0,
    source: "Mississippi River (Sewerage and Water Board)",
    notes: "Lead risk in pre-war French Quarter and Marigny plumbing." },
  "76102": { city: "Fort Worth, TX", state: "TX", pfas_ppt: 4.5, lead_ppb: 4.0, pm25: 9.4,
    source: "Trinity River reservoir system",
    notes: "DFW metroplex PM2.5 corridor; PFAS detected at multiple intakes." },
  "78205": { city: "San Antonio, TX", state: "TX", pfas_ppt: 4.0, lead_ppb: 3.6, pm25: 9.0,
    source: "Edwards Aquifer (SAWS)",
    notes: "Highly productive karst aquifer; some PFAS detections at low levels." },
  "78701": { city: "Austin, TX", state: "TX", pfas_ppt: 3.6, lead_ppb: 3.1, pm25: 8.5,
    source: "Colorado River (Lake Austin / Lake Travis)",
    notes: "Lower PFAS risk than Gulf metros; PM2.5 rises during summer drought." },
  "87104": { city: "Albuquerque, NM", state: "NM", pfas_ppt: 1.7, lead_ppb: 2.8, pm25: 7.5,
    source: "San Juan-Chama + Rio Grande",
    notes: "Generally clean; episodic PM during regional wildfire smoke." },
  "89102": { city: "Las Vegas, NV (Spring Valley)", state: "NV", pfas_ppt: 1.5, lead_ppb: 1.4, pm25: 9.6,
    source: "Lake Mead",
    notes: "Drought stress on Colorado River; PM dust from surrounding desert basin." },
  "92101": { city: "San Diego, CA (Downtown)", state: "CA", pfas_ppt: 2.4, lead_ppb: 2.6, pm25: 9.2,
    source: "Colorado River + State Water Project + local",
    notes: "Coastal mixing keeps PM2.5 lower than inland CA; PFAS detected at trace levels." },
  "59601": { city: "Helena, MT", state: "MT", pfas_ppt: 1.0, lead_ppb: 2.4, pm25: 6.7,
    source: "Tenmile Creek + Missouri River",
    notes: "Pristine source; wildfire smoke is the dominant air-quality risk." },
  "82001": { city: "Cheyenne, WY", state: "WY", pfas_ppt: 1.1, lead_ppb: 2.6, pm25: 6.3,
    source: "Crystal Reservoir + Granite Springs",
    notes: "Rocky Mountain snowpack source; minimal pollutant baseline." },
  "83702": { city: "Boise, ID", state: "ID", pfas_ppt: 1.4, lead_ppb: 3.0, pm25: 7.3,
    source: "Boise River + groundwater",
    notes: "Good baseline; valley inversions trap PM2.5 in winter months." },
  "57101": { city: "Sioux Falls, SD", state: "SD", pfas_ppt: 1.6, lead_ppb: 3.3, pm25: 6.8,
    source: "Big Sioux + Missouri River",
    notes: "Plains weather mixes pollutants well; clean drinking water supply." },
  "58102": { city: "Fargo, ND", state: "ND", pfas_ppt: 1.5, lead_ppb: 3.6, pm25: 6.9,
    source: "Red River (Cass Rural / Fargo Water)",
    notes: "Surface water with elevated organics requiring strong treatment; no major PFAS detections." },

  // --- ALASKA + HAWAII (so prefix-fallback always lands somewhere) ---
  "96813": { city: "Honolulu, HI", state: "HI", pfas_ppt: 0.8, lead_ppb: 1.1, pm25: 5.0,
    source: "Pearl Harbor / Honolulu groundwater",
    notes: "Naval AFFF detections drove emergency well shutdowns at Red Hill in 2021–22." },
};

// ============================================================================
// STATE-LEVEL FALLBACK PROFILE
// ----------------------------------------------------------------------------
// Used when a ZIP isn't in ZIP_DATA, and as the source of truth for the
// national risk map's per-state coloring.
// ============================================================================

export interface StateProfile {
  code: string;
  name: string;
  pfas_ppt: number;
  lead_ppb: number;
  pm25: number;
  /** Approximate state center [lat, lng] for fallback markers. */
  center: [number, number];
  /** A ZIP that exists in ZIP_DATA, used for click-to-audit on the map. */
  representativeZip: string;
  notes: string;
}

export const STATE_DATA: Record<string, StateProfile> = {
  AL: { code: "AL", name: "Alabama",        pfas_ppt: 4.2, lead_ppb: 5.4, pm25: 9.4, center: [32.806, -86.791], representativeZip: "35203",
        notes: "Multiple Birmingham-area utilities reported UCMR 5 PFAS detections; PM2.5 elevated in industrial corridors." },
  AK: { code: "AK", name: "Alaska",         pfas_ppt: 1.0, lead_ppb: 2.4, pm25: 9.5, center: [61.370, -152.404], representativeZip: "99501",
        notes: "Remote groundwater is generally clean; PM2.5 spikes in winter inversions and summer wildfire smoke." },
  AZ: { code: "AZ", name: "Arizona",        pfas_ppt: 2.7, lead_ppb: 1.8, pm25: 10.1, center: [33.729, -111.431], representativeZip: "85001",
        notes: "AFFF plumes near Luke and Davis-Monthan AFB; chronic PM from desert dust + valley inversions." },
  AR: { code: "AR", name: "Arkansas",       pfas_ppt: 3.0, lead_ppb: 3.8, pm25: 8.6, center: [34.969, -92.373], representativeZip: "73101",
        notes: "Generally moderate; agricultural runoff influences some surface intakes." },
  CA: { code: "CA", name: "California",     pfas_ppt: 2.6, lead_ppb: 2.4, pm25: 12.3, center: [36.116, -119.681], representativeZip: "93301",
        notes: "Central Valley dominates PM2.5; PFAS sites concentrated near former military bases and aerospace." },
  CO: { code: "CO", name: "Colorado",       pfas_ppt: 2.0, lead_ppb: 3.1, pm25: 8.2, center: [39.059, -105.311], representativeZip: "80202",
        notes: "Rocky Mountain snowpack source; PM2.5 elevated in Front Range during inversions and wildfire smoke." },
  CT: { code: "CT", name: "Connecticut",    pfas_ppt: 3.2, lead_ppb: 5.9, pm25: 7.4, center: [41.597, -72.755], representativeZip: "06103",
        notes: "Pre-war housing carries lead plumbing risk; UCMR 5 detected low-level PFAS in CT utilities." },
  DE: { code: "DE", name: "Delaware",       pfas_ppt: 5.0, lead_ppb: 5.1, pm25: 8.5, center: [39.318, -75.507], representativeZip: "19131",
        notes: "Persistent PFAS detected in southern New Castle County; aging infrastructure drives lead risk." },
  DC: { code: "DC", name: "District of Columbia", pfas_ppt: 2.4, lead_ppb: 6.1, pm25: 8.7, center: [38.897, -77.026], representativeZip: "20001",
        notes: "Legacy lead service lines under aggressive replacement; PM2.5 driven by I-95 corridor and regional sources." },
  FL: { code: "FL", name: "Florida",        pfas_ppt: 3.8, lead_ppb: 2.4, pm25: 7.6, center: [27.766, -81.687], representativeZip: "33101",
        notes: "Floridan + Biscayne aquifers vulnerable to surface contamination; AFFF plumes near military bases." },
  GA: { code: "GA", name: "Georgia",        pfas_ppt: 3.6, lead_ppb: 3.4, pm25: 9.1, center: [33.040, -83.643], representativeZip: "30303",
        notes: "Stagnant summer air drives PM2.5 in metro Atlanta; PFAS detections in industrial north Georgia." },
  HI: { code: "HI", name: "Hawaii",         pfas_ppt: 0.8, lead_ppb: 1.1, pm25: 5.0, center: [21.094, -157.498], representativeZip: "96813",
        notes: "Pristine deep aquifers; military AFFF affected Red Hill area near Pearl Harbor." },
  ID: { code: "ID", name: "Idaho",          pfas_ppt: 1.4, lead_ppb: 3.0, pm25: 7.3, center: [44.240, -114.478], representativeZip: "83702",
        notes: "Clean baseline; valley inversions in Treasure Valley drive winter PM2.5 episodes." },
  IL: { code: "IL", name: "Illinois",       pfas_ppt: 3.4, lead_ppb: 7.8, pm25: 9.6, center: [40.349, -88.986], representativeZip: "60606",
        notes: "Chicago has the most lead service lines of any U.S. city; downstate PM2.5 also elevated." },
  IN: { code: "IN", name: "Indiana",        pfas_ppt: 3.2, lead_ppb: 6.0, pm25: 9.6, center: [39.849, -86.258], representativeZip: "46202",
        notes: "Industrial Calumet corridor + farm-belt PM2.5; lead risk in older Indianapolis stock." },
  IA: { code: "IA", name: "Iowa",           pfas_ppt: 2.5, lead_ppb: 4.6, pm25: 7.8, center: [42.011, -93.210], representativeZip: "55401",
        notes: "Agricultural runoff influences surface supplies; PM2.5 generally moderate." },
  KS: { code: "KS", name: "Kansas",         pfas_ppt: 2.3, lead_ppb: 4.0, pm25: 7.8, center: [38.526, -96.726], representativeZip: "73101",
        notes: "Plains baseline is moderate; episodic dust events affect western counties." },
  KY: { code: "KY", name: "Kentucky",       pfas_ppt: 3.2, lead_ppb: 5.6, pm25: 9.2, center: [37.668, -84.670], representativeZip: "40202",
        notes: "Ohio River basin sees upstream PFAS pressure; older housing carries lead risk." },
  LA: { code: "LA", name: "Louisiana",      pfas_ppt: 3.5, lead_ppb: 5.0, pm25: 9.1, center: [31.169, -91.867], representativeZip: "70112",
        notes: "Mississippi River corridor; petrochemical 'Cancer Alley' weighs on PM2.5 totals." },
  ME: { code: "ME", name: "Maine",          pfas_ppt: 5.0, lead_ppb: 6.3, pm25: 6.4, center: [44.694, -69.381], representativeZip: "04101",
        notes: "Statewide PFAS investigation tied to land-application of biosolids; air remains clean." },
  MD: { code: "MD", name: "Maryland",       pfas_ppt: 3.4, lead_ppb: 7.2, pm25: 8.9, center: [39.063, -76.802], representativeZip: "21217",
        notes: "Older row-home plumbing in Baltimore; PFAS detections at multiple military installations." },
  MA: { code: "MA", name: "Massachusetts",  pfas_ppt: 3.0, lead_ppb: 5.8, pm25: 7.4, center: [42.230, -71.530], representativeZip: "02118",
        notes: "MWRA sources are clean but pre-1986 plumbing in Boston/Cambridge drives lead risk." },
  MI: { code: "MI", name: "Michigan",       pfas_ppt: 5.8, lead_ppb: 8.4, pm25: 8.6, center: [43.326, -84.536], representativeZip: "48503",
        notes: "Statewide PFAS investigation; Flint legacy + many older lead service lines remain." },
  MN: { code: "MN", name: "Minnesota",      pfas_ppt: 5.4, lead_ppb: 4.2, pm25: 7.4, center: [45.694, -93.901], representativeZip: "55102",
        notes: "3M legacy PFAS plume in east metro suburbs; air baseline is among the cleanest in the Midwest." },
  MS: { code: "MS", name: "Mississippi",    pfas_ppt: 2.9, lead_ppb: 4.2, pm25: 8.4, center: [32.741, -89.679], representativeZip: "70112",
        notes: "Mostly groundwater supply; baseline moderate." },
  MO: { code: "MO", name: "Missouri",       pfas_ppt: 4.1, lead_ppb: 6.1, pm25: 9.0, center: [38.456, -92.288], representativeZip: "63103",
        notes: "Industrial legacy in St. Louis; lead risk in older Kansas City stock." },
  MT: { code: "MT", name: "Montana",        pfas_ppt: 1.4, lead_ppb: 2.8, pm25: 7.0, center: [46.921, -110.454], representativeZip: "59601",
        notes: "Pristine source water; wildfire smoke is the dominant seasonal air risk." },
  NE: { code: "NE", name: "Nebraska",       pfas_ppt: 2.2, lead_ppb: 3.6, pm25: 7.0, center: [41.125, -98.268], representativeZip: "57101",
        notes: "Ogallala aquifer is generally clean; some agricultural-runoff influence." },
  NV: { code: "NV", name: "Nevada",         pfas_ppt: 1.6, lead_ppb: 1.6, pm25: 8.6, center: [38.313, -117.055], representativeZip: "89101",
        notes: "Lake Mead supply under drought stress; PM dust dominates air baseline." },
  NH: { code: "NH", name: "New Hampshire",  pfas_ppt: 6.4, lead_ppb: 4.8, pm25: 6.0, center: [43.452, -71.563], representativeZip: "03801",
        notes: "Pease AFB + Saint-Gobain sites drive elevated PFAS statewide; air quality is otherwise excellent." },
  NJ: { code: "NJ", name: "New Jersey",     pfas_ppt: 7.4, lead_ppb: 7.8, pm25: 8.7, center: [40.298, -74.521], representativeZip: "07102",
        notes: "Most stringent state PFAS standards in the U.S.; widespread legacy detections + I-95 corridor PM2.5." },
  NM: { code: "NM", name: "New Mexico",     pfas_ppt: 1.7, lead_ppb: 2.8, pm25: 7.5, center: [34.840, -106.248], representativeZip: "87104",
        notes: "Pristine baseline; episodic wildfire smoke drives summer PM2.5." },
  NY: { code: "NY", name: "New York",       pfas_ppt: 2.8, lead_ppb: 6.4, pm25: 8.0, center: [42.165, -74.948], representativeZip: "10001",
        notes: "World-class NYC source water; lead risk in pre-war housing across the state." },
  NC: { code: "NC", name: "North Carolina", pfas_ppt: 8.4, lead_ppb: 3.8, pm25: 8.4, center: [35.630, -79.806], representativeZip: "28401",
        notes: "Chemours Cape Fear (GenX) plume drives statewide PFAS averages well above the EPA MCL." },
  ND: { code: "ND", name: "North Dakota",   pfas_ppt: 1.5, lead_ppb: 3.4, pm25: 6.8, center: [47.528, -99.784], representativeZip: "58102",
        notes: "Plains baseline; clean across all three pollutants." },
  OH: { code: "OH", name: "Ohio",           pfas_ppt: 4.0, lead_ppb: 7.4, pm25: 9.6, center: [40.388, -82.764], representativeZip: "44103",
        notes: "Ohio River basin PFAS pressure + Rust Belt PM2.5; many lead service lines in northern cities." },
  OK: { code: "OK", name: "Oklahoma",       pfas_ppt: 2.4, lead_ppb: 3.4, pm25: 8.4, center: [35.565, -96.928], representativeZip: "73101",
        notes: "Plains baseline; some PFAS detected near aviation and military sites." },
  OR: { code: "OR", name: "Oregon",         pfas_ppt: 1.0, lead_ppb: 4.6, pm25: 7.4, center: [44.572, -122.070], representativeZip: "97201",
        notes: "Famously clean Bull Run watershed; episodic wildfire smoke spikes summer PM2.5." },
  PA: { code: "PA", name: "Pennsylvania",   pfas_ppt: 4.4, lead_ppb: 6.6, pm25: 9.0, center: [40.590, -77.209], representativeZip: "17601",
        notes: "Susquehanna basin UCMR 5 PFAS detections; legacy lead service lines in Philadelphia and Pittsburgh." },
  RI: { code: "RI", name: "Rhode Island",   pfas_ppt: 3.2, lead_ppb: 6.4, pm25: 7.6, center: [41.680, -71.512], representativeZip: "02903",
        notes: "Older housing stock = elevated lead risk; PFAS detections in some Providence suburbs." },
  SC: { code: "SC", name: "South Carolina", pfas_ppt: 4.4, lead_ppb: 3.4, pm25: 8.2, center: [33.857, -80.945], representativeZip: "29401",
        notes: "Multiple PFAS detections in regional supplies under investigation." },
  SD: { code: "SD", name: "South Dakota",   pfas_ppt: 1.6, lead_ppb: 3.3, pm25: 6.8, center: [44.299, -99.439], representativeZip: "57101",
        notes: "Plains baseline; clean across all three pollutants." },
  TN: { code: "TN", name: "Tennessee",      pfas_ppt: 2.8, lead_ppb: 4.4, pm25: 9.2, center: [35.747, -86.692], representativeZip: "37201",
        notes: "Mountain valleys trap PM2.5; PFAS detections concentrated in Memphis aquifer area." },
  TX: { code: "TX", name: "Texas",          pfas_ppt: 4.2, lead_ppb: 3.4, pm25: 9.2, center: [31.054, -97.563], representativeZip: "77002",
        notes: "Petrochemical Gulf Coast drives PM2.5; PFAS detections in eastern Texas utilities." },
  UT: { code: "UT", name: "Utah",           pfas_ppt: 1.4, lead_ppb: 2.6, pm25: 9.6, center: [40.150, -111.862], representativeZip: "84101",
        notes: "Valley inversions create chronic winter PM2.5; water supply is high quality." },
  VT: { code: "VT", name: "Vermont",        pfas_ppt: 1.4, lead_ppb: 3.0, pm25: 6.0, center: [44.045, -72.710], representativeZip: "05401",
        notes: "Some of the cleanest baseline values in the U.S.; small Bennington-area PFAS plume." },
  VA: { code: "VA", name: "Virginia",       pfas_ppt: 3.4, lead_ppb: 4.8, pm25: 8.5, center: [37.769, -78.169], representativeZip: "23219",
        notes: "Potomac/James basin under monitoring; older Richmond housing carries lead risk." },
  WA: { code: "WA", name: "Washington",     pfas_ppt: 1.4, lead_ppb: 3.4, pm25: 8.0, center: [47.400, -121.490], representativeZip: "98101",
        notes: "Clean source water from Cascades; wildfire smoke drives summer PM2.5 spikes." },
  WV: { code: "WV", name: "West Virginia",  pfas_ppt: 5.4, lead_ppb: 5.6, pm25: 9.1, center: [38.491, -80.954], representativeZip: "26101",
        notes: "Original DuPont/Chemours C8 contamination still drives PFAS averages; older housing carries lead risk." },
  WI: { code: "WI", name: "Wisconsin",      pfas_ppt: 4.0, lead_ppb: 6.4, pm25: 7.8, center: [44.268, -89.616], representativeZip: "53206",
        notes: "Industrial PFAS legacy in Marinette + Madison; many lead service lines remain in Milwaukee." },
  WY: { code: "WY", name: "Wyoming",        pfas_ppt: 1.1, lead_ppb: 2.6, pm25: 6.3, center: [42.756, -107.302], representativeZip: "82001",
        notes: "Rocky Mountain snowpack source; minimal pollutant baseline." },
};

/**
 * Map from GeoJSON feature.properties.name (the full English state name used
 * by the public PublicaMundi us-states.json) to our STATE_DATA key.
 */
export const STATE_NAME_TO_CODE: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
  "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME",
  "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
  "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
  "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
  "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
  "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
};

/**
 * ZIP-prefix → state lookup. The first three digits of a US ZIP map to a
 * Sectional Center Facility, which uniquely identifies a state for the
 * overwhelming majority of ZIPs. We use a coarser two-digit prefix range
 * for portability — accurate enough for a regional fallback when an exact
 * ZIP isn't in our database.
 */
const PREFIX_RANGES: Array<{ from: number; to: number; state: string }> = [
  { from: 1,  to: 2,  state: "MA" },
  { from: 3,  to: 3,  state: "MA" },
  { from: 4,  to: 4,  state: "NH" },
  { from: 5,  to: 5,  state: "VT" },
  { from: 6,  to: 6,  state: "CT" },
  { from: 7,  to: 8,  state: "NJ" },
  { from: 9,  to: 14, state: "NY" },
  { from: 15, to: 19, state: "PA" },
  { from: 20, to: 20, state: "DC" },
  { from: 21, to: 21, state: "MD" },
  { from: 22, to: 24, state: "VA" },
  { from: 25, to: 26, state: "WV" },
  { from: 27, to: 28, state: "NC" },
  { from: 29, to: 29, state: "SC" },
  { from: 30, to: 31, state: "GA" },
  { from: 32, to: 34, state: "FL" },
  { from: 35, to: 36, state: "AL" },
  { from: 37, to: 38, state: "TN" },
  { from: 39, to: 39, state: "MS" },
  { from: 40, to: 42, state: "KY" },
  { from: 43, to: 45, state: "OH" },
  { from: 46, to: 47, state: "IN" },
  { from: 48, to: 49, state: "MI" },
  { from: 50, to: 52, state: "IA" },
  { from: 53, to: 54, state: "WI" },
  { from: 55, to: 56, state: "MN" },
  { from: 57, to: 57, state: "SD" },
  { from: 58, to: 58, state: "ND" },
  { from: 59, to: 59, state: "MT" },
  { from: 60, to: 62, state: "IL" },
  { from: 63, to: 65, state: "MO" },
  { from: 66, to: 67, state: "KS" },
  { from: 68, to: 69, state: "NE" },
  { from: 70, to: 71, state: "LA" },
  { from: 72, to: 72, state: "AR" },
  { from: 73, to: 74, state: "OK" },
  { from: 75, to: 79, state: "TX" },
  { from: 80, to: 81, state: "CO" },
  { from: 82, to: 83, state: "WY" },
  { from: 84, to: 84, state: "UT" },
  { from: 85, to: 86, state: "AZ" },
  { from: 87, to: 88, state: "NM" },
  { from: 89, to: 89, state: "NV" },
  { from: 90, to: 96, state: "CA" },
  { from: 97, to: 97, state: "OR" },
  { from: 98, to: 99, state: "WA" },
];

export function stateFromZip(zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;

  // Special non-contiguous ranges first.
  if (/^99[5-9]/.test(zip)) return "AK";
  if (/^96[78]/.test(zip)) return "HI";
  if (/^02[89]/.test(zip)) return "RI";
  if (/^05[0-5]/.test(zip)) return "VT";
  if (/^19[6-9]/.test(zip)) return "DE";

  const prefix = parseInt(zip.slice(0, 2), 10);
  if (Number.isNaN(prefix)) return null;
  for (const range of PREFIX_RANGES) {
    if (prefix >= range.from && prefix <= range.to) return range.state;
  }
  return null;
}

// ============================================================================
// LOOKUP
// ============================================================================
export function lookupZip(zip: string): ZipEntry {
  const cleaned = String(zip).trim().slice(0, 5);
  if (ZIP_DATA[cleaned]) return ZIP_DATA[cleaned];

  // 1. Exact prefix-3 match — same Sectional Center Facility.
  const prefix3 = cleaned.slice(0, 3);
  const sameSCF = Object.keys(ZIP_DATA).find(z => z.startsWith(prefix3));
  if (sameSCF) {
    const data = { ...ZIP_DATA[sameSCF] };
    data.notes = `Showing nearby data from ${ZIP_DATA[sameSCF].city} (same regional postal area as ${cleaned}). For utility-specific values, request your Consumer Confidence Report.`;
    return data;
  }

  // 2. State-level fallback — guaranteed to exist for any valid 5-digit ZIP.
  const stateCode = stateFromZip(cleaned);
  if (stateCode && STATE_DATA[stateCode]) {
    const s = STATE_DATA[stateCode];
    return {
      city: `${s.name} (regional estimate)`,
      state: s.code,
      pfas_ppt: s.pfas_ppt,
      lead_ppb: s.lead_ppb,
      pm25: s.pm25,
      source: `State-level composite (UCMR 5 + LCR + EPA AQS) for ${s.name}`,
      notes: `${s.notes} ZIP-specific values aren't in our embedded dataset — request your utility's CCR or run a home test for utility-specific readings.`,
    };
  }

  // 3. Final fallback — only triggers for malformed input.
  return {
    city: "Unknown ZIP",
    pfas_ppt: 0,
    lead_ppb: 0,
    pm25: 0,
    source: "—",
    notes: "We couldn't classify that ZIP. Make sure you entered a valid 5-digit US ZIP code.",
  };
}

export function listSampleZips(n: number = 6): string[] {
  // Curated showcase — different risk profiles
  return ["05401", "28401", "48503", "93301", "97201", "10001"].slice(0, n);
}

// ============================================================================
// HELPERS for the national risk map
// ============================================================================

/** Worst-of-three classification, used for the "Overall" map filter. */
export function overallSeverityForState(code: string): string {
  const s = STATE_DATA[code];
  if (!s) return "clean";
  const r = [
    classify("pfas_ppt", s.pfas_ppt),
    classify("lead_ppb", s.lead_ppb),
    classify("pm25", s.pm25),
  ];
  const order = ["clean", "ok", "elevated", "high", "severe"];
  return r.reduce((acc, c) => (order.indexOf(c) > order.indexOf(acc) ? c : acc), "clean");
}

export type MapFilter = "overall" | "pfas" | "lead" | "pm25";

export function severityForState(code: string, filter: MapFilter): string {
  const s = STATE_DATA[code];
  if (!s) return "clean";
  switch (filter) {
    case "pfas":
      return classify("pfas_ppt", s.pfas_ppt);
    case "lead":
      return classify("lead_ppb", s.lead_ppb);
    case "pm25":
      return classify("pm25", s.pm25);
    case "overall":
    default:
      return overallSeverityForState(code);
  }
}
