#!/usr/bin/env python3
"""Builds the playable hex conquest web game (single index.html) from the
Unity project's game_data.json. Rules ported 1:1 from GameState.cs."""
import json, os

SRC = '/home/hatch/workspace/me_conquest_unity/Assets/Resources/game_data.json'
OUT = '/home/hatch/hexpreview/index.html'

d = json.load(open(SRC))
caps = set(d['capitals'])
countries = []
for c in d['countries']:
    countries.append({
        'code': c['code'], 'name': c['nameAr'],
        'color': '#%06X' % (c['color'] & 0xFFFFFF),
        'tank': c['equip']['tank'], 'arty': c['equip']['arty'],
        'bloc': c['equip']['bloc'],
        'capital': c.get('capital', ''),
    })
hexes = []
for i in range(len(d['cx'])):
    hexes.append([round(d['cx'][i], 1), round(d['cy'][i], 1), d['hCountry'][i],
                  d['hTerrain'][i], d['hCity'][i], 1 if i in caps else 0,
                  d['hAdmin'][i]])
    # find capital name per country
for c in countries:
    for i in range(len(hexes)):
        if hexes[i][5] == 1 and hexes[i][2] == c['code']:
            c['capital'] = hexes[i][4]
            break
gens = {g['code']: [[it['name'], it['atk'], it['def']] for it in g['items']]
        for g in d['generals']}
data = {
    'hexes': hexes, 'countries': countries, 'gens': gens,
    'nbFlat': d['nbFlat'], 'nbCount': d['nbCount'],
    'W': d['worldW'], 'H': d['worldH'], 'R': d['hexR'],
}
data_js = json.dumps(data, ensure_ascii=False)

html = r'''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>غزو الشرق الأوسط — النسخة السداسية</title>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0a2440;
    font-family:"Segoe UI",Tahoma,sans-serif;-webkit-user-select:none;user-select:none}
  #cv{position:absolute;inset:0;touch-action:none}
  #hud{position:absolute;top:0;left:0;right:0;background:rgba(8,13,22,.92);color:#f2ede4;
    padding:7px 10px;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:5}
  #hud .chip{display:inline-block;width:12px;height:12px;border-radius:3px;margin-left:4px;vertical-align:-1px}
  #hud b{color:#f0c96a}
  #hud .sp{flex:1}
  .hbtn{background:#22314a;color:#f2ede4;border:1px solid #3b5070;border-radius:8px;
    padding:5px 10px;font-size:14px;cursor:pointer}
  #panel{position:absolute;left:0;right:0;bottom:0;background:rgba(8,13,22,.95);color:#f2ede4;
    padding:9px 12px;border-top:2px solid #d9a441;z-index:5;min-height:86px}
  #panel .ttl{font-size:16px;margin-bottom:3px}
  #panel .sub{font-size:13px;color:#c9d4e3;margin-bottom:7px;line-height:1.55}
  #panel .row{display:flex;gap:7px;flex-wrap:wrap}
  .abtn{background:#0c6b57;color:#fff;border:none;border-radius:9px;padding:9px 12px;
    font-size:14.5px;cursor:pointer;font-family:inherit}
  .abtn:disabled{background:#39424f;color:#8b96a5;cursor:default}
  .abtn.war{background:#a52a1f}
  .abtn.move{background:#20507e}
  .abtn.end{background:#d97706;font-weight:bold;font-size:16px;padding:10px 18px}
  .abtn.ghost{background:#22314a}
  #overlay{position:absolute;inset:0;background:rgba(5,9,16,.97);z-index:20;overflow-y:auto;
    color:#f2ede4;padding:18px 14px 30px}
  #overlay h1{color:#f0c96a;text-align:center;font-size:26px;margin:6px 0 2px}
  #overlay .tag{text-align:center;color:#c9d4e3;font-size:14px;margin-bottom:14px}
  .diffs{display:flex;gap:8px;justify-content:center;margin-bottom:14px}
  .diffs button{background:#22314a;color:#f2ede4;border:2px solid #3b5070;border-radius:10px;
    padding:8px 18px;font-size:15px;cursor:pointer;font-family:inherit}
  .diffs button.on{border-color:#f0c96a;background:#3a2f10}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:9px;max-width:900px;margin:0 auto}
  .card{background:#131c2c;border:1.5px solid #2c3e58;border-radius:12px;padding:10px;cursor:pointer}
  .card:active{border-color:#f0c96a}
  .card .nm{font-size:17px;font-weight:bold}
  .card .sm{font-size:12px;color:#aebdd1;line-height:1.6}
  .card .dot{display:inline-block;width:11px;height:11px;border-radius:3px;margin-left:5px}
  #events{position:absolute;inset:auto 0 0 0;max-height:55%;background:rgba(8,13,22,.97);
    z-index:15;color:#f2ede4;padding:12px 14px;border-top:2px solid #d9a441;overflow-y:auto;display:none}
  #events h3{margin:2px 0 8px;color:#f0c96a}
  #events div{font-size:13.5px;line-height:1.8;border-bottom:1px solid #22314a;padding:3px 0}
  #toast{position:absolute;top:52px;left:50%;transform:translateX(-50%);background:rgba(20,16,4,.95);
    color:#ffd94d;border:1px solid #d9a441;border-radius:10px;padding:8px 16px;font-size:15px;
    z-index:30;display:none;max-width:88%;text-align:center}
</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="hud"></div>
<div id="panel"></div>
<div id="events"></div>
<div id="toast"></div>
<div id="overlay"></div>
<script>
'use strict';
const D = __DATA__;
const N = D.hexes.length;
const CIDX = {}; D.countries.forEach((c, i) => CIDX[c.code] = i);
const STARTS = []; { let s = 0; for (let i = 0; i < N; i++){ STARTS.push(s); s += D.nbCount[i]; } }
function nbs(i){ const out = []; const s = STARTS[i]; for (let k = 0; k < D.nbCount[i]; k++) out.push(D.nbFlat[s + k]); return out; }
const COST = [12, 16, 20], POW = [1, 2, 3];
const UNAME = ['مشاة', 'مدفعية', 'دبابات'];
const UICON = ['🚶', '💣', '🛡️'];
const TDEF = {m: 1.45, f: 1.30, r: 1.15, p: 1.0, d: 1.0};
const TINC = {p: 1, r: 1, f: 1, d: 0, m: 0};
const TNAME = {p: 'سهل', d: 'صحراء', m: 'جبال', f: 'غابة', r: 'وادي نهر'};
const SAVE_KEY = 'mec_hex_save_v1';

let S = null;      // game state
let sel = -1;      // selected hex
let genMove = null; // general object awaiting move target
let eventLog = [];

function strength(i){ return S.inf[i]*1 + S.art[i]*2 + S.tank[i]*3; }
function defFactor(i){ let f = TDEF[D.hexes[i][3]] || 1; if (D.hexes[i][5]) f *= 1.25; else if (D.hexes[i][4]) f *= 1.15; return f; }
function incomeOf(i){ if (D.hexes[i][5]) return 15; if (D.hexes[i][4]) return 8; return TINC[D.hexes[i][3]] || 0; }
function income(ci){ let s = 0; for (let i = 0; i < N; i++) if (S.owner[i] === ci) s += incomeOf(i); return s; }
function tilesOf(ci){ const out = []; for (let i = 0; i < N; i++) if (S.owner[i] === ci) out.push(i); return out; }
function generalAt(i){ for (const g of S.gens) if (g.hex === i && S.owner[i] === g.ci) return g; return null; }
function atkMult(i){ const g = generalAt(i); return g ? 1 + g.atk : 1; }
function defMult(i){ const g = generalAt(i); return g ? 1 + g.def : 1; }
function isBorder(i){ const o = S.owner[i]; for (const nb of nbs(i)) if (S.owner[nb] !== o) return true; return false; }
function nameOf(i){ return D.hexes[i][4] || D.hexes[i][6]; }
function cname(ci){ return D.countries[ci].name; }

function newGame(playerCi, diff){
  S = { player: playerCi, diff: diff, turn: 1,
        owner: new Array(N), inf: new Array(N).fill(0),
        art: new Array(N).fill(0), tank: new Array(N).fill(0),
        gold: {}, alive: {}, gens: [], acted: new Set(), genActed: new Set(),
        over: false, winner: -1, lost: false };
  D.countries.forEach((c, ci) => { S.gold[ci] = 60; S.alive[ci] = true; });
  for (let i = 0; i < N; i++){
    const ci = CIDX[D.hexes[i][2]];
    S.owner[i] = ci;
    if (D.hexes[i][5]){ S.inf[i] = 12; S.art[i] = 5; S.tank[i] = 3; }
    else if (D.hexes[i][4]){ S.inf[i] = 7; S.art[i] = 3; S.tank[i] = 2; }
    else {
      let border = false;
      for (const nb of nbs(i)) if (D.hexes[nb][2] !== D.hexes[i][2]){ border = true; break; }
      if (border) S.inf[i] = 2; else if (i % 3 === 0) S.inf[i] = 1;
    }
  }
  D.countries.forEach((c, ci) => {
    const defs = D.gens[c.code] || [];
    const mine = tilesOf(ci); if (!mine.length) return;
    const cap = mine.find(i => D.hexes[i][5] === 1);
    const sorted = mine.slice().sort((a, b) => strength(b) - strength(a));
    defs.forEach((df, k) => {
      let home = cap;
      if (k > 0){ for (const t of sorted) if (!D.hexes[t][5]){ home = t; break; } }
      S.gens.push({ name: df[0], ci: ci, atk: df[1], def: df[2], hex: home });
    });
  });
  eventLog = ['بدأت الحرب! اخترت ' + cname(playerCi) + ' — وحّد الشرق الأوسط تحت رايتك.'];
  sel = -1; genMove = null;
  startTurn(playerCi, true);
  save(); showGame(); toast('دورك الأول — بالتوفيق يا قائد');
}
function startTurn(ci, first){
  S.acted.clear(); S.genActed.clear();
  if (S.alive[ci] && !first) S.gold[ci] += income(ci);
  if (S.alive[ci] && first) S.gold[ci] += 0; // NewGame already set 60; C# grants income on StartTurn too — first turn mirrors it below
  if (first) S.gold[ci] += income(ci);
}
function save(){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      p: S.player, d: S.diff, t: S.turn, o: S.owner, i: S.inf, a: S.art, k: S.tank,
      g: S.gold, al: S.alive, gn: S.gens, ev: eventLog.slice(-40)
    }));
  } catch(e){}
}
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !s.o || s.o.length !== N) return false;
    S = { player: s.p, diff: s.d, turn: s.t, owner: s.o, inf: s.i, art: s.a, tank: s.k,
          gold: s.g, alive: s.al, gens: s.gn, acted: new Set(), genActed: new Set(),
          over: false, winner: -1, lost: false };
    eventLog = s.ev || [];
    sel = -1; genMove = null;
    checkEnd();
    return true;
  } catch(e){ return false; }
}
function relocateGeneral(g){
  const mine = tilesOf(g.ci);
  if (!mine.length){ g.hex = -1; return; }
  const cap = mine.find(i => D.hexes[i][5] === 1);
  if (cap !== undefined && cap !== null && cap >= 0){ g.hex = cap; return; }
  let best = mine[0];
  for (const t of mine) if (strength(t) > strength(best)) best = t;
  g.hex = best;
}
function checkAlive(ci){
  if (S.alive[ci] && tilesOf(ci).length === 0){
    S.alive[ci] = false;
    eventLog.push('💥 خرجت ' + cname(ci) + ' من الحرب — تمت تصفيتها بالكامل');
  }
}
function checkEnd(){
  if (tilesOf(S.player).length === 0){ S.lost = true; S.over = true; return; }
  let capsOwned = 0, totalCaps = 0, others = 0;
  for (let i = 0; i < N; i++) if (D.hexes[i][5]){ totalCaps++; if (S.owner[i] === S.player) capsOwned++; }
  D.countries.forEach((c, ci) => { if (ci !== S.player && S.alive[ci]) others++; });
  if (capsOwned === totalCaps || others === 0){ S.winner = S.player; S.over = true; }
}
function doAttack(from, to){
  if (S.owner[from] === S.owner[to] || S.acted.has(from)) return false;
  if (!nbs(from).includes(to)) return false;
  const atkBase = strength(from); if (atkBase === 0) return false;
  const defBase = strength(to);
  const atkEff = atkBase * atkMult(from) * (0.85 + 0.30 * Math.random());
  const defEff = defBase * defFactor(to) * defMult(to) * (0.85 + 0.30 * Math.random());
  const atkCi = S.owner[from], defCi = S.owner[to];
  const force = [S.inf[from], S.art[from], S.tank[from]];
  S.acted.add(from); S.acted.add(to);
  if (atkEff > defEff){
    const beaten = generalAt(to);
    const wasCap = D.hexes[to][5] === 1;
    let keep = defBase === 0 ? 1 : Math.min(1, Math.max(0.15, 1 - 0.75 * (defEff / atkEff)));
    S.owner[to] = atkCi;
    S.inf[to] = Math.round(force[0] * keep);
    S.art[to] = Math.round(force[1] * keep);
    S.tank[to] = Math.round(force[2] * keep);
    if (strength(to) === 0) S.inf[to] = 1;
    S.inf[from] = S.art[from] = S.tank[from] = 0;
    if (beaten && beaten.ci !== atkCi){
      eventLog.push('🏳️ انسحب القائد ' + beaten.name + ' من ' + nameOf(to) + ' إلى داخل بلاده');
      relocateGeneral(beaten);
    }
    if (wasCap) eventLog.push('👑 سقطت عاصمة ' + cname(defCi) + ' (' + nameOf(to) + ') بيد ' + cname(atkCi));
    checkAlive(defCi); checkEnd();
    return true;
  } else {
    const keepD = Math.min(1, Math.max(0.15, 1 - 0.75 * (atkEff / defEff)));
    S.inf[to] = Math.round(S.inf[to] * keepD);
    S.art[to] = Math.round(S.art[to] * keepD);
    S.tank[to] = Math.round(S.tank[to] * keepD);
    S.inf[from] = S.art[from] = S.tank[from] = 0;
    return false;
  }
}
function doTransfer(from, to){
  if (S.owner[from] !== S.owner[to] || S.acted.has(from)) return false;
  if (!nbs(from).includes(to) || strength(from) === 0) return false;
  S.inf[to] += S.inf[from]; S.art[to] += S.art[from]; S.tank[to] += S.tank[from];
  S.inf[from] = S.art[from] = S.tank[from] = 0;
  S.acted.add(from); S.acted.add(to);
  return true;
}
function doRecruit(hex, unit){
  const ci = S.owner[hex];
  if (ci !== S.player || S.acted.has(hex) || S.gold[ci] < COST[unit]) return false;
  S.gold[ci] -= COST[unit];
  if (unit === 0) S.inf[hex]++; else if (unit === 1) S.art[hex]++; else S.tank[hex]++;
  S.acted.add(hex);
  return true;
}
function aiTurn(ci){
  if (!S.alive[ci]) return;
  S.acted.clear(); S.genActed.clear();
  const incFactor = S.diff === 0 ? 0.8 : (S.diff === 2 ? 1.25 : 1.0);
  S.gold[ci] += income(ci);
  S.gold[ci] = Math.floor(S.gold[ci] + income(ci) * (incFactor - 1));
  // generals to strongest fronts
  const fronts = tilesOf(ci).filter(isBorder).sort((a, b) => strength(b) - strength(a));
  const myGens = S.gens.filter(g => g.ci === ci && g.hex >= 0);
  for (let i = 0; i < myGens.length && i < fronts.length; i++) myGens[i].hex = fronts[i];
  // recruit at borders
  const borders = tilesOf(ci).filter(isBorder).sort((a, b) => strength(b) - strength(a));
  for (const b of borders){
    if (S.gold[ci] < COST[0]) break;
    let strongestEnemy = 0;
    for (const nb of nbs(b)) if (S.owner[nb] !== ci) strongestEnemy = Math.max(strongestEnemy, strength(nb));
    const want = strongestEnemy + 4;
    let guard = 0;
    while (strength(b) < want && S.gold[ci] >= COST[0] && guard++ < 14){
      let unit = 0;
      if (S.gold[ci] >= COST[2] && Math.random() < 0.35) unit = 2;
      else if (S.gold[ci] >= COST[1] && Math.random() < 0.5) unit = 1;
      S.gold[ci] -= COST[unit];
      if (unit === 0) S.inf[b]++; else if (unit === 1) S.art[b]++; else S.tank[b]++;
    }
    S.acted.add(b);
  }
  // push interior troops forward
  for (const t of tilesOf(ci)){
    if (S.acted.has(t) || isBorder(t) || strength(t) < 4) continue;
    for (const nb of nbs(t)){
      if (S.owner[nb] === ci && isBorder(nb)){
        S.inf[nb] += S.inf[t]; S.art[nb] += S.art[t]; S.tank[nb] += S.tank[t];
        S.inf[t] = S.art[t] = S.tank[t] = 0;
        S.acted.add(t); S.acted.add(nb);
        break;
      }
    }
  }
  // attack where clearly stronger
  const threshold = S.diff === 2 ? 1.05 : 1.25;
  const attackers = tilesOf(ci).filter(isBorder);
  for (const a of attackers){
    if (S.acted.has(a) || strength(a) === 0) continue;
    let best = -1, bestRatio = 0;
    for (const nb of nbs(a)){
      if (S.owner[nb] === ci) continue;
      const defEst = Math.max(1, strength(nb)) * defFactor(nb) * defMult(nb);
      const ratio = (strength(a) * atkMult(a)) / defEst;
      if (ratio > bestRatio){ bestRatio = ratio; best = nb; }
    }
    if (best >= 0 && bestRatio >= threshold) doAttack(a, best);
    if (S.over) return;
  }
}
function endTurn(){
  if (S.over) return;
  const order = [];
  D.countries.forEach((c, ci) => { if (ci !== S.player && S.alive[ci]) order.push(ci); });
  for (const ci of order){ aiTurn(ci); if (S.over) break; }
  S.turn++;
  eventLog.push('— الجولة ' + S.turn + ' —');
  S.acted.clear(); S.genActed.clear();
  if (!S.over && S.alive[S.player]) S.gold[S.player] += income(S.player);
  sel = -1; genMove = null;
  save(); showGame(); openEvents();
  if (S.over) showEnd();
  else toast('جولة ' + S.turn + ' — دخلك وصل، دورك');
}

// ---------- rendering ----------
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const hudEl = document.getElementById('hud'), panelEl = document.getElementById('panel');
const overlayEl = document.getElementById('overlay'), eventsEl = document.getElementById('events');
const toastEl = document.getElementById('toast');
let W = 0, H = 0, scale = 0, ox = 0, oy = 0, targetSel = -1, camInit = false;
const TINT = {d: [0.88, 0.78, 0.52, 0.38], m: [0.46, 0.39, 0.33, 0.42], f: [0.20, 0.42, 0.20, 0.38], r: [0.35, 0.55, 0.72, 0.28]};
function hex2rgb(h){ return [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255]; }
function blend(base, t){
  const b = hex2rgb(base);
  if (!t) return 'rgb(' + (b[0]*255|0) + ',' + (b[1]*255|0) + ',' + (b[2]*255|0) + ')';
  return 'rgb(' + ((b[0]+(t[0]-b[0])*t[3])*255|0) + ',' + ((b[1]+(t[1]-b[1])*t[3])*255|0) + ',' + ((b[2]+(t[2]-b[2])*t[3])*255|0) + ')';
}
function corner(x, y, i, r){ const a = (60*i - 30) * Math.PI/180; return [x + r*Math.cos(a), y + r*Math.sin(a)]; }
function hexPath(x, y, r){
  ctx.beginPath();
  for (let k = 0; k < 6; k++){ const c = corner(x, y, k, r); if (k === 0) ctx.moveTo(c[0], c[1]); else ctx.lineTo(c[0], c[1]); }
  ctx.closePath();
}
function star(x, y, r){
  ctx.beginPath();
  for (let k = 0; k < 10; k++){
    const rr = k % 2 === 0 ? r : r * 0.45, a = -Math.PI/2 + k * Math.PI/5;
    const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function draw(){
  if (!S) return;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16406b'); g.addColorStop(1, '#0a2440');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = D.R * scale;
  ctx.lineWidth = Math.max(0.5, scale * 0.5);
  ctx.strokeStyle = 'rgba(10,10,10,0.35)';
  for (let i = 0; i < N; i++){
    const h = D.hexes[i];
    const x = ox + h[0] * scale, y = oy + h[1] * scale;
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    hexPath(x, y, r);
    ctx.fillStyle = blend(D.countries[S.owner[i]].color, TINT[h[3]]);
    ctx.fill(); ctx.stroke();
    if (h[3] === 'm'){
      ctx.fillStyle = 'rgba(40,30,22,0.55)';
      ctx.beginPath();
      ctx.moveTo(x - r*0.42, y + r*0.32); ctx.lineTo(x, y - r*0.42); ctx.lineTo(x + r*0.42, y + r*0.32);
      ctx.closePath(); ctx.fill();
    } else if (h[3] === 'f'){
      ctx.fillStyle = 'rgba(18,52,20,0.65)';
      ctx.beginPath(); ctx.arc(x - r*0.25, y, r*0.20, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r*0.28, y + r*0.18, r*0.16, 0, 7); ctx.fill();
    }
    if (h[5] === 1){
      ctx.fillStyle = '#f5c542';
      ctx.beginPath(); ctx.arc(x, y - r*0.32, Math.max(1.8, r*0.20), 0, 7); ctx.fill();
    } else if (h[4]){
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(x, y - r*0.32, Math.max(1.2, r*0.12), 0, 7); ctx.fill();
    }
  }
  // units, generals, labels
  for (let i = 0; i < N; i++){
    const h = D.hexes[i];
    const x = ox + h[0] * scale, y = oy + h[1] * scale;
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    const st = strength(i), gen = generalAt(i);
    if (gen){
      ctx.fillStyle = '#ffd94d';
      star(x + r*0.45, y - r*0.45, Math.max(3, r*0.30));
      ctx.fill();
      ctx.strokeStyle = '#5a430e'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (st > 0 && r > 4){
      const label = '' + st;
      ctx.font = 'bold ' + Math.max(8, r*0.62) + 'px sans-serif';
      const w = ctx.measureText(label).width + 5;
      const bh = Math.max(9, r*0.72);
      ctx.fillStyle = S.owner[i] === S.player ? 'rgba(6,40,32,0.88)' : 'rgba(10,10,14,0.82)';
      ctx.beginPath();
      ctx.roundRect(x - w/2, y + r*0.12, w, bh, 3);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + r*0.12 + bh/2 + 0.5);
    }
    if (r > 12 && h[4]){
      ctx.font = Math.max(9, scale*6.4) + 'px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(h[4], x, y - r*0.55);
    }
  }
  // highlights
  function outline(i, color, wMul){
    if (i < 0) return;
    const h = D.hexes[i];
    const x = ox + h[0] * scale, y = oy + h[1] * scale;
    ctx.lineWidth = Math.max(1.6, scale * wMul); ctx.strokeStyle = color;
    hexPath(x, y, r * 1.03); ctx.stroke();
    ctx.lineWidth = Math.max(0.5, scale * 0.5); ctx.strokeStyle = 'rgba(10,10,10,0.35)';
  }
  if (sel >= 0 && S.owner[sel] === S.player && !S.over){
    for (const nb of nbs(sel)){
      if (S.owner[nb] !== S.player) outline(nb, 'rgba(255,70,50,0.85)', 1.1);
      else outline(nb, 'rgba(255,255,255,0.55)', 0.9);
    }
  }
  outline(targetSel, '#ff5040', 1.8);
  outline(sel, '#ffd94d', 1.8);
}
function resize(){
  W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  if (!camInit && S){
    scale = Math.min(W / D.W, H / D.H) * 0.99;
    ox = (W - D.W * scale) / 2; oy = (H - D.H * scale) / 2 + 16 * devicePixelRatio;
    camInit = true;
  }
  draw();
}
addEventListener('resize', resize);

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
      '<div class="sub">اضغط أيّاً من قطعك لعرض قواتها: جنّد فيها، اهجم على جار أحمر، أو انقل قواتها لجار صديق. قرّب بإصبعين واسحب للتنقل.</div>' +
      '<div class="row"><button class="abtn end" onclick="endTurnUI()">إنهاء الدور ⏭️</button></div>';
  }
  panelEl.innerHTML = html;
}
function showGame(){
  overlayEl.style.display = 'none';
  resize(); renderHUD(); renderPanel();
}
function recruitUI(u){
  if (doRecruit(sel, u)){ save(); draw(); renderHUD(); renderPanel(); }
  else toast('لا يمكن التجنيد هنا الآن');
}
function startGenMove(){
  const gen = generalAt(sel);
  if (gen){ genMove = gen; renderPanel(); }
}
function cancelGenMove(){ genMove = null; renderPanel(); }
function clearTarget(){ targetSel = -1; draw(); renderPanel(); }
function confirmAttack(){
  const a = sel, b = targetSel;
  const won = doAttack(a, b);
  targetSel = -1;
  sel = won ? b : -1;
  save(); draw(); renderHUD(); renderPanel();
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
    '<div class="tag">النسخة السداسية — 2,578 قطعة على خريطة حقيقية • وحّد كل العواصم أو امحُ خصومك</div>';
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

// ---------- input ----------
function pick(px, py){
  const x = (px * devicePixelRatio - ox) / scale, y = (py * devicePixelRatio - oy) / scale;
  let best = -1, bd = 1e18;
  for (let i = 0; i < N; i++){
    const h = D.hexes[i], dx = h[0]-x, dy = h[1]-y, dd = dx*dx + dy*dy;
    if (dd < bd){ bd = dd; best = i; }
  }
  return bd <= (D.R*1.3)*(D.R*1.3) ? best : -1;
}
function onTap(px, py){
  if (!S || S.over) return;
  const id = pick(px, py);
  if (genMove){
    if (id >= 0 && S.owner[id] === S.player && nbs(genMove.hex).includes(id) && id !== genMove.hex){
      genMove.hex = id; S.genActed.add(genMove.name);
      toast('⭐ انتقل القائد ' + genMove.name + ' إلى ' + nameOf(id));
      genMove = null; sel = id;
      save(); draw(); renderPanel();
    } else { genMove = null; renderPanel(); }
    return;
  }
  if (id < 0){ sel = -1; targetSel = -1; draw(); renderPanel(); return; }
  if (sel >= 0 && S.owner[sel] === S.player && id !== sel && nbs(sel).includes(id)){
    if (S.owner[id] !== S.player){ targetSel = id; draw(); renderPanel(); return; }
    if (strength(sel) > 0 && !S.acted.has(sel)){
      if (doTransfer(sel, id)){
        toast('🔀 نُقلت القوات إلى ' + nameOf(id));
        sel = id; targetSel = -1;
        save(); draw(); renderPanel();
        return;
      }
    }
  }
  sel = id; targetSel = -1;
  draw(); renderPanel();
}
let drag = null, movedPx = 0, lastPinch = 0;
cv.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; movedPx = 0; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
  movedPx += Math.abs(dx) + Math.abs(dy);
  ox += dx * devicePixelRatio; oy += dy * devicePixelRatio;
  drag = [e.clientX, e.clientY];
  draw();
});
cv.addEventListener('pointerup', e => {
  if (drag && movedPx < 7) onTap(e.clientX, e.clientY);
  drag = null;
});
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89); }, {passive: false});
cv.addEventListener('touchmove', e => {
  if (e.touches.length === 2){
    const dd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (lastPinch > 0) zoomAt((e.touches[0].clientX + e.touches[1].clientX)/2, (e.touches[0].clientY + e.touches[1].clientY)/2, dd / lastPinch);
    lastPinch = dd; movedPx = 99;
  }
}, {passive: true});
cv.addEventListener('touchend', () => { lastPinch = 0; });
function zoomAt(px, py, f){
  const ns = Math.min(Math.max(scale * f, 0.08), devicePixelRatio * 2.4);
  const k = ns / scale;
  ox = px * devicePixelRatio - (px * devicePixelRatio - ox) * k;
  oy = py * devicePixelRatio - (py * devicePixelRatio - oy) * k;
  scale = ns; draw();
}
showStart(false);
</script>
</body>
</html>'''

html = html.replace('__DATA__', data_js)
open(OUT, 'w').write(html)
print('written', OUT, len(html), 'bytes')
