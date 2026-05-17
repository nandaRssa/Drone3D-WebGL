import * as THREE from 'three';

export class FPVCameraController {

  constructor(options = {}) {

    const {
      drone = null,
      camera = null,
      scene = null,
      movementSystem = null,
      orbitControls = null,
    } = options;

    this.drone = drone;
    this.camera = camera;
    this.scene = scene;
    this.movementSystem = movementSystem;
    this.orbitControls = orbitControls;

    if (!this.drone || !this.camera || !this.scene) {
      console.warn('[FPVCameraController] Missing references');
    }

    this.mode = 'THIRD_PERSON';
    this.prevMode = 'THIRD_PERSON';
    this.isTransitioning = false;
    this.transitionProgress = 0.0;
    this.transitionDuration = 0.5;

    this.lerpSpeed = 0.25;
    this.slerpSpeed = 0.2;

    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.startPosition = this.camera.position.clone();
    this.startQuaternion = this.camera.quaternion.clone();

    // Offset kamera dari drone (world-space)
    this._savedOffset = new THREE.Vector3();
    this._savedOffset.copy(this.camera.position).sub(this.drone.position);

    this.thirdPersonOffset = new THREE.Vector3(0, 35, 50);
    this.fpvOffset = new THREE.Vector3(0, 0.5, -0.2);

    this._worldOffset = new THREE.Vector3();
    this._tempCamera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 800
    );

    console.log('[FPVCameraController] Initialized');
  }

  // =====================================
  // PRE-UPDATE — sebelum controls.update()
  // Reposisi kamera ke drone + offset terakhir
  // agar controls.update() menghitung spherical
  // dari posisi yang benar
  // =====================================

  preUpdate(dt) {
    if (!this.drone || !this.camera) return;

    // Hanya di THIRD_PERSON stabil (tidak sedang transisi)
    if (this.mode === 'THIRD_PERSON' && !this.isTransitioning) {
      this.camera.position.copy(this.drone.position).add(this._savedOffset);
    }
  }

  // =====================================
  // UPDATE — setelah controls.update()
  // Simpan offset (THIRD), override (FPV), atau transisi
  // =====================================

  update(dt) {
    if (!this.drone || !this.camera) return;

    if (this.isTransitioning) {
      this._handleTransition(dt);
    } else if (this.mode === 'THIRD_PERSON') {
      this._updateThirdPerson(dt);
    } else if (this.mode === 'FPV') {
      this._updateFPV(dt);
    }
  }

  toggleMode() {
    const newMode = this.mode === 'THIRD_PERSON' ? 'FPV' : 'THIRD_PERSON';
    this.setMode(newMode);
  }

  setMode(newMode) {
    if (newMode === this.mode) return;

    this.prevMode = this.mode;
    this.mode = newMode;
    this.isTransitioning = true;
    this.transitionProgress = 0.0;
    this.startPosition = this.camera.position.clone();
    this.startQuaternion = this.camera.quaternion.clone();

    if (this.orbitControls) {
      this.orbitControls.enabled = (this.mode === 'THIRD_PERSON');
      if (this.mode === 'THIRD_PERSON') {
        // Saat masuk THIRD_PERSON, set offset dari posisi start transisi
        this._savedOffset.copy(this.startPosition).sub(this.drone.position);
      }
    }

    console.log(`[FPVCameraController] Switching to ${newMode}`);
  }

  // =====================================
  // THIRD PERSON — simpan offset hasil controls.update()
  // =====================================

  _updateThirdPerson(dt) {
    this._savedOffset.copy(this.camera.position).sub(this.drone.position);
  }

  // =====================================
  // FPV
  // =====================================

  _updateFPV(dt) {
    this.targetPosition = this._getWorldPosition(this.fpvOffset);
    this.camera.position.lerp(this.targetPosition, 0.15);
    this.camera.quaternion.copy(this.drone.quaternion);
  }

  // =====================================
  // TRANSITION
  // =====================================

  _handleTransition(dt) {
    const progressIncrement = (1.0 / this.transitionDuration) * dt;
    this.transitionProgress += progressIncrement;
    if (this.transitionProgress > 1.0) this.transitionProgress = 1.0;

    if (this.mode === 'FPV') {
      this.targetPosition = this._getWorldPosition(this.fpvOffset);
    } else {
      this.targetPosition = this._getWorldPosition(this.thirdPersonOffset);
    }

    this.camera.position.lerpVectors(
      this.startPosition, this.targetPosition, this.transitionProgress
    );

    if (this.mode === 'FPV') {
      this.targetQuaternion.copy(this.drone.quaternion);
    } else {
      this._tempCamera.position.copy(this.camera.position);
      this._tempCamera.lookAt(this.drone.position);
      this.targetQuaternion.copy(this._tempCamera.quaternion);
    }

    this.camera.quaternion.slerpQuaternions(
      this.startQuaternion, this.targetQuaternion, this.transitionProgress
    );

    if (this.transitionProgress >= 1.0) {
      this.isTransitioning = false;
      // Simpan offset dari posisi akhir transisi
      if (this.mode === 'THIRD_PERSON') {
        this._savedOffset.copy(this.camera.position).sub(this.drone.position);
      }
      console.log('[FPVCameraController] Transition completed');
    }
  }

  _getWorldPosition(relativeOffset) {
    this._worldOffset.copy(relativeOffset);
    this._worldOffset.applyQuaternion(this.drone.quaternion);
    this._worldOffset.add(this.drone.position);
    return this._worldOffset;
  }

  dispose() {
  }
}
