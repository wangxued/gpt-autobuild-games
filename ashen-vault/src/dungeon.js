import { VIEW } from "./data.js";

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const key = (x, y) => y * VIEW.cols + x;

export function generateDungeon(floor) {
  const { cols, rows } = VIEW;
  const map = Array.from({ length: rows }, () => Array(cols).fill(1));
  const rooms = [];
  const attempts = 90;
  for (let i = 0; i < attempts && rooms.length < 9; i++) {
    const w = rand(4, 8), h = rand(3, 6);
    const x = rand(1, cols - w - 2), y = rand(1, rows - h - 2);
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push(room);
    for (let ry = y; ry < y + h; ry++) for (let rx = x; rx < x + w; rx++) map[ry][rx] = 0;
  }
  if (rooms.length < 3) return generateDungeon(floor);
  rooms.sort((a, b) => a.cx - b.cx);
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    let x = a.cx, y = a.cy;
    while (x !== b.cx) { map[y][x] = 0; x += Math.sign(b.cx - x); }
    while (y !== b.cy) { map[y][x] = 0; y += Math.sign(b.cy - y); }
  }
  const start = { x: rooms[0].cx, y: rooms[0].cy };
  const exit = { x: rooms.at(-1).cx, y: rooms.at(-1).cy };
  const candidates = rooms.slice(1, -1);
  const spawnCount = Math.min(3 + floor, 11);
  const spawns = [];
  for (let i = 0; i < spawnCount; i++) {
    const room = candidates[i % Math.max(1, candidates.length)];
    const x = clamp(room.cx + rand(-1, 1), 1, cols - 2);
    const y = clamp(room.cy + rand(-1, 1), 1, rows - 2);
    if (map[y][x] === 0 && (Math.abs(x - start.x) + Math.abs(y - start.y) > 5)) spawns.push({ x, y });
  }
  const chestRoom = candidates[Math.floor(candidates.length / 2)] || rooms[1];
  return { map, rooms, start, exit, spawns, chest: { x: chestRoom.cx, y: chestRoom.cy, opened: false }, floor };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function isBlocked(dungeon, x, y) {
  return x < 0 || y < 0 || x >= VIEW.cols || y >= VIEW.rows || dungeon.map[y][x] !== 0;
}
export function tileKey(x, y) { return key(x, y); }
