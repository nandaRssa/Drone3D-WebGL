# SkyPath WebGL — 3D Drone Delivery Pathfinding

SkyPath WebGL merupakan proyek simulasi navigasi drone berbasis WebGL yang dikembangkan menggunakan Three.js dan Vite. Sistem ini menampilkan visualisasi kota 3D modern dengan drone yang dapat mencari jalur optimal secara real-time menggunakan algoritma A* (A-Star). Drone mampu menghindari gedung sebagai obstacle, mendukung navigasi multi-tujuan, serta menyediakan mode kamera interaktif untuk meningkatkan pengalaman pengguna.

Proyek ini dikembangkan sebagai implementasi konsep grafika komputer, visualisasi 3D interaktif, pathfinding, dan simulasi navigasi real-time berbasis web.

---

## Fitur Utama

- Visualisasi lingkungan kota 3D berbasis WebGL
- Sistem navigasi drone menggunakan algoritma A*
- Deteksi obstacle dan pencarian jalur optimal
- Grid system untuk navigasi drone
- Multi-waypoint navigation
- Path visualization secara real-time
- Mode navigasi otomatis dan manual
- Kamera third-person dan first-person view (FPV)
- HUD dan antarmuka pengguna interaktif
- Dynamic path recalculation
- Line-of-sight path smoothing
- Sistem notifikasi dan status navigasi

---

## Teknologi yang Digunakan

| Teknologi | Fungsi |
|---|---|
| Three.js | Rendering 3D berbasis WebGL |
| Vite | Build tool dan development server |
| Vanilla JavaScript | Pengembangan sistem utama |
| WebGL | Rendering grafis real-time |
| A* Algorithm | Sistem pathfinding |

---

## Cara Menjalankan Project

```bash
# Install dependencies
npm install

# Jalankan development server
npm run dev

# Buka browser
http://localhost:5173
