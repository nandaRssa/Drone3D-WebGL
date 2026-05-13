import * as THREE from 'three';
import './style.css';
import { SceneManager } from './world/SceneManager.js';
import { PathfindingSystem } from './pathfinding/PathfindingSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { InputSystem } from './systems/InputSystem.js';
import { NavigationSystem } from './systems/NavigationSystem.js';
import { FPVCameraController } from './systems/FPVCameraController.js';

const world = new SceneManager({
  gridCols: 20,
  gridRows: 20,
  cellSize: 2,
  roadInterval: 4,
  spawnChance: 0.70,
});

world.mount(document.body);

// ========== PATHFINDING SYSTEM ==========
const pathfinding = new PathfindingSystem(world, {
  droneAltitude: 7,
  diagonal: false,
  smooth: true,
  handleInput: false,
});

// ========== MOVEMENT SYSTEM ==========
const movement = new MovementSystem({
  drone: world.drone,
  grid: world.getGrid(),
  scene: world.getScene(),
  pathfindingSystem: pathfinding,
  buildings: world.buildings,
});

// ========== NAVIGATION SYSTEM ==========
const navigation = new NavigationSystem({
  drone: world.drone,
  pathfindingSystem: pathfinding,
  movementSystem: movement,
  scene: world.getScene(),
});

// ========== INPUT SYSTEM ==========
const input = new InputSystem({
  renderer: world.getRenderer(),
  camera: world.getCamera(),
  pathfindingSystem: pathfinding,
  movementSystem: movement,
  sceneManager: world,
});

// ========== CAMERA SYSTEM ==========
const cameraController = new FPVCameraController({
  drone: world.drone,
  camera: world.getCamera(),
  scene: world.getScene(),
  movementSystem: movement,
});

// ========== HUD ==========
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <!-- TOP BAR -->
  <div id="hud-bar">
    <div id="hud-left">
      <!-- Flight Mode -->
      <div class="hud-module">
        <div class="module-label">Flight Mode</div>
        <div class="module-value" id="badge-mode">
          <img src="/icons/plane.svg"> AUTO PILOT
        </div>
      </div>
      <!-- Status -->
      <div class="hud-module">
        <div class="module-label">Status</div>
        <div class="module-value" id="badge-nav">
          <img src="/icons/navigation.svg"> ON PATH
        </div>
      </div>
      <!-- Camera Mode -->
      <div class="hud-module">
        <div class="module-label">Camera</div>
        <div class="module-value" id="badge-camera">
          <img src="/icons/camera.svg"> THIRD PERSON
        </div>
      </div>
    </div>

    <!-- Center Telemetry -->
    <div id="hud-center">
      <div class="telemetry-block">
        <span id="status-alt">ALT: 7.0</span>
        <span class="telemetry-sep">&nbsp;|&nbsp;</span>
        <span id="status-speed">SPD: 3.5</span>
      </div>
    </div>

    <!-- Right: FPS -->
    <div id="hud-right">
      <span id="fps-counter">FPS: 0</span>
      <div class="fps-bars">
        <div class="fps-bar"></div>
        <div class="fps-bar"></div>
        <div class="fps-bar"></div>
        <div class="fps-bar"></div>
      </div>
      <!-- hidden speed slider (kept for logic) -->
      <div id="speed-control" style="display:none">
        <input type="range" id="speed-slider" min="0.5" max="10" step="0.5" value="3.5">
        <span id="speed-val">3.5</span>
      </div>
    </div>
  </div>

  <!-- BOTTOM LEFT: NAVIGATION CONTROLS -->
  <div class="hud-panel" id="nav-controls-panel">
    <div class="panel-header">Navigation Controls</div>
    <div class="ctrl-row">
      <img src="/icons/mouse-left (1).svg" class="ctrl-icon">
      <span class="ctrl-key">LMB</span>
      <span class="ctrl-desc">Set Target</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/mouse.svg" class="ctrl-icon">
      <span class="ctrl-key">SHIFT + LMB</span>
      <span class="ctrl-desc">Add Waypoint</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/undo-2.svg" class="ctrl-icon">
      <span class="ctrl-key">BACKSPACE</span>
      <span class="ctrl-desc">Remove Last</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/x.svg" class="ctrl-icon">
      <span class="ctrl-key">ESC</span>
      <span class="ctrl-desc">Reset Route</span>
    </div>
  </div>

  <!-- BOTTOM CENTER: MISSION STATUS -->
  <div class="hud-panel" id="mission-panel">
    <img src="/icons/plane.svg" class="mission-drone-icon">
    <div class="mission-title">Mission Status</div>
    <div class="mission-stats">
      <div class="mission-row">
        <span class="mission-key">TARGETS</span>
        <span class="mission-val" id="mission-targets">0</span>
      </div>
      <div class="mission-row">
        <span class="mission-key">WAYPOINTS</span>
        <span class="mission-val" id="mission-waypoints">0</span>
      </div>
    </div>
    <div class="mission-route">
      <div class="route-dot idle" id="route-dot"></div>
      <span>ROUTE STATUS :&nbsp;</span>
      <span class="route-status-text idle" id="route-status">IDLE</span>
    </div>
  </div>

  <!-- BOTTOM RIGHT: CAMERA CONTROLS -->
  <div class="hud-panel" id="cam-controls-panel">
    <div class="panel-header">Camera Controls</div>
    <div class="ctrl-row">
      <img src="/icons/mouse.svg" class="ctrl-icon">
      <span class="ctrl-key">DRAG</span>
      <span class="ctrl-desc">Rotate Camera</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/mouse.svg" class="ctrl-icon">
      <span class="ctrl-key">SCROLL</span>
      <span class="ctrl-desc">Zoom In / Out</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/camera.svg" class="ctrl-icon">
      <span class="ctrl-key">C</span>
      <span class="ctrl-desc">Switch Camera</span>
    </div>
    <div class="ctrl-row">
      <img src="/icons/plane.svg" class="ctrl-icon">
      <span class="ctrl-key">M</span>
      <span class="ctrl-desc">Toggle Mode</span>
    </div>
  </div>

  <!-- ARRIVAL POPUP -->
  <div id="arrival-popup">
    <div id="arrival-icon"><img src="/icons/target.svg" class="hud-icon-arrival"></div>
    <div id="arrival-text">Tujuan Tercapai!</div>
    <div id="arrival-sub">Drone telah sampai di tujuan</div>
  </div>

  <!-- keep for legacy references -->
  <div id="waypoint-info">
    <span id="wp-distance">—</span>
    <span id="wp-remaining">—</span>
  </div>
  <div id="controls-guide"><div id="guide-content"><span id="guide-text"></span></div></div>
`;
document.body.appendChild(hud);

// ========== ELEMENT REFS ==========
const badgeMode       = document.getElementById('badge-mode');
const badgeNav        = document.getElementById('badge-nav');
const badgeCamera     = document.getElementById('badge-camera');
const speedSlider     = document.getElementById('speed-slider');
const speedVal        = document.getElementById('speed-val');
const arrivalPopup    = document.getElementById('arrival-popup');
const fpsCounter      = document.getElementById('fps-counter');
const statusAlt       = document.getElementById('status-alt');
const statusSpeed     = document.getElementById('status-speed');
const wpDistance      = document.getElementById('wp-distance');
const wpRemaining     = document.getElementById('wp-remaining');
const missionTargets  = document.getElementById('mission-targets');
const missionWpts     = document.getElementById('mission-waypoints');
const routeStatus     = document.getElementById('route-status');
const routeDot        = document.getElementById('route-dot');

// ========== SPEED SLIDER ==========
speedSlider.addEventListener('input', () => {
  const v = parseFloat(speedSlider.value);
  speedVal.textContent = v.toFixed(1);
  movement.speed = v;
});

// ========== PATHFINDING CALLBACKS ==========
pathfinding.onPathFound = (worldPath) => {
  if (movement.mode === 'AUTO') {
    movement.setPath(worldPath);
  }
};

pathfinding.onNoPath = () => {
  setRouteStatus('warning');
  setTimeout(() => setRouteStatus('idle'), 2500);
};

// ========== MODE TOGGLE ==========
input._onModeChange = (newMode) => {
  if (newMode === 'AUTO') {
    badgeMode.innerHTML = '<img src="/icons/plane.svg"> AUTO PILOT';
    badgeMode.className = 'module-value';
    movement.setPath(pathfinding.getCurrentPath());
  } else {
    badgeMode.innerHTML = '<img src="/icons/plane.svg"> MANUAL';
    badgeMode.className = 'module-value manual-mode';
    movement.clearPath();
  }
};

// ========== NAVIGATION CALLBACKS ==========
navigation.onStatusChange = (status) => {
  if (status === 'ON_PATH') {
    badgeNav.innerHTML = '<img src="/icons/navigation.svg"> ON PATH';
    badgeNav.className = 'module-value status-onpath';
    setRouteStatus('active');
  } else if (status === 'WARNING') {
    badgeNav.innerHTML = '<img src="/icons/triangle-alert.svg"> WARNING';
    badgeNav.className = 'module-value status-warning';
    setRouteStatus('warning');
  } else {
    badgeNav.innerHTML = '<img src="/icons/x.svg"> RESET';
    badgeNav.className = 'module-value status-reset';
    setRouteStatus('idle');
  }
};

navigation.onReset = () => {
  setRouteStatus('warning');
  setTimeout(() => setRouteStatus('idle'), 2000);
};

// ========== MOVEMENT CALLBACKS ==========
movement.onArrived = () => {
  arrivalPopup.classList.add('show');
  badgeNav.innerHTML = '<img src="/icons/check.svg"> ARRIVED';
  badgeNav.className = 'module-value status-arrived';
  setRouteStatus('idle');
  setTimeout(() => arrivalPopup.classList.remove('show'), 3500);
};

movement.onStateChange = (state) => {
  if (state === 'MOVING') {
    badgeNav.innerHTML = '<img src="/icons/navigation.svg"> ON PATH';
    badgeNav.className = 'module-value status-onpath';
    setRouteStatus('active');
  }
};

// ========== CAMERA TOGGLE ==========
input._onCameraToggle = () => {
  cameraController.toggleMode();
  if (cameraController.mode === 'FPV') {
    badgeCamera.innerHTML = '<img src="/icons/camera.svg"> FPV';
  } else {
    badgeCamera.innerHTML = '<img src="/icons/camera.svg"> THIRD PERSON';
  }
};

// ========== ROUTE STATUS HELPER ==========
function setRouteStatus(state) {
  routeDot.className    = `route-dot ${state}`;
  routeStatus.className = `route-status-text ${state}`;
  routeStatus.textContent = state === 'active' ? 'ACTIVE'
    : state === 'warning' ? 'WARNING'
    : 'IDLE';
}

// ========== EXPOSE GLOBALS ==========
window.skyPathWorld    = world;
window.skyPathFinding  = pathfinding;
window.skyPathMovement = movement;

// ========== FPS TRACKING ==========
let frameCount = 0;
let fpsTimer   = 0;

// ========== ANIMATION LOOP ==========
let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);

  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  world.update(delta);
  pathfinding.update(delta);
  movement.update(delta);
  cameraController.update(delta);

  const pos = world.drone.position;

  if (movement.mode === 'MANUAL') {
    pathfinding.setPathAltitude(pos.y);
  }

  if (movement.mode === 'MANUAL') {
    const path = pathfinding.getCurrentPath();
    if (path.length > 0) {
      const lastWp = path[path.length - 1];
      const dist = pos.distanceTo(new THREE.Vector3(lastWp.x, pos.y, lastWp.z));
      if (dist < movement.arrivalDistance) {
        if (!window._manualArrived) {
          window._manualArrived = true;
          arrivalPopup.classList.add('show');
          badgeNav.innerHTML = '<img src="/icons/check.svg"> ARRIVED';
          badgeNav.className = 'module-value status-arrived';
          setRouteStatus('idle');
          setTimeout(() => arrivalPopup.classList.remove('show'), 3500);
        }
      } else {
        window._manualArrived = false;
      }
    }
  }

  navigation.update(delta);
  world.render();

  // Telemetry
  statusAlt.textContent   = `ALT: ${pos.y.toFixed(1)}`;
  statusSpeed.textContent = `SPD: ${movement.speed.toFixed(1)}`;

  // Mission status panel
  const wps = pathfinding.getWaypoints ? pathfinding.getWaypoints() : [];
  const currentPath = pathfinding.getCurrentPath();
  missionTargets.textContent = wps.length;
  missionWpts.textContent    = currentPath.length;

  if (movement.mode === 'AUTO' && movement.state === 'MOVING' && currentPath.length > 0) {
    const remaining = currentPath.length - movement.pathIndex;
    const next = currentPath[movement.pathIndex];
    if (next) {
      wpDistance.textContent  = `${pos.distanceTo(next).toFixed(1)}m`;
      wpRemaining.textContent = `${remaining} WP`;
    }
  } else {
    wpDistance.textContent  = '—';
    wpRemaining.textContent = '—';
  }

  // FPS
  frameCount++;
  fpsTimer += delta;
  if (fpsTimer >= 0.5) {
    const fps = Math.round(frameCount / fpsTimer);
    fpsCounter.textContent = `FPS: ${fps}`;
    frameCount = 0;
    fpsTimer   = 0;
  }
}

requestAnimationFrame(animate);
