// ---------- 3D rendering (Three.js, inlined) ----------
const cv = document.getElementById('cv');
const hudEl = document.getElementById('hud'), panelEl = document.getElementById('panel');
const overlayEl = document.getElementById('overlay'), eventsEl = document.getElementById('events');
const toastEl = document.getElementById('toast');
let targetSel = -1;
let gl = null, glFailed = false, needRender = true;

const TINT = {d: [0.88, 0.78, 0.52, 0.38], m: [0.46, 0.39, 0.33, 0.42], f: [0.20, 0.42, 0.20, 0.38], r: [0.35, 0.55, 0.72, 0.28]};
function hex2rgb(h){ return [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255]; }
const NEUTRAL = {
  p: [0.780, 0.706, 0.545],
  d: [0.847, 0.761, 0.573],
  m: [0.639, 0.596, 0.533],
  f: [0.596, 0.667, 0.510],
  r: [0.639, 0.729, 0.686],
};
function neutralTop(t){ return NEUTRAL[t] || NEUTRAL.p; }
function hTop(i){
  const t = D.hexes[i][3];
  return 2.3 + (t === 'm' ? 0.8 : (t === 'd' ? -0.25 : 0));
}
function cornerXZ(x, z, k, r){
  const a = (60*k - 30) * Math.PI/180;
  return [x + r*Math.cos(a), z + r*Math.sin(a)];
}
function rnd(i){ const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

function makeAtlas(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  for (let n = 0; n < 64; n++){
    const col = n % 8, row = Math.floor(n / 8), x = col * 64, y = row * 64;
    g.fillStyle = 'rgba(5,8,14,0.78)';
    g.fillRect(x + 7, y + 12, 50, 40);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.strokeRect(x + 7, y + 12, 50, 40);
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('' + n, x + 32, y + 33);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function initGL(){
  if (gl || glFailed) return;
  try {
    const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a2440);
    scene.fog = new THREE.Fog(0x0a2440, 1800, 5200);
    const camera = new THREE.PerspectiveCamera(46, 1, 1, 7000);
    scene.add(new THREE.HemisphereLight(0xd6e7ff, 0x2e4023, 1.05));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
    sun.position.set(400, 700, 250);
    scene.add(sun);
    const cxm = D.W / 2, czm = D.H / 2;
    // water
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(D.W * 2.4, D.H * 2.4),
      new THREE.MeshLambertMaterial({color: 0x113a63}));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cxm, 0, czm);
    scene.add(water);
    // ---- hex prisms (merged) ----
    const vertsPerHex = 54;
    const pos = new Float32Array(N * vertsPerHex * 3);
    const col = new Float32Array(N * vertsPerHex * 3);
    const R = D.R, BOT = 0.35;
    for (let i = 0; i < N; i++){
      const h = D.hexes[i], x = h[0], z = h[1], yt = hTop(i);
      const corners = [];
      for (let k = 0; k < 6; k++) corners.push(cornerXZ(x, z, k, R * 0.985));
      let p = i * vertsPerHex * 3;
      function tri(a, b, c){
        pos[p] = a[0]; pos[p+1] = a[1]; pos[p+2] = a[2];
        pos[p+3] = b[0]; pos[p+4] = b[1]; pos[p+5] = b[2];
        pos[p+6] = c[0]; pos[p+7] = c[1]; pos[p+8] = c[2];
        p += 9;
      }
      for (let k = 0; k < 6; k++){
        const c1 = corners[k], c2 = corners[(k+1) % 6];
        tri([x, yt, z], [c2[0], yt, c2[1]], [c1[0], yt, c1[1]]);
      }
      for (let k = 0; k < 6; k++){
        const c1 = corners[k], c2 = corners[(k+1) % 6];
        tri([c1[0], yt, c1[1]], [c2[0], yt, c2[1]], [c2[0], BOT, c2[1]]);
        tri([c1[0], yt, c1[1]], [c2[0], BOT, c2[1]], [c1[0], BOT, c1[1]]);
      }
    }
    const boardGeo = new THREE.BufferGeometry();
    boardGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    boardGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    boardGeo.computeVertexNormals();
    const board = new THREE.Mesh(boardGeo,
      new THREE.MeshLambertMaterial({vertexColors: true}));
    scene.add(board);
    // ---- decorations (instanced) ----
    const dummy = new THREE.Object3D();
    function instanced(geo, mat, items, place){
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      items.forEach((it, j) => { place(it, j); dummy.updateMatrix(); m.setMatrixAt(j, dummy.matrix); });
      m.count = items.length;
      m.instanceMatrix.needsUpdate = true;
      scene.add(m);
      return m;
    }
    const mountains = [], forests = [], cities = [], capitals = [];
    for (let i = 0; i < N; i++){
      const h = D.hexes[i];
      if (h[3] === 'm') mountains.push(i);
      if (h[3] === 'f') forests.push(i);
      if (h[5]) capitals.push(i); else if (h[4]) cities.push(i);
    }
    instanced(new THREE.ConeGeometry(R * 0.55, 2.6, 5),
      new THREE.MeshLambertMaterial({color: 0x7a7268}), mountains,
      (i) => { const h = D.hexes[i];
        dummy.position.set(h[0], hTop(i) + 1.25, h[1]);
        dummy.rotation.set(0, rnd(i) * 3, 0);
        const s = 0.85 + rnd(i + 9) * 0.4; dummy.scale.set(s, s, s); });
    instanced(new THREE.ConeGeometry(R * 0.34, 1.9, 6),
      new THREE.MeshLambertMaterial({color: 0x2f6b38}), forests,
      (i, j) => { const h = D.hexes[i];
        dummy.position.set(h[0], hTop(i) + 0.9, h[1]);
        dummy.rotation.set(0, rnd(i + 3) * 3, 0);
        dummy.scale.set(1, 1, 1); });
    instanced(new THREE.CylinderGeometry(0.95, 1.15, 1.25, 6),
      new THREE.MeshLambertMaterial({color: 0xe9e2d2}), cities,
      (i) => { const h = D.hexes[i];
        dummy.position.set(h[0], hTop(i) + 0.6, h[1]);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); });
    instanced(new THREE.CylinderGeometry(1.5, 1.7, 1.5, 6),
      new THREE.MeshLambertMaterial({color: 0xf5c542, emissive: 0x554400}), capitals,
      (i) => { const h = D.hexes[i];
        dummy.position.set(h[0], hTop(i) + 0.72, h[1]);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); });
    // ---- strength numbers (atlas quads) ----
    const numPos = new Float32Array(N * 6 * 3);
    const numUV = new Float32Array(N * 6 * 2);
    const numGeo = new THREE.BufferGeometry();
    numGeo.setAttribute('position', new THREE.Float32BufferAttribute(numPos, 3));
    numGeo.setAttribute('uv', new THREE.Float32BufferAttribute(numUV, 2));
    const numMesh = new THREE.Mesh(numGeo, new THREE.MeshBasicMaterial({
      map: makeAtlas(), transparent: true, side: THREE.DoubleSide, depthWrite: false}));
    numMesh.renderOrder = 5;
    scene.add(numMesh);
    // ---- country borders (colored ribbons, rebuilt when borders move) ----
    const MAXB = 12000;
    const bPos = new Float32Array(MAXB * 6 * 3);
    const bCol = new Float32Array(MAXB * 6 * 3);
    const bordersGeo = new THREE.BufferGeometry();
    bordersGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    bordersGeo.setAttribute('color', new THREE.Float32BufferAttribute(bCol, 3));
    const bordersMesh = new THREE.Mesh(bordersGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide}));
    bordersMesh.renderOrder = 4;
    scene.add(bordersMesh);
    // ---- 3D unit figures (instanced primitive parts) ----
    function partMesh(geo, hexColor){
      const m = new THREE.InstancedMesh(geo,
        new THREE.MeshLambertMaterial({color: hexColor}), N);
      m.count = 0;
      scene.add(m);
      return m;
    }
    const parts = {
      solBody: partMesh(new THREE.CylinderGeometry(0.52, 0.66, 1.55, 6), 0xffffff),
      solHead: partMesh(new THREE.SphereGeometry(0.40, 8, 6), 0xc68863),
      solHelmet: partMesh(new THREE.SphereGeometry(0.48, 8, 5, 0, Math.PI * 2, 0, 1.85), 0xffffff),
      tankHull: partMesh(new THREE.BoxGeometry(2.8, 0.78, 1.6), 0xffffff),
      tankTurret: partMesh(new THREE.CylinderGeometry(0.70, 0.82, 0.52, 8), 0xffffff),
      tankBarrel: partMesh(new THREE.CylinderGeometry(0.09, 0.11, 2.1, 5), 0xffffff),
      artyBase: partMesh(new THREE.BoxGeometry(1.8, 0.42, 1.2), 0xffffff),
      artyBarrel: partMesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 5), 0x3d473a),
      artyShield: partMesh(new THREE.BoxGeometry(1.55, 0.95, 0.14), 0xffffff),
    };
    // ---- general stars ----
    const starMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1.65),
      new THREE.MeshLambertMaterial({color: 0xffd94d, emissive: 0x7a5c00}), 40);
    starMesh.count = 40;
    scene.add(starMesh);
    // ---- highlights ----
    const hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(300 * 6 * 2 * 3), 3));
    hlGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(300 * 6 * 2 * 3), 3));
    const hl = new THREE.LineSegments(hlGeo,
      new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.95}));
    hl.renderOrder = 6;
    scene.add(hl);
    // camera rig
    const target = new THREE.Vector3(cxm, 0, czm);
    const aspect0 = Math.max(0.3, innerWidth / Math.max(1, innerHeight));
    const tanV = Math.tan(46 * Math.PI / 360);
    const distH = (D.H * 0.60) / tanV;
    const distW = (D.W * 0.52) / (tanV * aspect0);
    const dist0 = Math.min(3300, Math.max(distH, distW) * 1.04);
    gl = { renderer, scene, camera, boardGeo, numGeo, bordersGeo, starMesh, hlGeo, parts,
           target, dist: dist0, pitch: 0.94, dummy, maxBorders: MAXB };
    onResize();
    (function loop(){
      requestAnimationFrame(loop);
      if (needRender && gl){ needRender = false; gl.renderer.render(gl.scene, gl.camera); }
    })();
    refreshColors(); refreshNumbers(); refreshBorders(); refreshUnits(); refreshStars(); refreshHighlights();
    updateCamera();
  } catch(e){ glFailed = true; }
}
function updateCamera(){
  if (!gl) return;
  const t = gl.target, d = gl.dist, p = gl.pitch;
  gl.camera.position.set(t.x, d * Math.sin(p), t.z + d * Math.cos(p));
  gl.camera.lookAt(t.x, 0, t.z);
  needRender = true;
}
function refreshColors(){
  if (!gl) return;
  const attr = gl.boardGeo.getAttribute('color');
  const arr = attr.array, vertsPerHex = 54;
  for (let i = 0; i < N; i++){
    const c = neutralTop(D.hexes[i][3]);
    const side = [c[0] * 0.60, c[1] * 0.60, c[2] * 0.60];
    let p = i * vertsPerHex * 3;
    for (let v = 0; v < 18; v++){ arr[p] = c[0]; arr[p+1] = c[1]; arr[p+2] = c[2]; p += 3; }
    for (let v = 0; v < 36; v++){ arr[p] = side[0]; arr[p+1] = side[1]; arr[p+2] = side[2]; p += 3; }
  }
  attr.needsUpdate = true;
  needRender = true;
}
function refreshNumbers(){
  if (!gl) return;
  const posA = gl.numGeo.getAttribute('position'), uvA = gl.numGeo.getAttribute('uv');
  const pos = posA.array, uv = uvA.array, W2 = 4.1;
  for (let i = 0; i < N; i++){
    const h = D.hexes[i], st = strength(i);
    const p = i * 18, q = i * 12;
    if (st <= 0){
      for (let v = 0; v < 6; v++){ pos[p + v*3] = h[0]; pos[p + v*3 + 1] = -20; pos[p + v*3 + 2] = h[1]; }
      continue;
    }
    const n = Math.min(63, st), col = n % 8, row = Math.floor(n / 8);
    const u0 = col / 8, u1 = (col + 1) / 8, vT = 1 - row / 8, vB = 1 - (row + 1) / 8;
    const y = hTop(i) + 0.12, x = h[0] - 5.3, z = h[1] - 5.0;
    const quad = [
      [x - W2, z - W2, u0, vT], [x + W2, z - W2, u1, vT], [x + W2, z + W2, u1, vB],
      [x - W2, z - W2, u0, vT], [x + W2, z + W2, u1, vB], [x - W2, z + W2, u0, vB]];
    for (let v = 0; v < 6; v++){
      pos[p + v*3] = quad[v][0]; pos[p + v*3 + 1] = y; pos[p + v*3 + 2] = quad[v][1];
      uv[q + v*2] = quad[v][2]; uv[q + v*2 + 1] = quad[v][3];
    }
  }
  posA.needsUpdate = true; uvA.needsUpdate = true;
  needRender = true;
}
function refreshStars(){
  if (!gl) return;
  const dummy = gl.dummy;
  for (let j = 0; j < 40; j++){
    const g = S.gens[j];
    if (g && g.hex >= 0){
      const h = D.hexes[g.hex];
      dummy.position.set(h[0] + D.R * 0.42, hTop(g.hex) + 2.1, h[1] - D.R * 0.42);
      dummy.rotation.set(0.6, performance.now() * 0 + j, 0.4);
      dummy.scale.set(1, 1.5, 1);
    } else {
      dummy.position.set(0, -50, 0); dummy.scale.set(0.001, 0.001, 0.001);
    }
    dummy.updateMatrix();
    gl.starMesh.setMatrixAt(j, dummy.matrix);
  }
  gl.starMesh.instanceMatrix.needsUpdate = true;
  needRender = true;
}
function refreshHighlights(){
  if (!gl) return;
  const posA = gl.hlGeo.getAttribute('position'), colA = gl.hlGeo.getAttribute('color');
  const pos = posA.array, col = colA.array;
  let seg = 0;
  function outline(i, r, g, b){
    if (i < 0 || seg >= 300) return;
    const h = D.hexes[i], y = hTop(i) + 0.22;
    for (let k = 0; k < 6; k++){
      const c1 = cornerXZ(h[0], h[1], k, D.R * 1.02), c2 = cornerXZ(h[0], h[1], (k+1) % 6, D.R * 1.02);
      const p = seg * 6;
      pos[p] = c1[0]; pos[p+1] = y; pos[p+2] = c1[1];
      pos[p+3] = c2[0]; pos[p+4] = y; pos[p+5] = c2[1];
      col[p] = r; col[p+1] = g; col[p+2] = b; col[p+3] = r; col[p+4] = g; col[p+5] = b;
      seg++;
    }
  }
  if (sel >= 0 && S && S.owner[sel] === S.player && !S.over){
    for (const nb of nbs(sel)){
      if (S.owner[nb] !== S.player) outline(nb, 1, 0.25, 0.18);
      else outline(nb, 0.75, 0.82, 0.9);
    }
  }
  if (targetSel >= 0) outline(targetSel, 1, 0.15, 0.1);
  if (sel >= 0) outline(sel, 1, 0.85, 0.3);
  // zero the rest
  for (let s2 = seg; s2 < 300; s2++){
    const p = s2 * 6;
    for (let v = 0; v < 6; v++) pos[p + v] = 0;
  }
  gl.hlGeo.setDrawRange(0, seg * 2);
  posA.needsUpdate = true; colA.needsUpdate = true;
  needRender = true;
}
function setInst(mesh, idx, x, y, z, rx, ry, rz){
  const d = gl.dummy;
  d.position.set(x, y, z); d.rotation.set(rx, ry, rz); d.scale.set(1, 1, 1);
  d.updateMatrix(); mesh.setMatrixAt(idx, d.matrix);
}
function refreshUnits(){
  if (!gl || !gl.parts) return;
  const P = gl.parts;
  const counts = {solBody: 0, solHead: 0, solHelmet: 0, tankHull: 0, tankTurret: 0,
                  tankBarrel: 0, artyBase: 0, artyBarrel: 0, artyShield: 0};
  const colTmp = new THREE.Color();
  function paint(mesh, idx, hex, mul){
    colTmp.set(hex);
    if (mul) colTmp.multiplyScalar(mul);
    mesh.setColorAt(idx, colTmp);
  }
  for (let i = 0; i < N; i++){
    if (S.inf[i] + S.art[i] + S.tank[i] === 0) continue;
    const h = D.hexes[i], y = hTop(i), C = D.countries[S.owner[i]];
    if (S.tank[i] > 0){
      const fx = h[0] - 3.3, fz = h[1] - 1.6;
      let j = counts.tankHull++;
      setInst(P.tankHull, j, fx, y + 0.62, fz, 0, 0, 0); paint(P.tankHull, j, C.uniform, 0.85);
      j = counts.tankTurret++;
      setInst(P.tankTurret, j, fx - 0.25, y + 1.28, fz, 0, 0, 0); paint(P.tankTurret, j, C.uniform, 0.95);
      j = counts.tankBarrel++;
      setInst(P.tankBarrel, j, fx + 1.35, y + 1.3, fz, 0, 0, Math.PI / 2); paint(P.tankBarrel, j, C.uniform, 0.7);
    }
    if (S.art[i] > 0){
      const fx = h[0] + 3.4, fz = h[1] - 1.4;
      let j = counts.artyBase++;
      setInst(P.artyBase, j, fx, y + 0.24, fz, 0, 0, 0); paint(P.artyBase, j, C.uniform, 0.75);
      j = counts.artyShield++;
      setInst(P.artyShield, j, fx - 0.55, y + 0.85, fz, 0, 0, 0); paint(P.artyShield, j, C.uniform, 0.9);
      j = counts.artyBarrel++;
      setInst(P.artyBarrel, j, fx + 0.35, y + 1.25, fz, 0, 0, -0.85);
    }
    if (S.inf[i] > 0){
      const fx = h[0], fz = h[1] + 2.6;
      let j = counts.solBody++;
      setInst(P.solBody, j, fx, y + 1.0, fz, 0, 0, 0); paint(P.solBody, j, C.uniform, 1);
      j = counts.solHead++;
      setInst(P.solHead, j, fx, y + 2.05, fz, 0, 0, 0);
      j = counts.solHelmet++;
      setInst(P.solHelmet, j, fx, y + 2.14, fz, 0, 0, 0); paint(P.solHelmet, j, C.helmet, 1);
    }
  }
  for (const k in P){
    P[k].count = counts[k];
    P[k].instanceMatrix.needsUpdate = true;
    if (P[k].instanceColor) P[k].instanceColor.needsUpdate = true;
  }
  needRender = true;
}
function refreshBorders(){
  if (!gl) return;
  const posA = gl.bordersGeo.getAttribute('position'), colA = gl.bordersGeo.getAttribute('color');
  const pos = posA.array, col = colA.array;
  const R = D.R;
  let quads = 0;
  for (let i = 0; i < N; i++){
    const h = D.hexes[i], x = h[0], z = h[1], y = hTop(i) + 0.07;
    const myCol = hex2rgb(D.countries[S.owner[i]].color);
    const nlist = nbs(i);
    for (let k = 0; k < 6; k++){
      // find the neighbor across edge k (geometric match)
      const a = (60 * k) * Math.PI / 180;
      const candX = x + 1.732 * R * Math.cos(a), candZ = z + 1.732 * R * Math.sin(a);
      let across = -1;
      for (const nb of nlist){
        const nh = D.hexes[nb], dx = nh[0] - candX, dz = nh[1] - candZ;
        if (dx * dx + dz * dz < 4){ across = nb; break; }
      }
      if (across >= 0 && S.owner[across] === S.owner[i]) continue; // internal edge
      if (quads >= gl.maxBorders) break;
      const c1 = cornerXZ(x, z, k, R * 0.985), c2 = cornerXZ(x, z, (k + 1) % 6, R * 0.985);
      const mx = (c1[0] + c2[0]) / 2, mz = (c1[1] + c2[1]) / 2;
      let ix = x - mx, iz = z - mz;
      const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il;
      const o1 = [c1[0] - ix * 0.3, c1[1] - iz * 0.3], o2 = [c2[0] - ix * 0.3, c2[1] - iz * 0.3];
      const i1 = [c1[0] + ix * 1.35, c1[1] + iz * 1.35], i2 = [c2[0] + ix * 1.35, c2[1] + iz * 1.35];
      const quad = [o1, o2, i2, o1, i2, i1];
      const p = quads * 18;
      for (let v = 0; v < 6; v++){
        pos[p + v * 3] = quad[v][0]; pos[p + v * 3 + 1] = y; pos[p + v * 3 + 2] = quad[v][1];
        col[p + v * 3] = myCol[0]; col[p + v * 3 + 1] = myCol[1]; col[p + v * 3 + 2] = myCol[2];
      }
      quads++;
    }
  }
  gl.bordersGeo.setDrawRange(0, quads * 6);
  posA.needsUpdate = true; colA.needsUpdate = true;
  needRender = true;
}
function syncScene(){
  if (!gl) initGL();
  if (glFailed) return;
  refreshColors(); refreshNumbers(); refreshBorders(); refreshUnits(); refreshStars(); refreshHighlights();
}
function onResize(){
  if (!gl) return;
  gl.renderer.setSize(innerWidth, innerHeight);
  gl.camera.aspect = innerWidth / innerHeight;
  gl.camera.updateProjectionMatrix();
  needRender = true;
}
addEventListener('resize', onResize);

// ---------- UI ----------
let toastTimer = 0;
function toast(msg){
  toastEl.textContent = msg; toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.style.display = 'none', 2800);
}
function esc(s){ return ('' + s).replace(/</g, '&lt;'); }
function renderHUD(){
  const ci = S.player, c = D.countries[ci];
  hudEl.innerHTML =
    '<span><span class="chip" style="background:' + c.color + '"></span><b>' + esc(c.name) + '</b></span>' +
    '<span>💰 <b>' + S.gold[ci] + '</b></span>' +
    '<span>📈 ' + income(ci) + '/جولة</span>' +
    '<span>🗺️ ' + tilesOf(ci).length + ' قطعة</span>' +
    '<span>🗓️ الجولة <b>' + S.turn + '</b></span>' +
    '<span class="sp"></span>' +
    '<button class="hbtn" onclick="toggleEvents()">📜 الأحداث</button>' +
    '<button class="hbtn" onclick="askNew()">🔄 لعبة جديدة</button>';
}
function hexInfoHTML(i){
  const h = D.hexes[i], ci = S.owner[i];
  const gen = generalAt(i);
  let s = '<div class="ttl">' + (h[5] ? '👑 ' : '') + esc(nameOf(i)) +
          ' <span style="color:' + D.countries[ci].color + '">●</span> ' + esc(cname(ci)) + '</div>';
  s += '<div class="sub">التضاريس: ' + TNAME[h[3]] + ' (دفاع ×' + defFactor(i).toFixed(2) + ') • الدخل: ' + incomeOf(i) +
       '<br>🚶 ' + S.inf[i] + ' مشاة • 💣 ' + S.art[i] + ' مدفعية • 🛡️ ' + S.tank[i] + ' دبابات — القوة: <b>' + strength(i) + '</b>';
  if (gen) s += '<br>⭐ القائد ' + esc(gen.name) + ' (هجوم +' + Math.round(gen.atk*100) + '% / دفاع +' + Math.round(gen.def*100) + '%)';
  s += '</div>';
  return s;
}
function renderPanel(){
  if (!S) return;
  let html = '';
  if (genMove){
    html = '<div class="ttl">⭐ نقل القائد ' + esc(genMove.name) + '</div>' +
           '<div class="sub">اضغط أي قطعة صديقة مجاورة لنقل القائد إليها (مرة واحدة بالجولة)، أو اضغط مكاناً آخر للإلغاء.</div>' +
           '<div class="row"><button class="abtn ghost" onclick="cancelGenMove()">إلغاء</button></div>';
  } else if (targetSel >= 0 && sel >= 0){
    const a = sel, b = targetSel;
    const atkEst = Math.round(strength(a) * atkMult(a));
    const defEst = Math.round(strength(b) * defFactor(b) * defMult(b));
    html = hexInfoHTML(b) +
      '<div class="sub">⚔️ هجوم من ' + esc(nameOf(a)) + ': قوتك الفعلية ≈ <b>' + atkEst + '</b> ضد دفاع ≈ <b>' + defEst + '</b> (الأرقام تقريبية — عامل الحظ ±15%)</div>' +
      '<div class="row"><button class="abtn war" onclick="confirmAttack()">⚔️ هجوم!</button>' +
      '<button class="abtn ghost" onclick="clearTarget()">إلغاء</button>' +
      '<button class="abtn end" onclick="endTurnUI()">إنهاء الدور ⏭️</button></div>';
  } else if (sel >= 0){
    html = hexInfoHTML(sel);
    const mine = S.owner[sel] === S.player && !S.over;
    const acted = S.acted.has(sel);
    if (mine){
      const gold = S.gold[S.player];
      html += '<div class="row">';
      for (let u = 0; u < 3; u++){
        const dis = acted || gold < COST[u];
        html += '<button class="abtn" ' + (dis ? 'disabled' : '') + ' onclick="recruitUI(' + u + ')">' +
                UICON[u] + ' +' + UNAME[u] + ' (' + COST[u] + '💰)</button>';
      }
      html += '</div>';
      const gen = generalAt(sel);
      if (gen && gen.ci === S.player && !S.genActed.has(gen.name))
        html += '<div class="row" style="margin-top:7px"><button class="abtn move" onclick="startGenMove()">⭐ نقل القائد ' + esc(gen.name) + '</button></div>';
      html += '<div class="sub" style="margin-top:6px">' +
        (acted ? 'هذه القطعة نفّذت عملها هذه الجولة.' :
                 'اضغط قطعة حمراء مجاورة للهجوم عليها، أو قطعة صديقة مجاورة لنقل كل القوات إليها. كل قطعة تعمل مرة واحدة بالجولة.') + '</div>';
    }
    html += '<div class="row" style="margin-top:4px"><button class="abtn end" onclick="endTurnUI()">إنهاء الدور ⏭️</button></div>';
  } else {
    html = '<div class="ttl">🗺️ ساحة المعركة</div>' +
      '<div class="sub">اسحب للتنقل وقرّب بإصبعين للتكبير. اضغط أيّاً من قطعك: جنّد فيها، اهجم على جار محدّد بالأحمر، أو انقل قواتها لجار صديق.</div>' +
      '<div class="row"><button class="abtn end" onclick="endTurnUI()">إنهاء الدور ⏭️</button></div>';
  }
  panelEl.innerHTML = html;
}
function showGame(){
  overlayEl.style.display = 'none';
  initGL();
  if (glFailed){ toast('⚠️ جهازك لم يدعم WebGL ثلاثي الأبعاد'); return; }
  onResize(); syncScene(); renderHUD(); renderPanel();
}
function recruitUI(u){
  if (doRecruit(sel, u)){ save(); syncScene(); renderHUD(); renderPanel(); }
  else toast('لا يمكن التجنيد هنا الآن');
}
function startGenMove(){
  const gen = generalAt(sel);
  if (gen){ genMove = gen; renderPanel(); }
}
function cancelGenMove(){ genMove = null; renderPanel(); }
function clearTarget(){ targetSel = -1; refreshHighlights(); renderPanel(); }
function confirmAttack(){
  const a = sel, b = targetSel;
  const won = doAttack(a, b);
  targetSel = -1;
  sel = won ? b : -1;
  save(); syncScene(); renderHUD(); renderPanel();
  toast(won ? '🎉 انتصرت واحتللت ' + nameOf(b) : '🛡️ صُدّ الهجوم — دُمّرت قوات الهجوم');
  if (S.over) showEnd();
}
function endTurnUI(){
  targetSel = -1; genMove = null;
  endTurn();
}
function toggleEvents(){
  if (eventsEl.style.display === 'block'){ eventsEl.style.display = 'none'; return; }
  openEvents();
}
function openEvents(){
  eventsEl.innerHTML = '<h3>📜 أحداث الحرب</h3>' +
    eventLog.slice(-40).reverse().map(e => '<div>' + esc(e) + '</div>').join('') +
    '<div style="margin-top:10px"><button class="hbtn" onclick="toggleEvents()">إغلاق</button></div>';
  eventsEl.style.display = 'block';
}
function askNew(){
  if (confirm('بدء لعبة جديدة؟ ستفقد اللعبة الحالية المحفوظة.')) showStart(true);
}
function showEnd(){
  const won = !S.lost;
  overlayEl.style.display = 'block';
  overlayEl.innerHTML =
    '<h1>' + (won ? '🏆 النصر الكامل!' : '💔 سقطت دولتك') + '</h1>' +
    '<div class="tag">' + (won
      ? 'وحّدت الشرق الأوسط تحت راية ' + esc(cname(S.player)) + ' خلال ' + S.turn + ' جولة. ملحمة يا قائد!'
      : 'دامت الحرب ' + S.turn + ' جولة قبل أن تسقط آخر قطعة من ' + esc(cname(S.player)) + '. المحاولة القادمة أفضل!') + '</div>' +
    '<div style="text-align:center"><button class="abtn end" onclick="showStart(true)">🔄 لعبة جديدة</button></div>';
}
let chosenDiff = 1;
function showStart(fresh){
  overlayEl.style.display = 'block';
  const counts = {};
  D.hexes.forEach(h => counts[CIDX[h[2]]] = (counts[CIDX[h[2]]] || 0) + 1);
  let html = '<h1>⚔️ غزو الشرق الأوسط</h1>' +
    '<div class="tag">النسخة السداسية ثلاثية الأبعاد — 2,578 قطعة على خريطة حقيقية • وحّد كل العواصم أو امحُ خصومك</div>';
  const saved = !fresh && localStorage.getItem(SAVE_KEY);
  if (saved) html += '<div style="text-align:center;margin-bottom:14px"><button class="abtn end" onclick="continueGame()">▶️ متابعة لعبتك المحفوظة</button></div>';
  html += '<div class="diffs">' +
    '<button id="df0" onclick="pickDiff(0)">😌 سهلة</button>' +
    '<button id="df1" onclick="pickDiff(1)">⚖️ عادية</button>' +
    '<button id="df2" onclick="pickDiff(2)">🔥 صعبة</button></div>';
  html += '<div class="grid">';
  D.countries.forEach((c, ci) => {
    const gs = (D.gens[c.code] || []).map(g => '⭐ ' + esc(g[0])).join(' • ');
    html += '<div class="card" onclick="pickCountry(' + ci + ')">' +
      '<div class="nm"><span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</div>' +
      '<div class="sm">العاصمة: ' + esc(c.capital) + ' • ' + (counts[ci] || 0) + ' قطعة<br>' +
      '🛡️ ' + esc(c.tank) + ' • 💣 ' + esc(c.arty) + ' (' + esc(c.bloc) + ')<br>' + gs + '</div></div>';
  });
  html += '</div>';
  overlayEl.innerHTML = html;
  pickDiff(chosenDiff);
}
function pickDiff(d){
  chosenDiff = d;
  for (let i = 0; i < 3; i++){
    const el = document.getElementById('df' + i);
    if (el) el.className = i === d ? 'on' : '';
  }
}
function pickCountry(ci){ newGame(ci, chosenDiff); }
function continueGame(){ if (load()) showGame(); else showStart(true); }

// ---------- input (touch/mouse, pan + pinch) ----------
function pick(px, py){
  if (!gl) return -1;
  const rect = cv.getBoundingClientRect();
  const nx = ((px - rect.left) / rect.width) * 2 - 1;
  const ny = -((py - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(nx, ny), gl.camera);
  const pt = new THREE.Vector3();
  const hit = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.3), pt);
  if (!hit) return -1;
  let best = -1, bd = 1e18;
  for (let i = 0; i < N; i++){
    const h = D.hexes[i], dx = h[0] - pt.x, dz = h[1] - pt.z, dd = dx*dx + dz*dz;
    if (dd < bd){ bd = dd; best = i; }
  }
  return bd <= (D.R * 1.35) * (D.R * 1.35) ? best : -1;
}
function onTap(px, py){
  if (!S || S.over) return;
  const id = pick(px, py);
  if (genMove){
    if (id >= 0 && S.owner[id] === S.player && nbs(genMove.hex).includes(id) && id !== genMove.hex){
      genMove.hex = id; S.genActed.add(genMove.name);
      toast('⭐ انتقل القائد ' + genMove.name + ' إلى ' + nameOf(id));
      genMove = null; sel = id;
      save(); syncScene(); renderPanel();
    } else { genMove = null; renderPanel(); }
    return;
  }
  if (id < 0){ sel = -1; targetSel = -1; refreshHighlights(); renderPanel(); return; }
  if (sel >= 0 && S.owner[sel] === S.player && id !== sel && nbs(sel).includes(id)){
    if (S.owner[id] !== S.player){ targetSel = id; refreshHighlights(); renderPanel(); return; }
    if (strength(sel) > 0 && !S.acted.has(sel)){
      if (doTransfer(sel, id)){
        toast('🔀 نُقلت القوات إلى ' + nameOf(id));
        sel = id; targetSel = -1;
        save(); syncScene(); renderPanel();
        return;
      }
    }
  }
  sel = id; targetSel = -1;
  refreshHighlights(); renderPanel();
}
const pointers = new Map();
let movedPx = 0, pinchD = 0;
cv.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  movedPx = 0;
  if (pointers.size === 2){
    const [a, b] = [...pointers.values()];
    pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !gl) return;
  const prev = pointers.get(e.pointerId);
  const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  movedPx += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 1){
    const wpp = (2 * gl.dist * Math.tan(gl.camera.fov * Math.PI / 360)) / innerHeight;
    gl.target.x -= dx * wpp;
    gl.target.z -= dy * wpp;
    const m = 260;
    gl.target.x = Math.min(D.W + m, Math.max(-m, gl.target.x));
    gl.target.z = Math.min(D.H + m, Math.max(-m, gl.target.z));
    updateCamera();
  } else if (pointers.size === 2){
    const [a, b] = [...pointers.values()];
    const nd = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchD > 0 && nd > 0){
      gl.dist = Math.min(3400, Math.max(110, gl.dist * (pinchD / nd)));
      updateCamera();
    }
    pinchD = nd;
  }
});
cv.addEventListener('pointerup', e => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0 && movedPx < 7) onTap(e.clientX, e.clientY);
  if (pointers.size < 2) pinchD = 0;
});
cv.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (!gl) return;
  gl.dist = Math.min(3400, Math.max(110, gl.dist * (e.deltaY < 0 ? 0.88 : 1.14)));
  updateCamera();
}, {passive: false});
showStart(false);
