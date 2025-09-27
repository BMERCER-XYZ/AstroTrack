const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scaleInput = document.getElementById('scaleInput');
const refreshBtn = document.getElementById('refreshBtn');
const tsEl = document.getElementById('timestamp');
const legendEl = document.getElementById('legend');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const toggleSpacecraft = document.getElementById('toggleSpacecraft');
const spacecraftTogglesEl = document.getElementById('spacecraft-toggles');
const showAllBtn = document.getElementById('showAllSpacecraft');
const hideAllBtn = document.getElementById('hideAllSpacecraft');


// Individual spacecraft visibility state (all off by default)
let spacecraftVisibility = {};

// Track which body is the zoom center (default: Sun)
let zoomCenterName = 'Sun';
let zoomCenterCoords = { x: 0, y: 0 };

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

function createSpacecraftControls(data) {
  const spacecraft = data.bodies.filter(b => b.type === 'spacecraft');
  
  // Initialize visibility state for all spacecraft (off by default)
  spacecraft.forEach(sc => {
    if (!(sc.name in spacecraftVisibility)) {
      spacecraftVisibility[sc.name] = false;
    }
  });
  
  // Clear existing controls
  spacecraftTogglesEl.innerHTML = '';
  
  // Create toggle for each spacecraft
  spacecraft.forEach(sc => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = spacecraftVisibility[sc.name];
    checkbox.addEventListener('change', () => {
      spacecraftVisibility[sc.name] = checkbox.checked;
      if (window.lastDataCache) {
        drawScene(window.lastDataCache);
      }
    });
    
    const colorIndicator = document.createElement('span');
    const color = pickSpacecraftColor(sc.name);
    colorIndicator.style.cssText = `
      display: inline-block; 
      width: 10px; 
      height: 10px; 
      background: ${color}; 
      clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
      margin-left: 2px;
    `;
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = sc.name;
    nameSpan.style.fontSize = '11px';
    
    label.appendChild(checkbox);
    label.appendChild(colorIndicator);
    label.appendChild(nameSpan);
    spacecraftTogglesEl.appendChild(label);
  });
}

function drawLabelWithCollisionAvoidance(ctx, text, x, y, existingLabels, color = '#cfe3ff') {
  const padding = 4;
  const metrics = ctx.measureText(text);
  const width = metrics.width + padding * 2;
  const height = 16; // approximate text height
  
  // Try different positions: right, left, above, below
  const positions = [
    { x: x + 8, y: y - 6, align: 'left' },     // right
    { x: x - 8, y: y - 6, align: 'right' },   // left
    { x: x, y: y - 20, align: 'center' },     // above
    { x: x, y: y + 20, align: 'center' },     // below
    { x: x + 12, y: y + 12, align: 'left' },  // bottom-right
    { x: x - 12, y: y + 12, align: 'right' }  // bottom-left
  ];
  
  for (const pos of positions) {
    let labelX = pos.x;
    if (pos.align === 'right') labelX -= width;
    if (pos.align === 'center') labelX -= width / 2;
    
    const labelRect = {
      x: labelX - padding,
      y: pos.y - height + 4,
      width: width,
      height: height
    };
    
    // Check for collisions
    let collision = false;
    for (const existing of existingLabels) {
      if (labelRect.x < existing.x + existing.width &&
          labelRect.x + labelRect.width > existing.x &&
          labelRect.y < existing.y + existing.height &&
          labelRect.y + labelRect.height > existing.y) {
        collision = true;
        break;
      }
    }
    
    if (!collision) {
      // Draw semi-transparent background for better readability
      ctx.fillStyle = 'rgba(10, 14, 19, 0.8)';
      ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
      
      // Draw text
      ctx.fillStyle = color;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = pos.align;
      ctx.fillText(text, pos.x, pos.y);
      
      existingLabels.push(labelRect);
      return true;
    }
  }
  
  // If no position works, draw at default position anyway
  ctx.fillStyle = color;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 6, y - 6);
  return false;
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
  // Find the zoom center body robustly
  let centerBody = data.bodies.find(b => b.name === zoomCenterName);
  if (!centerBody) {
    centerBody = data.bodies.find(b => b.name === 'Sun');
    if (!centerBody) {
      centerBody = data.bodies.find(b => b.type === 'planet');
      if (!centerBody) {
        console.warn('No valid zoom center found!');
        return;
      }
    }
    zoomCenterName = centerBody.name;
    console.warn('Zoom center not found, defaulting to', zoomCenterName);
  }
  zoomCenterCoords = { x: centerBody.x, y: centerBody.y };

  const size = computeCanvasSize();
  const cx = size.width / 2;
  const cy = size.height / 2;
  const zoomFactor = parseFloat(zoomSlider.value) || 1;
  zoomValue.textContent = zoomFactor.toFixed(1) + 'x';
  let pxPerAU = 100 * zoomFactor;

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(0, 0, size.width, size.height);

  // Sun position in screen coords (origin of frame)
  const sunScreenX = cx + (0 - zoomCenterCoords.x) * pxPerAU;
  const sunScreenY = cy - (0 - zoomCenterCoords.y) * pxPerAU;

  // Draw AU grid centered on the Sun (not on zoom center)
  drawGrid(sunScreenX, sunScreenY, pxPerAU);

  // Draw Sun marker and subtle glow at Sun's screen position
  ctx.fillStyle = colors['Sun'];
  ctx.beginPath();
  ctx.arc(sunScreenX, sunScreenY, 8, 0, Math.PI * 2);
  ctx.fill();
  const gradient = ctx.createRadialGradient(sunScreenX, sunScreenY, 8, sunScreenX, sunScreenY, 20);
  gradient.addColorStop(0, 'rgba(255, 204, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 204, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(sunScreenX, sunScreenY, 20, 0, Math.PI * 2);
  ctx.fill();

  // Draw orbits always centered on the Sun, even if zoomed on another planet
  try {
    ctx.save();
    ctx.lineWidth = 1.5;
    // Orbits centered on Sun origin (0,0) projected into view
    const orbitCx = sunScreenX;
    const orbitCy = sunScreenY;
    for (const b of data.bodies) {
      if (b.type !== 'planet') continue;
      const a = (typeof window !== 'undefined' && window.semiMajorAU) ? window.semiMajorAU[b.name] : undefined;
      if (!a) continue;
      const r = a * pxPerAU;
      if (r < 4) continue;
      ctx.strokeStyle = (colors[b.name] || '#9bd1ff') + '40';
      ctx.beginPath();
      ctx.arc(orbitCx, orbitCy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } catch (e) {
    console.warn('Orbit drawing skipped:', e);
  }

  // Legend
  legendEl.innerHTML = '';
  const existingLabels = [];
  const failed = Array.isArray(data.failed) ? data.failed : [];
  const visibleBodies = [];

  for (const b of data.bodies) {
    let isVisible = false;
    if (b.type === 'planet') {
      isVisible = true;
    } else if (b.type === 'spacecraft') {
      isVisible = spacecraftVisibility[b.name] || (toggleSpacecraft && toggleSpacecraft.checked);
    }
    if (!isVisible) continue;
    visibleBodies.push(b);
    // Project body position relative to zoom center
    const x = cx + (b.x - zoomCenterCoords.x) * pxPerAU;
    const y = cy - (b.y - zoomCenterCoords.y) * pxPerAU;
    const color = colors[b.name] || (b.type === 'spacecraft' ? pickSpacecraftColor(b.name) : '#9bd1ff');
    ctx.fillStyle = color;
    ctx.beginPath();
    if (b.type === 'spacecraft') {
      const size = 6;
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const radius = b.name === 'Jupiter' ? 6 : b.name === 'Saturn' ? 5 : 4;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Highlight zoom center
      if (b.name === zoomCenterName) {
        ctx.save();
        ctx.strokeStyle = '#5cc8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    drawLabelWithCollisionAvoidance(ctx, b.name, x, y, existingLabels, '#cfe3ff');
  }

  for (const b of visibleBodies) {
    const li = document.createElement('li');
    const shape = b.type === 'spacecraft' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);' : 'border-radius:50%;';
    const color = colors[b.name] || (b.type === 'spacecraft' ? pickSpacecraftColor(b.name) : '#9bd1ff');
    li.innerHTML = `<span style="display:inline-block;width:12px;height:12px;${shape}background:${color};margin-right:6px;vertical-align:middle;border:1px solid #ffffff40"></span>${b.name} — (${b.x.toFixed(3)}, ${b.y.toFixed(3)}) AU`;
    legendEl.appendChild(li);
  }
  if (failed.length > 0) {
    const li = document.createElement('li');
    li.style.color = '#ffb4a6';
    li.textContent = `Some bodies failed to load: ${failed.map(f => f.name).join(', ')}`;
    legendEl.appendChild(li);
  }
  const auPer100px = (100 / pxPerAU).toFixed(2);
  tsEl.textContent = `UTC ${data.timestamp_utc} • ${auPer100px} AU per 100px • Center: ${zoomCenterName} • Showing ${visibleBodies.length} bodies`;
}

async function load(forceRefresh = false) {
  try {
    // Load data from static JSON file
    const res = await fetch('./data/positions.json');
    const data = await res.json();
    
    // Create spacecraft controls on first load
    createSpacecraftControls(data);
    
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

// Toggle spacecraft - now affects all spacecraft
if (toggleSpacecraft) {
  toggleSpacecraft.addEventListener('change', () => {
    if (window.lastDataCache) {
      drawScene(window.lastDataCache);
    }
  });
}

// Show/Hide all spacecraft buttons
showAllBtn.addEventListener('click', () => {
  Object.keys(spacecraftVisibility).forEach(name => {
    spacecraftVisibility[name] = true;
  });
  // Update all checkboxes
  spacecraftTogglesEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  }
});

hideAllBtn.addEventListener('click', () => {
  Object.keys(spacecraftVisibility).forEach(name => {
    spacecraftVisibility[name] = false;
  });
  // Update all checkboxes
  spacecraftTogglesEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  }
});


// Mouse wheel zoom (centered on selected body)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  let currentZoom = parseFloat(zoomSlider.value) || 1;
  let newZoom = currentZoom + delta;
  newZoom = Math.max(0.1, Math.min(50, newZoom));
  zoomSlider.value = newZoom;
  zoomValue.textContent = newZoom.toFixed(1) + 'x';
  if (window.lastDataCache) {
    drawScene(window.lastDataCache);
  }
}, { passive: false });

// Click to set zoom center to a planet
canvas.addEventListener('click', (e) => {
  if (!window.lastDataCache) return;
  const rect = canvas.getBoundingClientRect();
  const size = computeCanvasSize();
  const cx = size.width / 2;
  const cy = size.height / 2;
  // Mouse position relative to canvas center
  const mx = (e.clientX - rect.left);
  const my = (e.clientY - rect.top);
  const zoomFactor = parseFloat(zoomSlider.value) || 1;
  let pxPerAU = 100 * zoomFactor;
  // Find which planet is closest to click (within 12px)
  let minDist = 16;
  let found = null;
  for (const b of window.lastDataCache.bodies) {
    if (b.type !== 'planet') continue;
    // Project body position relative to current zoom center
    const bx = cx + (b.x - zoomCenterCoords.x) * pxPerAU;
    const by = cy - (b.y - zoomCenterCoords.y) * pxPerAU;
    const dist = Math.hypot(mx - bx, my - by);
    if (dist < minDist) {
      minDist = dist;
      found = b;
    }
  }
  if (found) {
    zoomCenterName = found.name;
    drawScene(window.lastDataCache);
  }
});

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
