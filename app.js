/* ═══════════════════════════════
  CLASS: Marker
  Konsep OOP — setiap marker adalah objek
═══════════════════════════════ */
class Marker {
  constructor(x, y, type, id) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.id = id;
    this.createdAt = new Date().toLocaleTimeString("id-ID");
    this.labels = { merah: "Titik Bahaya", biru: "Titik Air", hijau: "Titik Hijau" };

    // Buat elemen DOM
    this.el = document.createElement("div");
    this.el.className = "marker " + type;
    this.el.style.left = x + "px";
    this.el.style.top = y + "px";
    this.el.dataset.id = id;

    this._setupEvents();
  }

  _setupEvents() {
    // Tooltip saat hover
    this.el.addEventListener("mouseenter", () => this._showTooltip());
    this.el.addEventListener("mouseleave", () => this._hideTooltip());
    // Klik marker
    this.el.addEventListener("click", (e) => {
      e.stopPropagation();
      GIS.onMarkerClick(this);
    });
    // Drag marker
    this._setupDrag();
  }

  _showTooltip() {
    const tip = document.getElementById("tooltip");
    tip.textContent = "#" + this.id + " " + this.labels[this.type] + " (" + Math.round(this.x) + ", " + Math.round(this.y) + ")";
    tip.style.display = "block";
    tip.style.left = this.x + 16 + "px";
    tip.style.top = this.y - 32 + "px";
  }

  _hideTooltip() {
    document.getElementById("tooltip").style.display = "none";
  }

  _setupDrag() {
    let dragging = false,
      ox = 0,
      oy = 0;
    this.el.addEventListener("mousedown", (e) => {
      if (GIS.routeMode) return;
      dragging = true;
      const rect = document.getElementById("map-wrap").getBoundingClientRect();
      ox = e.clientX - rect.left - this.x;
      oy = e.clientY - rect.top - this.y;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const rect = document.getElementById("map-wrap").getBoundingClientRect();
      this.x = Math.max(7, Math.min(rect.width - 7, e.clientX - rect.left - ox));
      this.y = Math.max(7, Math.min(rect.height - 7, e.clientY - rect.top - oy));
      this.el.style.left = this.x + "px";
      this.el.style.top = this.y + "px";
    });
    document.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        GIS.updateHeatmap();
        GIS.showInfo(this);
      }
    });
  }

  setVisible(v) {
    this.el.classList.toggle("hidden", !v);
  }

  addTo(container) {
    container.appendChild(this.el);
  }
  remove() {
    this.el.remove();
  }

  toData() {
    return {
      id: this.id,
      type: this.type,
      x: Math.round(this.x),
      y: Math.round(this.y),
      createdAt: this.createdAt,
    };
  }
}

/* ═══════════════════════════════
  OBJECT: GIS
  Mengelola seluruh sistem WebGIS
═══════════════════════════════ */
const GIS = {
  markers: [],
  idCounter: 0,
  currentFilter: "semua",
  routeMode: false,
  routeSelected: [],
  heatmapOn: false,

  init() {
    // Event listeners toolbar
    document.getElementById("btn-add").addEventListener("click", () => this.addRandom());
    document.getElementById("btn-clear-all").addEventListener("click", () => this.clearAll());
    document.getElementById("btn-route").addEventListener("click", () => this.toggleRouteMode());
    document.getElementById("btn-clear-route").addEventListener("click", () => this.clearRoutes());
    document.getElementById("btn-heatmap").addEventListener("click", () => this.toggleHeatmap());

    // Filter chips
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.applyFilter(chip.dataset.filter);
      });
    });

    // Koordinat mouse di peta
    const wrap = document.getElementById("map-wrap");
    wrap.addEventListener("mousemove", (e) => {
      const rect = wrap.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      document.getElementById("coords-overlay").textContent = "x: " + x + " · y: " + y;
    });
    wrap.addEventListener("mouseleave", () => {
      document.getElementById("coords-overlay").textContent = "x: — · y: —";
    });

    window.addEventListener("resize", () => {
      this.updateHeatmap();
    });

    this.setStatus("Siap. Tambahkan marker ke peta.");
  },

  /* ── Tambah marker ── */
  addRandom() {
    const wrap = document.getElementById("map-wrap");
    const x = Math.random() * (wrap.offsetWidth - 30) + 15;
    const y = Math.random() * (wrap.offsetHeight - 30) + 15;
    const type = document.getElementById("sel-type").value;
    this.addMarker(x, y, type);
  },

  addMarker(x, y, type, id, createdAt) {
    const mid = id || ++this.idCounter;
    if (id && id > this.idCounter) this.idCounter = id;

    const m = new Marker(x, y, type, mid);
    if (createdAt) m.createdAt = createdAt;

    m.addTo(document.getElementById("markers-layer"));
    this.markers.push(m);

    this.applyFilter(this.currentFilter);
    this.updateStats();
    this.updateHeatmap();
    this.setStatus("Marker #" + mid + " (" + m.labels[type] + ") ditambahkan.");
  },

  /* ── Hapus semua ── */
  clearAll() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    this.routeSelected = [];
    this.clearRoutes();
    this.updateStats();
    this.updateHeatmap();
    document.getElementById("info-panel").textContent = "— klik marker —";
    document.getElementById("info-panel").style.color = "var(--text3)";
    this.setStatus("Semua marker dihapus.");
  },

  /* ── Klik marker ── */
  onMarkerClick(m) {
    if (this.routeMode) {
      // Cegah pilih marker yang sama dua kali
      if (this.routeSelected.find((r) => r.id === m.id)) return;
      m.el.classList.add("route-selected");
      this.routeSelected.push(m);
      this.setStatus("Marker #" + m.id + " dipilih. " + (this.routeSelected.length === 1 ? "Pilih satu lagi." : ""));
      if (this.routeSelected.length === 2) this.drawRoute();
    } else {
      this.showInfo(m);
    }
  },

  /* ── Info panel ── */
  showInfo(m) {
    const colors = { merah: "var(--red)", biru: "var(--blue)", hijau: "var(--green)" };
    const panel = document.getElementById("info-panel");
    panel.style.color = "var(--text)";
    panel.innerHTML =
      '<span style="color:var(--text3)">id      </span>' +
      '<span style="color:' +
      colors[m.type] +
      '">#' +
      m.id +
      "</span><br>" +
      '<span style="color:var(--text3)">tipe    </span>' +
      m.labels[m.type] +
      "<br>" +
      '<span style="color:var(--text3)">x       </span>' +
      Math.round(m.x) +
      "<br>" +
      '<span style="color:var(--text3)">y       </span>' +
      Math.round(m.y) +
      "<br>" +
      '<span style="color:var(--text3)">waktu   </span>' +
      m.createdAt;
  },

  /* ── Statistik ── */
  updateStats() {
    const cnt = { merah: 0, biru: 0, hijau: 0 };
    this.markers.forEach((m) => cnt[m.type]++);
    document.getElementById("cnt-merah").textContent = cnt.merah;
    document.getElementById("cnt-biru").textContent = cnt.biru;
    document.getElementById("cnt-hijau").textContent = cnt.hijau;
    document.getElementById("cnt-total").textContent = this.markers.length;
  },

  /* ── Filter ── */
  applyFilter(filter) {
    this.currentFilter = filter;
    this.markers.forEach((m) => m.setVisible(filter === "semua" || m.type === filter));
    this.updateHeatmap();
  },

  /* ── Routing ── */
  toggleRouteMode() {
    this.routeMode = !this.routeMode;
    const btn = document.getElementById("btn-route");
    btn.classList.toggle("active", this.routeMode);
    if (this.routeMode) {
      btn.textContent = "✕ Batalkan Routing";
      this.routeSelected = [];
      this.markers.forEach((m) => m.el.classList.remove("route-selected"));
      this.setStatus("Mode routing aktif — klik 2 marker untuk menghubungkan.");
    } else {
      btn.innerHTML = "<span>⇌</span> Routing (pilih 2 marker)";
      this.markers.forEach((m) => m.el.classList.remove("route-selected"));
      this.routeSelected = [];
      this.setStatus("Mode routing dinonaktifkan.");
    }
  },

  drawRoute() {
    const [a, b] = this.routeSelected;
    const svg = document.getElementById("svg-layer");
    const dist = Math.round(Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)));

    // Garis rute
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("stroke", "#f0a940");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "6,4");
    line.setAttribute("opacity", "0.8");
    line.classList.add("route-line");
    svg.appendChild(line);

    // Label jarak
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lbl.setAttribute("x", mx);
    lbl.setAttribute("y", my - 6);
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("font-size", "10");
    lbl.setAttribute("font-family", "IBM Plex Mono, monospace");
    lbl.setAttribute("fill", "#f0a940");
    lbl.textContent = dist + " unit";
    lbl.classList.add("route-line");
    svg.appendChild(lbl);

    this.setStatus("Rute ditarik antara #" + a.id + " dan #" + b.id + " — jarak: " + dist + " unit.");
    this.routeSelected = [];
    this.routeMode = false;
    const btn = document.getElementById("btn-route");
    btn.classList.remove("active");
    btn.innerHTML = "<span>⇌</span> Routing (pilih 2 marker)";
    this.markers.forEach((m) => m.el.classList.remove("route-selected"));
  },

  clearRoutes() {
    document.querySelectorAll(".route-line").forEach((el) => el.remove());
    this.routeSelected = [];
    this.setStatus("Semua rute dihapus.");
  },

  /* ── Heatmap ── */
  toggleHeatmap() {
    this.heatmapOn = !this.heatmapOn;
    const btn = document.getElementById("btn-heatmap");
    btn.classList.toggle("active", this.heatmapOn);
    btn.innerHTML = this.heatmapOn ? "<span>◉</span> Heatmap (ON)" : "<span>◉</span> Heatmap";
    this.updateHeatmap();
    this.setStatus("Heatmap " + (this.heatmapOn ? "diaktifkan." : "dinonaktifkan."));
  },

  updateHeatmap() {
    const canvas = document.getElementById("heatmap-canvas");
    const wrap = document.getElementById("map-wrap");
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.heatmapOn || this.markers.length === 0) return;

    this.markers.forEach((m) => {
      if (m.el.classList.contains("hidden")) return;
      const r = 70;
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
      grad.addColorStop(0, "rgba(224,82,82,0.40)");
      grad.addColorStop(0.4, "rgba(240,169,64,0.20)");
      grad.addColorStop(1, "rgba(224,82,82,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  /* ── Status bar ── */
  setStatus(msg) {
    document.getElementById("status-text").textContent = msg;
  },
};

// Jalankan aplikasi
GIS.init();
