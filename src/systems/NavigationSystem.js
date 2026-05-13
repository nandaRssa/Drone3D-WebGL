import * as THREE from 'three';
import { closestPointOnPath } from '../pathfinding/helpers.js';

export class NavigationSystem {
  constructor({ drone, pathfindingSystem, movementSystem, scene }) {
    this.drone = drone;
    this.pathfindingSystem = pathfindingSystem;
    this.movementSystem = movementSystem;
    this.scene = scene;

    this.status = 'ON_PATH';
    this.warnThreshold = 1.5;
    this.resetThreshold = 3.5;

    this.onStatusChange = null;
    this.onReset = null;

    this._guideGroup = new THREE.Group();
    this._guideGroup.name = 'GuideLine';
    this.scene.add(this._guideGroup);
  }

  update(dt) {
    const mode = this.movementSystem.mode;
    const path = this.pathfindingSystem.getCurrentPath();

    if (mode !== 'MANUAL' || !path || path.length < 2) {
      this._hideGuideLine();
      return;
    }

    const dronePos = this.drone.position;
    const closest = closestPointOnPath(dronePos, path);
    // Deviation diukur di XZ plane saja (altitude bebas naik/turun)
    const dev = Math.sqrt(
      (dronePos.x - closest.point.x) ** 2 +
      (dronePos.z - closest.point.z) ** 2
    );

    let newStatus;
    if (dev < this.warnThreshold) {
      newStatus = 'ON_PATH';
    } else if (dev < this.resetThreshold) {
      newStatus = 'WARNING';
    } else {
      newStatus = 'RESET';
      this.drone.position.copy(closest.point);
      if (this.onReset) this.onReset(closest.point);
    }

    if (newStatus !== this.status) {
      this.status = newStatus;
      if (this.onStatusChange) this.onStatusChange(newStatus);
    }

    if (newStatus !== 'ON_PATH') {
      this._showGuideLine(dronePos, closest.point);
    } else {
      this._hideGuideLine();
    }
  }

  _showGuideLine(from, to) {
    this._clearGuideLine();

    const color = this.status === 'WARNING' ? 0xffaa00 : 0xff4444;

    // Main line
    const pts = [from.clone(), to.clone()];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    line.name = 'GuideLineSeg';
    this._guideGroup.add(line);

    // Dashed vertical drop at path point
    const dropPts = [
      new THREE.Vector3(to.x, 0.2, to.z),
      to.clone(),
    ];
    const drop = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(dropPts),
      new THREE.LineDashedMaterial({
        color, dashSize: 0.3, gapSize: 0.15,
        transparent: true, opacity: 0.4,
      })
    );
    drop.computeLineDistances();
    drop.name = 'GuideLineDrop';
    this._guideGroup.add(drop);

    // Pulsing orb at guide target
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
    );
    orb.position.copy(to);
    orb.name = 'GuideOrb';
    this._guideGroup.add(orb);
  }

  _hideGuideLine() {
    if (this._guideGroup.children.length > 0) {
      this._clearGuideLine();
    }
  }

  _clearGuideLine() {
    while (this._guideGroup.children.length > 0) {
      const c = this._guideGroup.children[0];
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      this._guideGroup.remove(c);
    }
  }

  dispose() {
    this._clearGuideLine();
    this.scene.remove(this._guideGroup);
  }
}
