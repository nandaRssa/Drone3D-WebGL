export class InputSystem {
  constructor({ renderer, camera, pathfindingSystem, movementSystem, sceneManager }) {
    this.renderer = renderer;
    this.camera = camera;
    this.pathfindingSystem = pathfindingSystem;
    this.movementSystem = movementSystem;
    this.sceneManager = sceneManager;

    this._onModeChange = null;
    this._onCameraToggle = null;

    this._mouseDownPos = { x: 0, y: 0 };
    this._mouseDownTime = 0;

    this._boundPointerDown = this._handlePointerDown.bind(this);
    this._boundPointerUp = this._handlePointerUp.bind(this);
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);

    renderer.domElement.addEventListener('pointerdown', this._boundPointerDown);
    renderer.domElement.addEventListener('pointerup', this._boundPointerUp);
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
  }

  _handlePointerDown(e) {
    if (e.button !== 0) return;
    this._mouseDownPos.x = e.clientX;
    this._mouseDownPos.y = e.clientY;
    this._mouseDownTime = Date.now();
  }

  _handlePointerUp(e) {
    if (e.button !== 0) return;
    const dx = Math.abs(e.clientX - this._mouseDownPos.x);
    const dy = Math.abs(e.clientY - this._mouseDownPos.y);
    const elapsed = Date.now() - this._mouseDownTime;
    if (dx > 15 || dy > 15 || elapsed > 500) return;

    this.pathfindingSystem.handleGroundClick(e, e.shiftKey);
  }

  _handleKeyDown(e) {
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (key === 'm' || key === 'M') {
      this._toggleMode();
      return;
    }
    if (key === 'c' || key === 'C') {
      if (this._onCameraToggle) this._onCameraToggle();
      return;
    }
    if (key === 'r' || key === 'R') {
      if (this.pathfindingSystem.getWaypoints().length > 0) {
        this.pathfindingSystem._rebuildAllSegments();
      }
      return;
    }
    if (key === 'Escape') {
      this.pathfindingSystem.clearPath();
      this.movementSystem.clearPath();
      return;
    }
    if (key === 'Backspace') {
      this.pathfindingSystem.removeLastWaypoint();
      return;
    }

    switch (key) {
      case 'w': case 'W': case 'ArrowUp':
        this.movementSystem.inputState.forward = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
        break;
      case 's': case 'S': case 'ArrowDown':
        this.movementSystem.inputState.backward = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
        break;
      case 'a': case 'A': case 'ArrowLeft':
        this.movementSystem.inputState.rotateLeft = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
        break;
      case 'd': case 'D': case 'ArrowRight':
        this.movementSystem.inputState.rotateRight = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
        break;
      case 'e': case 'E':
        this.movementSystem.inputState.up = true;
        break;
      case 'q': case 'Q':
        this.movementSystem.inputState.down = true;
        break;
      case ' ':
        this.movementSystem.inputState.up = true;
        e.preventDefault();
        break;
      case 'Shift':
        this.movementSystem.inputState.down = true;
        break;
    }
  }

  _handleKeyUp(e) {
    const key = e.key;

    switch (key) {
      case 'w': case 'W': case 'ArrowUp':
        this.movementSystem.inputState.forward = false;
        break;
      case 's': case 'S': case 'ArrowDown':
        this.movementSystem.inputState.backward = false;
        break;
      case 'a': case 'A': case 'ArrowLeft':
        this.movementSystem.inputState.rotateLeft = false;
        break;
      case 'd': case 'D': case 'ArrowRight':
        this.movementSystem.inputState.rotateRight = false;
        break;
      case 'e': case 'E':
        this.movementSystem.inputState.up = false;
        break;
      case 'q': case 'Q':
        this.movementSystem.inputState.down = false;
        break;
      case ' ':
        this.movementSystem.inputState.up = false;
        break;
      case 'Shift':
        this.movementSystem.inputState.down = false;
        break;
    }
  }

  _toggleMode() {
    const newMode = this.movementSystem.mode === 'AUTO' ? 'MANUAL' : 'AUTO';
    this.movementSystem.mode = newMode;
    if (this._onModeChange) this._onModeChange(newMode);
  }

  dispose() {
    this.renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this._boundPointerUp);
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
  }
}
