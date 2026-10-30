import { CHAPTERS, ENEMIES, RELICS, TILE, VIEW } from "./data.js";
import { generateDungeon, isBlocked } from "./dungeon.js";
import { createPlayer, gainExperience, chooseRelic, saveRun, loadRun, clearSave, distance } from "./systems.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = Object.fromEntries([
  "overlay", "overlay-title", "overlay-copy", "overlay-actions", "start-button", "continue-button",
  "chapter-kicker", "area-name", "floor-number", "objective", "run-state", "hp-label", "hp-meter",
  "xp-label", "xp-meter", "level-label", "attack-label", "coin-label", "potion-label", "weapon-name",
  "weapon-desc", "relic-name", "relic-desc", "passive-list", "event-log", "quest-text",
  "kill-progress", "chest-progress", "room-hint", "boss-banner", "boss-name", "boss-health-fill", "toast"
].map(id => [id, document.getElementById(id)]));

const keys = new Set();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const roman = n => ["","壹","贰","叁","肆","伍","陆","柒","捌","玖","拾"][Math.min(10,n)] || String(n);
let run = null, lastTime = 0, accumulator = 0, toastTimer = 0, moveTimer = 0;

function say(message, type = "") {
  const p = document.createElement("p");
  p.textContent = message;
  if (type) p.className = type;
  ui["event-log"].prepend(p);
  while (ui["event-log"].children.length > 7) ui["event-log"].lastChild.remove();
  run?.log.unshift(message);
  if (run?.log) run.log = run.log.slice(0, 6);
}
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  toastTimer = 2.1;
}
function showOverlay(title, copy, buttons) {
  ui["overlay-title"].textContent = title;
  ui["overlay-copy"].textContent = copy;
  ui["overlay-actions"].replaceChildren();
  for (const item of buttons) {
    const button = document.createElement("button");
    button.className = "btn " + (item.primary ? "btn-primary" : "btn-ghost");
    button.textContent = item.label;
    button.addEventListener("click", item.action);
    ui["overlay-actions"].append(button);
  }
  ui.overlay.classList.remove("hidden");
}
function hideOverlay() { ui.overlay.classList.add("hidden"); }

function beginRun(saved = null) {
  const floor = saved?.floor || 1;
  const player = saved?.player ? { ...createPlayer(), ...saved.player } : createPlayer();
  run = { floor, player, dungeon: null, enemies: [], drops: [], particles: [], paused: false, ended: false, time: 0, log: saved?.log || [], bossDefeated: false };
  ui["event-log"].replaceChildren();
  if (saved?.log?.length) saved.log.slice(0, 5).reverse().forEach(line => say(line));
  buildFloor();
  hideOverlay();
  ui["run-state"].textContent = "灯火未熄";
  updateUI();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}
function buildFloor() {
  const chapter = CHAPTERS[Math.min(2, Math.floor((run.floor - 1) / 3))];
  run.dungeon = generateDungeon(run.floor);
  run.player.x = run.dungeon.start.x;
  run.player.y = run.dungeon.start.y;
  run.player.invulnerable = 1.2;
  run.enemies = [];
  run.drops = [];
  run.bossDefeated = false;
  run.dungeon.spawns.forEach((point, index) => {
    const types = run.floor >= 3 ? ["corpse", "shanxiao", "paper"] : ["corpse", "shanxiao", "paper"];
    const type = types[(index + rand(0, 2)) % types.length];
    const base = ENEMIES[type];
    const scale = 1 + (run.floor - 1) * .14;
    run.enemies.push({ ...point, type, hp: Math.round(base.hp * scale), maxHp: Math.round(base.hp * scale), attack: Math.round(base.attack * scale), speed: base.speed, cooldown: Math.random(), flash: 0, windup: 0 });
  });
  if (run.floor % 3 === 0) {
    const bossPoint = run.dungeon.rooms.at(-2);
    const base = ENEMIES.warden;
    const scale = 1 + (run.floor - 3) * .18;
    run.enemies.push({ x: bossPoint.cx, y: bossPoint.cy, type: "warden", hp: Math.round(base.hp * scale), maxHp: Math.round(base.hp * scale), attack: Math.round(base.attack * scale), speed: base.speed, cooldown: 1.2, flash: 0, windup: 0, phase: 1 });
    ui["boss-banner"].classList.add("show");
    say("地脉震动，镇陵兽已醒。", "warn");
  } else {
    ui["boss-banner"].classList.remove("show");
    say(chapter.flavor, "gold");
  }
  ui["chapter-kicker"].textContent = "第" + roman(Math.ceil(run.floor / 3)) + "卷 · " + chapter.name;
  ui["area-name"].textContent = chapter.area;
  ui["floor-number"].textContent = roman(run.floor);
  ui.objective.textContent = chapter.objective;
  ui["quest-text"].textContent = run.floor % 3 === 0 ? "镇陵兽尚未伏诛。击败它，方可开启石门。" : "探索房间，搜寻宝匣，找到石门后继续深入。";
  ui["room-hint"].textContent = "烛火摇曳，阴风不止";
  toast("已进入：" + chapter.area);
  updateUI();
  saveRun(run);
}

function move(dx, dy) {
  if (!canPlay()) return;
  const p = run.player;
  if (dx || dy) { p.faceX = dx; p.faceY = dy; }
  const nx = p.x + dx, ny = p.y + dy;
  if (isBlocked(run.dungeon, nx, ny) || run.enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny)) return;
  p.x = nx; p.y = ny;
  const chest = run.dungeon.chest;
  if (!chest.opened && p.x === chest.x && p.y === chest.y) openChest();
  const exit = run.dungeon.exit;
  if (p.x === exit.x && p.y === exit.y) reachExit();
  updateUI();
}
function canPlay() { return run && !run.paused && !run.ended && ui.overlay.classList.contains("hidden"); }

function attack() {
  if (!canPlay()) return;
  const p = run.player;
  p.attackTimer = .2;
  const targets = run.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) <= 1 && Math.abs(e.y - p.y) <= 1 && (e.x !== p.x || e.y !== p.y));
  targets.sort((a,b) => distance(p,a) - distance(p,b));
  const target = targets[0];
  if (!target) { say("刀锋掠过夜雾，什么也没有斩中。"); return; }
  const damage = p.attack + rand(-2, 4);
  hurtEnemy(target, damage);
  spawnBurst(target.x, target.y, "#e6c58b", 8);
}
function hurtEnemy(enemy, damage) {
  enemy.hp -= damage;
  enemy.flash = .16;
  say("你以兵刃击中" + ENEMIES[enemy.type].name + "，造成 " + damage + " 点伤害。", "good");
  if (enemy.hp <= 0) {
    const data = ENEMIES[enemy.type];
    run.player.kills++;
    run.player.coins += rand(...data.coins) + run.player.bonusCoins;
    const levels = gainExperience(run.player, data.xp);
    say(ENEMIES[enemy.type].name + "化作一缕阴烟。修为 +" + data.xp + "。", "gold");
    if (Math.random() < .22) run.drops.push({ x: enemy.x, y: enemy.y, type: "potion" });
    if (enemy.type === "warden") {
      run.bossDefeated = true;
      ui["boss-banner"].classList.remove("show");
      say("镇陵兽轰然倒地，墓门上的封印随之碎裂。", "gold");
      toast("镇守已除 · 石门开启");
    }
    if (levels.length) chooseUpgrade(levels.at(-1));
    updateUI();
    saveRun(run);
  }
  updateBossBar();
}
function castTalisman() {
  if (!canPlay()) return;
  const p = run.player;
  if (p.skillTimer > 0) { toast("符火尚未聚气"); return; }
  p.skillTimer = p.skillCooldown;
  const radius = 4;
  let hit = 0;
  for (const enemy of run.enemies) {
    if (enemy.hp > 0 && distance(p, enemy) <= radius) {
      hurtEnemy(enemy, p.skillDamage + rand(0, 5));
      spawnBurst(enemy.x, enemy.y, "#f2a76e", 15);
      hit++;
    }
  }
  spawnBurst(p.x, p.y, "#e7a96f", 26);
  say(hit ? "黄符燃起，符火灼中 " + hit + " 个邪祟。" : "黄符燃起，照亮四周阴影。", "gold");
  updateUI();
}
function dash() {
  if (!canPlay()) return;
  const p = run.player;
  if (p.dashTimer > 0) return;
  p.dashTimer = p.dashCooldown;
  p.invulnerable = .42;
  for (let i = 0; i < 3; i++) {
    const nx = p.x + p.faceX, ny = p.y + p.faceY;
    if (isBlocked(run.dungeon, nx, ny) || run.enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny)) break;
    p.x = nx; p.y = ny;
    spawnBurst(p.x, p.y, "#b7c0ae", 3);
  }
}
function drinkPotion() {
  if (!canPlay()) return;
  const p = run.player;
  if (p.potions <= 0) { toast("回春丹已用尽"); return; }
  if (p.hp === p.maxHp) { toast("气血充盈，无需服丹"); return; }
  p.potions--;
  const heal = Math.min(42, p.maxHp - p.hp);
  p.hp += heal;
  say("服下回春丹，气血恢复 " + heal + " 点。", "good");
  updateUI();
}
function openChest() {
  const chest = run.dungeon.chest;
  chest.opened = true;
  run.player.chests++;
  const coin = rand(12, 24);
  run.player.coins += coin;
  if (Math.random() < .55) run.player.potions++;
  say("宝匣开启，得铜钱 " + coin + " 枚。" + (Math.random() < .55 ? "匣中另有一枚回春丹。" : ""), "gold");
  toast("发现地宫宝匣");
  if (Math.random() < .65) chooseUpgrade();
  updateUI();
}
function reachExit() {
  if (run.floor % 3 === 0 && !run.bossDefeated) { toast("石门被镇陵煞气封住"); return; }
  showOverlay("石门之后，仍有异闻", "你点亮门旁的长明灯。更深处的风，正从千年前吹来。", [
    { label: "踏入下一层", primary: true, action: () => { run.floor++; run.player.hp = Math.min(run.player.maxHp, run.player.hp + 12); buildFloor(); hideOverlay(); } },
    { label: "留在此处", action: hideOverlay }
  ]);
}
function chooseUpgrade(level = null) {
  if (!run) return;
  run.paused = true;
  const options = [...RELICS].sort(() => Math.random() - .5).slice(0, 3);
  showOverlay(level ? "修为精进" : "宝匣藏珍", level ? "你突破至第 " + level + " 重。择一件奇珍，继续此行。" : "匣中有三件旧物，择其一带在身边。", options.map((relic, index) => ({
    label: relic.name + " · " + relic.desc,
    primary: index === 0,
    action: () => {
      chooseRelic(run.player, relic);
      say("你收下了" + relic.name + "。", "gold");
      run.paused = false;
      hideOverlay();
      updateUI();
      saveRun(run);
    }
  })));
}
function enemyTurn(dt) {
  const p = run.player;
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    e.cooldown -= dt;
    e.flash = Math.max(0, e.flash - dt);
    const d = distance(p, e);
    if (e.type === "warden" && d <= 5 && e.cooldown <= .5 && e.windup <= 0) e.windup = .65;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        if (d <= 3) {
          if (p.invulnerable <= 0) damagePlayer(e.attack + 5, "镇陵兽震地");
          spawnBurst(p.x, p.y, "#bd715d", 15);
        }
        e.cooldown = 2.2;
      }
      continue;
    }
    if (d <= 1 && e.cooldown <= 0) {
      if (p.invulnerable <= 0) damagePlayer(e.attack, ENEMIES[e.type].name);
      e.cooldown = e.type === "warden" ? 1.3 : 1.05;
      continue;
    }
    if (d < 9 && e.cooldown <= 0) {
      const dx = Math.abs(p.x - e.x) > Math.abs(p.y - e.y) ? Math.sign(p.x - e.x) : 0;
      const dy = dx ? 0 : Math.sign(p.y - e.y);
      const nx = e.x + dx, ny = e.y + dy;
      if (!isBlocked(run.dungeon, nx, ny) && !run.enemies.some(other => other !== e && other.hp > 0 && other.x === nx && other.y === ny) && !(nx === p.x && ny === p.y)) { e.x = nx; e.y = ny; }
      e.cooldown = 1 / e.speed;
    }
  }
}
function damagePlayer(amount, source) {
  const p = run.player;
  p.hp = Math.max(0, p.hp - amount);
  p.invulnerable = .7;
  say(source + "伤到了你，气血 -" + amount + "。", "warn");
  updateUI();
  if (p.hp <= 0) {
    run.ended = true;
    ui["run-state"].textContent = "行旅止步";
    showOverlay("灯灭于荒村", "此行止于第 " + run.floor + " 层。你除去了 " + p.kills + " 个邪祟，带回 " + p.coins + " 枚铜钱。山河异闻，尚未终结。", [
      { label: "重新执灯", primary: true, action: () => { clearSave(); beginRun(); } }
    ]);
  }
}
function chooseUpgradeDummy() {}

function update(dt) {
  if (!run || run.paused || run.ended || !ui.overlay.classList.contains("hidden")) return;
  const p = run.player;
  run.time += dt;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.skillTimer = Math.max(0, p.skillTimer - dt);
  p.dashTimer = Math.max(0, p.dashTimer - dt);
  toastTimer = Math.max(0, toastTimer - dt);
  if (toastTimer === 0) ui.toast.classList.remove("show");
  moveTimer -= dt;
  if (moveTimer <= 0) {
    let dx = 0, dy = 0;
    if (keys.has("w") || keys.has("arrowup")) dy = -1;
    else if (keys.has("s") || keys.has("arrowdown")) dy = 1;
    else if (keys.has("a") || keys.has("arrowleft")) dx = -1;
    else if (keys.has("d") || keys.has("arrowright")) dx = 1;
    if (dx || dy) { move(dx, dy); moveTimer = .115; }
  }
  enemyTurn(dt);
  for (const drop of [...run.drops]) {
    if (drop.x === p.x && drop.y === p.y) {
      if (drop.type === "potion") { p.potions++; say("拾得一枚回春丹。", "good"); }
      run.drops.splice(run.drops.indexOf(drop), 1);
    }
  }
  for (const particle of run.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
  run.particles = run.particles.filter(particle => particle.life > 0);
  updateBossBar();
}
function updateBossBar() {
  const boss = run?.enemies.find(e => e.type === "warden" && e.hp > 0);
  if (!boss) { ui["boss-banner"].classList.remove("show"); return; }
  ui["boss-banner"].classList.add("show");
  ui["boss-name"].textContent = "镇陵兽";
  ui["boss-health-fill"].style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + "%";
}
function updateUI() {
  if (!run) return;
  const p = run.player;
  ui["hp-label"].textContent = p.hp + " / " + p.maxHp;
  ui["hp-meter"].style.width = p.hp / p.maxHp * 100 + "%";
  ui["xp-label"].textContent = p.xp + " / " + p.nextXp;
  ui["xp-meter"].style.width = p.xp / p.nextXp * 100 + "%";
  ui["level-label"].textContent = "行走江湖 · 修为" + roman(p.level) + "重";
  ui["attack-label"].textContent = p.attack;
  ui["coin-label"].textContent = p.coins;
  ui["potion-label"].textContent = p.potions;
  ui["kill-progress"].textContent = "已除邪祟 " + p.kills;
  ui["chest-progress"].textContent = "已开宝匣 " + p.chests;
  ui["passive-list"].replaceChildren();
  if (!p.relics.length) {
    const empty = document.createElement("span"); empty.className = "empty-passive"; empty.textContent = "尚无奇珍 · 多留意暗处"; ui["passive-list"].append(empty);
  } else {
    p.relics.forEach(id => {
      const relic = RELICS.find(item => item.id === id);
      if (relic) { const tag = document.createElement("span"); tag.textContent = relic.name; ui["passive-list"].append(tag); }
    });
  }
}
function spawnBurst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = rand(18, 75);
    run.particles.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .25 + Math.random() * .35, maxLife: .6, color });
  }
}

function draw() {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  if (!run) { drawAttract(); return; }
  const dungeon = run.dungeon;
  const p = run.player;
  const ox = Math.floor((VIEW.width - VIEW.cols * TILE) / 2);
  const oy = Math.floor((VIEW.height - VIEW.rows * TILE) / 2);
  ctx.save();
  ctx.translate(ox, oy);
  for (let y = 0; y < VIEW.rows; y++) for (let x = 0; x < VIEW.cols; x++) drawTile(x, y, dungeon.map[y][x] === 1);
  drawChest(dungeon.chest);
  drawExit(dungeon.exit);
  for (const drop of run.drops) drawDrop(drop);
  for (const enemy of run.enemies) if (enemy.hp > 0) drawEnemy(enemy);
  drawPlayer(p);
  drawParticles();
  drawLighting(p);
  ctx.restore();
  drawFrameDetails();
}
function drawAttract() {
  ctx.fillStyle = "#11171b"; ctx.fillRect(0,0,VIEW.width,VIEW.height);
  for (let y=0;y<VIEW.height;y+=32) for(let x=0;x<VIEW.width;x+=32) {
    ctx.fillStyle = ((x+y)/32)%3===0 ? "#1a2527" : "#172124"; ctx.fillRect(x,y,32,32);
    if ((x*3+y*7)%11===0) { ctx.fillStyle="#34403a"; ctx.fillRect(x+5,y+8,21,3); }
  }
  ctx.fillStyle="#4b3430"; ctx.fillRect(440,185,80,210);
  ctx.fillStyle="#a65e43"; ctx.fillRect(450,195,60,190);
  ctx.fillStyle="#e4bb79"; ctx.fillRect(468,210,24,150);
  ctx.fillStyle="#f5d9a1"; ctx.fillRect(477,225,6,112);
  ctx.fillStyle="#0b1114"; ctx.fillRect(477,245,6,80);
  for (let i=0;i<30;i++) { ctx.fillStyle="rgba(203,159,98,"+(Math.random()*.2)+")"; ctx.fillRect(rand(0,960),rand(0,600),2,2); }
}
function drawTile(x,y,wall) {
  const px=x*TILE, py=y*TILE;
  if (wall) {
    ctx.fillStyle="#29302d"; ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle="#3b4138"; ctx.fillRect(px+1,py+1,TILE-2,5);
    ctx.fillStyle="#202723"; ctx.fillRect(px+3,py+8,TILE-6,TILE-10);
    ctx.fillStyle="#171d1b"; ctx.fillRect(px,py+TILE-3,TILE,3);
    if ((x*7+y*13)%9===0) { ctx.fillStyle="#8c5a43"; ctx.fillRect(px+7,py+15,2,8); ctx.fillRect(px+7,py+21,8,2); }
  } else {
    ctx.fillStyle=((x+y)%4===0)?"#282d29":"#222824"; ctx.fillRect(px,py,TILE,TILE);
    ctx.strokeStyle="rgba(126,117,91,.13)"; ctx.strokeRect(px+.5,py+.5,TILE-1,TILE-1);
    if ((x*11+y*5)%13===0) { ctx.fillStyle="#414239"; ctx.fillRect(px+8,py+9,2,2); ctx.fillRect(px+19,py+21,3,2); }
    if ((x+y)%17===0) { ctx.fillStyle="#74604a"; ctx.fillRect(px+15,py+6,2,7); ctx.fillRect(px+13,py+11,6,2); }
  }
}
function drawPlayer(p) {
  const x=p.x*TILE, y=p.y*TILE;
  if (p.invulnerable>0 && Math.floor(run.time*18)%2===0) return;
  ctx.fillStyle="#111714"; ctx.fillRect(x+7,y+25,19,5);
  ctx.fillStyle="#344f50"; ctx.fillRect(x+7,y+12,18,15);
  ctx.fillStyle="#b9a17c"; ctx.fillRect(x+9,y+5,14,13);
  ctx.fillStyle="#252d2b"; ctx.fillRect(x+8,y+4,16,6);
  ctx.fillStyle="#e4d2ae"; ctx.fillRect(x+11,y+10,3,3); ctx.fillRect(x+19,y+10,3,3);
  ctx.fillStyle="#a34e40"; ctx.fillRect(x+6,y+18,20,5);
  ctx.fillStyle="#c5c8b4";
  if (p.faceX>0) ctx.fillRect(x+23,y+15,13,3);
  else if (p.faceX<0) ctx.fillRect(x-4,y+15,13,3);
  else if (p.faceY<0) ctx.fillRect(x+15,y-3,3,14);
  else ctx.fillRect(x+15,y+24,3,13);
  if (p.attackTimer>0) {
    ctx.strokeStyle="#f0d49b"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x+16,y+16,25,-1.2,1.2); ctx.stroke();
  }
}
function drawEnemy(e) {
  const x=e.x*TILE,y=e.y*TILE;
  if (e.flash>0) { ctx.fillStyle="#fff0d0"; ctx.fillRect(x+5,y+5,22,24); return; }
  if (e.type==="corpse") {
    ctx.fillStyle="#5b5141"; ctx.fillRect(x+6,y+9,20,18); ctx.fillStyle="#8b765a"; ctx.fillRect(x+9,y+5,14,16);
    ctx.fillStyle="#d28a68"; ctx.fillRect(x+11,y+12,3,3); ctx.fillRect(x+20,y+12,3,3); ctx.fillStyle="#3a3830"; ctx.fillRect(x+7,y+25,6,5); ctx.fillRect(x+21,y+25,6,5);
  } else if (e.type==="shanxiao") {
    ctx.fillStyle="#3c5140"; ctx.fillRect(x+5,y+9,22,18); ctx.fillStyle="#82906a"; ctx.fillRect(x+8,y+5,16,16);
    ctx.fillStyle="#e0b875"; ctx.fillRect(x+10,y+11,4,3); ctx.fillRect(x+20,y+11,4,3); ctx.fillStyle="#29362e"; ctx.fillRect(x+4,y+24,7,6); ctx.fillRect(x+22,y+24,7,6);
  } else if (e.type==="paper") {
    ctx.fillStyle="#bba58a"; ctx.fillRect(x+7,y+5,18,24); ctx.fillStyle="#eee0bf"; ctx.fillRect(x+9,y+7,14,18);
    ctx.fillStyle="#8d493e"; ctx.fillRect(x+11,y+12,3,3); ctx.fillRect(x+19,y+12,3,3); ctx.fillRect(x+13,y+20,7,2);
  } else {
    ctx.fillStyle="#392e2b"; ctx.fillRect(x+2,y+8,28,23); ctx.fillStyle="#8f4a3e"; ctx.fillRect(x+6,y+4,20,23);
    ctx.fillStyle="#d4a66e"; ctx.fillRect(x+9,y+11,5,4); ctx.fillRect(x+19,y+11,5,4);
    ctx.fillStyle="#292521"; ctx.fillRect(x+4,y+27,8,5); ctx.fillRect(x+20,y+27,8,5);
    if (e.windup>0) { ctx.strokeStyle="#d77a5b"; ctx.lineWidth=2; ctx.strokeRect(x-5,y-5,42,42); }
  }
  const width=e.type==="warden"?32:25;
  ctx.fillStyle="#111"; ctx.fillRect(x+3,y-5,width,3);
  ctx.fillStyle="#b45b4b"; ctx.fillRect(x+3,y-5,width*clamp(e.hp/e.maxHp,0,1),3);
}
function drawChest(chest) {
  const x=chest.x*TILE,y=chest.y*TILE;
  ctx.fillStyle=chest.opened?"#3a3328":"#8e653d"; ctx.fillRect(x+5,y+12,22,15);
  ctx.fillStyle="#c9a35e"; ctx.fillRect(x+5,y+10,22,5); ctx.fillRect(x+14,y+13,4,8);
  if (!chest.opened) { ctx.fillStyle="#e5c17b"; ctx.fillRect(x+14,y+15,4,4); }
}
function drawExit(exit) {
  const x=exit.x*TILE,y=exit.y*TILE;
  ctx.fillStyle="#514338"; ctx.fillRect(x+4,y+3,24,27);
  ctx.fillStyle="#b47d55"; ctx.fillRect(x+8,y+7,16,23);
  ctx.fillStyle="#111715"; ctx.fillRect(x+11,y+11,10,19);
  ctx.fillStyle="#e4b979"; ctx.fillRect(x+14,y+17,3,3);
}
function drawDrop(drop) {
  const x=drop.x*TILE,y=drop.y*TILE;
  ctx.fillStyle="#9c5349"; ctx.fillRect(x+12,y+11,9,13);
  ctx.fillStyle="#e2bd86"; ctx.fillRect(x+14,y+7,5,5);
}
function drawParticles() {
  for (const particle of run.particles) {
    ctx.globalAlpha=clamp(particle.life/particle.maxLife,0,1);
    ctx.fillStyle=particle.color; ctx.fillRect(particle.x-particle.x%1,particle.y-particle.y%1,3,3);
  }
  ctx.globalAlpha=1;
}
function drawLighting(p) {
  const x=p.x*TILE+16,y=p.y*TILE+16;
  const light=ctx.createRadialGradient(x,y,35,x,y,250);
  light.addColorStop(0,"rgba(8,10,12,0)"); light.addColorStop(.55,"rgba(8,10,12,.16)"); light.addColorStop(1,"rgba(4,7,9,.88)");
  ctx.fillStyle=light; ctx.fillRect(0,0,VIEW.width,VIEW.height);
  const flame=ctx.createRadialGradient(x,y,0,x,y,58);
  flame.addColorStop(0,"rgba(218,157,91,.13)"); flame.addColorStop(1,"rgba(218,157,91,0)");
  ctx.fillStyle=flame; ctx.fillRect(x-60,y-60,120,120);
}
function drawFrameDetails() {
  ctx.fillStyle="rgba(211,183,130,.45)";
  for(let i=0;i<4;i++){const x=i%2?VIEW.width-9:4,y=i<2?4:VIEW.height-9;ctx.fillRect(x,y,5,5);}
}
function frame(now) {
  if (!run || run.ended) { draw(); return; }
  const dt=Math.min(.04,(now-lastTime)/1000 || 0); lastTime=now;
  update(dt); draw();
  if (!run.ended) requestAnimationFrame(frame);
}

function keyDown(event) {
  const key=event.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright"," ","shift"].includes(key)) event.preventDefault();
  if (key==="p") { togglePause(); return; }
  if (key==="j" || key===" ") { if (!keys.has("attack")) attack(); keys.add("attack"); return; }
  if (key==="k") { castTalisman(); return; }
  if (key==="shift") { dash(); return; }
  if (key==="q") { drinkPotion(); return; }
  keys.add(key);
}
function togglePause() {
  if (!run || run.ended) return;
  run.paused=!run.paused;
  if (run.paused) {
    ui["run-state"].textContent="暂歇";
    showOverlay("且听风过檐", "夜路漫长，稍作歇息。", [
      { label:"继续行旅", primary:true, action:()=>{run.paused=false;hideOverlay();ui["run-state"].textContent="灯火未熄";lastTime=performance.now();requestAnimationFrame(frame);} },
      { label:"重新开始", action:()=>{clearSave();beginRun();} }
    ]);
  } else hideOverlay();
}
document.addEventListener("keydown",keyDown);
document.addEventListener("keyup",event=>keys.delete(event.key.toLowerCase()));
window.addEventListener("blur",()=>keys.clear());
ui["start-button"].addEventListener("click",()=>beginRun());
ui["continue-button"].addEventListener("click",()=>{const saved=loadRun();if(saved)beginRun(saved);else toast("尚无可继续的行旅");});
document.querySelectorAll("[data-key]").forEach(button=>{
  const dir=button.dataset.key;
  const vector={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir];
  const act=()=>move(...vector);
  button.addEventListener("pointerdown",event=>{event.preventDefault();act();});
});
document.querySelectorAll("[data-action]").forEach(button=>{
  const actions={attack, dash, skill:castTalisman, potion:drinkPotion};
  button.addEventListener("pointerdown",event=>{event.preventDefault();actions[button.dataset.action]();});
});
const savedAtLoad=loadRun();
if (savedAtLoad) ui["continue-button"].style.display="inline-block";
else ui["continue-button"].style.display="none";
draw();
