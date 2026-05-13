import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Grid } from "./Grid.js";
import { Building } from "./Building.js";

/**
 * SceneManager.js — Setup scene dunia 3D kota modern Dubai-style
 * Drone POV: kamera terbang di antara gedung tinggi
 * Nuansa pagi/siang: langit biru cerah, cahaya hangat lembut, fog ringan
 */
export class SceneManager {
  constructor(options = {}) {
    const {
      gridCols = 20,
      gridRows = 20,
      cellSize = 2,
      roadInterval = 4,
      spawnChance = 0.7,
    } = options;

    // ========== SCENE ==========
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky biru cerah

    // ========== FOG — ringan untuk depth cinematic ==========
    this.scene.fog = new THREE.FogExp2(0xb8ddf0, 0.006);

    // ========== CAMERA — overview bebas ==========
    // Posisi akan di-set ulang setelah drone dibuat (agar bisa mengarah tepat ke drone)
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      800,
    );

    // ========== LIGHTING — pagi/siang hangat ==========
    this._setupLighting();

    // ========== GROUND ==========
    this._setupGround(gridCols, gridRows, cellSize);

    // ========== CLOUDS ==========
    this._setupClouds(gridCols, gridRows, cellSize);

    // ========== GRID ==========
    this.grid = new Grid(gridCols, gridRows, cellSize, roadInterval);
    this.grid.addToScene(this.scene);

    // ========== BUILDINGS + VEGETATION ==========
    this.buildings = Building.generateCity(this.grid, { spawnChance });
    this.buildings.forEach((b) => b.addToScene(this.scene));
    Building.addVegetationToScene(this.scene);

    // ========== DRONE — di tengah kota ==========
    this.drone = this._createDrone();
    this.droneAltitude = 7;  // Mid-building level — terbang DI ANTARA gedung
    // Pusat grid dalam world coordinates
    const centerX = this.grid.offsetX + (gridCols * cellSize) / 2;
    const centerZ = this.grid.offsetZ + (gridRows * cellSize) / 2;
    this.drone.position.set(centerX, this.droneAltitude, centerZ);
    this.scene.add(this.drone);

    // Posisi awal kamera: dari belakang-atas, menghadap ke drone
    this.camera.position.set(centerX, this.droneAltitude + 30, centerZ + 40);
    this.camera.lookAt(centerX, this.droneAltitude, centerZ);

    // ========== RENDERER ==========
    this.renderer = this._createRenderer();

    // ========== ORBIT CONTROLS — right-click rotate (left-click untuk pathfinding) ==========
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(centerX, this.droneAltitude, centerZ);

    this.controls.enableZoom   = true;
    this.controls.zoomSpeed    = 1.5;

    this.controls.enablePan    = true;
    this.controls.panSpeed     = 1.2;

    // RIGHT-CLICK untuk orbit — left-click bebas untuk InputSystem pathfinding
    this.controls.mouseButtons = {
      LEFT:   null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.ROTATE,
    };
    this.controls.enableRotate = true;
    this.controls.rotateSpeed  = 0.8;

    this.controls.enableDamping = true;
    this.controls.dampingFactor  = 0.08;

    this.controls.screenSpacePanning = true;

    this.controls.minDistance = 3;
    this.controls.maxDistance = 500;

    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.15;

    this.controls.touches = {
      ONE:  THREE.TOUCH.PAN,       // 1 jari = pan (bukan rotate, biar gak konflik)
      TWO:  THREE.TOUCH.DOLLY_PAN,
    };

    // Cegah context menu pada right-click
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.controls.update();


    this._onResize = this._handleResize.bind(this);
    window.addEventListener("resize", this._onResize);
  }

  _setupLighting() {
    // Ambient — soft warm base
    const ambient = new THREE.AmbientLight(0xfff8f0, 0.5);
    this.scene.add(ambient);

    // Hemisphere — sky biru ke ground hijau
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x82e0aa, 0.35);
    this.scene.add(hemi);

    // Directional — matahari terang dari samping, warna hangat lembut #fff4d6
    const dirLight = new THREE.DirectionalLight(0xfff4d6, 1.3);
    dirLight.position.set(40, 55, 35);
    dirLight.castShadow = true;

    // Shadow config — area besar untuk gedung sangat tinggi
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 250;

    const s = 60;
    dirLight.shadow.camera.left = -s;
    dirLight.shadow.camera.right = s;
    dirLight.shadow.camera.top = s;
    dirLight.shadow.camera.bottom = -s;
    dirLight.shadow.bias = -0.001;
    dirLight.shadow.radius = 3;

    this.scene.add(dirLight);
    this.dirLight = dirLight;

    // Fill light — softer, opposite side
    const fillLight = new THREE.DirectionalLight(0xe8f0ff, 0.25);
    fillLight.position.set(-30, 30, -25);
    this.scene.add(fillLight);
  }

  _setupGround(cols, rows, cellSize) {
    const width = cols * cellSize + 14;
    const depth = rows * cellSize + 14;

    const groundGeom = new THREE.PlaneGeometry(width, depth);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xc8c8c8,
      roughness: 0.9,
      metalness: 0.0,
    });

    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = "Ground";

    this.scene.add(ground);
    this.ground = ground;
  }

  _setupClouds(cols, rows, cellSize) {
    this.clouds = new THREE.Group();

    // Material awan - putih cerah, sedikit transparan dan soft
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
    });

    const cloudGeo = new THREE.SphereGeometry(1, 16, 16);

    // Jumlah awan secukupnya agar tidak menutupi langit
    const numClouds = 25;
    const spreadArea = 200;

    for (let i = 0; i < numClouds; i++) {
      const cloudGroup = new THREE.Group();

      // Setiap awan terdiri dari beberapa gumpalan (puffs)
      const numPuffs = 4 + Math.floor(Math.random() * 5);

      for (let j = 0; j < numPuffs; j++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);

        // Skala gumpalan (lebih pipih di sumbu Y agar terlihat seperti awan nyata)
        const scaleX = 3 + Math.random() * 5;
        const scaleY = 1.5 + Math.random() * 2;
        const scaleZ = 3 + Math.random() * 5;
        puff.scale.set(scaleX, scaleY, scaleZ);

        // Posisi puff menyebar di dalam satu grup awan
        puff.position.set(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 6,
        );

        // Rotasi acak untuk variasi bentuk
        puff.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );

        // Tidak perlu castShadow agar tidak membuat kota terlalu gelap,
        // bayangan lembut sudah didapat dari shading arah cahaya matahari.
        puff.castShadow = false;
        puff.receiveShadow = false;

        cloudGroup.add(puff);
      }

      // Posisi awan menyebar di langit
      const x = (Math.random() - 0.5) * spreadArea;
      const z = (Math.random() - 0.5) * spreadArea;
      const y = 65 + Math.random() * 25; // Ketinggian awan bervariasi

      cloudGroup.position.set(x, y, z);
      this.clouds.add(cloudGroup);
    }

    this.scene.add(this.clouds);
  }

  _createRenderer() {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    return renderer;
  }

  // ========== PUBLIC API ==========

  mount(container = document.body) {
    container.appendChild(this.renderer.domElement);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  update(delta) {
    // Animasi baling-baling
    if (this.rotors) {
      this.rotors.forEach((r) => (r.rotation.y += delta * 30));
    }

    // OrbitControls target ikuti posisi drone
    if (this.controls) {
      this.controls.target.lerp(this.drone.position, 0.05);
      this.controls.update();
    }

    // Animasi awan
    if (this.clouds) {
      this.clouds.children.forEach((cloud) => {
        cloud.position.x += delta * 1.5;
        if (cloud.position.x > 120) {
          cloud.position.x = -120;
        }
      });
    }
  }

  getScene() {
    return this.scene;
  }
  getCamera() {
    return this.camera;
  }
  getRenderer() {
    return this.renderer;
  }
  getGrid() {
    return this.grid;
  }

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }

  // ========== PRIVATE HELPERS ==========

  _createDrone() {
    const droneGroup = new THREE.Group();

    // Body utama drone (putih modern)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.2,
      metalness: 0.6,
    });
    const bodyGeo = new THREE.BoxGeometry(0.8, 0.2, 0.8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    droneGroup.add(body);

    // Lensa Kamera di depan bawah
    const lensMat = new THREE.MeshStandardMaterial({
      color: "#111111",
      roughness: 0.1,
      metalness: 0.9,
    });
    const lensGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.15, 16);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.05, -0.45);
    lens.castShadow = true;
    droneGroup.add(lens);

    // 4 Lengan dan Rotor
    const armMat = new THREE.MeshStandardMaterial({
      color: "#333333",
      roughness: 0.6,
    });
    const rotorMat = new THREE.MeshStandardMaterial({
      color: "#111111",
      roughness: 0.5,
      transparent: true,
      opacity: 0.4,
    });

    this.rotors = [];
    const positions = [
      [0.6, -0.6],
      [-0.6, -0.6],
      [0.6, 0.6],
      [-0.6, 0.6],
    ];

    positions.forEach(([x, z]) => {
      // Lengan
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.05, 0.05),
        armMat,
      );
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(x, z);
      arm.castShadow = true;
      droneGroup.add(arm);

      // Motor baling-baling
      const motor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8),
        armMat,
      );
      motor.position.set(x, 0.05, z);
      motor.castShadow = true;
      droneGroup.add(motor);

      // Baling-baling (Rotor)
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.01, 16),
        rotorMat,
      );
      rotor.position.set(x, 0.11, z);
      droneGroup.add(rotor);
      this.rotors.push(rotor);
    });

    // Lampu LED indikator kedip di belakang
    const ledRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    );
    ledRed.position.set(0, 0.1, 0.4);
    droneGroup.add(ledRed);

    // Skala drone agar proporsional dengan gedung
    droneGroup.scale.set(0.6, 0.6, 0.6);

    return droneGroup;
  }
}
