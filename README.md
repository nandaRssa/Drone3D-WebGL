# 🚁 SkyPath WebGL — 3D Drone Delivery Pathfinding

> Visualisasi drone delivery 3D menggunakan algoritma **A\*** pada grid kota modern.
> Drone mencari jalur optimal, menghindari gedung, dan mendukung multi-tujuan secara real-time.
>
> **UAS Grafika Komputer** — Three.js + Vite

---

## 🚀 Cara Menjalankan

```bash
# Pastikan Node.js versi 18 ke atas
node --version   # harus v18.x.x atau lebih

# Install dependencies
npm install

# Jalankan dev server
npm run dev

# Buka di browser
# → http://localhost:5173
```

---

## 🗂️ Struktur Project

```
SkyPath-WebGL/
├── index.html
├── package.json
├── README.md
└── src/
    ├── main.js                      ← Entry point
    ├── world/                       ← Orang 1
    │   ├── SceneManager.js          ← Scene, kamera, drone, OrbitControls
    │   ├── Building.js              ← Generasi gedung & elemen kota
    │   └── Grid.js                  ← Grid 2D + road system
    └── pathfinding/                 ← Orang 2
        ├── PathfindingSystem.js     ← A* + multi-waypoint + visualisasi
        └── helpers.js               ← MinHeap, NodePool, Greedy, LOS smoothing
```

---

## 👥 Pembagian Tugas

### 🧱 Orang 1 — Dunia & Scene
`SceneManager.js` · `Building.js` · `Grid.js`

- Kota 3D: gedung bertingkat, jalan, trotoar, taman, parkiran
- Lighting: matahari, ambient, hemisphere, fog cinematic
- Grid system sebagai basis navigasi drone (cell = walkable/obstacle)
- Drone mesh dengan animasi baling-baling
- OrbitControls: zoom, rotate, pan

---

### 🔍 Orang 2 — Pathfinding
`PathfindingSystem.js` · `helpers.js`

- **A\* Algorithm** dengan diagonal movement
- **Greedy fallback** otomatis jika A\* tidak menemukan jalur
- **Multi-waypoint queue**: Shift+klik = tambah tujuan, antrian terkoneksi
- **Line-of-Sight path smoothing**: jalur tidak memotong sudut gedung
- **Dynamic obstacle**: recalculate jalur saat obstacle berubah real-time
- Visualisasi: tube berwarna per-segmen + numbered marker + target marker animasi
- HUD + toast notifikasi lengkap
- Fix touchpad laptop (tap vs drag detection)
- API callback lengkap untuk Orang 3 & 4

---

### 🎮 Orang 3 — Movement *(TODO)*
`MovementSystem.js` · `InputSystem.js`

- Drone bergerak mengikuti jalur dari Orang 2
- Mode AUTO & MANUAL
- Hook ke sistem Orang 2:

```js
window.skyPathFinding.onPathFound = (worldPath) => {
  movementSystem.setPath(worldPath);
};
```

---

### 🎥 Orang 4 — Kamera & Final *(TODO)*
`FPVCameraController.js` · `NavigationSystem.js` · `style.css`

- FPV kamera mengikuti drone
- Auto rotate saat drone belok
- Notifikasi "Paket Terkirim!" saat sampai tujuan

```js
window.skyPathFinding.onNoPath = () => showNotification('Target tidak terjangkau!');
```

---

## 🖱️ Kontrol Kamera & Pathfinding

### Kamera
| Input (Touchpad) | Aksi |
|---|---|
| Satu jari drag | Rotate / putar kota |
| Dua jari scroll | Zoom in / out |
| Ctrl + dua jari | Pan / geser |

### Pathfinding
| Input | Aksi |
|---|---|
| **Klik / Tap** di kota | Set tujuan baru (ganti semua) |
| **Shift + Klik** | Tambah waypoint ke antrian |
| **ESC** | Hapus semua jalur |
| **Backspace** | Hapus waypoint terakhir |

---

## 🧠 Cara Kerja Algoritma

### A\* (A-Star) — Algoritma Utama

```
f(n) = g(n) + h(n)

g(n) = jarak yang sudah ditempuh dari drone (actual cost)
h(n) = estimasi jarak ke tujuan — Euclidean distance
f(n) = total biaya — A* selalu pilih node dengan f terkecil
```

**Visualisasi grid dari atas:**

```
[ ][ ][B][B][ ][ ]   B = Gedung (obstacle)
[ ][ ][B][B][/][ ]   / = Jalur diagonal (lebih pendek)
[D][/][ ][ ][/][T]   D = Drone start
[ ][ ][ ][ ][ ][ ]   T = Target (klik)
```

**Flow lengkap:**

```
User klik di scene
      │
      ▼
Raycast → koordinat world (x, z)
      │
      ▼
Konversi ke grid cell (gx, gz)
      │
      ▼
A* cari jalur (hindari cell gedung)
      │
  Gagal? ──► Greedy Fallback
      │
      ▼
Line-of-Sight Smoothing (rapihin jalur, tidak potong gedung)
      │
      ▼
Konversi ke world 3D di altitude drone
      │
      ▼
Visualisasi tube biru + callback onPathFound()
```

### Greedy Best-First — Fallback

Digunakan otomatis kalau A\* gagal menemukan jalur.
Lebih cepat, tidak selalu optimal, tapi bisa menemukan jalan di kondisi ekstrem.

```
Greedy: selalu gerak ke tetangga dengan h(n) terkecil
A*    : pilih berdasarkan f = g + h (lebih akurat)
```

### Multi-Waypoint Queue

```
Drone ──► Stop 1 ──► Stop 2 ──► Stop 3
  [biru]   [cyan]    [hijau]
```

Setiap segmen dihitung A\* secara terpisah dan disambung otomatis. Warna setiap segmen berbeda untuk membedakan urutan perjalanan.

### Line-of-Sight Smoothing

```
Sebelum smoothing:               Sesudah LOS smoothing:
D─►─►─►─►─►─►─►─►T             D──────────────────T
  (banyak belok di jalan)          (jalur lurus kalau bisa,
                                    belok hanya kalau ada gedung)
```

Menggunakan Bresenham line algorithm untuk cek apakah ada obstacle di antara dua waypoint. Kalau bersih → waypoint tengah dihapus. Kalau ada gedung → waypoint dipertahankan.

---

## ⚙️ Konfigurasi

**`src/main.js`**

```js
const pathfinding = new PathfindingSystem(world, {
  droneAltitude: 7,     // Ketinggian terbang (sama dengan droneY di SceneManager)
  diagonal: true,       // true = 8-arah (lebih natural), false = 4-arah
  smooth: true,         // Line-of-sight smoothing
});
```

**`src/world/SceneManager.js`**

```js
const droneY = 7;       // Harus sama dengan droneAltitude di atas
```

---

## 🔌 API untuk Orang 3 & 4

Semua sistem bisa diakses via `window` global:

```js
const pf = window.skyPathFinding;    // PathfindingSystem
const w  = window.skyPathWorld;      // SceneManager

// ── Callbacks ──────────────────────────────────────────
// Dipanggil setiap jalur ditemukan / diperbarui
pf.onPathFound = (worldPath) => {
  // worldPath = Array<THREE.Vector3>, sudah termasuk semua segmen
  movementSystem.setPath(worldPath);
};

// Dipanggil kalau tidak ada jalur sama sekali
pf.onNoPath = () => { showUI('Target tidak terjangkau!'); };

// Dipanggil saat user klik target baru
pf.onTargetClick = (worldPos) => { console.log(worldPos); };


// ── Methods ────────────────────────────────────────────
// Cari jalur manual (tanpa klik)
pf.findPath(startVec3, endVec3);        // → THREE.Vector3[]

// Tambah waypoint ke antrian manual
pf.getWaypoints();                       // → array waypoint saat ini

// Hapus semua jalur
pf.clearPath();

// Dynamic obstacle: update cell grid lalu recalculate jalur
pf.rebuildObstacles([
  { gx: 5, gz: 3, value: 1 },          // 1 = obstacle baru
  { gx: 7, gz: 8, value: 0 },          // 0 = obstacle dihapus
]);

// Ambil jalur aktif
const path     = pf.getCurrentPath();   // → THREE.Vector3[] (jalur lengkap)
const segments = pf.getSegments();      // → THREE.Vector3[][] (per segmen)
```

---

## 📊 Evaluasi & Limitasi

### ✅ Kelebihan
| Aspek | Keterangan |
|---|---|
| Algoritma | A\* optimal, selalu cari jalur terpendek |
| Obstacle avoidance | Semua gedung, taman, parkiran dihindari |
| Multi-waypoint | Antrian tujuan dengan warna per-segmen |
| Greedy fallback | Tidak pernah stuck kalau A\* gagal |
| LOS Smoothing | Jalur natural, tidak potong sudut gedung |
| Dynamic re-route | Klik tujuan baru = recalculate otomatis |
| Diagonal | Jalur lebih pendek & natural (8-arah) |

### ⚠️ Limitasi
| Limitasi | Penjelasan |
|---|---|
| Pathfinding 2D | Navigasi di X-Z saja, altitude konstan — tidak hindari gedung berdasarkan tinggi |
| Grid resolusi tetap | 1 cell = 1 slot gedung, tidak ada sub-cell precision |

---

## 📦 Dependencies

```json
{
  "dependencies":    { "three": "^0.170.0" },
  "devDependencies": { "vite": "^6.0.0"   }
}
```

---

*SkyPath WebGL — UAS Grafika Komputer · Orang 2: Pathfinding System*
