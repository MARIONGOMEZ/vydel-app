/* Vydel — cache de l’appli + veille du blob chiffré (aucun nom hors appareil). */
const CACHE = "tournee-shell-1.99.12-app";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css?v=1.99.12-app",
  "./css/leaflet.css",
  "./css/leaflet.css?v=1.99.12-app",
  "./js/app.js",
  "./js/app.js?v=1.99.12-app",
  "./js/import.js",
  "./js/import.js?v=1.99.12-app",
  "./js/leaflet.js",
  "./js/leaflet.js?v=1.99.12-app",
  "./js/mqtt.min.js",
  "./js/mqtt.min.js?v=1.99.12-app",
  "./js/mqtt-lite.js",
  "./js/mqtt-lite.js?v=1.99.12-app",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
const IDB_NAME = "tournee-idb";
const JSONBLOB = "https://jsonblob.com/api/jsonBlob";
const POLL_MS = 18000;

let pollTimer = null;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of SHELL) {
      try { await cache.add(u); } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => startWatch())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Version check: network only, jamais de cache stale (sinon la fenêtre MAJ ne sort pas)
  if (url.searchParams.has("tourneeCheck") || (url.searchParams.has("t") && url.pathname.endsWith(".html") && req.mode !== "navigate")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }
  const isDoc = req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/") || url.pathname === "" || url.pathname.endsWith("/js/app.js") || url.pathname.endsWith("/js/import.js") || url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/css/app.css");
  const net = fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  });
  if (isDoc || req.mode === "navigate") {
    event.respondWith(net.catch(async () => {
      const cached = await caches.match(req) || await caches.match("./index.html") || await caches.match("./");
      return cached || Response.error();
    }));
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => net.catch(() => cached).then((res) => res || cached))
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "START_WATCH") startWatch();
  if (msg.type === "STOP_WATCH") stopWatch();
  if (msg.type === "NOTIFY" && msg.body) {
    event.waitUntil(self.registration.showNotification(msg.title || "Vydel", {
      body: msg.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: msg.tag || "tournee",
      renotify: true
    }));
  }
  if (msg.type === "SKIP_WAIT") self.skipWaiting();
});

/* Notifications push (1.99.3) : le serveur n’envoie que le type ("tx" | "msg"), jamais de nom ni de texte. */
const PUSH_TEXT = {
  tx: "Nouvelle transmission dans ton cabinet",
  msg: "Nouveau message dans ton cabinet",
  /* 1.99.8 : envoyé par le serveur des essais deux jours avant la fin de l’essai de 14 jours */
  essai2: "Attention, il vous reste deux jours pour utiliser Vydel. Notez qu'à la fin de ces deux jours, l'application sera bloquée et vous avez 30 jours pour récupérer vos données."
};
self.addEventListener("push", (event) => {
  let k = "";
  try { k = (event.data && event.data.json() || {}).k || ""; } catch (e) {}
  const body = PUSH_TEXT[k] || "Du nouveau dans ton cabinet";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((c) => {
      try { c.postMessage({ type: k === "essai2" ? "ESSAI_J2" : (k === "msg" ? "REMOTE_MSG" : "REMOTE_TX") }); } catch (e) {}
    });
    await self.registration.showNotification("Vydel", {
      body: body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: "tournee-push-" + (PUSH_TEXT[k] ? k : "x"),
      renotify: true,
      data: { k: k }
    });
    if (k !== "essai2") await bumpAppBadge();
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const p = await idbGet("push");
    if (!p || !p.g || !p.url) return;
    const vk = await fetch(p.url + "/vapid", { cache: "no-store" }).then((r) => r.json());
    const s = String(vk.k).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "===".slice((s.length + 3) % 4));
    const key = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) key[i] = bin.charCodeAt(i);
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON();
    await fetch(p.url + "/sub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ g: p.g, sub: { endpoint: j.endpoint, keys: j.keys } }) });
  })().catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

function startWatch() {
  stopWatch();
  pollTimer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
}

function stopWatch() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readonly");
        const r = tx.objectStore("kv").get(key);
        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
        r.onerror = () => reject(r.error);
      })
  );
}

function idbPut(key, val) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(val, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

function unb64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function decryptEnvelope(env, aesKey) {
  const iv = unb64(env.iv);
  const ct = unb64(env.ct);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function faitIds(data) {
  const day = todayISO();
  const ids = [];
  const done = (data && data.done) || {};
  Object.keys(done).forEach((id) => {
    if (done[id] && done[id].d === day) ids.push(id);
  });
  ids.sort();
  return ids;
}

function recHasTxContent(rec) {
  if (!rec) return false;
  if (String(rec.text || "").trim()) return true;
  return (rec.voices || []).some((v) => v && v.id && !v.deletedAt);
}

function maxTxStamp(data) {
  let max = 0;
  const tx = (data && data.transmissions) || {};
  Object.keys(tx).forEach((day) => {
    const rec = tx[day];
    if (!recHasTxContent(rec)) return;
    const t = rec.updatedAt || 0;
    if (t > max) max = t;
  });
  const ptx = (data && data.patientTx) || {};
  Object.keys(ptx).forEach((pid) => {
    const days = ptx[pid] || {};
    Object.keys(days).forEach((day) => {
      const rec = days[day];
      if (!rec || !String(rec.text || "").trim()) return;
      const t = rec.updatedAt || 0;
      if (t > max) max = t;
    });
  });
  return max;
}

function maxOtherMsgT(data, myName) {
  let max = 0;
  ((data && data.messages) || []).forEach((m) => {
    if (!m || m.deletedAt) return;
    if (myName && m.from === myName) return;
    const t = m.t || 0;
    if (t > max) max = t;
  });
  return max;
}

function displayName(p) {
  return ((p.prenom || "") + " " + (p.nom || "")).trim() || "Passage";
}

async function tick() {
  const aesKey = await idbGet("cryptoKey");
  const watch = (await idbGet("watch")) || {};
  if (!aesKey || !watch.blobId) return;
  const share = watch.blobUrl || (JSONBLOB + "/" + encodeURIComponent(watch.blobId));
  const res = await fetch(share, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) return;
  const env = await res.json();
  if (!env || !env.ct || !env.iv) return;
  const data = await decryptEnvelope(env, aesKey);
  const ids = faitIds(data);
  const names = {};
  (data.patients || []).forEach((p) => {
    if (p && p.id) names[p.id] = displayName(p);
  });
  const day = todayISO();
  let prev = Array.isArray(watch.lastFait) ? watch.lastFait.slice() : [];
  if (watch.day && watch.day !== day) prev = ids.slice();
  const seen = {};
  prev.forEach((id) => { seen[id] = true; });
  const grown = ids.filter((id) => !seen[id]);
  const remoteTx = maxTxStamp(data);
  const prevTx = typeof watch.lastTx === "number" ? watch.lastTx : null;
  const txNewer = prevTx !== null && remoteTx > prevTx;
  const remoteMsg = maxOtherMsgT(data, watch.myName || "");
  const prevMsg = typeof watch.lastMsg === "number" ? watch.lastMsg : null;
  const msgNewer = prevMsg !== null && remoteMsg > prevMsg;
  watch.lastFait = ids;
  watch.names = {}; /* 1.91 : plus de noms en clair dans IndexedDB */
  watch.day = day;
  watch.lastTx = Math.max(watch.lastTx || 0, remoteTx);
  watch.lastMsg = Math.max(watch.lastMsg || 0, remoteMsg);
  await idbPut("watch", watch);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const focused = clients.some((c) => c.focused);
  if (grown.length) {
    const label = grown.map((id) => names[id] || "Passage");
    const body = label.length === 1
      ? label[0] + " — fait"
      : label.length + " passages cochés : " + label.join(", ");
    clients.forEach((c) => {
      try { c.postMessage({ type: "REMOTE_FAIT", ids: grown }); } catch (e) {}
    });
    if (!focused) await showFaitNotif(body);
  }
  if (txNewer) {
    clients.forEach((c) => {
      try { c.postMessage({ type: "REMOTE_TX" }); } catch (e) {}
    });
    if (!focused) { await showTxNotif(); await bumpAppBadge(); }
  }
  if (msgNewer) {
    clients.forEach((c) => {
      try { c.postMessage({ type: "REMOTE_MSG" }); } catch (e) {}
    });
    if (!focused) { await showMsgNotif(); await bumpAppBadge(); }
  }
}


function bumpAppBadge() {
  try {
    if (self.navigator && self.navigator.setAppBadge) {
      return self.navigator.setAppBadge();
    }
  } catch (e) {}
  return Promise.resolve();
}

function showFaitNotif(body) {
  return self.registration.showNotification("Vydel", {
    body: body,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "tournee-fait",
    renotify: true
  });
}

function showTxNotif() {
  return self.registration.showNotification("Vydel", {
    body: "Nouvelle transmission",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "tournee-tx",
    renotify: true
  });
}

function showMsgNotif() {
  return self.registration.showNotification("Vydel", {
    body: "Nouveau message",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "tournee-msg",
    renotify: true
  });
}
