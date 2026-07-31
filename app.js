import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ================================================================
   1. CONFIGURACIÓN — EDITA ESTAS DOS COSAS Y NADA MÁS
   ================================================================ */
const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com", // proyectos nuevos: "TU_PROYECTO.firebasestorage.app"
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "XXXXXXXXXXXXXXXX",
};

const ADMIN_EMAILS = ["tu-correo@gmail.com"]; // ← TU cuenta de Google (minúsculas)
/* ================================================================ */

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const storage = getStorage(fb);

const CATS = {
  juego:         { label: "Juego",         color: "#ffb454" },
  herramienta:   { label: "Herramienta",   color: "#4de3b0" },
  productividad: { label: "Productividad", color: "#62b6ff" },
  ocio:          { label: "Ocio",          color: "#ff7e67" },
};

let currentUser = null;
let apps = [];
let featuredId = null;
let installed = new Map();
let editingId = null;
let activeCat = "all";
let searchTerm = "";
let currentView = "store";

/* ---------- utilidades ---------- */
const $ = (id) => document.getElementById(id);
const val = (id) => $(id).value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3400);
}
const isAdmin = () => !!(currentUser && ADMIN_EMAILS.includes((currentUser.email || "").toLowerCase()));

/* ---------- arranque ---------- */
function runBoot() {
  const boot = $("boot"), lines = $("boot-lines");
  const skip = () => boot.classList.add("done");
  boot.addEventListener("click", skip, { once: true });
  if (sessionStorage.getItem("nexo-booted")) { setTimeout(skip, 350); return; }
  sessionStorage.setItem("nexo-booted", "1");
  (async () => {
    for (const l of [
      "> montando runtime local ............ OK",
      "> verificando firmas ................ OK",
      "> indexando almacenamiento .......... OK",
      "> conectando catálogo ...............",
    ]) { lines.textContent += l + "\n"; await sleep(180); }
    await sleep(320);
    skip();
  })();
}

/* ---------- auth ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  renderUserZone();
  $("tab-admin").hidden = !isAdmin();
  if (!isAdmin() && currentView === "admin") switchView("store");
  if (isAdmin() && currentView === "admin") renderAdmin();
});

async function login() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    toast("Sesión iniciada: " + currentUser.email);
  } catch (err) {
    if (err.code !== "popup-closed-by-user" && err.code !== "popup-blocked") {
      toast("No se pudo iniciar sesión: " + err.message, "err");
    } else if (err.code === "popup-blocked") {
      toast("El navegador bloqueó el popup de Google", "err");
    }
  }
}

function renderUserZone() {
  const zone = $("user-zone");
  if (!currentUser) {
    zone.innerHTML = `<button class="btn btn-primary" data-action="login">INICIAR SESIÓN</button>`;
    return;
  }
  zone.innerHTML = `
    ${isAdmin() ? `<span class="admin-badge">ADMIN</span>` : ""}
    ${currentUser.photoURL ? `<img class="avatar" src="${esc(currentUser.photoURL)}" alt="" referrerpolicy="no-referrer" />` : ""}
    <span class="user-name">${esc(currentUser.displayName || currentUser.email)}</span>
    <button class="btn btn-ghost btn-sm" data-action="logout">SALIR</button>`;
}

/* ---------- catálogo ---------- */
async function loadCatalog() {
  try {
    const snap = await getDocs(query(collection(db, "apps"), orderBy("createdAt", "desc")));
    apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const feats = apps.filter((a) => a.featured);
    featuredId = feats.length ? feats[Math.floor(Math.random() * feats.length)].id : null;
  } catch (err) {
    toast("Error cargando catálogo: " + err.message, "err");
    apps = [];
  }
  renderStore();
  if (currentView === "admin") renderAdmin();
}

function appIconHTML(app, cls) {
  return app.icon
    ? `<img class="${cls}-img" src="${esc(app.icon)}" alt="" />`
    : `<div class="${cls}"><span>${esc(app.emoji || "◆")}</span></div>`;
}

function renderFeatured() {
  const el = $("featured");
  const app = apps.find((a) => a.id === featuredId);
  if (!app) {
    el.innerHTML = `
      <div class="feat-body">
        <div class="mono-kicker">RUNTIME LOCAL · v1.0</div>
        <h1 class="feat-name">Las apps viven<br />en tu dispositivo</h1>
        <p class="feat-tag">Instala el paquete, ejecútalo al instante y sigue usándolo sin conexión. Aquí el servidor eres tú.</p>
        <div class="feat-meta mono-note">HTML5 · OFFLINE-FIRST · SIN INTERMEDIARIOS</div>
      </div>
      <div class="feat-side"><div class="feat-glyph">▣</div></div>`;
    return;
  }
  const cat = CATS[app.category] || CATS.herramienta;
  const inst = installed.get(app.id);
  el.innerHTML = `
    <div class="feat-body">
      <div class="mono-kicker" style="color:${cat.color}">★ DESTACADO · ${cat.label.toUpperCase()}</div>
      <h1 class="feat-name">${esc(app.name)}</h1>
      <p class="feat-tag">${esc(app.tagline || "")}</p>
      <div class="feat-actions">
        <button class="btn btn-primary" data-action="${inst ? "run" : "install"}" data-id="${app.id}">${inst ? "▶ EJECUTAR" : "⭳ INSTALAR"}</button>
        <button class="btn btn-ghost" data-action="open" data-id="${app.id}">DETALLES</button>
      </div>
      <div class="feat-meta mono-note">v${esc(app.version)} · ${fmtSize(app.size)} · ${app.downloads || 0} DESCARGAS</div>
    </div>
    <div class="feat-side" style="--cat:${cat.color}">
      <div class="feat-icon-wrap">${app.icon ? `<img src="${esc(app.icon)}" alt="" />` : `<span>${esc(app.emoji || "◆")}</span>`}</div>
    </div>`;
}

function tileHTML(app, i) {
  const cat = CATS[app.category] || CATS.herramienta;
  const inst = installed.get(app.id);
  return `
  <article class="tile" data-action="open" data-id="${app.id}" style="--cat:${cat.color}; animation-delay:${i * 45}ms">
    <div class="tile-top">
      ${appIconHTML(app, "tile-icon")}
      ${inst ? `<button class="tile-run" data-action="run" data-id="${app.id}" title="Ejecutar ahora">▶</button>` : ""}
    </div>
    <h4 class="tile-name">${esc(app.name)}</h4>
    <p class="tile-tag">${esc(app.tagline || "")}</p>
    <div class="tile-foot mono-note">
      <span>v${esc(app.version || "1.0.0")}</span>
      <span style="color:${cat.color}">${cat.label.toUpperCase()}</span>
      ${inst ? `<span class="tile-installed">✓ LOCAL</span>` : `<span>${fmtSize(app.size)}</span>`}
    </div>
  </article>`;
}

function renderStore() {
  renderFeatured();
  const term = searchTerm.toLowerCase();
  const list = apps.filter((a) =>
    (activeCat === "all" || a.category === activeCat) &&
    ((a.name || "").toLowerCase().includes(term) || (a.tagline || "").toLowerCase().includes(term))
  );
  $("grid-apps").innerHTML = list.map(tileHTML).join("");
  $("store-empty").hidden = list.length > 0;
}

/* ---------- biblioteca ---------- */
async function loadInstalled() {
  const metas = await NexoIDB.getAllMeta();
  installed = new Map(metas.map((m) => [m.id, m]));
  $("lib-count").textContent = installed.size;
}

function renderLibrary() {
  const metas = [...installed.values()];
  $("lib-count").textContent = metas.length;
  $("lib-storage").textContent = metas.length
    ? fmtSize(metas.reduce((s, m) => s + (m.size || 0), 0)) + " EN TU DISPOSITIVO"
    : "";
  $("lib-empty").hidden = metas.length > 0;
  $("grid-library").innerHTML = metas.map((m) => {
    const app = apps.find((a) => a.id === m.id) || {};
    const cat = CATS[app.category] || CATS.herramienta;
    return `
    <article class="tile lib-tile" style="--cat:${cat.color}">
      <div class="tile-top">${appIconHTML(app, "tile-icon")}</div>
      <h4 class="tile-name">${esc(m.name)}</h4>
      <div class="mono-note" style="margin-bottom:4px">v${esc(m.version)} · ${fmtSize(m.size)}</div>
      <div class="mono-note">instalada ${new Date(m.installedAt).toLocaleDateString("es")}</div>
      <div class="lib-actions">
        <button class="btn btn-primary btn-sm" data-action="run" data-id="${m.id}">▶ EJECUTAR</button>
        <button class="btn btn-danger btn-sm" data-action="uninstall" data-id="${m.id}">DESINSTALAR</button>
      </div>
    </article>`;
  }).join("");
}

function renderAll() { renderStore(); renderLibrary(); }

/* ---------- instalar / ejecutar / desinstalar ---------- */
async function installApp(app) {
  if (installed.has(app.id)) return runApp(app);
  toast(`Descargando ${app.name}…`, "info");
  try {
    const res = await fetch(app.packageUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const zip = await JSZip.loadAsync(await res.blob());

    let entries = Object.values(zip.files).filter((f) => !f.dir);
    if (!entries.length) throw new Error("El zip está vacío");

    // Si el zip trae una sola carpeta raíz (típico de GitHub), la quitamos
    let base = "";
    const first = entries[0].name.indexOf("/");
    if (first > 0) {
      const candidate = entries[0].name.slice(0, first + 1);
      if (entries.every((e) => e.name.startsWith(candidate))) base = candidate;
    }

    let total = 0;
    for (const entry of entries) {
      const rel = entry.name.slice(base.length);
      if (!rel) continue;
      const blob = await entry.async("blob");
      total += blob.size;
      await NexoIDB.putFile(`${app.id}/${rel}`, blob);
    }

    if (!(await NexoIDB.getFile(`${app.id}/index.html`))) {
      throw new Error("El paquete no contiene index.html en la raíz");
    }

    await NexoIDB.putMeta({ id: app.id, name: app.name, version: app.version || "1.0.0", size: total, installedAt: Date.now() });
    installed.set(app.id, { id: app.id, name: app.name, version: app.version || "1.0.0", size: total });

    updateDoc(doc(db, "apps", app.id), { downloads: increment(1) }).catch(() => {});
    app.downloads = (app.downloads || 0) + 1;

    toast(`${app.name} instalada — arrancando…`);
    renderAll();
    runApp(app);
  } catch (err) {
    await NexoIDB.deleteFilesByPrefix(app.id).catch(() => {});
    toast("Fallo en la instalación: " + err.message, "err");
  }
}

function runApp(appOrMeta) {
  closeModal();
  const meta = installed.get(appOrMeta.id) || appOrMeta;
  if (!installed.has(appOrMeta.id)) { toast("Primero instala esta app", "warn"); return; }
  $("runner-name").textContent = `▶ ${meta.name} — sirviéndose en local desde este dispositivo`;
  $("runner-frame").src = `/run/${encodeURIComponent(appOrMeta.id)}/index.html`;
  $("runner").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeRunner() {
  if ($("runner").hidden) return;
  $("runner").hidden = true;
  $("runner-frame").src = "about:blank";
  document.body.style.overflow = "";
}

async function uninstallApp(id) {
  const meta = installed.get(id);
  await NexoIDB.deleteFilesByPrefix(id);
  await NexoIDB.deleteMeta(id);
  installed.delete(id);
  toast(`${meta?.name || "App"} desinstalada`, "warn");
  closeModal();
  renderAll();
}

/* ---------- modal ---------- */
function openModal(id) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const cat = CATS[app.category] || CATS.herramienta;
  const inst = installed.get(id);
  $("modal-card").innerHTML = `
    <button class="modal-close" data-action="close-modal">✕</button>
    <div class="modal-head">
      ${app.icon ? `<div class="modal-icon" style="--glow:${cat.color}"><img src="${esc(app.icon)}" alt="" /></div>`
                 : `<div class="modal-icon" style="--glow:${cat.color}">${esc(app.emoji || "◆")}</div>`}
      <div>
        <div class="mono-note">${cat.label.toUpperCase()} · v${esc(app.version || "1.0.0")} · ${fmtSize(app.size)}</div>
        <h3>${esc(app.name)}</h3>
        <p class="tagline">${esc(app.tagline || "")}</p>
      </div>
    </div>
    <p class="modal-desc">${esc(app.description || "Sin descripción.")}</p>
    <div class="modal-meta mono-note">${app.downloads || 0} DESCARGAS · SE EJECUTA 100% EN TU DISPOSITIVO</div>
    <div class="modal-actions">
      ${inst
        ? `<button class="btn btn-primary" data-action="run" data-id="${id}">▶ EJECUTAR</button>
           <button class="btn btn-danger" data-action="uninstall" data-id="${id}">DESINSTALAR</button>`
        : `<button class="btn btn-primary" data-action="install" data-id="${id}">⭳ INSTALAR (${fmtSize(app.size)})</button>`}
    </div>`;
  $("modal").hidden = false;
}
function closeModal() { $("modal").hidden = true; }

/* ---------- admin ---------- */
function renderAdmin() {
  if (!isAdmin()) return;
  $("admin-count").textContent = apps.length;
  const totalDl = apps.reduce((s, a) => s + (a.downloads || 0), 0);
  const totalBytes = apps.reduce((s, a) => s + (a.size || 0), 0);
  $("admin-stats").innerHTML = `
    <div class="stat"><span class="stat-n">${apps.length}</span><span class="stat-l">APPS PUBLICADAS</span></div>
    <div class="stat"><span class="stat-n">${totalDl}</span><span class="stat-l">DESCARGAS TOTALES</span></div>
    <div class="stat"><span class="stat-n">${fmtSize(totalBytes)}</span><span class="stat-l">PESAN EN STORAGE</span></div>`;
  $("admin-list").innerHTML = apps.length
    ? apps.map((a) => `
      <div class="adm-row">
        ${a.icon ? `<img class="adm-icon" src="${esc(a.icon)}" alt="" />` : `<div class="adm-icon adm-icon-emoji">${esc(a.emoji || "◆")}</div>`}
        <div class="adm-info">
          <strong>${esc(a.name)} ${a.featured ? `<span class="feat-star">★</span>` : ""}</strong>
          <span class="mono-note">v${esc(a.version)} · ${(CATS[a.category] || {}).label || a.category} · ${fmtSize(a.size)} · ${a.downloads || 0} dl</span>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${a.id}">EDITAR</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${a.id}">BORRAR</button>
      </div>`).join("")
    : `<p class="empty-note">Aún no has publicado nada. Estrena la tienda con el formulario.</p>`;
}

function editApp(id) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  editingId = id;
  $("f-name").value = app.name || "";
  $("f-tagline").value = app.tagline || "";
  $("f-desc").value = app.description || "";
  $("f-cat").value = app.category || "juego";
  $("f-version").value = app.version || "1.0.0";
  $("f-emoji").value = app.emoji || "";
  $("f-featured").checked = !!app.featured;
  $("form-title").textContent = "EDITANDO: " + (app.name || "").toUpperCase();
  $("btn-submit").textContent = "GUARDAR CAMBIOS";
  $("btn-cancel").hidden = false;
  $("f-zip-hint").textContent = "(opcional — vacío conserva el paquete actual)";
  $("app-form").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  $("app-form").reset();
  $("f-version").value = "1.0.0";
  editingId = null;
  $("form-title").textContent = "PUBLICAR NUEVA APP";
  $("btn-submit").textContent = "PUBLICAR";
  $("btn-cancel").hidden = true;
  $("f-zip-hint").textContent = "(obligatorio al crear)";
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadPackage(appId, file) {
  const storageRef = ref(storage, `packages/${appId}.zip`);
  await uploadBytes(storageRef, file, { contentType: "application/zip" });
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, "apps", appId), { packageUrl: url, size: file.size, packageName: file.name });
}

async function submitApp(e) {
  e.preventDefault();
  if (!isAdmin()) return;

  const data = {
    name: val("f-name").trim(),
    tagline: val("f-tagline").trim(),
    description: val("f-desc").trim(),
    category: val("f-cat"),
    version: val("f-version").trim() || "1.0.0",
    emoji: val("f-emoji").trim() || "◆",
    featured: $("f-featured").checked,
    updatedAt: Date.now(),
  };
  if (!data.name) return toast("Ponle nombre a la app", "err");

  const iconFile = $("f-icon").files[0];
  const zipFile = $("f-zip").files[0];
  const btn = $("btn-submit");

  try {
    if (iconFile) data.icon = await resizeImage(iconFile, 128);
    btn.disabled = true;

    if (editingId) {
      btn.textContent = "GUARDANDO…";
      await updateDoc(doc(db, "apps", editingId), data);
      if (zipFile) await uploadPackage(editingId, zipFile);
      toast("App actualizada");
    } else {
      if (!zipFile) throw new Error("Una app nueva necesita su paquete .zip");
      btn.textContent = "PUBLICANDO…";
      data.createdAt = Date.now();
      data.downloads = 0;
      const newDoc = await addDoc(collection(db, "apps"), data);
      await uploadPackage(newDoc.id, zipFile);
      toast("¡App publicada en la tienda!");
    }
    resetForm();
    await loadCatalog();
  } catch (err) {
    toast("Error: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? "GUARDAR CAMBIOS" : "PUBLICAR";
  }
}

async function deleteApp(id) {
  const app = apps.find((a) => a.id === id);
  if (!confirm(`¿Borrar "${app?.name}" de la tienda? Esta acción no se puede deshacer.`)) return;
  try { await deleteObject(ref(storage, `packages/${id}.zip`)); } catch (_) { /* ya no existía */ }
  await deleteDoc(doc(db, "apps", id));
  toast("App eliminada de la tienda", "warn");
  loadCatalog();
}

/* ---------- navegación ---------- */
function switchView(view) {
  if (view === "admin" && !isAdmin()) return;
  currentView = view;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  $("search-wrap").style.visibility = view === "store" ? "visible" : "hidden";
  if (view === "library") renderLibrary();
  if (view === "admin") renderAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- eventos globales ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  const id = t.dataset.id;
  const app = apps.find((a) => a.id === id);

  switch (action) {
    case "tab":        switchView(t.dataset.view); break;
    case "chip":
      activeCat = t.dataset.cat;
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === t));
      renderStore();
      break;
    case "login":      login(); break;
    case "logout":     await signOut(auth); toast("Sesión cerrada", "info"); break;
    case "open":       openModal(id); break;
    case "close-modal": closeModal(); break;
    case "install":    if (app) installApp(app); break;
    case "run":        runApp(app || installed.get(id)); break;
    case "close-runner": closeRunner(); break;
    case "uninstall":  uninstallApp(id); break;
    case "edit":       editApp(id); break;
    case "delete":     deleteApp(id); break;
  }
});

$("search").addEventListener("input", (e) => { searchTerm = e.target.value; renderStore(); });
$("app-form").addEventListener("submit", submitApp);
$("btn-cancel").addEventListener("click", resetForm);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeRunner(); closeModal(); }
});

function updateNet() {
  const led = $("net-led");
  led.classList.toggle("off", !navigator.onLine);
  led.querySelector("span").textContent = navigator.onLine ? "EN LÍNEA" : "OFFLINE";
}
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);

/* ---------- init ---------- */
(async function init() {
  runBoot();
  updateNet();
  renderUserZone();
  await loadInstalled();
  await loadCatalog();
  renderLibrary();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .then(() => console.log("[NEXO] service worker activo — el dispositivo es el servidor"))
      .catch((err) => console.warn("[NEXO] SW no registrado:", err));
  }
})();
