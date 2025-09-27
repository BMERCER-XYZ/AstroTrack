#!/usr/bin/env node
import fs from 'fs';
import fetch from 'node-fetch';

// Load spacecraft list if available
function loadSpacecraft() {
  const path = new URL('../config/spacecraft.json', import.meta.url);
  try {
    const txt = fs.readFileSync(path, 'utf-8');
    const list = JSON.parse(txt);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function horizonsNowUTC() {
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

const PLANETS = [
  { id: '199', name: 'Mercury', type: 'planet' },
  { id: '299', name: 'Venus', type: 'planet' },
  { id: '399', name: 'Earth', type: 'planet' },
  { id: '499', name: 'Mars', type: 'planet' },
  { id: '599', name: 'Jupiter', type: 'planet' },
  { id: '699', name: 'Saturn', type: 'planet' },
  { id: '799', name: 'Uranus', type: 'planet' },
  { id: '899', name: 'Neptune', type: 'planet' },
  { id: '999', name: 'Pluto Barycenter', type: 'planet' }
];

const SPACECRAFT = loadSpacecraft().map(s => ({ ...s, type: 'spacecraft' }));

async function fetchOne(p, timeStr) {
  const base = 'https://ssd.jpl.nasa.gov/api/horizons.api';
  const params = new URLSearchParams({
    format: 'json',
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
  const resultText = data.result || '';
  const start = resultText.indexOf('$$SOE');
  const end = resultText.indexOf('$$EOE');
  if (start === -1 || end === -1) throw new Error('Unexpected Horizons response');
  const csvBlock = resultText.substring(start + 5, end).trim();
  const lines = csvBlock.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let x,y,z;
  const hasHeader = lines.length >= 2 && /(^|,)\s*X(\b|\s|\()/i.test(lines[0]) && /(^|,)\s*Y(\b|\s|\()/i.test(lines[0]) && /(^|,)\s*Z(\b|\s|\()/i.test(lines[0]);
  if (hasHeader) {
    const headerCols = lines[0].split(',').map(s => s.trim());
    const dataCols = lines[1].split(',').map(s => s.trim());
    const find = (label) => {
      let idx = headerCols.findIndex(h => h.toUpperCase() === label);
      if (idx === -1) idx = headerCols.findIndex(h => h.toUpperCase().includes(label));
      if (idx === -1) idx = headerCols.findIndex(h => h.toUpperCase().startsWith(label));
      return idx;
    };
    let ix = find('X'); let iy = find('Y'); let iz = find('Z');
    if (ix === -1) ix = headerCols.findIndex(h => /X\s*\(.*AU.*\)/i.test(h) || /Position.*X/i.test(h));
    if (iy === -1) iy = headerCols.findIndex(h => /Y\s*\(.*AU.*\)/i.test(h) || /Position.*Y/i.test(h));
    if (iz === -1) iz = headerCols.findIndex(h => /Z\s*\(.*AU.*\)/i.test(h) || /Position.*Z/i.test(h));
    if (ix === -1 || iy === -1 || iz === -1) throw new Error('XYZ columns not found');
    x = Number(dataCols[ix]); y = Number(dataCols[iy]); z = Number(dataCols[iz]);
  } else {
    if (lines.length === 0) throw new Error('CSV block empty');
    const parts = lines[lines.length - 1].split(',').map(s => s.trim());
    const first = Number(parts[0]);
    const looksLikeJD = Number.isFinite(first) && first > 1e6;
    if (looksLikeJD && parts.length >= 5) {
      x = Number(parts[2]); y = Number(parts[3]); z = Number(parts[4]);
    } else {
      const nums = [];
      for (let i=0;i<parts.length;i++) {
        const n = Number(parts[i]);
        if (!Number.isFinite(n)) continue;
        if (i === 0 && n > 1e6) continue;
        nums.push(n);
      }
      if (nums.length < 3) throw new Error('Unable to extract XYZ');
      [x,y,z] = nums.slice(0,3);
    }
  }
  if (![x,y,z].every(Number.isFinite)) throw new Error('Non-numeric XYZ');
  return { id: p.id ?? null, name: p.name, type: p.type || (p.id ? 'planet' : 'spacecraft'), x, y, z };
}

async function main() {
  const timeStr = horizonsNowUTC();
  const targets = [...PLANETS, ...SPACECRAFT];
  const results = [];
  for (const p of targets) {
    try {
      const r = await fetchOne(p, timeStr);
      results.push(r);
      await new Promise(r => setTimeout(r, 150 + Math.floor(Math.random()*150)));
    } catch (e) {
      results.push({ id: p.id ?? null, name: p.name, type: p.type || (p.id ? 'planet' : 'spacecraft'), error: String(e) });
    }
  }
  const successes = results.filter(r => r.x !== undefined && r.y !== undefined && r.z !== undefined);
  const failures = results.filter(r => r.error);
  const payload = {
    timestamp_utc: timeStr,
    center: 'Sun',
    ref_plane: 'ECLIPTIC',
    units: { distance: 'au' },
    bodies: successes,
    failed: failures.map(({ id, name, error }) => ({ id, name, error }))
  };
  const outPath = new URL('../docs/data/positions.json', import.meta.url);
  fs.mkdirSync(new URL('../docs/data/', import.meta.url), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log('Wrote', outPath.pathname);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
