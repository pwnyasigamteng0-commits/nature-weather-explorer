/* =========================================================
   NATURE & WEATHER EXPLORER - script.js
   Bagian:
   1. Pengaturan      6. Cuaca (ambil & tampilkan data)
   2. Fungsi bantu    7. Pencarian & lokasi pengguna
   3. Navigasi & tema 8. Peta
   4. Jam & tanggal   9. Konten (alam, fenomena, edukasi)
   5. Kode cuaca     10. Mulai aplikasi
   ========================================================= */
"use strict";

window.addEventListener("error", (e) => {
  alert("Error: " + e.message + "\nBaris: " + e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  alert("Error data: " + (e.reason && e.reason.message ? e.reason.message : e.reason));
});

/* ---------- 1. PENGATURAN ---------- */
const API = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geo: "https://geocoding-api.open-meteo.com/v1/search",
  nomSearch: "https://nominatim.openstreetmap.org/search",
  nomReverse: "https://nominatim.openstreetmap.org/reverse"
};

const DEFAULT_PLACE = { name: "Jakarta, Indonesia", lat: -6.2, lon: 106.8 };

// "state" = tempat menyimpan kondisi aplikasi saat ini
const state = {
  place: null,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  reqId: 0,
  map: null,
  marker: null,
  mapPoint: null
};

/* ---------- 2. FUNGSI BANTU ---------- */
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { $(id).textContent = v; };
const ico = (name) => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => { if (window.lucide) lucide.createIcons(); };

// Mengamankan teks dari API sebelum dimasukkan ke HTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer;
function showToast(msg, isError = true, ms = 4500) {
  const t = $("toast");
  t.textContent = msg;
  t.style.borderColor = isError ? "" : "var(--accent)";
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// Mengambil data dari internet dengan batas waktu 12 detik
async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("Server menjawab dengan kode " + res.status);
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Koneksi terlalu lambat. Coba lagi.");
    if (err instanceof TypeError) throw new Error("Tidak bisa terhubung. Periksa koneksi internet Anda.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function windDirection(deg) {
  const names = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  return names[Math.round(deg / 45) % 8];
}

function uvLevel(uv) {
  if (uv < 3) return "Rendah";
  if (uv < 6) return "Sedang";
  if (uv < 8) return "Tinggi";
  if (uv < 11) return "Sangat tinggi";
  return "Ekstrem";
}

function aqiLevel(aqi) {
  if (aqi <= 50) return "Baik";
  if (aqi <= 100) return "Sedang";
  if (aqi <= 150) return "Tidak sehat bagi kelompok sensitif";
  if (aqi <= 200) return "Tidak sehat";
  if (aqi <= 300) return "Sangat tidak sehat";
  return "Berbahaya";
}

function skyText(cloud, isDay) {
  if (cloud < 10) return isDay ? "Langit cerah tanpa awan" : "Langit malam cerah, bintang terlihat";
  if (cloud < 30) return "Sebagian besar cerah";
  if (cloud < 60) return "Berawan sebagian";
  if (cloud < 85) return "Berawan";
  return "Mendung, langit tertutup awan";
}

/* ---------- 3. NAVIGASI & TEMA ---------- */
function showPage(name) {
  if (!$("page-" + name)) name = "dashboard";
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + name));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
  $("navLinks").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "map") initMap();
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = el.dataset.page; // memicu 'hashchange' di bawah
    });
  });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1)));
  $("menuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("navLinks").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".navbar")) $("navLinks").classList.remove("open");
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeBtn").innerHTML = ico(theme === "dark" ? "sun" : "moon");
  refreshIcons();
  try { localStorage.setItem("nwe-theme", theme); } catch (e) { /* abaikan */ }
}

function setupTheme() {
  let saved = "dark";
  try { saved = localStorage.getItem("nwe-theme") || "dark"; } catch (e) { /* abaikan */ }
  applyTheme(saved);
  $("themeBtn").addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
}

/* ---------- 4. JAM & TANGGAL ---------- */
function tickClock() {
  const now = new Date();
  try {
    $("clock").textContent = new Intl.DateTimeFormat("id-ID", {
      timeZone: state.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).format(now).replace(/\./g, ":");
    $("date").textContent = new Intl.DateTimeFormat("id-ID", {
      timeZone: state.tz, weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(now);
  } catch (e) {
    state.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // zona waktu tidak valid
  }
}

/* ---------- 5. KODE CUACA (standar WMO dari Open-Meteo) ---------- */
// kode: [teks, ikon siang, ikon malam]
const WMO = {
  0: ["Cerah", "sun", "moon"],
  1: ["Sebagian besar cerah", "sun", "moon"],
  2: ["Berawan sebagian", "cloud-sun", "cloud-moon"],
  3: ["Mendung", "cloudy", "cloudy"],
  45: ["Berkabut", "cloud-fog", "cloud-fog"],
  48: ["Kabut beku", "cloud-fog", "cloud-fog"],
  51: ["Gerimis ringan", "cloud-drizzle", "cloud-drizzle"],
  53: ["Gerimis sedang", "cloud-drizzle", "cloud-drizzle"],
  55: ["Gerimis lebat", "cloud-drizzle", "cloud-drizzle"],
  56: ["Gerimis beku", "cloud-drizzle", "cloud-drizzle"],
  57: ["Gerimis beku lebat", "cloud-drizzle", "cloud-drizzle"],
  61: ["Hujan ringan", "cloud-rain", "cloud-rain"],
  63: ["Hujan sedang", "cloud-rain", "cloud-rain"],
  65: ["Hujan lebat", "cloud-rain", "cloud-rain"],
  66: ["Hujan beku", "cloud-rain", "cloud-rain"],
  67: ["Hujan beku lebat", "cloud-rain", "cloud-rain"],
  71: ["Salju ringan", "cloud-snow", "cloud-snow"],
  73: ["Salju sedang", "cloud-snow", "cloud-snow"],
  75: ["Salju lebat", "cloud-snow", "cloud-snow"],
  77: ["Butiran salju", "snowflake", "snowflake"],
  80: ["Hujan lokal ringan", "cloud-rain", "cloud-rain"],
  81: ["Hujan lokal sedang", "cloud-rain", "cloud-rain"],
  82: ["Hujan lokal sangat lebat", "cloud-rain", "cloud-rain"],
  85: ["Hujan salju ringan", "cloud-snow", "cloud-snow"],
  86: ["Hujan salju lebat", "cloud-snow", "cloud-snow"],
  95: ["Badai petir", "cloud-lightning", "cloud-lightning"],
  96: ["Badai petir disertai es", "cloud-lightning", "cloud-lightning"],
  99: ["Badai petir dengan es lebat", "cloud-lightning", "cloud-lightning"]
};

function codeInfo(code, isDay = 1) {
  const item = WMO[code] || ["Tidak diketahui", "cloud", "cloud"];
  return { text: item[0], icon: isDay ? item[1] : item[2] };
}

const isStorm = (code) => code === 95 || code === 96 || code === 99;

/* ---------- 6. CUACA: AMBIL & TAMPILKAN DATA ---------- */
function getForecast(lat, lon) {
  const url = `${API.forecast}?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code," +
    "cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day" +
    "&hourly=temperature_2m,precipitation_probability,weather_code,visibility,uv_index,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum," +
    "precipitation_probability_max,sunrise,sunset,uv_index_max,wind_gusts_10m_max" +
    "&timezone=auto&forecast_days=7";
  return fetchJSON(url);
}

function getAir(lat, lon) {
  return fetchJSON(`${API.air}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5&timezone=auto`);
}

async function loadWeather(lat, lon, name) {
  const myReq = ++state.reqId; // untuk mengabaikan jawaban lama
  state.place = { lat, lon, name };
  $("page-dashboard").classList.add("loading");
  $("page-weather").classList.add("loading");
  setText("dashPlace", name);
  setText("wPlace", name);

  try {
    const [fc, air] = await Promise.allSettled([getForecast(lat, lon), getAir(lat, lon)]);
    if (myReq !== state.reqId) return;          // ada permintaan lebih baru
    if (fc.status === "rejected") throw fc.reason; // cuaca utama gagal
    renderWeather(fc.value, air.status === "fulfilled" ? air.value : null, name);
  } catch (err) {
    if (myReq !== state.reqId) return;
    showWeatherError(err);
  } finally {
    if (myReq === state.reqId) {
      $("page-dashboard").classList.remove("loading");
      $("page-weather").classList.remove("loading");
    }
  }
}

function showWeatherError(err) {
  const msg = err && err.message ? err.message : "Terjadi kesalahan.";
  setText("dashPlace", "Data gagal dimuat");
  showToast("Data cuaca gagal dimuat: " + msg);
  const box = $("alertBox");
  box.className = "alert danger";
  box.hidden = false;
  box.innerHTML = `<strong>${ico("wifi-off")} Data gagal dimuat.</strong> ${esc(msg)} ` +
    `<button class="btn" id="retryBtn" style="margin-top:8px">Coba lagi</button>`;
  refreshIcons();
  $("retryBtn").addEventListener("click", () => {
    const p = state.place || DEFAULT_PLACE;
    loadWeather(p.lat, p.lon, p.name);
  });
}

function buildAlerts(c, hourly, idx, daily, aqi) {
  const list = [];
  const soon = hourly.weather_code.slice(idx, idx + 24);
  if (isStorm(c.weather_code)) list.push({ lv: "danger", t: "Badai petir sedang terjadi. Hindari ruang terbuka dan pohon tinggi." });
  else if (soon.some(isStorm)) list.push({ lv: "warn", t: "Ada potensi badai petir dalam 24 jam ke depan." });
  if (c.wind_gusts_10m >= 90) list.push({ lv: "danger", t: `Angin sangat kencang (hembusan ${Math.round(c.wind_gusts_10m)} km/j).` });
  else if (c.wind_gusts_10m >= 60) list.push({ lv: "warn", t: `Angin kencang (hembusan ${Math.round(c.wind_gusts_10m)} km/j).` });
  const heavy = daily.precipitation_sum.findIndex((mm) => mm >= 50);
  if (heavy !== -1) list.push({ lv: "warn", t: `Hujan sangat lebat diperkirakan (${Math.round(daily.precipitation_sum[heavy])} mm) pada ${daily.time[heavy]}.` });
  if (c.apparent_temperature >= 40) list.push({ lv: "danger", t: "Cuaca terasa sangat panas. Minum cukup air dan hindari aktivitas berat di luar." });
  if (c.apparent_temperature <= -15) list.push({ lv: "danger", t: "Cuaca terasa sangat dingin. Risiko radang dingin (frostbite)." });
  if (hourly.uv_index[idx] >= 11) list.push({ lv: "warn", t: "Indeks UV ekstrem. Gunakan tabir surya dan hindari matahari langsung." });
  if (aqi !== null && aqi >= 151) list.push({ lv: "warn", t: `Kualitas udara ${aqiLevel(aqi).toLowerCase()} (AQI ${aqi}). Kurangi aktivitas di luar.` });
  return list;
}

function renderWeather(data, air, name) {
  const c = data.current;
  const h = data.hourly;
  const d = data.daily;
  state.tz = data.timezone || state.tz;
  tickClock();

  // Posisi jam sekarang di dalam daftar per jam
  let idx = h.time.findIndex((t) => t.startsWith(c.time.slice(0, 13)));
  if (idx < 0) idx = 0;

  const info = codeInfo(c.weather_code, c.is_day);
  const aqi = air && air.current && air.current.us_aqi != null ? Math.round(air.current.us_aqi) : null;
  const uv = Math.round((h.uv_index[idx] || 0) * 10) / 10;
  const rainProb = h.precipitation_probability[idx];

  /* Dashboard */
  setText("dashPlace", name);
  setText("dashTemp", Math.round(c.temperature_2m));
  document.querySelector("#page-dashboard .cond").innerHTML = `${ico(info.icon)} <span id="dashCond">${esc(info.text)}</span>`;
  setText("dashFeels", Math.round(c.apparent_temperature));
  setText("dashHumidity", c.relative_humidity_2m);
  $("humBar").style.width = c.relative_humidity_2m + "%";
  setText("dashWind", Math.round(c.wind_speed_10m));
  setText("dashWindDir", "Dari arah " + windDirection(c.wind_direction_10m));
  setText("dashPressure", Math.round(c.pressure_msl));
  setText("dashSky", skyText(c.cloud_cover, c.is_day));
  setText("dashCloud", c.cloud_cover);
  setText("dashSunrise", d.sunrise[0].slice(11, 16));
  setText("dashSunset", d.sunset[0].slice(11, 16));

  // Latar berubah: siang, malam, atau fajar/senja (dalam 40 menit dari terbit/terbenam)
  const nowMs = new Date(c.time).getTime();
  const near = [d.sunrise[0], d.sunset[0]].some((s) => Math.abs(new Date(s).getTime() - nowMs) < 40 * 60000);
  $("bgScene").className = "bg-scene " + (near ? "bg-dawn" : c.is_day ? "bg-day" : "bg-night");

  /* Halaman Cuaca */
  setText("wTemp", Math.round(c.temperature_2m));
  setText("wCond", info.text);
  setText("wRain", c.precipitation);
  setText("wRainProb", rainProb != null ? rainProb : "--");
  const stormNow = isStorm(c.weather_code);
  const stormSoon = h.weather_code.slice(idx, idx + 24).some(isStorm);
  setText("wStorm", stormNow ? "Badai petir sedang terjadi" : stormSoon ? "Potensi badai petir dalam 24 jam" : "Tidak ada badai petir");
  setText("wGust", Math.round(c.wind_gusts_10m));
  setText("wUv", uv);
  setText("wUvText", uvLevel(uv));
  setText("wAqi", aqi !== null ? aqi : "--");
  setText("wAqiText", aqi !== null ? aqiLevel(aqi) : "Data tidak tersedia untuk lokasi ini");
  const vis = h.visibility[idx];
  setText("wVis", vis != null ? (vis / 1000).toFixed(1) : "--");

  /* Peringatan cuaca ekstrem */
  const alerts = buildAlerts(c, h, idx, d, aqi);
  const box = $("alertBox");
  box.hidden = false;
  if (alerts.length) {
    box.className = "alert" + (alerts.some((a) => a.lv === "danger") ? " danger" : "");
    box.innerHTML = `<strong>${ico("triangle-alert")} Peringatan cuaca</strong><br>` +
      alerts.map((a) => "• " + esc(a.t)).join("<br>") +
      `<br><small>Peringatan otomatis dari data model, bukan peringatan resmi. Untuk Indonesia, cek BMKG.</small>`;
  } else {
    box.className = "alert ok";
    box.innerHTML = `${ico("shield-check")} Tidak ada peringatan cuaca ekstrem untuk lokasi ini.`;
  }

  /* Per jam (24 jam ke depan) */
  let hoursHTML = "";
  for (let i = idx; i < idx + 24 && i < h.time.length; i++) {
    const hi = codeInfo(h.weather_code[i], h.is_day[i]);
    hoursHTML += `<div class="hour">
      <div class="t">${i === idx ? "Kini" : h.time[i].slice(11, 16)}</div>
      ${ico(hi.icon)}
      <div class="temp">${Math.round(h.temperature_2m[i])}°</div>
      <div class="rain">${h.precipitation_probability[i] ?? 0}%</div>
    </div>`;
  }
  $("hourly").innerHTML = hoursHTML;

  /* 7 hari */
  $("daily").innerHTML = d.time.map((day, i) => {
    const di = codeInfo(d.weather_code[i], 1);
    const label = i === 0 ? "Hari ini" : new Date(day + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
    return `<div class="day glass card">
      <div class="name">${esc(label)}<br><small class="sub">${esc(di.text)}</small></div>
      ${ico(di.icon)}
      <div class="range">${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°</div>
      <div class="rain">${ico("droplets")} ${d.precipitation_probability_max[i] ?? 0}% · ${d.precipitation_sum[i]} mm</div>
    </div>`;
  }).join("");

  refreshIcons();
}

/* ---------- 7. PENCARIAN & LOKASI PENGGUNA ---------- */
async function searchPlaces(q, nominatimFirst = false) {
  const geoUrl = `${API.geo}?name=${encodeURIComponent(q)}&count=6&language=id&format=json`;
  const nomUrl = `${API.nomSearch}?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&accept-language=id`;
  const [a, b] = await Promise.allSettled([fetchJSON(geoUrl), fetchJSON(nomUrl)]);
  if (a.status === "rejected" && b.status === "rejected") throw a.reason;

  const fromGeo = a.status === "fulfilled" && a.value.results ? a.value.results.map((r) => ({
    name: r.name,
    sub: [r.admin1, r.country].filter(Boolean).join(", "),
    label: [r.name, r.country].filter(Boolean).join(", "),
    lat: r.latitude, lon: r.longitude
  })) : [];

  const fromNom = b.status === "fulfilled" ? b.value.map((r) => {
    const parts = r.display_name.split(",").map((s) => s.trim());
    return {
      name: r.name || parts[0],
      sub: r.display_name,
      label: parts.length > 1 ? parts[0] + ", " + parts[parts.length - 1] : parts[0],
      lat: parseFloat(r.lat), lon: parseFloat(r.lon)
    };
  }) : [];

  const first = nominatimFirst ? fromNom : fromGeo;
  const second = nominatimFirst ? fromGeo : fromNom;
  const merged = [...first];
  second.forEach((p) => {
    const dup = merged.some((m) => Math.abs(m.lat - p.lat) < 0.2 && Math.abs(m.lon - p.lon) < 0.2);
    if (!dup) merged.push(p);
  });
  return merged.slice(0, 8);
}

function setupSearch() {
  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("searchInput").value.trim();
    if (!q) return;
    const list = $("searchResults");
    list.hidden = false;
    list.innerHTML = "<li>Mencari...</li>";
    try {
      const places = await searchPlaces(q);
      if (!places.length) {
        list.innerHTML = "<li>Tidak ditemukan. Coba ejaan lain atau nama yang lebih umum.</li>";
        return;
      }
      list.innerHTML = places.map((p, i) =>
        `<li data-i="${i}">${esc(p.name)}<small>${esc(p.sub)}</small></li>`).join("");
      list.onclick = (ev) => {
        const li = ev.target.closest("li[data-i]");
        if (!li) return;
        const p = places[li.dataset.i];
        list.hidden = true;
        $("searchInput").value = "";
        loadWeather(p.lat, p.lon, p.label);
      };
    } catch (err) {
      list.hidden = true;
      showToast("Pencarian gagal: " + err.message);
    }
  });

  $("locateBtn").addEventListener("click", () => useMyLocation(false));
}

async function reverseGeocode(lat, lon) {
  try {
    const r = await fetchJSON(`${API.nomReverse}?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=id`, 8000);
    if (r.error) return null;
    return r;
  } catch (e) {
    return null;
  }
}

function placeLabel(r) {
  if (!r || !r.address) return null;
  const a = r.address;
  const local = a.city || a.town || a.village || a.county || a.state || a.region;
  return [local, a.country].filter(Boolean).join(", ") || null;
}

function useMyLocation(silent) {
  if (!navigator.geolocation) {
    if (!silent) showToast("Browser Anda tidak mendukung lokasi.");
    return;
  }
  if (!silent) showToast("Mencari lokasi Anda...", false, 2500);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const rev = await reverseGeocode(lat, lon);
      loadWeather(lat, lon, placeLabel(rev) || "Lokasi Anda");
    },
    (err) => {
      if (silent) return;
      showToast(err.code === 1
        ? "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser, atau cari kota secara manual."
        : "Lokasi tidak dapat ditemukan. Coba lagi atau cari kota manual.");
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

/* ---------- 8. PETA (Leaflet + OpenStreetMap) ---------- */
function initMap() {
  if (state.map) { setTimeout(() => state.map.invalidateSize(), 100); return; }
  if (!window.L) { showToast("Peta gagal dimuat. Periksa koneksi internet."); return; }

  state.map = L.map("map").setView([-2.5, 118], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);
  state.map.on("click", (e) => selectMapPoint(e.latlng.lat, e.latlng.lng));
  setTimeout(() => state.map.invalidateSize(), 100);
}

function environmentNote(lat, elev, hasLand) {
  if (!hasLand && elev <= 1) return "Tidak ada data wilayah daratan di titik ini; kemungkinan area laut atau samudra.";
  const zone = Math.abs(lat) < 23.5 ? "tropis" : Math.abs(lat) < 66.5 ? "subtropis hingga sedang" : "kutub";
  let terrain = "dataran rendah/pesisir";
  if (elev >= 3000) terrain = "pegunungan tinggi";
  else if (elev >= 1500) terrain = "pegunungan";
  else if (elev >= 500) terrain = "dataran tinggi";
  else if (elev >= 50) terrain = "dataran rendah";
  return `Zona iklim ${zone}, ketinggian sekitar ${Math.round(elev)} m (${terrain}).`;
}

async function selectMapPoint(lat, lon, knownName) {
  if (!state.map) return;
  if (state.marker) state.marker.setLatLng([lat, lon]);
  else state.marker = L.marker([lat, lon]).addTo(state.map);

  const info = $("mapInfo");
  info.innerHTML = `<h3>${ico("loader")} Memuat data...</h3>`;
  refreshIcons();

  const [fc, air, rev] = await Promise.all([
    getForecast(lat, lon).catch(() => null),
    getAir(lat, lon).catch(() => null),
    reverseGeocode(lat, lon)
  ]);

  if (!fc) {
    info.innerHTML = `<h3>${ico("wifi-off")} Gagal memuat</h3><p>Data cuaca untuk titik ini tidak dapat dimuat. Coba ketuk lagi.</p>`;
    refreshIcons();
    return;
  }

  const c = fc.current;
  const ci = codeInfo(c.weather_code, c.is_day);
  let idx = fc.hourly.time.findIndex((t) => t.startsWith(c.time.slice(0, 13)));
  if (idx < 0) idx = 0;
  const uv = Math.round((fc.hourly.uv_index[idx] || 0) * 10) / 10;
  const aqi = air && air.current && air.current.us_aqi != null ? Math.round(air.current.us_aqi) : null;
  const name = knownName || placeLabel(rev) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  state.mapPoint = { lat, lon, name };

  info.innerHTML = `
    <h3>${ico("map-pin")} ${esc(name)}</h3>
    <p><strong>${Math.round(c.temperature_2m)}°C</strong> · ${esc(ci.text)}</p>
    <p>Kelembapan: <strong>${c.relative_humidity_2m}%</strong></p>
    <p>Angin: <strong>${Math.round(c.wind_speed_10m)} km/j</strong> dari ${windDirection(c.wind_direction_10m)}</p>
    <p>Indeks UV: <strong>${uv}</strong> (${uvLevel(uv)})</p>
    <p>Kualitas udara: <strong>${aqi !== null ? aqi + " (" + aqiLevel(aqi) + ")" : "tidak tersedia"}</strong></p>
    <h4 style="margin:12px 0 4px">${ico("leaf")} Kondisi lingkungan</h4>
    <p>${esc(environmentNote(lat, fc.elevation || 0, !!rev))}</p>
    <button class="btn" id="mapOpenBtn" style="margin-top:6px">Lihat cuaca lengkap</button>`;
  refreshIcons();

  $("mapOpenBtn").addEventListener("click", () => {
    loadWeather(lat, lon, name);
    location.hash = "weather";
  });
}

function setupMapSearch() {
  $("mapSearchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("mapSearchInput").value.trim();
    if (!q) return;
    initMap();
    try {
      const places = await searchPlaces(q, true);
      if (!places.length) { showToast("Wilayah tidak ditemukan."); return; }
      const p = places[0];
      state.map.setView([p.lat, p.lon], 7);
      selectMapPoint(p.lat, p.lon, p.label);
    } catch (err) {
      showToast("Pencarian gagal: " + err.message);
    }
  });
}

/* ---------- 9. KONTEN: ALAM, FENOMENA, EDUKASI ---------- */
// Setiap item: title, icon, colors (gradasi), short (ringkasan kartu),
// sections (isi jendela detail: h = judul, p = paragraf, list = daftar)

const NATURE = [
  { title: "Hutan Hujan Tropis", icon: "trees", colors: ["#0f9b58", "#0b5e3c"],
    short: "Paru-paru hijau Bumi dengan keanekaragaman hayati sangat tinggi.",
    sections: [
      { h: "Deskripsi", p: "Hutan hujan tropis tumbuh di sekitar khatulistiwa dengan suhu hangat sepanjang tahun dan hujan sangat banyak. Vegetasinya berlapis dari lantai hutan hingga kanopi tinggi. Hamparan terbesarnya ada di Amazon, Kongo, dan Asia Tenggara, termasuk Indonesia." },
      { h: "Fakta unik", list: ["Hutan hujan hanya menutupi sekitar 6% daratan, tetapi menjadi rumah bagi lebih dari separuh spesies darat.", "Banyak hewan hidup di kanopi dan jarang turun ke tanah.", "Hutan Amazon seluas sekitar 5,5 juta km²."] },
      { h: "Informasi ilmiah", p: "Curah hujan umumnya di atas 2.000 mm per tahun. Tumbuhan melepas uap air lewat daunnya (transpirasi), sehingga hutan ikut membentuk awan dan hujan. Hutan juga menyimpan karbon dalam jumlah besar pada biomassa dan tanahnya." }
    ] },
  { title: "Pegunungan", icon: "mountain", colors: ["#5b7fa6", "#2c3e5e"],
    short: "Puncak-puncak tinggi hasil tumbukan lempeng bumi.",
    sections: [
      { h: "Deskripsi", p: "Pegunungan terbentuk jutaan tahun melalui proses tektonik, terutama ketika lempeng benua saling bertumbukan atau ketika magma mengangkat kerak bumi. Pegunungan menjadi sumber banyak sungai dan menampung ekosistem yang berubah menurut ketinggian." },
      { h: "Fakta unik", list: ["Gunung Everest setinggi sekitar 8.849 m dari permukaan laut.", "Jika diukur dari dasar laut, Mauna Kea di Hawaii lebih dari 10.000 m.", "Puncak Jaya (4.884 m) di Papua adalah puncak tertinggi di Indonesia."] },
      { h: "Informasi ilmiah", p: "Suhu turun sekitar 6,5 °C setiap naik 1.000 m. Karena itu kaki gunung bisa tropis, sementara puncaknya bersalju. Pegunungan Himalaya masih naik beberapa milimeter per tahun akibat tumbukan lempeng India dan Eurasia." }
    ] },
  { title: "Laut dan Samudra", icon: "waves", colors: ["#1d7fd1", "#0a3d73"],
    short: "Lautan menutupi sekitar 71% permukaan Bumi.",
    sections: [
      { h: "Deskripsi", p: "Samudra adalah sistem raksasa yang mengatur iklim, menyuplai oksigen, dan menjadi habitat ribuan jenis makhluk hidup, dari plankton mikroskopis hingga paus biru." },
      { h: "Fakta unik", list: ["Titik terdalam, Challenger Deep, sekitar 10.900 m.", "Baru sekitar seperempat dasar laut yang dipetakan dengan resolusi tinggi.", "Fitoplankton laut menghasilkan sebagian besar oksigen yang kita hirup."] },
      { h: "Informasi ilmiah", p: "Laut menyerap sebagian besar panas berlebih akibat pemanasan global dan sekitar seperempat emisi CO₂ manusia. Arus laut seperti arus Teluk (Gulf Stream) memindahkan panas ke berbagai wilayah dan memengaruhi cuaca." }
    ] },
  { title: "Gurun", icon: "sun", colors: ["#e0a24a", "#a35b1e"],
    short: "Wilayah sangat kering dengan perbedaan suhu ekstrem.",
    sections: [
      { h: "Deskripsi", p: "Gurun adalah wilayah dengan curah hujan di bawah sekitar 250 mm per tahun. Tidak semua gurun panas: Antartika dan Arktik adalah gurun dingin." },
      { h: "Fakta unik", list: ["Sahara seluas sekitar 9 juta km², hampir sebesar Amerika Serikat.", "Gurun Atacama di Chili termasuk tempat terkering di dunia di luar kutub.", "Hanya sebagian kecil gurun yang berupa bukit pasir."] },
      { h: "Informasi ilmiah", p: "Langit yang cerah dan udara kering membuat panas siang hari cepat lepas pada malam hari, sehingga selisih suhu siang-malam bisa mencapai puluhan derajat. Tumbuhan gurun beradaptasi dengan akar panjang, batang penyimpan air, atau daun kecil." }
    ] },
  { title: "Sungai dan Danau", icon: "droplets", colors: ["#2aa6b8", "#13566b"],
    short: "Jalur air tawar yang menopang kehidupan dan peradaban.",
    sections: [
      { h: "Deskripsi", p: "Sungai mengalirkan air dari hulu ke hilir dan membawa sedimen yang menyuburkan dataran. Danau terbentuk di cekungan alami akibat tektonik, gletser, atau letusan gunung berapi." },
      { h: "Fakta unik", list: ["Sungai Nil sekitar 6.650 km, salah satu yang terpanjang di dunia.", "Danau Baikal di Rusia adalah danau terdalam, lebih dari 1.600 m.", "Danau Toba terbentuk oleh letusan super sekitar 74.000 tahun lalu."] },
      { h: "Informasi ilmiah", p: "Air sungai berputar dalam siklus hidrologi: menguap, menjadi awan, turun sebagai hujan, lalu mengalir kembali ke laut. Daerah tangkapan air (DAS) menentukan seberapa banyak hujan yang masuk ke satu sungai." }
    ] },
  { title: "Air Terjun", icon: "droplets", colors: ["#3fb6e8", "#1a5f9e"],
    short: "Air yang jatuh dari tebing, hasil kerja erosi ribuan tahun.",
    sections: [
      { h: "Deskripsi", p: "Air terjun terbentuk ketika sungai mengalir melewati lapisan batuan keras lalu jatuh pada batuan yang lebih lunak dan lebih cepat terkikis." },
      { h: "Fakta unik", list: ["Angel Falls di Venezuela adalah air terjun tertinggi, sekitar 979 m.", "Air Terjun Victoria di perbatasan Zambia-Zimbabwe lebarnya sekitar 1,7 km.", "Tumpak Sewu di Jawa Timur dikenal sebagai air terjun berbentuk tirai."] },
      { h: "Informasi ilmiah", p: "Pada dasar air terjun terbentuk kolam hempasan (plunge pool). Erosi di bagian bawah membuat tebing runtuh sehingga air terjun perlahan mundur ke arah hulu." }
    ] },
  { title: "Gunung Berapi", icon: "flame", colors: ["#e8573a", "#7a1f12"],
    short: "Jendela menuju panas dari dalam Bumi.",
    sections: [
      { h: "Deskripsi", p: "Gunung berapi adalah lubang di kerak bumi tempat magma, gas, dan abu keluar. Magma disebut lava setelah mencapai permukaan." },
      { h: "Fakta unik", list: ["Sekitar 1.350 gunung berapi di dunia berpotensi aktif.", "Indonesia memiliki sekitar 120-130 gunung api aktif, terbanyak di dunia.", "Letusan Tambora 1815 memicu 'tahun tanpa musim panas' pada 1816."] },
      { h: "Informasi ilmiah", p: "Sebagian besar gunung berapi berada di pertemuan lempeng tektonik, terutama di Cincin Api Pasifik. Letusan eksplosif terjadi saat magma kental menahan gas hingga tekanan sangat tinggi; magma encer cenderung mengalir sebagai lelehan lava." }
    ] },
  { title: "Kutub dan Gletser", icon: "snowflake", colors: ["#9bd3f0", "#3f7fb0"],
    short: "Gudang es raksasa yang mengatur iklim dunia.",
    sections: [
      { h: "Deskripsi", p: "Kutub Utara (Arktik) adalah lautan yang tertutup es, sedangkan Kutub Selatan (Antartika) adalah benua yang tertutup es. Gletser adalah sungai es yang bergerak sangat lambat di pegunungan dan kutub." },
      { h: "Fakta unik", list: ["Antartika menyimpan sekitar 90% es dunia.", "Suhu terendah yang pernah tercatat sekitar -89 °C di Stasiun Vostok, Antartika.", "Jika seluruh es Antartika mencair, permukaan laut dapat naik sekitar 58 m."] },
      { h: "Informasi ilmiah", p: "Es yang putih memantulkan sinar Matahari (efek albedo). Ketika es mencair, permukaan yang lebih gelap menyerap lebih banyak panas sehingga pemanasan semakin cepat. Luas es laut Arktik pada September menyusut sekitar 12-13% per dekade." }
    ] },
  { title: "Keanekaragaman Hayati", icon: "bird", colors: ["#7cc43f", "#2d6a1f"],
    short: "Keragaman makhluk hidup, gen, dan ekosistem di Bumi.",
    sections: [
      { h: "Deskripsi", p: "Keanekaragaman hayati mencakup keragaman spesies, variasi genetik, dan ragam ekosistem. Ini menjaga penyerbukan, kesuburan tanah, air bersih, dan stabilitas pangan." },
      { h: "Fakta unik", list: ["Sekitar 2 juta spesies sudah dideskripsikan, perkiraan total mencapai jutaan lebih.", "Segitiga Terumbu Karang di Asia Tenggara menyimpan sekitar tiga perempat spesies karang dunia.", "Lebih dari 40.000 spesies terancam punah menurut IUCN."] },
      { h: "Informasi ilmiah", p: "Indonesia termasuk negara megabiodiversitas. Ancaman utamanya adalah hilangnya habitat, perburuan, spesies invasif, polusi, dan perubahan iklim. Kawasan 'hotspot' menempati area kecil tetapi memuat banyak spesies endemik." }
    ] }
];

const PHENOMENA = [
  { title: "Hujan", icon: "cloud-rain", colors: ["#4a90d9", "#1d3f72"],
    short: "Dari uap air menjadi tetes yang jatuh ke bumi.",
    sections: [
      { h: "Penjelasan", p: "Matahari menguapkan air dari laut dan daratan. Uap naik, mendingin, lalu mengembun menjadi tetes kecil di sekitar partikel debu (inti kondensasi) dan membentuk awan. Ketika tetes bergabung hingga cukup berat, ia jatuh sebagai hujan." },
      { h: "Fakta menarik", list: ["Tetes hujan berdiameter sekitar 0,5-5 mm.", "Aroma tanah setelah hujan disebut petrikor.", "Jenis hujan: konvektif (udara naik karena panas), orografis (udara naik di lereng gunung), dan frontal."] }
    ] },
  { title: "Pelangi", icon: "rainbow", colors: ["#e86aa8", "#6a5ae8"],
    short: "Cahaya matahari yang terurai oleh tetes air.",
    sections: [
      { h: "Penjelasan", p: "Cahaya matahari masuk ke tetes air, dibelokkan (refraksi), dipantulkan di dalam tetes, lalu dibelokkan lagi saat keluar. Tiap warna dibelokkan pada sudut berbeda sehingga cahaya putih terurai menjadi spektrum." },
      { h: "Fakta menarik", list: ["Pelangi muncul saat Matahari berada di belakang pengamat dan hujan di depan.", "Sudut pelangi utama sekitar 42° dari titik berlawanan Matahari.", "Pelangi ganda terjadi karena dua kali pemantulan di dalam tetes, dengan urutan warna terbalik."] }
    ] },
  { title: "Petir", icon: "cloud-lightning", colors: ["#f2c230", "#5a3fb0"],
    short: "Pelepasan listrik raksasa di dalam awan badai.",
    sections: [
      { h: "Penjelasan", p: "Di awan badai, kristal es dan butir air saling bergesekan dan memisahkan muatan listrik. Ketika beda muatan terlalu besar, udara 'jebol' dan arus listrik mengalir sebagai kilat. Udara yang dipanaskan mendadak memuai cepat dan menimbulkan guntur." },
      { h: "Fakta menarik", list: ["Suhu kanal petir bisa puluhan ribu derajat Celsius, jauh melebihi permukaan Matahari.", "Hitung detik antara kilat dan guntur lalu bagi 3 untuk memperkirakan jarak dalam km.", "Dunia mengalami sekitar 40 sambaran per detik."] },
      { h: "Keselamatan", p: "Saat petir, masuklah ke bangunan tertutup. Hindari lapangan terbuka, pohon tinggi, dan air. Tunggu sekitar 30 menit setelah guntur terakhir sebelum keluar." }
    ] },
  { title: "Badai", icon: "tornado", colors: ["#5f6f86", "#252f40"],
    short: "Sistem angin dan hujan kuat: siklon, topan, dan badai petir.",
    sections: [
      { h: "Penjelasan", p: "Siklon tropis terbentuk di atas laut hangat (sekitar 26,5 °C atau lebih). Udara hangat lembap naik, berputar karena rotasi Bumi (efek Coriolis), dan membentuk pusaran dengan 'mata' tenang di tengahnya. Siklon tropis disebut badai (hurricane) di Atlantik, topan (typhoon) di Pasifik Barat, dan siklon di Samudra Hindia." },
      { h: "Fakta menarik", list: ["Siklon hampir tidak terbentuk tepat di khatulistiwa karena efek Coriolis sangat lemah di sana.", "Indonesia jarang dilanda siklon langsung, tetapi bisa terkena dampak tidak langsung berupa hujan dan angin kencang.", "Skala Saffir-Simpson mengelompokkan kekuatan badai dari kategori 1 sampai 5."] }
    ] },
  { title: "Tsunami", icon: "waves", colors: ["#1a7fc4", "#0b2f5c"],
    short: "Gelombang laut raksasa akibat gangguan besar di dasar laut.",
    sections: [
      { h: "Penjelasan", p: "Tsunami muncul ketika sejumlah besar air terdorong, biasanya oleh gempa bawah laut, longsor bawah laut, atau letusan gunung berapi. Di laut dalam gelombangnya rendah tetapi sangat cepat (sekitar 800 km/jam); saat mendekati pantai yang dangkal, kecepatan turun dan tinggi gelombang meningkat tajam." },
      { h: "Fakta menarik", list: ["Tsunami Samudra Hindia 2004 dipicu gempa sekitar M9,1 dan menewaskan sekitar 230.000 orang.", "Surutnya air laut secara mendadak bisa menjadi tanda alami tsunami.", "Tsunami berupa rangkaian gelombang, bukan satu gelombang saja."] },
      { h: "Keselamatan", p: "Jika terasa gempa kuat di pantai atau air laut surut tiba-tiba, segera menuju tempat tinggi tanpa menunggu peringatan resmi." }
    ] },
  { title: "Gempa Bumi", icon: "activity", colors: ["#a1704a", "#4a2c1a"],
    short: "Getaran kerak bumi akibat pelepasan energi di sesar.",
    sections: [
      { h: "Penjelasan", p: "Lempeng tektonik terus bergerak dan saling menekan. Ketika tegangan di sesar melampaui kekuatan batuan, batuan patah dan energi dilepas sebagai gelombang seismik. Titik asalnya disebut hiposentrum, titik di permukaan di atasnya disebut episentrum." },
      { h: "Fakta menarik", list: ["Tiap kenaikan 1 magnitudo berarti amplitudo getaran 10 kali dan energi sekitar 32 kali lebih besar.", "Gempa terkuat yang tercatat: Chile 1960, M9,5.", "Indonesia berada di pertemuan tiga lempeng besar: Indo-Australia, Eurasia, dan Pasifik."] },
      { h: "Keselamatan", p: "Lakukan Drop, Cover, Hold On: merunduk, berlindung di bawah meja kokoh, dan berpegangan. Jauhi kaca dan benda yang bisa jatuh." }
    ] },
  { title: "Letusan Gunung Berapi", icon: "flame", colors: ["#e8573a", "#4a1410"],
    short: "Magma, gas, dan abu menyembur dari perut bumi.",
    sections: [
      { h: "Penjelasan", p: "Magma yang naik melepaskan gas terlarut. Bila tekanan gas besar dan magma kental, letusan menjadi eksplosif dan menghasilkan abu, awan panas (aliran piroklastik), dan lontaran batu. Bila magma encer, lava mengalir perlahan." },
      { h: "Fakta menarik", list: ["Awan panas dapat meluncur ratusan km/jam dan sangat mematikan.", "Hujan lebat dapat memicu lahar, yaitu aliran lumpur vulkanik.", "Skala VEI (Volcanic Explosivity Index) mengukur kekuatan letusan dari 0 sampai 8."] },
      { h: "Keselamatan", p: "Patuhi status dan radius bahaya dari PVMBG. Gunakan masker saat hujan abu dan jauhi alur sungai di lereng gunung." }
    ] },
  { title: "Aurora", icon: "sparkles", colors: ["#3de0a0", "#4a2fa8"],
    short: "Cahaya hijau dan ungu yang menari di langit kutub.",
    sections: [
      { h: "Penjelasan", p: "Angin Matahari membawa partikel bermuatan yang dibelokkan medan magnet Bumi ke arah kutub. Saat menabrak atom oksigen dan nitrogen di atmosfer atas, atom-atom itu memancarkan cahaya. Oksigen memberi warna hijau dan merah, nitrogen memberi biru dan ungu." },
      { h: "Fakta menarik", list: ["Di utara disebut aurora borealis, di selatan aurora australis.", "Aurora paling sering terlihat di lintang sekitar 65-70°.", "Aktivitas aurora meningkat saat Matahari aktif (badai Matahari)."] }
    ] },
  { title: "El Niño & La Niña", icon: "thermometer-sun", colors: ["#e89a3a", "#2f6fb8"],
    short: "Pergeseran suhu laut Pasifik yang mengubah cuaca dunia.",
    sections: [
      { h: "Penjelasan", p: "Keduanya bagian dari ENSO (El Niño-Southern Oscillation). Saat El Niño, angin pasat melemah dan air hangat bergeser ke Pasifik tengah-timur. Saat La Niña, angin pasat menguat dan air hangat menumpuk di Pasifik barat dekat Indonesia." },
      { h: "Dampak di Indonesia", list: ["El Niño cenderung membuat Indonesia lebih kering, meningkatkan risiko kekeringan dan kebakaran lahan.", "La Niña cenderung membuat Indonesia lebih basah, meningkatkan risiko banjir.", "Siklusnya terjadi tidak teratur, sekitar setiap 2-7 tahun."] },
      { h: "Memantau", p: "Untuk status terbaru, lihat BMKG atau NOAA Climate Prediction Center." }
    ] },
  { title: "Perubahan Iklim", icon: "globe", colors: ["#e8743a", "#8a1f2a"],
    short: "Pemanasan jangka panjang akibat gas rumah kaca.",
    sections: [
      { h: "Penjelasan", p: "Gas rumah kaca seperti CO₂ dan metana menahan panas di atmosfer. Pembakaran bahan bakar fosil, penggundulan hutan, dan pertanian meningkatkan jumlah gas ini sehingga suhu rata-rata Bumi naik." },
      { h: "Fakta penting", list: ["Suhu global rata-rata sudah naik sekitar 1,1-1,2 °C dibanding masa pra-industri.", "Kadar CO₂ naik dari sekitar 280 ppm menjadi lebih dari 420 ppm.", "Permukaan laut naik sekitar 20 cm sejak 1900."] },
      { h: "Tujuan global", p: "Perjanjian Paris menargetkan kenaikan suhu jauh di bawah 2 °C, dengan upaya menahan di 1,5 °C." }
    ] }
];

const EDUCATION = [
  { title: "Pemanasan Global", icon: "thermometer-sun", colors: ["#e8743a", "#8a1f2a"],
    short: "Naiknya suhu rata-rata Bumi akibat gas rumah kaca.",
    sections: [
      { h: "Penyebab", p: "Pembakaran batu bara, minyak, dan gas, serta penggundulan hutan, melepaskan CO₂ dalam jumlah besar ke atmosfer." },
      { h: "Dampak", list: ["Es kutub dan gletser mencair, permukaan laut naik.", "Cuaca ekstrem lebih sering: gelombang panas, banjir, kekeringan.", "Terumbu karang memutih dan ekosistem terganggu."] },
      { h: "Yang bisa dilakukan", list: ["Hemat listrik dan pilih alat berefisiensi tinggi.", "Kurangi perjalanan dengan kendaraan pribadi.", "Dukung energi bersih dan tanam pohon."] }
    ] },
  { title: "Pencemaran Udara", icon: "factory", colors: ["#7a8594", "#3a424f"],
    short: "Partikel dan gas berbahaya yang mengotori udara.",
    sections: [
      { h: "Penyebab", p: "Asap kendaraan, industri, pembakaran sampah, dan kebakaran hutan menghasilkan partikel halus (PM2,5) dan gas seperti NO₂ dan SO₂." },
      { h: "Dampak", list: ["Gangguan pernapasan, asma, dan penyakit jantung.", "Hujan asam yang merusak tanaman dan bangunan.", "Kabut asap yang mengganggu jarak pandang."] },
      { h: "Yang bisa dilakukan", list: ["Gunakan transportasi umum, sepeda, atau berjalan kaki.", "Jangan membakar sampah.", "Pantau AQI di halaman Cuaca dan pakai masker saat udara tidak sehat."] }
    ] },
  { title: "Pencemaran Laut", icon: "waves", colors: ["#1d8fb0", "#1a3f66"],
    short: "Sampah plastik, limbah, dan tumpahan minyak di lautan.",
    sections: [
      { h: "Penyebab", p: "Sekitar 8 juta ton plastik masuk ke laut setiap tahun, ditambah limbah industri, limbah rumah tangga, pupuk dari pertanian, dan tumpahan minyak." },
      { h: "Dampak", list: ["Hewan laut terjerat atau menelan plastik.", "Mikroplastik masuk ke rantai makanan hingga ke manusia.", "Kelebihan nutrien memicu ledakan alga dan zona laut kekurangan oksigen."] },
      { h: "Yang bisa dilakukan", list: ["Kurangi plastik sekali pakai.", "Buang sampah pada tempatnya, jangan ke sungai.", "Ikut bersih-bersih pantai dan pilih produk laut berkelanjutan."] }
    ] },
  { title: "Deforestasi", icon: "trees", colors: ["#a0652a", "#4a3015"],
    short: "Hilangnya hutan akibat penebangan dan alih fungsi lahan.",
    sections: [
      { h: "Penyebab", p: "Pembukaan lahan untuk perkebunan, pertambangan, pertanian, permukiman, penebangan liar, dan kebakaran hutan. Dunia kehilangan sekitar 10 juta hektare hutan per tahun pada periode 2015-2020 (data FAO)." },
      { h: "Dampak", list: ["Hilangnya habitat satwa dan keanekaragaman hayati.", "Emisi karbon meningkat karena pohon dan tanah melepas karbon.", "Banjir dan longsor lebih mudah terjadi."] },
      { h: "Yang bisa dilakukan", list: ["Pilih produk kayu dan kertas bersertifikat.", "Kurangi konsumsi kertas dan daur ulang.", "Dukung program reboisasi."] }
    ] },
  { title: "Pelestarian Hutan", icon: "sprout", colors: ["#3fae5a", "#1a5a30"],
    short: "Menjaga dan memulihkan hutan untuk masa depan.",
    sections: [
      { h: "Mengapa penting", p: "Hutan menyimpan karbon, menjaga tata air, mencegah erosi, menjadi habitat satwa, dan menjadi sumber penghidupan masyarakat adat dan lokal." },
      { h: "Upaya utama", list: ["Kawasan konservasi seperti taman nasional dan cagar alam.", "Reboisasi dan restorasi mangrove serta gambut.", "Pengelolaan hutan lestari dan perhutanan sosial."] },
      { h: "Yang bisa dilakukan", list: ["Menanam dan merawat pohon di lingkungan sekitar.", "Menjaga hutan dari api: jangan membuang puntung rokok sembarangan.", "Mendukung organisasi pelestarian hutan."] }
    ] },
  { title: "Satwa Langka", icon: "paw-print", colors: ["#d98a3a", "#6a3a14"],
    short: "Hewan yang terancam punah dan perlu perlindungan.",
    sections: [
      { h: "Contoh di Indonesia", list: ["Orangutan (Kalimantan dan Sumatra).", "Harimau Sumatra.", "Badak Jawa, dengan jumlah kurang dari 100 individu.", "Gajah Sumatra dan burung cenderawasih."] },
      { h: "Ancaman", p: "Hilangnya habitat, perburuan dan perdagangan ilegal, konflik dengan manusia, serta perubahan iklim." },
      { h: "Yang bisa dilakukan", list: ["Jangan membeli atau memelihara satwa liar dilindungi.", "Laporkan perdagangan satwa ilegal.", "Dukung konservasi dan wisata alam yang bertanggung jawab."] }
    ] },
  { title: "Energi Terbarukan", icon: "wind", colors: ["#3fc4d9", "#1a5f9e"],
    short: "Energi dari sumber alam yang tidak habis.",
    sections: [
      { h: "Jenis utama", list: ["Surya: mengubah cahaya matahari menjadi listrik.", "Angin: turbin memutar generator.", "Air (hidro) dan panas bumi (geotermal).", "Biomassa dan biofuel."] },
      { h: "Mengapa penting", p: "Energi terbarukan menghasilkan emisi karbon jauh lebih rendah daripada bahan bakar fosil. Indonesia berada di Cincin Api dan memiliki potensi panas bumi yang termasuk terbesar di dunia, serta sinar matahari melimpah sepanjang tahun." },
      { h: "Yang bisa dilakukan", list: ["Gunakan lampu LED dan peralatan hemat energi.", "Pertimbangkan panel surya atap bila memungkinkan.", "Dukung kebijakan dan produk berenergi bersih."] }
    ] },
  { title: "Cara Menjaga Lingkungan", icon: "recycle", colors: ["#4cc27a", "#1f6a4a"],
    short: "Langkah kecil sehari-hari yang berdampak besar.",
    sections: [
      { h: "Prinsip 5R", list: ["Refuse: tolak yang tidak perlu (kantong plastik, sedotan).", "Reduce: kurangi pemakaian.", "Reuse: pakai ulang.", "Recycle: daur ulang.", "Rot: kompos sisa makanan."] },
      { h: "Kebiasaan harian", list: ["Bawa botol minum dan tas belanja sendiri.", "Matikan lampu dan alat listrik yang tidak dipakai.", "Hemat air saat mandi dan menyikat gigi.", "Pilah sampah organik dan anorganik."] },
      { h: "Bersama-sama", p: "Ajak keluarga, teman, dan sekolah untuk gotong royong menjaga lingkungan. Perubahan besar dimulai dari kebiasaan kecil yang dilakukan bersama." }
    ] }
];

/* Membuat kartu dan jendela detail */
function renderCards(containerId, items) {
  const box = $(containerId);
  box.innerHTML = items.map((it, i) => `
    <article class="info-card glass" tabindex="0" role="button" data-i="${i}" aria-label="Buka ${esc(it.title)}">
      <div class="thumb" style="background:linear-gradient(135deg, ${it.colors[0]}, ${it.colors[1]})">${ico(it.icon)}</div>
      <div class="body">
        <h3>${esc(it.title)}</h3>
        <p>${esc(it.short)}</p>
        <div class="more">Baca selengkapnya →</div>
      </div>
    </article>`).join("");

  const open = (el) => { if (el) openModal(items[el.dataset.i]); };
  box.addEventListener("click", (e) => open(e.target.closest(".info-card")));
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e.target.closest(".info-card")); }
  });
}

function openModal(item) {
  $("modalTitle").innerHTML = `${ico(item.icon)} ${esc(item.title)}`;
  $("modalBody").innerHTML = item.sections.map((s) => {
    let html = `<h4>${esc(s.h)}</h4>`;
    if (s.p) html += `<p>${esc(s.p)}</p>`;
    if (s.list) html += "<ul>" + s.list.map((li) => `<li>${esc(li)}</li>`).join("") + "</ul>";
    return html;
  }).join("");
  $("modal").hidden = false;
  $("modal").querySelector(".modal-box").scrollTop = 0;
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function closeModal() {
  $("modal").hidden = true;
  document.body.style.overflow = "";
}

function setupModal() {
  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ---------- 10. MULAI APLIKASI ---------- */
function init() {
  setupTheme();
  setupNavigation();
  setupSearch();
  setupMapSearch();
  setupModal();

  renderCards("natureGrid", NATURE);
  renderCards("phenomenaGrid", PHENOMENA);
  renderCards("educationGrid", EDUCATION);

  refreshIcons();
  tickClock();
  setInterval(tickClock, 1000);

  showPage(location.hash.slice(1) || "dashboard");

  // Tampilkan cuaca bawaan (Jakarta) lebih dulu agar halaman tidak kosong,
  // lalu coba pakai lokasi pengguna secara diam-diam.
  loadWeather(DEFAULT_PLACE.lat, DEFAULT_PLACE.lon, DEFAULT_PLACE.name);
  useMyLocation(true);
}

init();