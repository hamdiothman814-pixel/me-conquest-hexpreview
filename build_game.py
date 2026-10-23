#!/usr/bin/env python3
"""Assembles the playable 3D hex conquest web game (single index.html):
inlined Three.js + game logic (src_logic.js, rules ported from GameState.cs)
+ 3D renderer/UI (src_render3d.js) + data from the Unity game_data.json."""
import json

SRC = '/home/hatch/workspace/me_conquest_unity/Assets/Resources/game_data.json'
OUT = '/home/hatch/hexpreview/index.html'
BASE = '/home/hatch/hexpreview/'

d = json.load(open(SRC))
caps = set(d['capitals'])
countries = []
for c in d['countries']:
    countries.append({
        'code': c['code'], 'name': c['nameAr'],
        'color': '#%06X' % (c['color'] & 0xFFFFFF),
        'tank': c['equip']['tank'], 'arty': c['equip']['arty'],
        'bloc': c['equip']['bloc'],
        'capital': '',
    })
hexes = []
for i in range(len(d['cx'])):
    hexes.append([round(d['cx'][i], 1), round(d['cy'][i], 1), d['hCountry'][i],
                  d['hTerrain'][i], d['hCity'][i], 1 if i in caps else 0,
                  d['hAdmin'][i]])
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

three_js = open(BASE + 'three.min.js', encoding='utf-8').read()
logic = open(BASE + 'src_logic.js', encoding='utf-8').read().replace('__DATA__', data_js)
render = open(BASE + 'src_render3d.js', encoding='utf-8').read()

skeleton_head = r'''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>غزو الشرق الأوسط — النسخة السداسية ثلاثية الأبعاد</title>
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
'''

html = (skeleton_head + three_js + '\n</script>\n<script>\n' +
        logic + '\n' + render + '\n</script>\n</body>\n</html>')
open(OUT, 'w', encoding='utf-8').write(html)
print('written', OUT, len(html), 'bytes')
