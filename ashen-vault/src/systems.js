import { RELICS, SAVE_KEY } from "./data.js";

export function createPlayer() {
  return {
    x: 0, y: 0, faceX: 1, faceY: 0,
    hp: 100, maxHp: 100, attack: 12, level: 1, xp: 0, nextXp: 32,
    coins: 0, potions: 2, skillDamage: 22, skillCooldown: 5.5,
    skillTimer: 0, dashCooldown: 2.2, dashTimer: 0,
    invulnerable: 0, attackTimer: 0, bonusCoins: 0,
    relics: [], kills: 0, chests: 0
  };
}

export function gainExperience(player, amount) {
  player.xp += amount;
  const levels = [];
  while (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.level += 1;
    player.nextXp = Math.floor(player.nextXp * 1.38);
    player.maxHp += 12;
    player.hp = Math.min(player.maxHp, player.hp + 26);
    player.attack += 2;
    levels.push(player.level);
  }
  return levels;
}

export function chooseRelic(player, relic) {
  if (player.relics.includes(relic.id)) return false;
  relic.apply(player);
  player.relics.push(relic.id);
  return true;
}

export function saveRun(run) {
  try {
    const data = {
      floor: run.floor,
      player: run.player,
      dungeon: run.dungeon,
      enemies: run.enemies,
      drops: run.drops,
      bossDefeated: run.bossDefeated,
      log: run.log.slice(0, 6),
      timestamp: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.player || !Number.isFinite(data.floor) || !data.dungeon?.map) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
