import * as THREE from 'three';

/**
 * helpers.js — Utilitas PathfindingSystem v2
 *
 * Berisi:
 * - Heuristik A* dan Greedy
 * - MinHeap (priority queue O log n)
 * - NodePool (reuse objek, hemat GC)
 * - Path smoothing dengan line-of-sight check (tidak potong sudut gedung)
 * - Greedy pathfinding (fallback)
 * - Utilitas math
 */

// ========================
//   HEURISTICS
// ========================

/** Manhattan — cocok 4-arah */
export function heuristicManhattan(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

/** Chebyshev — cocok diagonal/8-arah */
export function heuristicChebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/** Euclidean — paling akurat untuk diagonal */
export function heuristicEuclidean(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ========================
//   MIN-HEAP
// ========================

export class MinHeap {
  constructor() { this._data = []; }
  get size() { return this._data.length; }

  push(node) {
    this._data.push(node);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top  = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) { this._data[0] = last; this._siftDown(0); }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._data[p].f <= this._data[i].f) break;
      [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
      i = p;
    }
  }

  _siftDown(i) {
    const n = this._data.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[s].f) s = l;
      if (r < n && this._data[r].f < this._data[s].f) s = r;
      if (s === i) break;
      [this._data[s], this._data[i]] = [this._data[i], this._data[s]];
      i = s;
    }
  }

  clear() { this._data = []; }
}

// ========================
//   NODE POOL
// ========================

export class NodePool {
  constructor() { this._pool = []; }

  get(gx, gz, g, h, parent) {
    const node  = this._pool.length > 0 ? this._pool.pop() : {};
    node.gx     = gx;
    node.gz     = gz;
    node.g      = g;
    node.h      = h;
    node.f      = g + h;
    node.parent = parent;
    return node;
  }

  release(node)        { node.parent = null; this._pool.push(node); }
  releaseAll(nodes)    { for (const n of nodes) this.release(n); }
}

// ========================
//   GREEDY PATHFINDING (Fallback)
//   Selalu gerak ke tetangga dengan h terkecil.
//   Lebih cepat tapi tidak selalu optimal.
// ========================

/**
 * Greedy Best-First Search — dipakai sebagai fallback jika A* timeout
 * @param {object} grid  — instance Grid.js
 * @param {number} sx, sz — start cell
 * @param {number} ex, ez — end cell
 * @param {boolean} diagonal — izinkan diagonal
 * @returns {Array<{gx,gz}>}
 */
export function greedyPath(grid, sx, sz, ex, ez, diagonal = true) {
  if (!grid.isWalkable(sx, sz) || !grid.isWalkable(ex, ez)) return [];
  if (sx === ex && sz === ez) return [{ gx: sx, gz: sz }];

  const dirs   = _getDirs(diagonal);
  const closed = new Set();
  const open   = [{ gx: sx, gz: sz, h: heuristicEuclidean(sx, sz, ex, ez), parent: null }];
  const all    = [open[0]];

  while (open.length > 0) {
    // Ambil node dengan h terkecil
    open.sort((a, b) => a.h - b.h);
    const cur = open.shift();
    const key = `${cur.gx},${cur.gz}`;

    if (closed.has(key)) continue;
    closed.add(key);

    if (cur.gx === ex && cur.gz === ez) {
      return _reconstruct(cur);
    }

    for (const [dx, dz] of dirs) {
      const nx = cur.gx + dx, nz = cur.gz + dz;
      if (!grid.inBounds(nx, nz) || !grid.isWalkable(nx, nz)) continue;
      if (closed.has(`${nx},${nz}`)) continue;
      // Diagonal clearance
      if (dx !== 0 && dz !== 0) {
        if (!grid.isWalkable(cur.gx + dx, cur.gz)) continue;
        if (!grid.isWalkable(cur.gx, cur.gz + dz)) continue;
      }
      const node = { gx: nx, gz: nz, h: heuristicEuclidean(nx, nz, ex, ez), parent: cur };
      all.push(node);
      open.push(node);
    }
  }

  return [];
}

function _reconstruct(node) {
  const path = [];
  let cur = node;
  while (cur) { path.unshift({ gx: cur.gx, gz: cur.gz }); cur = cur.parent; }
  return path;
}

function _getDirs(diagonal) {
  const base = [[1,0],[-1,0],[0,1],[0,-1]];
  if (diagonal) base.push([1,1],[-1,1],[1,-1],[-1,-1]);
  return base;
}

// ========================
//   PATH SMOOTHING — Line-of-Sight
//   Berbeda dari versi lama (collinear-only):
//   Versi ini cek apakah garis lurus antara dua node
//   melewati obstacle di grid. Kalau iya, waypoint ditengah dipertahankan.
//   Hasilnya: tidak ada jalur yang potong sudut gedung.
// ========================

/**
 * Smooth path dengan line-of-sight check
 * @param {Array<{gx,gz}>} path
 * @param {object} grid
 * @returns {Array<{gx,gz}>}
 */
export function smoothPath(path, grid) {
  if (!grid || path.length <= 2) return path;

  const result = [path[0]];
  let anchor   = 0;

  for (let i = 2; i < path.length; i++) {
    // Cek apakah ada line-of-sight dari anchor ke i
    if (!_hasLOS(path[anchor], path[i], grid)) {
      // Tidak ada LOS → simpan waypoint sebelumnya (i-1) sebagai turn point
      result.push(path[i - 1]);
      anchor = i - 1;
    }
  }

  result.push(path[path.length - 1]);
  return result;
}

/**
 * Bresenham line-of-sight check antara dua cell grid
 * Return true jika tidak ada obstacle di antara keduanya.
 * Fix: cek corner cell saat langkah diagonal agar jalur
 * tidak memotong sudut gedung.
 */
function _hasLOS(a, b, grid) {
  let x0 = a.gx, z0 = a.gz;
  const x1 = b.gx, z1 = b.gz;

  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;

  while (true) {
    if (!grid.isWalkable(x0, z0)) return false;
    if (x0 === x1 && z0 === z1) break;

    const e2 = 2 * err;
    const stepX = e2 > -dz;
    const stepZ = e2 <  dx;

    if (stepX) { err -= dz; x0 += sx; }
    if (stepZ) { err += dx; z0 += sz; }

    // Diagonal step: cek kedua cardinal cell yang dipotong
    if (stepX && stepZ) {
      if (!grid.isWalkable(x0, z0 - sz)) return false;
      if (!grid.isWalkable(x0 - sx, z0)) return false;
    }
  }
  return true;
}

// ========================
//   MATH UTILS
// ========================

export function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
export function lerp(a, b, t)        { return a + (b - a) * t; }
export function worldDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/**
 * Cari titik terdekat pada polyline path dari suatu titik.
 * @param {THREE.Vector3} point — posisi drone
 * @param {THREE.Vector3[]} path — array waypoints
 * @returns {{ point: THREE.Vector3, index: number, dist: number }}
 */
export function closestPointOnPath(point, path) {
  let minDist = Infinity;
  let closestPoint = new THREE.Vector3();
  let closestIndex = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(point, a);
    const lenSq = ab.lengthSq();

    if (lenSq < 0.0001) continue;

    let t = ap.dot(ab) / lenSq;
    t = clamp(t, 0, 1);

    const proj = new THREE.Vector3().copy(a).add(ab.clone().multiplyScalar(t));
    const dist = point.distanceTo(proj);

    if (dist < minDist) {
      minDist = dist;
      closestPoint.copy(proj);
      closestIndex = i;
    }
  }

  return { point: closestPoint, index: closestIndex, dist: minDist };
}
