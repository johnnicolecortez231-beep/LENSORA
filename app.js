/* Pro Camera: WebGL color pipeline + full-resolution capture. No dependencies. */
'use strict';

/* ---------- Look presets & sliders ---------- */
const SLIDERS = [
  { k: 'exp',   label: 'Exposure',   min: -2, max: 2, step: 0.05 },
  { k: 'con',   label: 'Contrast',   min: -1, max: 1, step: 0.02 },
  { k: 'hi',    label: 'Highlights', min: -1, max: 1, step: 0.02 },
  { k: 'sh',    label: 'Shadows',    min: -1, max: 1, step: 0.02 },
  { k: 'temp',  label: 'Warmth',     min: -1, max: 1, step: 0.02 },
  { k: 'tint',  label: 'Tint',       min: -1, max: 1, step: 0.02 },
  { k: 'sat',   label: 'Saturation', min: -1, max: 1, step: 0.02 },
  { k: 'vib',   label: 'Vibrance',   min: -1, max: 1, step: 0.02 },
  { k: 'sharp', label: 'Sharpness',  min: 0,  max: 2, step: 0.05 },
  { k: 'vig',   label: 'Vignette',   min: 0,  max: 1, step: 0.02 },
  { k: 'grain', label: 'Grain',      min: 0,  max: 1, step: 0.02 },
];
const ZERO = { exp: 0, con: 0, hi: 0, sh: 0, temp: 0, tint: 0, sat: 0, vib: 0, sharp: 0, vig: 0, grain: 0 };
const PRESETS = {
  Natural:  { exp: 0.05, con: 0.15, hi: 0.2,  sh: 0.2,  temp: 0,    tint: 0,     sat: 0.08, vib: 0.2,  sharp: 0.6, vig: 0.1,  grain: 0 },
  Portrait: { exp: 0.1,  con: 0.1,  hi: 0.25, sh: 0.25, temp: 0.12, tint: 0.03,  sat: 0,    vib: 0.15, sharp: 0.4, vig: 0.18, grain: 0 },
  Vivid:    { exp: 0,    con: 0.3,  hi: 0.3,  sh: 0.2,  temp: -0.02, tint: 0,    sat: 0.25, vib: 0.4,  sharp: 0.8, vig: 0.15, grain: 0 },
  Neutral:  { exp: 0,    con: 0.05, hi: 0.1,  sh: 0.1,  temp: 0,    tint: 0,     sat: 0,    vib: 0.05, sharp: 0.4, vig: 0,    grain: 0 },
  Film:     { exp: -0.05, con: 0.25, hi: 0.3, sh: -0.1, temp: 0.06, tint: -0.04, sat: -0.1, vib: 0.1,  sharp: 0.4, vig: 0.3,  grain: 0.25 },
  Mono:     { exp: 0,    con: 0.35, hi: 0.2,  sh: 0.1,  temp: 0,    tint: 0,     sat: -1,   vib: 0,    sharp: 0.7, vig: 0.25, grain: 0.2 },
};

/* ---------- WebGL renderer ---------- */
const VERT = `
attribute vec2 p;
varying vec2 vUv;
uniform vec4 uCrop;   // x, y, w, h in normalized source coords
uniform float uFlip;
void main() {
  vec2 t = p * 0.5 + 0.5;
  if (uFlip > 0.5) t.x = 1.0 - t.x;
  vUv = uCrop.xy + t * uCrop.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;   // radius of sharpening kernel in UV units
uniform vec2 uRes;     // output size in px
uniform float uGrainSize, uSeed;
uniform float uExp, uCon, uHi, uSh, uTemp, uTint, uSat, uVib, uSharp, uVig, uGrain;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 c = texture2D(uTex, vUv).rgb;

  // Unsharp mask on a 3x3 gaussian, with halo clamp
  if (uSharp > 0.0) {
    vec3 b = c * 4.0;
    b += texture2D(uTex, vUv + vec2( uTexel.x, 0.0)).rgb * 2.0;
    b += texture2D(uTex, vUv + vec2(-uTexel.x, 0.0)).rgb * 2.0;
    b += texture2D(uTex, vUv + vec2(0.0,  uTexel.y)).rgb * 2.0;
    b += texture2D(uTex, vUv + vec2(0.0, -uTexel.y)).rgb * 2.0;
    b += texture2D(uTex, vUv + uTexel).rgb;
    b += texture2D(uTex, vUv - uTexel).rgb;
    b += texture2D(uTex, vUv + vec2( uTexel.x, -uTexel.y)).rgb;
    b += texture2D(uTex, vUv + vec2(-uTexel.x,  uTexel.y)).rgb;
    b /= 16.0;
    c += clamp((c - b) * uSharp * 1.5, -0.12, 0.12);
  }

  // Exposure and white balance in linear light
  vec3 lin = pow(max(c, 0.0), vec3(2.2));
  lin *= exp2(uExp);
  lin *= vec3(1.0 + 0.25 * uTemp + 0.05 * uTint,
              1.0 - 0.15 * uTint,
              1.0 - 0.25 * uTemp + 0.05 * uTint);
  // Soft highlight shoulder so bright areas roll off instead of clipping
  lin = lin / (1.0 + max(lin - 0.8, 0.0) * 0.6);
  c = pow(clamp(lin, 0.0, 4.0), vec3(1.0 / 2.2));

  // Highlights / shadows
  float l = luma(c);
  c += uSh * pow(1.0 - l, 2.0) * 0.25;
  c -= uHi * pow(l, 2.0) * 0.25;

  // Contrast (S-curve for positive, linear for negative)
  c = clamp(c, 0.0, 1.0);
  if (uCon >= 0.0) c = mix(c, c * c * (3.0 - 2.0 * c), uCon);
  else c = mix(c, vec3(0.5), -uCon * 0.6);

  // Saturation and vibrance
  l = luma(c);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float satNow = mx - mn;
  float amt = uSat + uVib * (1.0 - satNow);
  c = mix(vec3(l), c, 1.0 + amt);

  // Vignette
  float d = distance(vUv, vec2(0.5));
  c *= 1.0 - uVig * smoothstep(0.3, 0.85, d);

  // Film grain, strongest in mid-tones
  if (uGrain > 0.0) {
    vec2 gp = floor(vUv * uRes / uGrainSize);
    float n = hash(gp) + hash(gp + 17.0) - 1.0;
    float lm = luma(c);
    c += n * uGrain * 0.16 * (1.0 - abs(lm - 0.5) * 1.6);
  }

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                           [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.u = {};
    for (const n of ['uCrop', 'uFlip', 'uTex', 'uTexel', 'uRes', 'uGrainSize', 'uSeed',
                     'uExp', 'uCon', 'uHi', 'uSh', 'uTemp', 'uTint', 'uSat', 'uVib', 'uSharp', 'uVig', 'uGrain']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }

  /** source: video/ImageBitmap/canvas, sw/sh: its pixel size, crop: {x,y,w,h} normalized, out: {w,h} */
  draw(source, sw, sh, crop, out, p, opts = {}) {
    const gl = this.gl;
    if (this.canvas.width !== out.w || this.canvas.height !== out.h) {
      this.canvas.width = out.w;
      this.canvas.height = out.h;
    }
    gl.viewport(0, 0, out.w, out.h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const r = Math.max(1, Math.max(sw, sh) / 1800); // sharpen radius scales with resolution
    const u = this.u;
    gl.uniform1i(u.uTex, 0);
    gl.uniform4f(u.uCrop, crop.x, crop.y, crop.w, crop.h);
    gl.uniform1f(u.uFlip, opts.flip ? 1 : 0);
    gl.uniform2f(u.uTexel, r / sw, r / sh);
    gl.uniform2f(u.uRes, out.w, out.h);
    gl.uniform1f(u.uGrainSize, Math.max(1, Math.max(out.w, out.h) / 1600));
    gl.uniform1f(u.uSeed, opts.seed || 0);
    gl.uniform1f(u.uExp, p.exp);   gl.uniform1f(u.uCon, p.con);
    gl.uniform1f(u.uHi, p.hi);     gl.uniform1f(u.uSh, p.sh);
    gl.uniform1f(u.uTemp, p.temp); gl.uniform1f(u.uTint, p.tint);
    gl.uniform1f(u.uSat, p.sat);   gl.uniform1f(u.uVib, p.vib);
    gl.uniform1f(u.uSharp, p.sharp); gl.uniform1f(u.uVig, p.vig);
    gl.uniform1f(u.uGrain, p.grain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/* ---------- State & elements ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  view: $('view'), video: document.createElement('video'), start: $('start'), msg: $('msg'),
  sheet: $('sheet'), sliders: $('sliders'), presets: $('presets'), pro: $('proControls'), proNote: $('proNote'),
  device: $('device'), aspect: $('aspect'), res: $('res'), format: $('format'),
  shutter: $('shutter'), thumb: $('thumb'), countdown: $('countdown'), flash: $('flash'),
};
el.video.playsInline = true;
el.video.muted = true;

const state = {
  look: { ...PRESETS.Natural },
  preset: 'Natural',
  stream: null, track: null, imageCapture: null,
  facing: 'environment', deviceId: null,
  timer: 0, showOriginal: false, busy: false,
  photos: [], viewerIndex: 0,
};
let preview, still;
try { localStorage.getItem('x'); } catch (e) { /* storage blocked: fine */ }

function save(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch (e) {} }
function load(k, d) { try { const v = localStorage.getItem('pc_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

/* ---------- Look UI ---------- */
function buildLookUI() {
  el.presets.innerHTML = '';
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.preset === name ? ' on' : '');
    b.textContent = name;
    b.onclick = () => { state.preset = name; state.look = { ...PRESETS[name] }; syncSliders(); markPreset(); save('look', state.look); save('preset', name); };
    el.presets.appendChild(b);
  }
  el.sliders.innerHTML = '';
  for (const s of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'sl';
    row.innerHTML = `<span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><span></span>`;
    const input = row.querySelector('input'), val = row.querySelector('span:last-child');
    input.dataset.k = s.k;
    input.oninput = () => {
      state.look[s.k] = parseFloat(input.value);
      val.textContent = state.look[s.k].toFixed(2);
      state.preset = null; markPreset(); save('look', state.look); save('preset', null);
    };
    el.sliders.appendChild(row);
  }
  syncSliders();
}
function syncSliders() {
  el.sliders.querySelectorAll('input').forEach((i) => {
    i.value = state.look[i.dataset.k];
    i.parentElement.querySelector('span:last-child').textContent = Number(state.look[i.dataset.k]).toFixed(2);
  });
}
function markPreset() {
  [...el.presets.children].forEach((b) => b.classList.toggle('on', b.textContent === state.preset));
}

/* ---------- Crop helper ---------- */
function cropFor(sw, sh) {
  const v = el.aspect.value;
  if (v === 'full') return { x: 0, y: 0, w: 1, h: 1, pw: sw, ph: sh };
  const [a, b] = v.split(':').map(Number);
  let r = a / b;
  if (sh > sw) r = 1 / r; // portrait source
  let cw = sw, ch = sh;
  if (sw / sh > r) cw = sh * r; else ch = sw / r;
  return { x: (sw - cw) / 2 / sw, y: (sh - ch) / 2 / sh, w: cw / sw, h: ch / sh, pw: Math.round(cw), ph: Math.round(ch) };
}

/* ---------- Camera ---------- */
async function startCamera() {
  stopCamera();
  const h = parseInt(el.res.value, 10);
  const w = Math.round(h * 16 / 9);
  const video = {
    width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 },
  };
  if (state.deviceId) video.deviceId = { exact: state.deviceId };
  else video.facingMode = { ideal: state.facing };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  state.stream = stream;
  state.track = stream.getVideoTracks()[0];
  const settings = state.track.getSettings();
  if (settings.facingMode) state.facing = settings.facingMode;
  el.video.srcObject = stream;
  await el.video.play();
  state.imageCapture = ('ImageCapture' in window) ? new ImageCapture(state.track) : null;
  await populateDevices();
  buildProControls();
}
function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = state.track = state.imageCapture = null;
}
async function populateDevices() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  el.device.innerHTML = '';
  devs.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || 'Camera ' + (i + 1);
    el.device.appendChild(o);
  });
  const cur = state.track && state.track.getSettings().deviceId;
  if (cur) el.device.value = cur;
}

function buildProControls() {
  el.pro.innerHTML = '';
  const caps = (state.track && state.track.getCapabilities) ? state.track.getCapabilities() : {};
  const defs = [
    ['zoom', 'Zoom', {}],
    ['exposureCompensation', 'EV', {}],
    ['iso', 'ISO', { advanced: { exposureMode: 'manual' } }],
    ['focusDistance', 'Focus', { advanced: { focusMode: 'manual' } }],
    ['colorTemperature', 'WB (K)', { advanced: { whiteBalanceMode: 'manual' } }],
  ];
  let count = 0;
  const settings = state.track.getSettings();
  for (const [key, label, extra] of defs) {
    const c = caps[key];
    if (!c || typeof c.min !== 'number') continue;
    count++;
    const row = document.createElement('label');
    row.className = 'sl';
    const step = c.step || (c.max - c.min) / 100;
    const initial = settings[key] !== undefined ? settings[key] : c.min;
    row.innerHTML = `<span>${label}</span><input type="range" min="${c.min}" max="${c.max}" step="${step}" value="${initial}"><span>${Number(initial).toFixed(key === 'iso' || key === 'colorTemperature' ? 0 : 1)}</span>`;
    const input = row.querySelector('input'), val = row.querySelector('span:last-child');
    input.oninput = async () => {
      const v = parseFloat(input.value);
      val.textContent = v.toFixed(key === 'iso' || key === 'colorTemperature' ? 0 : 1);
      try { await state.track.applyConstraints({ advanced: [{ ...(extra.advanced || {}), [key]: v }] }); } catch (e) { /* unsupported combo */ }
    };
    el.pro.appendChild(row);
  }
  if (caps.focusMode && caps.focusMode.includes('continuous')) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = 'Autofocus';
    b.onclick = () => state.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    el.pro.appendChild(b);
  }
  $('btnTorch').hidden = !caps.torch;
  el.proNote.textContent = count
    ? 'Manual controls shown are the ones your camera exposes to the browser.'
    : 'This browser/camera does not expose manual controls (Chrome on Android exposes the most). Look adjustments still work.';
}

/* ---------- Render loop ---------- */
let frameN = 0;
function loop() {
  const v = el.video;
  if (v.readyState >= 2 && v.videoWidth) {
    const sw = v.videoWidth, sh = v.videoHeight;
    const c = cropFor(sw, sh);
    const scale = Math.min(1, 1600 / Math.max(c.pw, c.ph));
    const out = { w: Math.round(c.pw * scale), h: Math.round(c.ph * scale) };
    const mirror = state.facing === 'user';
    preview.draw(v, sw, sh, c, out, state.showOriginal ? ZERO : state.look, { flip: mirror, seed: (frameN++ % 60) * 1.37 });
  }
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
}

/* ---------- Capture ---------- */
async function grabFullRes() {
  if (state.imageCapture) {
    try {
      let opts;
      try {
        const pc = await state.imageCapture.getPhotoCapabilities();
        if (pc.imageWidth && pc.imageHeight) opts = { imageWidth: pc.imageWidth.max, imageHeight: pc.imageHeight.max };
      } catch (e) {}
      const blob = await state.imageCapture.takePhoto(opts);
      return await createImageBitmap(blob);
    } catch (e) { /* fall back to video frame */ }
  }
  return await createImageBitmap(el.video);
}

async function capture() {
  if (state.busy || !state.stream) return;
  state.busy = true;
  el.shutter.disabled = true;
  try {
    if (state.timer) await runCountdown(state.timer);
    el.flash.classList.add('on');
    setTimeout(() => el.flash.classList.remove('on'), 60);

    let bmp = await grabFullRes();
    // Downscale if larger than the GPU can take
    const max = still.maxTex;
    if (Math.max(bmp.width, bmp.height) > max) {
      const k = max / Math.max(bmp.width, bmp.height);
      bmp = await createImageBitmap(bmp, { resizeWidth: Math.floor(bmp.width * k), resizeHeight: Math.floor(bmp.height * k), resizeQuality: 'high' });
    }
    const c = cropFor(bmp.width, bmp.height);
    still.draw(bmp, bmp.width, bmp.height, c, { w: c.pw, h: c.ph }, state.look, { flip: false, seed: Math.random() * 100 });
    const fmt = el.format.value;
    const blob = await new Promise((res) => still.canvas.toBlob(res, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.95));
    if (bmp.close) bmp.close();
    addPhoto(blob, c.pw, c.ph, fmt);
  } catch (e) {
    console.error(e);
    alert('Capture failed: ' + e.message);
  } finally {
    state.busy = false;
    el.shutter.disabled = false;
  }
}
function runCountdown(n) {
  return new Promise((resolve) => {
    el.countdown.hidden = false;
    const tick = () => {
      if (n === 0) { el.countdown.hidden = true; resolve(); return; }
      el.countdown.textContent = n--;
      setTimeout(tick, 1000);
    };
    tick();
  });
}

/* ---------- Gallery ---------- */
function stamp() {
  const d = new Date(), p = (x) => String(x).padStart(2, '0');
  return `photo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function addPhoto(blob, w, h, fmt) {
  const url = URL.createObjectURL(blob);
  state.photos.push({ blob, url, w, h, name: stamp() + (fmt === 'png' ? '.png' : '.jpg') });
  el.thumb.style.backgroundImage = `url(${url})`;
}
function openViewer(i) {
  if (!state.photos.length) return;
  state.viewerIndex = Math.max(0, Math.min(i, state.photos.length - 1));
  const p = state.photos[state.viewerIndex];
  $('viewerImg').src = p.url;
  $('dl').href = p.url;
  $('dl').download = p.name;
  $('viewerInfo').textContent = `${p.w} x ${p.h} px, ${(p.blob.size / 1048576).toFixed(1)} MB (${state.viewerIndex + 1}/${state.photos.length})`;
  const d = $('viewer');
  if (!d.open) d.showModal();
}
$('closeViewer').onclick = () => $('viewer').close();
$('prev').onclick = () => openViewer(state.viewerIndex - 1);
$('next').onclick = () => openViewer(state.viewerIndex + 1);
$('del').onclick = () => {
  const [p] = state.photos.splice(state.viewerIndex, 1);
  URL.revokeObjectURL(p.url);
  const last = state.photos[state.photos.length - 1];
  el.thumb.style.backgroundImage = last ? `url(${last.url})` : '';
  if (state.photos.length) openViewer(state.viewerIndex); else $('viewer').close();
};
$('share').onclick = async () => {
  const p = state.photos[state.viewerIndex];
  const file = new File([p.blob], p.name, { type: p.blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) {}
  } else alert('Sharing files is not supported here. Use Download instead.');
};
el.thumb.onclick = () => openViewer(state.photos.length - 1);

/* ---------- Wiring ---------- */
function showMessage(t) { el.msg.textContent = t; }

async function boot() {
  el.start.hidden = false;
  showMessage('');
  if (!window.isSecureContext) { showMessage('Camera access needs HTTPS (GitHub Pages provides it) or localhost.'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showMessage('This browser does not support camera access.'); return; }
  try {
    await startCamera();
    el.start.hidden = true;
    el.sheet.hidden = false;
  } catch (e) {
    const m = { NotAllowedError: 'Camera permission was denied. Allow it in your browser settings and try again.',
                NotFoundError: 'No camera was found on this device.',
                NotReadableError: 'The camera is in use by another app.' }[e.name];
    showMessage(m || ('Could not start camera: ' + e.message));
  }
}

function init() {
  try {
    preview = new Renderer(el.view);
    still = new Renderer(document.createElement('canvas'));
  } catch (e) { showMessage(e.message); return; }

  state.look = { ...state.look, ...load('look', {}) };
  state.preset = load('preset', 'Natural');
  el.aspect.value = load('aspect', '3:2');
  el.format.value = load('format', 'jpeg');
  buildLookUI();
  markPreset();

  $('btnStart').onclick = boot;
  el.shutter.onclick = capture;
  $('flip').onclick = async () => {
    state.deviceId = null;
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    try { await startCamera(); } catch (e) { showMessage(e.message); }
  };
  el.device.onchange = async () => { state.deviceId = el.device.value; try { await startCamera(); } catch (e) { alert(e.message); } };
  el.res.onchange = async () => { if (state.stream) { try { await startCamera(); } catch (e) { alert(e.message); } } };
  el.aspect.onchange = () => save('aspect', el.aspect.value);
  el.format.onchange = () => save('format', el.format.value);

  $('btnGrid').onclick = (ev) => {
    const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
    ev.currentTarget.setAttribute('aria-pressed', on);
    $('gridOverlay').hidden = !on;
  };
  $('btnTimer').onclick = (ev) => {
    state.timer = state.timer === 0 ? 3 : state.timer === 3 ? 10 : 0;
    ev.currentTarget.textContent = 'Timer: ' + (state.timer ? state.timer + 's' : 'Off');
  };
  let torch = false;
  $('btnTorch').onclick = async (ev) => {
    torch = !torch;
    try { await state.track.applyConstraints({ advanced: [{ torch }] }); ev.currentTarget.classList.toggle('on', torch); } catch (e) { torch = !torch; }
  };

  const cmp = $('compare');
  const hold = (on) => { state.showOriginal = on; cmp.classList.toggle('on', on); };
  cmp.addEventListener('pointerdown', () => hold(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => cmp.addEventListener(e, () => hold(false)));

  $('btnLook').onclick = () => { el.sheet.hidden = !el.sheet.hidden; };
  $('btnReset').onclick = () => { state.preset = 'Natural'; state.look = { ...PRESETS.Natural }; syncSliders(); markPreset(); save('look', state.look); save('preset', 'Natural'); };
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      $('tab-look').hidden = t.dataset.tab !== 'look';
      $('tab-camera').hidden = t.dataset.tab !== 'camera';
    };
  });

  document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && !['SELECT', 'INPUT', 'BUTTON'].includes(document.activeElement.tagName)) {
      e.preventDefault(); capture();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (el.start.hidden) startCamera().catch(() => {});
  });

  loop();
}
init();
