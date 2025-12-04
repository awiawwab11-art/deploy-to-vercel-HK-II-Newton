// app.js (updated: add drag model and RK4 integrator)
// Simulasi F = m·a (dengan gesekan), plotting x(t) & v(t), ekspor CSV
// Tambahan: drag udara (linear/quadratic) dan opsi integrator (Euler/RK4)

const g = 9.81; // m/s^2

// DOM
const massNum = document.getElementById('massNum');
const forceRange = document.getElementById('forceRange');
const forceNum = document.getElementById('forceNum');
const muRange = document.getElementById('muRange');
const muNum = document.getElementById('muNum');
const frictionToggle = document.getElementById('frictionToggle');

const vRange = document.getElementById('vRange');
const vNum = document.getElementById('vNum');

const dragToggle = document.getElementById('dragToggle');
const dragModel = document.getElementById('dragModel');
const rhoNum = document.getElementById('rhoNum');
const cdNum = document.getElementById('cdNum');
const areaNum = document.getElementById('areaNum');
const kNum = document.getElementById('kNum');

const integratorSelect = document.getElementById('integratorSelect');

const tVal = document.getElementById('tVal');
const xVal = document.getElementById('xVal');
const vDisplay = document.getElementById('vDisplay');
const aVal = document.getElementById('aVal');

const FaVal = document.getElementById('FaVal');
const FfVal = document.getElementById('FfVal');
const FdragVal = document.getElementById('FdragVal');
const FnetVal = document.getElementById('FnetVal');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const clearPlotBtn = document.getElementById('clearPlotBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportMode = document.getElementById('exportMode');

const winSecDisplay = document.getElementById('winSecDisplay');

// Canvases
const simCanvas = document.getElementById('simCanvas');
const ctx = simCanvas.getContext('2d');
const W = simCanvas.width;
const H = simCanvas.height;
const roadY = H / 2 + 34;

const plotX = document.getElementById('plotX');
const ctxX = plotX.getContext('2d');
const plotV = document.getElementById('plotV');
const ctxV = plotV.getContext('2d');

// Car SVG
const carSVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='300' height='120' viewBox='0 0 300 120'>
  <defs>
    <linearGradient id="bodyGrad" x1="0" x2="1">
      <stop offset="0" stop-color="#2c7be5"/>
      <stop offset="1" stop-color="#1951b5"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" x2="1">
      <stop offset="0" stop-color="#bfe6ff"/>
      <stop offset="1" stop-color="#7fcafe"/>
    </linearGradient>
  </defs>
  <g transform="translate(0,10)">
    <rect x="20" y="40" rx="14" ry="14" width="260" height="38" fill="url(#bodyGrad)"/>
    <path d="M60 40 Q90 10 150 10 Q210 10 240 40" fill="url(#bodyGrad)"/>
    <path d="M85 40 Q110 18 150 18 Q190 18 215 40 L85 40" fill="url(#glass)"/>
    <rect x="22" y="44" width="10" height="28" rx="4" fill="#0f3d5a" />
    <circle cx="270" cy="58" r="5" fill="#ffd24a"/>
    <circle cx="30" cy="58" r="5" fill="#ffd24a"/>
    <g>
      <circle cx="95" cy="92" r="18" fill="#111"/>
      <circle cx="95" cy="92" r="10" fill="#666"/>
      <circle cx="205" cy="92" r="18" fill="#111"/>
      <circle cx="205" cy="92" r="10" fill="#666"/>
    </g>
    <rect x="50" y="56" width="200" height="6" rx="3" fill="rgba(255,255,255,0.12)"/>
  </g>
</svg>`.trim();

const carImg = new Image();
carImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(carSVG);
const carWidthMeters = 4.2;
const carHeightMeters = 1.6;

// SIM STATE
let m = parseFloat(massNum.value);
let F_applied = parseFloat(forceNum.value) || 0;
let mu = parseFloat(muNum.value) || 0;
let frictionOn = frictionToggle.checked;

let v_input = parseFloat(vNum.value) || 0;

let t = 0;
let x = 0;
let v = v_input;
let a = 0;

let running = false;
let lastTS = null;

// HISTORY
const history = { t: [], x: [], v: [], Fa: [], Ff: [], Fdrag: [], Fnet: [] };
const maxHistoryLen = 20000;
let windowSeconds = 12;
winSecDisplay.textContent = windowSeconds;

// INPUT SYNC
forceRange.addEventListener('input', () => { forceNum.value = forceRange.value; updateFromControls(); });
forceNum.addEventListener('input', () => { forceRange.value = forceNum.value; updateFromControls(); });
muRange.addEventListener('input', () => { muNum.value = muRange.value; updateFromControls(); });
muNum.addEventListener('input', () => { muRange.value = muNum.value; updateFromControls(); });
massNum.addEventListener('input', updateFromControls);
frictionToggle.addEventListener('change', updateFromControls);

vRange.addEventListener('input', () => {
  vNum.value = vRange.value;
  v_input = parseFloat(vRange.value) || 0;
  v = v_input;
  updateFromControls();
});
vNum.addEventListener('input', () => {
  vRange.value = vNum.value;
  v_input = parseFloat(vNum.value) || 0;
  v = v_input;
  updateFromControls();
});

// drag & integrator controls
[dragToggle, dragModel, rhoNum, cdNum, areaNum, kNum, integratorSelect].forEach(el => {
  el.addEventListener('input', updateFromControls);
  el.addEventListener('change', updateFromControls);
});

function updateFromControls() {
  m = Math.max(0.0001, parseFloat(massNum.value) || 0.0001);
  F_applied = parseFloat(forceNum.value) || 0;
  mu = Math.max(0, Math.min(1, parseFloat(muNum.value) || 0));
  frictionOn = frictionToggle.checked;
  v_input = parseFloat(vNum.value) || 0;
  if (!running) v = v_input;
  FaVal.textContent = (F_applied).toFixed(1);
  updateStats();
  render();
}

startBtn.addEventListener('click', () => { if (!running) { running = true; lastTS = null; requestAnimationFrame(loop); } });
pauseBtn.addEventListener('click', () => { running = false; lastTS = null; });
resetBtn.addEventListener('click', () => {
  running = false; lastTS = null;
  t = 0; x = 0; v = parseFloat(vNum.value) || 0; a = 0;
  clearHistory(); updateStats(); render(); drawPlots();
});
clearPlotBtn.addEventListener('click', () => { clearHistory(); drawPlots(); });

function clearHistory() {
  history.t.length = 0; history.x.length = 0; history.v.length = 0;
  history.Fa.length = 0; history.Ff.length = 0; history.Fdrag.length = 0; history.Fnet.length = 0;
}

// PHYSICS HELPERS
function computeFriction(F_appl, v_local) {
  const F_fric_max = frictionOn ? (mu * m * g) : 0;
  // If nearly at rest and applied doesn't exceed static friction, static holds
  const vThreshold = 1e-3;
  if (Math.abs(v_local) < vThreshold) {
    if (Math.abs(F_appl) <= F_fric_max) {
      return { Ff: -F_appl, staticHold: true };
    }
    // else kinetic friction opposing direction of impending motion
    return { Ff: -Math.sign(F_appl) * F_fric_max, staticHold: false };
  } else {
    // moving: kinetic friction opposes velocity
    return { Ff: -Math.sign(v_local) * F_fric_max, staticHold: false };
  }
}

function computeDrag(v_local) {
  if (!dragToggle.checked) return 0;
  const model = dragModel.value;
  if (model === 'quadratic') {
    const rho = parseFloat(rhoNum.value) || 1.225;
    const Cd = parseFloat(cdNum.value) || 0.32;
    const A = parseFloat(areaNum.value) || 2.2;
    // F_drag = -0.5 * rho * Cd * A * v * |v|
    return -0.5 * rho * Cd * A * v_local * Math.abs(v_local);
  } else {
    // linear model F = -k * v
    const k = parseFloat(kNum.value) || 12;
    return -k * v_local;
  }
}

// acceleration function used by integrators: returns dv/dt given v (and x if needed)
function acceleration_for(v_local, F_appl) {
  // check static friction condition first: if v ~ 0 and F_appl small enough
  const frictionResult = computeFriction(F_appl, v_local);
  if (frictionResult.staticHold) {
    // static equilibrium: a = 0, v stays 0
    return { a: 0, Ff: frictionResult.Ff, Fdrag: 0, Fnet: 0 };
  }
  const Ff = frictionResult.Ff;
  const Fdrag = computeDrag(v_local);
  const Fnet = F_appl + Ff + Fdrag;
  const a_local = Fnet / m;
  return { a: a_local, Ff, Fdrag, Fnet };
}

// RK4 integrator for state [x, v]
// dy/dt = [v, a(v)]
function rk4_step(x0, v0, dt, F_appl) {
  // k1
  const k1x = v0;
  const r1 = acceleration_for(v0, F_appl);
  const k1v = r1.a;

  // k2
  const v_k2 = v0 + 0.5 * dt * k1v;
  const k2x = v0 + 0.5 * dt * k1v;
  const r2 = acceleration_for(v_k2, F_appl);
  const k2v = r2.a;

  // k3
  const v_k3 = v0 + 0.5 * dt * k2v;
  const k3x = v_k2;
  const r3 = acceleration_for(v_k3, F_appl);
  const k3v = r3.a;

  // k4
  const v_k4 = v0 + dt * k3v;
  const k4x = v_k3;
  const r4 = acceleration_for(v_k4, F_appl);
  const k4v = r4.a;

  // combine
  const x_next = x0 + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  const v_next = v0 + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);

  // For debug/return last estimated forces, compute at v_next
  const after = acceleration_for(v_next, F_appl);

  return {
    x: x_next,
    v: v_next,
    a: after.a,
    Ff: after.Ff,
    Fdrag: after.Fdrag,
    Fnet: after.Fnet
  };
}

// EULER step
function euler_step(x0, v0, dt, F_appl) {
  const res = acceleration_for(v0, F_appl);
  const v_next = v0 + res.a * dt;
  const x_next = x0 + v0 * dt;
  // after step compute forces at new v for reporting
  const after = acceleration_for(v_next, F_appl);
  return {
    x: x_next,
    v: v_next,
    a: after.a,
    Ff: after.Ff,
    Fdrag: after.Fdrag,
    Fnet: after.Fnet
  };
}

// PHYSICS LOOP
function loop(ts) {
  if (!lastTS) lastTS = ts;
  let dt = (ts - lastTS) / 1000;
  lastTS = ts;
  if (dt > 0.05) dt = 0.05;

  // If nearly zero velocity and applied small, handle static hold without integration
  const vThreshold = 1e-3;
  const F_fric_max = frictionOn ? (mu * m * g) : 0;
  if (Math.abs(v) < vThreshold && Math.abs(F_applied) <= F_fric_max) {
    // static hold: v=0, a=0, no integration; report friction balancing applied
    const Ff = -F_applied;
    const Fdrag = 0;
    const Fnet = 0;
    a = 0;
    v = 0;
    // update time & history
    t += dt;
    pushHistorySample(t, x, v, F_applied, Ff, Fdrag, Fnet);
    FaVal.textContent = (F_applied).toFixed(1);
    FfVal.textContent = (Ff).toFixed(1);
    FdragVal.textContent = (Fdrag).toFixed(1);
    FnetVal.textContent = (Fnet).toFixed(1);
  } else {
    // integrate depending on selected integrator
    let stepResult;
    const integrator = integratorSelect.value;
    if (integrator === 'rk4') {
      stepResult = rk4_step(x, v, dt, F_applied);
    } else {
      stepResult = euler_step(x, v, dt, F_applied);
    }
    x = stepResult.x;
    v = stepResult.v;
    a = stepResult.a;
    // update time & history
    t += dt;
    pushHistorySample(t, x, v, F_applied, stepResult.Ff, stepResult.Fdrag, stepResult.Fnet);
    FaVal.textContent = (F_applied).toFixed(1);
    FfVal.textContent = (stepResult.Ff).toFixed(3);
    FdragVal.textContent = (stepResult.Fdrag).toFixed(3);
    FnetVal.textContent = (stepResult.Fnet).toFixed(3);
  }

  // clamp tiny oscillation around zero if friction holds
  if (Math.abs(v) < 1e-4 && Math.abs(F_applied) <= F_fric_max) {
    v = 0; a = 0;
  }

  // sync velocity inputs to show current v
  vNum.value = v.toFixed(2);
  vRange.value = v.toFixed(2);

  updateStats();
  render();
  drawPlots();

  if (running) requestAnimationFrame(loop);
}

function pushHistorySample(timeS, x_m, v_ms, Fa, Ff, Fdrag, Fnet) {
  history.t.push(timeS);
  history.x.push(x_m);
  history.v.push(v_ms);
  history.Fa.push(Fa);
  history.Ff.push(Ff);
  history.Fdrag.push(Fdrag);
  history.Fnet.push(Fnet);
  if (history.t.length > maxHistoryLen) {
    history.t.shift(); history.x.shift(); history.v.shift();
    history.Fa.shift(); history.Ff.shift(); history.Fdrag.shift(); history.Fnet.shift();
  }
}

// RENDER SIMULATION
function renderGrid() {
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#4a5563';
  ctx.fillRect(0, roadY, W, 36);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 4;
  ctx.setLineDash([18,12]);
  ctx.beginPath(); ctx.moveTo(0, roadY + 18); ctx.lineTo(W, roadY + 18); ctx.stroke();
  ctx.setLineDash([]);

  const desiredCarPx = 180;
  const scale = (desiredCarPx / carWidthMeters);
  const centerX = W/2;
  const metersPerTick = 5;
  const leftMeters = -centerX/scale;
  const rightMeters = (W-centerX)/scale;
  const startTick = Math.floor(leftMeters / metersPerTick) - 1;
  const endTick = Math.ceil(rightMeters / metersPerTick) + 1;
  ctx.fillStyle = '#e7eef6';
  ctx.font = '12px monospace';
  for (let i = startTick; i <= endTick; i++) {
    const meter = i * metersPerTick;
    const px = centerX + meter * scale;
    ctx.fillRect(px - 1, roadY - 18, 2, 8);
    ctx.fillText(meter.toString(), px - 10, roadY - 22);
  }
  ctx.fillStyle = '#ffe082';
  ctx.beginPath(); ctx.arc(centerX, roadY + 26, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#073b4c'; ctx.fillText('x=0', centerX - 14, roadY + 44);
  return scale;
}

function renderCarAt(x_m) {
  const scale = renderGrid();
  const centerX = W/2;
  const px = centerX + x_m * scale;
  const carPixelWidth = carWidthMeters * scale;
  const carPixelHeight = carHeightMeters * scale;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  const shadowW = carPixelWidth * 0.9;
  const shadowH = Math.max(8, carPixelHeight * 0.18);
  ctx.ellipse(px, roadY + 24, shadowW/2, shadowH/2, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(px, roadY - 12);
  const flip = v < 0 ? -1 : 1;
  ctx.scale(flip, 1);
  ctx.drawImage(carImg, -carPixelWidth/2, -carPixelHeight/2, carPixelWidth, carPixelHeight);
  ctx.restore();

  const arrowY = roadY - carPixelHeight - 18;
  const arrowLen = v * scale;
  ctx.strokeStyle = '#2d7a2d';
  ctx.fillStyle = '#2d7a2d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px, arrowY); ctx.lineTo(px + arrowLen, arrowY); ctx.stroke();
  if (Math.abs(arrowLen) > 8) {
    const s = Math.sign(arrowLen);
    ctx.beginPath();
    ctx.moveTo(px + arrowLen, arrowY);
    ctx.lineTo(px + arrowLen - s*10, arrowY - 6);
    ctx.lineTo(px + arrowLen - s*10, arrowY + 6);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#032b3a'; ctx.font = '13px monospace';
  let labelX = px + (arrowLen >= 0 ? Math.max(arrowLen, 8) + 8 : Math.min(arrowLen, -8) - 120);
  ctx.fillText('v = ' + v.toFixed(2) + ' m/s', labelX, arrowY - 6);
}

function render() { renderCarAt(x); }

// PLOTTING (same simple plotter)
function drawPlots() {
  drawPlot(ctxX, history.t, history.x, windowSeconds, { color:'#1f77b4', ylabel:'x (m)' });
  drawPlot(ctxV, history.t, history.v, windowSeconds, { color:'#2ca02c', ylabel:'v (m/s)' });
}

function drawPlot(ctxPlot, times, values, winSec, opts = {}) {
  const w = ctxPlot.canvas.width;
  const h = ctxPlot.canvas.height;
  ctxPlot.clearRect(0,0,w,h);
  ctxPlot.fillStyle = '#ffffff';
  ctxPlot.fillRect(0,0,w,h);
  if (times.length === 0) {
    ctxPlot.strokeStyle = '#e0e6ef';
    ctxPlot.lineWidth = 1;
    ctxPlot.beginPath(); ctxPlot.moveTo(40, h/2); ctxPlot.lineTo(w-10, h/2); ctxPlot.stroke();
    ctxPlot.fillStyle = '#444'; ctxPlot.font = '12px monospace'; ctxPlot.fillText('tidak ada data', 12, 16);
    return;
  }
  const tNow = times[times.length-1];
  const tStart = Math.max(0, tNow - winSec);
  let i0 = 0;
  {
    let lo = 0, hi = times.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] < tStart) lo = mid + 1;
      else { i0 = mid; hi = mid - 1; }
    }
  }
  const tView = times.slice(i0);
  const yView = values.slice(i0);
  if (tView.length === 0) return;
  const padLeft = 40, padRight = 10, padTop = 10, padBottom = 22;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  let yMin = Math.min(...yView);
  let yMax = Math.max(...yView);
  if (yMin === yMax) { yMin -= 0.5 * Math.abs(yMin || 1); yMax += 0.5 * Math.abs(yMax || 1); }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad; yMax += yPad;
  ctxPlot.strokeStyle = '#f0f4fb'; ctxPlot.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = padTop + (plotH) * (i/4);
    ctxPlot.beginPath(); ctxPlot.moveTo(padLeft, yy); ctxPlot.lineTo(w - padRight, yy); ctxPlot.stroke();
  }
  ctxPlot.strokeStyle = '#c8d3e6';
  ctxPlot.beginPath(); ctxPlot.moveTo(padLeft, padTop); ctxPlot.lineTo(padLeft, h - padBottom);
  ctxPlot.moveTo(padLeft, h - padBottom); ctxPlot.lineTo(w - padRight, h - padBottom); ctxPlot.stroke();
  ctxPlot.fillStyle = '#223'; ctxPlot.font = '12px monospace'; ctxPlot.fillText(opts.ylabel || '', 6, 14);
  ctxPlot.fillText(tNow.toFixed(2) + ' s', w - 80, h - 6);
  ctxPlot.fillStyle = '#456'; ctxPlot.font = '11px monospace';
  for (let j = 0; j <= 4; j++) {
    const frac = j / 4;
    const vy = yMax - frac * (yMax - yMin);
    const yy = padTop + frac * plotH;
    ctxPlot.fillText(vy.toFixed(2), 6, yy + 4);
  }
  ctxPlot.beginPath(); ctxPlot.lineWidth = 2; ctxPlot.strokeStyle = opts.color || '#1f77b4';
  for (let k = 0; k < tView.length; k++) {
    const tx = tView[k];
    const val = yView[k];
    const xPix = padLeft + ((tx - tStart) / (tNow - tStart || 1e-6)) * plotW;
    const yPix = padTop + ((yMax - val) / (yMax - yMin)) * plotH;
    if (k === 0) ctxPlot.moveTo(xPix, yPix); else ctxPlot.lineTo(xPix, yPix);
  }
  ctxPlot.stroke();
  const lastVal = yView[yView.length - 1];
  const lastT = tView[tView.length - 1];
  const lastX = padLeft + ((lastT - tStart) / (tNow - tStart || 1e-6)) * plotW;
  const lastY = padTop + ((yMax - lastVal) / (yMax - yMin)) * plotH;
  ctxPlot.fillStyle = opts.color || '#1f77b4'; ctxPlot.beginPath(); ctxPlot.arc(lastX, lastY, 3.5, 0, Math.PI * 2); ctxPlot.fill();
  ctxPlot.fillStyle = '#223'; ctxPlot.font = '12px monospace'; ctxPlot.fillText(lastVal.toFixed(2), lastX + 6, lastY - 6);
}

// EXPORT CSV
exportCsvBtn.addEventListener('click', () => {
  if (history.t.length === 0) {
    alert('Tidak ada data untuk diekspor.');
    return;
  }
  const mode = exportMode.value;
  let i0 = 0, i1 = history.t.length - 1;
  if (mode === 'window') {
    const tNow = history.t[history.t.length - 1];
    const tStart = Math.max(0, tNow - windowSeconds);
    let lo = 0, hi = history.t.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (history.t[mid] < tStart) lo = mid + 1;
      else { i0 = mid; hi = mid - 1; }
    }
    i1 = history.t.length - 1;
  } else {
    i0 = 0; i1 = history.t.length - 1;
  }

  const header = ['time_s','x_m','v_m_s','F_applied_N','F_friction_N','F_drag_N','F_net_N'];
  const rows = [header.join(',')];
  for (let i = i0; i <= i1; i++) {
    const row = [
      history.t[i].toFixed(6),
      history.x[i].toFixed(6),
      history.v[i].toFixed(6),
      history.Fa[i].toFixed(6),
      history.Ff[i].toFixed(6),
      history.Fdrag[i].toFixed(6),
      history.Fnet[i].toFixed(6)
    ];
    rows.push(row.join(','));
  }
  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = mode === 'all' ? 'sim_data_all.csv' : `sim_data_window_${windowSeconds}s.csv`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// STATS
function updateStats() {
  tVal.textContent = t.toFixed(2);
  xVal.textContent = x.toFixed(2);
  vDisplay.textContent = v.toFixed(2);
  aVal.textContent = a.toFixed(2);
}

// INIT / LOAD
carImg.onload = () => {
  updateFromControls();
  render();
  drawPlots();
};
if (carImg.complete) carImg.onload();
updateFromControls();