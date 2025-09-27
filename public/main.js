const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scaleInput = document.getElementById('scaleInput');
const refreshBtn = document.getElementById('refreshBtn');
const tsEl = document.getElementById('timestamp');
const legendEl = document.getElementById('legend');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const toggleSpacecraft = document.getElementById('toggleSpacecraft');

const colors = {
  Sun: '#ffcc00',
  Mercury: '#b1aa9f',
  Venus: '#d4a373',
  Earth: '#4dabf7',
  Mars: '#ef6c57',
  Jupiter: '#c4b69d',
  Saturn: '#d1c089',
  Uranus: '#7fd1d8',
  Neptune: '#6a8bd1',
  'Pluto Barycenter': '#caa6ff'
};

function pickSpacecraftColor(name) {
  // deterministic pastel-ish hash color for spacecraft
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 70%)`;
}

function drawGrid(centerX, centerY, pxPerAU) {
  ctx.save();
  ctx.strokeStyle = '#182131';
  ctx.lineWidth = 1;
  // AU rings 1..30
  for (let au = 1; au <= 30; au++) {
    const r = au * pxPerAU;
    if (r > Math.max(canvas.width, canvas.height)) break;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
    if (au % 2 === 0) {
      ctx.fillStyle = '#3b4b63';
      ctx.fillText(`${au} AU`, centerX + r + 4, centerY + 12);
    }
  }
  ctx.restore();
}

// Approximate semi-major axes (au) for visual orbit rings
if (typeof window !== 'undefined') {
  window.semiMajorAU = window.semiMajorAU || {
    Mercury: 0.387,
    Venus: 0.723,
    Earth: 1.0,
    Mars: 1.524,
    Jupiter: 5.203,
    Saturn: 9.537,
    Uranus: 19.191,
    Neptune: 30.07,
    'Pluto Barycenter': 39.48
  };
}

function computeCanvasSize() {
  // Ensure canvas has a proper internal resolution and accounts for device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.offsetWidth || 600;
  const cssH = canvas.clientHeight || canvas.offsetHeight || cssW; // use actual CSS height
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing to CSS pixels
  return { width: cssW, height: cssH };
}

function drawScene(data) {
  console.log('drawScene called with data:', data);
  const size = computeCanvasSize();
  console.log('Canvas size:', size, 'Internal resolution:', canvas.width, 'x', canvas.height);
  const cx = size.width / 2;
  const cy = size.height / 2;
  
  // Use zoom slider for scale instead of manual input
  const zoomFactor = parseFloat(zoomSlider.value) || 1;
  zoomValue.textContent = zoomFactor.toFixed(1) + 'x';
  
  // Base scale: 1 AU = 100px at 1x zoom
  let pxPerAU = 100 * zoomFactor;
  console.log('Zoom factor:', zoomFactor, 'pxPerAU:', pxPerAU);

  ctx.clearRect(0, 0, size.width, size.height);
  // background
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(0, 0, size.width, size.height);
  console.log('Canvas cleared and background drawn');

  drawGrid(cx, cy, pxPerAU);
  
      // (Orbit rings are drawn after auto-fit scaling below)

  // Draw Sun
  ctx.fillStyle = colors['Sun'];
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  console.log('Sun drawn at:', cx, cy);

  // Auto-fit: only reduce scale if planets would go off-screen, but don't override manual zoom-in
  let maxR = 0;
  for (const b of data.bodies) {
    const r = Math.hypot(b.x, b.y);
    if (r > maxR) maxR = r;
  }
  const radiusLimitPx = Math.min(size.width, size.height) / 2 - 24;
  const currentMaxPx = maxR * pxPerAU;
  
  // Only auto-fit if the outermost planet would be off-screen AND we haven't manually zoomed in
  if (currentMaxPx > radiusLimitPx && maxR > 0 && zoomFactor <= 1) {
    const autoFitScale = Math.max(1, radiusLimitPx / maxR);
    pxPerAU = Math.min(pxPerAU, autoFitScale); // Don't zoom in more than manual setting
  }

  // Draw orbits as circular rings using approximate semi-major axes with final pxPerAU
  try {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const b of data.bodies) {
      const a = (typeof window !== 'undefined' && window.semiMajorAU) ? window.semiMajorAU[b.name] : undefined;
      if (!a) continue;
      const r = a * pxPerAU;
      if (r < 4) continue;
      ctx.strokeStyle = (colors[b.name] || '#9bd1ff') + 'cc'; // add some opacity
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } catch (e) {
    console.warn('Orbit drawing skipped:', e);
  }

  // Legend
  legendEl.innerHTML = '';

  // Draw bodies
  const failed = Array.isArray(data.failed) ? data.failed : [];

  console.log('Drawing', data.bodies.length, 'bodies with pxPerAU:', pxPerAU);
  const showSpace = toggleSpacecraft ? toggleSpacecraft.checked : true;
  for (const b of data.bodies) {
    if (b.type === 'spacecraft' && !showSpace) continue;
    const x = cx + b.x * pxPerAU;
    const y = cy - b.y * pxPerAU; // invert y for screen
    const color = colors[b.name] || (b.type === 'spacecraft' ? pickSpacecraftColor(b.name) : '#9bd1ff');
    console.log(`${b.name}: AU(${b.x.toFixed(3)}, ${b.y.toFixed(3)}) -> screen(${x.toFixed(1)}, ${y.toFixed(1)}), color: ${color}`);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    if (b.type === 'spacecraft') {
      // draw diamond marker
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#cfe3ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${b.name}`, x + 6, y - 6);

    const li = document.createElement('li');
    const shape = b.type === 'spacecraft' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);' : 'border-radius:50%;';
    li.innerHTML = `<span style="display:inline-block;width:10px;height:10px;${shape}background:${color};margin-right:6px;vertical-align:middle"></span>${b.name} — (${b.x.toFixed(3)}, ${b.y.toFixed(3)}) AU`;
    legendEl.appendChild(li);
  }

  if (failed.length > 0) {
    const li = document.createElement('li');
    li.style.color = '#ffb4a6';
    li.textContent = `Some bodies failed to load: ${failed.map(f => f.name).join(', ')}`;
    legendEl.appendChild(li);
  }

  const auPer100px = (100 / pxPerAU).toFixed(2);
  tsEl.textContent = `UTC ${data.timestamp_utc} • ${auPer100px} AU per 100px`;
}

async function load(forceRefresh = false) {
  try {
    const showSpace = toggleSpacecraft ? toggleSpacecraft.checked : true;
    
    // Load data from static JSON file
    const res = await fetch('./data/positions.json');
    const data = await res.json();
    
    // Filter spacecraft if needed
    if (!showSpace) {
      data.bodies = data.bodies.filter(body => body.type !== 'spacecraft');
    }
    
    window.lastDataCache = data; // Cache for zoom slider
    drawScene(data);
  } catch (e) {
    tsEl.textContent = `Error: ${e.message}`;
    console.error(e);
  }
}

refreshBtn.addEventListener('click', () => load(true));
scaleInput.addEventListener('change', load);
zoomSlider.addEventListener('input', () => {
  // Redraw immediately on zoom change (uses cached data)
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  }
});

// Toggle spacecraft
if (toggleSpacecraft) {
  toggleSpacecraft.addEventListener('change', () => {
    load(true);
  });
}

// Mouse wheel zoom
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); // Prevent page scroll
  
  const delta = e.deltaY > 0 ? -0.1 : 0.1; // Scroll down = zoom out, scroll up = zoom in
  let currentZoom = parseFloat(zoomSlider.value) || 1;
  let newZoom = currentZoom + delta;
  
  // Clamp to slider bounds
  newZoom = Math.max(0.1, Math.min(50, newZoom));
  
  zoomSlider.value = newZoom;
  zoomValue.textContent = newZoom.toFixed(1) + 'x';
  
  // Redraw with new zoom
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  }
}, { passive: false });

function safeLoad() {
  // If layout not ready and canvas width is zero, defer a bit
  if ((canvas.clientWidth || canvas.offsetWidth) === 0) {
    requestAnimationFrame(safeLoad);
    return;
  }
  load();
}

window.addEventListener('resize', () => {
  // Redraw with current data if available by triggering a load (uses server cache)
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  } else {
    load();
  }
});

safeLoad();
// Remove automatic refresh for static data
// setInterval(load, 60_000); // refresh every minute
