export const TILE = 32;
export const VIEW = { width: 960, height: 600, cols: 30, rows: 18 };

export const CHAPTERS = [
  { name: "荒村夜行", area: "义庄外院", objective: "寻路：找到通往地宫的石门", flavor: "破窗后的灯影摇晃，像有人站在院墙之外。" },
  { name: "幽祠迷踪", area: "山神旧祠", objective: "破阵：寻出祭坛后的暗门", flavor: "香灰尚温，供桌上的神像却没有脸。" },
  { name: "沉陵地宫", area: "镇陵墓道", objective: "深入：击败守陵之物", flavor: "石门合拢，千年前的呼吸声再次响起。" }
];

export const ENEMIES = {
  corpse: { name: "尸傀", hp: 32, attack: 8, speed: 1.1, xp: 10, coins: [3, 7], color: "#7c5549", description: "迟缓而执拗，靠近后挥爪扑击。" },
  shanxiao: { name: "山魈", hp: 24, attack: 10, speed: 1.8, xp: 13, coins: [4, 9], color: "#65744f", description: "身形迅捷，擅长从侧面突袭。" },
  paper: { name: "纸人", hp: 19, attack: 7, speed: 1.35, xp: 12, coins: [5, 10], color: "#b78e72", description: "会留下纸影，符火能克制它。" },
  warden: { name: "镇陵兽", hp: 190, attack: 16, speed: 1.15, xp: 65, coins: [28, 40], color: "#a34d43", description: "古陵守卫，冲撞后会震裂地面。" }
};

export const RELICS = [
  { id: "bronze", name: "错金铜铃", desc: "斩击伤害提高 3 点", kind: "攻击", apply: p => p.attack += 3 },
  { id: "jade", name: "温玉佩", desc: "气血上限提高 20 点", kind: "气血", apply: p => { p.maxHp += 20; p.hp += 20; } },
  { id: "paper", name: "五雷敕令", desc: "符火冷却缩短，伤害提高", kind: "符术", apply: p => { p.skillDamage += 9; p.skillCooldown = Math.max(2.5, p.skillCooldown - 1); } },
  { id: "coin", name: "压胜钱", desc: "每次击败邪祟额外获得铜钱", kind: "财运", apply: p => p.bonusCoins += 4 },
  { id: "silk", name: "踏云履", desc: "闪避冷却缩短", kind: "身法", apply: p => p.dashCooldown = Math.max(1.2, p.dashCooldown - .45) }
];

export const SAVE_KEY = "jinxu-save-v1";
