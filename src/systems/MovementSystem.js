import * as THREE from 'three';

export class MovementSystem {
  constructor({ drone, grid, scene, pathfindingSystem, buildings = [] }) {
    this.drone = drone;
    this.grid = grid;
    this.scene = scene;
    this.pathfindingSystem = pathfindingSystem;

    this.mode = 'AUTO';
    this.speed = 3.5;
    this.manualSpeed = 4.0;
    this.rotationSpeed = 2.5;
    this.altitudeSpeed = 3.0;
    this.arrivalDistance = 0.5;

    this.path = [];
    this.pathIndex = 0;

    this.state = 'IDLE';

    this.onStateChange = null;
    this.onArrived = null;

    this.inputState = {
      forward: false,
      backward: false,
      rotateLeft: false,
      rotateRight: false,
      up: false,
      down: false,
    };

    // Build physical bounds map
    this._buildingBounds = new Map();

    for (const b of buildings) {
      const wp = grid.gridToWorld(b.gx, b.gz);

      this._buildingBounds.set(`${b.gx},${b.gz}`, {
        cx: wp.x,
        cz: wp.z,
        hw: b.baseW / 2,
        hd: b.baseD / 2,
      });
    }
  }

  // =====================================================
  // SET PATH
  // =====================================================

  setPath(worldPath) {

    if (!worldPath || worldPath.length < 2) return;

    this.path = worldPath;

    this.pathIndex = 0;

    this.state = 'MOVING';

    this.syncYawToPath();
  }

  // =====================================================
  // FIXED ROTATION
  // =====================================================

  syncYawToPath() {

    if (this.path.length < 2) return;

    const dir = new THREE.Vector3()
      .subVectors(this.path[1], this.path[0]);

    dir.y = 0;

    if (dir.lengthSq() < 0.0001) return;

    dir.normalize();

    // =====================================
    // FIX:
    // tambahkan Math.PI karena model drone
    // menghadap belakang
    // =====================================

    const yaw = Math.atan2(dir.x, dir.z) + Math.PI;

    this.drone.rotation.y = yaw;
  }

  // =====================================================
  // CLEAR PATH
  // =====================================================

  clearPath() {

    this.path = [];

    this.pathIndex = 0;

    if (this.state !== 'MANUAL') {
      this.state = 'IDLE';
    }
  }

  // =====================================================
  // UPDATE
  // =====================================================

  update(dt) {

    if (this.mode === 'AUTO') {

      this._updateAuto(dt);

    } else {

      this._updateManual(dt);
    }
  }

  // =====================================================
  // AUTO MOVEMENT
  // =====================================================

  _updateAuto(dt) {

    if (
      this.state !== 'MOVING' ||
      this.path.length === 0
    ) return;

    const target =
      this.path[this.pathIndex];

    const pos =
      this.drone.position;

    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;

    const dist = Math.sqrt(
      dx * dx +
      dy * dy +
      dz * dz
    );

    // =====================================
    // NEXT WAYPOINT
    // =====================================

    if (dist < this.arrivalDistance) {

      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {

        this.state = 'ARRIVED';

        if (this.onArrived) {
          this.onArrived();
        }

        if (this.onStateChange) {
          this.onStateChange('ARRIVED');
        }

        return;
      }
    }

    // =====================================
    // MOVE
    // =====================================

    const moveSpeed =
      this.speed * dt;

    const t = Math.min(
      1,
      moveSpeed / Math.max(dist, 0.001)
    );

    pos.x += dx * t;
    pos.y += dy * t;
    pos.z += dz * t;

    // =====================================
    // ROTATION
    // =====================================

    const nextTarget =
      this.path[
        Math.min(
          this.pathIndex,
          this.path.length - 1
        )
      ];

    const fdx =
      nextTarget.x - pos.x;

    const fdz =
      nextTarget.z - pos.z;

    if (fdx * fdx + fdz * fdz > 0.0001) {

      // =====================================
      // FIX:
      // + Math.PI karena model drone
      // forward-nya terbalik
      // =====================================

      const targetYaw =
        Math.atan2(fdx, fdz) + Math.PI;

      let diff =
        targetYaw - this.drone.rotation.y;

      while (diff > Math.PI) {
        diff -= Math.PI * 2;
      }

      while (diff < -Math.PI) {
        diff += Math.PI * 2;
      }

      this.drone.rotation.y +=
        diff * Math.min(1, 5 * dt);
    }
  }

  // =====================================================
  // MANUAL MOVEMENT
  // =====================================================

  _updateManual(dt) {

    const input =
      this.inputState;

    const pos =
      this.drone.position;

    const mSpeed =
      this.manualSpeed * dt;

    const rSpeed =
      this.rotationSpeed * dt;

    const aSpeed =
      this.altitudeSpeed * dt;

    if (input.rotateLeft) {
      this.drone.rotation.y += rSpeed;
    }

    if (input.rotateRight) {
      this.drone.rotation.y -= rSpeed;
    }

    if (input.forward || input.backward) {

      const sign =
        input.forward ? 1 : -1;

      // =====================================
      // FORWARD VECTOR
      // =====================================

      const forward =
        new THREE.Vector3(0, 0, -1);

      forward.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.drone.rotation.y
      );

      const newPos =
        pos.clone().add(
          forward.multiplyScalar(
            sign * mSpeed
          )
        );

      const { gx, gz } =
        this.grid.worldToGrid(
          newPos.x,
          newPos.z
        );

      if (
        this.grid.inBounds(gx, gz) &&
        this.grid.isWalkable(gx, gz)
      ) {

        pos.x = newPos.x;
        pos.z = newPos.z;

      } else if (
        this.grid.inBounds(gx, gz)
      ) {

        const bb =
          this._buildingBounds.get(
            `${gx},${gz}`
          );

        if (!bb) {

          pos.x = newPos.x;
          pos.z = newPos.z;

        } else {

          const outsideX =
            Math.abs(newPos.x - bb.cx) > bb.hw;

          const outsideZ =
            Math.abs(newPos.z - bb.cz) > bb.hd;

          if (outsideX || outsideZ) {

            pos.x = newPos.x;
            pos.z = newPos.z;
          }
        }
      }
    }

    if (input.up) {
      pos.y += aSpeed;
    }

    if (input.down) {
      pos.y -= aSpeed;
    }

    pos.y =
      Math.max(0.5, Math.min(50, pos.y));
  }

  // =====================================================
  // COLLISION
  // =====================================================

  collidesWithBuilding(worldPos) {

    const { gx, gz } =
      this.grid.worldToGrid(
        worldPos.x,
        worldPos.z
      );

    if (!this.grid.inBounds(gx, gz)) {
      return false;
    }

    if (this.grid.isWalkable(gx, gz)) {
      return false;
    }

    const bb =
      this._buildingBounds.get(
        `${gx},${gz}`
      );

    if (!bb) return false;

    return (
      Math.abs(worldPos.x - bb.cx) <= bb.hw &&
      Math.abs(worldPos.z - bb.cz) <= bb.hd
    );
  }
}