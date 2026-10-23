
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

