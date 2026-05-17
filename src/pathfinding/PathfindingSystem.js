import * as THREE from 'three';
import {
  heuristicEuclidean,
  MinHeap,
  NodePool,
  smoothPath,
  greedyPath,
} from './helpers.js';

const BASE = import.meta.env.BASE_URL || '/';

/**
 * PathfindingSystem.js v3 — Upgrade lengkap
 *
 * ✅ Diagonal movement (jalur lebih pendek & natural)
 * ✅ Multi-waypoint queue (Shift+klik = tambah titik antrian)
 * ✅ Greedy fallback (kalau A* gagal)
 * ✅ Line-of-sight path smoothing (tidak potong sudut gedung)
 * ✅ Dynamic obstacle (rebuildGrid saat obstacle berubah)
 * ✅ Visual per-segment warna berbeda
 * ✅ Numbered waypoint markers
 */
export class PathfindingSystem {
  constructor(sceneManager, options = {}) {
    const {
      droneAltitude = 7,
      diagonal      = true,
      smooth        = true,
      handleInput   = true,
    } = options;

    this.scene    = sceneManager.getScene();
    this.camera   = sceneManager.getCamera();
    this.renderer = sceneManager.getRenderer();
    this.grid     = sceneManager.getGrid();
    this.drone    = sceneManager.drone;

    this.droneAltitude = droneAltitude;
    this.diagonal      = diagonal;
    this.smooth        = smooth;

    this._waypoints    = [];
    this._activeSegIdx = 0;

    this.onPathFound   = null;
    this.onNoPath      = null;
    this.onTargetClick = null;

    this._currentPath = [];
    this._segments    = [];

    this._heap = new MinHeap();
    this._pool = new NodePool();

    this._raycaster   = new THREE.Raycaster();
    this._mouse       = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._mouseDownPos  = { x: 0, y: 0 };
    this._mouseDownTime = 0;
    this._DRAG_THRESHOLD = 15;
    this._TAP_MAX_MS     = 400;

    // Visual
    this._pathGroup    = new THREE.Group();
    this._pathGroup.name = 'PathVisual';
    this.scene.add(this._pathGroup);

    this._targetMarker = this._createTargetMarker();
    this.scene.add(this._targetMarker);

    this._waypointMarkers = new THREE.Group();
    this._waypointMarkers.name = 'WaypointMarkers';
    this.scene.add(this._waypointMarkers);

    this._hud = this._createHUD();

    // Only handle input if not delegated to InputSystem (Orang 3)
    if (handleInput) {
      this._onPointerDown = this._handlePointerDown.bind(this);
      this._onPointerUp   = this._handlePointerUp.bind(this);
      this._onKeyDown     = this._handleKeyDown.bind(this);

      this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
      this.renderer.domElement.addEventListener('pointerup',   this._onPointerUp);
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  // ========================
  //   PUBLIC API
  // ========================

  /**
   * Cari jalur dari start ke end (single segment)
   * Pakai A* dengan greedy fallback
   */
  findPath(worldStart, worldEnd) {
    const grid = this.grid;
    let { gx: sx, gz: sz } = grid.worldToGrid(worldStart.x, worldStart.z);
    let { gx: ex, gz: ez } = grid.worldToGrid(worldEnd.x,   worldEnd.z);

    sx = Math.max(0, Math.min(grid.cols - 1, sx));
    sz = Math.max(0, Math.min(grid.rows - 1, sz));
    ex = Math.max(0, Math.min(grid.cols - 1, ex));
    ez = Math.max(0, Math.min(grid.rows - 1, ez));

    // Resolve start walkable
    if (!grid.isWalkable(sx, sz)) {
      const near = this._findNearestWalkable(sx, sz);
      if (near) { sx = near.gx; sz = near.gz; }
    }

    // Resolve end walkable
    let resolvedEx = ex, resolvedEz = ez;
    if (!grid.isWalkable(ex, ez)) {
      const near = this._findNearestWalkable(ex, ez);
      if (!near) {
        this._showToast(`<img src="${BASE}icons/x.svg" class="hud-icon"> Target tidak terjangkau!`, '#ff4444');
        if (this.onNoPath) this.onNoPath();
        return [];
      }
      resolvedEx = near.gx; resolvedEz = near.gz;
    }

    // ✅ A* utama
    let rawGridPath = this._astar(sx, sz, resolvedEx, resolvedEz);

    // ✅ UPGRADE: Greedy fallback jika A* gagal
    if (rawGridPath.length === 0) {
      console.warn('[Pathfinding] A* gagal → coba Greedy fallback...');
      rawGridPath = greedyPath(grid, sx, sz, resolvedEx, resolvedEz, this.diagonal);
    }

    if (rawGridPath.length === 0) {
      this._showToast(`<img src="${BASE}icons/x.svg" class="hud-icon"> Tidak ada jalur ke tujuan!`, '#ff4444');
      this._updateHUDStatus(`<img src="${BASE}icons/x.svg" class="hud-icon"> Tidak ada jalur`);
      if (this.onNoPath) this.onNoPath();
      return [];
    }

    // ✅ UPGRADE: Smooth dengan line-of-sight (tidak potong sudut gedung)
    const gridPath  = this.smooth ? smoothPath(rawGridPath, grid) : rawGridPath;

    // Path altitude = drone's current Y (biar sesuai ketinggian drone)
    const flyY = this.drone ? this.drone.position.y : this.droneAltitude;

    const worldPath = gridPath.map(({ gx, gz }) => {
      const wp = grid.gridToWorld(gx, gz);
      return new THREE.Vector3(wp.x, flyY, wp.z);
    });

    if (worldPath.length > 0) {
      worldPath[0].set(worldStart.x, flyY, worldStart.z);
      worldPath[worldPath.length - 1].set(worldEnd.x, flyY, worldEnd.z);
    }

    return worldPath;
  }

  /**
   * ✅ UPGRADE: Rebuild semua segmen jalur dari waypoints yang ada
   * Dipanggil setiap ada perubahan waypoint
   */
  _rebuildAllSegments() {
    this._currentPath = [];
    this._segments    = [];

    if (this._waypoints.length === 0) {
      this._clearPathVisual();
      this._clearWaypointMarkers();
      this._targetMarker.visible = false;
      this._updateHUDStatus(`<img src="${BASE}icons/mouse-left (1).svg" class="hud-icon"> Klik untuk set tujuan`);
      return;
    }

    const dronePos = this.drone
      ? this.drone.position.clone()
      : new THREE.Vector3(0, this.droneAltitude, 0);

    const allStops = [dronePos, ...this._waypoints.map(w => w.world)];

    for (let i = 0; i < allStops.length - 1; i++) {
      const seg = this.findPath(allStops[i], allStops[i + 1]);
      if (seg.length > 0) {
        this._segments.push(seg);
        // Hindari duplikat titik di sambungan segmen
        if (i > 0 && this._currentPath.length > 0) {
          this._currentPath.push(...seg.slice(1));
        } else {
          this._currentPath.push(...seg);
        }
      }
    }

    if (this._currentPath.length > 0) {
      this._drawAllSegments();
      const last = this._waypoints[this._waypoints.length - 1].world;
      this._targetMarker.position.set(last.x, 0.15, last.z);
      this._targetMarker.visible = true;

      const totalWP = this._currentPath.length;
      const stops   = this._waypoints.length;
      this._showToast(`<img src="${BASE}icons/check.svg" class="hud-icon"> ${stops} tujuan — ${totalWP} waypoints total`, '#00bfff');
      this._updateHUDFull();

      if (this.onPathFound) this.onPathFound(this._currentPath);
    } else {
      this._showToast(`<img src="${BASE}icons/x.svg" class="hud-icon"> Tidak ada jalur!`, '#ff4444');
    }
  }

  /**
   * ✅ UPGRADE: Dynamic obstacle — rebuild walkability grid
   * Dipanggil kalau ada gedung baru muncul / hilang saat runtime
   * @param {Array<{gx,gz,value}>} changes — array perubahan cell
   */
  rebuildObstacles(changes = []) {
    for (const { gx, gz, value } of changes) {
      this.grid.setCell(gx, gz, value);
    }
    // Recalculate semua jalur yang ada
    if (this._waypoints.length > 0) {
      this._showToast(`<img src="${BASE}icons/rotate-ccw.svg" class="hud-icon"> Obstacle berubah — recalculate jalur...`, '#ffaa00');
      this._rebuildAllSegments();
    }
  }

  clearPath() {
    this._waypoints = [];
    this._currentPath = [];
    this._segments    = [];
    this._activeSegIdx = 0;
    this._clearPathVisual();
    this._clearWaypointMarkers();
    this._targetMarker.visible = false;
    this._updateHUDStatus(`<img src="${BASE}icons/mouse-left (1).svg" class="hud-icon"> Klik untuk set tujuan`);
  }

  getCurrentPath()    { return this._currentPath; }
  getWaypoints()      { return this._waypoints; }
  getSegments()       { return this._segments; }
  getDroneAltitude()  { return this.droneAltitude; }

  /**
   * Public API: handle ground click (dipanggil InputSystem)
   * @param {PointerEvent} event
   * @param {boolean} addToQueue — Shift+klik
   * @returns {boolean} true jika klik valid
   */
  handleGroundClick(event, addToQueue = false) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this.camera);

    const hitPoint = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, hitPoint);
    if (!hit) return false;

    const { gx, gz } = this.grid.worldToGrid(hitPoint.x, hitPoint.z);
    if (!this.grid.inBounds(gx, gz)) {
      this._showToast(`<img src="${BASE}icons/triangle-alert.svg" class="hud-icon"> Klik di dalam area kota!`, '#ffaa00');
      return false;
    }

    const targetY = this.drone ? this.drone.position.y : this.droneAltitude;
    const worldTarget = new THREE.Vector3(hitPoint.x, targetY, hitPoint.z);
    if (this.onTargetClick) this.onTargetClick(worldTarget);

    if (addToQueue) {
      this._waypoints.push({ gx, gz, world: worldTarget });
      this._showToast(`<img src="${BASE}icons/navigation.svg" class="hud-icon"> Waypoint ${this._waypoints.length} ditambahkan`, '#00ffcc');
    } else {
      this._waypoints = [{ gx, gz, world: worldTarget }];
    }

    this._rebuildAllSegments();
    return true;
  }

  /** Public: hapus waypoint terakhir */
  removeLastWaypoint() {
    if (this._waypoints.length === 0) return;
    this._waypoints.pop();
    this._rebuildAllSegments();
    this._showToast(`<img src="${BASE}icons/undo-2.svg" class="hud-icon"> Waypoint terakhir dihapus`, '#ffaa00');
  }

  /**
   * Public: sesuaikan ketinggian visual jalur dengan Y drone
   * Supaya path visual ikut naik/turun saat mode MANUAL.
   */
  setPathAltitude(newY) {
    if (this._currentPath.length === 0) return;
    const currentY = this._currentPath[0].y;
    if (Math.abs(newY - currentY) < 0.01) return;

    for (const wp of this._waypoints) wp.world.y = newY;
    for (const seg of this._segments) {
      for (const v of seg) v.y = newY;
    }
    for (const v of this._currentPath) v.y = newY;

    this._drawAllSegments();
    if (this._waypoints.length > 0) {
      const last = this._waypoints[this._waypoints.length - 1].world;
      this._targetMarker.position.set(last.x, 0.15, last.z);
    }
  }

  dispose() {
    if (this._onPointerDown) {
      this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
      this.renderer.domElement.removeEventListener('pointerup',   this._onPointerUp);
      window.removeEventListener('keydown', this._onKeyDown);
    }
    this._clearPathVisual();
    this.scene.remove(this._pathGroup);
    this.scene.remove(this._targetMarker);
    this.scene.remove(this._waypointMarkers);
    if (this._hud?.parentNode) this._hud.parentNode.removeChild(this._hud);
    if (this._toastEl?.parentNode) this._toastEl.parentNode.removeChild(this._toastEl);
  }

  // ========================
  //   INPUT HANDLING
  // ========================

  _handlePointerDown(e) {
    this._mouseDownPos.x = e.clientX;
    this._mouseDownPos.y = e.clientY;
    this._mouseDownTime  = Date.now();
  }

  _handlePointerUp(e) {
    const dx      = Math.abs(e.clientX - this._mouseDownPos.x);
    const dy      = Math.abs(e.clientY - this._mouseDownPos.y);
    const elapsed = Date.now() - this._mouseDownTime;

    if (dx > this._DRAG_THRESHOLD && dy > this._DRAG_THRESHOLD && elapsed > this._TAP_MAX_MS) return;

    const isShift = e.shiftKey; // ✅ UPGRADE: Shift+klik = tambah waypoint
    this._processClick(e, isShift);
  }

  _handleKeyDown(e) {
    // ESC = hapus semua waypoint
    if (e.key === 'Escape') {
      this.clearPath();
      this._showToast(`<img src="${BASE}icons/trash-2.svg" class="hud-icon"> Jalur dihapus`, '#aaaaaa');
    }
    // Backspace = hapus waypoint terakhir
    if (e.key === 'Backspace' && this._waypoints.length > 0) {
      this._waypoints.pop();
      this._rebuildAllSegments();
      this._showToast(`<img src="${BASE}icons/undo-2.svg" class="hud-icon"> Waypoint terakhir dihapus`, '#ffaa00');
    }
  }

  _processClick(event, addToQueue = false) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this.camera);

    const hitPoint = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, hitPoint);
    if (!hit) return;

    const { gx, gz } = this.grid.worldToGrid(hitPoint.x, hitPoint.z);
    if (!this.grid.inBounds(gx, gz)) {
      this._showToast(`<img src="${BASE}icons/triangle-alert.svg" class="hud-icon"> Klik di dalam area kota!`, '#ffaa00');
      return;
    }

    const targetY = this.drone ? this.drone.position.y : this.droneAltitude;
    const worldTarget = new THREE.Vector3(hitPoint.x, targetY, hitPoint.z);
    if (this.onTargetClick) this.onTargetClick(worldTarget);

    if (addToQueue) {
      // ✅ Shift+klik → tambah ke antrian
      this._waypoints.push({ gx, gz, world: worldTarget });
      this._showToast(`<img src="${BASE}icons/navigation.svg" class="hud-icon"> Waypoint ${this._waypoints.length} ditambahkan`, '#00ffcc');
    } else {
      // Klik biasa → ganti semua tujuan
      this._waypoints = [{ gx, gz, world: worldTarget }];
    }

    this._rebuildAllSegments();
  }

  // ========================
  //   A* ALGORITHM
  // ========================

  _astar(sx, sz, ex, ez) {
    const grid = this.grid;
    const heap = this._heap;
    const pool = this._pool;

    heap.clear();

    if (sx === ex && sz === ez) return [{ gx: sx, gz: sz }];

    const gScore   = new Map();
    const closed   = new Set();
    const allNodes = [];

    const h0        = heuristicEuclidean(sx, sz, ex, ez);
    const startNode = pool.get(sx, sz, 0, h0, null);
    gScore.set(`${sx},${sz}`, 0);
    heap.push(startNode);
    allNodes.push(startNode);

    const dirs = this._getDirs();

    while (heap.size > 0) {
      const cur = heap.pop();
      const key = `${cur.gx},${cur.gz}`;

      if (closed.has(key)) continue;
      closed.add(key);

      if (cur.gx === ex && cur.gz === ez) {
        const path = this._reconstructPath(cur);
        pool.releaseAll(allNodes);
        return path;
      }

      for (const [dx, dz, cost] of dirs) {
        const nx   = cur.gx + dx;
        const nz   = cur.gz + dz;
        const nKey = `${nx},${nz}`;

        if (!grid.inBounds(nx, nz))   continue;
        if (!grid.isWalkable(nx, nz)) continue;
        if (closed.has(nKey))         continue;

        if (dx !== 0 && dz !== 0) {
          if (!grid.isWalkable(cur.gx + dx, cur.gz)) continue;
          if (!grid.isWalkable(cur.gx, cur.gz + dz)) continue;
        }

        const tentG    = cur.g + cost;
        const existG   = gScore.get(nKey) ?? Infinity;

        if (tentG < existG) {
          gScore.set(nKey, tentG);
          const node = pool.get(nx, nz, tentG, heuristicEuclidean(nx, nz, ex, ez), cur);
          heap.push(node);
          allNodes.push(node);
        }
      }
    }

    pool.releaseAll(allNodes);
    return [];
  }

  _reconstructPath(node) {
    const path = [];
    let cur = node;
    while (cur) { path.unshift({ gx: cur.gx, gz: cur.gz }); cur = cur.parent; }
    return path;
  }

  _getDirs() {
    const base = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1]];
    if (this.diagonal) {
      const s2 = 1.41421;
      base.push([1,1,s2],[-1,1,s2],[1,-1,s2],[-1,-1,s2]);
    }
    return base;
  }

  _findNearestWalkable(gx, gz, maxR = 6) {
    for (let r = 1; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = gx + dx, nz = gz + dz;
          if (this.grid.inBounds(nx, nz) && this.grid.isWalkable(nx, nz))
            return { gx: nx, gz: nz };
        }
      }
    }
    return null;
  }

  // ========================
  //   VISUAL
  // ========================

  // Warna kontras: oranye terang → kuning → hijau-kuning
  _segmentColor(idx, total) {
    const t = total <= 1 ? 0 : idx / (total - 1);
    const r = Math.round(lerp(0xff, 0xcc, t));
    const g = Math.round(lerp(0x55, 0xff, t));
    const b = Math.round(lerp(0x00, 0x44, t));
    return (r << 16) | (g << 8) | b;
  }

  _drawAllSegments() {
    this._clearPathVisual();
    this._clearWaypointMarkers();

    const total = this._segments.length;

    this._segments.forEach((seg, idx) => {
      if (seg.length < 2) return;
      const color = this._segmentColor(idx, total);

      const curve = new THREE.CatmullRomCurve3(seg, false, 'catmullrom', 0.5);
      const pts   = curve.getPoints(Math.max(seg.length * 8, 40));

      // Tube jalur
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.07, 8, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      tube.name = `PathTube_${idx}`;
      this._pathGroup.add(tube);

      // Glow line
      const glow = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 })
      );
      this._pathGroup.add(glow);

      // Vertical drop di akhir segmen
      const end = seg[seg.length - 1];
      const dropPts = [
        new THREE.Vector3(end.x, 0.2, end.z),
        new THREE.Vector3(end.x, this.droneAltitude, end.z),
      ];
      const drop = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(dropPts),
        new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.2, transparent: true, opacity: 0.5 })
      );
      drop.computeLineDistances();
      this._pathGroup.add(drop);
    });

    // ✅ UPGRADE: Numbered waypoint markers
    this._waypoints.forEach((wp, idx) => {
      this._addWaypointMarker(wp.world, idx + 1, this._segmentColor(idx, total));
    });
  }

  _addWaypointMarker(worldPos, number, color) {
    const g = new THREE.Group();

    // Glow outer sphere
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
    );
    glow.position.copy(worldPos);
    g.add(glow);

    // Core sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({ color })
    );
    sphere.position.copy(worldPos);
    g.add(sphere);

    // Neon ring di sekeliling sphere
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.45, 24),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    ring.position.copy(worldPos);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);

    // Vertical pole ke ground — glow
    const polePts = [
      new THREE.Vector3(worldPos.x, 0.2, worldPos.z),
      new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z),
    ];
    const pole = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(polePts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })
    );
    pole.name = 'WPPole';
    g.add(pole);

    g.name = `WPMarker_${number}`;
    this._waypointMarkers.add(g);
  }

  _clearPathVisual() {
    while (this._pathGroup.children.length > 0) {
      const c = this._pathGroup.children[0];
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      this._pathGroup.remove(c);
    }
  }

  _clearWaypointMarkers() {
    while (this._waypointMarkers.children.length > 0) {
      const c = this._waypointMarkers.children[0];
      c.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._waypointMarkers.remove(c);
    }
  }

  _createTargetMarker() {
    const g = new THREE.Group();
    g.name  = 'TargetMarker';
    g.visible = false;

    const TARGET_COLOR = 0xff5500;

    // Beam vertikal — sinar terang dari ground ke altitude drone
    const beamPts = [
      new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(0, 20, 0),
    ];
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(beamPts),
      new THREE.LineBasicMaterial({ color: TARGET_COLOR, transparent: true, opacity: 0.15 })
    );
    beam.name = 'TargetBeam';
    g.add(beam);

    // Beam glow — garis yang lebih terang di tengah
    const beamGlow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(beamPts),
      new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.08 })
    );
    beamGlow.name = 'TargetBeamGlow';
    g.add(beamGlow);

    // Ring luar besar dengan pulsing
    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.4, 48),
      new THREE.MeshBasicMaterial({ color: TARGET_COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ringOuter.rotation.x = -Math.PI / 2;
    ringOuter.name = 'TargetRingOuter';
    ringOuter.position.y = 0.05;
    g.add(ringOuter);

    // Ring dalam
    const ringInner = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 36),
      new THREE.MeshBasicMaterial({ color: 0xff7700, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ringInner.rotation.x = -Math.PI / 2;
    ringInner.name = 'TargetRingInner';
    ringInner.position.y = 0.1;
    g.add(ringInner);

    // Center dot — putih terang
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.15;
    g.add(dot);

    return g;
  }

  // ========================
  //   HUD
  // ========================

  _createHUD() {
    const hud = document.createElement('div');
    hud.id = 'pathfinding-hud';

    Object.assign(hud.style, {
      position:      'fixed',
      bottom:        '20px',
      left:          '50%',
      transform:     'translateX(-50%)',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           '6px',
      zIndex:        '100',
      pointerEvents: 'none',
      fontFamily:    `'Segoe UI', system-ui, sans-serif`,
    });

    hud.innerHTML = `
      <div id="pf-controls" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <span id="pf-hint"><img src="${BASE}icons/mouse-left (1).svg" class="hud-icon"> Klik = set tujuan &nbsp;|&nbsp; Shift+Klik = tambah waypoint &nbsp;|&nbsp; ESC = reset &nbsp;|&nbsp; Backspace = hapus terakhir</span>
      </div>
      <div id="pf-status"></div>
      <div id="pf-waypoints" style="display:none"></div>
    `;

    const baseStyle = `
      background:rgba(0,10,30,0.78);
      backdrop-filter:blur(8px);
      border:1px solid rgba(0,191,255,0.4);
      border-radius:8px;
      padding:6px 16px;
      color:#00bfff;
      font-size:12px;
      font-weight:500;
      text-align:center;
    `;
    hud.querySelectorAll('div, span').forEach(el => el.setAttribute('style', el.getAttribute('style') + ';' + baseStyle));
    document.body.appendChild(hud);

    // Toast
    this._toastEl = document.createElement('div');
    Object.assign(this._toastEl.style, {
      position:   'fixed', top: '20px', left: '50%',
      transform:  'translateX(-50%)', zIndex: '200',
      pointerEvents: 'none', transition: 'opacity 0.4s ease', opacity: '0',
      fontFamily: `'Segoe UI', system-ui, sans-serif`,
    });
    document.body.appendChild(this._toastEl);

    return hud;
  }

  _showToast(msg, color = '#00bfff') {
    Object.assign(this._toastEl.style, {
      background: 'rgba(0,10,30,0.88)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${color}`,
      borderRadius: '10px',
      padding: '10px 22px',
      color, fontSize: '14px', fontWeight: '600', opacity: '1',
    });
    this._toastEl.innerHTML = msg;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this._toastEl.style.opacity = '0'; }, 3000);
  }

  _updateHUDStatus(text) {
    const el = document.getElementById('pf-status');
    if (el) { el.innerHTML = text; el.style.display = 'block'; }
  }

  _updateHUDFull() {
    const status = document.getElementById('pf-status');
    const wpEl   = document.getElementById('pf-waypoints');

    if (status) {
      status.innerHTML = `<img src="${BASE}icons/plane.svg" class="hud-icon"> ${this._waypoints.length} tujuan — ${this._currentPath.length} waypoints total`;
      status.style.color = '#00ffcc';
    }
    if (wpEl && this._waypoints.length > 1) {
      wpEl.innerHTML = `<img src="${BASE}icons/navigation.svg" class="hud-icon"> ` + this._waypoints.map((_, i) => `Stop ${i + 1}`).join(' → ');
      wpEl.style.display = 'block';
    } else if (wpEl) {
      wpEl.style.display = 'none';
    }
  }

  // ========================
  //   UPDATE LOOP
  // ========================

  update(delta) {
    if (this._targetMarker.visible) {
      this._targetMarker.rotation.y += delta * 1.8;
      const t = Date.now() * 0.003;
      const outer = this._targetMarker.getObjectByName('TargetRingOuter');
      if (outer) outer.material.opacity = 0.5 + 0.45 * Math.abs(Math.sin(t));
      // Update beam height mengikuti drone altitude
      const beam = this._targetMarker.getObjectByName('TargetBeam');
      const beamGlow = this._targetMarker.getObjectByName('TargetBeamGlow');
      if (beam) {
        const pts = [new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, this.droneAltitude, 0)];
        beam.geometry.dispose();
        beam.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        beam.position.y = 0;
      }
      if (beamGlow) {
        const pts = [new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, this.droneAltitude, 0)];
        beamGlow.geometry.dispose();
        beamGlow.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        beamGlow.position.y = 0;
      }
    }

    // Pulse semua tube
    const t = Date.now() * 0.0018;
    this._pathGroup.children.forEach(child => {
      if (child.name?.startsWith('PathTube') && child.material) {
        child.material.opacity = 0.75 + 0.15 * Math.sin(t);
      }
    });
  }
}

// Local lerp helper
function lerp(a, b, t) { return a + (b - a) * t; }
