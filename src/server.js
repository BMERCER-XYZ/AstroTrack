import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Simple health check
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Planet SPK IDs (major bodies): Mercury..Neptune and Pluto (Pluto barycenter)
// Horizons COMMAND uses NAIF IDs for planets: 199,299,399,499,599,699,799,899; Pluto 999 (Pluto barycenter) or 134340 for dwarf Pluto.
const PLANETS = [
  { id: '199', name: 'Mercury', type: 'planet' },
  { id: '299', name: 'Venus', type: 'planet' },
  { id: '399', name: 'Earth', type: 'planet' },
  { id: '499', name: 'Mars', type: 'planet' },
  { id: '599', name: 'Jupiter', type: 'planet' },
  { id: '699', name: 'Saturn', type: 'planet' },
  { id: '799', name: 'Uranus', type: 'planet' },
  { id: '899', name: 'Neptune', type: 'planet' },
  // Pluto: NAIF 999 is Pluto system barycenter; 134340 is dwarf planet Pluto. Use 999 to align with classic 9-planet maps.
  { id: '999', name: 'Pluto Barycenter', type: 'planet' }
];

// Load spacecraft list from config if present; each entry can specify either an 'id' (like -170) or a 'command' (like JWST)
function loadSpacecraftConfig() {
  const cfgPath = 'config/spacecraft.json';
  try {
    if (fs.existsSync(cfgPath)) {
      const txt = fs.readFileSync(cfgPath, 'utf-8');
      const list = JSON.parse(txt);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {
    console.warn('Failed to load spacecraft config:', e);
  }
  // Default minimal set
  return [
    { command: 'JWST', name: 'JWST' },
    { command: 'Parker Solar Probe', name: 'Parker Solar Probe' }
  ];
}

const SPACECRAFT = loadSpacecraftConfig().map((s) => ({ ...s, type: 'spacecraft' }));
let BODIES = [...PLANETS, ...SPACECRAFT];

// Helper to format current UTC in Horizons-friendly calendar format
function horizonsNowUTC() {
  // Use TLIST with calendar date in UTC; prefer 'YYYY-Mon-DD HH:MM:SS' which Horizons reliably accepts
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const monNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = monNames[now.getUTCMonth()];
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const HH = String(now.getUTCHours()).padStart(2, '0');
  const MM = String(now.getUTCMinutes()).padStart(2, '0');
  const SS = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mon}-${dd} ${HH}:${MM}:${SS}`;
}

// Simple in-memory cache to avoid hammering Horizons if multiple clients
let cache = { data: null, ts: 0 };
const CACHE_MS = 55 * 1000; // refresh roughly every minute

app.get('/api/positions', async (req, res) => {
  console.log('=== API REQUEST RECEIVED ===');
  console.log('Query params:', req.query);
  console.log('Force refresh:', req.query.refresh === 'true');
  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && cache.data && now - cache.ts < CACHE_MS) {
      console.log('Returning cached data');
      return res.json(cache.data);
    }
    console.log('Making fresh API calls to Horizons...');

    const timeStr = horizonsNowUTC();
    // Build queries for each planet using VECTORS, Sun-centered, ecliptic plane
    // CENTER='500@10' selects the Sun; Alternative '@sun' might work, but official format is '500@10'.
    // REF_PLANE=ECLIPTIC to get ecliptic coordinates; OUT_UNITS=AU-D to get AU distances and days for time units.
    // VEC_TABLE=1 gives position only; CSV_FORMAT=YES is easy to parse.
    const base = 'https://ssd.jpl.nasa.gov/api/horizons.api';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function fetchOne(p) {
      const maxAttempts = 3;
      let lastErr = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const params = new URLSearchParams({
            format: 'json',
            // COMMAND can be NAIF id or a resolvable name like 'JWST' or 'Voyager 1'
            COMMAND: `'${(p.id ?? p.command ?? p.name)}'`,
            MAKE_EPHEM: 'YES',
            EPHEM_TYPE: 'VECTORS',
            CENTER: "'500@10'",
            REF_PLANE: 'ECLIPTIC',
            OUT_UNITS: 'AU-D',
            VEC_TABLE: '1',
            CSV_FORMAT: 'YES',
            VEC_LABELS: 'YES',
            TIME_TYPE: 'UT',
            TLIST: `'${timeStr}'`
          });
          const url = `${base}?${params.toString()}`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Horizons HTTP ${r.status}`);
          const data = await r.json();
          if (data.error) throw new Error(`Horizons error: ${data.error}`);
          const resultText = data.result || '';
          const start = resultText.indexOf('$$SOE');
          const end = resultText.indexOf('$$EOE');
          if (start === -1 || end === -1) throw new Error('Unexpected Horizons response (no $$SOE/$$EOE)');
          const csvBlock = resultText.substring(start + 5, end).trim();
          const lines = csvBlock.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          let x, y, z;
          const hasHeader = lines.length >= 2 && /(^|,)\s*X(\b|\s|\()/i.test(lines[0]) && /(^|,)\s*Y(\b|\s|\()/i.test(lines[0]) && /(^|,)\s*Z(\b|\s|\()/i.test(lines[0]);
          if (hasHeader) {
            const headerCols = lines[0].split(',').map((s) => s.trim());
            const dataCols = lines[1].split(',').map((s) => s.trim());
            console.log(`${p.name} Headers: ${headerCols.join(' | ')}`);
            console.log(`${p.name} Data: ${dataCols.join(' | ')}`);
            
            // Look for position vector columns - they might be labeled differently
            const findVectorCol = (label) => {
              // Try exact matches first, then partial matches
              let idx = headerCols.findIndex((h) => h.toUpperCase() === label);
              if (idx === -1) idx = headerCols.findIndex((h) => h.toUpperCase().includes(label));
              if (idx === -1) idx = headerCols.findIndex((h) => h.toUpperCase().startsWith(label));
              return idx;
            };
            
            let ix = findVectorCol('X');
            let iy = findVectorCol('Y'); 
            let iz = findVectorCol('Z');
            
            // If basic X/Y/Z not found, look for common Horizons vector labels
            if (ix === -1) ix = headerCols.findIndex((h) => /X\s*\(.*AU.*\)/i.test(h) || /Position.*X/i.test(h));
            if (iy === -1) iy = headerCols.findIndex((h) => /Y\s*\(.*AU.*\)/i.test(h) || /Position.*Y/i.test(h));
            if (iz === -1) iz = headerCols.findIndex((h) => /Z\s*\(.*AU.*\)/i.test(h) || /Position.*Z/i.test(h));
            
            console.log(`${p.name} Found vector columns at indices: X=${ix}, Y=${iy}, Z=${iz}`);
            
            if (ix === -1 || iy === -1 || iz === -1) {
              throw new Error(`X/Y/Z columns not found. Available: ${headerCols.join(', ')}`);
            }
            x = Number(dataCols[ix]);
            y = Number(dataCols[iy]);
            z = Number(dataCols[iz]);
            console.log(`${p.name} Parsed coordinates: X=${x}, Y=${y}, Z=${z}`);
          } else {
            if (lines.length === 0) throw new Error('CSV block empty');
            const valuesLine = lines[lines.length - 1];
            const parts = valuesLine.split(',').map((s) => s.trim());
            // Expected order for VEC_TABLE=1 CSV row (no header):
            // 0: JDTDB (numeric), 1: Calendar Date (string), 2: X (au), 3: Y (au), 4: Z (au), ...
            const first = Number(parts[0]);
            const second = parts[1] || '';
            const looksLikeJD = Number.isFinite(first) && first > 1e6;
            const looksLikeDate = /\d{4}-[A-Za-z]{3}-\d{2}/.test(second) || /\d{4}-\d{2}-\d{2}/.test(second);
            if (looksLikeJD && looksLikeDate && parts.length >= 5) {
              x = Number(parts[2]);
              y = Number(parts[3]);
              z = Number(parts[4]);
            } else {
              // Fallback: take first three numeric tokens but skip an initial large JD if present
              const nums = [];
              for (let i = 0; i < parts.length; i++) {
                const n = Number(parts[i]);
                if (!Number.isFinite(n)) continue;
                // Skip first field if it's clearly a JD
                if (i === 0 && n > 1e6) continue;
                nums.push(n);
              }
              if (nums.length < 3) throw new Error('Unable to extract XYZ from CSV line');
              [x, y, z] = nums.slice(0, 3);
            }
          }
          if (![x, y, z].every(Number.isFinite)) throw new Error('Non-numeric XYZ');
          return { id: p.id ?? null, name: p.name, type: p.type || (p.id ? 'planet' : 'spacecraft'), x, y, z };
        } catch (e) {
          lastErr = e;
          const baseDelay = 300 * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 150);
          await sleep(baseDelay + jitter);
        }
      }
      return { id: p.id ?? null, name: p.name, type: p.type || (p.id ? 'planet' : 'spacecraft'), error: String(lastErr) };
    }

    // Respect query to include/exclude spacecraft for performance
    const includeSpace = req.query.spacecraft !== 'false' && req.query.spacecraft !== '0';
    const targets = includeSpace ? [...PLANETS, ...SPACECRAFT] : [...PLANETS];
    const results = [];
    for (const p of targets) {
      // small spacing between calls to be gentle on the API
      console.log(`Processing ${p.name}...`);
      const r = await fetchOne(p);
      console.log(`${p.name} result:`, r);
      results.push(r);
      await sleep(100 + Math.floor(Math.random() * 100));
    }
    const successes = results.filter((r) => r.x !== undefined && r.y !== undefined && r.z !== undefined);
    const failures = results.filter((r) => r.error);

    if (successes.length === 0) {
      if (cache.data) {
        const stale = { ...cache.data, stale: true, warnings: ['Using cached data due to upstream API errors.'] };
        return res.json(stale);
      }
      // No data to serve and no cache
      return res.status(503).json({ error: 'Upstream Horizons service unavailable; please try again shortly.' });
    }

    const payload = {
      timestamp_utc: timeStr,
      center: 'Sun',
      ref_plane: 'ECLIPTIC',
      units: { distance: 'au' },
      bodies: successes,
      failed: failures.map(({ id, name, error }) => ({ id, name, error }))
    };
    cache = { data: payload, ts: Date.now() };
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`AstroTrack server running at http://localhost:${PORT}`);
});
