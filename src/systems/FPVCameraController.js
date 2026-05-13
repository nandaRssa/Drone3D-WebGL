import * as THREE from 'three';

/**
 * FPVCameraController.js
 *
 * FINAL SIMPLE VERSION
 * ====================
 * FPV langsung mengikuti quaternion drone.
 * Fix orientasi dilakukan di MODEL drone,
 * bukan di camera controller.
 */

export class FPVCameraController {

  constructor(options = {}) {

    const {
      drone = null,
      camera = null,
      scene = null,
      movementSystem = null,
    } = options;

    // =====================================
    // REFERENCES
    // =====================================

    this.drone = drone;
    this.camera = camera;
    this.scene = scene;
    this.movementSystem = movementSystem;

    if (!this.drone || !this.camera || !this.scene) {
      console.warn(
        '[FPVCameraController] Missing references'
      );
    }

    // =====================================
    // MODE
    // =====================================

    this.mode = 'THIRD_PERSON';

    this.prevMode = 'THIRD_PERSON';

    this.isTransitioning = false;

    this.transitionProgress = 0.0;

    this.transitionDuration = 0.5;

    // =====================================
    // SMOOTHING
    // =====================================

    this.lerpSpeed = 0.1;

    this.slerpSpeed = 0.08;

    // =====================================
    // TARGETS
    // =====================================

    this.targetPosition =
      new THREE.Vector3();

    this.targetQuaternion =
      new THREE.Quaternion();

    this.startPosition =
      this.camera.position.clone();

    this.startQuaternion =
      this.camera.quaternion.clone();

    // =====================================
    // CAMERA OFFSETS
    // =====================================

    // THIRD PERSON
    this.thirdPersonOffset =
      new THREE.Vector3(0, 6, 8);

    // FPV
    this.fpvOffset =
      new THREE.Vector3(0, 0.5, -0.2);

    // =====================================
    // HELPERS
    // =====================================

    this._worldOffset =
      new THREE.Vector3();

    this._tempCamera =
      new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        800
      );

    console.log(
      '[FPVCameraController] Initialized'
    );
  }

  // =====================================
  // UPDATE
  // =====================================

  update(dt) {

    if (!this.drone || !this.camera) return;

    if (this.isTransitioning) {

      this._handleTransition(dt);

    } else {

      if (this.mode === 'THIRD_PERSON') {

        this._updateThirdPerson(dt);

      } else if (this.mode === 'FPV') {

        this._updateFPV(dt);
      }
    }
  }

  // =====================================
  // TOGGLE MODE
  // =====================================

  toggleMode() {

    const newMode =
      this.mode === 'THIRD_PERSON'
        ? 'FPV'
        : 'THIRD_PERSON';

    this.setMode(newMode);
  }

  setMode(newMode) {

    if (newMode === this.mode) return;

    this.prevMode = this.mode;

    this.mode = newMode;

    this.isTransitioning = true;

    this.transitionProgress = 0.0;

    this.startPosition =
      this.camera.position.clone();

    this.startQuaternion =
      this.camera.quaternion.clone();

    console.log(
      `[FPVCameraController] Switching to ${newMode}`
    );
  }

  // =====================================
  // THIRD PERSON
  // =====================================

  _updateThirdPerson(dt) {

    // POSITION
    this.targetPosition =
      this._getWorldPosition(
        this.thirdPersonOffset
      );

    this.camera.position.lerp(
      this.targetPosition,
      this.lerpSpeed
    );

    // ROTATION
    this._tempCamera.position.copy(
      this.camera.position
    );

    this._tempCamera.lookAt(
      this.drone.position
    );

    this.targetQuaternion.copy(
      this._tempCamera.quaternion
    );

    this.camera.quaternion.slerp(
      this.targetQuaternion,
      this.slerpSpeed
    );
  }

  // =====================================
  // FPV
  // =====================================

  _updateFPV(dt) {

    // POSITION
    this.targetPosition =
      this._getWorldPosition(
        this.fpvOffset
      );

    this.camera.position.lerp(
      this.targetPosition,
      0.15
    );

    // =====================================
    // ROTATION
    // =====================================

    // FPV langsung mengikuti rotasi drone
    this.camera.quaternion.copy(
      this.drone.quaternion
    );
  }

  // =====================================
  // TRANSITION
  // =====================================

  _handleTransition(dt) {

    const progressIncrement =
      (1.0 / this.transitionDuration) * dt;

    this.transitionProgress +=
      progressIncrement;

    if (this.transitionProgress > 1.0) {

      this.transitionProgress = 1.0;
    }

    // POSITION TARGET
    if (this.mode === 'FPV') {

      this.targetPosition =
        this._getWorldPosition(
          this.fpvOffset
        );

    } else {

      this.targetPosition =
        this._getWorldPosition(
          this.thirdPersonOffset
        );
    }

    // POSITION INTERPOLATION
    this.camera.position.lerpVectors(
      this.startPosition,
      this.targetPosition,
      this.transitionProgress
    );

    // ROTATION TARGET
    if (this.mode === 'FPV') {

      this.targetQuaternion.copy(
        this.drone.quaternion
      );

    } else {

      this._tempCamera.position.copy(
        this.camera.position
      );

      this._tempCamera.lookAt(
        this.drone.position
      );

      this.targetQuaternion.copy(
        this._tempCamera.quaternion
      );
    }

    // ROTATION INTERPOLATION
    this.camera.quaternion.slerpQuaternions(
      this.startQuaternion,
      this.targetQuaternion,
      this.transitionProgress
    );

    // FINISH
    if (this.transitionProgress >= 1.0) {

      this.isTransitioning = false;

      console.log(
        '[FPVCameraController] Transition completed'
      );
    }
  }

  // =====================================
  // OFFSET -> WORLD POSITION
  // =====================================

  _getWorldPosition(relativeOffset) {

    this._worldOffset.copy(
      relativeOffset
    );

    this._worldOffset.applyQuaternion(
      this.drone.quaternion
    );

    this._worldOffset.add(
      this.drone.position
    );

    return this._worldOffset;
  }

  // =====================================
  // CLEANUP
  // =====================================

  dispose() {

  }
}