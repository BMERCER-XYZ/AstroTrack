const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
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
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 70%)`;
}

function drawGrid(centerX, centerY, pxPerAU) {
  ctx.save();
  ctx.strokeStyle = '#182131';
  ctx.lineWidth = 1;
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
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.offsetWidth || 600;
  const cssH = canvas.clientHeight || canvas.offsetHeight || cssW;
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: cssW, height: cssH };
}

function drawScene(data) {
  const size = computeCanvasSize();
  const cx = size.width / 2;
  const cy = size.height / 2;
  const zoomFactor = parseFloat(zoomSlider.value) || 1;
  zoomValue.textContent = zoomFactor.toFixed(1) + 'x';
  let pxPerAU = 100 * zoomFactor;

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(0, 0, size.width, size.height);

  drawGrid(cx, cy, pxPerAU);

  ctx.fillStyle = colors['Sun'];
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  let maxR = 0;
  for (const b of data.bodies) {
    const r = Math.hypot(b.x, b.y);
    if (r > maxR) maxR = r;
  }
  const radiusLimitPx = Math.min(size.width, size.height) / 2 - 24;
  const currentMaxPx = maxR * pxPerAU;
  if (currentMaxPx > radiusLimitPx && maxR > 0 && zoomFactor <= 1) {
    const autoFitScale = Math.max(1, radiusLimitPx / maxR);
    pxPerAU = Math.min(pxPerAU, autoFitScale);
  }

  try {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const b of data.bodies) {
      const a = (typeof window !== 'undefined' && window.semiMajorAU) ? window.semiMajorAU[b.name] : undefined;
      if (!a) continue;
      const r = a * pxPerAU;
      if (r < 4) continue;
      ctx.strokeStyle = (colors[b.name] || '#9bd1ff') + 'cc';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } catch {}

  legendEl.innerHTML = '';

  const showSpace = toggleSpacecraft ? toggleSpacecraft.checked : true;
  for (const b of data.bodies) {
    if (b.type === 'spacecraft' && !showSpace) continue;
    const x = cx + b.x * pxPerAU;
    const y = cy - b.y * pxPerAU;
    const color = colors[b.name] || (b.type === 'spacecraft' ? pickSpacecraftColor(b.name) : '#9bd1ff');

    ctx.fillStyle = color;
    ctx.beginPath();
    if (b.type === 'spacecraft') {
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

  const auPer100px = (100 / pxPerAU).toFixed(2);
  tsEl.textContent = `UTC ${data.timestamp_utc} • ${auPer100px} AU per 100px`;
}

async function load() {
  try {
    const res = await fetch('./data/positions.json', { cache: 'no-store' });
    const data = await res.json();
    window.lastDataCache = data;
    drawScene(data);
  } catch (e) {
    tsEl.textContent = `Error: ${e.message}`;
    console.error(e);
  }
}

zoomSlider.addEventListener('input', () => {
  if (window.lastDataCache) drawScene(window.lastDataCache);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  let currentZoom = parseFloat(zoomSlider.value) || 1;
  let newZoom = Math.max(0.1, Math.min(50, currentZoom + delta));
  zoomSlider.value = newZoom;
  zoomValue.textContent = newZoom.toFixed(1) + 'x';
  if (window.lastDataCache) drawScene(window.lastDataCache);
}, { passive: false });

window.addEventListener('resize', () => {
  if (window.lastDataCache) drawScene(window.lastDataCache);
});

load();
