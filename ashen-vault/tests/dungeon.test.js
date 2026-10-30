import test from "node:test";
import assert from "node:assert/strict";
import { generateDungeon, isBlocked } from "../src/dungeon.js";
import { VIEW } from "../src/data.js";

function reachable(dungeon) {
  const queue = [dungeon.start];
  const seen = new Set([dungeon.start.y * VIEW.cols + dungeon.start.x]);
  while (queue.length) {
    const point = queue.shift();
    if (point.x === dungeon.exit.x && point.y === dungeon.exit.y) return true;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = point.x + dx, y = point.y + dy;
      const key = y * VIEW.cols + x;
      if (!isBlocked(dungeon, x, y) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x, y });
      }
    }
  }
  return false;
}

test("地牢起点与出口都位于可通行地面", () => {
  for (let floor = 1; floor <= 9; floor++) {
    const dungeon = generateDungeon(floor);
    assert.equal(isBlocked(dungeon, dungeon.start.x, dungeon.start.y), false);
    assert.equal(isBlocked(dungeon, dungeon.exit.x, dungeon.exit.y), false);
  }
});

test("地牢出口始终可以从起点抵达", () => {
  for (let floor = 1; floor <= 20; floor++) {
    const dungeon = generateDungeon(floor);
    assert.equal(reachable(dungeon), true, "第 " + floor + " 层的出口不可达");
  }
});

test("生成的地图尺寸符合画布网格", () => {
  const dungeon = generateDungeon(4);
  assert.equal(dungeon.map.length, VIEW.rows);
  assert.ok(dungeon.map.every(row => row.length === VIEW.cols));
});
