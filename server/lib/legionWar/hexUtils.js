/**
 * 盐场六边形地图相邻格计算
 * 方向数组取自 src/utils/legionWar.js（HexGraph），按列 x 奇偶不同
 */

const evenQDirs = [{ q: -1, r: 0 }, { q: -1, r: -1 }, { q: 0, r: 1 }, { q: 0, r: -1 }, { q: 1, r: 0 }, { q: 1, r: -1 }];
const oddQDirs = [{ q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 0, r: -1 }, { q: 1, r: 0 }, { q: 1, r: 1 }];

/** 返回 (x,y) 的 6 个相邻坐标 */
export function neighbors(x, y) {
  const dirs = x % 2 === 0 ? evenQDirs : oddQDirs;
  return dirs.map((d) => ({ x: x + d.q, y: y + d.r }));
}

/**
 * 从相邻格里挑一个战场上真实存在的格子（随机）
 * @param {number} x 当前 x
 * @param {number} y 当前 y
 * @param {object} buildingData 战场建筑数据，key 为 "x_y"
 * @returns {{x:number,y:number}|null}
 */
export function pickRandomNeighbor(x, y, buildingData) {
  const cands = neighbors(x, y).filter((n) => {
    const key = `${n.x}_${n.y}`;
    return buildingData && Object.prototype.hasOwnProperty.call(buildingData, key);
  });
  if (cands.length === 0) return null;
  return cands[Math.floor(Math.random() * cands.length)];
}
