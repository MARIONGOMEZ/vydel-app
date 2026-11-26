/* Vydel — checklist IDEL. Vanilla JS. Ne pas journaliser de données patient. */
(function () {
  "use strict";

  var LS_META = "tournee.meta";
  var LS_ENC = "tournee.enc";
  var LS_INSTALL = "tournee.installHide";
  var LS_SHARE_BANNER = "tournee.shareHide";
  var LS_NOTIF_ASKED = "tournee.notifAsked";
  var LS_CGU = "tournee.cguAccepted";
  var LS_NAME = "tournee.displayName";
  var LS_MSG_SEEN = "tournee.msgSeen";
  var LS_TX_SEEN = "tournee.txSeen";
  var LS_TUTO = "tournee.tutoSeen";
  var LS_NAV_APP = "tournee-nav-app";
  var IDB_NAME = "tournee-idb";
  var JSONBLOB = "https://jsonblob.com/api/jsonBlob";
  var JSONSTORAGE = "https://api.jsonstorage.net/v1/json";
  var MAX_FAMILLE = 10;
  var POLL_MS = 18000;
  var PUT_DEBOUNCE = 1400;
  var LOCK_HIDDEN_MS = 900000;
  var PBKDF2_ITERS = 100000;
  var APP_VER = "1.99.3-app";
  var CGU_VER = "8"; /* 8 : section « Chiffrement de vos données » (1.91) — fait relire les CGU */

  var $ = function (id) { return document.getElementById(id); };
  var meta = null;
  var key = null;
  var state = emptyState();
  var pinBuf = "";
  var NEW_CABINET_PIN_LEN = 6; /* nouveaux cabinets seulement (1.96) */
  var pinMode = "unlock"; /* setup | confirm | unlock | change-old | change-setup | change-confirm */
  var pinFirst = "";
  var editingId = null;
  var confirmFn = null;
  var putTimer = null;
  var pollTimer = null;
  var hideTimer = null;
  var lastFait = [];
  var lastFaitReady = false;
  var toastTimer = null;
  var unlocked = false;
  var currentTab = "tournee";
  var txSaveTimer = null;
  var txPendingDay = null;
  var txPendingEl = null;
  var lastTxMap = {};
  var lastTxReady = false;
  var lastMsgReady = false;
  var lastMsgT = 0;
  var txOpen = {};
  var patientDraft = null;
  var mqttHandle = null;
  var mqttTopicId = null;
  var mqttLive = false;
  var persistQuiet = false;
  var outboxSig = "";
  var shareDirty = false;
  var sessionPin = "";
  var lastPubCt = "";
  var mqttFlushTimer = null;
  var MQTT_URLS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  var voiceBlobs = {};
  var recMedia = null;
  var recStream = null;
  var recChunks = [];
  var recTimer = null;
  var recStarted = 0;
  var recDest = "tx";
  var VOIX_MAX_MS = 120000;
  var MSG_GONE_MS = 120000;
  var msgGoneTimer = null;
  var VOIX_MAX_BYTES = 4500000;
  var VOIX_MAX_DAY = 12;
  var pendingVoix = [];
  var geoQueue = [];
  var geoBusy = false;
  var tourneeMap = null;
  var listMode = "today"; /* today | all | inactifs */
  var tourSlot = "am"; /* am | pm — nouveaux cabinets seulement */
  var pendingPatientPhotos = [];
  var PATIENT_PHOTO_MAX = 6;
  var viewDayISO = ""; /* "" = aujourd’hui, sinon YYYY-MM-DD */
  var VIEW_DAY_RANGE = 21;
  var planYear = new Date().getFullYear();
  var planMonth = new Date().getMonth();
  var planEditingIso = "";
  var cguFromMenu = false;
  var prenomThenSend = false;
  var prenomRequired = false;
  var MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var JOUR_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
  var JOUR_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  var MONTHS_SHORT_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var JOUR_SHORT_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  var JOUR_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var DAY_QUOTES = [
    "Un passage à la fois. Le reste suivra.",
    "Votre présence compte, aujourd’hui encore.",
    "Prenez aussi soin de vous, entre deux portes.",
    "Allez-y pas à pas : c’est déjà beaucoup.",
    "Être là, simplement, ça change une journée.",
    "Respirez. La tournée se fait un arrêt après l’autre.",
    "La constance vaut mieux que la course.",
    "Un sourire, une attention : ça suffit souvent.",
    "Vous n’êtes pas seule sur la route.",
    "Gardez une minute pour vous, c’est permis.",
    "Le geste juste, au bon moment.",
    "Chaque visite est une présence. Merci d’y être."
  ];

  function emptyState() {
    return { patients: [], done: {}, deleted: {}, transmissions: {}, patientTx: {}, invites: [], planning: {}, history: {}, messages: [], feedback: [], presence: {}, blocked: {}, roster: [] };
  }

  /* vydel-app : essai gratuit de 14 jours daté de la création du cabinet (state.trial = { start, end, days }).
     Statut affiché seulement (menu) : rien n’est bloqué à la fin de l’essai pour l’instant. */
  var FREE_TRIAL_DAYS = 14;
  function newTrialInfo(now) {
    now = now || Date.now();
    return { start: now, end: now + FREE_TRIAL_DAYS * 86400000, days: FREE_TRIAL_DAYS };
  }
  function mergeTrialInfo(a, b) {
    var ok = function (t) { return t && typeof t === "object" && t.start > 0 && t.end > 0; };
    if (!ok(a)) return ok(b) ? { start: b.start, end: b.end, days: b.days || FREE_TRIAL_DAYS } : undefined;
    if (!ok(b)) return { start: a.start, end: a.end, days: a.days || FREE_TRIAL_DAYS };
    var w = a.start <= b.start ? a : b;
    return { start: w.start, end: w.end, days: w.days || FREE_TRIAL_DAYS };
  }
  function trialStatusText() {
    var t = state && state.trial;
    if (!t || !(t.end > 0)) return "";
    var endLbl = formatDateFr(toISODate(new Date(t.end)));
    var left = Math.ceil((t.end - Date.now()) / 86400000);
    if (left > 0) return "Essai gratuit de " + (t.days || FREE_TRIAL_DAYS) + " jours : jusqu’au " + endLbl + " (" + left + (left > 1 ? " jours restants)" : " jour restant)");
    return "Essai gratuit terminé le " + endLbl + ".";
  }
  function renderTrialStatus() {
    var el = document.getElementById("menu-trial");
    if (!el) return;
    var txt = trialStatusText();
    el.textContent = txt;
    el.hidden = !txt;
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function parseISODate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return new Date();
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function toISODate(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDaysISO(iso, n) {
    var d = parseISODate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function selectedDayISO() {
    return viewDayISO || todayISO();
  }

  function isViewingToday() {
    return selectedDayISO() === todayISO();
  }

  function viewDayKind() {
    var sel = selectedDayISO();
    var tod = todayISO();
    if (sel === tod) return "today";
    return sel < tod ? "past" : "future";
  }

  function canShiftViewDay(delta) {
    var next = addDaysISO(selectedDayISO(), delta);
    var tod = todayISO();
    var min = addDaysISO(tod, -VIEW_DAY_RANGE);
    var max = addDaysISO(tod, VIEW_DAY_RANGE);
    return next >= min && next <= max;
  }

  function shiftViewDay(delta) {
    if (!canShiftViewDay(delta)) return;
    var next = addDaysISO(selectedDayISO(), delta);
    viewDayISO = next === todayISO() ? "" : next;
    listMode = "today";
    fillDayStrip();
    syncScope();
    render();
  }

  function resetViewDay() {
    if (!viewDayISO) return;
    viewDayISO = "";
    fillDayStrip();
    syncScope();
    if (carOn) renderCar();
    renderCarChip();
  }

  function formatDateFr(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return iso || "";
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function dayOfYear(d) {
    var y = d.getFullYear();
    var start = Date.UTC(y, 0, 1);
    var now = Date.UTC(y, d.getMonth(), d.getDate());
    return Math.round((now - start) / 86400000);
  }

  function fillHello() {
    var el = $("hello");
    if (!el) return;
    var n = localDisplayName();
    el.textContent = n ? ("Bonjour " + n) : "Bonjour";
    renderPresence();
  }


  function updateDayCountBadge(kind, total, doneN) {
    var badge = $("day-count-badge");
    if (badge) { badge.hidden = true; badge.textContent = ""; }
    var elHint = $("day-view-hint");
    if (!elHint) return;
    if (kind === "future") {
      elHint.hidden = false;
      elHint.innerHTML = "Planning · <span class=\"hint-count\">" + total + " prévu" + (total > 1 ? "s" : "") + "</span>";
    } else if (kind === "past") {
      elHint.hidden = false;
      elHint.innerHTML = "Historique · <span class=\"hint-count\">" + doneN + " / " + total + " faits</span>";
    } else {
      elHint.hidden = true;
      elHint.textContent = "";
    }
  }

  function fillDayStrip() {
    fillHello();
    var elDate = $("day-date");
    var elQuote = $("day-quote");
    var elHint = $("day-view-hint");
    var iso = selectedDayISO();
    var d = parseISODate(iso);
    if (elDate) elDate.textContent = JOUR_NAMES[d.getDay()] + " " + d.getDate() + " " + MONTHS_FR[d.getMonth()] + " " + d.getFullYear();
    if (elQuote) elQuote.textContent = DAY_QUOTES[dayOfYear(d) % DAY_QUOTES.length];
    var kind = viewDayKind();
    if (elHint && kind === "today") {
      elHint.hidden = true;
      elHint.textContent = "";
    }
    var canPrev = !canShiftViewDay(-1);
    var canNext = !canShiftViewDay(1);
    ["btn-day-prev", "btn-day-prev-top"].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = canPrev;
    });
    ["btn-day-next", "btn-day-next-top"].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = canNext;
    });
    fitTopbarDayLabel(d);
    refreshTopbarCount();
  }

  function fitTopbarDayLabel(d) {
    var label = $("topbar-day-label");
    if (!label) return;
    var day = JOUR_NAMES[d.getDay()];
    var num = d.getDate();
    var mon = MONTHS_FR[d.getMonth()];
    var variants = [
      day + " " + num + " " + mon,
      day + " " + num + " " + MONTHS_SHORT_FR[d.getMonth()],
      JOUR_SHORT_FR[d.getDay()] + " " + num + " " + MONTHS_SHORT_FR[d.getMonth()]
    ];
    var i, chosen = variants[variants.length - 1];
    for (i = 0; i < variants.length; i++) {
      label.textContent = variants[i];
      if (label.scrollWidth <= label.clientWidth + 1) { chosen = variants[i]; break; }
    }
    if (label.textContent !== chosen) label.textContent = chosen;
  }

  function refreshTopbarCount() {
    var c = $("counter");
    var s = $("topbar-count-short");
    if (!s) return;
    var txt = c ? String(c.textContent || "").trim() : "";
    var hidden = !c || c.hidden;
    var m = txt.match(/(\d+)\s*\/\s*(\d+)/);
    if (currentTab === "tournee" && !hidden && m) {
      var next = m[1] + "/" + m[2];
      if (s.textContent !== next) s.textContent = next;
      s.setAttribute("aria-label", txt);
      s.hidden = false;
    } else {
      if (s.textContent) s.textContent = "";
      s.hidden = true;
    }
  }


  function shareUrl(code) {
    var c = String(code || "").trim();
    if (!c) return "";
    if (/^https?:\/\//i.test(c)) return c.replace(/\s+/g, "");
    if (c.indexOf("/") !== -1) return JSONSTORAGE + "/" + c.replace(/^\/+/, "");
    return JSONBLOB + "/" + encodeURIComponent(c);
  }

  function idFromShareUri(uri) {
    var u = String(uri || "").replace(/\s+/g, "");
    var m = u.match(/\/v1\/json\/(.+)$/i);
    if (m) return m[1].replace(/\/$/, "");
    var parts = u.replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || u;
  }

  function activeShareUrl() {
    if (meta && meta.blobUrl) return meta.blobUrl;
    if (meta && meta.blobId) return shareUrl(meta.blobId);
    return "";
  }

  function packInvite(token, blobId) {
    return String(token || "") + "#" + String(blobId || "");
  }

  function unpackInvite(raw) {
    var s = String(raw || "").trim();
    var i = s.indexOf("#");
    if (i < 1) return null;
    return { token: s.slice(0, i).toUpperCase(), blobId: s.slice(i + 1).trim() };
  }

  function randomInvite() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    var b = crypto.getRandomValues(new Uint8Array(6));
    for (var i = 0; i < 6; i++) s += abc[b[i] % abc.length];
    return s;
  }

  function ensureTx() {
    if (!state) state = emptyState();
    if (!state.transmissions) state.transmissions = {};
    if (!state.patientTx) state.patientTx = {};
    if (!state.invites) state.invites = [];
    if (!state.planning) state.planning = {};
    if (!state.history) state.history = {};
    if (!state.messages) state.messages = [];
    if (!state.feedback) state.feedback = [];
    if (!state.presence) state.presence = {};
    if (!state.blocked) state.blocked = {};
    if (!state.roster) state.roster = [];
  }

  function snippet(text, n) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.length <= (n || 90)) return s;
    return s.slice(0, n || 90) + "…";
  }

  function patientTxText(id, day) {
    ensureTx();
    var by = state.patientTx[id];
    var rec = by && by[day];
    return rec && rec.text ? rec.text : "";
  }

  function setPatientTx(id, day, text) {
    ensureTx();
    if (!id) return;
    if (!state.patientTx[id]) state.patientTx[id] = {};
    var now = Date.now();
    state.patientTx[id][day] = { text: String(text || ""), updatedAt: now };
    lastTxMap["p:" + id + ":" + day] = now;
    lastTxReady = true;
    markTxSeen();
  }

  function patientHasVocalToday(pid, day) {
    var rec = state.transmissions && state.transmissions[day || todayISO()];
    if (!rec || !rec.items) return false;
    var i, j;
    for (i = 0; i < rec.items.length; i++) {
      var it = rec.items[i];
      if (!it || it.deletedAt) continue;
      if (it.kind === "reply" || it.replyTo) continue;
      if (String(it.patientId || "") !== String(pid)) continue;
      if (it.kind !== "rapide") continue;
      var linked = String(it.voiceId || "");
      if (!linked) {
        for (j = 0; j < (rec.voices || []).length; j++) {
          var v0 = rec.voices[j];
          if (v0 && !v0.deletedAt && v0.itemId === it.id) linked = v0.id;
        }
      }
      if (!linked) continue;
      var alive = false;
      for (j = 0; j < (rec.voices || []).length; j++) {
        var v = rec.voices[j];
        if (!v || v.deletedAt) continue;
        if (v.id === linked || (v.itemId && v.itemId === it.id)) { alive = true; break; }
      }
      if (alive) return true;
    }
    return false;
  }

  function liveTxItems(rec) {
    var list = (rec && rec.items) || [];
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || !it.id || it.deletedAt) continue;
      if (!String(it.text || "").trim() && !it.voiceId) continue;
      out.push(it);
    }
    return out;
  }

  function txRecHasContent(rec) {
    if (!rec) return false;
    if (String(rec.text || "").trim()) return true;
    if (liveTxItems(rec).length) return true;
    return liveVoices(rec.voices).length > 0;
  }

  function txDayText(rec) {
    var parts = [];
    if (rec && String(rec.text || "").trim()) parts.push(String(rec.text).trim());
    liveTxItems(rec).forEach(function (it) {
      var who = it.from ? it.from + " : " : "";
      var pat = it.patientName ? ("[" + it.patientName + "] ") : "";
      parts.push(who + pat + String(it.text || "").trim());
    });
    return parts.join("\n\n");
  }

  function txStampMap() {
    var m = {};
    var tx = (state && state.transmissions) || {};
    Object.keys(tx).forEach(function (day) {
      var rec = tx[day];
      if (!txRecHasContent(rec)) return;
      m[day] = rec.updatedAt || 0;
    });
    var ptx = (state && state.patientTx) || {};
    Object.keys(ptx).forEach(function (pid) {
      var days = ptx[pid] || {};
      Object.keys(days).forEach(function (day) {
        var rec = days[day];
        if (!rec || !String(rec.text || "").trim()) return;
        m["p:" + pid + ":" + day] = rec.updatedAt || 0;
      });
    });
    return m;
  }

  function maxTxStamp() {
    var max = 0;
    var m = txStampMap();
    Object.keys(m).forEach(function (day) {
      if (m[day] > max) max = m[day];
    });
    return max;
  }

  function seedTxWatch() {
    ensureTx();
    lastTxMap = txStampMap();
    lastTxReady = true;
    lastMsgT = maxOtherMsgT();
    lastMsgReady = true;
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }

  function b64(buf) {
    var u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    var parts = [];
    var step = 8192;
    for (var i = 0; i < u8.length; i += step) {
      var slice = u8.subarray(i, i + step);
      parts.push(String.fromCharCode.apply(null, slice));
    }
    return btoa(parts.join(""));
  }

  function unb64(str) {
    var s = atob(str);
    var u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }

  function concat(a, b) {
    var o = new Uint8Array(a.length + b.length);
    o.set(a, 0);
    o.set(b, a.length);
    return o;
  }

  function rememberPin(pin) {
    sessionPin = String(pin || "");
  }

  async function pinSalt(pin) {
    var h = await sha256(new TextEncoder().encode("tournee-mg-salt-v1|" + String(pin)));
    return h.slice(0, 16);
  }

  function payloadToText(raw) {
    if (raw == null) return "";
    if (typeof raw === "string") return raw;
    try {
      if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
      if (raw.buffer && typeof raw.byteLength === "number") {
        return new TextDecoder().decode(new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength));
      }
    } catch (e0) {}
    if (raw.toString) {
      var s = raw.toString("utf8") || raw.toString();
      if (s && s.charAt(0) === "{") return s;
    }
    return "";
  }

  function stateSig(s) {
    if (!s) return "";
    var ids = (s.patients || []).map(function (p) {
      return String(p.id) + ":" + String(p.updatedAt || 0);
    }).sort();
    var doneKeys = Object.keys(s.done || {}).sort();
    var done = doneKeys.map(function (id) {
      var rec = s.done[id] || {};
      return id + ":" + String(rec.t || 0) + ":" + String(rec.d || "");
    });
    return ids.join(",") + "|" + done.join(",") + "|" + JSON.stringify(s.deleted || {}) + "|" + JSON.stringify(s.transmissions || {}) + "|" + JSON.stringify(s.patientTx || {}) + "|" + JSON.stringify(s.planning || {}) + "|" + JSON.stringify(s.history || {}) + "|" + JSON.stringify(s.messages || []) + "|" + JSON.stringify(s.feedback || []) + "|" + JSON.stringify(s.presence || {}) + "|" + JSON.stringify(s.blocked || {}) + "|" + JSON.stringify(s.secu || {}) + "|" + JSON.stringify(s.trials || {}) + "|" + JSON.stringify(s.trial || {}) + "|" + (s.trialIssuer ? s.trialIssuer.kid + ":" + ((s.trialIssuer.chain || []).length) : "");
  }

  function scheduleMqttFlush() {
    clearTimeout(mqttFlushTimer);
    mqttFlushTimer = setTimeout(function () {
      mqttFlushTimer = null;
      if (!unlocked || !key || !meta) return;
      shareDirty = true;
      persist(true);
    }, 500);
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(LS_META) || "null"); } catch (e) { return null; }
  }

  function saveMeta() {
    localStorage.setItem(LS_META, JSON.stringify(meta));
  }

  async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  }

  async function pinHash(pin, salt) {
    var p = new TextEncoder().encode(pin);
    return b64(await sha256(concat(salt, p)));
  }

  async function deriveKey(pin, salt) {
    var mat = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
      mat,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptState(data, aesKey, salt) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var pt = new TextEncoder().encode(JSON.stringify(data));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aesKey, pt);
    return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }

  async function decryptEnvelope(env, aesKey) {
    var iv = unb64(env.iv);
    var ct = unb64(env.ct);
    var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, aesKey, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function examples() {
    var t = Date.now();
    return [
      {
        id: uid(),
        prenom: "Camille",
        nom: "Martin",
        tel: "06 12 00 00 01",
        adresse: "12 rue des Lilas, 75011 Paris",
        remarques: "Exemple — interphone 12B",
        example: true,
        updatedAt: t
      },
      {
        id: uid(),
        prenom: "Jordan",
        nom: "Bernard",
        tel: "06 12 00 00 02",
        adresse: "8 avenue du Parc, 69003 Lyon",
        remarques: "Exemple — chien à l’entrée, 3e étage",
        example: true,
        updatedAt: t
      }
    ];
  }

  function displayName(p) {
    return ((p.prenom || "") + " " + (p.nom || "")).trim() || "Sans nom";
  }

  function isFaitToday(id) {
    var rec = state.done[id];
    return !!(rec && rec.d === todayISO());
  }

  function faitTodayIds() {
    var day = todayISO();
    var ids = [];
    Object.keys(state.done).forEach(function (id) {
      if (state.done[id] && state.done[id].d === day) ids.push(id);
    });
    ids.sort();
    return ids;
  }

  function nameMap() {
    var m = {};
    state.patients.forEach(function (p) { m[p.id] = displayName(p); });
    return m;
  }

  function showScreen(id) {
    ["screen-welcome", "screen-pin", "screen-join", "screen-beta", "screen-app", "screen-cgu"].forEach(function (s) {
      $(s).hidden = s !== id;
    });
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function setPinDots() {
    var el = $("pin-dots");
    el.innerHTML = "";
    var n = isCreatePinMode() ? NEW_CABINET_PIN_LEN : Math.max(4, pinBuf.length);
    if (n > 6) n = 6;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      if (i < pinBuf.length) s.className = "on";
      el.appendChild(s);
    }
  }

  function openPin(mode, title, hint) {
    pinMode = mode;
    pinBuf = "";
    $("pin-title").textContent = title;
    $("pin-hint").textContent = hint;
    $("pin-error").hidden = true;
    $("pin-back").hidden = mode === "unlock";
    if ($("btn-pin-forgot")) $("btn-pin-forgot").hidden = !(mode === "unlock" && loadMeta2());
    setPinDots();
    showScreen("screen-pin");
  }

  $("keypad").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var k = b.getAttribute("data-k");
    if (k === "back") {
      pinBuf = pinBuf.slice(0, -1);
    } else if (k === "ok") {
      submitPin();
      return;
    } else if (pinBuf.length < 6) {
      pinBuf += k;
    }
    $("pin-error").hidden = true;
    setPinDots();
  });

  /* 1.96 : 6 chiffres exigés UNIQUEMENT à la création d’un nouveau cabinet (setup / confirm).
     Déverrouillage, jonction, changement et récupération de PIN : inchangés (4 à 6 chiffres), aucun cabinet existant n’est touché. */
  function isCreatePinMode() { return pinMode === "setup" || pinMode === "confirm"; }

  async function submitPin() {
    if (isCreatePinMode() && pinBuf.length < NEW_CABINET_PIN_LEN) {
      $("pin-error").textContent = "Pour un nouveau cabinet, le PIN doit faire 6 chiffres.";
      $("pin-error").hidden = false;
      return;
    }
    if (pinBuf.length < 4) {
      $("pin-error").textContent = "Le PIN doit faire 4 à 6 chiffres.";
      $("pin-error").hidden = false;
      return;
    }
    if (pinMode === "setup") {
      pinFirst = pinBuf;
      openPin("confirm", "Confirmez le PIN", "Retapez le même code.");
      return;
    }
    if (pinMode === "confirm") {
      if (pinBuf !== pinFirst) {
        $("pin-error").textContent = "Les codes ne correspondent pas.";
        $("pin-error").hidden = false;
        pinBuf = "";
        setPinDots();
        return;
      }
      await createCabinet(pinBuf);
      return;
    }
    if (pinMode === "change-old") {
      if (!isAdmin()) {
        toast("Seul un administrateur peut changer le PIN.");
        showScreen("screen-app");
        return;
      }
      var okOld = false;
      var m2o = loadMeta2();
      if (m2o) {
        try { await unwrapWithPin(m2o.wrap, pinBuf); okOld = true; } catch (eO) { okOld = false; }
      } else {
        okOld = (await pinHash(pinBuf, unb64(meta.salt))) === meta.pinHash;
      }
      if (!okOld) {
        $("pin-error").textContent = "PIN incorrect.";
        $("pin-error").hidden = false;
        pinBuf = "";
        setPinDots();
        return;
      }
      openPin("change-setup", "Nouveau PIN", secu ? "4 à 6 chiffres, pour ce téléphone." : "4 à 6 chiffres, commun à toutes les associées.");
      return;
    }
    if (pinMode === "rec-setup") {
      pinFirst = pinBuf;
      openPin("rec-confirm", "Confirmez le nouveau PIN", "Retapez le même code.");
      return;
    }
    if (pinMode === "rec-confirm") {
      if (pinBuf !== pinFirst) {
        $("pin-error").textContent = "Les codes ne correspondent pas.";
        $("pin-error").hidden = false;
        pinBuf = "";
        setPinDots();
        return;
      }
      await finishRecovery(pinBuf);
      return;
    }
    if (pinMode === "change-setup") {
      pinFirst = pinBuf;
      openPin("change-confirm", "Confirmez le nouveau PIN", "Retapez le même code.");
      return;
    }
    if (pinMode === "change-confirm") {
      if (pinBuf !== pinFirst) {
        $("pin-error").textContent = "Les codes ne correspondent pas.";
        $("pin-error").hidden = false;
        pinBuf = "";
        setPinDots();
        return;
      }
      await applyNewPin(pinBuf);
      return;
    }
    await unlockWithPin(pinBuf);
  }

  $("pin-back").addEventListener("click", function () {
    pinFirst = "";
    pinBuf = "";
    if (String(pinMode).indexOf("rec-") === 0) {
      recCkPending = null;
      openPin("unlock", "Code PIN", "Saisissez le PIN du cabinet.");
      return;
    }
    if (String(pinMode).indexOf("change") === 0 && unlocked) {
      showScreen("screen-app");
      return;
    }
    showScreen("screen-welcome");
  });

  $("btn-create").addEventListener("click", function () {
    if (!canCreateCabinet()) {
      toast("Pour créer un cabinet, il faut un essai offert par une IDEL qui utilise Vydel.");
      showScreen("screen-beta");
      return;
    }
    pinFirst = "";
    openPin("setup", "Choisissez un PIN", "6 chiffres — ce sera ton cabinet. Essai gratuit de 14 jours.");
  });

  function holdToReveal(el, btn, msg) {
    if (!el || !btn) return;
    var hold = null;
    function start() {
      if (hold) clearTimeout(hold);
      hold = setTimeout(function () {
        hold = null;
        if (btn && btn.id === "btn-change-pin" && !isAdmin()) {
          toast("Seul un administrateur peut changer le PIN.");
          return;
        }
        btn.hidden = false;
        toast(msg);
      }, 2800);
    }
    function stop() {
      if (hold) { clearTimeout(hold); hold = null; }
    }
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("mousedown", start);
    el.addEventListener("touchend", stop);
    el.addEventListener("touchcancel", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mouseleave", stop);
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  // vydel-app : plus de mode urgence caché sur l’accueil (création libre)
  if (false)
  (function () {
    var el = $("welcome-title");
    if (!el) return;
    var hold = null;
    function arm() {
      if (hold) clearTimeout(hold);
      hold = setTimeout(function () {
        hold = null;
        emergencyCreate = true;
      }, 2800);
    }
    function stop() { if (hold) { clearTimeout(hold); hold = null; } }
    el.addEventListener("touchstart", arm, { passive: true });
    el.addEventListener("mousedown", arm);
    el.addEventListener("touchend", stop);
    el.addEventListener("touchcancel", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mouseleave", stop);
  })();
  holdToReveal($("app-title"), $("btn-change-pin"), "Mode urgence : le menu a une option de plus.");
  holdToReveal($("btn-menu"), $("btn-change-pin"), "Mode urgence : le menu a une option de plus.");

  $("btn-join").addEventListener("click", function () {
    $("join-error").hidden = true;
    $("join-pin").value = "";
    showScreen("screen-join");
  });
  $("btn-join-back").addEventListener("click", function () { showScreen("screen-welcome"); });
  $("btn-join-go").addEventListener("click", joinCabinet);


  function newShareId() {
    var b = crypto.getRandomValues(new Uint8Array(8));
    var s = "";
    for (var i = 0; i < 8; i++) s += ("0" + b[i].toString(16)).slice(-2);
    return s;
  }

  function stopMqtt() {
    mqttLive = false;
    if (mqttHandle) {
      try { mqttHandle.close(); } catch (e) {}
      mqttHandle = null;
    }
    mqttTopicId = null;
  }

  function markShare(ok, err) {
    if (!meta) return;
    meta.shareOk = !!ok;
    meta.shareErr = ok ? "" : (err || "");
    saveMeta();
    showShareBanner();
    render();
  }

  function handleSharePayload(raw, onEnv, src, sub) {
    try {
      var env = JSON.parse(payloadToText(raw) || "{}");
      if (!env) return;
      if (src === "old") {
        handleOldPayload(env, sub || "");
        return;
      }
      if (env.kind === "moved") {
        if (!secu && unlocked) showMovedNotice();
        return;
      }
      if (env.kind === "ph") {
        phOnMsg(env).catch(function () {});
        return;
      }
      if (env.kind === "rec") {
        handleRecEnv(env);
        return;
      }
      if (env.kind === "voix") {
        if (env.vid) mainVoiceSeen[env.vid] = true;
        applyVoiceEnv(env);
        return;
      }
      if (!env.ct) return;
      if (onEnv) onEnv(env);
      if (unlocked && key) applyRemoteEnv(env, true);
    } catch (e) {}
  }

  function startMqtt(id, onEnv) {
    if (!id) return;
    var bridgeId = (secu && secu.old && secu.topic === id) ? secu.old.topic : "";
    var handleId = id + (bridgeId ? "|" + bridgeId : "");
    if (mqttHandle && mqttTopicId === handleId) return;
    stopMqtt();
    mqttTopicId = handleId;
    mainSynced = false;
    var topic = "tournee/" + id;
    var oldTopic = bridgeId ? "tournee/" + bridgeId : "";
    function route(t, payload, cb) {
      t = String(t || "");
      if (oldTopic && (t === oldTopic || t.indexOf(oldTopic + "/voix/") === 0)) {
        handleSharePayload(payload, null, "old", t === oldTopic ? "" : t.slice(oldTopic.length + 6));
        return;
      }
      handleSharePayload(payload, cb, "main");
    }
    var first = onEnv || null;
    var eatFirst = function (env) {
      if (!first) return;
      var f = first;
      first = null;
      f(env);
    };
    if (window.mqtt && mqtt.connect) {
      var uidx = 0;
      var client = null;
      function attach(c) {
        c.on("connect", function () {
          mqttLive = true;
          outboxTries = 0;
          setTimeout(refreshSyncUi, 0);
          try {
            c.subscribe(topic);
            c.subscribe(topic + "/voix/+");
            c.subscribe(topic + "/rec");
            c.subscribe(topic + "/ph");
            if (oldTopic) {
              c.subscribe(oldTopic);
              c.subscribe(oldTopic + "/voix/+");
            }
          } catch (eS) {}
          markShare(true, "");
          shareDirty = true;
          scheduleMqttFlush();
          setTimeout(function () { touchPresence(true); }, 300);
          setTimeout(function () { checkSecuClose(); }, 5000);
          recOnConnect();
          phOnConnect();
        });
        c.on("message", function (t, payload) { route(t, payload, eatFirst); });
        c.on("error", function () {});
        c.on("close", function () {
          mqttLive = false;
          refreshSyncUi();
          if (!meta || meta.shareOk) return;
        });
        c.on("offline", function () { mqttLive = false; refreshSyncUi(); });
        c.on("reconnect", function () { mqttLive = false; refreshSyncUi(); });
      }
      function go() {
        if (uidx >= MQTT_URLS.length) {
          markShare(false, "mqtt");
          return;
        }
        var url = MQTT_URLS[uidx++];
        try {
          client = mqtt.connect(url, {
            protocolVersion: 4,
            connectTimeout: 8000,
            reconnectPeriod: 5000,
            clean: true,
            clientId: "t" + Math.random().toString(16).slice(2, 10)
          });
        } catch (eC) { go(); return; }
        attach(client);
        var timer = setTimeout(function () {
          if (meta && meta.shareOk) return;
          try { client.end(true); } catch (eE) {}
          go();
        }, 9000);
        client.on("connect", function () { clearTimeout(timer); });
      }
      go();
      mqttHandle = {
        acks: true,
        publish: function (text, retain, onAck) {
          if (!client || !client.connected) return false;
          try {
            client.publish(topic, text, { retain: retain !== false, qos: 1 }, function (err) { if (onAck) onAck(err || null); });
            return true;
          } catch (eP) { return false; }
        },
        publishTo: function (sub, text, retain) {
          if (!client || !client.connected) return false;
          try {
            client.publish(topic + "/" + sub, text, { retain: retain !== false, qos: 1 });
            return true;
          } catch (eP) { return false; }
        },
        publishRaw: function (full, text, retain) {
          if (!client || !client.connected) return false;
          try {
            client.publish(full, text, { retain: retain !== false, qos: 1 });
            return true;
          } catch (eP) { return false; }
        },
        close: function () {
          try { if (client) client.end(true); } catch (eX) {}
          client = null;
        }
      };
      return;
    }
    if (window.TourneeMqtt) {
      mqttHandle = window.TourneeMqtt.connect(
        MQTT_URLS,
        topic,
        function (payload) { handleSharePayload(payload, eatFirst, "main"); },
        function () { mqttLive = true; markShare(true, ""); shareDirty = true; scheduleMqttFlush(); setTimeout(function () { touchPresence(true); }, 300); phOnConnect(); },
        function () { markShare(false, "mqtt"); }
      );
      return;
    }
    markShare(false, "lib");
  }

  function waitMqttEnv(id, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, ms || 12000);
      startMqtt(id, function (env) {
        if (done) return;
        done = true;
        clearTimeout(to);
        resolve(env);
      });
    });
  }


  async function pinTopicId(pin) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tournee-mg-v1|" + String(pin)));
    var u = new Uint8Array(buf);
    var s = "";
    for (var i = 0; i < 12; i++) s += ("0" + u[i].toString(16)).slice(-2);
    return s;
  }


  /* —— Sécurité v2 (1.91) : clé cabinet aléatoire + sujet aléatoire ——
     Le PIN ne sert plus qu’à déverrouiller CE téléphone (il emballe la clé localement).
     Ancien sujet (dérivé du PIN) gardé en « pont » pendant la transition, puis vidé. */
  var LS_META2 = "tournee.meta2";
  var LS_ENC2 = "tournee.enc2";
  var WRAP_ITERS = 600000;
  var SECU_GRACE_MS = 14 * 86400000;
  var secu = null; /* { topic, ck, ckRaw, at, old: { topic, salt, key, raw } | null, closed } */
  var localLegacyKey = null;
  var pendingInvite = null;
  var bridgeTimer = null;
  var lastOldHadPtr = false;
  var ownCts = [];
  var secuBusy = false;
  var oldVoiceIds = {};
  var mainVoiceSeen = {};
  var legacySeq = 0;
  var movedShown = false;
  var mainSynced = false; /* état du nouveau sujet reçu depuis la connexion (avant tout envoi « pont ») */

  function loadMeta2() {
    try { var m = JSON.parse(localStorage.getItem(LS_META2) || "null"); return m && m.v === 2 && m.topic && m.wrap ? m : null; } catch (e) { return null; }
  }
  function saveMeta2(m) { localStorage.setItem(LS_META2, JSON.stringify(m)); }
  function randHex(n) {
    var b = crypto.getRandomValues(new Uint8Array(n));
    var s = "";
    for (var i = 0; i < n; i++) s += ("0" + b[i].toString(16)).slice(-2);
    return s;
  }
  function noteOwnCt(ct) {
    if (!ct) return;
    ownCts.push(ct);
    if (ownCts.length > 24) ownCts.shift();
  }
  function isOwnCt(ct) { return !!ct && ownCts.indexOf(ct) !== -1; }

  async function pinWrapKey(pin, salt, iters) {
    var mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iters || WRAP_ITERS, hash: "SHA-256" },
      mat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }
  async function sealBytes(bytes, k) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, bytes);
    return { i: b64(iv), c: b64(ct) };
  }
  async function openBytes(o, k) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.i) }, k, unb64(o.c)));
  }
  async function wrapWithPin(raw, pin) {
    var s = crypto.getRandomValues(new Uint8Array(16));
    var o = await sealBytes(raw, await pinWrapKey(pin, s, WRAP_ITERS));
    o.s = b64(s);
    o.n = WRAP_ITERS;
    return o;
  }
  async function unwrapWithPin(o, pin) {
    return openBytes(o, await pinWrapKey(pin, unb64(o.s), o.n || WRAP_ITERS));
  }
  function importAes(raw) {
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  /* Mêmes octets que deriveKey(pin, salt) des versions ≤ 1.90 (PBKDF2 100 000, SHA-256). */
  async function legacyRawKey(pin, salt) {
    var mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERS, hash: "SHA-256" }, mat, 256));
  }
  async function encV2(data, k) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var pt = new TextEncoder().encode(JSON.stringify(data));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, pt);
    return { v: 2, iv: b64(iv), ct: b64(ct) };
  }
  function sealState(data) {
    if (secu) return encV2(data, secu.ck);
    return encryptState(data, key, unb64(meta.salt));
  }
  function saveLocalEnv(env) {
    if (!secu) {
      localStorage.setItem(LS_ENC, JSON.stringify(env));
      return;
    }
    try {
      localStorage.setItem(LS_ENC2, JSON.stringify(env));
    } catch (eQ) {
      /* quota : on libère la copie de secours ancienne, puis on réessaie */
      try { localStorage.removeItem(LS_ENC); } catch (eR) {}
      localLegacyKey = null;
      localStorage.setItem(LS_ENC2, JSON.stringify(env));
    }
    /* Pendant la transition : copie locale lisible par la 1.90 (retour arrière possible). Jamais publiée. */
    if (localLegacyKey && !secu.closed && meta && meta.salt) {
      var seq = ++legacySeq;
      encryptState(state, localLegacyKey, unb64(meta.salt)).then(function (le) {
        if (seq !== legacySeq) return;
        try { localStorage.setItem(LS_ENC, JSON.stringify(le)); } catch (eL) {}
      }).catch(function () {});
    }
  }

  function mergeSecu(a, b) {
    if (!a && !b) return undefined;
    a = a || {};
    b = b || {};
    var ats = [Number(a.at) || 0, Number(b.at) || 0].filter(function (x) { return x > 0; });
    var out = {
      at: ats.length ? Math.min.apply(null, ats) : 0,
      closedAt: Math.max(Number(a.closedAt) || 0, Number(b.closedAt) || 0),
      acks: {}
    };
    [a.acks, b.acks].forEach(function (m) {
      Object.keys(m || {}).forEach(function (k) {
        var n = String(k).trim().slice(0, 24);
        var t = Number(m[k]) || 0;
        if (n && t > (out.acks[n] || 0)) out.acks[n] = t;
      });
    });
    return out;
  }

  function secuAck() {
    if (!secu || !unlocked) return false;
    var me = localDisplayName();
    if (!state.secu) state.secu = { at: secu.at || Date.now(), closedAt: 0, acks: {} };
    if (!state.secu.acks) state.secu.acks = {};
    if (!state.secu.at) state.secu.at = secu.at || Date.now();
    if (!me) return false;
    var f = foldName(me);
    var has = Object.keys(state.secu.acks).some(function (n) { return foldName(n) === f; });
    if (has) return false;
    state.secu.acks[me] = Date.now();
    return true;
  }

  async function activateSecu(m2, ckRaw) {
    var ck = await importAes(ckRaw);
    var old = null;
    if (m2.old && m2.old.wk && m2.old.topic && m2.old.salt) {
      try {
        var oraw = await openBytes(m2.old.wk, ck);
        old = { topic: m2.old.topic, salt: m2.old.salt, raw: oraw, key: await importAes(oraw) };
      } catch (eO) { old = null; }
    }
    secu = { topic: m2.topic, ck: ck, ckRaw: ckRaw, at: m2.at || 0, old: old, closed: !!m2.closed };
    key = ck;
    if (!meta) meta = {};
    if (!meta.salt) meta.salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    meta.blobId = m2.topic;
    meta.blobUrl = "mqtt:" + m2.topic;
    saveMeta();
  }

  function normState(s) {
    s = s && typeof s === "object" ? s : emptyState();
    if (!s.patients) s.patients = [];
    if (!s.done) s.done = {};
    if (!s.deleted) s.deleted = {};
    if (!s.transmissions) s.transmissions = {};
    if (!s.patientTx) s.patientTx = {};
    if (!s.invites) s.invites = [];
    if (!s.planning) s.planning = {};
    if (!s.history) s.history = {};
    if (!s.messages) s.messages = [];
    if (!s.presence) s.presence = {};
    if (!s.blocked) s.blocked = {};
    delete s.secuPtr;
    return s;
  }

  function secuPtrOf() {
    return { t: secu.topic, k: b64(secu.ckRaw), at: secu.at || 0 };
  }

  /* Publie, sur l’ancien sujet, l’état chiffré à l’ancienne + le pointeur vers le nouveau cabinet. */
  async function bridgePublish() {
    if (!secu || !secu.old || secu.closed || !mqttHandle || !mqttHandle.publishRaw) return false;
    if (!mainSynced) return false;
    var closeAt = secuCloseAt();
    if (closeAt && Date.now() >= closeAt) { checkSecuClose(); return false; }
    var copy = JSON.parse(JSON.stringify(state));
    copy.secuPtr = secuPtrOf();
    var env = await encryptState(copy, secu.old.key, unb64(secu.old.salt));
    noteOwnCt(env.ct);
    var ok = mqttHandle.publishRaw("tournee/" + secu.old.topic, JSON.stringify(env), true);
    if (ok) lastOldHadPtr = true;
    return ok;
  }

  function scheduleBridgeRepair() {
    clearTimeout(bridgeTimer);
    lastOldHadPtr = false;
    bridgeTimer = setTimeout(function () {
      bridgeTimer = null;
      if (!secu || !secu.old || !unlocked || !mqttHandle || !mqttHandle.publishRaw) return;
      if (secu.closed) {
        /* Transition finie : on revide l’ancien sujet et on prévient un ancien téléphone resté en ligne. */
        mqttHandle.publishRaw("tournee/" + secu.old.topic, "", true);
        mqttHandle.publishRaw("tournee/" + secu.old.topic, JSON.stringify({ kind: "moved", v: 2 }), false);
        return;
      }
      if (!lastOldHadPtr) bridgePublish();
    }, 1500 + Math.floor(Math.random() * 2500));
  }

  /* Bascule ce téléphone vers le cabinet sécurisé décrit par ptr. remote = données reçues (fusionnées). */
  async function adoptPointer(ptr, remote) {
    if (secuBusy || !unlocked || !sessionPin || !ptr || !ptr.t || !ptr.k) return false;
    if (!/^[0-9a-f]{32}$/.test(String(ptr.t))) return false;
    secuBusy = true;
    try {
      var ckRaw = unb64(ptr.k);
      if (ckRaw.length !== 32) return false;
      var ck = await importAes(ckRaw);
      var oldInfo = null;
      var prev = secu;
      if (!prev) {
        oldInfo = { topic: meta.blobId, salt: meta.salt, raw: await legacyRawKey(sessionPin, unb64(meta.salt)) };
        localLegacyKey = key;
      } else if (prev.old) {
        oldInfo = { topic: prev.old.topic, salt: prev.old.salt, raw: prev.old.raw };
      }
      var m2 = {
        v: 2,
        topic: String(ptr.t),
        at: Number(ptr.at) || 0,
        wrap: await wrapWithPin(ckRaw, sessionPin),
        old: null,
        closed: prev ? !!prev.closed : false
      };
      if (oldInfo && oldInfo.topic && oldInfo.salt) {
        m2.old = { topic: oldInfo.topic, salt: oldInfo.salt, wk: await sealBytes(oldInfo.raw, ck) };
      } else {
        m2.closed = true;
      }
      if (remote) state = normState(mergeState(state, normState(remote)));
      /* Cas rare (deux sécurisations en même temps) : on laisse un renvoi sur l’ancien sujet sécurisé. */
      if (prev && prev.topic !== m2.topic && mqttHandle && mqttHandle.publishRaw) {
        try {
          var fwd = JSON.parse(JSON.stringify(state));
          fwd.secuPtr = { t: m2.topic, k: b64(ckRaw), at: m2.at };
          var fenv = await encV2(fwd, prev.ck);
          noteOwnCt(fenv.ct);
          mqttHandle.publishRaw("tournee/" + prev.topic, JSON.stringify(fenv), true);
        } catch (eF) {}
      }
      saveMeta2(m2);
      await activateSecu(m2, ckRaw);
      secuAck();
      if (m2.at && (!state.secu.at || state.secu.at > m2.at)) state.secu.at = m2.at;
      stopMqtt();
      startMqtt(meta.blobId);
      await persist(true);
      render();
      renderTransmissions();
      syncWatchToIdb();
      toast("Sécurité renforcée activée sur ce téléphone.");
      return true;
    } catch (e) {
      return false;
    } finally {
      secuBusy = false;
    }
  }

  /* Message reçu sur l’ancien sujet (dérivé du PIN) par un téléphone déjà sécurisé. */
  async function handleOldPayload(env, sub) {
    if (!secu || !secu.old || !unlocked) return;
    if (sub) {
      oldVoiceIds[sub] = true;
      if (env && env.kind === "voix" && env.ct) bridgeVoiceFromOld(env);
      return;
    }
    if (!env || !env.ct) return;
    if (isOwnCt(env.ct)) { lastOldHadPtr = true; return; }
    var remote;
    try { remote = await decryptEnvelope(env, secu.old.key); } catch (eD) { return; }
    if (!remote || typeof remote !== "object") return;
    var ptr = remote.secuPtr;
    if (ptr && ptr.t && ptr.t !== secu.topic) {
      await resolveConflict(ptr, remote);
      return;
    }
    if (ptr) lastOldHadPtr = true;
    delete remote.secuPtr;
    await mergeRemote(remote, true);
    /* Écriture d’un téléphone resté en 1.90 : récupérée, puis on remet le pointeur (ou on revide). */
    if (!ptr || secu.closed) scheduleBridgeRepair();
  }

  async function resolveConflict(ptr, remote) {
    if (!secu) return;
    var mineAt = secu.at || Infinity;
    var theirAt = Number(ptr.at) || Infinity;
    var theirsWins = theirAt < mineAt || (theirAt === mineAt && String(ptr.t) < secu.topic);
    if (!theirsWins) {
      if (secu.old && !secu.closed) scheduleBridgeRepair();
      return;
    }
    await adoptPointer(ptr, remote);
  }

  async function bridgeVoiceFromOld(env) {
    try {
      var data = await decryptEnvelope(env, secu.old.key);
      if (!data || !data.id || !data.audio) return;
      var had = !!voiceBlobs[data.id];
      if (!had) await applyVoiceData(data);
      var vid = data.id;
      setTimeout(function () {
        if (!secu || !unlocked || mainVoiceSeen[vid] || !voiceBlobs[vid]) return;
        mainVoiceSeen[vid] = true;
        publishVoice(vid);
      }, 4000 + Math.floor(Math.random() * 3000));
    } catch (e) {}
  }

  function allVoiceIds() {
    var ids = {};
    Object.keys(state.transmissions || {}).forEach(function (day) {
      var rec = state.transmissions[day] || {};
      (rec.voices || []).forEach(function (v) { if (v && v.id) ids[v.id] = true; });
      (rec.items || []).forEach(function (it) { if (it && it.voiceId) ids[it.voiceId] = true; });
    });
    (state.messages || []).forEach(function (m) { if (m && m.voiceId) ids[m.voiceId] = true; });
    Object.keys(oldVoiceIds).forEach(function (k) { ids[k] = true; });
    return Object.keys(ids);
  }

  function secuCloseAt() {
    var st = state && state.secu;
    if (!st || !st.at) return 0;
    if (st.closedAt) return st.closedAt;
    return st.at + SECU_GRACE_MS;
  }

  /* Fin de transition : on vide l’ancien sujet (données + vocaux) et la copie locale ancienne. */
  function checkSecuClose() {
    if (!secu || !secu.old || secu.closed || !unlocked || !mqttLive || !mqttHandle || !mqttHandle.publishRaw) return false;
    var at = secuCloseAt();
    if (!at || Date.now() < at) return false;
    var base = "tournee/" + secu.old.topic;
    if (!mqttHandle.publishRaw(base, "", true)) return false;
    allVoiceIds().forEach(function (id) { mqttHandle.publishRaw(base + "/voix/" + id, "", true); });
    secu.closed = true;
    var m2 = loadMeta2();
    if (m2) { m2.closed = true; saveMeta2(m2); }
    localLegacyKey = null;
    legacySeq++;
    try { localStorage.removeItem(LS_ENC); } catch (eR) {}
    if (meta) { meta.pinHash = ""; saveMeta(); }
    return true;
  }

  async function secureCabinetNow() {
    if (secu) { toast("Ce cabinet est déjà sécurisé."); return; }
    if (!unlocked || !sessionPin || !meta || !meta.salt) { toast("Déverrouillez d’abord."); return; }
    if (!isAdmin() || isKicked()) { toast("Réservé à un administrateur."); return; }
    if (!mqttLive || !mqttHandle || !mqttHandle.publishRaw) { toast("Connexion Internet nécessaire. Réessayez dans un instant."); return; }
    if (secuBusy) return;
    secuBusy = true;
    try {
      var oldTopic = await pinTopicId(sessionPin);
      if (meta.blobId !== oldTopic) { toast("Sécurisation impossible sur ce téléphone."); return; }
      var oldRaw = await legacyRawKey(sessionPin, unb64(meta.salt));
      var oldKey = await importAes(oldRaw);
      var test = null;
      try { test = JSON.parse(localStorage.getItem(LS_ENC) || "null"); } catch (eT) { test = null; }
      if (test && test.ct) await decryptEnvelope(test, oldKey); /* vérifie qu’on a bien la clé actuelle */
      var ckRaw = crypto.getRandomValues(new Uint8Array(32));
      var ck = await importAes(ckRaw);
      var now = Date.now();
      var m2 = {
        v: 2,
        topic: randHex(16),
        at: now,
        wrap: await wrapWithPin(ckRaw, sessionPin),
        old: { topic: oldTopic, salt: meta.salt, wk: await sealBytes(oldRaw, ck) },
        closed: false
      };
      ensureTx();
      state.secu = mergeSecu(state.secu, { at: now, closedAt: 0, acks: {} });
      localLegacyKey = key;
      saveMeta2(m2);
      await activateSecu(m2, ckRaw);
      secuAck();
      stopMqtt();
      startMqtt(meta.blobId);
      mainSynced = true;
      await persist(true);
      toast("Cabinet sécurisé. Les autres téléphones suivent tout seuls.");
      renderSecuModal();
    } catch (e) {
      toast("Sécurisation impossible. Rien n’a changé.");
    } finally {
      secuBusy = false;
    }
  }

  function closeTransitionNow() {
    if (!secu || !isAdmin() || isKicked()) return;
    ensureTx();
    if (!state.secu) state.secu = { at: secu.at || Date.now(), closedAt: 0, acks: {} };
    state.secu.closedAt = Date.now();
    persist(true);
    setTimeout(function () { checkSecuClose(); renderSecuModal(); }, 600);
  }

  var VYDEL_APP_URL = "https://app.vydel.fr/";
  function appBaseUrl() {
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return location.origin + location.pathname.replace(/index\.html$/, "");
    return VYDEL_APP_URL;
  }

  async function makeInviteLink(code) {
    if (!secu || !sessionPin) return "";
    var w = await wrapWithPin(secu.ckRaw, sessionPin);
    var parts = [secu.topic, b64url(unb64(w.s)), b64url(unb64(w.i)), b64url(unb64(w.c))];
    var c = normInviteCode(code);
    if (c) parts.push(c);
    return appBaseUrl() + "#vj=" + parts.join(".");
  }

  /* Code d’invitation (6 caractères, alphabet de randomInvite) ou "" si invalide. */
  function normInviteCode(c) {
    c = String(c || "").trim().toUpperCase();
    return /^[A-HJ-NP-Z2-9]{6}$/.test(c) ? c : "";
  }

  function parseInvite(text) {
    var s = String(text || "");
    var m = s.match(/vj=([0-9a-f]{32})\.([A-Za-z0-9_-]{16,32})\.([A-Za-z0-9_-]{12,24})\.([A-Za-z0-9_-]{40,80})(?:\.([A-Za-z0-9]{6}))?(?![A-Za-z0-9_-])/);
    if (!m) return null;
    var code = normInviteCode(m[5]);
    /* Lien sans code (1.91 avant usage unique) : on tente « Invitation : CODE » s’il a été collé avec le texte. */
    if (!code) {
      var mc = s.match(/Invitation\s*:\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/i);
      if (mc) code = normInviteCode(mc[1]);
    }
    try {
      return { topic: m[1], code: code, w: { s: b64(unb64url(m[2])), i: b64(unb64url(m[3])), c: b64(unb64url(m[4])), n: WRAP_ITERS } };
    } catch (e) { return null; }
  }

  /* Usage unique : l’invitation doit exister dans l’état du cabinet, ni utilisée ni révoquée. */
  function findLiveInvite(data, code) {
    code = normInviteCode(code);
    if (!code || !data || !data.invites) return null;
    var hit = null;
    data.invites.forEach(function (x) {
      if (x && String(x.code || "").toUpperCase() === code) hit = hit || x;
    });
    if (!hit) return null;
    if (isLegacyInvite(hit)) return null; /* ancien code d’avant la 1.91 : jamais une invitation valable */
    /* Doublons éventuels : si l’un est utilisé/révoqué, l’invitation l’est. */
    var dead = data.invites.some(function (x) {
      return x && String(x.code || "").toUpperCase() === code && (x.usedAt || x.revokedAt);
    });
    return dead ? null : hit;
  }

  function markInviteUsed(data, code) {
    code = normInviteCode(code);
    var now = Date.now();
    var who = localDisplayName();
    (data.invites || []).forEach(function (x) {
      if (x && String(x.code || "").toUpperCase() === code && !x.usedAt) {
        x.usedAt = now;
        if (who) x.usedBy = who.slice(0, 24);
      }
    });
  }

  function inviteRefused() {
    var e = new Error("used");
    e.code = "used";
    return e;
  }

  var INVITE_REFUSED_MSG = "Cette invitation a déjà servi ou n’est plus valable. Demandez-en une nouvelle à un administrateur du cabinet.";

  /* Lit une fois l’état chiffré d’un sujet, sur une connexion à part (ne touche pas la connexion en cours). */
  function peekMqttEnv(id, ms, sub, want) {
    return new Promise(function (resolve, reject) {
      var done = false, h = null;
      function finish(err, env) {
        if (done) return;
        done = true;
        clearTimeout(to);
        try { if (h && h.close) h.close(); } catch (eC) {}
        if (err) reject(err); else resolve(env);
      }
      var to = setTimeout(function () { finish(new Error("timeout")); }, ms || 15000);
      function onText(raw) {
        try {
          var env = JSON.parse(payloadToText(raw) || "{}");
          if (want ? want(env) : (env && env.ct && !env.kind)) finish(null, env);
        } catch (eP) {}
      }
      var full = "tournee/" + id + (sub ? "/" + sub : "");
      if (window.mqtt && mqtt.connect) {
        var uidx = 0, client = null;
        h = { close: function () { try { if (client) client.end(true); } catch (eE) {} client = null; } };
        var go = function () {
          if (done) return;
          if (uidx >= MQTT_URLS.length) { finish(new Error("mqtt")); return; }
          var url = MQTT_URLS[uidx++];
          var c;
          try {
            c = mqtt.connect(url, { protocolVersion: 4, connectTimeout: 8000, reconnectPeriod: 0, clean: true, clientId: "t" + Math.random().toString(16).slice(2, 10) });
          } catch (eC) { go(); return; }
          client = c;
          var tm = setTimeout(function () {
            try { c.end(true); } catch (eT) {}
            if (client === c) go();
          }, 9000);
          c.on("connect", function () { clearTimeout(tm); try { c.subscribe(full); } catch (eS) {} });
          c.on("message", function (t, payload) { if (String(t) === full) onText(payload); });
          c.on("error", function () {});
        };
        go();
        return;
      }
      if (!window.TourneeMqtt || sub) { finish(new Error("mqtt")); return; }
      h = window.TourneeMqtt.connect(MQTT_URLS, full, onText, null, null);
    });
  }

  async function joinWithInvite(pin, inv) {
    var ckRaw;
    try { ckRaw = await unwrapWithPin(inv.w, pin); } catch (eW) { var ep = new Error("pin"); ep.code = "pin"; throw ep; }
    var ck = await importAes(ckRaw);
    var env = await waitMqttEnv(inv.topic, 15000);
    if (!env || !env.ct) throw new Error("format");
    var data = normState(await decryptEnvelope(env, ck));
    /* Usage unique : rien n’est enregistré sur ce téléphone si l’invitation est absente, utilisée ou révoquée. */
    if (!findLiveInvite(data, inv.code)) throw inviteRefused();
    markInviteUsed(data, inv.code);
    meta = { salt: b64(crypto.getRandomValues(new Uint8Array(16))), pinHash: "", blobId: inv.topic, blobUrl: "mqtt:" + inv.topic, shareOk: true };
    saveMeta();
    var m2 = { v: 2, topic: inv.topic, at: (data.secu && data.secu.at) || Date.now(), wrap: await wrapWithPin(ckRaw, pin), old: null, closed: true };
    saveMeta2(m2);
    localLegacyKey = null;
    await activateSecu(m2, ckRaw);
    state = data;
    backfillHistory();
    lastFait = faitTodayIds();
    lastFaitReady = true;
    seedTxWatch();
    rememberPin(pin);
    unlocked = true;
    pendingInvite = null;
    try { await persist(true); } catch (eP) {} /* publie tout de suite : les autres téléphones voient l’invitation utilisée */
    enterApp(false);
  }

  async function unlockV2(pin, m2) {
    var ckRaw;
    try { ckRaw = await unwrapWithPin(m2.wrap, pin); } catch (eW) {
      $("pin-error").textContent = "PIN incorrect.";
      $("pin-error").hidden = false;
      pinBuf = "";
      setPinDots();
      return;
    }
    meta = loadMeta() || {};
    rememberPin(pin);
    localLegacyKey = null;
    if (!m2.closed && meta.pinHash && meta.salt) {
      try {
        if ((await pinHash(pin, unb64(meta.salt))) === meta.pinHash) localLegacyKey = await deriveKey(pin, unb64(meta.salt));
      } catch (eL) { localLegacyKey = null; }
    }
    await activateSecu(m2, ckRaw);
    var loaded = null;
    try {
      var env2 = JSON.parse(localStorage.getItem(LS_ENC2) || "null");
      if (env2 && env2.ct) loaded = await decryptEnvelope(env2, secu.ck);
    } catch (e2) { loaded = null; }
    if (!loaded && localLegacyKey) {
      try {
        var env1 = JSON.parse(localStorage.getItem(LS_ENC) || "null");
        if (env1 && env1.ct) loaded = await decryptEnvelope(env1, localLegacyKey);
      } catch (e1) { loaded = null; }
    }
    state = normState(loaded || emptyState());
    lastFait = faitTodayIds();
    lastFaitReady = true;
    seedTxWatch();
    unlocked = true;
    if (backfillHistory()) persist(false);
    enterApp(false);
  }

  /* Téléphone encore à l’ancienne (ex. resté éteint après la fin de transition) : rejoint via une invitation. */
  async function useInviteOnLegacy(inv) {
    if (!inv || secu || !unlocked || !sessionPin) return false;
    var ckRaw;
    try { ckRaw = await unwrapWithPin(inv.w, sessionPin); } catch (e) {
      toast("Invitation : le PIN ne correspond pas.");
      return false;
    }
    var remote = null;
    try {
      var env = await peekMqttEnv(inv.topic, 25000);
      remote = normState(await decryptEnvelope(env, await importAes(ckRaw)));
    } catch (eR) {
      toast("Invitation : connexion impossible. Vérifiez Internet, puis réessayez.");
      return false;
    }
    if (!findLiveInvite(remote, inv.code)) {
      askConfirm("Invitation refusée", INVITE_REFUSED_MSG, null);
      return false;
    }
    markInviteUsed(remote, inv.code);
    return adoptPointer({ t: inv.topic, k: b64(ckRaw), at: 0 }, remote);
  }

  /* —— Code de récupération (1.91) ——
     24 caractères aléatoires, jamais stockés. On garde la clé du cabinet emballée par une clé dérivée du code
     (PBKDF2-SHA-256, 600 000 tours, sel aléatoire) : sur chaque téléphone (meta2.rec) et en copie retained « …/rec » sur les relais. */
  var REC_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var LS_REC_TRIES = "tournee.recTries";
  var LS_REC_SEEN = "tournee.recSeen";
  var recShownCode = "";
  var recCkPending = null;
  var recPubPending = false;
  var recRelaySeenId = "";
  var recPubTimer = null;

  function randomRecCode() {
    var b = crypto.getRandomValues(new Uint8Array(24));
    var s = "";
    for (var i = 0; i < 24; i++) s += REC_ABC[b[i] % 32];
    return s;
  }
  function normRecCode(s) {
    return String(s || "").toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "");
  }
  function fmtRecCode(c) {
    return String(c || "").replace(/(.{4})(?=.)/g, "$1 ");
  }
  function validRec(r) {
    return !!(r && r.id && r.s && r.i && r.c && Number(r.at) > 0);
  }
  function recFields(r) {
    return { id: String(r.id), at: Number(r.at) || 0, s: r.s, i: r.i, c: r.c, n: r.n || WRAP_ITERS };
  }

  function mergeRecMeta(a, b) {
    if (!a && !b) return undefined;
    if (!a || !a.id) return b && b.id ? { id: b.id, at: Number(b.at) || 0 } : undefined;
    if (!b || !b.id) return { id: a.id, at: Number(a.at) || 0 };
    return (Number(b.at) || 0) > (Number(a.at) || 0) ? { id: b.id, at: Number(b.at) || 0 } : { id: a.id, at: Number(a.at) || 0 };
  }

  function mergeSecLog(a, b) {
    var map = {};
    (a || []).concat(b || []).forEach(function (e) {
      if (!e || e.kind !== "recovery" || !e.at) return;
      var k = e.kind + "|" + e.at + "|" + String(e.by || "");
      if (!map[k]) map[k] = { kind: "recovery", at: Number(e.at) || 0, by: String(e.by || "").slice(0, 24), id: String(e.id || "").slice(0, 32) };
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return x.at - y.at; }).slice(-50);
  }

  async function makeRecWrap(ckRaw, code) {
    var w = await wrapWithPin(ckRaw, code);
    return { id: randHex(8), at: Date.now(), s: w.s, i: w.i, c: w.c, n: w.n };
  }

  function publishRec() {
    var m2 = loadMeta2();
    if (!secu || !m2 || !validRec(m2.rec)) return false;
    if (state && state.rec && state.rec.id && state.rec.id !== m2.rec.id) return false;
    var msg = recFields(m2.rec);
    msg.kind = "rec";
    msg.v = 1;
    if (mqttHandle && mqttHandle.publishTo && mqttLive && mqttHandle.publishTo("rec", JSON.stringify(msg), true)) {
      recPubPending = false;
      recRelaySeenId = msg.id;
      return true;
    }
    recPubPending = true;
    clearTimeout(recPubTimer);
    recPubTimer = setTimeout(function () { if (recPubPending && unlocked) publishRec(); }, 3000);
    return false;
  }

  /* Copie de secours reçue des relais. */
  var pendingRecEnv = null;
  function handleRecEnv(env) {
    if (!validRec(env)) return;
    var m2 = loadMeta2();
    if (!secu || !m2 || !unlocked) { pendingRecEnv = env; return; } /* reçu pendant la jonction : appliqué après */
    pendingRecEnv = null;
    recRelaySeenId = String(env.id);
    var cur = m2.rec;
    var auth = state && state.rec;
    if (auth && auth.id && auth.id !== env.id && (auth.at || 0) > (Number(env.at) || 0)) {
      /* Copie périmée sur les relais (code remplacé) : on republie la bonne si on l’a. */
      if (cur && cur.id === auth.id) setTimeout(publishRec, 1500);
      return;
    }
    if (!validRec(cur) || (Number(env.at) || 0) > (cur.at || 0)) {
      m2.rec = recFields(env);
      saveMeta2(m2);
    } else if (cur.id !== env.id && (cur.at || 0) > (Number(env.at) || 0) && (!auth || auth.id === cur.id)) {
      setTimeout(publishRec, 1500);
    }
  }

  /* Un code remplacé ailleurs n’est plus accepté ici (copie locale effacée). */
  function syncRecLocal() {
    if (!secu || !state || !state.rec || !state.rec.id) return;
    var m2 = loadMeta2();
    if (!m2 || !m2.rec) return;
    if (m2.rec.id !== state.rec.id && (m2.rec.at || 0) < (state.rec.at || 0)) {
      delete m2.rec;
      saveMeta2(m2);
    }
  }

  function recOnConnect() {
    setTimeout(function () {
      if (!secu || !unlocked) return;
      var m2 = loadMeta2();
      if (!m2 || !validRec(m2.rec)) return;
      if (recPubPending || recRelaySeenId !== m2.rec.id) publishRec();
    }, 4000);
  }

  async function createRecoveryCode(force) {
    if (!secu || !unlocked) { toast("Disponible une fois le cabinet sécurisé."); return; }
    if (!force && (!isAdmin() || isKicked())) { toast("Réservé à un administrateur."); return; }
    var code = randomRecCode();
    var rec = await makeRecWrap(secu.ckRaw, code);
    var m2 = loadMeta2();
    if (!m2) return;
    m2.rec = rec;
    saveMeta2(m2);
    ensureTx();
    state.rec = { id: rec.id, at: rec.at };
    await persist(true);
    publishRec();
    showRecCode(code);
    renderSecuModal();
  }

  function showRecCode(code) {
    recShownCode = code;
    $("rec-code").textContent = fmtRecCode(code);
    $("rec-step-show").hidden = false;
    $("rec-step-check").hidden = true;
    $("rec-check-input").value = "";
    $("rec-check-error").hidden = true;
    $("rec-mail-error").hidden = true;
    $("modal-rec").hidden = false;
  }

  function recMailHref(addr, code) {
    var body = "Code de récupération Vydel :\n\n" + fmtRecCode(code) +
      "\n\nGardez ce mail, ne le transférez pas. Il permet de choisir un nouveau PIN sur un téléphone du cabinet si le PIN est oublié." +
      "\nRangez-le à part du PIN. N’ajoutez aucune autre information à ce mail.";
    return "mailto:" + encodeURIComponent(addr) + "?subject=" + encodeURIComponent("Vydel — code de récupération") + "&body=" + encodeURIComponent(body);
  }

  if ($("btn-rec-mail")) $("btn-rec-mail").addEventListener("click", function () {
    var addr = String($("rec-mail").value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      $("rec-mail-error").textContent = "Adresse e-mail non valable.";
      $("rec-mail-error").hidden = false;
      return;
    }
    $("rec-mail-error").hidden = true;
    var a = document.createElement("a");
    a.href = recMailHref(addr, recShownCode);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
  if ($("btn-rec-noted")) $("btn-rec-noted").addEventListener("click", function () {
    $("rec-step-show").hidden = true;
    $("rec-step-check").hidden = false;
    $("rec-check-error").hidden = true;
    setTimeout(function () { try { $("rec-check-input").focus(); } catch (e) {} }, 100);
  });
  if ($("btn-rec-back")) $("btn-rec-back").addEventListener("click", function () {
    $("rec-step-show").hidden = false;
    $("rec-step-check").hidden = true;
  });
  if ($("btn-rec-check")) $("btn-rec-check").addEventListener("click", function () {
    var v = normRecCode($("rec-check-input").value);
    if (v.length !== 4 || v !== recShownCode.slice(-4)) {
      $("rec-check-error").textContent = "Ce ne sont pas les 4 derniers caractères. Revoyez le code.";
      $("rec-check-error").hidden = false;
      return;
    }
    recShownCode = "";
    $("rec-code").textContent = "";
    $("rec-mail").value = "";
    $("modal-rec").hidden = true;
    toast("Code de récupération enregistré. Il ne sera plus affiché.");
  });

  /* Essais : délai progressif après 3 échecs (30 s, 1 min, 2 min… jusqu’à 1 h). */
  function recTries() {
    try { var t = JSON.parse(localStorage.getItem(LS_REC_TRIES) || "null"); return t && typeof t.n === "number" ? t : { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; }
  }
  function recFail() {
    var t = recTries();
    t.n += 1;
    t.until = t.n >= 3 ? Date.now() + Math.min(3600000, 30000 * Math.pow(2, t.n - 3)) : 0;
    try { localStorage.setItem(LS_REC_TRIES, JSON.stringify(t)); } catch (e) {}
    return t;
  }
  function recWaitLabel(ms) {
    var s = Math.ceil(ms / 1000);
    return s < 60 ? s + " s" : Math.ceil(s / 60) + " min";
  }

  function openRecUse() {
    $("rec-use-input").value = "";
    $("rec-use-error").hidden = true;
    $("modal-rec-use").hidden = false;
    setTimeout(function () { try { $("rec-use-input").focus(); } catch (e) {} }, 100);
  }

  async function submitRecUse() {
    var err = $("rec-use-error");
    var t = recTries();
    if (t.until && Date.now() < t.until) {
      err.textContent = "Trop d’essais. Réessayez dans " + recWaitLabel(t.until - Date.now()) + ".";
      err.hidden = false;
      return;
    }
    var code = normRecCode($("rec-use-input").value);
    if (code.length !== 24) {
      err.textContent = "Le code fait 24 caractères (6 groupes de 4).";
      err.hidden = false;
      return;
    }
    var m2 = loadMeta2();
    if (!m2) { err.textContent = "Ce téléphone n’a pas de cabinet sécurisé."; err.hidden = false; return; }
    err.textContent = "Vérification…";
    err.hidden = false;
    var rec = validRec(m2.rec) ? m2.rec : null;
    if (!rec) {
      try {
        rec = await peekMqttEnv(m2.topic, 20000, "rec", function (e) { return e && e.kind === "rec" && validRec(e); });
      } catch (eP) { rec = null; }
      if (!rec) { err.textContent = "Copie de secours introuvable. Vérifiez Internet, puis réessayez."; return; }
    }
    var ckRaw = null;
    try { ckRaw = await unwrapWithPin(rec, code); } catch (eU) { ckRaw = null; }
    if (!ckRaw) {
      var tf = recFail();
      err.textContent = "Code incorrect." + (tf.until ? " Prochain essai dans " + recWaitLabel(tf.until - Date.now()) + "." : "");
      return;
    }
    /* Code remplacé entre-temps (état local plus récent) : refusé. */
    try {
      var envL = JSON.parse(localStorage.getItem(LS_ENC2) || "null");
      if (envL && envL.ct) {
        var stL = await decryptEnvelope(envL, await importAes(ckRaw));
        if (stL && stL.rec && stL.rec.id && stL.rec.id !== rec.id && (stL.rec.at || 0) > (rec.at || 0)) {
          recFail();
          err.textContent = "Ce code a été remplacé. Utilisez le dernier code remis.";
          return;
        }
      }
    } catch (eS) {}
    try { localStorage.removeItem(LS_REC_TRIES); } catch (eT) {}
    recCkPending = ckRaw;
    $("modal-rec-use").hidden = true;
    openPin("rec-setup", "Nouveau PIN", "Code accepté. Choisissez un nouveau PIN (4 à 6 chiffres) pour ce téléphone.");
  }

  async function finishRecovery(newPin) {
    var ckRaw = recCkPending;
    recCkPending = null;
    var m2 = loadMeta2();
    if (!ckRaw || !m2) { showScreen("screen-welcome"); return; }
    /* Nouveau verrou PIN (nouveau sel) ; l’ancien verrou et la copie liée à l’ancien code disparaissent. */
    m2.wrap = await wrapWithPin(ckRaw, newPin);
    delete m2.rec;
    saveMeta2(m2);
    meta = loadMeta() || {};
    if (meta.pinHash) { meta.pinHash = ""; saveMeta(); }
    try { localStorage.removeItem(LS_ENC); } catch (eE) {}
    localLegacyKey = null;
    rememberPin(newPin);
    await activateSecu(m2, ckRaw);
    var loaded = null;
    try {
      var env2 = JSON.parse(localStorage.getItem(LS_ENC2) || "null");
      if (env2 && env2.ct) loaded = await decryptEnvelope(env2, secu.ck);
    } catch (e2) { loaded = null; }
    state = normState(loaded || emptyState());
    lastFait = faitTodayIds();
    lastFaitReady = true;
    seedTxWatch();
    unlocked = true;
    pinFirst = "";
    pinBuf = "";
    var now = Date.now();
    ensureTx();
    state.secLog = mergeSecLog(state.secLog, [{ kind: "recovery", at: now, by: localDisplayName() || "?" }]);
    try { localStorage.setItem(LS_REC_SEEN, String(now)); } catch (eS) {}
    enterApp(false);
    /* L’ancien code est annulé : nouveau code tout de suite (copie locale + relais remplacées). */
    await createRecoveryCode(true);
    toast("Nouveau PIN enregistré. Notez le nouveau code de récupération.");
  }

  /* Rappel d’ordonnance : à partir de 7 jours avant la date de fin (bandeau + repère sur la fiche). */
  function ordoVeillePatients() {
    return ((state && state.patients) || []).filter(function (p) { return !isPatientGone(p) && isPatientActif(p) && ordoVeille(p); });
  }
  function ordoAlertWhen(d) {
    var days = ordoDaysLeft(d);
    if (days === 0) return "aujourd’hui";
    if (days === 1) return "demain";
    return "dans " + days + " jours";
  }
  function renderOrdoBanner() {
    var b = $("ordo-banner");
    if (!b || !unlocked) return;
    var list = ordoVeillePatients();
    var hid = "";
    try { hid = localStorage.getItem("tournee.ordoBannerHide") || ""; } catch (e) {}
    if (!list.length || hid === todayISO()) { b.hidden = true; return; }
    var text;
    if (list.length === 1) {
      var alertDates = ordoDateList(list[0]).filter(ordoInAlertWindow);
      if (alertDates.length === 1) {
        text = "Ordonnance à renouveler : fin " + ordoAlertWhen(alertDates[0]) + " pour " + displayName(list[0]) + ".";
      } else {
        text = "Ordonnances à renouveler cette semaine pour " + displayName(list[0]) + ".";
      }
    } else {
      text = "Ordonnance à renouveler cette semaine pour " + list.map(displayName).join(", ") + ".";
    }
    $("ordo-banner-text").textContent = text;
    b.hidden = false;
    maybeOrdoNotif(list.length);
  }
  /* Notification locale seulement si l’appli est ouverte et les notifications déjà autorisées (une fois par jour, sans nom). */
  function maybeOrdoNotif(n) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (localStorage.getItem("tournee.ordoNotif") === todayISO()) return;
      localStorage.setItem("tournee.ordoNotif", todayISO());
      var body = "Ordonnance à renouveler dans les 7 jours pour " + n + " patient" + (n > 1 ? "s" : "") + ". Ouvrez Vydel pour voir.";
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("Vydel", { body: body, tag: "ordo-" + todayISO(), icon: "./icons/icon-192.png" }); }).catch(function () {});
      }
    } catch (e) {}
  }
  if ($("ordo-banner-x")) $("ordo-banner-x").addEventListener("click", function () {
    try { localStorage.setItem("tournee.ordoBannerHide", todayISO()); } catch (e) {}
    $("ordo-banner").hidden = true;
  });

  function renderRecBanner() {
    var b = $("rec-banner");
    if (!b) return;
    var seen = 0;
    try { seen = Number(localStorage.getItem(LS_REC_SEEN) || 0) || 0; } catch (e) {}
    var list = ((state && state.secLog) || []).filter(function (e) { return e && e.kind === "recovery" && e.at > seen; });
    if (!list.length) { b.hidden = true; return; }
    var last = list[list.length - 1];
    var d = new Date(last.at);
    $("rec-banner-text").textContent = "PIN réinitialisé par code de récupération le " +
      d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
      " sur le téléphone de " + (last.by && last.by !== "?" ? last.by : "(prénom non indiqué)") + ".";
    b.setAttribute("data-at", String(last.at));
    b.hidden = false;
  }
  if ($("rec-banner-x")) $("rec-banner-x").addEventListener("click", function () {
    var at = $("rec-banner").getAttribute("data-at") || "0";
    try { localStorage.setItem(LS_REC_SEEN, at); } catch (e) {}
    $("rec-banner").hidden = true;
  });

  if ($("btn-pin-forgot")) $("btn-pin-forgot").addEventListener("click", openRecUse);
  if ($("btn-rec-use-go")) $("btn-rec-use-go").addEventListener("click", function () { submitRecUse(); });
  if ($("btn-rec-use-cancel")) $("btn-rec-use-cancel").addEventListener("click", function () { $("modal-rec-use").hidden = true; });
  if ($("btn-secu-rec")) $("btn-secu-rec").addEventListener("click", function () {
    var has = state && state.rec && state.rec.id;
    if (!has) { if ($("modal-secu")) $("modal-secu").hidden = true; createRecoveryCode(false); return; }
    askConfirm("Remplacer le code de récupération ?", "L’ancien code ne marchera plus. Le nouveau code s’affiche une seule fois.", function () {
      if ($("modal-secu")) $("modal-secu").hidden = true;
      createRecoveryCode(false);
    });
  });

  function showMovedNotice() {
    if (movedShown || secu) return;
    movedShown = true;
    askConfirm(
      "Cabinet sécurisé",
      "Le cabinet est passé à la nouvelle protection. Mettez l’appli à jour (Menu → Mettre à jour). Si ça ne suffit pas, demandez un lien d’invitation à un administrateur du cabinet.",
      null
    );
  }

  function renderSecuModal() {
    var box = $("modal-secu");
    if (!box) return;
    var text = $("secu-text");
    var list = $("secu-list");
    var go = $("btn-secu-go");
    var closeBtn = $("btn-secu-close-old");
    var inv = $("btn-secu-invite");
    var admin = isAdmin() && !isKicked();
    if ($("secu-paste")) $("secu-paste").hidden = !!secu;
    if (!secu) {
      if (text) text.textContent = "Ce cabinet utilise encore l’ancienne protection : le PIN sert aussi de clé. Sécuriser crée une vraie clé secrète sur ce téléphone et l’envoie tout seul aux autres téléphones du cabinet. Même PIN, mêmes patients, rien à refaire.";
      if (list) list.textContent = "";
      if (go) go.hidden = !admin;
      if (closeBtn) closeBtn.hidden = true;
      if (inv) inv.hidden = true;
      return;
    }
    if (go) go.hidden = true;
    if (inv) inv.hidden = !admin;
    var st = state.secu || {};
    var since = st.at ? formatDateFr(toISODate(new Date(st.at))) : "";
    var acks = Object.keys(st.acks || {});
    var ackF = acks.map(foldName);
    var cutoff = Date.now() - 30 * 86400000;
    var pending = Object.keys(state.presence || {}).filter(function (n) {
      var f = foldName(n);
      return (state.presence[n] || 0) > cutoff && ackF.indexOf(f) === -1 && f !== "developpeur" && f !== "pepper";
    });
    var done = secu.closed || !secu.old;
    if (text) {
      text.textContent = done
        ? "Cabinet sécurisé" + (since ? " depuis le " + since : "") + ". Pour un nouveau téléphone : Inviter un téléphone (le PIN se donne en personne)."
        : "Cabinet sécurisé" + (since ? " depuis le " + since : "") + ". Transition en cours : les téléphones pas encore à jour continuent de marcher. Fin automatique le " + formatDateFr(toISODate(new Date(secuCloseAt()))) + ".";
    }
    if (list) {
      list.textContent = "Téléphones passés : " + (acks.length ? acks.join(", ") : "—")
        + (pending.length ? "\nPas encore passés : " + pending.join(", ") : "");
    }
    if (closeBtn) closeBtn.hidden = !admin || done;
    var recBtn = $("btn-secu-rec");
    var recSt = $("secu-rec-status");
    var hasRec = !!(state.rec && state.rec.id);
    if (recBtn) {
      recBtn.hidden = !admin;
      recBtn.textContent = hasRec ? "Remplacer le code de récupération" : "Créer un code de récupération";
    }
    if (recSt) {
      recSt.hidden = false;
      recSt.textContent = hasRec
        ? "Code de récupération : créé le " + formatDateFr(toISODate(new Date(state.rec.at))) + ". Il n’est plus affichable ; en cas de perte, un admin en crée un nouveau."
        : "Pas encore de code de récupération. Sans lui, un PIN oublié sans autre téléphone du cabinet = données perdues.";
    }
  }

  /* 1.97 — « X/Y téléphones sécurisés » dans le menu, sous « Sécurité du cabinet ».
     Chaque téléphone qui détient la clé du cabinet s’inscrit lui-même dans state.secu.acks (secuAck) ;
     cet état ne circule que chiffré avec la clé du cabinet. Y = membres connus (liste du cabinet si
     elle existe, sinon téléphones vus depuis 30 jours), hors personnes retirées et comptes techniques. */
  function secuStatus() {
    if (!secu || !state) return null;
    ensureTx();
    var st = state.secu || {};
    var acks = st.acks || {};
    var cutoff = Date.now() - 30 * 86400000;
    var map = {};
    function add(n) {
      n = String(n || "").trim().slice(0, 24);
      var f = foldName(n);
      if (!f || isHiddenPresence(n) || isBlockedName(n)) return;
      if (!map[f]) map[f] = { name: n, ok: false };
    }
    if (seatPlanOn()) {
      (state.roster || []).forEach(function (rec) { if (rec && rec.name) add(rec.name); });
    } else {
      Object.keys(state.presence || {}).forEach(function (n) { if ((state.presence[n] || 0) > cutoff) add(n); });
      Object.keys(acks).forEach(add);
    }
    var me = localDisplayName();
    if (me) add(me);
    Object.keys(acks).forEach(function (n) { var f = foldName(n); if (map[f]) map[f].ok = true; });
    var all = Object.keys(map).map(function (k) { return map[k]; });
    var pending = all.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
    pending.sort(function (a, b) { return a.localeCompare(b, "fr"); });
    return { n: all.length - pending.length, total: all.length, pending: pending };
  }

  function renderMenuSecuStatus() {
    var el = $("menu-secu-status");
    if (!el) return;
    var s = (unlocked && !isKicked()) ? secuStatus() : null;
    if (!s || !s.total) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = s.pending.length
      ? s.n + "/" + s.total + " · en attente : " + s.pending.join(", ")
      : s.n + "/" + s.total + " téléphone" + (s.total > 1 ? "s" : "") + " sécurisé" + (s.total > 1 ? "s" : "") + " ✅";
    el.hidden = false;
  }

  function openSecuModal() {
    if ($("modal-menu")) $("modal-menu").hidden = true;
    renderSecuModal();
    if ($("modal-secu")) $("modal-secu").hidden = false;
  }

  async function tryCreateBlob() { return startShare(); }
  async function startShare() {
    if (!meta) return;
    if (!meta.blobId) meta.blobId = newShareId();
    meta.blobUrl = "mqtt:" + meta.blobId;
    saveMeta();
    startMqtt(meta.blobId);
  }

  async function createCabinet(pin) {
    if (String(pin || "").length < NEW_CABINET_PIN_LEN) {
      toast("Pour un nouveau cabinet, le PIN doit faire 6 chiffres.");
      return;
    }
    if (!canCreateCabinet()) {
      toast("Pour créer un cabinet, il faut un essai offert par une IDEL qui utilise Vydel.");
      showScreen("screen-beta");
      return;
    }
    /* 1.98 : essai — vérifié (signature, annulation) puis premier usage inscrit sur le relais AVANT de créer quoi que ce soit. */
    var trialRes = pendingTrialRes;
    var trialCode = "";
    try { trialCode = sessionStorage.getItem(SS_TRIAL_CODE) || ""; } catch (eT) {}
    var childIss = null;
    if (trialCode && !emergencyCreate && !isDevPhone()) {
      if (!trialRes || trialRes.code !== trialCode) trialRes = await parseAndVerifyBeta(trialCode);
      var trialFail = function (msg) {
        clearBetaSession();
        showScreen("screen-beta");
        if ($("beta-error")) { $("beta-error").hidden = false; $("beta-error").textContent = msg; }
      };
      if (!trialRes || !trialRes.ok) { trialFail((trialRes && trialRes.err) || TRIAL_BAD); return; }
      toast("Vérification de l’essai…");
      if (!trialRes.legacy) childIss = await newIssuerKeys();
      var claim = await trialClaim(trialRes, childIss ? childIss.pub : "");
      if (!claim.ok) { trialFail(claim.err); return; }
    } else trialRes = null;
    rememberPin(pin);
    /* 1.91 : nouveau cabinet directement en mode sécurisé (clé et sujet aléatoires). */
    var ckRaw = crypto.getRandomValues(new Uint8Array(32));
    var topicNew = randHex(16);
    meta = {
      salt: b64(crypto.getRandomValues(new Uint8Array(16))),
      pinHash: "",
      blobId: topicNew,
      blobUrl: "mqtt:" + topicNew,
      shareOk: false
    };
    var m2c = { v: 2, topic: topicNew, at: Date.now(), wrap: await wrapWithPin(ckRaw, pin), old: null, closed: true };
    saveMeta2(m2c);
    localLegacyKey = null;
    await activateSecu(m2c, ckRaw);
    state = emptyState();
    state.cabinetMode = "split";
    state.roster = [];
    state.secu = { at: m2c.at, closedAt: 0, acks: {} };
    state.trial = newTrialInfo(m2c.at);
    if (childIss && trialRes) state.trialIssuer = { kid: childIss.kid, pub: childIss.pub, jwk: childIss.jwk, chain: null, at: Date.now(), req: trialRes.h };
    lastFait = [];
    lastFaitReady = true;
    seedTxWatch();
    saveMeta();
    await persist(true);
    unlocked = true;
    var burnId = pendingBetaId;
    try { burnId = burnId || sessionStorage.getItem(SS_BETA_ID) || ""; } catch (eB) {}
    if (burnId) markBetaUsed(burnId);
    if (trialRes && trialRes.id) markBetaUsed(trialRes.id);
    clearBetaSession();
    emergencyCreate = false;
    markNewCabinetOnboarding(); /* 1.99 : tutoriel d’ouverture, nouveaux cabinets seulement */
    enterApp(true);
    startShare();
    createRecoveryCode(true);
  }

  async function applyNewPin(newPin) {
    clearTimeout(putTimer);
    if (secu) {
      var m2p = loadMeta2();
      if (!m2p) return;
      rememberPin(newPin);
      m2p.wrap = await wrapWithPin(secu.ckRaw, newPin);
      saveMeta2(m2p);
      if (localLegacyKey && meta && meta.pinHash) {
        var saltL = await pinSalt(newPin);
        meta.salt = b64(saltL);
        meta.pinHash = await pinHash(newPin, saltL);
        localLegacyKey = await deriveKey(newPin, saltL);
        saveMeta();
      }
      await persist(true);
      pinFirst = "";
      pinBuf = "";
      showScreen("screen-app");
      render();
      renderTransmissions();
      toast("PIN modifié sur ce téléphone. Les autres téléphones gardent leur PIN.");
      syncWatchToIdb();
      return;
    }
    rememberPin(newPin);
    var salt = await pinSalt(newPin);
    key = await deriveKey(newPin, salt);
    meta.salt = b64(salt);
    meta.pinHash = await pinHash(newPin, salt);
    meta.blobId = await pinTopicId(newPin);
    meta.blobUrl = "mqtt:" + meta.blobId;
    saveMeta();
    stopMqtt();
    startMqtt(meta.blobId);
    await persist(true);
    pinFirst = "";
    pinBuf = "";
    showScreen("screen-app");
    render();
    renderTransmissions();
    toast("PIN modifié. L’autre téléphone doit saisir le nouveau.");
    syncWatchToIdb();
  }

  async function tryUnlockWithRemote(pin) {
    if (!meta || !meta.blobId) return false;
    try {
      var res = await fetch(activeShareUrl(), {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) return false;
      var env = await res.json();
      if (!env || !env.iv || !env.ct || !env.salt) return false;
      var salt = unb64(env.salt);
      var k = await deriveKey(pin, salt);
      var data = await decryptEnvelope(env, k);
      key = k;
      state = data;
      if (!state.patients) state.patients = [];
      if (!state.done) state.done = {};
      if (!state.deleted) state.deleted = {};
      if (!state.transmissions) state.transmissions = {};
      if (!state.patientTx) state.patientTx = {};
      if (!state.invites) state.invites = [];
      if (!state.planning) state.planning = {};
      if (!state.history) state.history = {};
      if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
      meta.salt = env.salt;
      meta.pinHash = await pinHash(pin, salt);
      saveMeta();
      localStorage.setItem(LS_ENC, JSON.stringify(env));
      if (backfillHistory()) persist(false);
      lastFait = faitTodayIds();
      lastFaitReady = true;
      seedTxWatch();
      rememberPin(pin);
      unlocked = true;
      var ptrU = data && data.secuPtr;
      if (state.secuPtr) delete state.secuPtr;
      enterApp(false);
      if (ptrU) adoptPointer(ptrU, null);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function unlockWithPin(pin) {
    var m2u = loadMeta2();
    if (m2u) { await unlockV2(pin, m2u); return; }
    meta = loadMeta();
    if (!meta || !meta.salt || !meta.pinHash) {
      showScreen("screen-welcome");
      return;
    }
    var salt = unb64(meta.salt);
    var h = await pinHash(pin, salt);
    if (h !== meta.pinHash) {
      if (meta.blobId) {
        var remoteOk = await tryUnlockWithRemote(pin);
        if (remoteOk) return;
      }
      $("pin-error").textContent = "PIN incorrect.";
      $("pin-error").hidden = false;
      pinBuf = "";
      setPinDots();
      return;
    }
    rememberPin(pin);
    key = await deriveKey(pin, salt);
    try {
      var env = JSON.parse(localStorage.getItem(LS_ENC) || "null");
      if (env) state = await decryptEnvelope(env, key);
      else state = emptyState();
    } catch (e) {
      state = emptyState();
    }
    if (!state.patients) state.patients = [];
    if (!state.done) state.done = {};
    if (!state.deleted) state.deleted = {};
    if (!state.transmissions) state.transmissions = {};
    if (!state.patientTx) state.patientTx = {};
    if (!state.planning) state.planning = {};
    if (!state.history) state.history = {};
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    lastFait = faitTodayIds();
    lastFaitReady = true;
    seedTxWatch();
    unlocked = true;
    try {
      meta.blobId = await pinTopicId(pin);
      meta.blobUrl = "mqtt:" + meta.blobId;
      saveMeta();
    } catch (eT) {}
    await pullRemote(false);
    if (!unlocked) return;
    if (!state.history) state.history = {};
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    if (backfillHistory()) persist(false);
    enterApp(false);
  }

  async function joinCabinet() {
    var pin = ($("join-pin").value || "").replace(/\D/g, "");
    var err = $("join-error");
    if (pin.length < 4 || pin.length > 6) {
      err.textContent = "PIN : 4 à 6 chiffres.";
      err.hidden = false;
      return;
    }
    err.hidden = true;
    err.textContent = "Connexion…";
    err.hidden = false;
    var invRaw = $("join-invite") ? $("join-invite").value : "";
    var inv = parseInvite(invRaw) || pendingInvite;
    if (inv) {
      try {
        await joinWithInvite(pin, inv);
      } catch (eI) {
        stopMqtt();
        err.textContent = (eI && eI.code === "pin")
          ? "PIN incorrect pour cette invitation."
          : (eI && eI.code === "used")
            ? INVITE_REFUSED_MSG
            : "Impossible de rejoindre. Vérifiez Internet, puis réessayez.";
        err.hidden = false;
      }
      return;
    }
    try {
      var blobId = await pinTopicId(pin);
      var env = await waitMqttEnv(blobId, 12000);
      if (!env || !env.iv || !env.ct || !env.salt) throw new Error("format");
      var salt = unb64(env.salt);
      var k = await deriveKey(pin, salt);
      var data = await decryptEnvelope(env, k);
      key = k;
      state = data;
      if (!state.patients) state.patients = [];
      if (!state.done) state.done = {};
      if (!state.deleted) state.deleted = {};
      if (!state.transmissions) state.transmissions = {};
      if (!state.patientTx) state.patientTx = {};
      if (!state.invites) state.invites = [];
      if (!state.planning) state.planning = {};
      if (!state.history) state.history = {};
      if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
      backfillHistory();
      meta = {
        salt: env.salt,
        pinHash: await pinHash(pin, salt),
        blobId: blobId,
        blobUrl: "mqtt:" + blobId,
        shareOk: true
      };
      saveMeta();
      localStorage.setItem(LS_ENC, JSON.stringify(env));
      lastFait = faitTodayIds();
      lastFaitReady = true;
      seedTxWatch();
      rememberPin(pin);
      unlocked = true;
      var ptrJ = data && data.secuPtr;
      if (state.secuPtr) delete state.secuPtr;
      if (ptrJ) {
        enterApp(false);
        adoptPointer(ptrJ, null);
        return;
      }
      persist(true);
      enterApp(false);
    } catch (e) {
      err.textContent = "Impossible de rejoindre. Vérifiez le PIN. Si le cabinet a été sécurisé, demandez un lien d’invitation à un administrateur du cabinet.";
      err.hidden = false;
    }
  }

  function flushPendingVoix() {
    var list = pendingVoix;
    pendingVoix = [];
    list.forEach(function (e) { applyVoiceEnv(e); });
  }


  function purgeCedricVocals() {
    return; /* vydel-app : purge propre à l’ancien cabinet, inutile ici */
    if (!unlocked || !state || !state.transmissions) return;
    try { if (localStorage.getItem("tournee-voix-purge-cedric-174")) return; } catch (eFlag) { return; }
    var now = Date.now();
    var changed = false;
    Object.keys(state.transmissions).forEach(function (day) {
      var rec = state.transmissions[day];
      if (!rec || !rec.items) return;
      rec.items.forEach(function (it) {
        if (!it || it.deletedAt) return;
        if (!samePerson(it.from, "Cédric") && !samePerson(it.from, "Cedric")) return;
        var txt = String(it.text || "").trim();
        if (!(it.voiceId || txt === "Vocal")) return;
        it.deletedAt = now;
        it.updatedAt = now;
        changed = true;
        (rec.voices || []).forEach(function (v) {
          if (!v || v.deletedAt) return;
          if (v.id === it.voiceId || (v.itemId && v.itemId === it.id)) {
            v.deletedAt = now;
            delete voiceBlobs[v.id];
            if (mqttHandle && mqttHandle.publishTo) mqttHandle.publishTo("voix/" + v.id, "{}", true);
          }
        });
      });
      if (changed) {
        rec.updatedAt = now;
        lastTxMap[day] = now;
      }
    });
    try { localStorage.setItem("tournee-voix-purge-cedric-174", "1"); } catch (eSet) {}
    if (changed) persist(true);
  }

  function purgeEmptyVocals() {
    if (!unlocked || !state || !state.transmissions) return;
    try { if (localStorage.getItem("tournee-voix-purge-167")) return; } catch (eFlag) { return; }
    var cutoff = Date.UTC(2026, 8, 8, 19, 0, 0);
    var now = Date.now();
    var changed = false;
    Object.keys(state.transmissions).forEach(function (day) {
      var rec = state.transmissions[day];
      if (!rec || !rec.items) return;
      rec.items.forEach(function (it) {
        if (!it || it.deletedAt) return;
        if (String(it.text || "").trim() !== "Vocal") return;
        if ((it.t || 0) >= cutoff) return;
        it.deletedAt = now;
        it.updatedAt = now;
        changed = true;
        (rec.voices || []).forEach(function (v) {
          if (!v || v.deletedAt) return;
          if (v.id === it.voiceId || (v.itemId && v.itemId === it.id)) {
            v.deletedAt = now;
            delete voiceBlobs[v.id];
            if (mqttHandle && mqttHandle.publishTo) mqttHandle.publishTo("voix/" + v.id, "{}", true);
          }
        });
      });
      if (changed) {
        rec.updatedAt = now;
        lastTxMap[day] = now;
      }
    });
    try { localStorage.setItem("tournee-voix-purge-167", "1"); } catch (eSet) {}
    if (changed) persist(true);
  }

  function stripPatientPhotos() {
    if (!unlocked || !state || !state.patients) return;
    try { if (localStorage.getItem("tournee-photos-off-176")) return; } catch (eFlag) { return; }
    var changed = false;
    state.patients.forEach(function (p) {
      if (!p) return;
      if (p.photos && p.photos.length) {
        p.photos = [];
        changed = true;
      }
    });
    try { localStorage.setItem("tournee-photos-off-176", "1"); } catch (eSet) {}
    if (changed) persist(true);
  }

  function enterApp(fresh) {
    viewDayISO = "";
    setTimeout(function () { tryTrialActivation().then(function () { trialSync(); }); }, 2500);
    outboxSig = outboxSigOf(state);
    setTimeout(refreshSyncUi, 0);
    showScreen("screen-app");
    flushPendingVoix();
    purgeGhostInvites();
    stripPatientPhotos(); /* anciennes photos synchronisées (1.76) uniquement : les photos 1.91 sont dans IndexedDB */
    purgePhotos().then(phAdoptLocal).catch(function () {});
    phStartSweep();
    healReplyKinds();
    setTab("tournee");
    if (restoreMorningFaits()) persist(true);
    fillDayStrip();
    render();
    armOpenScroll(2500);
    purgeEmptyVocals();
    purgeCedricVocals();
    renderTransmissions();
    showInstallBanner();
    showShareBanner();
    startPolling();
    if (meta && meta.blobId) startMqtt(meta.blobId);
    syncWatchToIdb();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(function (reg) {
        try { reg.active && reg.active.postMessage({ type: "START_WATCH" }); } catch (e) {}
      });
    }
    if (!localDisplayName()) setTimeout(maybeAskPrenom, 400);
    else {
      ensureSeatForMe();
      setTimeout(maybeAskTuto, fresh ? 700 : 500);
    }
    restorePatientDraft();
    queueMissingGeocodes();
    ensureMsgSeen();
    ensureTxSeen();
    updateMsgBadge();
    startPresencePulse();
    applyAccessGate();
    if (secu && secuAck()) persist(false);
    if (pendingRecEnv) { var pre = pendingRecEnv; setTimeout(function () { handleRecEnv(pre); }, 50); }
    if (!secu && pendingInvite) {
      var invP = pendingInvite;
      pendingInvite = null;
      setTimeout(function () { useInviteOnLegacy(invP); }, 800);
    }
  }

  function lockNow() {
    snapshotPatientDraft();
    closeCarMode();
    recShownCode = "";
    recCkPending = null;
    phRevokeGrid($("ph-grid"));
    phRevokeGrid($("ordo-ph-grid"));
    phStopSweep();
    if ($("modal-ph-view")) { $("modal-ph-view").hidden = true; $("ph-view-img").removeAttribute("src"); }
    clearTimeout(recPubTimer);
    if ($("modal-rec")) $("modal-rec").hidden = true;
    if ($("rec-code")) $("rec-code").textContent = "";
    stopVoixRec(true);
    voiceBlobs = {};
    if ($("btn-change-pin")) $("btn-change-pin").hidden = true;
    sessionPin = "";
    lastPubCt = "";
    clearTimeout(mqttFlushTimer);
    mqttFlushTimer = null;
    shareDirty = false;
    mqttLive = false;
    stopMqtt();
    if ($("modal-patient")) $("modal-patient").hidden = true;
    if ($("modal-nav")) $("modal-nav").hidden = true;
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("modal-confirm")) $("modal-confirm").hidden = true;
    if ($("modal-planning")) $("modal-planning").hidden = true;
    if ($("modal-prenom")) $("modal-prenom").hidden = true;
    if ($("modal-feedback")) $("modal-feedback").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
    if ($("modal-staff")) $("modal-staff").hidden = true;
    if ($("modal-kicked")) $("modal-kicked").hidden = true;
    prenomThenSend = false;
    prenomRequired = false;
    stopPresencePulse();
    unlocked = false;
    key = null;
    secu = null;
    localLegacyKey = null;
    legacySeq++;
    clearTimeout(bridgeTimer);
    bridgeTimer = null;
    state = emptyState();
    lastTxMap = {};
    lastTxReady = false;
    txOpen = {};
    clearTimeout(txSaveTimer);
    txSaveTimer = null;
    txPendingDay = null;
    txPendingEl = null;
    stopPolling();
    clearWatchKey();
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "STOP_WATCH" });
    }
    $("list").innerHTML = "";
    if ($("tx-today")) $("tx-today").value = "";
    if ($("tx-history")) $("tx-history").innerHTML = "";
    if ($("msg-input")) $("msg-input").value = "";
    if ($("msg-list")) $("msg-list").innerHTML = "";
    pinBuf = "";
    currentTab = "tournee";
    openPin("unlock", "Code PIN", "Saisissez le PIN du cabinet.");
  }

  if ($("btn-lock")) $("btn-lock").addEventListener("click", lockNow);
  if ($("btn-lock-2")) $("btn-lock-2").addEventListener("click", function () {
    $("modal-menu").hidden = true;
    lockNow();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      snapshotPatientDraft();
      if (patientFormOpen()) return;
      hideTimer = setTimeout(function () {
        if (unlocked && !patientFormOpen()) lockNow();
      }, LOCK_HIDDEN_MS);
    } else {
      clearTimeout(hideTimer);
      if (unlocked) {
        pullRemote(true);
        touchPresence(true);
      }
      checkAppUpdate();
    }
  });

  function patientById(id) {
    for (var i = 0; i < state.patients.length; i++) {
      if (state.patients[i].id === id) return state.patients[i];
    }
    return null;
  }

  function visitsOnDow(p, dow) {
    if (!p) return false;
    if (!p.jours || !p.jours.length) return true;
    var d = Number(dow);
    for (var i = 0; i < p.jours.length; i++) {
      if (Number(p.jours[i]) === d) return true;
    }
    return false;
  }

  function visitsToday(p) {
    return visitsOnDow(p, new Date().getDay());
  }

  function visitsOnISO(p, iso) {
    return visitsOnDow(p, parseISODate(iso).getDay());
  }

  function splitToursOn() {
    return !!(state && state.cabinetMode === "split");
  }

  function patientOnSlot(p) {
    if (!splitToursOn()) return true;
    var s = p && p.tourSlot;
    if (!s || s === "both") return true;
    return s === tourSlot;
  }

  function ordoDateList(p) {
    var out = [];
    function add(d) {
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && out.indexOf(d) === -1) out.push(d);
    }
    add(p && p.ordoExp);
    add(p && p.ordoExp2);
    return out;
  }
  function ordoDaysLeft(d) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    var exp = parseISODate(d);
    var today = parseISODate(todayISO());
    return Math.round((exp.getTime() - today.getTime()) / 86400000);
  }
  function ordoInAlertWindow(d) {
    var days = ordoDaysLeft(d);
    return days != null && days >= 0 && days <= 7;
  }
  function ordoMetaOne(d, label) {
    var days = ordoDaysLeft(d);
    if (days == null) return null;
    var pretty = d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
    var cls = "";
    var text;
    if (label) {
      text = label + " jusqu’au " + pretty;
      if (days < 0) { cls = "late"; text = label + " expirée le " + pretty; }
      else if (days === 0) { cls = "late veille"; text = label + " expire aujourd’hui"; }
      else if (days === 1) { cls = "late veille"; text = label + " : fin demain · " + pretty; }
      else if (days <= 7) { cls = "late veille"; text = label + " : fin dans " + days + " j · " + pretty; }
      else if (days <= 14) { cls = "warn"; text = label + " dans " + days + " j · " + pretty; }
    } else {
      text = "Ordo jusqu’au " + pretty;
      if (days < 0) { cls = "late"; text = "Ordo expirée le " + pretty; }
      else if (days === 0) { cls = "late veille"; text = "Ordo expire aujourd’hui"; }
      else if (days === 1) { cls = "late veille"; text = "Fin d’ordo demain · " + pretty; }
      else if (days <= 7) { cls = "late veille"; text = "Fin d’ordo dans " + days + " j · " + pretty; }
      else if (days <= 14) { cls = "warn"; text = "Ordo dans " + days + " j · " + pretty; }
    }
    return { text: text, cls: cls, days: days, date: d };
  }
  function ordoMetas(p) {
    var has1 = !!(p && p.ordoExp && /^\d{4}-\d{2}-\d{2}$/.test(p.ordoExp));
    var has2 = !!(p && p.ordoExp2 && /^\d{4}-\d{2}-\d{2}$/.test(p.ordoExp2));
    var out = [];
    if (has1) out.push(ordoMetaOne(p.ordoExp, has2 ? "Ordo 1" : ""));
    if (has2) out.push(ordoMetaOne(p.ordoExp2, has1 ? "Ordo 2" : ""));
    return out.filter(Boolean);
  }
  function ordoMeta(p) {
    var list = ordoMetas(p);
    if (!list.length) return null;
    list = list.slice().sort(function (a, b) { return a.days - b.days; });
    return list[0];
  }

  function syncTourUi() {
    var on = splitToursOn();
    if ($("btn-slot-am")) $("btn-slot-am").hidden = !on;
    if ($("btn-slot-pm")) $("btn-slot-pm").hidden = !on;
    if ($("f-tour-wrap")) $("f-tour-wrap").hidden = !on;
    if ($("btn-slot-am")) $("btn-slot-am").classList.toggle("on", on && tourSlot === "am");
    if ($("btn-slot-pm")) $("btn-slot-pm").classList.toggle("on", on && tourSlot === "pm");
  }

  function isFaitOnDay(id, iso) {
    if (!id || !iso) return false;
    if (iso === todayISO()) {
      var rec = state.done[id];
      return !!(rec && rec.d === iso);
    }
    var hist = state.history && state.history[iso] && state.history[iso].fait;
    var h = hist && hist[id];
    return !!(h && h.done);
  }

  function faitByOnDay(id, iso) {
    var hist = state.history && state.history[iso] && state.history[iso].fait;
    var h = hist && hist[id];
    if (!h || !h.done) return "";
    return String(h.by || "").trim();
  }

  function isPatientActif(p) {
    return p && p.actif !== false;
  }

  function isPatientGone(p) {
    if (!p || !p.id) return true;
    return !!(state.deleted[p.id] && state.deleted[p.id] >= (p.updatedAt || 0));
  }

  function monthLabel(y, m) {
    return MONTHS_FR[m] + " " + y;
  }

  function isoFromParts(y, m, d) {
    var mm = String(m + 1);
    var dd = String(d);
    if (mm.length < 2) mm = "0" + mm;
    if (dd.length < 2) dd = "0" + dd;
    return y + "-" + mm + "-" + dd;
  }

  function planName(iso) {
    var rec = state.planning && state.planning[iso];
    var n = rec && rec.name ? String(rec.name).trim() : "";
    return n;
  }

  function joursLabel(p) {
    if (!p) return "";
    // jours vide ou 7 jours = toute la semaine — on affiche quand même les lettres
    var days = (p.jours && p.jours.length && p.jours.length < 7)
      ? p.jours
      : [0, 1, 2, 3, 4, 5, 6];
    return JOUR_ORDER.filter(function (d) { return days.indexOf(d) >= 0; })
      .map(function (d) { return JOUR_LETTERS[d]; }).join(" · ");
  }

  function fillJours(jours) {
    var wrap = $("f-jours");
    if (!wrap) return;
    wrap.innerHTML = "";
    var selected = (jours && jours.length) ? jours.slice() : [0, 1, 2, 3, 4, 5, 6];
    JOUR_ORDER.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "jour-btn" + (selected.indexOf(d) >= 0 ? " on" : "");
      b.textContent = JOUR_LETTERS[d];
      b.setAttribute("aria-label", JOUR_NAMES[d]);
      b.setAttribute("aria-pressed", selected.indexOf(d) >= 0 ? "true" : "false");
      b.setAttribute("data-d", String(d));
      b.addEventListener("click", function () {
        b.classList.toggle("on");
        b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
        snapshotPatientDraft();
      });
      wrap.appendChild(b);
    });
  }

  function collectJours() {
    var wrap = $("f-jours");
    if (!wrap) return [];
    var out = [];
    Array.prototype.forEach.call(wrap.querySelectorAll(".jour-btn.on"), function (b) {
      out.push(Number(b.getAttribute("data-d")));
    });
    if (out.length === 7) return [];
    return out;
  }

  function visiblePatients() {
    var q = ($("search").value || "").trim().toLowerCase();
    var list = state.patients.filter(function (p) {
      if (isPatientGone(p)) return false;
      var actif = isPatientActif(p);
      if (listMode === "inactifs") {
        if (actif) return false;
      } else if (!actif) {
        return false;
      }
      if (!q) {
        if (listMode === "today" && !visitsOnISO(p, selectedDayISO())) return false;
        if (listMode === "today" && !patientOnSlot(p)) return false;
        return true;
      }
      return displayName(p).toLowerCase().indexOf(q) !== -1;
    });
    /* 1.91 : le statut Fait ne change plus l’ordre (les faits sont grisés sur place). */
    list.sort(function (a, b) {
      return displayName(a).localeCompare(displayName(b), "fr");
    });
    return list;
  }

  function inNiceArea(lat, lng) {
    return lat >= 43.58 && lat <= 43.82 && lng >= 7.12 && lng <= 7.42;
  }

  function addrForMaps(adresse) {
    var ad = normAddr(adresse);
    if (!ad) return "";
    if (/nice|trinit[eé]|06\d{3}|alpes-maritimes/i.test(ad)) return ad;
    return ad + ", Nice";
  }

  function mapsHref(adresse) {
    var q = encodeURIComponent(addrForMaps(adresse));
    var ua = navigator.userAgent || "";
    var apple = /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return apple ? "https://maps.apple.com/?q=" + q : "geo:0,0?q=" + q;
  }

  function mapsDirHref(adresses) {
    var list = (adresses || []).filter(function (s) { return String(s || "").trim(); }).slice(0, 9);
    if (!list.length) return "";
    var ua = navigator.userAgent || "";
    var apple = /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (apple) {
      return "https://maps.apple.com/?daddr=" + encodeURIComponent(list.join(" to "));
    }
    return "https://www.google.com/maps/dir/" + list.map(function (s) { return encodeURIComponent(s); }).join("/");
  }

  function destForPatient(p, typedAdresse) {
    var typed = normAddr(typedAdresse != null ? typedAdresse : (p && p.adresse) || "");
    var stored = p ? normAddr(p.adresse) : "";
    var coordsOk = p && typeof p.lat === "number" && typeof p.lng === "number" &&
      isFinite(p.lat) && isFinite(p.lng) && typed && typed === stored;
    if (coordsOk) return { kind: "coords", lat: p.lat, lng: p.lng, adresse: typed };
    if (typed) return { kind: "addr", adresse: typed };
    return null;
  }

  function currentPatientDest() {
    var typed = $("f-adresse") ? $("f-adresse").value : "";
    var p = editingId ? patientById(editingId) : null;
    return destForPatient(p, typed);
  }

  function buildNavUrl(app, dest, isApple) {
    if (!dest) return "";
    var adresse = dest.adresse ? addrForMaps(dest.adresse) : "";
    var q = dest.kind === "coords"
      ? (dest.lat + "," + dest.lng)
      : encodeURIComponent(adresse);
    if (app === "waze") {
      return dest.kind === "coords"
        ? ("https://waze.com/ul?ll=" + dest.lat + "," + dest.lng + "&navigate=yes")
        : ("https://waze.com/ul?q=" + encodeURIComponent(adresse) + "&navigate=yes");
    }
    if (app === "gmaps") {
      return "https://www.google.com/maps/dir/?api=1&destination=" + q + "&travelmode=driving";
    }
    if (app === "apple" || (app === "default" && isApple)) {
      return "https://maps.apple.com/?daddr=" + q + "&dirflg=d";
    }
    return "geo:0,0?q=" + q;
  }

  function openExternalNav(url) {
    if (!url) return;
    if (/^(geo:|waze:|maps:)/i.test(url)) {
      location.href = url;
      return;
    }
    try {
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      var w = null;
      try { w = window.open(url, "_blank"); } catch (e2) {}
      if (!w) location.href = url;
    }
  }

  function syncYallerBtn() {
    var btn = $("btn-yaller");
    if (!btn) return;
    var dest = currentPatientDest();
    if (dest) {
      btn.disabled = false;
      btn.textContent = "➤ Y aller";
    } else {
      btn.disabled = true;
      btn.textContent = "Adresse manquante";
    }
  }

  function markNavLastChoice() {
    var last = "";
    try { last = localStorage.getItem(LS_NAV_APP) || ""; } catch (e) {}
    document.querySelectorAll("#modal-nav .nav-choice").forEach(function (b) {
      var on = b.getAttribute("data-nav") === last;
      b.classList.toggle("last", on);
      var tag = b.querySelector(".nc-last");
      if (on) {
        if (!tag) {
          tag = document.createElement("span");
          tag.className = "nc-last";
          tag.textContent = "Dernier choix";
          b.appendChild(tag);
        }
      } else if (tag) {
        tag.remove();
      }
    });
  }

  var navDest = null;
  function openNavSheet(forDest) {
    var dest = forDest || currentPatientDest();
    navDest = dest;
    var hint = $("nav-dest");
    if (!dest) {
      if (!forDest) syncYallerBtn();
      return;
    }
    var label = dest.adresse
      ? ("Ouvrir l’itinéraire vers " + dest.adresse)
      : ("Ouvrir l’itinéraire vers " + dest.lat + "," + dest.lng);
    if (hint) hint.textContent = label;
    markNavLastChoice();
    if ($("modal-nav")) $("modal-nav").hidden = false;
  }

  function closeNavSheet() {
    if ($("modal-nav")) $("modal-nav").hidden = true;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function normAddr(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function queueGeocode(id) {
    if (!id) return;
    if (geoQueue.indexOf(id) >= 0) return;
    geoQueue.push(id);
    runGeoQueue();
  }

  function queueMissingGeocodes() {
    (state.patients || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (isPatientGone(p)) return;
      if (!isPatientActif(p)) return;
      if (!visitsToday(p)) return;
      var ad = normAddr(p.adresse);
      if (!ad) return;
      if (p.lat && p.lng && p.geoQ === ad && inNiceArea(p.lat, p.lng)) return;
      queueGeocode(p.id);
    });
  }

  function runGeoQueue() {
    if (geoBusy) return;
    var id = geoQueue.shift();
    if (!id) return;
    geoBusy = true;
    geocodePatient(id).then(function () {
      geoBusy = false;
      setTimeout(runGeoQueue, 1100);
    }, function () {
      geoBusy = false;
      setTimeout(runGeoQueue, 1100);
    });
  }

  async function geocodePatient(id) {
    var p = patientById(id);
    if (!p) return;
    var ad = normAddr(p.adresse);
    if (!ad) {
      p.lat = null;
      p.lng = null;
      p.geoQ = "";
      return;
    }
    if (p.lat && p.lng && p.geoQ === ad && inNiceArea(p.lat, p.lng)) return;
    var q = addrForMaps(ad);
    try {
      var url = "https://photon.komoot.io/api/?limit=1&lang=fr&lat=43.7034&lon=7.2663&q=" + encodeURIComponent(q);
      var res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      var data = await res.json();
      var feat = data && data.features && data.features[0];
      var coords = feat && feat.geometry && feat.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      var lng = coords[0];
      var lat = coords[1];
      if (!inNiceArea(lat, lng)) return;
      p.lng = lng;
      p.lat = lat;
      p.geoQ = ad;
      persist(false);
      if (!$("modal-map").hidden) drawTourneeMap();
    } catch (e) {}
  }

  function drawTourneeMap() {
    var el = $("tournee-map");
    if (!el || typeof L === "undefined") return;
    var pts = [];
    var miss = 0;
    (state.patients || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (isPatientGone(p)) return;
      if (!isPatientActif(p)) return;
      var ad = normAddr(p.adresse);
      if (!ad) return;
      if (typeof p.lat === "number" && typeof p.lng === "number" && inNiceArea(p.lat, p.lng)) {
        pts.push({ p: p, lat: p.lat, lng: p.lng, ad: ad });
      } else if (ad) miss++;
    });
    var hint = $("map-miss");
    if (hint) {
      hint.hidden = miss === 0;
      hint.textContent = miss ? (miss + " adresse" + (miss > 1 ? "s" : "") + " pas encore placée" + (miss > 1 ? "s" : "") + ". Vérifiez l’orthographe, ou patientez.") : "";
    }
    if (tourneeMap) {
      tourneeMap.remove();
      tourneeMap = null;
    }
    tourneeMap = L.map(el, {
      zoomControl: true,
      minZoom: 12,
      maxZoom: 18,
      maxBounds: [[43.58, 7.12], [43.82, 7.42]],
      maxBoundsViscosity: 0.85
    }).setView([43.7034, 7.2663], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18
    }).addTo(tourneeMap);
    var bounds = [];
    pts.forEach(function (it) {
      var mk = L.circleMarker([it.lat, it.lng], {
        radius: 9,
        color: "#1f5a55",
        weight: 2,
        fillColor: isFaitToday(it.p.id) ? "#8a9c9a" : "#2c7a73",
        fillOpacity: 0.95
      }).addTo(tourneeMap);
      var href = mapsHref(it.ad);
      mk.bindPopup(
        "<strong>" + escapeHtml(displayName(it.p)) + "</strong><br>" +
        escapeHtml(it.ad) + "<br>" +
        '<a href="' + href + '">Itinéraire</a>'
      );
      bounds.push([it.lat, it.lng]);
    });
    if (bounds.length > 1) tourneeMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, minZoom: 12 });
    else if (bounds.length === 1) tourneeMap.setView(bounds[0], 16);
    else tourneeMap.setView([43.7034, 7.2663], 13);
    setTimeout(function () { if (tourneeMap) tourneeMap.invalidateSize(); }, 200);
  }

  function openTourneeMap() {
    $("modal-map").hidden = false;
    queueMissingGeocodes();
    setTimeout(drawTourneeMap, 80);
  }

  function closeTourneeMap() {
    $("modal-map").hidden = true;
    if (tourneeMap) {
      tourneeMap.remove();
      tourneeMap = null;
    }
  }

  function telHref(tel) {
    return "tel:" + String(tel).replace(/[^\d+]/g, "");
  }

  function render() {
    renderOnbCard();
    if (carOn) renderCar();
    renderCarChip();
    syncRecLocal();
    renderRecBanner();
    renderOrdoBanner();
    applyAccessGate();
    refreshOfflineBanner();
    syncTourUi();
    syncScope();
    renderMenuSecuStatus();
    if (isKicked()) {
      fillDayStrip();
      return;
    }
    fillDayStrip();
    var list = visiblePatients();
    var dayIso = selectedDayISO();
    var all = state.patients.filter(function (p) {
      if (isPatientGone(p)) return false;
      if (!isPatientActif(p)) return false;
      if (listMode !== "today") return true;
      return visitsOnISO(p, dayIso) && patientOnSlot(p);
    });
    var doneN = all.filter(function (p) { return isFaitOnDay(p.id, dayIso); }).length;
    if (currentTab === "transmissions") {
      $("app-title").textContent = "Transmissions";
      $("counter").classList.remove("counter-plan", "counter-hist");
      $("counter").textContent = "Historique";
      $("counter").hidden = false;
      updateDayCountBadge("today", 0, 0);
    } else if (currentTab === "planning") {
      $("app-title").textContent = "Planning";
      $("counter").textContent = monthLabel(planYear, planMonth);
      $("counter").hidden = false;
      renderPlanning();
    } else if (currentTab === "messages") {
      $("app-title").textContent = "Messages";
      $("counter").textContent = localDisplayName() || "Cabinet";
      $("counter").hidden = false;
      renderMessages();
      markMessagesSeen();
    } else {
      $("app-title").textContent = "Vydel";
      $("counter").hidden = false;
      var kind = viewDayKind();
      var ctr = $("counter");
      ctr.classList.remove("counter-plan", "counter-hist");
      if (kind === "future") {
        // Compteur déjà dans day-view-hint (« Planning · X prévus ») — pas de doublon sous le titre
        ctr.textContent = "";
        ctr.hidden = true;
      } else if (kind === "past") {
        ctr.hidden = false;
        ctr.textContent = doneN + " / " + all.length + " faits";
        ctr.classList.add("counter-hist");
      } else {
        ctr.hidden = false;
        ctr.textContent = doneN + " / " + all.length + " faits";
      }
      if (listMode === "today") updateDayCountBadge(kind, all.length, doneN);
      else updateDayCountBadge("today", 0, 0);
    }
    refreshTopbarCount();

    renderTxResume();
    renderPresence();

    var root = $("list");
    root.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      var q = ($("search").value || "").trim();
      var livingActifs = state.patients.filter(function (p) {
        return !isPatientGone(p) && isPatientActif(p);
      });
      if (q) empty.textContent = "Aucun résultat.";
      else if (listMode === "inactifs") empty.textContent = "Aucun patient inactif.";
      else if (listMode === "today" && livingActifs.length) empty.textContent = "Aucun passage le " + JOUR_NAMES[parseISODate(selectedDayISO()).getDay()].toLowerCase() + ". Touchez Tous pour voir tout le cabinet.";
      else empty.textContent = "Aucun patient. Ajoutez le premier passage.";
      root.appendChild(empty);
      return;
    }
    var qq = ($("search").value || "").trim();
    var entries = qq ? searchEntries(list)
      : (listMode === "today" ? dayEntries(list) : list.map(function (p0) { return { p: p0, half: "", cr: null }; }));
    var showHeads = !qq && listMode === "today" && entries.length > 0;
    root.classList.toggle("list-today", !qq && listMode === "today");
    var lastHalf = "";
    entries.forEach(function (en) {
      var p = en.p;
      if (showHeads && en.half !== lastHalf) {
        var hh = document.createElement("h3");
        hh.className = "list-half";
        hh.textContent = CRENEAU_RANGES[en.half].label;
        root.appendChild(hh);
      }
      lastHalf = en.half;
      var fait = isFaitOnDay(p.id, dayIso);
      var card = document.createElement("article");
      var alerteJour = alerteOn(p, dayIso);
      card.className = "card" + (fait ? " done" : "") + (alerteJour ? " has-alerte" : "") + (ordoVeille(p) ? " has-ordo-veille" : "");
      var main = document.createElement("div");
      main.className = "card-main";
      var name = document.createElement("p");
      name.className = "card-name";
      name.textContent = displayName(p);
      if (alerteJour) {
        var dot = document.createElement("span");
        dot.className = "al-dot";
        dot.setAttribute("aria-label", "Alerte");
        dot.textContent = "!";
        name.insertBefore(dot, name.firstChild);
      }
      if (p.example) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Exemple";
        name.appendChild(badge);
      }
      if (p.actif === false) {
        var bIn = document.createElement("span");
        bIn.className = "badge badge-inactif";
        bIn.textContent = "Inactif";
        name.appendChild(bIn);
      }
      if (en.cr || (!qq && listMode === "today")) {
        var pill = document.createElement("span");
        pill.className = "cr-pill" + (en.cr ? "" : " cr-pill-none") + (en.cr && en.cr.imp ? " cr-pill-imp" : "");
        pill.textContent = en.cr ? crLabel(en.cr) + (en.cr.imp ? " 🔒" : "") : CRENEAU_RANGES[en.half || "am"].label;
        if (en.cr && en.cr.imp) pill.title = "Impératif";
        name.appendChild(pill);
      }
      main.appendChild(name);
      if (alerteJour) {
        var alt = document.createElement("p");
        alt.className = "card-alerte";
        var altTxt = document.createElement("span");
        altTxt.className = "card-alerte-txt";
        altTxt.textContent = p.alerte.t;
        alt.appendChild(altTxt);
        var altDel = document.createElement("button");
        altDel.type = "button";
        altDel.className = "card-alerte-del";
        altDel.textContent = "Retirer l’alerte";
        altDel.addEventListener("click", function (e) {
          e.stopPropagation();
          askRetirerAlerte(p.id);
        });
        alt.appendChild(altDel);
        main.appendChild(alt);
      }
      var jl = joursLabel(p);
      if (jl) {
        var jd = document.createElement("p");
        jd.className = "card-jours";
        jd.textContent = jl;
        main.appendChild(jd);
      }
      if (p.tel) {
        var a = document.createElement("a");
        a.className = "card-line tel";
        a.href = telHref(p.tel);
        a.textContent = p.tel;
        main.appendChild(a);
      }
      (p.famille || []).forEach(function (f) {
        if (!f || !f.tel) return;
        var fa = document.createElement("a");
        fa.className = "card-line fam tel";
        fa.href = telHref(f.tel);
        fa.textContent = (f.label ? f.label + " · " : "Famille · ") + f.tel;
        main.appendChild(fa);
      });
      if (p.medecin || p.medecinTel) {
        var mdName = (p.medecin || "").trim();
        var mdTel = (p.medecinTel || "").trim();
        if (mdTel) {
          var md = document.createElement("a");
          md.className = "card-line fam tel";
          md.href = telHref(mdTel);
          md.textContent = (mdName || "Médecin") + " · " + mdTel;
          main.appendChild(md);
        } else {
          var mdn = document.createElement("p");
          mdn.className = "card-line";
          mdn.textContent = mdName;
          main.appendChild(mdn);
        }
      }
      if (p.adresse) {
        var m = document.createElement("a");
        m.className = "card-line addr";
        m.href = mapsHref(p.adresse);
        m.textContent = p.adresse;
        main.appendChild(m);
      }
      if (p.remarques) {
        var r = document.createElement("p");
        r.className = "card-remarques";
        r.textContent = p.remarques;
        main.appendChild(r);
      }
      ordoMetas(p).forEach(function (ordo) {
        var oc = document.createElement("p");
        oc.className = "ordo-chip" + (ordo.cls ? " " + ordo.cls : "");
        oc.textContent = ordo.text;
        main.appendChild(oc);
      });
      if (patientHasVocalToday(p.id, dayIso)) {
        var vc = document.createElement("p");
        vc.className = "ordo-chip";
        vc.textContent = "Vocal";
        main.appendChild(vc);
      }
      main.addEventListener("click", function (e) {
        if (e.target.closest("a, button")) return;
        openPatient(p.id);
      });
      var cb = document.createElement("button");
      cb.type = "button";
      var readonlyFait = !isViewingToday();
      cb.className = "fait" + (fait ? " on" : "") + (readonlyFait ? " readonly" : "");
      cb.setAttribute("aria-pressed", fait ? "true" : "false");
      if (readonlyFait) cb.setAttribute("aria-disabled", "true");
      var mark = '<span class="mark">' + (fait ? "✓" : "○") + "</span>Fait";
      var byName = fait ? faitByOnDay(p.id, dayIso) : "";
      if (byName) mark += '<span class="fait-by">' + escapeHtml(byName) + "</span>";
      else if (readonlyFait && viewDayKind() === "future") mark = '<span class="mark">○</span>Prévu';
      cb.innerHTML = mark;
      cb.addEventListener("click", function () { toggleFait(p.id); });
      var actions = document.createElement("div");
      actions.className = "card-actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "card-edit";
      edit.textContent = "Modifier";
      edit.addEventListener("click", function (e) {
        e.stopPropagation();
        openPatient(p.id);
      });
      var rapide = document.createElement("button");
      rapide.type = "button";
      rapide.className = "card-tx-rapide";
      rapide.textContent = "Trans. rapide";
      rapide.addEventListener("click", function (e) {
        e.stopPropagation();
        openTxRapide(p.id);
      });
      actions.appendChild(edit);
      actions.appendChild(rapide);
      card.appendChild(main);
      card.appendChild(cb);
      card.appendChild(actions);
      root.appendChild(card);
    });
    $("menu-blob").textContent = (meta && meta.blobId) ? meta.blobId : "Pas encore attribué";
    $("menu-share").textContent = (meta && meta.shareOk)
      ? (secu ? "🔒 Cabinet sécurisé · données chiffrées sur le téléphone" : "Partage actif. Les autres téléphones rejoignent avec le même PIN.")
      : ("Partage indisponible, données sur ce téléphone" + (meta && meta.shareErr ? " (" + meta.shareErr + ")" : ""));
    $("btn-retry-share").hidden = !!(meta && meta.shareOk && meta.blobId);
    updateMsgBadge();
    if (openScrollUntil && Date.now() < openScrollUntil && Date.now() >= userListUntil) {
      scheduleScrollToFirstPending(true);
    }
  }

  $("search").addEventListener("input", function () {
    render();
    if (!(($("search").value || "").trim())) armOpenScroll(800);
  });
  function syncScope() {
    if ($("scope-today-label")) $("scope-today-label").textContent = JOUR_NAMES[parseISODate(selectedDayISO()).getDay()];
    ["today", "all", "inactifs"].forEach(function (m) {
      var b = $("btn-scope-" + m);
      if (!b) return;
      var on = listMode === m;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".scope-btn"), function (btn) {
    btn.addEventListener("click", function () {
      listMode = btn.getAttribute("data-mode") || "today";
      syncScope();
      render();
    });
  });
  if ($("btn-day-prev")) $("btn-day-prev").addEventListener("click", function () { shiftViewDay(-1); });
  if ($("btn-day-next")) $("btn-day-next").addEventListener("click", function () { shiftViewDay(1); });
  if ($("btn-day-prev-top")) $("btn-day-prev-top").addEventListener("click", function () { shiftViewDay(-1); });
  if ($("btn-day-next-top")) $("btn-day-next-top").addEventListener("click", function () { shiftViewDay(1); });

  function rememberFait(id, done) {
    if (!state.history) state.history = {};
    var day = todayISO();
    var p = patientById(id);
    var name = p ? displayName(p) : "Patient";
    if (!state.history[day]) state.history[day] = { updatedAt: 0, fait: {} };
    if (!state.history[day].fait) state.history[day].fait = {};
    var rec = {
      name: name,
      t: Date.now(),
      done: !!done
    };
    var by = localDisplayName();
    if (by) rec.by = String(by).slice(0, 24);
    state.history[day].fait[id] = rec;
    state.history[day].updatedAt = Date.now();
  }

  function restoreMorningFaits() {
    if (!state) return 0;
    if (!state.done) state.done = {};
    if (!state.history) state.history = {};
    var day = todayISO();
    var now = Date.now();
    var n = 0;
    var hist = (state.history[day] && state.history[day].fait) || {};
    Object.keys(hist).forEach(function (id) {
      var h = hist[id];
      if (!h || !h.done) return;
      var rec = state.done[id];
      if (rec && rec.d === day) return;
      state.done[id] = { d: day, t: now };
      n++;
    });
    var byT = {};
    Object.keys(state.done).forEach(function (id) {
      var rec = state.done[id];
      if (!rec || rec.d !== null) return;
      var t = String(rec.t || 0);
      if (!byT[t]) byT[t] = [];
      byT[t].push(id);
    });
    Object.keys(byT).forEach(function (t) {
      var ids = byT[t];
      if (ids.length < 2) return;
      ids.forEach(function (id) {
        if (state.done[id] && state.done[id].d === day) return;
        state.done[id] = { d: day, t: now };
        rememberFait(id, true);
        n++;
      });
    });
    if (n) lastFait = faitTodayIds();
    return n;
  }

  function refreshPlanFaitIfOpen(iso) {
    if (!$("modal-planning") || $("modal-planning").hidden) return;
    if (!planEditingIso || planEditingIso !== iso) return;
    fillPlanFaitList(planEditingIso);
  }

  function toggleFait(id) {
    if (!isViewingToday()) {
      toast(viewDayKind() === "future" ? "Planning : cochez les Fait le jour J." : "Historique en lecture seule.");
      return;
    }
    var day = todayISO();
    var rec = state.done[id];
    if (rec && rec.d === day) {
      state.done[id] = { d: null, t: Date.now() };
      rememberFait(id, false);
    } else {
      state.done[id] = { d: day, t: Date.now() };
      rememberFait(id, true);
    }
    lastFait = faitTodayIds();
    render();
    persist(false);
    syncWatchToIdb();
    refreshPlanFaitIfOpen(day);
    armOpenScroll(1200);
  }

  /* Défiler jusqu’au premier patient pas encore fait. L’ordre de la liste ne change pas. */
  var userListUntil = 0;
  var autoScrolling = false;
  var autoScrollTimer = null;
  var openScrollUntil = 0;
  function armOpenScroll(ms) {
    openScrollUntil = Date.now() + (ms || 2500);
    scheduleScrollToFirstPending(true);
  }
  function markUserListScroll() {
    if (autoScrolling) return;
    userListUntil = Date.now() + 1200;
  }
  window.addEventListener("wheel", markUserListScroll, { passive: true });
  window.addEventListener("touchmove", markUserListScroll, { passive: true });
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End") markUserListScroll();
  });
  function scheduleScrollToFirstPending(force) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { scrollToFirstPending(force); });
    });
  }
  function scrollToFirstPending(force) {
    if (!unlocked) return;
    if (currentTab !== "tournee") return;
    if (carOn) return;
    if (listMode !== "today") return;
    if (!isViewingToday()) return;
    if (($("search") && $("search").value || "").trim()) return;
    if (!force && Date.now() < userListUntil) return;
    var root = $("list");
    if (!root) return;
    var cards = root.querySelectorAll(".card");
    if (!cards.length) return;
    var done = 0, pending = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].classList.contains("done")) done++;
      else if (!pending) pending = cards[i];
    }
    if (!done) return;
    var head = document.querySelector(".app-head");
    var margin = Math.round((head ? head.getBoundingClientRect().height : 0) + 8);
    document.documentElement.style.setProperty("--list-scroll-margin", margin + "px");
    var target = pending || cards[0];
    if (pending) {
      var prev = pending.previousElementSibling;
      if (prev && prev.classList.contains("list-half")) target = prev;
    } else {
      var first = root.querySelector(".list-half, .card");
      if (first) target = first;
    }
    var top = target.getBoundingClientRect().top;
    if (Math.abs(top - margin) < 12) return;
    autoScrolling = true;
    target.style.scrollMarginTop = margin + "px";
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (autoScrollTimer) clearTimeout(autoScrollTimer);
    autoScrollTimer = setTimeout(function () {
      autoScrolling = false;
      setBarsHidden(false);
    }, 750);
  }

  /* —— Mode voiture (1.91) : déclenchement manuel, écran simplifié, écran maintenu allumé si possible. —— */
  var carOn = false;
  var carSkip = {};
  var carLock = null;
  var carDay = "";

  function carQueue() {
    var iso = todayISO();
    var list = state.patients.filter(function (p) {
      return !isPatientGone(p) && isPatientActif(p) && visitsOnISO(p, iso) && patientOnSlot(p);
    });
    var seen = {};
    return dayEntries(list).filter(function (en) {
      if (seen[en.p.id]) return false;
      seen[en.p.id] = 1;
      return !isFaitOnDay(en.p.id, iso) && !carSkip[en.p.id];
    });
  }
  async function carWakeOn() {
    if (!carOn) return;
    if (!("wakeLock" in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) {
      carWakeHint("L’écran peut se mettre en veille : ce navigateur ne permet pas de le garder allumé.");
      return;
    }
    if (carLock && !carLock.released) return;
    try {
      carLock = await navigator.wakeLock.request("screen");
      carLock.addEventListener("release", function () { carLock = null; carWakeHint(""); });
      carWakeHint("Écran maintenu allumé");
    } catch (e) {
      carLock = null;
      carWakeHint("L’écran peut se mettre en veille (batterie faible ou refus du téléphone).");
    }
  }
  function carWakeOff() {
    var l = carLock;
    carLock = null;
    if (l && !l.released) { try { l.release(); } catch (e) {} }
  }
  function carWakeHint(t) {
    if ($("car-wake")) { $("car-wake").textContent = t; $("car-wake").hidden = !t; }
  }
  document.addEventListener("visibilitychange", function () {
    if (carOn && document.visibilityState === "visible") carWakeOn();
  });
  function carFill(prefix, en) {
    var box = $(prefix);
    if (!box) return;
    box.hidden = !en;
    if (!en) return;
    var p = en.p;
    $(prefix + "-name").textContent = displayName(p);
    $(prefix + "-cr").textContent = en.cr ? crLabel(en.cr) + (en.cr.imp ? " · impératif" : "") : CRENEAU_RANGES[en.half].label;
    var al = $(prefix + "-alerte");
    if (al) { al.hidden = !alerteToday(p); al.textContent = alerteToday(p) ? p.alerte.t : ""; }
    var ad = $(prefix + "-adr");
    if (ad) ad.textContent = normAddr(p.adresse) || "Adresse manquante";
  }
  /* 1.98 : file vide + autre jour affiché → le mode voiture rappelle qu’il suit aujourd’hui (carQueue reste sur todayISO()). */
  var CAR_EMPTY_TODAY = "Tournée terminée pour aujourd’hui";
  var CAR_EMPTY_OTHER_DAY = "Le mode voiture suit la tournée d'aujourd'hui";
  function carEmptyText(emoji) {
    if (!isViewingToday()) return CAR_EMPTY_OTHER_DAY;
    return CAR_EMPTY_TODAY + (emoji ? " 🎉" : "");
  }

  function renderCar() {
    if (!carOn) return;
    if (carDay !== todayISO()) { carDay = todayISO(); carSkip = {}; }
    var q = carQueue();
    var cur = q[0] || null, nxt = q[1] || null;
    carFill("car-cur", cur);
    carFill("car-next", nxt);
    $("car-empty").hidden = !!cur;
    if (!cur) $("car-empty").textContent = carEmptyText(true);
    var go = $("btn-car-go");
    var dest = cur ? destForPatient(cur.p) : null;
    go.hidden = !cur;
    go.disabled = !dest;
    go.textContent = dest ? "➤ Y aller" : "Adresse manquante";
    $("btn-car-call").hidden = !(cur && cur.p.tel);
    $("btn-car-done").hidden = !cur;
    $("btn-car-skip").hidden = !cur;
    $("car-left").textContent = q.length ? q.length + " restant" + (q.length > 1 ? "s" : "") : "";
  }
  function openCarMode() {
    if (!unlocked) return;
    carOn = true;
    carDay = todayISO();
    carSkip = {};
    $("car-mode").hidden = false;
    document.body.classList.add("car-on");
    renderCar();
    carWakeOn();
  }
  function closeCarMode() {
    carOn = false;
    carWakeOff();
    carWakeHint("");
    if ($("car-mode")) $("car-mode").hidden = true;
    document.body.classList.remove("car-on");
    armOpenScroll(1200);
  }
  function carCurrent() {
    var q = carQueue();
    return q[0] ? q[0].p : null;
  }
  if ($("btn-car")) $("btn-car").addEventListener("click", openCarMode);
  if ($("btn-car-exit")) $("btn-car-exit").addEventListener("click", closeCarMode);
  if ($("btn-car-go")) $("btn-car-go").addEventListener("click", function () {
    var p = carCurrent();
    if (p) openNavSheet(destForPatient(p));
  });
  if ($("btn-car-call")) $("btn-car-call").addEventListener("click", function () {
    var p = carCurrent();
    if (p && p.tel) location.href = "tel:" + String(p.tel).replace(/[^\d+]/g, "");
  });
  if ($("btn-car-done")) $("btn-car-done").addEventListener("click", function () {
    var p = carCurrent();
    if (!p) return;
    var day = todayISO();
    state.done[p.id] = { d: day, t: Date.now() };
    rememberFait(p.id, true);
    lastFait = faitTodayIds();
    render();
    persist(false);
    syncWatchToIdb();
    toast(displayName(p) + " : fait");
  });
  if ($("btn-car-skip")) $("btn-car-skip").addEventListener("click", function () {
    var p = carCurrent();
    if (!p) return;
    carSkip[p.id] = 1;
    renderCar();
  });

  /* Aperçu mode voiture repliable. État mémorisé dans tournee.carPanelOpen. */
  var LS_CAR_PANEL = "tournee.carPanelOpen";
  function carPanelWanted() {
    try { return localStorage.getItem(LS_CAR_PANEL) === "1"; } catch (e) { return false; }
  }
  function setCarPanel(open, persist) {
    var chip = $("car-chip"), panel = $("car-chip-panel"), tog = $("btn-car-chip-toggle");
    if (panel) panel.hidden = !open;
    if (chip) chip.classList.toggle("is-open", !!open);
    if (tog) tog.setAttribute("aria-expanded", open ? "true" : "false");
    if (persist !== false) {
      try { localStorage.setItem(LS_CAR_PANEL, open ? "1" : "0"); } catch (e) {}
    }
    if (open) renderCarChip();
  }
  function renderCarChip() {
    var panel = $("car-chip-panel");
    if (!panel || panel.hidden) return;
    var q = carQueue();
    var cur = q[0] || null, nxt = q[1] || null;
    if ($("car-chip-cur")) $("car-chip-cur").hidden = !cur;
    if ($("car-chip-next")) $("car-chip-next").hidden = !nxt;
    if ($("car-chip-empty")) {
      $("car-chip-empty").hidden = !!cur;
      if (!cur) $("car-chip-empty").textContent = carEmptyText(false);
    }
    if (cur) {
      if ($("car-chip-cur-name")) $("car-chip-cur-name").textContent = displayName(cur.p);
      if ($("car-chip-cur-cr")) $("car-chip-cur-cr").textContent = cur.cr ? crLabel(cur.cr) + (cur.cr.imp ? " · impératif" : "") : "";
      var al = $("car-chip-cur-alerte");
      if (al) { al.hidden = !alerteToday(cur.p); al.textContent = alerteToday(cur.p) ? cur.p.alerte.t : ""; }
    }
    if (nxt) {
      if ($("car-chip-next-name")) $("car-chip-next-name").textContent = displayName(nxt.p);
      if ($("car-chip-next-cr")) $("car-chip-next-cr").textContent = nxt.cr ? crLabel(nxt.cr) : "";
    }
    var go = $("btn-car-chip-go");
    if (go) {
      var dest = cur ? destForPatient(cur.p) : null;
      go.hidden = !cur;
      go.disabled = !dest;
    }
  }
  function initCarChip() {
    setCarPanel(carPanelWanted(), false);
    if ($("btn-car-chip-toggle")) $("btn-car-chip-toggle").addEventListener("click", function (e) {
      e.stopPropagation();
      var panel = $("car-chip-panel");
      setCarPanel(panel && panel.hidden);
    });
    if ($("btn-car-chip-go")) $("btn-car-chip-go").addEventListener("click", function () {
      var p = carCurrent();
      if (p) openNavSheet(destForPatient(p));
    });
    var chip = $("car-chip");
    if (!chip) return;
    var y0 = null;
    chip.addEventListener("touchstart", function (e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      y0 = e.changedTouches[0].clientY;
    }, { passive: true });
    chip.addEventListener("touchend", function (e) {
      if (y0 == null || !e.changedTouches || !e.changedTouches[0]) return;
      var dy = e.changedTouches[0].clientY - y0;
      y0 = null;
      if (dy > 36) setCarPanel(true);
      else if (dy < -36) setCarPanel(false);
    }, { passive: true });
  }
  initCarChip();


  function collectFamille() {
    var wrap = $("f-famille");
    if (!wrap) return [];
    var rows = wrap.querySelectorAll(".fam-row");
    var out = [];
    for (var i = 0; i < rows.length && out.length < MAX_FAMILLE; i++) {
      var lab = (rows[i].querySelector(".fam-label").value || "").trim();
      var tel = (rows[i].querySelector(".fam-tel").value || "").trim();
      if (!tel) continue;
      out.push({ label: lab, tel: tel });
    }
    return out;
  }

  function addFamilleRow(item) {
    var wrap = $("f-famille");
    if (!wrap) return;
    if (wrap.querySelectorAll(".fam-row").length >= MAX_FAMILLE) return;
    item = item || { label: "", tel: "" };
    var row = document.createElement("div");
    row.className = "fam-row";
    var lab = document.createElement("input");
    lab.className = "fam-label";
    lab.maxLength = 40;
    lab.placeholder = "Fille, fils, voisin…";
    lab.value = item.label || "";
    var tel = document.createElement("input");
    tel.className = "fam-tel";
    tel.type = "tel";
    tel.inputMode = "tel";
    tel.maxLength = 24;
    tel.placeholder = "06 …";
    tel.value = item.tel || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "fam-rm";
    rm.setAttribute("aria-label", "Retirer");
    rm.textContent = "×";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(lab);
    row.appendChild(tel);
    row.appendChild(rm);
    wrap.appendChild(row);
  }

  function fillFamille(list) {
    var wrap = $("f-famille");
    if (!wrap) return;
    wrap.innerHTML = "";
    var rows = (list && list.length) ? list.slice(0, MAX_FAMILLE) : [{ label: "", tel: "" }];
    rows.forEach(function (it) { addFamilleRow(it); });
  }


  function patientFormOpen() {
    var m = $("modal-patient");
    return !!(m && !m.hidden);
  }

  function snapshotPatientDraft() {
    if (fillingFiche || !patientFormOpen()) return;
    patientDraft = {
      editingId: editingId,
      prenom: $("f-prenom").value,
      nom: $("f-nom").value,
      tel: $("f-tel").value,
      medecin: $("f-medecin") ? $("f-medecin").value : "",
      medecinTel: $("f-medecin-tel") ? $("f-medecin-tel").value : "",
      adresse: $("f-adresse").value,
      remarques: $("f-remarques").value,
      tx: $("f-tx") ? $("f-tx").value : "",
      famille: collectFamille(),
      jours: collectJours(),
      ordo: $("f-ordo") ? $("f-ordo").value : "",
      ordo2: $("f-ordo2") ? $("f-ordo2").value : "",
      creneaux: { am: crForm.am, pm: crForm.pm },
      alerte: $("f-alerte") ? $("f-alerte").value : "",
      alerteJour: $("f-alerte-jour") ? $("f-alerte-jour").value : "",
      tab: ficheTab
    };
    saveDraftSealed();
  }

  var draftSeq = 0;
  /* Brouillon : jamais en clair, chiffré avec la clé du cabinet (perdu si on ne déverrouille pas). */
  function saveDraftSealed() {
    var k = key;
    var d = patientDraft;
    if (!k || !d) return;
    var seq = ++draftSeq;
    encV2(d, k).then(function (env) {
      if (seq !== draftSeq) return;
      /* 1.91 : stockage persistant (survit à la fermeture), toujours chiffré avec la clé du cabinet. */
      try { localStorage.setItem("tournee.draft", JSON.stringify(env)); } catch (e) {}
      try { sessionStorage.removeItem("tournee.draft"); } catch (e1) {}
    }).catch(function () {});
  }

  function restorePatientDraft() {
    var d = patientDraft;
    if (d) { fillPatientDraft(d); return; }
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem("tournee.draft") || sessionStorage.getItem("tournee.draft") || "null"); } catch (e2) { raw = null; }
    if (!raw) return;
    if (raw.ct && raw.iv) {
      var k = key;
      if (!k) return;
      decryptEnvelope(raw, k).then(function (dd) {
        if (dd && unlocked && !patientDraft) { patientDraft = dd; fillPatientDraft(dd); }
      }).catch(function () {
        try { sessionStorage.removeItem("tournee.draft"); localStorage.removeItem("tournee.draft"); } catch (e3) {}
      });
      return;
    }
    /* Ancien brouillon en clair (1.90) : repris une fois puis réécrit chiffré. */
    patientDraft = raw;
    fillPatientDraft(raw);
    saveDraftSealed();
  }

  function fillPatientDraft(d) {
    if (!d) return;
    patientDraft = d;
    openPatient(d.editingId || null);
    fillingFiche = true;
    $("f-prenom").value = d.prenom || "";
    $("f-nom").value = d.nom || "";
    $("f-tel").value = d.tel || "";
    if ($("f-medecin")) $("f-medecin").value = d.medecin || "";
    if ($("f-medecin-tel")) $("f-medecin-tel").value = d.medecinTel || "";
    $("f-adresse").value = d.adresse || "";
    $("f-remarques").value = d.remarques || "";
    if ($("f-tx")) $("f-tx").value = d.tx || "";
    fillFamille(d.famille && d.famille.length ? d.famille : []);
    fillJours(d.jours || []);
    if ($("f-ordo") && d.ordo != null) $("f-ordo").value = d.ordo;
    if ($("f-ordo2") && d.ordo2 != null) $("f-ordo2").value = d.ordo2;
    if (d.creneaux) { crForm = { am: validCr(d.creneaux.am), pm: validCr(d.creneaux.pm) }; paintCreneauForm(); }
    if ($("f-alerte") && d.alerte != null) $("f-alerte").value = d.alerte;
    if ($("f-alerte-jour") && d.alerteJour != null) $("f-alerte-jour").value = d.alerteJour;
    if (d.tab) setFicheTab(d.tab, false);
    syncFicheDots();
    fillingFiche = false;
  }

  function clearPatientDraft() {
    patientDraft = null;
    draftSeq++;
    try { sessionStorage.removeItem("tournee.draft"); } catch (e) {}
    try { localStorage.removeItem("tournee.draft"); } catch (e2) {}
  }

  $("btn-add").addEventListener("click", function () { openPatient(null); });
  $("btn-add-famille").addEventListener("click", function () { addFamilleRow(null); });

  $("modal-patient").addEventListener("input", function () { snapshotPatientDraft(); });


  /* —— Créneaux de passage (1.91) ——
     Plages par pas de 15 min : faciles à changer ici. */
  var CRENEAU_STEP = 15;
  var CRENEAU_RANGES = {
    am: { from: "06:00", to: "13:00", label: "Matin", def: "08:00" },
    pm: { from: "13:00", to: "21:00", label: "Après-midi", def: "17:00" }
  };
  var CRENEAU_CUSTOM = { from: "06:00", to: "21:00" };
  var crForm = { am: null, pm: null };
  var crHalf = "am";

  function hmToMin(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  }
  function minToHm(n) {
    return ("0" + Math.floor(n / 60)).slice(-2) + ":" + ("0" + (n % 60)).slice(-2);
  }
  function hmLabel(s) {
    var n = hmToMin(s);
    return Math.floor(n / 60) + "h" + ("0" + (n % 60)).slice(-2);
  }
  function validCr(c) {
    if (!c) return null;
    var a = hmToMin(c.s), b = hmToMin(c.e);
    if (a < hmToMin(CRENEAU_CUSTOM.from) || b > hmToMin(CRENEAU_CUSTOM.to) || b <= a || a % CRENEAU_STEP || b % CRENEAU_STEP) return null;
    return { s: minToHm(a), e: minToHm(b), imp: !!c.imp };
  }
  function crLabel(c) {
    return c ? hmLabel(c.s) + "-" + hmLabel(c.e) : "";
  }
  function halfOfStart(s) {
    return hmToMin(s) < hmToMin(CRENEAU_RANGES.pm.from) ? "am" : "pm";
  }
  function patientCr(p, half) {
    return validCr(p && p.creneaux && p.creneaux[half]);
  }
  /* Demi-journées où le patient apparaît (sans créneau : fin de sa demi-journée). */
  function patientHalves(p) {
    var out;
    if (splitToursOn()) {
      var s = (p && p.tourSlot) || "both";
      out = s === "am" ? ["am"] : s === "pm" ? ["pm"] : ["am", "pm"];
      if (tourSlot === "am" || tourSlot === "pm") out = out.filter(function (h) { return h === tourSlot; });
    } else {
      out = [];
      if (patientCr(p, "am")) out.push("am");
      if (patientCr(p, "pm")) out.push("pm");
      if (!out.length) out = ["am"];
    }
    return out;
  }
  function crSortKey(c) {
    return c ? hmToMin(c.s) * 2000 + hmToMin(c.e) : 1e9;
  }
  /* Liste du jour → entrées triées par demi-journée puis créneau croissant ; sans heure en fin de demi-journée. */
  function dayEntries(list) {
    var out = [];
    list.forEach(function (p) {
      patientHalves(p).forEach(function (h) { out.push({ p: p, half: h, cr: patientCr(p, h) }); });
    });
    out.sort(function (a, b) {
      if (a.half !== b.half) return a.half === "am" ? -1 : 1;
      var ka = crSortKey(a.cr), kb = crSortKey(b.cr);
      if (ka !== kb) return ka - kb;
      return displayName(a.p).localeCompare(displayName(b.p), "fr");
    });
    return out;
  }
  /* Recherche : par créneau si le patient en a un (le plus tôt), sinon alphabétique. */
  function searchEntries(list) {
    var out = list.map(function (p) {
      var cs = [patientCr(p, "am"), patientCr(p, "pm")].filter(Boolean);
      cs.sort(function (a, b) { return crSortKey(a) - crSortKey(b); });
      return { p: p, half: cs[0] ? halfOfStart(cs[0].s) : "", cr: cs[0] || null };
    });
    out.sort(function (a, b) {
      var ka = crSortKey(a.cr), kb = crSortKey(b.cr);
      if (ka !== kb) return ka - kb;
      return displayName(a.p).localeCompare(displayName(b.p), "fr");
    });
    return out;
  }

  /* Fiche patient : section « Créneau de passage ». */
  function fillCreneauForm(p) {
    crForm = { am: patientCr(p, "am"), pm: patientCr(p, "pm") };
    crHalf = (!crForm.am && crForm.pm) || (p && p.tourSlot === "pm") ? "pm" : "am";
    if ($("cr-custom")) $("cr-custom").hidden = true;
    paintCreneauForm();
  }
  function crStepOptions(from, to, endSide) {
    var out = [];
    for (var n = hmToMin(from) + (endSide ? CRENEAU_STEP : 0); n <= hmToMin(to) - (endSide ? 0 : CRENEAU_STEP); n += CRENEAU_STEP) out.push(minToHm(n));
    return out;
  }
  function paintCreneauForm() {
    var box = $("cr-box");
    if (!box) return;
    ["am", "pm"].forEach(function (h) {
      var b = $("cr-tab-" + h);
      if (!b) return;
      b.classList.toggle("on", crHalf === h);
      b.setAttribute("aria-pressed", crHalf === h ? "true" : "false");
      var sub = b.querySelector("small");
      if (sub) sub.textContent = crForm[h] ? crLabel(crForm[h]) + (crForm[h].imp ? " 🔒" : "") : "Sans heure";
    });
    var c = crForm[crHalf];
    var R = CRENEAU_RANGES[crHalf];
    $("cr-value").textContent = c ? crLabel(c) : "Sans heure précise";
    $("cr-range").textContent = hmLabel(R.from) + " à " + hmLabel(R.to) + " · pas de 15 min";
    $("cr-none").classList.toggle("on", !c);
    $("cr-none").textContent = "Sans heure précise · " + R.label;
    var il = $("cr-imp-line");
    if (il) {
      il.innerHTML = "";
      var t = document.createElement("span");
      t.textContent = c ? (c.imp ? "🔒 Impératif : oui" : "Impératif : non") : "Impératif : choisissez d’abord un créneau";
      il.appendChild(t);
      if (c) {
        var go = document.createElement("button");
        go.type = "button";
        go.className = "linkish";
        go.textContent = "Régler";
        go.addEventListener("click", function () { setFicheTab("imp", true); });
        il.appendChild(go);
      }
    }
    renderImpList();
    snapshotPatientDraft();
  }

  /* Onglet Impératif : un interrupteur par demi-journée qui a un créneau. */
  function renderImpList() {
    var box = $("imp-list");
    if (!box) return;
    box.innerHTML = "";
    ["am", "pm"].forEach(function (h) {
      var c = crForm[h];
      var row = document.createElement("label");
      row.className = "imp-row" + (c ? "" : " off");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("role", "switch");
      cb.id = "imp-" + h;
      cb.checked = !!(c && c.imp);
      cb.disabled = !c;
      cb.addEventListener("change", function () {
        if (crForm[h]) crForm[h].imp = cb.checked;
        paintCreneauForm();
      });
      var sw = document.createElement("span");
      sw.className = "cr-switch";
      sw.setAttribute("aria-hidden", "true");
      var tx = document.createElement("span");
      tx.innerHTML = "<strong></strong><small></small>";
      tx.querySelector("strong").textContent = CRENEAU_RANGES[h].label + (c ? " · " + crLabel(c) : "");
      tx.querySelector("small").textContent = c ? (c.imp ? "Impératif — reste en place" : "Peut bouger si on réordonne") : "Pas de créneau : rien à verrouiller";
      row.appendChild(cb);
      row.appendChild(sw);
      row.appendChild(tx);
      box.appendChild(row);
    });
    var go = document.createElement("button");
    go.type = "button";
    go.className = "btn btn-ghost";
    go.textContent = "Choisir ou changer le créneau";
    go.addEventListener("click", function () { setFicheTab("creneau", true); });
    box.appendChild(go);
  }
  function crShift(dir) {
    var R = CRENEAU_RANGES[crHalf];
    var c = crForm[crHalf];
    var lo = hmToMin(R.from), hi = hmToMin(R.to);
    if (!c) {
      var d = hmToMin(R.def);
      crForm[crHalf] = { s: minToHm(d), e: minToHm(d + CRENEAU_STEP), imp: false };
    } else {
      var dur = hmToMin(c.e) - hmToMin(c.s);
      var s = hmToMin(c.s) + dir * CRENEAU_STEP;
      if (s < lo) s = lo;
      if (s + dur > hi) s = hi - dur;
      if (s < lo) { s = lo; dur = hi - lo; }
      crForm[crHalf] = { s: minToHm(s), e: minToHm(s + dur), imp: c.imp };
    }
    paintCreneauForm();
  }
  function fillSelect(sel, opts, val) {
    sel.innerHTML = "";
    opts.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o;
      op.textContent = hmLabel(o);
      if (o === val) op.selected = true;
      sel.appendChild(op);
    });
  }
  function openCrCustom() {
    var c = crForm[crHalf];
    var R = CRENEAU_RANGES[crHalf];
    var s = c ? c.s : R.def;
    var e = c ? c.e : minToHm(hmToMin(R.def) + 30);
    fillSelect($("cr-from"), crStepOptions(CRENEAU_CUSTOM.from, CRENEAU_CUSTOM.to, false), s);
    fillSelect($("cr-to"), crStepOptions(CRENEAU_CUSTOM.from, CRENEAU_CUSTOM.to, true), e);
    $("cr-custom-error").hidden = true;
    $("cr-custom").hidden = false;
  }
  function applyCrCustom() {
    var s = $("cr-from").value, e = $("cr-to").value;
    var c = validCr({ s: s, e: e, imp: false });
    if (!c) {
      $("cr-custom-error").textContent = "La fin doit être après le début (entre 6h00 et 21h00).";
      $("cr-custom-error").hidden = false;
      return;
    }
    var h = halfOfStart(s);
    var prev = crForm[h];
    c.imp = !!(prev && prev.imp);
    crForm[h] = c;
    crHalf = h;
    $("cr-custom").hidden = true;
    paintCreneauForm();
  }
  function collectCreneaux() {
    var out = {};
    if (crForm.am) out.am = validCr(crForm.am);
    if (crForm.pm) out.pm = validCr(crForm.pm);
    return out.am || out.pm ? out : null;
  }
  ["am", "pm"].forEach(function (h) {
    if ($("cr-tab-" + h)) $("cr-tab-" + h).addEventListener("click", function () { crHalf = h; $("cr-custom").hidden = true; paintCreneauForm(); });
  });
  if ($("cr-prev")) $("cr-prev").addEventListener("click", function () { crShift(-1); });
  if ($("cr-next")) $("cr-next").addEventListener("click", function () { crShift(1); });
  if ($("cr-none")) $("cr-none").addEventListener("click", function () { crForm[crHalf] = null; paintCreneauForm(); });
  if ($("cr-custom-open")) $("cr-custom-open").addEventListener("click", openCrCustom);
  if ($("cr-custom-ok")) $("cr-custom-ok").addEventListener("click", applyCrCustom);
  if ($("cr-custom-cancel")) $("cr-custom-cancel").addEventListener("click", function () { $("cr-custom").hidden = true; });


  /* —— Fiche patient à intercalaires verticaux (1.91) —— */
  var FICHE_TABS = ["infos", "creneau", "ordo", "imp", "tx", "photos", "alertes"];
  var ficheTab = "infos";
  var ficheTabSession = "infos";
  var fillingFiche = false;

  function setFicheTab(name, focus) {
    if (FICHE_TABS.indexOf(name) === -1) name = "infos";
    ficheTab = name;
    ficheTabSession = name;
    FICHE_TABS.forEach(function (t) {
      var b = $("ft-" + t), pane = $("fp-" + t);
      var on = t === name;
      if (b) {
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle("on", on);
      }
      if (pane) pane.hidden = !on;
    });
    if ($("fiche-panes")) $("fiche-panes").scrollTop = 0;
    if (focus && $("ft-" + name)) $("ft-" + name).focus();
    if (name === "photos" || name === "ordo") renderPatientPhotos();
  }
  FICHE_TABS.forEach(function (t, i) {
    var b = $("ft-" + t);
    if (!b) return;
    b.addEventListener("click", function () { setFicheTab(t, false); snapshotPatientDraft(); });
    b.addEventListener("keydown", function (e) {
      var k = e.key, j = -1;
      if (k === "ArrowDown" || k === "ArrowRight") j = (i + 1) % FICHE_TABS.length;
      else if (k === "ArrowUp" || k === "ArrowLeft") j = (i - 1 + FICHE_TABS.length) % FICHE_TABS.length;
      else if (k === "Home") j = 0;
      else if (k === "End") j = FICHE_TABS.length - 1;
      if (j === -1) return;
      e.preventDefault();
      setFicheTab(FICHE_TABS[j], true);
    });
  });

  function tomorrowISO() {
    var d = parseISODate(todayISO());
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }
  /* 1.99.1 : une alerte reste affichée à partir de son jour (« À partir du »)
     et tous les jours suivants, jusqu’à ce qu’on la retire à la main
     (« Retirer l’alerte » sur la carte, ou « Supprimer l’alerte » dans la fiche).
     Avant, elle n’apparaissait que le jour exact (a.d === jour affiché). */
  function alerteActive(a, iso) {
    if (!a || !a.t) return false;
    var d = a.d && /^\d{4}-\d{2}-\d{2}$/.test(a.d) ? a.d : "";
    return !d || !iso || d <= iso;
  }
  function alerteToday(p) {
    return alerteActive(p && p.alerte, todayISO());
  }
  function alerteOn(p, iso) {
    return alerteActive(p && p.alerte, iso);
  }
  function askRetirerAlerte(pid) {
    var p0 = patientById(pid);
    if (!p0 || !p0.alerte || !p0.alerte.t) return;
    var txt = p0.alerte.t;
    askConfirm("Retirer l’alerte ?", "« " + txt + " » ne s’affichera plus pour " + displayName(p0) + ", sur tous les téléphones du cabinet.", function () {
      var p = patientById(pid);
      if (!p || !p.alerte) return;
      delete p.alerte;
      p.updatedAt = Date.now();
      render();
      persist(false);
      syncWatchToIdb();
      toast("Alerte retirée");
    });
  }
  function ordoVeille(p) {
    return ordoDateList(p).some(ordoInAlertWindow);
  }
  /* Pastilles rouges des intercalaires + état de l’ordonnance, d’après la saisie en cours. */
  function fillOrdoStates(od, od2) {
    var box = $("ordo-states");
    if (!box) return;
    box.innerHTML = "";
    function add(d, label) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var st = document.createElement("p");
      var days = ordoDaysLeft(d);
      if (days != null && days >= 0 && days <= 7) {
        st.textContent = (label ? label + " — " : "") + "Fin " + ordoAlertWhen(d) + " : pensez à faire renouveler l’ordonnance.";
        st.className = "ordo-state late";
      } else {
        var m = ordoMetaOne(d, label);
        if (!m) return;
        st.textContent = m.text;
        st.className = "ordo-state " + (m.cls || "");
      }
      box.appendChild(st);
    }
    var hasBoth = !!(od && od2);
    add(od, hasBoth ? "Ordonnance 1" : "");
    add(od2, hasBoth ? "Ordonnance 2" : "");
  }
  function syncFicheDots() {
    var al = ($("f-alerte") ? $("f-alerte").value : "").trim();
    var aj = $("f-alerte-jour") ? $("f-alerte-jour").value : "";
    var od = $("f-ordo") ? $("f-ordo").value : "";
    var od2 = $("f-ordo2") ? $("f-ordo2").value : "";
    if ($("ft-dot-alerte")) $("ft-dot-alerte").hidden = !alerteActive({ t: al, d: aj }, todayISO());
    if ($("ft-dot-ordo")) $("ft-dot-ordo").hidden = !(ordoInAlertWindow(od) || ordoInAlertWindow(od2));
    if ($("f-alerte-count")) $("f-alerte-count").textContent = String(al.length);
    fillOrdoStates(od, od2);
  }
  ["f-alerte", "f-alerte-jour", "f-ordo", "f-ordo2"].forEach(function (id) {
    if ($(id)) $(id).addEventListener("input", syncFicheDots);
    if ($(id)) $(id).addEventListener("change", syncFicheDots);
  });
  if ($("btn-alerte-del")) $("btn-alerte-del").addEventListener("click", function () {
    $("f-alerte").value = "";
    $("f-alerte-jour").value = "";
    syncFicheDots();
    snapshotPatientDraft();
  });
  function collectAlerte() {
    var t = ($("f-alerte") ? $("f-alerte").value : "").replace(/\s+/g, " ").trim().slice(0, 60);
    var d = $("f-alerte-jour") ? $("f-alerte-jour").value : "";
    if (!t) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = todayISO();
    return { t: t, d: d };
  }

  function openPatient(id) {
    fillingFiche = true;
    editingId = id;
    var p = id ? patientById(id) : null;
    $("patient-title").textContent = p ? "Modifier" : "Nouveau patient";
    $("f-prenom").value = p ? p.prenom || "" : "";
    $("f-nom").value = p ? p.nom || "" : "";
    $("f-tel").value = p ? p.tel || "" : "";
    if ($("f-medecin")) $("f-medecin").value = p ? p.medecin || "" : "";
    if ($("f-medecin-tel")) $("f-medecin-tel").value = p ? p.medecinTel || "" : "";
    fillFamille(p && p.famille ? p.famille : []);
    fillJours(p && p.jours ? p.jours : []);
    $("f-adresse").value = p ? p.adresse || "" : "";
    $("f-remarques").value = p ? p.remarques || "" : "";
    if ($("f-ordo")) $("f-ordo").value = p && p.ordoExp ? p.ordoExp : "";
    if ($("f-ordo2")) $("f-ordo2").value = p && p.ordoExp2 ? p.ordoExp2 : "";
    pendingPatientPhotos = [];
    if ($("f-tour")) $("f-tour").value = (p && p.tourSlot) || "both";
    syncTourUi();
    fillCreneauForm(p);
    if ($("f-alerte")) $("f-alerte").value = p && p.alerte && p.alerte.t ? p.alerte.t : "";
    if ($("f-alerte-jour")) $("f-alerte-jour").value = p && p.alerte && p.alerte.d ? p.alerte.d : "";
    if ($("ph-types")) $("ph-types").hidden = true;
    setFicheTab(p ? ficheTabSession : "infos", false);
    syncFicheDots();
    $("f-tx").value = p ? patientTxText(p.id, todayISO()) : "";
    $("patient-error").hidden = true;
    $("btn-delete-patient").hidden = !p;
    if ($("btn-toggle-actif")) {
      $("btn-toggle-actif").hidden = !p;
      $("btn-toggle-actif").textContent = (p && p.actif === false) ? "Réactiver" : "Mettre en inactif";
    }
    $("modal-patient").hidden = false;
    syncYallerBtn();
    fillingFiche = false;
    if (ficheTab === "infos") setTimeout(function () { $("f-prenom").focus(); }, 200);
  }

  $("btn-cancel-patient").addEventListener("click", function () {
    $("modal-patient").hidden = true;
    closeNavSheet();
    pendingPatientPhotos = [];
    clearPatientDraft();
  });

  if ($("f-adresse")) $("f-adresse").addEventListener("input", syncYallerBtn);
  if ($("btn-yaller")) $("btn-yaller").addEventListener("click", function () {
    openNavSheet(null);
  });
  if ($("btn-nav-cancel")) $("btn-nav-cancel").addEventListener("click", closeNavSheet);
  if ($("modal-nav")) {
    $("modal-nav").addEventListener("click", function (e) {
      if (e.target === $("modal-nav")) closeNavSheet();
    });
    Array.prototype.forEach.call($("modal-nav").querySelectorAll(".nav-choice"), function (b) {
      b.addEventListener("click", function () {
        var app = b.getAttribute("data-nav");
        var dest = navDest || currentPatientDest();
        if (!app || !dest) return;
        try { localStorage.setItem(LS_NAV_APP, app); } catch (e) {}
        markNavLastChoice();
        var url = buildNavUrl(app, dest, isIosDevice());
        closeNavSheet();
        openExternalNav(url);
      });
    });
  }

  $("btn-save-patient").addEventListener("click", function () {
    var prenom = $("f-prenom").value.trim();
    var nom = $("f-nom").value.trim();
    var tel = $("f-tel").value.trim();
    var medecin = ($("f-medecin") ? $("f-medecin").value : "").trim();
    var medecinTel = ($("f-medecin-tel") ? $("f-medecin-tel").value : "").trim();
    if (medecin.length > 80) medecin = medecin.slice(0, 80);
    if (medecinTel.length > 24) medecinTel = medecinTel.slice(0, 24);
    var adresse = $("f-adresse").value.trim();
    var remarques = $("f-remarques").value.trim();
    var ordoExp = ($("f-ordo") && $("f-ordo").value) ? $("f-ordo").value : "";
    var ordoExp2 = ($("f-ordo2") && $("f-ordo2").value) ? $("f-ordo2").value : "";
    var tourSlotVal = ($("f-tour") && $("f-tour").value) || "both";
    if (!prenom && !nom) {
      $("patient-error").textContent = "Indiquez au moins un prénom ou un nom.";
      $("patient-error").hidden = false;
      return;
    }
    var now = Date.now();
    var pid = editingId;
    var txText = ($("f-tx").value || "").trim();
    if (editingId) {
      var p = patientById(editingId);
      if (!p) return;
      p.prenom = prenom;
      p.nom = nom;
      p.tel = tel;
      p.medecin = medecin;
      p.medecinTel = medecinTel;
      p.famille = collectFamille();
      p.jours = collectJours();
      if (normAddr(adresse) !== p.geoQ) {
        p.lat = null;
        p.lng = null;
        p.geoQ = "";
      }
      p.adresse = adresse;
      p.remarques = remarques;
      p.ordoExp = ordoExp;
      if (ordoExp2) p.ordoExp2 = ordoExp2; else delete p.ordoExp2;
      var crs = collectCreneaux();
      if (crs) p.creneaux = crs; else delete p.creneaux;
      var alr = collectAlerte();
      if (alr) p.alerte = alr; else delete p.alerte;
      p.photos = [];
      if (splitToursOn()) p.tourSlot = tourSlotVal;
      p.example = false;
      p.updatedAt = now;
    } else {
      pid = uid();
      state.patients.push({
        id: pid,
        prenom: prenom,
        nom: nom,
        tel: tel,
        medecin: medecin,
        medecinTel: medecinTel,
        famille: collectFamille(),
        jours: collectJours(),
        adresse: adresse,
        remarques: remarques,
        ordoExp: ordoExp,
        ordoExp2: ordoExp2 || undefined,
        creneaux: collectCreneaux() || undefined,
        alerte: collectAlerte() || undefined,
        photos: [],
        tourSlot: splitToursOn() ? tourSlotVal : "both",
        example: false,
        actif: true,
        updatedAt: now,
        lat: null,
        lng: null,
        geoQ: ""
      });
    }
    if (pid) setPatientTx(pid, todayISO(), txText);
    $("modal-patient").hidden = true;
    pendingPatientPhotos = [];
    renderPatientPhotos();
    clearPatientDraft();
    render();
    persist(false);
    syncWatchToIdb();
    if (pid) queueGeocode(pid);
  });

  if ($("btn-toggle-actif")) $("btn-toggle-actif").addEventListener("click", function () {
    var p = editingId ? patientById(editingId) : null;
    if (!p) return;
    var nextActif = p.actif === false;
    p.actif = nextActif;
    p.updatedAt = Date.now();
    $("modal-patient").hidden = true;
    clearPatientDraft();
    render();
    persist(false);
    syncWatchToIdb();
    toast(nextActif ? "Patient réactivé" : "Patient inactif");
  });

  $("btn-delete-patient").addEventListener("click", function () {
    var id = editingId;
    askConfirm("Supprimer cette fiche ?", "La personne disparaîtra de la tournée (tous les téléphones du cabinet).", function () {
      var p = patientById(id);
      if (p) {
        p.updatedAt = Date.now();
        state.deleted[id] = Date.now();
        state.patients = state.patients.filter(function (x) { return x.id !== id; });
      }
      $("modal-patient").hidden = true;
      render();
      persist(false);
      syncWatchToIdb();
    });
  });

  $("btn-menu").addEventListener("click", function () {
    render();
    if ($("btn-staff")) $("btn-staff").hidden = !isAdmin() || isKicked();
    if ($("btn-invite-menu")) $("btn-invite-menu").hidden = !isAdmin() || isKicked();
    if ($("btn-beta-mint")) $("btn-beta-mint").hidden = !isAdmin() || isKicked();
    if ($("btn-change-pin")) $("btn-change-pin").hidden = !isAdmin() || isKicked();
    if ($("menu-archives")) $("menu-archives").hidden = !isAdmin() || isKicked();
    if ($("btn-secu")) {
      $("btn-secu").hidden = isKicked();
      $("btn-secu").textContent = (secu || !isAdmin()) ? "Sécurité du cabinet" : "Sécuriser le cabinet";
    }
    renderMenuSecuStatus();
    renderTrialStatus();
    $("modal-menu").hidden = false;
  });
  $("btn-close-menu").addEventListener("click", function () { $("modal-menu").hidden = true; });

  var lastInviteText = "";

  function inviteAppUrl() {
    return VYDEL_APP_URL;
  }

  function inviteText(code, link) {
    if (link) {
      return "Vydel — invitation\n\nOuvre ce lien sur ton téléphone :\n" + link + "\n\nSi l’appli est déjà installée sur l’écran d’accueil : ouvre-la, Rejoindre, et colle ce lien dans « Invitation ». Puis tape le PIN du cabinet. Le PIN se donne en personne, pas par message.\nInvitation : " + code;
    }
    return "Vydel — invitation\n\nOuvre l’appli :\n" + inviteAppUrl() + "\n\nPuis Rejoindre le cabinet. Le PIN se donne en personne, pas par message.\nInvitation : " + code;
  }

  var lastInviteCode = "";
  var inviteLinkReady = true;
  var inviteDraftSeq = 0;

  /* Prépare le texte (et le lien chiffré, qui prend ~1 s) de l’invitation. Renvoie une promesse « prêt ». */
  function showInviteDraft(code) {
    var seq = ++inviteDraftSeq;
    lastInviteCode = code;
    lastInviteText = inviteText(code);
    inviteLinkReady = !secu;
    var paint = function () {
      var prev = $("invite-preview");
      if (prev) {
        prev.hidden = false;
        prev.textContent = lastInviteText;
      }
      if ($("invite-actions")) $("invite-actions").hidden = false;
      ["btn-invite-copy", "btn-invite-share"].forEach(function (id) {
        if ($(id)) $(id).disabled = !inviteLinkReady;
      });
    };
    paint();
    if (!secu) return Promise.resolve(true);
    return makeInviteLink(code).then(function (link) {
      if (seq !== inviteDraftSeq) return false;
      if (link) lastInviteText = inviteText(code, link);
      inviteLinkReady = true;
      paint();
      return true;
    }).catch(function () {
      if (seq === inviteDraftSeq) { inviteLinkReady = true; paint(); }
      return false;
    });
  }

  /* Note la date du dernier envoi (Copier / Envoyer / Renvoyer). L’appli ne sait pas à qui ni par quelle appli. */
  function markInviteSent(code) {
    code = normInviteCode(code);
    if (!code || !state) return;
    ensureTx();
    var now = Date.now();
    state.invites.forEach(function (x) {
      if (x && String(x.code || "").toUpperCase() === code) x.lastSentAt = now;
    });
    persist(false);
    renderInviteList();
  }

  function copyInviteText() {
    if (!lastInviteText || !inviteLinkReady) return;
    var code = lastInviteCode;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastInviteText).then(function () {
        markInviteSent(code);
        toast("Invitation copiée — envoie-la, sans le PIN.");
      }).catch(function () { toast("Copie impossible."); });
    } else toast("Copie impossible.");
  }

  function shareInviteText() {
    if (!lastInviteText || !inviteLinkReady) return;
    var code = lastInviteCode;
    if (navigator.share) {
      navigator.share({ title: "Vydel — invitation", text: lastInviteText }).then(function () {
        markInviteSent(code);
      }).catch(function () {});
      return;
    }
    copyInviteText();
  }

  /* —— Essais de 14 jours (1.98) ——
     Codes signés ECDSA P-256 (WebCrypto), plus aucun secret dans l’appli.
     Chaîne de confiance : racine Orva Labs (clé publique ci-dessous ; clé privée hors appli, jamais publiée)
     → certificat d’émetteur d’un cabinet (profondeur 1, importé une fois par un lien d’activation)
     → certificats des cabinets créés par essai (profondeur 2…TRIAL_MAX_DEPTH), signés automatiquement par le cabinet
       qui a offert l’essai quand il voit le premier usage sur le relais.
     Chaque cabinet garde sa clé privée d’émetteur dans son état chiffré (state.trialIssuer).
     Relais, par code (sujet dérivé du code, inconnu sans lui) : tournee/essai/<h>/use (premier usage, authentifié par le code),
     tournee/essai/<h>/rev (annulation signée par l’émetteur), tournee/essai/<h>/cert (certificat du cabinet créé).
     Anciens codes « VYD-… » (HMAC, 1.97 et avant) : acceptés jusqu’à leur expiration (au plus tard LEGACY_TRIAL_UNTIL). */
  var LS_BETA_USED = "tournee-beta-used";
  var SS_BETA_OK = "tournee-beta-ok";
  var SS_BETA_ID = "tournee-beta-id";
  var SS_TRIAL_CODE = "tournee-essai-code";
  var SS_TRIAL_ACT = "tournee-essai-act";
  var BETA_DAYS = 14;
  /* vydel-app : pas de secret HMAC, les anciens codes « VYD-… » ne sont pas acceptés ici. */
  var LEGACY_TRIAL_UNTIL = Date.UTC(2026, 11, 7, 23, 0, 0);
  var TRIAL_ROOT_PUB = "BHeZ1XxDprDiRNIUBU83Yx2ZDqY94Mhs7nhaZdtt9EmPN5vfPoP2q_h1O9EZg4WxTeXyCTTpe_SaOPRXSkRN_Lk";
  var TRIAL_REVOKED_ISSUERS = [];
  var TRIAL_MAX_DEPTH = 4;
  var TRIAL_OFFLINE = "Impossible de joindre les relais. Il faut une connexion internet pour démarrer l’essai : réessayez avec du réseau.";
  var TRIAL_BAD = "Code invalide ou modifié. Vérifiez le message reçu.";
  var lastBetaText = "";
  var emergencyCreate = false;
  var pendingBetaId = "";
  var pendingTrialRes = null;
  var pendingTrialLink = "";
  var trialSyncBusy = false;
  var teTrial = new TextEncoder();

  function betaSessionOk() {
    try { return sessionStorage.getItem(SS_BETA_OK) === "1" && !!sessionStorage.getItem(SS_TRIAL_CODE); } catch (e) { return false; }
  }

  function setBetaSession(id, code) {
    try {
      sessionStorage.setItem(SS_BETA_OK, "1");
      if (id) sessionStorage.setItem(SS_BETA_ID, id);
      if (code) sessionStorage.setItem(SS_TRIAL_CODE, code);
    } catch (e) {}
    pendingBetaId = id || "";
  }

  function clearBetaSession() {
    try {
      sessionStorage.removeItem(SS_BETA_OK);
      sessionStorage.removeItem(SS_BETA_ID);
      sessionStorage.removeItem(SS_TRIAL_CODE);
    } catch (e) {}
    pendingBetaId = "";
    pendingTrialRes = null;
  }

  function readBetaUsed() {
    try {
      var raw = localStorage.getItem(LS_BETA_USED);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }

  function markBetaUsed(id) {
    if (!id) return;
    var o = readBetaUsed();
    o[id] = Date.now();
    try { localStorage.setItem(LS_BETA_USED, JSON.stringify(o)); } catch (e) {}
  }

  function isBetaUsed(id) {
    return !!(id && readBetaUsed()[id]);
  }

  function b64url(bytes) {
    var s = b64(bytes);
    return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function unb64url(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return unb64(s);
  }

  async function hmacShort(msg) {
    var enc = new TextEncoder();
    return "";
  }

  async function sha256hex(s) {
    var d = new Uint8Array(await crypto.subtle.digest("SHA-256", teTrial.encode(s)));
    var out = "";
    for (var i = 0; i < d.length; i++) out += ("0" + d[i].toString(16)).slice(-2);
    return out;
  }
  async function trialHash(code) { return (await sha256hex("vydel-essai|" + code)).slice(0, 32); }
  async function kidOf(pub) { return (await sha256hex("vydel-kid|" + pub)).slice(0, 16); }
  function trialTopic(h, sub) { return "tournee/essai/" + h + "/" + sub; }
  function jsonB64(o) { return b64url(teTrial.encode(JSON.stringify(o))); }
  function unJsonB64(s) { return JSON.parse(new TextDecoder().decode(unb64url(s))); }

  async function ecVerify(pub, sig, text) {
    try {
      var k = await crypto.subtle.importKey("raw", unb64url(pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, unb64url(sig), teTrial.encode(text));
    } catch (e) { return false; }
  }
  async function ecSign(jwk, text) {
    var k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return b64url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, teTrial.encode(text))));
  }
  function pubOfJwk(jwk) {
    var x = unb64url(jwk.x), y = unb64url(jwk.y);
    var raw = new Uint8Array(65);
    raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
    return b64url(raw);
  }
  async function newIssuerKeys() {
    var kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    var pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    var j = await crypto.subtle.exportKey("jwk", kp.privateKey);
    return { pub: pub, kid: await kidOf(pub), jwk: { kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d } };
  }

  /* Chaîne : feuille en premier, la dernière est signée par la racine. */
  async function verifyChain(chain, now) {
    if (!Array.isArray(chain) || !chain.length || chain.length > TRIAL_MAX_DEPTH) return { ok: false };
    var signer = TRIAL_ROOT_PUB;
    var depth = 0;
    var body = null;
    for (var i = chain.length - 1; i >= 0; i--) {
      var parts = String(chain[i] || "").split(".");
      if (parts.length !== 2) return { ok: false };
      if (!(await ecVerify(signer, parts[1], parts[0]))) return { ok: false };
      try { body = unJsonB64(parts[0]); } catch (e) { return { ok: false }; }
      depth++;
      if (!body || body.v !== 1 || body.d !== depth || typeof body.k !== "string" || !(Number(body.x) > now)) return { ok: false };
      if (TRIAL_REVOKED_ISSUERS.indexOf(await kidOf(body.k)) !== -1) return { ok: false };
      signer = body.k;
    }
    return { ok: true, pub: body.k, depth: depth, kid: await kidOf(body.k) };
  }

  function extractTrialCode(raw) {
    var s = String(raw || "");
    var m = s.match(/VYD2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}(?![A-Za-z0-9_-])/);
    if (m) return m[0];
    var t = s.replace(/\s+/g, "");
    m = t.match(/VYD2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}/);
    if (m) return m[0];
    m = t.match(/VYD-[A-Za-z0-9]{8}-\d{10,}-[A-Za-z0-9_-]{10}/i);
    if (m) return m[0].slice(0, 4).toUpperCase() + m[0].slice(4, 12).toUpperCase() + m[0].slice(12);
    return "";
  }

  async function parseAndVerifyBeta(raw) {
    var now = Date.now();
    var code = extractTrialCode(raw);
    if (!code) return { ok: false, err: "Code non reconnu. Collez le message ou le lien reçu." };
    if (code.indexOf("VYD-") === 0) {
      return { ok: false, err: "Ancien code d’essai : il n’est plus utilisé. Touchez « Tester Vydel 14 jours » sur l’accueil." };
      var m = code.match(/^VYD-([A-Z0-9]{8})-(\d{10,})-([A-Za-z0-9_-]{10})$/);
      if (!m) return { ok: false, err: TRIAL_BAD };
      var id = m[1], exp = Number(m[2]);
      if (!exp || exp < now) return { ok: false, err: "Cet essai est terminé : le lien a expiré." };
      if (exp > LEGACY_TRIAL_UNTIL) return { ok: false, err: TRIAL_BAD };
      if (isBetaUsed(id)) return { ok: false, err: "Cet essai a déjà été utilisé sur ce téléphone." };
      if (m[3] !== await hmacShort(id + "." + String(exp))) return { ok: false, err: TRIAL_BAD };
      return { ok: true, legacy: true, id: id, exp: exp, code: code, h: await trialHash(code), depth: 0 };
    }
    var parts = code.split(".");
    var p;
    try { p = unJsonB64(parts[1]); } catch (e) { return { ok: false, err: TRIAL_BAD }; }
    if (!p || p.v !== 2 || !/^[A-Z2-9]{10}$/.test(String(p.i || "")) || !(Number(p.a) > 0) || !(Number(p.x) > 0)) return { ok: false, err: TRIAL_BAD };
    var ch = await verifyChain(p.c, now);
    if (!ch.ok) return { ok: false, err: TRIAL_BAD };
    if (!(await ecVerify(ch.pub, parts[2], parts[1]))) return { ok: false, err: TRIAL_BAD };
    if (p.x - p.a > (BETA_DAYS + 1) * 86400000 || p.a > now + 600000) return { ok: false, err: TRIAL_BAD };
    if (p.x <= now) return { ok: false, err: "Cet essai est terminé : le lien a expiré." };
    if (isBetaUsed(p.i)) return { ok: false, err: "Cet essai a déjà été utilisé sur ce téléphone." };
    return { ok: true, legacy: false, id: p.i, exp: p.x, code: code, to: String(p.t || ""), from: String(p.f || ""), depth: ch.depth, issuerPub: ch.pub, h: await trialHash(code) };
  }

  /* Un tour sur tous les relais : publie (retained) puis lit les sujets demandés. reached = relais joints. */
  function trialRelay(subs, pubs, waitMs) {
    return new Promise(function (resolve) {
      var urls = MQTT_URLS.slice();
      var got = {};
      var reached = 0;
      var pending = urls.length;
      var done = false;
      var clients = [];
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(all);
        clients.forEach(function (c) { try { c.end(true); } catch (e) {} });
        resolve({ reached: reached, got: got });
      }
      var all = setTimeout(finish, 14000);
      if (!(window.mqtt && mqtt.connect) || !urls.length) { finish(); return; }
      urls.forEach(function (url) {
        var c = null, over = false, connected = false;
        function one() { if (over) return; over = true; pending--; if (pending <= 0) setTimeout(finish, 50); }
        try {
          c = mqtt.connect(url, { protocolVersion: 4, connectTimeout: 7000, reconnectPeriod: 0, clean: true, clientId: "e" + Math.random().toString(16).slice(2, 10) });
        } catch (eC) { one(); return; }
        clients.push(c);
        var tm = setTimeout(function () { try { c.end(true); } catch (e) {} one(); }, 9000);
        c.on("connect", function () {
          connected = true;
          clearTimeout(tm);
          (pubs || []).forEach(function (p) { try { c.publish(p.t, p.m, { retain: true, qos: 1 }); } catch (e) {} });
          if (!subs || !subs.length) {
            setTimeout(function () { reached++; try { c.end(false); } catch (e) {} one(); }, waitMs || 800);
            return;
          }
          c.subscribe(subs, { qos: 1 }, function (err) {
            if (err) { one(); return; }
            reached++;
            setTimeout(function () { try { c.end(false); } catch (e) {} one(); }, waitMs || 1500);
          });
        });
        c.on("message", function (t, payload) {
          var s = payloadToText(payload) || (payload && payload.toString ? payload.toString() : "");
          if (!s) return;
          if (!got[t]) got[t] = [];
          got[t].push(s);
        });
        c.on("error", function () {});
        c.on("close", function () { if (!connected) { clearTimeout(tm); one(); } });
      });
    });
  }

  async function trialMacKey(code) {
    var raw = new Uint8Array(await crypto.subtle.digest("SHA-256", teTrial.encode("vydel-essai-mac|" + code)));
    return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }
  async function makeUseRecord(code, childPub) {
    var body = JSON.stringify({ v: 1, at: Date.now(), n: b64url(crypto.getRandomValues(new Uint8Array(9))), p: childPub || "" });
    var k = await trialMacKey(code);
    return { n: JSON.parse(body).n, text: JSON.stringify({ b: body, m: b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, teTrial.encode(body)))) }) };
  }
  async function readUseRecord(code, txt) {
    try {
      var o = JSON.parse(txt);
      var k = await trialMacKey(code);
      if (!(await crypto.subtle.verify("HMAC", k, unb64url(o.m), teTrial.encode(o.b)))) return null;
      var b = JSON.parse(o.b);
      return b && b.v === 1 && b.n ? b : null;
    } catch (e) { return null; }
  }
  async function makeRevRecord(jwk, id, h) {
    var body = JSON.stringify({ v: 1, r: 1, i: id, h: h, at: Date.now() });
    return JSON.stringify({ b: body, s: await ecSign(jwk, body) });
  }
  async function readRevRecord(pub, id, txt) {
    try {
      var o = JSON.parse(txt);
      if (!(await ecVerify(pub, o.s, o.b))) return false;
      var b = JSON.parse(o.b);
      return b.r === 1 && b.i === id;
    } catch (e) { return false; }
  }

  async function trialRelayCheck(res) {
    var tu = trialTopic(res.h, "use"), tr = trialTopic(res.h, "rev");
    var r = await trialRelay(res.legacy ? [tu] : [tu, tr], null, 1500);
    if (!r.reached) return { ok: false, err: TRIAL_OFFLINE };
    var i, L = r.got[tu] || [];
    for (i = 0; i < L.length; i++) if (await readUseRecord(res.code, L[i])) return { ok: false, err: "Cet essai a déjà été utilisé." };
    if (!res.legacy) {
      L = r.got[tr] || [];
      for (i = 0; i < L.length; i++) if (await readRevRecord(res.issuerPub, res.id, L[i])) return { ok: false, err: "Cet essai a été annulé par la personne qui vous l’a offert." };
    }
    return { ok: true };
  }

  /* Premier usage : inscrit sur le relais (retained), puis relu ; un autre usage vu = refus. */
  async function trialClaim(res, childPub) {
    var chk = await trialRelayCheck(res);
    if (!chk.ok) return chk;
    var rec = await makeUseRecord(res.code, childPub);
    var tu = trialTopic(res.h, "use");
    var r = await trialRelay([tu], [{ t: tu, m: rec.text }], 1500);
    if (!r.reached) return { ok: false, err: TRIAL_OFFLINE };
    var mine = false, L = r.got[tu] || [];
    for (var i = 0; i < L.length; i++) {
      var b = await readUseRecord(res.code, L[i]);
      if (b && b.n !== rec.n) return { ok: false, err: "Cet essai a déjà été utilisé." };
      if (b && b.n === rec.n) mine = true;
    }
    if (!mine) return { ok: false, err: TRIAL_OFFLINE };
    return { ok: true };
  }

  function mergeTrials(a, b) {
    if (!a && !b) return undefined;
    var out = {};
    var old = Date.now() - 120 * 86400000;
    [a || {}, b || {}].forEach(function (m) {
      Object.keys(m).forEach(function (id) {
        var r = m[id];
        if (!r || !r.id || (Number(r.x) || 0) < old) return;
        var o = out[id] || {};
        var n = {};
        ["id", "to", "by", "code", "h", "kid", "childPub"].forEach(function (k) { n[k] = String(o[k] || r[k] || ""); });
        ["at", "x"].forEach(function (k) { n[k] = Number(o[k] || r[k]) || 0; });
        ["cancelAt", "usedAt", "certAt"].forEach(function (k) { var v = Math.max(Number(o[k]) || 0, Number(r[k]) || 0); if (v) n[k] = v; });
        out[id] = n;
      });
    });
    return out;
  }
  function mergeTrialIssuer(a, b) {
    if (!a || !a.kid) return (b && b.kid) ? b : undefined;
    if (!b || !b.kid) return a;
    var ca = !!(a.chain && a.chain.length), cb = !!(b.chain && b.chain.length);
    if (ca !== cb) return ca ? a : b;
    if (a.kid === b.kid) return a;
    return ((a.at || 0) < (b.at || 0) || ((a.at || 0) === (b.at || 0) && a.kid < b.kid)) ? a : b;
  }

  function trialIssuerReady() {
    var t = state && state.trialIssuer;
    return !!(t && t.jwk && t.chain && t.chain.length);
  }

  function randomTrialId() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var b = crypto.getRandomValues(new Uint8Array(10));
    var s = "";
    for (var i = 0; i < 10; i++) s += abc[b[i] % abc.length];
    return s;
  }

  async function issueTrial(to) {
    var iss = state.trialIssuer;
    var ch = await verifyChain(iss.chain, Date.now());
    if (!ch.ok || ch.pub !== iss.pub) throw new Error("chain");
    var me = localDisplayName() || "";
    var id = randomTrialId();
    var now = Date.now();
    var x = now + BETA_DAYS * 86400000;
    var pb = jsonB64({ v: 2, i: id, a: now, x: x, t: to, f: me, c: iss.chain });
    var code = "VYD2." + pb + "." + await ecSign(iss.jwk, pb);
    var h = await trialHash(code);
    ensureTx();
    if (!state.trials) state.trials = {};
    state.trials[id] = { id: id, to: to, by: me, at: now, x: x, code: code, h: h, kid: iss.kid };
    persist(true);
    return { code: code, x: x };
  }

  function trialStateOf(t, now) {
    if (t.cancelAt) return "Annulé";
    if (now >= (Number(t.x) || 0)) return "Terminé";
    if (t.usedAt) return "Commencé";
    return "En attente";
  }

  function renderTrialList() {
    var box = $("trial-list");
    if (!box || !state) return;
    box.innerHTML = "";
    var now = Date.now();
    var list = Object.keys(state.trials || {}).map(function (k) { return state.trials[k]; });
    list.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    if (!list.length) {
      var e = document.createElement("p");
      e.className = "hint";
      e.textContent = "Aucun essai envoyé pour l’instant.";
      box.appendChild(e);
      return;
    }
    list.forEach(function (t) {
      var st = trialStateOf(t, now);
      var row = document.createElement("div");
      row.className = "staff-row trial-row";
      row.setAttribute("data-trial", t.id);
      var left = document.createElement("div");
      var name = document.createElement("p");
      name.className = "staff-name";
      name.textContent = t.to || "—";
      var meta = document.createElement("p");
      meta.className = "staff-meta";
      meta.textContent = formatDateFr(toISODate(new Date(t.at || now))) + (t.by ? " · par " + t.by : "") + " · " + st;
      left.appendChild(name);
      left.appendChild(meta);
      row.appendChild(left);
      if (st === "En attente" && isAdmin() && !isKicked()) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-danger";
        btn.textContent = "Annuler l'essai";
        btn.addEventListener("click", function () { cancelTrial(t.id); });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });
  }

  function cancelTrial(id) {
    var t = state.trials && state.trials[id];
    if (!t) return;
    askConfirm("Annuler l'essai de " + (t.to || "cette personne") + " ?", "Le lien ne permettra plus de créer un cabinet. Un cabinet déjà créé avec cet essai continue de fonctionner.", function () {
      ensureTx();
      var r = state.trials && state.trials[id];
      if (!r) return;
      r.cancelAt = Date.now();
      persist(true);
      renderTrialList();
      toast("Essai annulé.");
      trialSync();
    });
  }

  /* Côté émetteur : publie les annulations, voit les premiers usages, certifie les cabinets créés.
     Côté cabinet créé par essai : récupère son certificat. Aucun serveur : un tour sur les relais. */
  async function trialSync() {
    if (trialSyncBusy || !unlocked || !state || isKicked()) return;
    trialSyncBusy = true;
    try {
      var now = Date.now();
      var iss = state.trialIssuer;
      var canSign = !!(iss && iss.jwk);
      var subs = [], pubs = [], watch = [];
      var trials = state.trials || {};
      var ids = Object.keys(trials);
      for (var i = 0; i < ids.length; i++) {
        var t = trials[ids[i]];
        if (!t || !t.code || !t.h || now > (t.x || 0) + 30 * 86400000) continue;
        if (t.cancelAt) {
          if (canSign && t.kid === iss.kid && now < t.x) pubs.push({ t: trialTopic(t.h, "rev"), m: await makeRevRecord(iss.jwk, t.id, t.h) });
          continue;
        }
        if (!t.usedAt || (t.childPub && !t.certAt)) { subs.push(trialTopic(t.h, "use")); watch.push(t); }
      }
      var wantCert = !!(iss && iss.jwk && !(iss.chain && iss.chain.length) && iss.req);
      if (wantCert) subs.push(trialTopic(iss.req, "cert"));
      if (!subs.length && !pubs.length) return;
      var r = await trialRelay(subs, pubs, 1500);
      if (!r.reached) return;
      var upd = {};
      for (var w = 0; w < watch.length; w++) {
        var tw = watch[w];
        var L = r.got[trialTopic(tw.h, "use")] || [];
        for (var j = 0; j < L.length; j++) {
          var b = await readUseRecord(tw.code, L[j]);
          if (b) { upd[tw.id] = { usedAt: tw.usedAt || Number(b.at) || now, childPub: tw.childPub || String(b.p || "") }; break; }
        }
      }
      var certPubs = [];
      if (trialIssuerReady()) {
        var ch = await verifyChain(iss.chain, now);
        for (var c = 0; c < watch.length; c++) {
          var tc = watch[c];
          var u = upd[tc.id] || {};
          var cp = tc.childPub || u.childPub;
          if (!cp || tc.certAt || tc.kid !== iss.kid || !ch.ok || ch.depth >= TRIAL_MAX_DEPTH) continue;
          var body = jsonB64({ v: 1, k: cp, d: ch.depth + 1, x: now + 365 * 86400000, n: "" });
          var cert = body + "." + await ecSign(iss.jwk, body);
          certPubs.push({ t: trialTopic(tc.h, "cert"), m: JSON.stringify({ c: [cert].concat(iss.chain) }), id: tc.id });
        }
      }
      if (certPubs.length) {
        var r2 = await trialRelay(null, certPubs, 900);
        if (r2.reached) certPubs.forEach(function (p) { upd[p.id] = Object.assign(upd[p.id] || {}, { certAt: Date.now() }); });
      }
      var newChain = null;
      if (wantCert) {
        var LC = r.got[trialTopic(iss.req, "cert")] || [];
        for (var k = 0; k < LC.length; k++) {
          try {
            var o = JSON.parse(LC[k]);
            var cc = await verifyChain(o.c, now);
            if (cc.ok && cc.pub === iss.pub) { newChain = o.c; break; }
          } catch (eC) {}
        }
      }
      var changed = false;
      ensureTx();
      Object.keys(upd).forEach(function (id) {
        var t2 = state.trials && state.trials[id];
        if (!t2) return;
        Object.keys(upd[id]).forEach(function (f) { if (upd[id][f] && !t2[f]) { t2[f] = upd[id][f]; changed = true; } });
      });
      if (newChain && state.trialIssuer && state.trialIssuer.kid === iss.kid && !(state.trialIssuer.chain && state.trialIssuer.chain.length)) {
        state.trialIssuer.chain = newChain;
        changed = true;
      }
      if (changed) { persist(true); renderTrialList(); }
    } catch (e) {
    } finally {
      trialSyncBusy = false;
    }
  }

  /* Lien d’activation (une fois par cabinet, ouvert par un administrateur) : #vessai=… */
  async function tryTrialActivation() {
    var raw = "";
    try { raw = sessionStorage.getItem(SS_TRIAL_ACT) || ""; } catch (e) {}
    if (!raw || !unlocked || !state) return;
    try { sessionStorage.removeItem(SS_TRIAL_ACT); } catch (e) {}
    if (!isAdmin() || isKicked()) { toast("Réservé à un administrateur du cabinet."); return; }
    try {
      var o = unJsonB64(raw);
      var ch = await verifyChain(o.c, Date.now());
      if (!ch.ok || !o.jwk || pubOfJwk(o.jwk) !== ch.pub) throw new Error("bad");
      ensureTx();
      if (trialIssuerReady()) { toast("Ce cabinet peut déjà offrir des essais."); return; }
      state.trialIssuer = { kid: ch.kid, pub: ch.pub, jwk: { kty: "EC", crv: "P-256", x: o.jwk.x, y: o.jwk.y, d: o.jwk.d }, chain: o.c, at: Date.now() };
      persist(true);
      toast("Ce cabinet peut maintenant offrir des essais.");
    } catch (e2) {
      toast("Lien d’activation non valable.");
    }
  }

  function betaSmsText(code, to, x) {
    return "Salut" + (to ? " " + to : "") + " ! Je te propose d’essayer Vydel, une appli que nous avons créée pour les tournées IDEL. Idéale aussi pour les remplaçants.\n\n"
      + "Ce n’est pas un logiciel de facturation : c’est le complément. La checklist du jour, les passages, le relais entre collègues. Fini les papiers et les messages WhatsApp éparpillés : tout est regroupé dans l’appli (qui est prévu, ce qui est fait, transmissions, messages).\n\n"
      + "Les données sont chiffrées sur le téléphone. Ce n’est pas un dossier médical, juste le passage. Sans le PIN du cabinet, rien n’est lisible.\n\n"
      + "Tu peux envoyer des transmissions même sans connexion — pratique en zone rurale ou dans l’ascenseur.\n\n"
      + "Une fois lancée, elle devient vite indispensable. Voici ton essai de " + BETA_DAYS + " jours :\n\n"
      + "1) Ouvre ce lien : " + inviteAppUrl() + "#ve=" + code + "\n"
      + "2) Crée ton propre cabinet (choisis ton PIN de 6 chiffres).\n\n"
      + "Essai personnel, à démarrer avant le " + formatDateFr(toISODate(new Date(x || (Date.now() + BETA_DAYS * 86400000)))) + " — ne le transfère pas. Si le lien ne s’ouvre pas : ouvre " + inviteAppUrl() + ", touche « J’ai reçu un essai » et colle ce message.\n\n"
      + "Tu joues avec, et tu me dis ce qui coince ou ce qui manque. Merci !\n\n"
      + "© 2026 Orva Labs. Tous droits réservés.";
  }

  function simpleTrialText(to) {
    return "Salut" + (to ? " " + to : "") + " ! Je te propose d’essayer Vydel, une appli pour les tournées IDEL. Idéale aussi pour les remplaçants.\n\n"
      + "Ce n’est pas un logiciel de facturation ni un dossier médical : c’est la checklist du jour, les passages et le relais entre collègues.\n\n"
      + "1) Ouvre ce lien : " + VYDEL_APP_URL + "\n"
      + "2) Touche « Tester Vydel 14 jours » et crée ton propre cabinet (PIN de 6 chiffres).\n\n"
      + "Tu me dis ce qui coince ou ce qui manque. Merci !\n\n"
      + "© 2026 Orva Labs. Tous droits réservés.";
  }

  function showBetaDraft(code, to, x) {
    lastBetaText = betaSmsText(code, to, x);
    var prev = $("beta-preview");
    if (prev) {
      prev.hidden = false;
      prev.textContent = lastBetaText;
    }
    if ($("beta-actions")) $("beta-actions").hidden = false;
  }

  function copyBetaText() {
    if (!lastBetaText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastBetaText).then(function () {
        toast("Message copié — envoie-le tel quel.");
      }).catch(function () { toast("Copie impossible."); });
    } else toast("Copie impossible.");
  }

  function shareBetaText() {
    if (!lastBetaText) return;
    if (navigator.share) {
      navigator.share({ title: "Vydel — essai de 14 jours", text: lastBetaText }).catch(function () {});
      return;
    }
    copyBetaText();
  }

  function trialError(msg) {
    var e = $("trial-error");
    if (!e) { if (msg) toast(msg); return; }
    e.hidden = !msg;
    e.textContent = msg || "";
  }

  async function generateBetaForDev() {
    trialError("");
    if (!isAdmin() || isKicked()) {
      toast("Réservé aux administrateurs du cabinet.");
      return;
    }
    var to = String(($("trial-to") && $("trial-to").value) || "").trim().slice(0, 24);
    if (!to) { trialError("Indiquez le prénom de l’IDEL invitée."); return; }
    if (!trialIssuerReady()) {
      lastBetaText = simpleTrialText(to);
      if ($("beta-preview")) { $("beta-preview").hidden = false; $("beta-preview").textContent = lastBetaText; }
      if ($("beta-actions")) $("beta-actions").hidden = false;
      if ($("trial-to")) $("trial-to").value = "";
      toast("Message prêt à envoyer.");
      return;
    }
    if (false) {
      trialError(state.trialIssuer && state.trialIssuer.req
        ? "Ce cabinet pourra offrir des essais dès que la personne qui vous a invitée se reconnecte."
        : "Ce cabinet n’est pas encore activé pour offrir des essais.");
      trialSync();
      return;
    }
    var k;
    try { k = await issueTrial(to); } catch (e) { trialError("Impossible de préparer l’essai. Réessayez."); return; }
    showBetaDraft(k.code, to, k.x);
    if ($("trial-to")) $("trial-to").value = "";
    renderTrialList();
    toast("Essai prêt à envoyer.");
  }

  function canCreateCabinet() {
    return true; /* vydel-app : création de cabinet libre (essai de 14 jours) */
  }

  function openBetaMintModal() {
    if (!isAdmin() || isKicked()) {
      toast("Réservé aux administrateurs du cabinet.");
      return;
    }
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("beta-preview")) { $("beta-preview").hidden = true; $("beta-preview").textContent = ""; }
    if ($("beta-actions")) $("beta-actions").hidden = true;
    trialError("");
    lastBetaText = "";
    renderTrialList();
    if ($("modal-beta")) $("modal-beta").hidden = false;
    trialSync();
  }

  async function createInvite() {

    if (!isAdmin() || isKicked()) {
      toast("Seul un administrateur peut inviter.");
      return;
    }
    if (seatPlanOn() && rosterCount("admin") >= 2 && rosterCount("collab") >= 3) {
      toast("Cabinet complet : 2 administrateurs et 3 collaborateurs.");
      return;
    }
    ensureTx();
    var token = randomInvite();
    var label = String(($("invite-for") && $("invite-for").value) || "").replace(/\s+/g, " ").trim().slice(0, 24);
    var rec = { code: token, createdAt: Date.now(), usedAt: null, v: 2 };
    if (label) rec.label = label;
    state.invites.push(rec);
    if ($("invite-for")) $("invite-for").value = "";
    await persist(true);
    showInviteDraft(token);
    renderInviteList();
    toast("Invitation prête à envoyer" + (label ? " pour " + label : "") + ".");
  }

  /* Codes d’avant la 1.91 : de 1.30 à 1.90, chaque appui sur « Ajouter un membre » créait un code tout seul,
     jamais marqué utilisé (le code n’était qu’un texte, on rejoignait avec le PIN). Ils restent dans l’état du
     cabinet mais ne sont pas de vraies invitations : ni « en attente », ni acceptés pour rejoindre.
     Une invitation 1.91 porte v:2 ; repli sur la date (les téléphones 1.90 effacent v en fusionnant). */
  var INVITE_V2_SINCE = Date.UTC(2026, 10, 23, 5, 0, 0); /* publication 1.91 : 23/11/2026 vers 7h10 (Paris) */
  function isLegacyInvite(inv) {
    if (!inv) return true;
    if (inv.v === 2 || inv.label || inv.lastSentAt) return false;
    return !((inv.createdAt || 0) >= INVITE_V2_SINCE);
  }
  /* Ancien code purgeable : jamais utilisé (1.90 ne marquait jamais « utilisé »). Les codes utilisés restent. */
  function isGhostInvite(inv) {
    return !!inv && isLegacyInvite(inv) && !inv.usedAt;
  }
  /* Purge à l’ouverture (tout téléphone 1.91) : retire les anciens codes de l’état du cabinet.
     Ils ne reviennent pas : mergeInvites les écarte aussi à chaque fusion (y compris venant d’un téléphone 1.90). */
  function purgeGhostInvites() {
    if (!state || !state.invites || !state.invites.length) return 0;
    var before = state.invites.length;
    state.invites = state.invites.filter(function (x) { return !isGhostInvite(x); });
    var n = before - state.invites.length;
    if (n && unlocked && key && meta) persist(true);
    return n;
  }

  function liveInvites() {
    ensureTx();
    return (state.invites || []).filter(function (inv) {
      return inv && inv.code && !inv.usedAt && !inv.revokedAt && !isLegacyInvite(inv);
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function pastInvites() {
    ensureTx();
    return (state.invites || []).filter(function (inv) {
      return inv && inv.code && (inv.usedAt || inv.revokedAt) && !isGhostInvite(inv);
    }).sort(function (a, b) { return (b.usedAt || b.revokedAt || 0) - (a.usedAt || a.revokedAt || 0); });
  }

  function revokeInvite(code) {
    if (!isAdmin() || isKicked()) return;
    code = normInviteCode(code);
    ensureTx();
    var now = Date.now();
    state.invites.forEach(function (x) {
      if (x && String(x.code || "").toUpperCase() === code && !x.usedAt && !x.revokedAt) x.revokedAt = now;
    });
    persist(true);
    renderInviteList();
    toast("Invitation " + code + " révoquée.");
  }

  function inviteDateLabel(t) {
    try {
      if (!t || !isFinite(Number(t))) return "date inconnue";
      var d = new Date(Number(t));
      if (isNaN(d.getTime())) return "date inconnue";
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function inviteCard(inv, past) {
    var card = document.createElement("div");
    card.className = "invite-card" + (past ? " invite-card-past" : "");
    var head = document.createElement("div");
    head.className = "invite-card-head";
    var who = document.createElement("strong");
    who.className = "invite-who" + (inv.label ? "" : " invite-who-none");
    who.textContent = inv.label || "Sans nom";
    var st = document.createElement("span");
    st.className = "invite-state " + (inv.usedAt ? "is-used" : inv.revokedAt ? "is-revoked" : "is-wait");
    st.textContent = inv.usedAt ? "Utilisée le " + inviteDateLabel(inv.usedAt) : inv.revokedAt ? "Révoquée" : "En attente";
    head.appendChild(who);
    head.appendChild(st);
    var code = document.createElement("p");
    code.className = "invite-code";
    code.textContent = inv.code;
    var meta = document.createElement("p");
    meta.className = "invite-meta";
    var bits = ["Créée le " + inviteDateLabel(inv.createdAt)];
    if (inv.lastSentAt) bits.push("dernier envoi le " + inviteDateLabel(inv.lastSentAt));
    if (inv.usedAt && inv.usedBy) bits.push("par " + inv.usedBy);
    if (inv.revokedAt) bits.push("révoquée le " + inviteDateLabel(inv.revokedAt));
    meta.textContent = bits.join(" · ");
    card.appendChild(head);
    card.appendChild(code);
    card.appendChild(meta);
    if (!past) {
      var acts = document.createElement("div");
      acts.className = "invite-acts";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.textContent = "Renvoyer";
      btn.addEventListener("click", function () { openInviteResend(inv.code); });
      var rev = document.createElement("button");
      rev.type = "button";
      rev.className = "btn btn-ghost invite-revoke";
      rev.textContent = "Révoquer";
      rev.setAttribute("aria-label", "Révoquer l’invitation " + inv.code);
      rev.addEventListener("click", function () {
        askConfirm(
          "Révoquer l’invitation ?",
          "Le lien " + inv.code + (inv.label ? " (" + inv.label + ")" : "") + " ne permettra plus de rejoindre le cabinet.",
          function () { revokeInvite(inv.code); }
        );
      });
      acts.appendChild(btn);
      acts.appendChild(rev);
      card.appendChild(acts);
    }
    return card;
  }

  var inviteHistOpen = false;

  function renderInviteList() {
    var box = $("invite-list");
    if (!box) return;
    box.innerHTML = "";
    var list = liveInvites();
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Aucune invitation en attente.";
      box.appendChild(empty);
    }
    list.forEach(function (inv) { box.appendChild(inviteCard(inv, false)); });
    var past = pastInvites().slice(0, 15);
    if (past.length) {
      var det = document.createElement("details");
      det.className = "invite-hist";
      det.open = inviteHistOpen;
      det.addEventListener("toggle", function () { inviteHistOpen = det.open; });
      var sum = document.createElement("summary");
      sum.textContent = "Historique (" + past.length + ")";
      det.appendChild(sum);
      past.forEach(function (inv) { det.appendChild(inviteCard(inv, true)); });
      box.appendChild(det);
    }
  }

  /* Renvoyer : confirmation dans l’appli avant de partager (le lien est préparé pendant ce temps). */
  var resendCode = "";
  var resendReady = null;

  function openInviteResend(code) {
    ensureTx();
    var inv = (state.invites || []).filter(function (x) { return x && x.code === code; })[0];
    if (!inv) return;
    resendCode = code;
    resendReady = showInviteDraft(code);
    $("resend-text").textContent = "Renvoyer l’invitation " + code + " à " + (inv.label || "personne non indiquée") + " ?";
    $("resend-meta").textContent = "Créée le " + inviteDateLabel(inv.createdAt) + ", " +
      (inv.lastSentAt ? "dernier envoi le " + inviteDateLabel(inv.lastSentAt) : "jamais envoyée depuis l’appli") + ".";
    $("modal-invite-resend").hidden = false;
  }

  if ($("btn-resend-yes")) $("btn-resend-yes").addEventListener("click", function () {
    $("modal-invite-resend").hidden = true;
    var code = resendCode;
    if (inviteLinkReady && lastInviteCode === code) { shareInviteText(); return; }
    (resendReady || Promise.resolve()).then(function () {
      if (lastInviteCode === code) shareInviteText();
    });
  });
  if ($("btn-resend-no")) $("btn-resend-no").addEventListener("click", function () {
    $("modal-invite-resend").hidden = true;
  });

  function openStaffModal(create) {
    if (!isAdmin() || isKicked()) return;
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("seat-add")) $("seat-add").hidden = !seatPlanOn();
    if ($("staff-hint")) {
      $("staff-hint").textContent = seatPlanOn()
        ? "2 administrateurs et 3 collaborateurs maximum. Seul un administrateur peut ajouter ou retirer. Le prénom ajouté doit être celui saisi dans l’appli. Le PIN se donne en personne."
        : "Retirer cache la tournée à cette personne. Pour un stagiaire, changez aussi le PIN.";
    }
    renderInviteList();
    renderStaff();
    if ($("modal-staff")) $("modal-staff").hidden = false;
    /* Plus de création automatique : l’admin indique d’abord « Pour qui ? », puis « Créer une invitation ». */
    if (create && $("invite-for")) setTimeout(function () { try { $("invite-for").focus(); } catch (eF) {} }, 150);
  }

  if ($("btn-seat-add")) $("btn-seat-add").addEventListener("click", function () {
    addSeatPerson($("seat-name") ? $("seat-name").value : "", $("seat-role") ? $("seat-role").value : "collab");
    if ($("seat-name")) $("seat-name").value = "";
  });
  if ($("btn-invite")) $("btn-invite").addEventListener("click", function () { createInvite(); });
  if ($("btn-invite-copy")) $("btn-invite-copy").addEventListener("click", copyInviteText);
  if ($("btn-invite-share")) $("btn-invite-share").addEventListener("click", shareInviteText);
  if ($("btn-beta-mint")) $("btn-beta-mint").addEventListener("click", openBetaMintModal);
  if ($("btn-beta-gen")) $("btn-beta-gen").addEventListener("click", function () { generateBetaForDev(); });
  if ($("btn-beta-copy")) $("btn-beta-copy").addEventListener("click", copyBetaText);
  if ($("btn-beta-share")) $("btn-beta-share").addEventListener("click", shareBetaText);
  if ($("btn-close-beta")) $("btn-close-beta").addEventListener("click", function () {
    if ($("modal-beta")) $("modal-beta").hidden = true;
  });
  if ($("btn-beta-enter")) $("btn-beta-enter").addEventListener("click", function () {
    if ($("beta-error")) $("beta-error").hidden = true;
    if ($("beta-key-input")) $("beta-key-input").value = "";
    showScreen("screen-beta");
    setTimeout(function () {
      try { $("beta-key-input").focus(); } catch (e) {}
    }, 80);
  });
  if ($("btn-beta-back")) $("btn-beta-back").addEventListener("click", function () {
    showScreen("screen-welcome");
  });
  async function submitBetaKey() {
    var err = $("beta-error");
    var inp = $("beta-key-input");
    var raw = inp ? inp.value : "";
    var go = $("btn-beta-go");
    if (go && go.disabled) return;
    if (err) { err.hidden = false; err.textContent = "Vérification…"; }
    if (go) go.disabled = true;
    var res;
    try {
      res = await parseAndVerifyBeta(raw);
      if (res.ok) {
        var chk = await trialRelayCheck(res);
        if (!chk.ok) res = chk;
      }
    } finally {
      if (go) go.disabled = false;
    }
    if (!res.ok) {
      if (err) { err.hidden = false; err.textContent = res.err; }
      return;
    }
    if (err) err.hidden = true;
    pendingTrialRes = res;
    setBetaSession(res.id, res.code);
    toast("Essai valable : choisis ton PIN pour créer ton cabinet.");
    pinFirst = "";
    openPin("setup", "Choisissez un PIN", "6 chiffres — ton cabinet.");
  }
  if ($("btn-beta-go")) $("btn-beta-go").addEventListener("click", function () { submitBetaKey(); });
  if ($("beta-key-input")) $("beta-key-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submitBetaKey(); }
  });
  if ($("btn-invite-menu")) $("btn-invite-menu").addEventListener("click", function () {
    openStaffModal(true);
  });
  $("btn-change-pin").addEventListener("click", function () {
    $("modal-menu").hidden = true;
    if (!isAdmin()) {
      toast("Seul un administrateur peut changer le PIN.");
      return;
    }
    openPin("change-old", "PIN actuel", "Saisissez le PIN actuel.");
  });

  if ($("btn-new-day")) $("btn-new-day").addEventListener("click", function () {
    $("modal-menu").hidden = true;
    askConfirm(
      "Attention",
      "Nouvelle journée décoche TOUS les patients marqués Fait aujourd’hui, sur tous les téléphones. Les fiches restent. Continuer ?",
      function () {
        var day = todayISO();
        var t = Date.now();
        Object.keys(state.done).forEach(function (id) {
          if (state.done[id] && state.done[id].d === day) {
            rememberFait(id, true);
            state.done[id] = { d: null, t: t };
          }
        });
        lastFait = [];
        render();
        persist(false);
        syncWatchToIdb();
        refreshPlanFaitIfOpen(day);
      }
    );
  });

  $("btn-retry-share").addEventListener("click", function () {
    $("modal-menu").hidden = true;
    startShare();
  });

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || "")); };
      r.onerror = function () { reject(r.error || new Error("read")); };
      r.readAsText(file);
    });
  }

  function isBackupEnvelope(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (!obj.salt || !obj.iv || !obj.ct) return false;
    if (obj.kind && obj.kind !== "tournee-backup") return false;
    return obj.kind === "tournee-backup" || !obj.kind;
  }


  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function joursLabel(p) {
    var jours = (p && p.jours) || [];
    if (!jours.length) return "Tous les jours";
    var names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return jours.map(function (d) { return names[d] || ""; }).filter(Boolean).join(", ");
  }

  function downloadOwnData() {
    if (!isAdmin() || isKicked()) {
      toast("Seul un administrateur peut télécharger.");
      return;
    }
    if (!unlocked || !state) {
      toast("Déverrouillez d’abord.");
      return;
    }
    ensureTx();
    var day = todayISO();
    var patients = (state.patients || []).filter(function (p) { return p && !p.example; });
    patients.sort(function (a, b) { return displayName(a).localeCompare(displayName(b), "fr"); });
    var parts = [];
    parts.push("<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>Vydel — données du cabinet</title>");
    parts.push("<style>body{font:16px/1.45 -apple-system,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1c2424}h1{font-size:22px}h2{font-size:18px;margin-top:28px}article{border:1px solid #ddd;border-radius:12px;padding:12px 14px;margin:10px 0}img{max-width:100%;border-radius:8px;margin-top:8px}.muted{color:#5c6b6b;font-size:14px}</style>");
    parts.push("<h1>Vydel — données du cabinet</h1>");
    parts.push("<p class=\"muted\">Export du " + escHtml(day) + ". À garder sur cet ordinateur. Pas envoyé à Orva Labs.</p>");
    parts.push("<h2>Patients (" + patients.length + ")</h2>");
    patients.forEach(function (p) {
      parts.push("<article><h3>" + escHtml(displayName(p)) + "</h3>");
      if (p.tel) parts.push("<p>Tél. " + escHtml(p.tel) + "</p>");
      if (p.adresse) parts.push("<p>" + escHtml(p.adresse) + "</p>");
      parts.push("<p>" + escHtml(joursLabel(p)) + "</p>");
      if (p.ordoExp) parts.push("<p>Fin d’ordonnance" + (p.ordoExp2 ? " 1" : "") + " : " + escHtml(p.ordoExp) + "</p>");
      if (p.ordoExp2) parts.push("<p>Fin d’ordonnance 2 : " + escHtml(p.ordoExp2) + "</p>");
      if (p.medecin || p.medecinTel) parts.push("<p>Médecin : " + escHtml(p.medecin || "") + (p.medecinTel ? " · " + escHtml(p.medecinTel) : "") + "</p>");
      if (p.remarques) parts.push("<p>" + escHtml(p.remarques) + "</p>");
      parts.push("</article>");
    });
    parts.push("<h2>Passages faits</h2>");
    var days = Object.keys(state.history || {}).sort().reverse();
    if (!days.length) parts.push("<p class=\"muted\">Aucun passage enregistré.</p>");
    days.forEach(function (d) {
      var fait = (state.history[d] && state.history[d].fait) || {};
      var lines = [];
      Object.keys(fait).forEach(function (id) {
        var rec = fait[id];
        if (!rec || !rec.done) return;
        lines.push(escHtml(rec.name || "Patient") + (rec.by ? " · " + escHtml(rec.by) : ""));
      });
      if (!lines.length) return;
      parts.push("<article><h3>" + escHtml(d) + "</h3><p>" + lines.join("<br>") + "</p></article>");
    });
    parts.push("<h2>Transmissions</h2>");
    var txDays = Object.keys(state.transmissions || {}).sort().reverse();
    var anyTx = false;
    txDays.forEach(function (d) {
      var rec = state.transmissions[d];
      var items = (rec && rec.items) || [];
      if (!items.length) return;
      anyTx = true;
      parts.push("<article><h3>" + escHtml(d) + "</h3>");
      items.forEach(function (it) {
        if (!it) return;
        var who = it.from ? escHtml(it.from) + " · " : "";
        var pat = it.patientName ? escHtml(it.patientName) + " — " : "";
        parts.push("<p>" + who + pat + escHtml(it.text || "") + "</p>");
      });
      parts.push("</article>");
    });
    if (!anyTx) parts.push("<p class=\"muted\">Aucune transmission.</p>");
    parts.push("<p class=\"muted\">© 2026 Orva Labs. Archive du cabinet, pour lui seul.</p>");
    var blob = new Blob([parts.join("")], { type: "text/html;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vydel-donnees-" + day + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1200);
    toast("Données téléchargées. Ouvre le fichier sur Mac ou PC.");
  }

  async function backupNow() {
    if (!unlocked || !key || !meta || !meta.salt) {
      toast("Déverrouillez d’abord.");
      return;
    }
    try {
      var env;
      if (secu) {
        if (!sessionPin) { toast("Déverrouillez d’abord."); return; }
        var bSalt = crypto.getRandomValues(new Uint8Array(16));
        env = await encryptState(state, await deriveKey(sessionPin, bSalt), bSalt);
      } else {
        env = await encryptState(state, key, unb64(meta.salt));
      }
      var file = {
        kind: "tournee-backup",
        ver: 1,
        salt: env.salt,
        iv: env.iv,
        ct: env.ct
      };
      var blob = new Blob([JSON.stringify(file)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tournee-" + todayISO() + ".tournee";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
      toast("Sauvegarde enregistrée. Gardez-la au chaud.");
    } catch (e) {
      toast("Sauvegarde impossible.");
    }
  }

  async function restoreFromFile(file) {
    if (!sessionPin) {
      toast("Déverrouillez d’abord.");
      return;
    }
    try {
      var obj = JSON.parse(await readFileText(file));
      if (!isBackupEnvelope(obj)) throw new Error("kind");
      var aes = await deriveKey(sessionPin, unb64(obj.salt));
      var imported = await decryptEnvelope(obj, aes);
      if (!imported || typeof imported !== "object") throw new Error("empty");
      state = mergeState(state, imported);
      ensureTx();
      lastFait = faitTodayIds();
      lastFaitReady = true;
      lastTxMap = txStampMap();
      lastTxReady = true;
      await persist(true);
      render();
      renderTransmissions();
      if (currentTab === "messages") renderMessages();
      syncWatchToIdb();
      toast("Restauration OK.");
    } catch (e) {
      toast("Sauvegarde illisible. Même PIN ?");
    }
  }

  if ($("btn-export-data")) $("btn-export-data").addEventListener("click", function () {
    askConfirm(
      "Télécharger les données du cabinet ?",
      "Le fichier est lisible sur Mac ou PC. Garde-le. Ne l’envoie pas. Seul un administrateur peut le faire.",
      downloadOwnData
    );
  });
  if ($("btn-backup")) $("btn-backup").addEventListener("click", function () {
    if (!isAdmin() || isKicked()) {
      toast("Seul un administrateur peut sauvegarder.");
      return;
    }
    backupNow();
  });
  if ($("btn-restore")) $("btn-restore").addEventListener("click", function () {
    if (!isAdmin() || isKicked()) {
      toast("Seul un administrateur peut restaurer.");
      return;
    }
    if (!sessionPin) {
      toast("Déverrouillez d’abord.");
      return;
    }
    askConfirm(
      "Restaurer une archive ?",
      "Le fichier va se mélanger à ce cabinet. À faire seulement avec une sauvegarde de ce cabinet, et le même PIN. Annule si tu n’es pas sûr.",
      function () {
        var inp = $("restore-file");
        if (!inp) return;
        inp.value = "";
        inp.click();
      }
    );
  });
  if ($("restore-file")) $("restore-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    restoreFromFile(f);
  });


  function askConfirm(title, text, fn) {
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    confirmFn = fn;
    $("modal-confirm").hidden = false;
  }
  $("confirm-yes").addEventListener("click", function () {
    $("modal-confirm").hidden = true;
    var fn = confirmFn;
    confirmFn = null;
    if (fn) fn();
  });
  $("confirm-no").addEventListener("click", function () {
    $("modal-confirm").hidden = true;
    confirmFn = null;
  });

  function mergeState(a, b) {
    var deleted = {};
    var da = a.deleted || {};
    var db = b.deleted || {};
    Object.keys(da).concat(Object.keys(db)).forEach(function (id) {
      deleted[id] = Math.max(da[id] || 0, db[id] || 0);
    });
    var map = {};
    (a.patients || []).concat(b.patients || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (deleted[p.id] && deleted[p.id] >= (p.updatedAt || 0)) return;
      var prev = map[p.id];
      if (!prev || (p.updatedAt || 0) >= (prev.updatedAt || 0)) map[p.id] = p;
    });
    var done = {};
    function consider(src) {
      Object.keys(src.done || {}).forEach(function (id) {
        var rec = src.done[id];
        if (!rec) return;
        if (!done[id] || (rec.t || 0) >= (done[id].t || 0)) done[id] = rec;
      });
    }
    consider(a);
    consider(b);
    var transmissions = mergeTransmissions(a.transmissions, b.transmissions);
    return {
      patients: Object.keys(map).map(function (k) { return map[k]; }),
      done: done,
      deleted: deleted,
      transmissions: transmissions,
      patientTx: mergePatientTx(a.patientTx, b.patientTx),
      invites: mergeInvites(a.invites, b.invites),
      planning: mergePlanning(a.planning, b.planning),
      history: mergeHistory(a.history, b.history),
      messages: mergeMessages(a.messages, b.messages),
      feedback: mergeMessages(a.feedback, b.feedback),
      presence: mergePresence(a.presence, b.presence),
      blocked: mergeBlocked(a.blocked, b.blocked),
      cabinetMode: (a.cabinetMode === "split" || b.cabinetMode === "split") ? "split" : "",
      roster: mergeRoster(a.roster, b.roster),
      secu: mergeSecu(a.secu, b.secu),
      rec: mergeRecMeta(a.rec, b.rec),
      secLog: mergeSecLog(a.secLog, b.secLog),
      phMeta: mergePhMeta(a.phMeta, b.phMeta, deleted, function (pid) { return map[pid] || null; }),
      trials: mergeTrials(a.trials, b.trials),
      trialIssuer: mergeTrialIssuer(a.trialIssuer, b.trialIssuer),
      trial: mergeTrialInfo(a.trial, b.trial),
      imports: mergeImports(a.imports, b.imports)
    };
  }



  function mergeRoster(a, b) {
    var out = {};
    function consider(src) {
      (src || []).forEach(function (rec) {
        if (!rec || !rec.name) return;
        var key = foldName(rec.name);
        if (!key || key === "developpeur" || key === "pepper") return;
        var role = rec.role === "admin" ? "admin" : "collab";
        var ts = rec.t || 0;
        if (!out[key] || ts >= (out[key].t || 0)) {
          out[key] = { name: String(rec.name).trim().slice(0, 24), role: role, t: ts };
        }
      });
    }
    consider(a);
    consider(b);
    return Object.keys(out).map(function (k) { return out[k]; });
  }

  function mergeBlocked(a, b) {
    var out = {};
    function consider(src) {
      Object.keys(src || {}).forEach(function (k) {
        var rec = src[k];
        if (!rec) return;
        var key = foldName(rec.name || k);
        if (!key || isAdminFold(key) || key === "developpeur") return;
        var t = rec.t || 0;
        if (!out[key] || t >= (out[key].t || 0)) {
          out[key] = {
            name: String(rec.name || k).trim().slice(0, 24),
            t: t,
            on: !!rec.on,
            by: String(rec.by || "").slice(0, 24)
          };
        }
      });
    }
    consider(a);
    consider(b);
    return out;
  }

  function mergePresence(a, b) {
    var byFold = {};
    function consider(src) {
      Object.keys(src || {}).forEach(function (name) {
        var n = String(name || "").trim().slice(0, 24);
        var t = Number((src || {})[name] || 0) || 0;
        if (!n || !t) return;
        var f = foldName(n);
        if (!f || f === "developpeur") return;
        var prev = byFold[f];
        if (!prev || t > prev.t) byFold[f] = { name: n, t: t };
      });
    }
    consider(a);
    consider(b);
    var keys = Object.keys(byFold).sort(function (x, y) {
      return (byFold[y].t || 0) - (byFold[x].t || 0);
    });
    var out = {};
    keys.slice(0, 12).forEach(function (f) {
      out[byFold[f].name] = byFold[f].t;
    });
    return out;
  }

  function mergeMessages(a, b) {
    var map = {};
    function consider(list) {
      (list || []).forEach(function (m) {
        if (!m || !m.id) return;
        var rec = {
          id: String(m.id),
          from: String(m.from || "").slice(0, 24),
          text: String(m.text || "").slice(0, 400),
          t: m.t || 0
        };
        if (m.kind === "sticker" || m.kind === "voice") rec.kind = m.kind;
        if (m.sticker) rec.sticker = String(m.sticker).slice(0, 8);
        if (m.voiceId) rec.voiceId = String(m.voiceId).slice(0, 64);
        if (m.dur) rec.dur = m.dur;
        if (m.deletedAt) {
          rec.deletedAt = m.deletedAt;
          rec.text = "";
          delete rec.sticker;
        }
        var prev = map[rec.id];
        if (!prev) { map[rec.id] = rec; return; }
        var pa = prev.deletedAt || prev.t || 0;
        var pb = rec.deletedAt || rec.t || 0;
        if (pb > pa) map[rec.id] = rec;
        else if (pb === pa && rec.deletedAt && !prev.deletedAt) map[rec.id] = rec;
      });
    }
    consider(a);
    consider(b);
    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (x, y) { return (x.t || 0) - (y.t || 0); });
    if (out.length > 300) out = out.slice(out.length - 300);
    return out;
  }

  function mergePlanning(a, b) {
    a = a || {};
    b = b || {};
    var out = {};
    var days = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (day) { days[day] = true; });
    Object.keys(days).forEach(function (day) {
      var ra = a[day];
      var rb = b[day];
      if (!ra) { out[day] = rb; return; }
      if (!rb) { out[day] = ra; return; }
      out[day] = ((rb.updatedAt || 0) >= (ra.updatedAt || 0)) ? rb : ra;
    });
    return out;
  }

  function mergeHistory(a, b) {
    a = a || {};
    b = b || {};
    var out = {};
    var days = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (day) { days[day] = true; });
    Object.keys(days).forEach(function (day) {
      var ra = a[day] || {};
      var rb = b[day] || {};
      var fa = ra.fait || {};
      var fb = rb.fait || {};
      var fait = {};
      var ids = {};
      Object.keys(fa).concat(Object.keys(fb)).forEach(function (id) { ids[id] = true; });
      Object.keys(ids).forEach(function (id) {
        var xa = fa[id];
        var xb = fb[id];
        if (!xa) { fait[id] = xb; return; }
        if (!xb) { fait[id] = xa; return; }
        fait[id] = ((xb.t || 0) >= (xa.t || 0)) ? xb : xa;
      });
      out[day] = {
        updatedAt: Math.max(ra.updatedAt || 0, rb.updatedAt || 0),
        fait: fait
      };
    });
    return out;
  }

  function backfillHistory() {
    if (!state.history) state.history = {};
    var now = Date.now();
    var changed = false;
    Object.keys(state.done || {}).forEach(function (id) {
      var rec = state.done[id];
      if (!rec) return;
      var day = rec.d;
      if (!day || typeof day !== "string") return;
      if (!state.history[day]) state.history[day] = { updatedAt: 0, fait: {} };
      if (!state.history[day].fait) state.history[day].fait = {};
      var existing = state.history[day].fait[id];
      if (existing && existing.done === true) return;
      var p = patientById(id);
      var name = p ? displayName(p) : "Patient";
      var t = rec.t || now;
      state.history[day].fait[id] = { name: name, t: t, done: true };
      if ((state.history[day].updatedAt || 0) < t) state.history[day].updatedAt = t;
      changed = true;
    });
    return changed;
  }

  function mergeVoices(a, b) {
    var map = {};
    (a || []).concat(b || []).forEach(function (v) {
      if (!v || !v.id) return;
      var prev = map[v.id];
      if (!prev) { map[v.id] = v; return; }
      var pd = prev.deletedAt || 0;
      var vd = v.deletedAt || 0;
      if (vd > pd) map[v.id] = v;
      else if (vd === pd && (v.createdAt || 0) >= (prev.createdAt || 0)) map[v.id] = v;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) {
      return (x.createdAt || 0) - (y.createdAt || 0);
    });
  }

  function mergeTxItems(a, b) {
    var map = {};
    function consider(list) {
      (list || []).forEach(function (it) {
        if (!it || !it.id) return;
        var rec = {
          id: String(it.id),
          from: String(it.from || "").slice(0, 24),
          text: String(it.text || "").slice(0, 800),
          t: it.t || 0,
          updatedAt: it.updatedAt || it.t || 0
        };
        if (it.kind) rec.kind = String(it.kind).slice(0, 16);
        if (it.patientId) rec.patientId = String(it.patientId).slice(0, 64);
        if (it.patientName) rec.patientName = String(it.patientName).slice(0, 80);
        if (it.voiceId) rec.voiceId = String(it.voiceId).slice(0, 64);
        if (it.replyTo) rec.replyTo = String(it.replyTo).slice(0, 64);
        if (it.deletedAt) {
          rec.deletedAt = it.deletedAt;
          rec.text = "";
          delete rec.patientName;
        }
        var prev = map[rec.id];
        if (!prev) { map[rec.id] = rec; return; }
        var pa = prev.updatedAt || prev.t || 0;
        var pb = rec.updatedAt || rec.t || 0;
        if (pb > pa) map[rec.id] = rec;
        else if (pb === pa && rec.deletedAt && !prev.deletedAt) map[rec.id] = rec;
      });
    }
    consider(a);
    consider(b);
    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (x, y) { return (x.t || 0) - (y.t || 0); });
    if (out.length > 80) out = out.slice(out.length - 80);
    return out;
  }

  function mergeTxRec(ra, rb) {
    if (!ra) return rb;
    if (!rb) return ra;
    var newer = (rb.updatedAt || 0) > (ra.updatedAt || 0) ? rb : ra;
    return {
      text: newer.text || "",
      updatedAt: Math.max(ra.updatedAt || 0, rb.updatedAt || 0),
      voices: mergeVoices(ra.voices, rb.voices),
      items: mergeTxItems(ra.items, rb.items)
    };
  }

  function mergeTransmissions(ta, tb) {
    if (!ta && !tb) return {};
    ta = ta || {};
    tb = tb || {};
    var out = {};
    var days = {};
    Object.keys(ta).concat(Object.keys(tb)).forEach(function (day) { days[day] = true; });
    Object.keys(days).forEach(function (day) {
      out[day] = mergeTxRec(ta[day], tb[day]);
    });
    return out;
  }

  function mergeInvites(a, b) {
    var map = {};
    (a || []).concat(b || []).forEach(function (inv) {
      if (!inv || !inv.code) return;
      if (isGhostInvite(inv)) return; /* ancien code d’avant la 1.91 : écarté, ne revient pas par la fusion */
      var k = String(inv.code).toUpperCase();
      var prev = map[k];
      if (!prev) {
        prev = map[k] = { code: k, createdAt: inv.createdAt || 0, usedAt: inv.usedAt || null };
        if (inv.usedBy) prev.usedBy = inv.usedBy;
        if (inv.revokedAt) prev.revokedAt = inv.revokedAt;
        if (inv.label) prev.label = String(inv.label).slice(0, 24);
        if (inv.lastSentAt) prev.lastSentAt = inv.lastSentAt;
        if (inv.v === 2) prev.v = 2;
        return;
      }
      if (inv.v === 2) prev.v = 2;
      if (inv.label && !prev.label) prev.label = String(inv.label).slice(0, 24);
      if ((inv.lastSentAt || 0) > (prev.lastSentAt || 0)) prev.lastSentAt = inv.lastSentAt;
      if ((inv.createdAt || 0) < (prev.createdAt || 0) || !prev.createdAt) prev.createdAt = inv.createdAt || prev.createdAt;
      /* Usage unique : une date d’utilisation / de révocation ne revient jamais à vide (on garde la première). */
      if (inv.usedAt && (!prev.usedAt || inv.usedAt < prev.usedAt)) {
        prev.usedAt = inv.usedAt;
        if (inv.usedBy) prev.usedBy = inv.usedBy; else delete prev.usedBy;
      }
      if (inv.revokedAt && (!prev.revokedAt || inv.revokedAt < prev.revokedAt)) prev.revokedAt = inv.revokedAt;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function mergePatientTx(a, b) {
    a = a || {};
    b = b || {};
    var out = {};
    var ids = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (id) { ids[id] = true; });
    Object.keys(ids).forEach(function (id) {
      out[id] = mergeTransmissions(a[id], b[id]);
    });
    return out;
  }

  function detectRemoteFaits(prevIds, nextIds) {
    if (!lastFaitReady) return;
    var prev = {};
    prevIds.forEach(function (id) { prev[id] = true; });
    var grown = [];
    nextIds.forEach(function (id) {
      if (!prev[id]) grown.push(id);
    });
    if (!grown.length) return;
    var names = grown.map(function (id) {
      var p = patientById(id);
      return p ? displayName(p) : "Passage";
    });
    var body;
    if (names.length === 1) body = names[0] + " — fait";
    else body = names.length + " passages cochés : " + names.join(", ");
    toast(body);
    showSysNotif(body);
  }

  function showSysNotif(body, tag) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    tag = tag || "tournee";
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "NOTIFY",
          title: "Vydel",
          body: body,
          tag: tag
        });
      } else {
        new Notification("Vydel", {
          body: body,
          icon: "./icons/icon-192.png",
          tag: tag
        });
      }
    } catch (e) {}
  }

  async function persist(immediate) {
    if (!key || !meta) return;
    if (!persistQuiet && unlocked && meta.blobId) {
      var sg0 = outboxSigOf(state);
      if (sg0 !== outboxSig) { outboxSig = sg0; outboxAdd(); }
    }
    var env = await sealState(state);
    lastPubCt = env.ct;
    noteOwnCt(env.ct);
    saveLocalEnv(env);
    clearTimeout(putTimer);
    if (immediate) {
      await putBlob(env);
      return;
    }
    putTimer = setTimeout(function () {
      if (!key || !meta) return;
      sealState(state).then(function (fresh) {
        lastPubCt = fresh.ct;
        noteOwnCt(fresh.ct);
        saveLocalEnv(fresh);
        putBlob(fresh);
      });
    }, PUT_DEBOUNCE);
  }

  function idFromHeaders(res) {
    if (!res) return null;
    var raw = null;
    var names = ["x-jsonblob-id", "x-jsonblob", "location"];
    for (var i = 0; i < names.length; i++) {
      raw = res.headers.get(names[i]);
      if (raw) break;
    }
    if (!raw) {
      try {
        res.headers.forEach(function (val, name) {
          if (raw) return;
          var n = String(name).toLowerCase();
          if (n.indexOf("jsonblob") !== -1 || n === "location") raw = val;
        });
      } catch (eH) {}
    }
    if (!raw) return null;
    raw = String(raw).replace(/\s+/g, "");
    if (/^https?:\/\//i.test(raw)) return { url: raw, id: idFromShareUri(raw) };
    return { url: JSONBLOB + "/" + raw, id: raw };
  }

  function foundFromBody(body, postUrl) {
    if (!body) return null;
    if (typeof body === "string") {
      var s = body.replace(/\s+/g, "");
      if (/^https?:\/\//i.test(s)) return { url: s, id: idFromShareUri(s) };
      return null;
    }
    var uri = body.uri || body.url || body.id || body.blobId || (body.data && (body.data.uri || body.data.id));
    if (!uri) return null;
    uri = String(uri).replace(/\s+/g, "");
    if (!/^https?:\/\//i.test(uri)) uri = String(postUrl).replace(/\/$/, "") + "/" + uri;
    return { url: uri, id: idFromShareUri(uri) };
  }

  async function postShareHost(url, env) {
    var res = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(env)
    });
    var found = idFromHeaders(res);
    if (found && found.id) return found;
    var text = "";
    try { text = await res.text(); } catch (eT) {}
    if (text) {
      try { found = foundFromBody(JSON.parse(text), url); } catch (eP) {
        found = foundFromBody(text, url);
      }
    }
    if (found && found.id) return found;
    var err = new Error("share");
    err.status = res.status;
    throw err;
  }

  async function tryCreateBlobUnused() {
    if (!key || !meta) return;
    try {
      var env = await sealState(state);
      saveLocalEnv(env);
      var found = null;
      var lastErr = "";
      try { found = await postShareHost(JSONBLOB, env); } catch (eB) {
        lastErr = "blob " + (eB && eB.status ? eB.status : "réseau");
      }
      if (!found || !found.id) {
        try { found = await postShareHost(JSONSTORAGE, env); } catch (eS) {
          lastErr = (lastErr ? lastErr + " / " : "") + "stock " + (eS && eS.status ? eS.status : "réseau");
        }
      }
      if (found && found.id) {
        meta.blobId = found.id;
        meta.blobUrl = found.url || shareUrl(found.id);
        meta.shareOk = true;
        meta.shareErr = "";
        saveMeta();
        showShareBanner();
        render();
        syncWatchToIdb();
        toast("Partage prêt. Menu → Autoriser une associée, une fois par personne.");
        return;
      }
      throw new Error(lastErr || "no-id");
    } catch (e) {
      meta.shareOk = false;
      meta.shareErr = (e && e.message) ? String(e.message).slice(0, 80) : "no-id";
      saveMeta();
      showShareBanner();
      render();
      toast("Partage bloqué. Wi-Fi, ou désactiver le bloqueur de pubs, puis Réessayer.");
    }
  }

  async function putBlob(env) {
    if (!meta || !meta.blobId) return false;
    if (mqttHandle) {
      var sentSeq = outboxGet().seq || 0;
      var hasAck = !!mqttHandle.acks;
      if (mqttHandle.publish(JSON.stringify(env), true, function (err) {
        if (err) { shareDirty = true; outboxRetry(); return; }
        outboxAck(sentSeq);
      })) {
        shareDirty = false;
        if (!hasAck) outboxAck(sentSeq);
        else {
          clearTimeout(outboxWaitTimer);
          outboxWaitTimer = setTimeout(function () { if (outboxGet().n > 0) outboxRetry(); }, 12000);
        }
        if (secu && secu.old && !secu.closed) bridgePublish().catch(function () {});
        if (!meta.shareOk) {
          meta.shareOk = true;
          meta.shareErr = "";
          saveMeta();
          showShareBanner();
          render();
        }
        return true;
      }
      // MQTT pas prêt / publish raté : garder dirty et réessayer
      shareDirty = true;
      outboxRetry();
      if (mqttLive) {
        clearTimeout(mqttFlushTimer);
        mqttFlushTimer = setTimeout(function () {
          mqttFlushTimer = null;
          if (unlocked && key && meta && shareDirty) persist(true);
        }, 1800);
      }
      return false;
    }
    var url = activeShareUrl();
    if (!url || String(url).indexOf("mqtt:") === 0) {
      shareDirty = true;
      scheduleMqttFlush();
      return false;
    }
    try {
      var res = await fetch(url, {
        method: "PUT",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(env)
      });
      if (!res.ok) throw new Error("put");
      shareDirty = false;
      return true;
    } catch (e) {
      shareDirty = true;
      return false;
    }
  }

  async function applyRemoteEnv(env, notify) {
    if (!unlocked || !key || !env || !env.ct) return;
    if (secu && isOwnCt(env.ct) && !mainSynced) {
      mainSynced = true;
      if (!checkSecuClose() && secu.old && !secu.closed) bridgePublish().catch(function () {});
      return;
    }
    if (env.ct && env.ct === lastPubCt) return;
    if (isOwnCt(env.ct)) return;
    if (secu) {
      var r2;
      try { r2 = await decryptEnvelope(env, secu.ck); } catch (e2) { return; }
      if (!r2 || typeof r2 !== "object") return;
      if (r2.secuPtr && r2.secuPtr.t && r2.secuPtr.t !== secu.topic) {
        await resolveConflict(r2.secuPtr, r2);
        return;
      }
      delete r2.secuPtr;
      await mergeRemote(r2, notify);
      if (!mainSynced) {
        mainSynced = true;
        if (!checkSecuClose() && secu && secu.old && !secu.closed) bridgePublish().catch(function () {});
      }
      return;
    }
    try {
      var aes = key;
      var remote;
      if (env.salt && meta && env.salt !== meta.salt) {
        if (!sessionPin) return;
        try {
          var salt2 = unb64(env.salt);
          aes = await deriveKey(sessionPin, salt2);
          remote = await decryptEnvelope(env, aes);
          key = aes;
          meta.salt = env.salt;
          meta.pinHash = await pinHash(sessionPin, salt2);
          saveMeta();
        } catch (ePin) {
          toast("Le PIN a changé. Saisissez le nouveau PIN.");
          lockNow();
          return;
        }
      } else {
        remote = await decryptEnvelope(env, aes);
      }
      if (remote && remote.secuPtr && remote.secuPtr.t) {
        /* Le cabinet a été sécurisé par un administrateur : on suit automatiquement. */
        await adoptPointer(remote.secuPtr, remote);
        return;
      }
      await mergeRemote(remote, notify);
    } catch (e) {}
  }

  async function mergeRemote(remote, notify) {
    try {
      remote = normState(remote);
      var prev = lastFait.slice();
      var prevTx = txStampMap();
      var me = localDisplayName();
      var myPresence = 0;
      if (me && state.presence) {
        var mf0 = foldName(me);
        Object.keys(state.presence).forEach(function (n) {
          if (foldName(n) === mf0) myPresence = Math.max(myPresence, state.presence[n] || 0);
        });
      }
      var merged = mergeState(state, remote);
      var hadExtra = stateSig(merged) !== stateSig(remote);
      state = merged;
      /* Reçu des relais : synchro réussie. Si le relais contient déjà tout ce qu’on a, la file est vide. */
      noteSyncOk();
      if (!hadExtra) { outboxSig = outboxSigOf(state); if (outboxGet().n) outboxAck(outboxGet().seq || 0); }
      else outboxSig = outboxGet().n > 0 ? outboxSigOf(state) : outboxSigOf(remote); /* déjà compté : pas de doublon */
      if (!state.transmissions) state.transmissions = {};
      if (!state.patientTx) state.patientTx = {};
      if (!state.planning) state.planning = {};
      if (!state.history) state.history = {};
      if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
      if (me && !isHiddenPresence(me) && myPresence) {
        var mf = foldName(me);
        Object.keys(state.presence).forEach(function (n) {
          if (n !== me && foldName(n) === mf) delete state.presence[n];
        });
        if ((state.presence[me] || 0) < myPresence) {
          state.presence[me] = myPresence;
          hadExtra = true;
        }
      }
      var restored = restoreMorningFaits();
      var next = faitTodayIds();
      if (notify) {
        if (!restored) detectRemoteFaits(prev, next);
        detectRemoteTx(prevTx);
        detectRemoteMsg(lastMsgT);
      }
      lastFait = next;
      lastFaitReady = true;
      lastTxMap = txStampMap();
      lastTxReady = true;
      lastMsgT = maxOtherMsgT();
      lastMsgReady = true;
      if (secu && secuAck()) hadExtra = true;
      if (secu && state.secu && state.secu.at && (!secu.at || state.secu.at < secu.at)) {
        secu.at = state.secu.at;
        var m2a = loadMeta2();
        if (m2a) { m2a.at = secu.at; saveMeta2(m2a); }
      }
      var localEnv = await sealState(state);
      saveLocalEnv(localEnv);
      purgeEmptyVocals();
      purgeCedricVocals();
      render();
      renderPresence();
      renderTransmissions();
      if (currentTab === "messages") renderMessages();
      syncWatchToIdb();
      if (secu) checkSecuClose();
      if (hadExtra) persist(false);
      phAfterMerge();
    } catch (e) {}
  }

  async function pullRemote(notify) {
    if (!unlocked || !key || !meta || !meta.blobId) return;
    if (mqttHandle || (meta.blobUrl && String(meta.blobUrl).indexOf("mqtt:") === 0)) return;
    var env = null;
    try {
      var res = await fetch(activeShareUrl(), {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) return;
      env = await res.json();
      if (!env || !env.ct) return;
      var remote = await decryptEnvelope(env, key);
      var prev = lastFait.slice();
      var prevTx = txStampMap();
      var mePull = localDisplayName();
      var myPull = 0;
      if (mePull && state.presence) {
        var mfP = foldName(mePull);
        Object.keys(state.presence).forEach(function (n) {
          if (foldName(n) === mfP) myPull = Math.max(myPull, state.presence[n] || 0);
        });
      }
      state = mergeState(state, remote);
      if (!state.transmissions) state.transmissions = {};
      if (!state.patientTx) state.patientTx = {};
      if (!state.planning) state.planning = {};
      if (!state.history) state.history = {};
      if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
      if (mePull && !isHiddenPresence(mePull) && myPull) {
        var mfP2 = foldName(mePull);
        Object.keys(state.presence).forEach(function (n) {
          if (n !== mePull && foldName(n) === mfP2) delete state.presence[n];
        });
        if ((state.presence[mePull] || 0) < myPull) state.presence[mePull] = myPull;
      }
      var restored = restoreMorningFaits();
      var next = faitTodayIds();
      if (notify) {
        if (!restored) detectRemoteFaits(prev, next);
        detectRemoteTx(prevTx);
        detectRemoteMsg(lastMsgT);
      }
      lastFait = next;
      lastFaitReady = true;
      lastTxMap = txStampMap();
      lastTxReady = true;
      lastMsgT = maxOtherMsgT();
      lastMsgReady = true;
      meta.shareOk = true;
      saveMeta();
      var localEnv = await sealState(state);
      saveLocalEnv(localEnv);
      render();
      renderPresence();
      renderTransmissions();
      if (currentTab === "messages") renderMessages();
      showShareBanner();
      syncWatchToIdb();
    } catch (e) {
      if (env && env.ct) applyRemoteEnv(env, notify);
      /* silence : pas de log patient */
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (unlocked) pullRemote(true);
    }, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function isStandalone() {
    return !!(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone);
  }
  function isIosDevice() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function refreshInstallBtn() {
    var btn = $("btn-add-home");
    var welcome = $("btn-install");
    var standalone = isStandalone();
    // Ouvert depuis l'icône installée : les deux boutons sont toujours masqués.
    if (btn) btn.hidden = standalone;
    if (welcome) welcome.hidden = standalone || !(deferredInstall || isIosDevice());
  }
  function showInstallBanner() {
    if ($("install-banner")) $("install-banner").hidden = true;
    refreshInstallBtn();
  }
  function openIosInstallHelp() {
    if ($("modal-ios-install")) $("modal-ios-install").hidden = false;
  }
  function tryInstallApp() {
    if (isStandalone()) {
      toast("Déjà sur l’écran d’accueil.");
      return;
    }
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () {
        deferredInstall = null;
        refreshInstallBtn();
      }).catch(function () {});
      return;
    }
    if (isIosDevice()) {
      openIosInstallHelp();
      return;
    }
    toast("Ouvre cette page dans Chrome, puis réessaie.");
  }
  $("install-dismiss").addEventListener("click", function () {
    localStorage.setItem(LS_INSTALL, "1");
    $("install-banner").hidden = true;
  });

  /* —— File d’envoi persistante (1.91). Le contenu en attente est le dernier état complet,
     déjà chiffré avec la clé du cabinet dans la copie locale ; la file garde seulement
     le compteur, les dates et un numéro de séquence. Vidée uniquement sur accusé (puback, qos 1). —— */
  var LS_OUTBOX = "tournee.outbox";
  var LS_LAST_SYNC = "tournee.lastSync";
  var outboxRetryTimer = null;
  var outboxTries = 0;
  var outboxWaitTimer = null;

  /* Signature des changements « utiles » : la présence (qui est en ligne) ne compte pas comme un changement en attente. */
  function outboxSigOf(st) {
    if (!st) return "";
    var c = Object.assign({}, st, { presence: {} });
    return stateSig(c);
  }
  function outboxGet() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(LS_OUTBOX) || "null"); } catch (e) { o = null; }
    return o && typeof o.n === "number" ? o : { n: 0, first: 0, last: 0, seq: 0 };
  }
  function outboxSave(o) {
    try { localStorage.setItem(LS_OUTBOX, JSON.stringify(o)); } catch (e) {}
    refreshSyncUi();
  }
  function outboxAdd() {
    var o = outboxGet();
    var now = Date.now();
    o.n = (o.n || 0) + 1;
    if (!o.first) o.first = now;
    o.last = now;
    o.seq = (o.seq || 0) + 1;
    outboxSave(o);
    return o.seq;
  }
  function outboxAck(seq) {
    var o = outboxGet();
    noteSyncOk();
    outboxTries = 0;
    clearTimeout(outboxRetryTimer);
    clearTimeout(outboxWaitTimer);
    if (o.seq && seq < o.seq) { outboxSchedule(400); return; } /* une modif plus récente attend encore */
    outboxSave({ n: 0, first: 0, last: 0, seq: o.seq || 0 });
  }
  function outboxSchedule(ms) {
    clearTimeout(outboxRetryTimer);
    outboxRetryTimer = setTimeout(function () {
      outboxRetryTimer = null;
      if (!unlocked || !key || !meta) return;
      if (outboxGet().n > 0 && mqttLive) { shareDirty = true; persist(true); }
    }, ms);
  }
  function outboxRetry() {
    outboxTries = Math.min(outboxTries + 1, 6);
    outboxSchedule(Math.min(60000, 2000 * Math.pow(2, outboxTries - 1)));
  }
  function noteSyncOk() {
    try { localStorage.setItem(LS_LAST_SYNC, String(Date.now())); } catch (e) {}
    refreshSyncUi();
  }
  function hhmm(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var same = toISODate(d) === todayISO();
    var t = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    return same ? t : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + t;
  }
  function syncState() {
    var shared = !!(meta && meta.blobId);
    var offline = (typeof navigator !== "undefined" && navigator.onLine === false) || (shared && !mqttLive);
    var o = outboxGet();
    if (offline) return { k: "off", n: o.n, o: o };
    if (o.n > 0) return { k: "wait", n: o.n, o: o };
    return { k: "ok", n: 0, o: o };
  }
  function refreshSyncUi() {
    var pill = $("sync-pill");
    var st = syncState();
    var last = 0;
    try { last = Number(localStorage.getItem(LS_LAST_SYNC) || 0); } catch (e) {}
    if (pill) {
      pill.hidden = !unlocked;
      pill.className = "sync-pill sync-" + st.k;
      pill.textContent = st.k === "off" ? "Hors ligne" : st.k === "wait" ? "En attente · " + st.n : "Synchronisé";
      pill.setAttribute("aria-label", pill.textContent + (last ? ", dernière synchro " + hhmm(last) : ""));
    }
    var el = $("offline-banner");
    if (el) {
      el.hidden = !(unlocked && st.k === "off");
      var tx = $("offline-text");
      if (tx) {
        var parts = ["Hors ligne : tout reste lisible et modifiable sur ce téléphone."];
        if (st.n > 0) parts.push(st.n + " changement" + (st.n > 1 ? "s" : "") + " en attente (dernier à " + hhmm(st.o.last) + "), envoyé" + (st.n > 1 ? "s" : "") + " au retour du réseau.");
        parts.push(last ? "Dernière synchro réussie : " + hhmm(last) + "." : "Pas encore de synchro réussie.");
        tx.textContent = parts.join(" ");
      }
    }
  }
  if ($("sync-pill")) $("sync-pill").addEventListener("click", function () {
    var st = syncState();
    var last = 0;
    try { last = Number(localStorage.getItem(LS_LAST_SYNC) || 0); } catch (e) {}
    var msg = st.k === "off" ? "Hors ligne." : st.k === "wait" ? st.n + " changement(s) en attente d’envoi." : "Tout est envoyé.";
    msg += last ? " Dernière synchro : " + hhmm(last) + "." : "";
    if (st.k === "wait" && mqttLive) { shareDirty = true; persist(true); }
    toast(msg);
  });
  setInterval(refreshSyncUi, 5000);

  function refreshOfflineBanner() {
    var el = $("offline-banner");
    if (!el) return;
    refreshSyncUi();
  }

  window.addEventListener("offline", function () {
    refreshOfflineBanner();
    toast("Hors ligne. Les transmissions restent sur ce téléphone.");
  });
  window.addEventListener("online", function () {
    refreshOfflineBanner();
    outboxTries = 0;
    if (unlocked && key && meta && (shareDirty || outboxGet().n > 0)) { shareDirty = true; persist(true); }
    toast("Réseau de retour. Synchronisation…");
  });

  function showShareBanner() {
    if (!meta) return;
    if (meta.shareOk && meta.blobId) {
      $("share-banner").hidden = true;
      return;
    }
    if (sessionStorage.getItem(LS_SHARE_BANNER)) {
      $("share-banner").hidden = true;
      return;
    }
    $("share-banner").hidden = false;
  }
  $("share-dismiss").addEventListener("click", function () {
    sessionStorage.setItem(LS_SHARE_BANNER, "1");
    $("share-banner").hidden = true;
  });

  var TUTO_STEPS = [
    { tab: "tournee", sel: "#tab-tournee", title: "Vydel", text: "C’est la liste du jour : seulement les patients à voir aujourd’hui." },
    { tab: "tournee", sel: "#scope-row", title: "Le jour, Tous, Inactifs", text: "Le jour (ex. Jeudi) = la tournée du jour. Tous = tout le cabinet. Inactifs = mis de côté." },
    { tab: "tournee", sel: "#search", title: "Rechercher", text: "Tapez un nom pour retrouver une fiche, même si ce n’est pas son jour." },
    { tab: "tournee", sel: "#list .card-name", title: "Le nom du patient", text: "Prénom et nom. Touchez la fiche pour l’ouvrir (jours, n°, médecin, famille)." },
    { tab: "tournee", sel: "#list .card-jours", title: "Jours de passage", text: "L · M · V… = les jours où on passe. Rien d’écrit = tous les jours." },
    { tab: "tournee", sel: "#list .fait", title: "Fait", text: "Cochez quand le passage est fait. Ça se vide tout seul le lendemain. Pas obligatoire." },
    { tab: "tournee", sel: "#list .card-line.tel", title: "Téléphone", text: "Touchez le numéro : ça appelle (vous sortez un moment de l’appli)." },
    { tab: "tournee", sel: "#list .card-line.addr", title: "Adresse", text: "Touchez l’adresse : le GPS s’ouvre." },
    { tab: "tournee", sel: "#list .card-edit", title: "Modifier", text: "Pour changer le nom, les jours, les n° ou l’adresse." },
    { tab: "tournee", sel: "#btn-add", title: "+ Patient", text: "Ajouter une fiche. Décochez les jours sans passage, sinon la personne s’affiche tous les jours." },
    { tab: "transmissions", sel: "#tab-transmissions", title: "Transmissions", text: "Le relais du cabinet pour tout le monde. Pas un dossier médical, pas de diagnostic." },
    { tab: "transmissions", sel: "#tx-today", title: "Aujourd’hui", text: "Écris, puis Envoyer. Toi seule peux modifier ensuite. Vocal 2 min." },
    { tab: "planning", sel: "#tab-planning", title: "Planning", text: "Le mois du cabinet. Ça suit la date tout seul, rien à reset." },
    { tab: "planning", sel: "#plan-grid", title: "Le calendrier", text: "Touchez un jour pour voir qui était Fait, ou noter qui est de tournée." },
    { tab: "messages", sel: "#tab-messages", title: "Messages", text: "Le fil entre associées. Stickers, vocaux. Pastille rouge = du neuf." },
    { tab: "messages", sel: "#msg-composer", title: "Écrire", text: "Un message, un sticker ou un vocal. Ce n’est pas le lieu des retours appli." },
    { tab: "tournee", sel: "#btn-menu", title: "Menu", text: "Prénom, Question SAV, sauvegarde. N’effacez pas les données du site dans Safari." }
  ];
  var tutoI = 0;
  var tutoPlaceTimer = null;

  function tutoDone() {
    try { localStorage.setItem(LS_TUTO, "1"); } catch (e) {}
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
    if ($("tuto-hole")) $("tuto-hole").hidden = true;
    setTab("tournee");
    setTimeout(maybeAskNotif, 400);
  }

  function placeTutoHole(sel) {
    var hole = $("tuto-hole");
    var card = $("tuto-card");
    if (!hole || !card) return;
    var el = sel ? document.querySelector(sel) : null;
    if (!el || el.hidden || (el.getClientRects && !el.getClientRects().length)) {
      hole.hidden = true;
      card.style.top = "28%";
      return;
    }
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e1) {}
    clearTimeout(tutoPlaceTimer);
    tutoPlaceTimer = setTimeout(function () {
      var r = el.getBoundingClientRect();
      var pad = 8;
      hole.hidden = false;
      hole.style.top = Math.max(6, r.top - pad) + "px";
      hole.style.left = Math.max(6, r.left - pad) + "px";
      hole.style.width = Math.min(window.innerWidth - 12, r.width + pad * 2) + "px";
      hole.style.height = (r.height + pad * 2) + "px";
      var ch = card.offsetHeight || 160;
      var below = window.innerHeight - r.bottom;
      var top;
      if (below > ch + 24) top = r.bottom + 12;
      else top = r.top - ch - 12;
      if (top < 10) top = 10;
      if (top + ch > window.innerHeight - 10) top = Math.max(10, window.innerHeight - ch - 10);
      card.style.top = top + "px";
    }, 260);
  }

  function showTutoStep() {
    while (tutoI < TUTO_STEPS.length) {
      var cand = TUTO_STEPS[tutoI];
      if (!cand.sel) break;
      if (cand.tab) setTab(cand.tab);
      render();
      var el = document.querySelector(cand.sel);
      if (el) break;
      tutoI++;
    }
    var s = TUTO_STEPS[tutoI];
    if (!s) { tutoDone(); return; }
    if (s.tab) setTab(s.tab);
    render();
    if ($("tuto-stepn")) $("tuto-stepn").textContent = (tutoI + 1) + " / " + TUTO_STEPS.length;
    if ($("tuto-title")) $("tuto-title").textContent = s.title;
    if ($("tuto-text")) $("tuto-text").textContent = s.text;
    if ($("btn-tuto-next")) $("btn-tuto-next").textContent = (tutoI === TUTO_STEPS.length - 1) ? "C’est bon" : "Suivant";
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("modal-patient")) $("modal-patient").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = false;
    setBarsHidden(false);
    placeTutoHole(s.sel);
  }

  function openTuto() {
    tutoI = 0;
    listMode = "today";
    setTab("tournee");
    showTutoStep();
  }

  function maybeAskTuto() {
    if (!unlocked) return;
    if (maybeStartOnboarding()) return;
    try {
      if (localStorage.getItem(LS_TUTO)) {
        maybeAskNotif();
        return;
      }
    } catch (e) {}
    openTuto();
  }

  if ($("btn-tuto")) $("btn-tuto").addEventListener("click", openTuto);
  if ($("btn-tuto-next")) $("btn-tuto-next").addEventListener("click", function () {
    tutoI++;
    showTutoStep();
  });
  if ($("btn-tuto-skip")) $("btn-tuto-skip").addEventListener("click", tutoDone);
  window.addEventListener("resize", function () {
    if (!$("modal-tuto") || $("modal-tuto").hidden) return;
    var s = TUTO_STEPS[tutoI];
    if (s) placeTutoHole(s.sel);
  });

  function maybeAskNotif() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted" || Notification.permission === "denied") return;
    if (sessionStorage.getItem(LS_NOTIF_ASKED)) return;
    $("modal-notif").hidden = false;
  }
  $("btn-ask-notif").addEventListener("click", function () {
    $("modal-menu").hidden = true;
    $("modal-notif").hidden = false;
  });
  $("notif-later").addEventListener("click", function () {
    sessionStorage.setItem(LS_NOTIF_ASKED, "1");
    $("modal-notif").hidden = true;
  });
  $("notif-allow").addEventListener("click", function () {
    sessionStorage.setItem(LS_NOTIF_ASKED, "1");
    $("modal-notif").hidden = true;
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(function (perm) {
      if (perm === "granted") toast("Notifications activées");
    });
  });

  /* IndexedDB : clé non extractible + noms seuls, pour le SW */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function idbPut(k, v) {
    try {
      var db = await idbOpen();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(v, k);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
      db.close();
    } catch (e) {}
  }

  async function idbDel(k) {
    try {
      var db = await idbOpen();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(k);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
      db.close();
    } catch (e) {}
  }

  function syncWatchToIdb() {
    if (!unlocked || !key || !meta) return;
    idbPut("cryptoKey", key);
    idbPut("watch", {
      blobId: meta.blobId || null,
      blobUrl: meta.blobUrl || null,
      lastFait: faitTodayIds(),
      names: {},
      day: todayISO(),
      lastTx: maxTxStamp(),
      lastMsg: maxOtherMsgT(),
      myName: localDisplayName() || ""
    });
  }

  function clearWatchKey() {
    idbDel("cryptoKey");
  }


  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstall = e;
    refreshInstallBtn();
  });
  try {
    var dmq = window.matchMedia("(display-mode: standalone)");
    var onDm = function () { refreshInstallBtn(); };
    if (dmq.addEventListener) dmq.addEventListener("change", onDm);
    else if (dmq.addListener) dmq.addListener(onDm);
  } catch (e) {}
  window.addEventListener("appinstalled", function () {
    deferredInstall = null;
    refreshInstallBtn();
    toast("Ajoutée à l’écran d’accueil.");
  });
  if ($("btn-install")) $("btn-install").addEventListener("click", tryInstallApp);
  // Écran d'ouverture (aucun cabinet) : afficher le bouton tout de suite (Safari iPhone).
  refreshInstallBtn();
  if ($("btn-add-home")) $("btn-add-home").addEventListener("click", tryInstallApp);
  if ($("btn-ios-install-ok")) $("btn-ios-install-ok").addEventListener("click", function () {
    if ($("modal-ios-install")) $("modal-ios-install").hidden = true;
  });
  if ($("modal-ios-install")) $("modal-ios-install").addEventListener("click", function (e) {
    if (e.target === $("modal-ios-install")) $("modal-ios-install").hidden = true;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (ev) {
      var msg = ev.data || {};
      if ((msg.type === "REMOTE_FAIT" || msg.type === "REMOTE_TX" || msg.type === "REMOTE_MSG") && unlocked) {
        pullRemote(true);
      }
    });
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.update(); }));
    }).then(function () {
      return navigator.serviceWorker.register("./sw.js?v=1.99.3-app", { updateViaCache: "none" });
    }).catch(function () {});
  }

  function renderTxResume() {
    var box = $("tx-resume");
    if (!box) return;
    // Accueil : plus de bulles / résumé transmissions (uniquement onglet Transmissions)
    box.innerHTML = "";
    box.hidden = true;
  }


  /* 1.99.1 : à l’ouverture de l’onglet Transmissions, on repart en haut (« Aujourd’hui », la plus récente),
     même si la tournée était défilée plus bas ou si un défilement doux était en cours. */
  function txScrollTop() {
    function top() {
      if (currentTab !== "transmissions") return;
      try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, 0); }
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      if ($("pane-transmissions")) $("pane-transmissions").scrollTop = 0;
      lastScrollY = 0;
    }
    top();
    requestAnimationFrame(function () { top(); requestAnimationFrame(top); });
  }
  function setTab(name) {
    if (name !== "transmissions" && name !== "planning" && name !== "messages") name = "tournee";
    var prevTab = currentTab;
    currentTab = name;
    document.documentElement.classList.toggle("tab-tournee", currentTab === "tournee");
    if (unlocked && key) touchPresence(false);
    if (currentTab === "tournee" && prevTab !== "tournee") {
      listMode = "today";
      syncScope();
    }
    fillDayStrip();
    $("pane-tournee").hidden = currentTab !== "tournee";
    $("pane-transmissions").hidden = currentTab !== "transmissions";
    if ($("pane-planning")) $("pane-planning").hidden = currentTab !== "planning";
    if ($("pane-messages")) $("pane-messages").hidden = currentTab !== "messages";
    $("tab-tournee").classList.toggle("active", currentTab === "tournee");
    $("tab-transmissions").classList.toggle("active", currentTab === "transmissions");
    if ($("tab-planning")) $("tab-planning").classList.toggle("active", currentTab === "planning");
    if ($("tab-messages")) $("tab-messages").classList.toggle("active", currentTab === "messages");
    $("tab-tournee").setAttribute("aria-selected", currentTab === "tournee" ? "true" : "false");
    $("tab-transmissions").setAttribute("aria-selected", currentTab === "transmissions" ? "true" : "false");
    if ($("tab-planning")) $("tab-planning").setAttribute("aria-selected", currentTab === "planning" ? "true" : "false");
    if ($("tab-messages")) $("tab-messages").setAttribute("aria-selected", currentTab === "messages" ? "true" : "false");
    $("fab-bar").hidden = currentTab !== "tournee";
    lastScrollY = 0;
    setBarsHidden(false);
    if ($("search-row")) $("search-row").hidden = currentTab !== "tournee";
    /* Masquer la puce mode voiture hors de l’accueil (liste). */
    if ($("car-chip")) $("car-chip").hidden = currentTab !== "tournee";
    if (currentTab === "transmissions") {
      $("app-title").textContent = "Transmissions";
      $("counter").classList.remove("counter-plan", "counter-hist");
      $("counter").textContent = "Historique";
      $("counter").hidden = false;
      updateDayCountBadge("today", 0, 0);
      renderTransmissions();
      markTxSeen();
      txScrollTop();
    } else if (currentTab === "planning") {
      $("app-title").textContent = "Planning";
      $("counter").textContent = monthLabel(planYear, planMonth);
      $("counter").hidden = false;
      renderPlanning();
    } else if (currentTab === "messages") {
      $("app-title").textContent = "Messages";
      $("counter").textContent = localDisplayName() || "Cabinet";
      $("counter").hidden = false;
      renderMessages();
      markMessagesSeen();
    } else {
      $("app-title").textContent = "Vydel";
      $("counter").hidden = false;
      render();
      armOpenScroll(800);
    }
    refreshTopbarCount();
  }

  var lastScrollY = 0;
  var barsHidden = false;
  function setBarsHidden(hide) {
    barsHidden = !!hide;
    if ($("tabbar")) $("tabbar").classList.toggle("tabbar-hide", barsHidden);
    if ($("fab-bar")) $("fab-bar").classList.toggle("tabbar-hide", barsHidden && currentTab === "tournee");
  }
  function onScrollHide(el) {
    if (!el) return;
    var y = el.scrollTop || 0;
    var dy = y - lastScrollY;
    lastScrollY = y;
    if (y < 24) { setBarsHidden(false); return; }
    if (dy > 8) setBarsHidden(true);
    else if (dy < -8) setBarsHidden(false);
  }
  window.addEventListener("scroll", function () {
    if (autoScrolling) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var dy = y - lastScrollY;
    lastScrollY = y;
    if (y < 24) { setBarsHidden(false); return; }
    if (dy > 8) setBarsHidden(true);
    else if (dy < -8) setBarsHidden(false);
  }, { passive: true });
  document.addEventListener("scroll", function (e) {
    var t = e.target;
    if (!t || t === document || t === document.documentElement || t === document.body) return;
    if (t.scrollTop === undefined) return;
    onScrollHide(t);
  }, true);

  $("tab-tournee").addEventListener("click", function () { setTab("tournee"); });
  $("tab-transmissions").addEventListener("click", function () { setTab("transmissions"); });
  if ($("tab-planning")) $("tab-planning").addEventListener("click", function () { setTab("planning"); });
  if ($("tab-messages")) $("tab-messages").addEventListener("click", function () { setTab("messages"); });


  function localDisplayName() {
    try { return String(localStorage.getItem(LS_NAME) || "").trim(); } catch (e) { return ""; }
  }

  function setLocalDisplayName(n) {
    n = String(n || "").trim();
    if (n.length > 24) n = n.slice(0, 24);
    try { localStorage.setItem(LS_NAME, n); } catch (e) {}
    return n;
  }

  function msgDayKey(t) {
    var d = new Date(t || 0);
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function formatTimeHm(t) {
    var d = new Date(t || 0);
    var h = String(d.getHours());
    var min = String(d.getMinutes());
    if (h.length < 2) h = "0" + h;
    if (min.length < 2) min = "0" + min;
    return h + ":" + min;
  }

  function setPrenomModalRequired(on) {
    prenomRequired = !!on;
    if ($("btn-cancel-prenom")) $("btn-cancel-prenom").hidden = prenomRequired;
    if ($("prenom-title")) $("prenom-title").textContent = prenomRequired ? "Ton prénom" : "Mon prénom";
    if ($("prenom-hint")) {
      $("prenom-hint").textContent = prenomRequired
        ? "Une fois, sur ce téléphone. Ensuite l’appli dira Bonjour avec ce prénom."
        : "Affiché dans le fil du cabinet, sur ce téléphone.";
    }
  }

  function maybeAskPrenom() {
    if (!unlocked) return;
    if (localDisplayName()) return;
    setPrenomModalRequired(true);
    openPrenomModal(false);
  }

  function openPrenomModal(thenSend) {
    prenomThenSend = !!thenSend;
    if (!prenomRequired) setPrenomModalRequired(false);
    var inp = $("f-display-name");
    if (inp) inp.value = localDisplayName();
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("modal-prenom")) $("modal-prenom").hidden = false;
    if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
  }

  function closePrenomModal() {
    if (prenomRequired) return;
    if ($("modal-prenom")) $("modal-prenom").hidden = true;
    if ($("modal-feedback")) $("modal-feedback").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
    prenomThenSend = false;
  }

  function savePrenom() {
    var inp = $("f-display-name");
    var raw = String(inp ? inp.value : "").trim();
    var cur = localDisplayName();
    if (!raw) {
      if (inp) inp.focus();
      toast("Indiquez un prénom.");
      return;
    }
    if (cur && isReservedName(raw) && foldName(raw) !== foldName(cur)) {
      toast("Ce prénom est réservé.");
      return;
    }
    if (isBlockedName(raw)) {
      toast("Ce prénom n’a plus accès.");
      return;
    }
    if (!acceptSeatName(raw, cur)) return;
    var n = setLocalDisplayName(raw);
    var thenSend = prenomThenSend;
    var wasRequired = prenomRequired;
    setPrenomModalRequired(false);
    if ($("modal-prenom")) $("modal-prenom").hidden = true;
    if ($("modal-feedback")) $("modal-feedback").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
    prenomThenSend = false;
    fillHello();
    touchPresence(true);
    if (currentTab === "messages") {
      $("counter").textContent = n;
      renderMessages();
    }
    if (thenSend) sendMessage();
    if (wasRequired) setTimeout(maybeAskTuto, 500);
  }

  function scrollMsgBottom() {
    var list = $("msg-list");
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }

  function deleteOwnMessage(id) {
    ensureTx();
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    var me = localDisplayName();
    var i;
    for (i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (!m || m.id !== id) continue;
      if (m.from !== me) return;
      if (m.deletedAt) return;
      m.deletedAt = Date.now();
      m.text = "";
      delete m.sticker;
      persist(true);
      renderMessages();
      return;
    }
  }

  function bindMsgHold(el, id) {
    var hold = null;
    function start() {
      if (hold) clearTimeout(hold);
      hold = setTimeout(function () {
        hold = null;
        deleteOwnMessage(id);
      }, 550);
    }
    function stop() {
      if (hold) { clearTimeout(hold); hold = null; }
    }
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("mousedown", start);
    el.addEventListener("touchend", stop);
    el.addEventListener("touchcancel", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mouseleave", stop);
  }

  function ensureMsgSeen() {
    try {
      if (localStorage.getItem(LS_MSG_SEEN) == null) {
        localStorage.setItem(LS_MSG_SEEN, String(Date.now()));
      }
    } catch (e) {}
  }

  function msgSeenAt() {
    try { return Number(localStorage.getItem(LS_MSG_SEEN) || 0) || 0; } catch (e) { return 0; }
  }

  function markMessagesSeen() {
    try { localStorage.setItem(LS_MSG_SEEN, String(Date.now())); } catch (e) {}
    updateMsgBadge();
  }

  function unreadMsgCount() {
    if (!state.messages) return 0;
    var seen = msgSeenAt();
    var me = localDisplayName();
    var n = 0;
    var i;
    for (i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (!m || m.deletedAt) continue;
      if (me && m.from === me) continue;
      if ((m.t || 0) > seen) n++;
    }
    return n;
  }

  function syncAppBadge() {
    var n = 0;
    try { n = unreadMsgCount() + unreadTxCount(); } catch (e) { n = 0; }
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(Math.min(n, 99));
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e2) {}
  }

  function updateMsgBadge() {
    var el = $("badge-messages");
    if (el) {
      if (currentTab === "messages") {
        el.hidden = true;
        el.textContent = "";
      } else {
        var n = unreadMsgCount();
        if (!n) {
          el.hidden = true;
          el.textContent = "";
        } else {
          el.hidden = false;
          el.textContent = n > 9 ? "9+" : String(n);
        }
      }
    }
    updateTxBadge();
  }

  function ensureTxSeen() {
    try {
      if (localStorage.getItem(LS_TX_SEEN) == null) {
        localStorage.setItem(LS_TX_SEEN, String(Date.now()));
      }
    } catch (e) {}
  }

  function txSeenAt() {
    try { return Number(localStorage.getItem(LS_TX_SEEN) || 0) || 0; } catch (e) { return 0; }
  }

  function markTxSeen() {
    try { localStorage.setItem(LS_TX_SEEN, String(Date.now())); } catch (e) {}
    updateTxBadge();
  }

  function unreadTxCount() {
    ensureTx();
    var seen = txSeenAt();
    var me = localDisplayName();
    var n = 0;
    Object.keys(state.transmissions || {}).forEach(function (day) {
      var rec = state.transmissions[day];
      liveTxItems(rec).forEach(function (it) {
        if (me && it.from === me) return;
        if ((it.updatedAt || it.t || 0) > seen) n++;
      });
      if (rec && String(rec.text || "").trim() && (rec.updatedAt || 0) > seen) n++;
    });
    return n;
  }

  function updateTxBadge() {
    var el = $("badge-tx");
    if (el) {
      if (currentTab === "transmissions") {
        el.hidden = true;
        el.textContent = "";
      } else {
        var n = unreadTxCount();
        if (!n) {
          el.hidden = true;
          el.textContent = "";
        } else {
          el.hidden = false;
          el.textContent = n > 9 ? "9+" : String(n);
        }
      }
    }
    syncAppBadge();
  }


  var lastPresencePing = 0;
  var presenceTimer = null;

  function formatLastSeen(ts) {
    var d = Date.now() - (Number(ts) || 0);
    if (d < 90000) return "à l’instant";
    if (d < 3600000) return "il y a " + Math.max(1, Math.round(d / 60000)) + " min";
    if (d < 86400000) return "il y a " + Math.max(1, Math.round(d / 3600000)) + " h";
    if (d < 172800000) return "hier";
    return "il y a " + Math.max(2, Math.round(d / 86400000)) + " j";
  }

  function isHiddenPresence(n) {
    var f = foldName(n);
    // Comptes techniques / agents : jamais dans la ligne de présence
    return f === "developpeur" || f === "pepper";
  }

  function scrubHiddenPresence() {
    if (!state.presence) return false;
    var changed = false;
    Object.keys(state.presence).forEach(function (n) {
      if (isHiddenPresence(n)) {
        delete state.presence[n];
        changed = true;
      }
    });
    return changed;
  }

  function touchPresence(force) {
    if (!unlocked || !key) return;
    var name = localDisplayName();
    if (!name) return;
    if (isHiddenPresence(name)) {
      ensureTx();
      if (scrubHiddenPresence()) persist(false);
      renderPresence();
      return;
    }
    ensureTx();
    if (!state.presence) state.presence = {};
    scrubHiddenPresence();
    var f = foldName(name);
    Object.keys(state.presence).forEach(function (n) {
      if (n !== name && foldName(n) === f) delete state.presence[n];
    });
    var now = Date.now();
    state.presence[name] = now;
    renderPresence();
    if (!force && lastPresencePing && now - lastPresencePing < 60000) return;
    lastPresencePing = now;
    shareDirty = true;
    if (force) {
      persist(true);
      scheduleMqttFlush();
    } else {
      persist(false);
      if (!mqttLive) scheduleMqttFlush();
    }
  }

  function startPresencePulse() {
    if (presenceTimer) clearInterval(presenceTimer);
    var ticks = 0;
    presenceTimer = setInterval(function () {
      if (!unlocked) return;
      ticks += 1;
      // force publish toutes les ~2 min ; sinon refresh local + publish throttlé
      touchPresence(ticks % 3 === 0);
      if (secu && secuAck()) persist(false);
      checkSecuClose();
    }, 40000);
    touchPresence(true);
  }

  function stopPresencePulse() {
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  }

  function renderPresence() {
    ensureTx();
    if (!state.presence) state.presence = {};
    if (scrubHiddenPresence() && unlocked && key) persist(false);
    var names = Object.keys(state.presence).filter(function (n) {
      return n && !isHiddenPresence(n) && (state.presence[n] || 0) > 0;
    }).sort(function (a, b) {
      return (state.presence[b] || 0) - (state.presence[a] || 0);
    });
    var text = names.length ? names.map(function (n) {
      return n + " · " + formatLastSeen(state.presence[n]);
    }).join(" · ") : "";
    ["home-presence"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (!text) { el.hidden = true; el.textContent = ""; return; }
      el.hidden = false;
      el.textContent = text;
    });
  }

  function isMsgGone(m) {
    return !!(m && m.deletedAt && (Date.now() - m.deletedAt) >= MSG_GONE_MS);
  }

  function scheduleMsgGoneSweep() {
    if (msgGoneTimer) { clearTimeout(msgGoneTimer); msgGoneTimer = null; }
    var now = Date.now();
    var next = 0;
    (state.messages || []).forEach(function (m) {
      if (!m || !m.deletedAt) return;
      if (now - m.deletedAt >= MSG_GONE_MS) return;
      var at = m.deletedAt + MSG_GONE_MS;
      if (!next || at < next) next = at;
    });
    if (!next) return;
    msgGoneTimer = setTimeout(function () {
      msgGoneTimer = null;
      if (currentTab === "messages") renderMessages();
      else scheduleMsgGoneSweep();
    }, Math.max(250, next - Date.now() + 40));
  }

  function renderMessages() {
    ensureTx();
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    var list = $("msg-list");
    if (!list) return;
    if (currentTab === "messages" && $("counter")) {
      $("counter").textContent = localDisplayName() || "Cabinet";
    }
    list.innerHTML = "";
    var me = localDisplayName();
    var lastDay = "";
    var msgs = state.messages.filter(function (m) { return m && m.id && !isMsgGone(m); });
    if (!msgs.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Aucun message. Dites bonjour au cabinet.";
      list.appendChild(empty);
    }
    msgs.forEach(function (m) {
      if (!m || !m.id) return;
      var day = msgDayKey(m.t);
      if (day !== lastDay) {
        lastDay = day;
        var sep = document.createElement("div");
        sep.className = "msg-day";
        sep.textContent = formatDateFr(day);
        list.appendChild(sep);
      }
      var mine = !!(me && m.from === me);
      var row = document.createElement("div");
      row.className = "msg-row " + (mine ? "own" : "other");
      var meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = (m.from || "Cabinet") + "  " + formatTimeHm(m.t);
      row.appendChild(meta);
      var wrap = document.createElement("div");
      wrap.className = "msg-bubble-wrap";
      var bubble = document.createElement("div");
      bubble.className = "msg-bubble" + (m.deletedAt ? " deleted" : "") + (m.kind === "sticker" && !m.deletedAt ? " sticker" : "");
      if (m.deletedAt) {
        bubble.textContent = "Message supprimé";
      } else if (m.kind === "sticker") {
        bubble.textContent = m.sticker || "👍";
      } else if (m.kind === "voice") {
        var url = voiceUrl(m.voiceId);
        if (url) {
          var au = document.createElement("audio");
          au.controls = true;
          au.preload = "metadata";
          au.setAttribute("playsinline", "true");
          au.src = url;
          bubble.appendChild(au);
        } else {
          bubble.textContent = "Vocal en cours de synchro…";
        }
      } else {
        bubble.textContent = m.text || "";
      }
      wrap.appendChild(bubble);
      if (mine && !m.deletedAt) {
        var x = document.createElement("button");
        x.type = "button";
        x.className = "msg-x";
        x.setAttribute("aria-label", "Supprimer");
        x.textContent = "×";
        x.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          deleteOwnMessage(m.id);
        });
        wrap.appendChild(x);
        bindMsgHold(row, m.id);
      }
      row.appendChild(wrap);
      list.appendChild(row);
    });
    scheduleMsgGoneSweep();
    setTimeout(scrollMsgBottom, 30);
    updateMsgBadge();
  }

  function sendMessage() {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(true);
      return;
    }
    var el = $("msg-input");
    var text = el ? String(el.value || "").trim() : "";
    if (!text) return;
    if (text.length > 400) text = text.slice(0, 400);
    ensureTx();
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    state.messages.push({
      id: uid(),
      from: name.slice(0, 24),
      text: text,
      t: Date.now()
    });
    if (state.messages.length > 300) {
      state.messages = state.messages.slice(state.messages.length - 300);
    }
    if (el) el.value = "";
    persist(true);
    renderMessages();
  }

  var MSG_STICKERS = ["👍", "❤️", "🙏", "🚗", "😅", "✅"];

  function needPrenomThen(fn) {
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return false;
    }
    fn();
    return true;
  }

  function pushCabinetMsg(extra) {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return null;
    }
    ensureTx();
    if (!state.messages) state.messages = [];
      if (!state.presence) state.presence = {};
      if (!state.blocked) state.blocked = {};
    var m = {
      id: uid(),
      from: name.slice(0, 24),
      text: "",
      t: Date.now()
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    }
    state.messages.push(m);
    if (state.messages.length > 300) {
      state.messages = state.messages.slice(state.messages.length - 300);
    }
    persist(true);
    renderMessages();
    return m;
  }

  function sendSticker(emo) {
    pushCabinetMsg({ kind: "sticker", sticker: emo });
  }

  async function addMsgVoice(buf, mime, dur) {
    if (!unlocked || !key) return;
    if (!buf || buf.byteLength > VOIX_MAX_BYTES) {
      toast("Vocal trop lourd. Raccourcis-le.");
      return;
    }
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    var id = uid();
    voiceBlobs[id] = { mime: mime || "audio/webm", b64: b64(buf) };
    await publishVoice(id);
    pushCabinetMsg({ kind: "voice", voiceId: id, dur: dur || 0 });
    toast("Vocal envoyé");
  }

  function fillStickers() {
    var box = $("msg-stickers");
    if (!box || box.getAttribute("data-ready")) return;
    box.setAttribute("data-ready", "1");
    MSG_STICKERS.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "msg-sticker";
      b.textContent = e;
      b.setAttribute("aria-label", "Sticker");
      b.addEventListener("click", function () { sendSticker(e); });
      box.appendChild(b);
    });
  }
  fillStickers();

  function foldName(n) {
    n = String(n || "").toLowerCase().trim();
    n = n.replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i");
    n = n.replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u").replace(/ç/g, "c");
    return n.replace(/\s+/g, "");
  }

  function isAdminFold(f) {
    return false; /* vydel-app : aucun administrateur par prénom */
  }

  function seatPlanOn() {
    return !!(state && state.cabinetMode === "split");
  }

  function rosterRole(n) {
    ensureTx();
    var f = foldName(n);
    if (!f) return "";
    var hit = "";
    (state.roster || []).forEach(function (rec) {
      if (rec && foldName(rec.name) === f) hit = rec.role === "admin" ? "admin" : "collab";
    });
    return hit;
  }

  function rosterCount(role) {
    ensureTx();
    var n = 0;
    (state.roster || []).forEach(function (rec) {
      if (!rec || !rec.name || isHiddenPresence(rec.name)) return;
      if (isBlockedName(rec.name)) return;
      var r = rec.role === "admin" ? "admin" : "collab";
      if (r === role) n++;
    });
    return n;
  }

  function upsertRoster(name, role) {
    ensureTx();
    var clean = String(name || "").trim().slice(0, 24);
    var f = foldName(clean);
    if (!f || isHiddenPresence(clean)) return false;
    var next = [];
    var found = false;
    (state.roster || []).forEach(function (rec) {
      if (!rec || !rec.name) return;
      if (foldName(rec.name) === f) {
        found = true;
        next.push({ name: clean, role: role, t: Date.now() });
      } else next.push(rec);
    });
    if (!found) next.push({ name: clean, role: role, t: Date.now() });
    state.roster = next;
    return true;
  }

  function dropRoster(name) {
    ensureTx();
    var f = foldName(name);
    state.roster = (state.roster || []).filter(function (rec) {
      return rec && foldName(rec.name) !== f;
    });
  }

  function renameRoster(from, to) {
    if (!seatPlanOn()) return;
    var role = rosterRole(from);
    if (!role) return;
    dropRoster(from);
    upsertRoster(to, role);
  }

  function ensureSeatForMe() {
    if (!seatPlanOn() || !unlocked) return;
    var me = localDisplayName();
    if (!me || isHiddenPresence(me) || isDevPhone()) return;
    if (rosterRole(me)) return;
    if (rosterCount("admin") === 0) {
      upsertRoster(me, "admin");
      persist(true);
    }
  }

  function acceptSeatName(raw, cur) {
    if (!seatPlanOn() || isHiddenPresence(raw) || isDevPhone()) return true;
    if (isReservedName(raw) && foldName(raw) !== foldName(cur || "")) {
      toast("Ce prénom est réservé.");
      return false;
    }
    var role = rosterRole(raw);
    if (role) {
      if (cur && foldName(cur) !== foldName(raw)) renameRoster(cur, raw);
      return true;
    }
    if (rosterCount("admin") === 0) {
      upsertRoster(raw, "admin");
      return true;
    }
    toast("Un administrateur doit d’abord ajouter ce prénom. 2 administrateurs et 3 collaborateurs maximum.");
    return false;
  }

  function seatLocked() {
    if (!seatPlanOn() || !unlocked) return false;
    var me = localDisplayName();
    if (!me || isHiddenPresence(me) || isDevPhone()) return false;
    if (rosterRole(me)) return false;
    return rosterCount("admin") > 0;
  }

  function addSeatPerson(name, role) {
    if (!isAdmin() || isKicked()) {
      toast("Seul un administrateur peut ajouter.");
      return;
    }
    var clean = String(name || "").trim().slice(0, 24);
    if (!clean) {
      toast("Indiquez un prénom.");
      return;
    }
    if (isHiddenPresence(clean) || isReservedName(clean)) {
      toast("Ce prénom est réservé.");
      return;
    }
    if (rosterRole(clean)) {
      toast("Ce prénom est déjà dans le cabinet.");
      return;
    }
    role = role === "admin" ? "admin" : "collab";
    if (role === "admin" && rosterCount("admin") >= 2) {
      toast("2 administrateurs maximum.");
      return;
    }
    if (role === "collab" && rosterCount("collab") >= 3) {
      toast("3 collaborateurs maximum.");
      return;
    }
    upsertRoster(clean, role);
    if (state.blocked && state.blocked[foldName(clean)]) {
      state.blocked[foldName(clean)].on = false;
      state.blocked[foldName(clean)].t = Date.now();
    }
    persist(true);
    renderStaff();
    toast(clean + " ajouté" + (role === "admin" ? " comme administrateur." : " comme collaborateur."));
  }


  function isDevPhone() {
    return false; /* vydel-app : pas de téléphone « Développeur » */
  }

  function isAdminName(n) {
    return isAdminFold(foldName(n));
  }

  function isReservedName(n) {
    var f = foldName(n);
    return f === "developpeur" || isAdminFold(f);
  }

  function isAdmin() {
    if (isDevPhone()) return true;
    if (seatPlanOn()) return rosterRole(localDisplayName()) === "admin";
    return isAdminName(localDisplayName());
  }

  function isBlockedName(n) {
    if (!n || isReservedName(n)) return false;
    ensureTx();
    var rec = (state.blocked || {})[foldName(n)];
    return !!(rec && rec.on);
  }

  function isKicked() {
    return unlocked && !!localDisplayName() && isBlockedName(localDisplayName());
  }

  function applyAccessGate() {
    var kicked = isKicked() || seatLocked();
    if ($("kicked-text")) {
      $("kicked-text").textContent = (seatLocked() && !isKicked())
        ? "Un administrateur doit d’abord ajouter ce prénom. 2 administrateurs et 3 collaborateurs maximum."
        : (seatPlanOn()
          ? "Un administrateur a retiré cet accès."
          : "Un administrateur a retiré cet accès.");
    }
    if ($("modal-kicked")) $("modal-kicked").hidden = !kicked;
    if ($("btn-staff")) $("btn-staff").hidden = !isAdmin() || kicked;
    if ($("btn-invite-menu")) $("btn-invite-menu").hidden = !isAdmin() || kicked;
    if ($("btn-beta-mint")) $("btn-beta-mint").hidden = !isAdmin() || kicked;
    if ($("btn-change-pin")) $("btn-change-pin").hidden = !isAdmin() || kicked;
    if ($("menu-archives")) $("menu-archives").hidden = !isAdmin() || kicked;
    if (kicked) {
      if ($("list")) $("list").innerHTML = "";
      if ($("msg-list")) $("msg-list").innerHTML = "";
      if ($("tx-history")) $("tx-history").innerHTML = "";
    }
  }

  function staffNames() {
    ensureTx();
    var map = {};
    function add(n, role) {
      n = String(n || "").trim().slice(0, 24);
      if (!n) return;
      var f = foldName(n);
      if (!f || f === "developpeur") return;
      if (!map[f]) map[f] = { name: n, role: role || "asso", seen: 0 };
      if (role === "admin") map[f].role = "admin";
      if (role === "dev") map[f].role = "dev";
    }
    if (seatPlanOn()) {
      (state.roster || []).forEach(function (rec) {
        if (!rec || !rec.name || isHiddenPresence(rec.name)) return;
        add(rec.name, rec.role === "admin" ? "admin" : "collab");
      });
    }
    if (!seatPlanOn()) Object.keys(state.presence || {}).forEach(function (n) { add(n, isAdminName(n) ? "admin" : "asso"); });
    if (!seatPlanOn()) (state.messages || []).forEach(function (m) {
      if (m && m.from) add(m.from, isAdminName(m.from) ? "admin" : "asso");
    });
    Object.keys(state.blocked || {}).forEach(function (k) {
      var rec = state.blocked[k];
      if (rec && rec.name) add(rec.name, "asso");
    });
    var me = localDisplayName();
    if (!seatPlanOn() && me && foldName(me) !== "developpeur") add(me, isAdminName(me) ? "admin" : "asso");
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) {
      var ra = a.role === "admin" || a.role === "dev" ? 0 : 1;
      var rb = b.role === "admin" || b.role === "dev" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "fr");
    });
    return list;
  }

  function renderStaff() {
    var names = staffNames();
    function fill(box) {
    if (!box) return;
    box.innerHTML = "";
    names.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "staff-row";
      var left = document.createElement("div");
      var name = document.createElement("p");
      name.className = "staff-name";
      name.textContent = p.name;
      var meta = document.createElement("p");
      meta.className = "staff-meta";
      if (p.role === "admin") meta.textContent = "Administrateur";
      else if (p.role === "dev") meta.textContent = "Développeur";
      else if (isBlockedName(p.name)) meta.textContent = "Accès retiré";
      else meta.textContent = seatPlanOn() ? "Collaborateur" : "Associé";
      left.appendChild(name);
      left.appendChild(meta);
      row.appendChild(left);
      if (isAdmin() && seatPlanOn() && p.role !== "admin" && rosterCount("admin") < 2 && !isBlockedName(p.name)) {
        var promo = document.createElement("button");
        promo.type = "button";
        promo.className = "btn btn-ghost";
        promo.textContent = "Nommer admin";
        promo.addEventListener("click", function () {
          if (rosterCount("admin") >= 2) { toast("2 administrateurs maximum."); return; }
          upsertRoster(p.name, "admin");
          persist(true);
          renderStaff();
        });
        row.appendChild(promo);
      }
      if (isAdmin() && !isReservedName(p.name) && !(seatPlanOn() && p.role === "admin")) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = isBlockedName(p.name) ? "btn btn-ghost" : "btn btn-danger";
        btn.textContent = isBlockedName(p.name) ? "Réintégrer" : "Retirer";
        btn.addEventListener("click", function () {
          if (isBlockedName(p.name)) restorePerson(p.name);
          else removePerson(p.name);
        });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });
    }
    fill($("staff-list"));
    if ($("seat-count")) {
      $("seat-count").textContent = seatPlanOn()
        ? (rosterCount("admin") + " / 2 administrateurs · " + rosterCount("collab") + " / 3 collaborateurs")
        : "";
    }
  }

  function removePerson(name) {
    if (!isAdmin()) {
      toast("Seul un administrateur peut retirer.");
      return;
    }
    if (seatPlanOn()) {
      if (rosterRole(name) === "admin") {
        toast("On ne retire pas un administrateur.");
        return;
      }
    } else if (isReservedName(name)) {
      toast("Impossible de retirer un administrateur.");
      return;
    }
    askConfirm("Retirer " + name + " ?", "Cette personne ne verra plus la tournée. Pour couper vraiment l’accès, changez aussi le PIN.", function () {
      ensureTx();
      if (!state.blocked) state.blocked = {};
      state.blocked[foldName(name)] = {
        name: String(name).trim().slice(0, 24),
        t: Date.now(),
        on: true,
        by: localDisplayName()
      };
      if (seatPlanOn()) dropRoster(name);
      persist(true);
      renderStaff();
      applyAccessGate();
      toast(name + " retiré.");
    });
  }

  function restorePerson(name) {
    if (!isAdmin()) return;
    if (seatPlanOn()) {
      var role = "collab";
      if (rosterCount("collab") >= 3) {
        toast("3 collaborateurs maximum.");
        return;
      }
      upsertRoster(name, role);
    }
    ensureTx();
    if (!state.blocked) state.blocked = {};
    state.blocked[foldName(name)] = {
      name: String(name).trim().slice(0, 24),
      t: Date.now(),
      on: false,
      by: localDisplayName()
    };
    persist(true);
    renderStaff();
    applyAccessGate();
    toast(name + " réintégré.");
  }

  if ($("btn-staff")) $("btn-staff").addEventListener("click", function () {
    openStaffModal(false);
  });
  if ($("btn-close-staff")) $("btn-close-staff").addEventListener("click", function () {
    if ($("modal-staff")) $("modal-staff").hidden = true;
  });
  if ($("modal-staff")) $("modal-staff").addEventListener("click", function (e) {
    if (e.target === $("modal-staff")) $("modal-staff").hidden = true;
  });
  if ($("btn-kicked-ok")) $("btn-kicked-ok").addEventListener("click", function () {
    if ($("modal-kicked")) $("modal-kicked").hidden = true;
    lockNow();
  });



  function renderFeedback() {
    ensureTx();
    var box = $("feedback-list");
    if (!box) return;
    box.innerHTML = "";
    var hint = $("feedback-hint");
    var dev = isDevPhone();
    if (hint) {
      hint.textContent = dev
        ? "Les retours du cabinet. Arrivent par e-mail, non chiffré."
        : "Une idée, un truc à changer, un bug. Ça part au développeur par e-mail (non chiffré) : n’écrivez aucun nom ni info de patient.";
    }
    if (!dev) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var list = (state.feedback || []).slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Aucun retour pour l’instant.";
      box.appendChild(empty);
      return;
    }
    list.forEach(function (f) {
      if (!f || f.deletedAt) return;
      var item = document.createElement("div");
      item.className = "fb-item";
      var meta = document.createElement("p");
      meta.className = "fb-meta";
      meta.textContent = (f.from || "Cabinet") + "  ·  " + formatTimeHm(f.t);
      var tx = document.createElement("p");
      tx.className = "fb-text";
      tx.textContent = f.text || "";
      item.appendChild(meta);
      item.appendChild(tx);
      box.appendChild(item);
    });
  }

  function openFeedback() {
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    if ($("modal-menu")) $("modal-menu").hidden = true;
    renderFeedback();
    if ($("f-feedback")) $("f-feedback").value = "";
    if ($("modal-feedback")) $("modal-feedback").hidden = false;
  }

  function sendFeedback() {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    var el = $("f-feedback");
    var text = el ? String(el.value || "").trim() : "";
    if (!text) {
      toast("Écrivez un retour.");
      return;
    }
    if (text.length > 400) text = text.slice(0, 400);
    ensureTx();
    state.feedback.push({
      id: uid(),
      from: name.slice(0, 24),
      text: text,
      t: Date.now()
    });
    if (state.feedback.length > 80) {
      state.feedback = state.feedback.slice(state.feedback.length - 80);
    }
    if (el) el.value = "";
    persist(true);
    renderFeedback();
    mailFeedback(name, text);
    toast(isDevPhone() ? "Retour enregistré." : "Retour envoyé au développeur.");
  }

  function mailFeedback(from, text) {
    try {
      fetch("https://formsubmit.co/ajax/fff28a12891b09e68380576bf3c52be8", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          _subject: "Vydel — retour bêta (" + from + ")",
          _template: "box",
          _captcha: "false",
          prenom: String(from || "").slice(0, 24),
          message: String(text || "").slice(0, 400)
        })
      }).catch(function () {});
    } catch (e) {}
  }

  if ($("btn-feedback")) $("btn-feedback").addEventListener("click", openFeedback);
  if ($("btn-send-feedback")) $("btn-send-feedback").addEventListener("click", sendFeedback);
  if ($("btn-close-feedback")) $("btn-close-feedback").addEventListener("click", function () {
    if ($("modal-feedback")) $("modal-feedback").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
  });
  if ($("modal-feedback")) $("modal-feedback").addEventListener("click", function (e) {
    if (e.target === $("modal-feedback")) $("modal-feedback").hidden = true;
  });

  if ($("btn-mon-prenom")) $("btn-mon-prenom").addEventListener("click", function () {
    openPrenomModal(false);
  });
  if ($("btn-save-prenom")) $("btn-save-prenom").addEventListener("click", savePrenom);
  if ($("btn-cancel-prenom")) $("btn-cancel-prenom").addEventListener("click", closePrenomModal);
  if ($("modal-prenom")) $("modal-prenom").addEventListener("click", function (e) {
    if (e.target === $("modal-prenom")) closePrenomModal();
  });
  if ($("f-display-name")) $("f-display-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      savePrenom();
    }
  });
  if ($("btn-msg-send")) $("btn-msg-send").addEventListener("click", sendMessage);
  if ($("msg-input")) $("msg-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });


  function maxOtherMsgT() {
    var me = localDisplayName();
    var max = 0;
    (state.messages || []).forEach(function (m) {
      if (!m || m.deletedAt) return;
      if (me && m.from === me) return;
      if ((m.t || 0) > max) max = m.t || 0;
    });
    return max;
  }

  function newestOtherMsg() {
    var me = localDisplayName();
    var best = null;
    (state.messages || []).forEach(function (m) {
      if (!m || m.deletedAt) return;
      if (me && m.from === me) return;
      if (!best || (m.t || 0) > (best.t || 0)) best = m;
    });
    return best;
  }

  function detectRemoteMsg(prevMax) {
    if (!lastMsgReady) return;
    var next = maxOtherMsgT();
    if (next <= (prevMax || 0)) return;
    var m = newestOtherMsg();
    var from = m && m.from ? String(m.from) : "";
    var body = from ? ("Nouveau message — " + from) : "Nouveau message";
    if (currentTab !== "messages") {
      toast(body);
      showSysNotif(body);
    }
    updateMsgBadge();
  }

  function detectRemoteTx(prevMap) {
    if (!lastTxReady) return;
    ensureTx();
    var changedCab = [];
    var changedPeople = [];
    var next = txStampMap();
    Object.keys(next).forEach(function (k) {
      var prev = (prevMap && prevMap[k]) || 0;
      if ((next[k] || 0) <= prev) return;
      if (k.indexOf("p:") === 0) changedPeople.push(k.split(":")[1]);
      else changedCab.push(k);
    });
    if (!changedCab.length && !changedPeople.length) return;
    var body;
    if (changedPeople.length === 1 && !changedCab.length) {
      var p = patientById(changedPeople[0]);
      body = "Nouvelle transmission — " + (p ? displayName(p) : "passage");
    } else if (changedPeople.length > 1 && !changedCab.length) {
      body = changedPeople.length + " transmissions mises à jour";
    } else {
      var today = todayISO();
      var onlyToday = changedCab.length === 1 && changedCab[0] === today && !changedPeople.length;
      body = onlyToday ? "Nouvelle transmission" : "Transmission mise à jour";
    }
    toast(body);
    showSysNotif(body, "tournee-tx");
  }


  function liveVoices(list) {
    return (list || []).filter(function (v) { return v && v.id && !v.deletedAt; });
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function pickVoixMime() {
    var types = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
    if (!window.MediaRecorder) return "";
    var i;
    for (i = 0; i < types.length; i++) {
      try { if (MediaRecorder.isTypeSupported(types[i])) return types[i]; } catch (e) {}
    }
    return "";
  }

  function playableMime(mime) {
    var m = String(mime || "").split(";")[0].trim().toLowerCase();
    if (m.indexOf("mp4") >= 0 || m.indexOf("m4a") >= 0 || m.indexOf("aac") >= 0) return "audio/mp4";
    if (m.indexOf("ogg") >= 0) return "audio/ogg";
    if (m.indexOf("mpeg") >= 0 || m.indexOf("mp3") >= 0) return "audio/mpeg";
    if (m.indexOf("wav") >= 0) return "audio/wav";
    return m || "audio/webm";
  }

  function blobToArrayBuffer(blob) {
    if (!blob) return Promise.reject(new Error("empty"));
    if (typeof blob.arrayBuffer === "function") {
      return blob.arrayBuffer();
    }
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error("read")); };
      fr.readAsArrayBuffer(blob);
    });
  }

  function setVoixStatus(text, rec) {
    var label = text || "";
    var st = $("voix-status");
    var btn = $("btn-voix");
    if (st) {
      st.hidden = !(rec && recDest === "tx") && !(label && recDest === "tx");
      st.textContent = (rec && recDest === "tx") ? ("● " + label) : (label || "");
    }
    if (btn) {
      btn.classList.toggle("rec", !!rec && recDest === "tx");
      btn.textContent = (rec && recDest === "tx")
        ? ("Stop " + (label.split(" / ")[0] || "0:00"))
        : "Vocal";
    }
    var rbtn = $("btn-tx-rapide-voix");
    var rst = $("tx-rapide-voix-status");
    if (rbtn) {
      rbtn.classList.toggle("rec", !!rec && recDest === "rapide");
      rbtn.textContent = (rec && recDest === "rapide")
        ? ("Stop " + (label.split(" / ")[0] || "0:00"))
        : (pendingTxVoice ? "Vocal prêt" : "Vocal");
    }
    if (rst) {
      rst.hidden = !(rec && recDest === "rapide") && !(label && recDest === "rapide" && !rec && pendingTxVoice);
      if (rec && recDest === "rapide") rst.textContent = "Enregistrement " + label;
      else if (pendingTxVoice && recDest === "rapide") rst.textContent = "Vocal prêt — Envoyer";
      else rst.textContent = label || "";
    }
    var mst = $("msg-voix-status");
    var mbtn = $("btn-msg-voix");
    if (mst) {
      mst.hidden = !text || recDest !== "msg";
      mst.textContent = text || "";
    }
    if (mbtn) {
      mbtn.classList.toggle("rec", !!rec && recDest === "msg");
      mbtn.textContent = (rec && recDest === "msg") ? "■" : "🎤";
    }
    var rv = document.querySelector(".btn-reply-voix");
    if (rv) {
      rv.classList.toggle("rec", !!rec && recDest === "reply");
      rv.textContent = (rec && recDest === "reply")
        ? ("Stop " + (label.split(" / ")[0] || "0:00"))
        : (pendingReplyVoice ? "Vocal prêt" : "Vocal");
    }
    paintRecLine(!!rec, text);
    if (!rec) {
      ["voix-rec-bars", "voix-rec-bars-rapide"].forEach(function (id) {
        var bars = $(id);
        if (bars) bars.innerHTML = "";
      });
    }
  }

  function isVoixRecording() {
    if (recActive) return true;
    return !!(recMedia && recMedia.state === "recording");
  }

  function mergeFloatChunks(chunks) {
    var total = 0, i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Float32Array(total);
    var off = 0;
    for (i = 0; i < chunks.length; i++) {
      out.set(chunks[i], off);
      off += chunks[i].length;
    }
    return out;
  }

  function downsampleMono(samples, fromRate, toRate) {
    if (!samples || !samples.length) return samples;
    if (!fromRate || !toRate || fromRate === toRate) return samples;
    var ratio = fromRate / toRate;
    var len = Math.max(1, Math.floor(samples.length / ratio));
    var out = new Float32Array(len);
    var i, idx;
    for (i = 0; i < len; i++) {
      idx = Math.min(samples.length - 1, Math.floor(i * ratio));
      out[i] = samples[idx];
    }
    return out;
  }

  function stopVoixRec(discard) {
    clearInterval(recTimer);
    recTimer = null;
    recStarted = 0;
    recActive = false;
    setVoixStatus("", false);
    if (recPcmNode) {
      try { recPcmNode.onaudioprocess = null; } catch (eP) {}
      try { recPcmNode.disconnect(); } catch (eP2) {}
      recPcmNode = null;
    }
    if (recPcmSource) {
      try { recPcmSource.disconnect(); } catch (eS) {}
      recPcmSource = null;
    }
    if (recPcmGain) {
      try { recPcmGain.disconnect(); } catch (eG) {}
      recPcmGain = null;
    }
    recAnalyser = null;
    if (recMedia) {
      if (discard) {
        try { recMedia.ondataavailable = null; } catch (eD0) {}
        try { recMedia.onstop = null; } catch (eD1) {}
        try { recMedia.onerror = null; } catch (eD2) {}
      }
      try {
        if (recMedia.state !== "inactive") recMedia.stop();
      } catch (e) {}
      recMedia = null;
    }
    if (recStream) {
      try {
        recStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e2) {}
      recStream = null;
    }
    if (discard) {
      recChunks = [];
      recPcmChunks = [];
    }
  }

  function acceptRecordedVoice(destNow, buf, mimeOut) {
    if (!buf || !buf.byteLength) {
      if (recHold) { var f0 = recHold; recHold = null; f0(null); }
      finishVoiceReady(null);
      toast("Aucun son capté. Autorise le micro et réessaie.");
      return;
    }
    var payload = { buf: buf, mime: playableMime(mimeOut) };
    if (destNow === "rapide") {
      pendingTxVoice = payload;
      if ($("tx-rapide-voix-status")) {
        $("tx-rapide-voix-status").hidden = false;
        $("tx-rapide-voix-status").textContent = "Vocal prêt — Envoyer";
      }
      if ($("btn-tx-rapide-voix")) $("btn-tx-rapide-voix").textContent = "Vocal prêt";
    } else if (destNow === "reply") {
      pendingReplyVoice = payload;
      var replyBtn = document.querySelector(".btn-reply-voix");
      if (replyBtn) replyBtn.textContent = "Vocal prêt";
    }
    if (recHold) {
      var fn = recHold;
      recHold = null;
      fn(payload);
      finishVoiceReady(payload);
      if (destNow === "rapide" || destNow === "reply") return;
    } else {
      finishVoiceReady(payload);
    }
    if (destNow === "msg") {
      addMsgVoice(buf, payload.mime, 0);
      return;
    }
    if (destNow === "rapide" || destNow === "reply") {
      toast("Vocal prêt. Appuie sur Envoyer.");
      return;
    }
    var day = todayISO();
    var itemId = uid();
    addVoiceBlob(day, buf, payload.mime, { itemId: itemId }).then(function (vid) {
      if (!vid) {
        toast("Vocal non enregistré (synchro). Réessaie.");
        return;
      }
      var rec = ensureDayTx(day);
      rec.items.push({
        id: itemId,
        from: (localDisplayName() || "").slice(0, 24),
        text: "Vocal",
        t: Date.now(),
        updatedAt: Date.now(),
        voiceId: vid
      });
      bumpDayTx(day);
      persist(true);
      renderTransmissions();
      toast("Vocal ajouté");
    });
  }

  function pullMicSamples() {
    if (!recAnalyser) return;
    var n = recAnalyser.fftSize || 2048;
    var arr = new Float32Array(n);
    try {
      if (typeof recAnalyser.getFloatTimeDomainData === "function") {
        recAnalyser.getFloatTimeDomainData(arr);
      } else {
        var bytes = new Uint8Array(n);
        recAnalyser.getByteTimeDomainData(bytes);
        var i;
        for (i = 0; i < n; i++) arr[i] = (bytes[i] - 128) / 128;
      }
      recPcmChunks.push(arr);
    } catch (ePull) {}
  }

  function finalizeMediaChunks(destNow, type) {
    // Derniers échantillons analyseur
    try { pullMicSamples(); pullMicSamples(); } catch (eLast) {}
    var pcm = recPcmChunks.slice();
    var rate = recPcmRate || (recAudioCtx && recAudioCtx.sampleRate) || 44100;
    var mediaChunks = recChunks.slice();
    var lasted = recStarted ? (Date.now() - recStarted) : 0;
    recPcmChunks = [];
    recChunks = [];
    recActive = false;
    stopVoixRec(false);

    function failEmpty() {
      if (recHold) { var early = recHold; recHold = null; early(null); }
      finishVoiceReady(null);
      toast("Vocal vide (pcm " + pcm.length + "). Réessaie 3 s.");
    }

    if (pcm.length) {
      var samples = mergeFloatChunks(pcm);
      samples = downsampleMono(samples, rate, 16000);
      // Accepte dès ~0,05 s, ou dès 0,5 s de durée murale
      if (samples && (samples.length >= 800 || (lasted >= 500 && samples.length >= 160))) {
        var wav = samplesToWav(samples, 16000);
        if (wav && wav.byteLength > 80) {
          acceptRecordedVoice(destNow, wav, "audio/wav");
          return;
        }
      }
    }

    var blob = new Blob(mediaChunks, { type: type || "audio/webm" });
    if (blob && blob.size > 0) {
      blobToArrayBuffer(blob).then(function (raw) {
        acceptRecordedVoice(destNow, raw, type || blob.type || "audio/webm");
      }).catch(failEmpty);
      return;
    }
    failEmpty();
  }

  async function publishVoice(id) {
    if (!key || !meta || !voiceBlobs[id]) return;
    var blob = voiceBlobs[id];
    try {
      var body = { id: id, mime: blob.mime, audio: blob.b64 };
      var env = await sealState(body);
      env.kind = "voix";
      env.vid = id;
      var payload = JSON.stringify(env);
      if (mqttHandle && mqttHandle.publishTo) mqttHandle.publishTo("voix/" + id, payload, true);
      if (secu && secu.old && !secu.closed && mqttHandle && mqttHandle.publishRaw && !oldVoiceIds[id]) {
        /* Transition : copie lisible par les téléphones encore en 1.90. */
        var envOld = await encryptState(body, secu.old.key, unb64(secu.old.salt));
        envOld.kind = "voix";
        envOld.vid = id;
        if (mqttHandle.publishRaw("tournee/" + secu.old.topic + "/voix/" + id, JSON.stringify(envOld), true)) oldVoiceIds[id] = true;
      }
    } catch (e) {}
  }

  async function applyVoiceEnv(env) {
    if (!env || !env.ct) return;
    if (!unlocked || !key) { pendingVoix.push(env); return; }
    try {
      var aes = key;
      if (!secu && env.salt && meta && env.salt !== meta.salt) {
        if (!sessionPin) return;
        aes = await deriveKey(sessionPin, unb64(env.salt));
      }
      var data = await decryptEnvelope(env, aes);
      await applyVoiceData(data);
    } catch (e) {}
  }

  async function applyVoiceData(data) {
    try {
      if (!data || !data.id || !data.audio) return;
      voiceBlobs[data.id] = { mime: playableMime(data.mime || "audio/webm"), b64: data.audio };
      try {
        var u8v = unb64(data.audio);
        var filev = new Blob([u8v], { type: playableMime(data.mime || "audio/webm") });
        voiceBlobs[data.id].blob = filev;
        voiceBlobs[data.id].url = URL.createObjectURL(filev);
      } catch (eBlob) {}
      if (currentTab === "transmissions" || ($("modal-planning") && !$("modal-planning").hidden)) {
        renderVoixLists();
        renderTransmissions();
      }
      if (currentTab === "messages") renderMessages();
    } catch (e) {}
  }

  function voiceUrl(id) {
    var b = voiceBlobs[id];
    if (!b) return "";
    if (b.url) return b.url;
    if (!b.b64) return "";
    try {
      var u8 = unb64(b.b64);
      var blob = new Blob([u8], { type: playableMime(b.mime) });
      b.url = URL.createObjectURL(blob);
      return b.url;
    } catch (e) { return ""; }
  }

  var voicePlayers = [];

  function stopVoicePlayers() {
    voicePlayers.forEach(function (a) {
      try { a.pause(); } catch (e) {}
    });
  }

  var sharedVoiceAudio = null;

  function sharedPlayer() {
    if (!sharedVoiceAudio) {
      sharedVoiceAudio = document.createElement("audio");
      sharedVoiceAudio.setAttribute("playsinline", "true");
      sharedVoiceAudio.setAttribute("webkit-playsinline", "true");
      sharedVoiceAudio.preload = "auto";
      sharedVoiceAudio.style.cssText = "position:fixed;left:-999px;width:1px;height:1px;";
      document.body.appendChild(sharedVoiceAudio);
    }
    return sharedVoiceAudio;
  }

  var voicePlay = { id: "", src: null, started: 0, offset: 0, timer: 0, ui: null };

  function fmtVoix(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var ss = sec % 60;
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function paintListen(ui, cur, dur, on) {
    if (!ui) return;
    var time = ui.querySelector(".voix-listen-time");
    var bars = ui.querySelectorAll("i");
    if (time) time.textContent = fmtVoix(cur) + (dur ? " / " + fmtVoix(dur) : "");
    var n = bars.length || 1;
    var cut = dur ? Math.round((cur / dur) * n) : 0;
    var i;
    for (i = 0; i < bars.length; i++) bars[i].classList.toggle("on", on && i < cut);
    if (ui._btn) ui._btn.textContent = on ? "Pause" : "Écouter";
  }

  function stopVoicePlay(resetUi) {
    if (voicePlay.timer) clearInterval(voicePlay.timer);
    voicePlay.timer = 0;
    if (voicePlay.src) {
      try { voicePlay.src.stop(); } catch (e) {}
      voicePlay.src = null;
    }
    if (sharedVoiceAudio) {
      try { sharedVoiceAudio.pause(); } catch (e2) {}
    }
    if (resetUi && voicePlay.ui) paintListen(voicePlay.ui, 0, voicePlay.dur || 0, false);
    voicePlay.id = "";
    voicePlay.ui = null;
  }

  function tickVoice() {
    var dur = voicePlay.dur || 0;
    var cur = voicePlay.offset || 0;
    if (voicePlay.ctx) cur = voicePlay.offset + (voicePlay.ctx.currentTime - voicePlay.started);
    else if (sharedVoiceAudio) cur = sharedVoiceAudio.currentTime || 0;
    if (dur && cur >= dur) {
      stopVoicePlay(true);
      return;
    }
    paintListen(voicePlay.ui, cur, dur, true);
  }

  function playViaBuffer(id, btn, ui, mime) {
    var b = voiceBlobs[id];
    if (!b || !b.b64) return Promise.reject(new Error("no"));
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("noctx"));
    if (!recAudioCtx) recAudioCtx = new AC();
    var ctx = recAudioCtx;
    return ctx.resume().then(function () {
      var u8 = unb64(b.b64);
      var raw = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      return ctx.decodeAudioData(raw);
    }).then(function (audioBuf) {
      stopVoicePlay(true);
      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      voicePlay.id = id;
      voicePlay.src = src;
      voicePlay.ctx = ctx;
      voicePlay.started = ctx.currentTime;
      voicePlay.offset = 0;
      voicePlay.dur = audioBuf.duration || 0;
      voicePlay.ui = ui;
      src.onended = function () { if (voicePlay.id === id) stopVoicePlay(true); };
      src.start(0);
      paintListen(ui, 0, voicePlay.dur, true);
      voicePlay.timer = setInterval(tickVoice, 200);
    });
  }

  function playStoredVoice(id, btn, ui) {
    var b = voiceBlobs[id];
    var url = voiceUrl(id);
    if (!b && !url) {
      toast("Vocal pas encore arrivé.");
      return;
    }
    var mime = playableMime((b && b.mime) || "audio/wav");
    if (voicePlay.id === id) {
      stopVoicePlay(true);
      return;
    }
    stopVoicePlay(false);
    if (ui) ui._btn = btn;
    if (isIos() && mime.indexOf("webm") >= 0) {
      toast("Ancien vocal Android. Enregistre-en un nouveau.");
      return;
    }
    if (!url && b && b.b64) {
      try {
        var u8 = unb64(b.b64);
        var file = new Blob([u8], { type: mime });
        b.blob = file;
        b.url = URL.createObjectURL(file);
        url = b.url;
      } catch (eUrl) {}
    }
    if (!url) {
      toast("Vocal pas encore arrivé.");
      return;
    }
    var audio = sharedPlayer();
    try { audio.pause(); } catch (eP) {}
    audio.muted = false;
    audio.volume = 1;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.src = url;
    try { audio.load(); } catch (eL) {}
    voicePlay.id = id;
    voicePlay.ui = ui;
    voicePlay.ctx = null;
    voicePlay.src = null;
    voicePlay.dur = 0;
    function arm() {
      var d = audio.duration;
      if (d && isFinite(d) && d > 0) voicePlay.dur = d;
      paintListen(ui, audio.currentTime || 0, voicePlay.dur, true);
      if (!voicePlay.timer) voicePlay.timer = setInterval(tickVoice, 200);
    }
    audio.onloadedmetadata = arm;
    audio.ontimeupdate = arm;
    audio.onended = function () { if (voicePlay.id === id) stopVoicePlay(true); };
    audio.onerror = function () {
      playViaBuffer(id, btn, ui, mime).catch(function () {
        toast("Impossible de lire ce vocal. Enregistre-en un nouveau.");
      });
    };
    var play = audio.play();
    if (play && play.then) {
      play.then(arm).catch(function () {
        playViaBuffer(id, btn, ui, mime).catch(function () {
          toast("Impossible de lire ce vocal. Enregistre-en un nouveau.");
        });
      });
    } else arm();
  }

  var recAudioCtx = null;
  var recAnalyser = null;
  var recLevels = [];
  var recPcmChunks = [];
  var recPcmNode = null;
  var recPcmSource = null;
  var recPcmGain = null;
  var recPcmRate = 0;
  var recActive = false;

  function voiceLevel() {
    if (!recAnalyser) return 0.35;
    var arr = new Uint8Array(recAnalyser.fftSize);
    recAnalyser.getByteTimeDomainData(arr);
    var i, sum = 0;
    for (i = 0; i < arr.length; i++) {
      var v = (arr[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / arr.length) * 4);
  }

  function paintRecLine(show, text) {
    ["voix-rec-line", "voix-rec-line-rapide"].forEach(function (id) {
      var line = $(id);
      if (!line) return;
      var on = !!show && ((id === "voix-rec-line" && recDest === "tx") || (id === "voix-rec-line-rapide" && recDest === "rapide"));
      line.hidden = !on;
      if (!on) return;
      var clock = line.querySelector(".voix-rec-time");
      var bars = line.querySelector(".voix-rec-bars");
      var mmss = String(text || "0:00").split(" / ")[0];
      if (clock) clock.textContent = mmss || "0:00";
      if (bars) {
        var i = document.createElement("i");
        var h = 6 + Math.round(voiceLevel() * 20);
        i.style.height = h + "px";
        bars.appendChild(i);
        while (bars.childNodes.length > 28) bars.removeChild(bars.firstChild);
      }
    });
    var replyLine = document.querySelector(".tx-reply-box .voix-rec-line");
    if (recDest === "reply" && show) {
      if (!replyLine) {
        var box = document.querySelector(".tx-reply-box");
        if (box) {
          replyLine = document.createElement("div");
          replyLine.className = "voix-rec-line";
          replyLine.innerHTML = '<span class="voix-rec-dot"></span><span class="voix-rec-time">0:00</span><span class="voix-rec-bars"></span>';
          box.insertBefore(replyLine, box.firstChild);
        }
      }
      if (replyLine) {
        replyLine.hidden = false;
        var clock2 = replyLine.querySelector(".voix-rec-time");
        var bars2 = replyLine.querySelector(".voix-rec-bars");
        if (clock2) clock2.textContent = String(text || "0:00").split(" / ")[0];
        if (bars2) {
          var b = document.createElement("i");
          b.style.height = (6 + Math.round(voiceLevel() * 20)) + "px";
          bars2.appendChild(b);
          while (bars2.childNodes.length > 28) bars2.removeChild(bars2.firstChild);
        }
      }
    } else if (replyLine) replyLine.hidden = true;
  }

  function appendVoicePlay(row, id) {
    var url = voiceUrl(id);
    if (!url) {
      var wait = document.createElement("span");
      wait.className = "voix-wait";
      wait.textContent = "Vocal en cours de synchro…";
      row.appendChild(wait);
      return;
    }
    var listen = document.createElement("div");
    listen.className = "voix-listen";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voix-play";
    btn.textContent = "Écouter";
    var bars = document.createElement("span");
    bars.className = "voix-listen-bars";
    var i;
    for (i = 0; i < 24; i++) {
      var bar = document.createElement("i");
      bar.style.height = (8 + ((i * 5) % 14)) + "px";
      bars.appendChild(bar);
    }
    var time = document.createElement("span");
    time.className = "voix-listen-time";
    time.textContent = "0:00";
    listen.appendChild(btn);
    listen.appendChild(bars);
    listen.appendChild(time);
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      playStoredVoice(id, btn, listen);
    });
    listen.addEventListener("click", function (ev) {
      if (ev.target === btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      playStoredVoice(id, btn, listen);
    });
    row.appendChild(listen);
  }

  function ensureDayTx(day) {
    ensureTx();
    if (!state.transmissions[day]) state.transmissions[day] = { text: "", updatedAt: 0, voices: [], items: [] };
    if (!state.transmissions[day].voices) state.transmissions[day].voices = [];
    if (!state.transmissions[day].items) state.transmissions[day].items = [];
    return state.transmissions[day];
  }

  var pendingTxVoice = null;
  var pendingReplyVoice = null;
  var txReplyTo = "";
  var txReplyDay = "";
  var txReplyParent = null;
  var recHold = null;
  var txSending = false;
  var voiceReadyPromise = null;
  var voiceReadyResolve = null;
  var voiceReadyDest = "";

  function beginVoiceReady(dest) {
    if (voiceReadyResolve) finishVoiceReady(null);
    voiceReadyDest = dest || "";
    voiceReadyPromise = new Promise(function (resolve) {
      voiceReadyResolve = resolve;
    });
    return voiceReadyPromise;
  }

  function finishVoiceReady(payload) {
    if (voiceReadyResolve) {
      var r = voiceReadyResolve;
      voiceReadyResolve = null;
      r(payload || null);
    }
  }

  function awaitVoiceReady(dest) {
    return new Promise(function (resolve) {
      var pending = dest === "rapide" ? pendingTxVoice : (dest === "reply" ? pendingReplyVoice : null);
      if (pending && pending.buf) {
        resolve(pending);
        return;
      }
      var recording = isVoixRecording() && recDest === dest;
      var preparing = !!(voiceReadyResolve && voiceReadyDest === dest);
      if (!recording && !preparing) {
        resolve(pending || null);
        return;
      }
      if (!preparing) beginVoiceReady(dest);
      var p = voiceReadyPromise;
      var done = false;
      function once(v) {
        if (done) return;
        done = true;
        var got = v || (dest === "rapide" ? pendingTxVoice : pendingReplyVoice) || null;
        resolve(got && got.buf ? got : null);
      }
      if (p) p.then(once).catch(function () { once(null); });
      else once(null);
      if (recording) {
        recHold = function (payload) {
          recHold = null;
          if (dest === "rapide" && payload && payload.buf) pendingTxVoice = payload;
          if (dest === "reply" && payload && payload.buf) pendingReplyVoice = payload;
          finishVoiceReady(payload);
        };
        recActive = false;
        try {
          if (recMedia && typeof recMedia.requestData === "function") recMedia.requestData();
        } catch (eReq) {}
        setTimeout(function () {
          try {
            if (recMedia && recMedia.state === "recording") recMedia.stop();
            else finalizeMediaChunks(dest, "audio/wav");
          } catch (e2) {
            try { finalizeMediaChunks(dest, "audio/wav"); }
            catch (e3) {
              if (recHold) { var fn2 = recHold; recHold = null; fn2(null); }
              finishVoiceReady(null);
            }
          }
        }, 280);
      }
    });
  }

  function requestVoixBlob(dest) {
    return awaitVoiceReady(dest);
  }

  async function addVoiceBlob(day, buf, mime, extra) {
    if (!unlocked || !key) return;
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    if (!buf || buf.byteLength > VOIX_MAX_BYTES) {
      toast("Vocal trop lourd. Raccourcis-le.");
      return;
    }
    var rec = ensureDayTx(day);
    if (liveVoices(rec.voices).length >= VOIX_MAX_DAY) {
      toast("Maximum " + VOIX_MAX_DAY + " vocaux pour aujourd’hui.");
      return;
    }
    var id = uid();
    var cleanMime = playableMime(mime);
    var file = new Blob([buf], { type: cleanMime });
    voiceBlobs[id] = { mime: cleanMime, b64: b64(buf), blob: file };
    try { voiceBlobs[id].url = URL.createObjectURL(file); } catch (eUrl) {}
    rec.voices.push({
      id: id,
      createdAt: Date.now(),
      mime: cleanMime,
      from: (localDisplayName() || "").slice(0, 24),
      itemId: (extra && extra.itemId) || ""
    });
    rec.updatedAt = Date.now();
    lastTxMap[day] = rec.updatedAt;
    lastTxReady = true;
    markTxSeen();
    await publishVoice(id);
    persist(true);
    syncWatchToIdb();
    renderVoixLists();
    renderTxResume();
    return id;
  }

  function deleteVoice(day, id) {
    var rec = ensureDayTx(day);
    rec.voices = (rec.voices || []).map(function (v) {
      if (v.id === id) return { id: v.id, createdAt: v.createdAt, mime: v.mime, deletedAt: Date.now() };
      return v;
    });
    rec.updatedAt = Date.now();
    lastTxMap[day] = rec.updatedAt;
    markTxSeen();
    delete voiceBlobs[id];
    persist(true);
    if (mqttHandle && mqttHandle.publishTo) mqttHandle.publishTo("voix/" + id, "{}", true);
    renderVoixLists();
    renderTxResume();
  }

  function renderVoixInto(box, day, waitMsg) {
    if (!box) return;
    box.innerHTML = "";
    var rec = (state.transmissions && state.transmissions[day]) || {};
    liveVoices(rec.voices).forEach(function (v) {
      if (v.itemId) return;
      var row = document.createElement("div");
      row.className = "voix-item";
      appendVoicePlay(row, v.id);
      var who = document.createElement("span");
      who.className = "tx-from-name";
      who.textContent = v.from || "";
      if (who.textContent) row.appendChild(who);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "voix-del";
      del.setAttribute("aria-label", "Supprimer le vocal");
      del.textContent = "×";
      if (v.from && samePerson(v.from, localDisplayName())) {
        del.addEventListener("click", function () { deleteVoice(day, v.id); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  function renderVoixLists() {
    renderVoixInto($("voix-list"), todayISO());
    var hist = $("tx-history");
    if (hist) {
      Array.prototype.forEach.call(hist.querySelectorAll("[data-voix-day]"), function (el) {
        renderVoixInto(el, el.getAttribute("data-voix-day"));
      });
    }
    if ($("modal-planning") && !$("modal-planning").hidden && planEditingIso) {
      fillPlanDayTx(planEditingIso);
    }
  }


  function samplesToWav(samples, sampleRate) {
    var n = samples.length;
    var out = new ArrayBuffer(44 + n * 2);
    var view = new DataView(out);
    function put(o, str) {
      var i;
      for (i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i));
    }
    put(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    put(8, "WAVE");
    put(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    put(36, "data");
    view.setUint32(40, n * 2, true);
    var off = 44;
    var i;
    for (i = 0; i < n; i++) {
      var x = samples[i];
      if (x > 1) x = 1;
      if (x < -1) x = -1;
      view.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
      off += 2;
    }
    return out;
  }

  function monoSamples(audio) {
    var chN = audio.numberOfChannels || 1;
    var left = audio.getChannelData(0);
    if (chN === 1) return left;
    var out = new Float32Array(left.length);
    var i, j, sum;
    for (i = 0; i < left.length; i++) {
      sum = 0;
      for (j = 0; j < chN; j++) sum += audio.getChannelData(j)[i] || 0;
      out[i] = sum / chN;
    }
    return out;
  }

  function toSharedVoice(buf, mime) {
    var m = playableMime(mime);
    var original = { buf: buf, mime: m };
    if (m.indexOf("mp4") >= 0 || m.indexOf("wav") >= 0 || m.indexOf("mpeg") >= 0 || m.indexOf("aac") >= 0) {
      return Promise.resolve(original);
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(original);
    var ctx = new AC();
    var u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf);
    var copy = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    var kick = (ctx.state === "suspended" && ctx.resume) ? ctx.resume() : Promise.resolve();
    return kick.then(function () {
      return ctx.decodeAudioData(copy);
    }).then(function (audio) {
      var rate = 16000;
      var samples = monoSamples(audio);
      if (audio.sampleRate && audio.sampleRate !== rate) {
        var ratio = audio.sampleRate / rate;
        var len = Math.max(1, Math.floor(samples.length / ratio));
        var down = new Float32Array(len);
        var i, idx;
        for (i = 0; i < len; i++) {
          idx = Math.min(samples.length - 1, Math.floor(i * ratio));
          down[i] = samples[idx];
        }
        samples = down;
      }
      var wav = samplesToWav(samples, rate);
      try { ctx.close(); } catch (eC) {}
      if (!wav || wav.byteLength < 100 || wav.byteLength > VOIX_MAX_BYTES) return original;
      return { buf: wav, mime: "audio/wav" };
    }).catch(function () {
      try { ctx.close(); } catch (eClose) {}
      return original;
    });
  }

  async function toggleVoixRec(dest) {
    dest = dest === "msg" || dest === "rapide" || dest === "reply" ? dest : "tx";
    if (dest === "tx" || dest === "rapide" || dest === "reply") {
      toast("Les vocaux sont désactivés. Envoie un mémo écrit.");
      return;
    }
    if (isVoixRecording()) {
      // Arrêt : fige le PCM, demande les chunks media, puis stop
      recActive = false;
      try {
        if (recMedia && typeof recMedia.requestData === "function") recMedia.requestData();
      } catch (eRd) {}
      setTimeout(function () {
        try {
          if (recMedia && recMedia.state === "recording") {
            recMedia.stop();
          } else {
            // Pas de MediaRecorder : finalise avec PCM seul
            finalizeMediaChunks(recDest, "audio/wav");
          }
        } catch (eSt) {
          finalizeMediaChunks(recDest, "audio/wav");
        }
      }, 280);
      return;
    }
    recDest = dest;
    if (dest === "rapide") pendingTxVoice = null;
    if (dest === "reply") pendingReplyVoice = null;
    if (dest === "rapide" || dest === "reply") beginVoiceReady(dest);
    recStarted = Date.now();
    setVoixStatus("0:00 / 2:00", true);
    function abortVoiceStart(msg) {
      setVoixStatus("", false);
      if (msg) toast(msg);
      if (dest === "rapide" || dest === "reply") finishVoiceReady(null);
    }
    if (!localDisplayName()) {
      openPrenomModal(false);
      abortVoiceStart("Indiquez un prénom.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      abortVoiceStart("Micro indisponible sur ce téléphone.");
      return;
    }
    var day = todayISO();
    if (dest === "tx" && liveVoices((ensureDayTx(day).voices)).length >= VOIX_MAX_DAY) {
      abortVoiceStart("Maximum " + VOIX_MAX_DAY + " vocaux pour aujourd’hui.");
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      abortVoiceStart("Les vocaux ne sont pas supportés ici.");
      return;
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      });
    } catch (e) {
      try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        abortVoiceStart("Autorise le micro pour enregistrer.");
        return;
      }
    }
    recChunks = [];
    recPcmChunks = [];
    recActive = false;
    recMedia = null;

    // Contexte audio frais (évite suspended)
    try {
      if (recAudioCtx && recAudioCtx.state !== "closed") {
        try { await recAudioCtx.close(); } catch (eCl) {}
      }
    } catch (eCl2) {}
    try { recAudioCtx = new AC(); } catch (eAc) { recAudioCtx = null; }
    if (!recAudioCtx) {
      abortVoiceStart("Les vocaux ne sont pas supportés ici.");
      try { recStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e3) {}
      recStream = null;
      return;
    }
    try { await recAudioCtx.resume(); } catch (eRs) {}
    recPcmRate = recAudioCtx.sampleRate || 44100;

    // Capture micro : analyseur (toujours) + ScriptProcessor si dispo + MediaRecorder secours
    try {
      recPcmSource = recAudioCtx.createMediaStreamSource(recStream);
      recAnalyser = recAudioCtx.createAnalyser();
      recAnalyser.fftSize = 2048;
      recAnalyser.smoothingTimeConstant = 0;
      recPcmSource.connect(recAnalyser);
      // Grappe audio vivante (iOS)
      try {
        recPcmGain = recAudioCtx.createGain();
        recPcmGain.gain.value = 0.0001;
        recPcmSource.connect(recPcmGain);
        recPcmGain.connect(recAudioCtx.destination);
      } catch (eGain) {}
      // ScriptProcessor en plus si encore supporté
      if (typeof recAudioCtx.createScriptProcessor === "function") {
        try {
          recPcmNode = recAudioCtx.createScriptProcessor(4096, 1, 1);
          recPcmNode.onaudioprocess = function (ev) {
            if (!recActive) return;
            var input = ev.inputBuffer.getChannelData(0);
            if (!input || !input.length) return;
            recPcmChunks.push(new Float32Array(input));
          };
          recPcmSource.connect(recPcmNode);
          if (recPcmGain) recPcmNode.connect(recPcmGain);
          else {
            var g2 = recAudioCtx.createGain();
            g2.gain.value = 0.0001;
            recPcmNode.connect(g2);
            g2.connect(recAudioCtx.destination);
            recPcmGain = g2;
          }
        } catch (eSp) { recPcmNode = null; }
      }
    } catch (ePcm) {
      abortVoiceStart("Enregistrement impossible.");
      try { recStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e4) {}
      recStream = null;
      return;
    }

    if (window.MediaRecorder) {
      var mime = pickVoixMime();
      try {
        recMedia = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
      } catch (eMr) {
        try { recMedia = new MediaRecorder(recStream); } catch (eMr2) { recMedia = null; }
      }
      if (recMedia) {
        var chosenType = recMedia.mimeType || mime || "audio/webm";
        recMedia.ondataavailable = function (ev) {
          if (ev && ev.data && ev.data.size > 0) recChunks.push(ev.data);
        };
        recMedia.onstop = function () {
          var destNow = recDest;
          setTimeout(function () {
            finalizeMediaChunks(destNow, chosenType);
          }, 150);
        };
        try { recMedia.start(100); } catch (eStart) {
          try { recMedia.start(); } catch (eStart2) { recMedia = null; }
        }
      }
    }

    recActive = true;
    recStarted = Date.now();
    setVoixStatus("0:00 / 2:00", true);
    pullMicSamples();
    // Intervalle ≈ durée d’une fenêtre analyseur
    var hop = Math.max(30, Math.floor(1000 * (recAnalyser.fftSize || 2048) / (recPcmRate || 44100)) - 2);
    recTimer = setInterval(function () {
      if (recActive) pullMicSamples();
      var ms = Date.now() - recStarted;
      if (ms >= VOIX_MAX_MS) {
        recActive = false;
        try {
          if (recMedia && typeof recMedia.requestData === "function") recMedia.requestData();
        } catch (eM) {}
        setTimeout(function () {
          try {
            if (recMedia && recMedia.state === "recording") recMedia.stop();
            else finalizeMediaChunks(recDest, "audio/wav");
          } catch (eM2) {
            finalizeMediaChunks(recDest, "audio/wav");
          }
        }, 200);
        return;
      }
      var s = Math.floor(ms / 1000);
      var mm = Math.floor(s / 60);
      var ss = s % 60;
      setVoixStatus(mm + ":" + (ss < 10 ? "0" : "") + ss + " / 2:00", true);
    }, hop);
  }

  function bumpDayTx(day) {
    var rec = ensureDayTx(day);
    rec.updatedAt = Date.now();
    lastTxMap[day] = rec.updatedAt;
    lastTxReady = true;
    markTxSeen();
  }

  var txRapidePid = "";

  /* —— Photos de documents : chiffrées avec la clé du cabinet, une copie chiffrée dans l’IndexedDB de chaque téléphone.
     1.96 (prototype) : réplication de téléphone à téléphone pour tout le cabinet (associés et remplaçants).
     - L’état synchronisé ne porte que des métadonnées (id, patient, type, dates, empreinte, qui l’a), chiffrées avec lui.
     - L’image voyage en morceaux chiffrés (clé du cabinet) sur « …/ph », jamais retained : rien ne reste sur les relais.
     - Un téléphone qui revient demande ce qui lui manque ; n’importe quel téléphone qui a la photo la renvoie.
     - Accès / clé et carte vitale : expiration fixée à la création (90 jours, ou fin d’ordonnance si plus tôt),
       identique sur toutes les copies, jamais prolongée.
     - 1.99 : photo d’ordonnance → plus de limite de 90 jours ; elle vit jusqu’à la fin de l’ordonnance de la fiche
       (la plus tardive des dates de fin postérieures à la prise ; 90 jours s’il n’y en a pas). Recalculée à chaque
       évaluation depuis la fiche patient (synchronisée, dernière modification gagnante) : si la date change, tous les
       téléphones suivent. L’« exp » de l’état n’y sert que d’horizon de nettoyage (il ne fait que grandir) ; une
       expiration d’ordonnance efface la copie locale sans pierre tombale (une fiche pas encore à jour ne doit pas
       effacer la photo partout ; si la date est prolongée ensuite, le téléphone la redemande).
     - Suppression = pierre tombale chiffrée dans l’état ; rien d’expiré ou supprimé n’est renvoyé.
     Cabinet pas encore sécurisé (clé dérivée du PIN) : comportement d’avant, photos sur ce téléphone uniquement. —— */
  var PH_MAX = 6;
  var PH_DAYS = 90;
  var PH_TYPES = { acces: "Accès / clé", ordo: "Ordonnance", vitale: "Carte vitale" };
  var PH_CHUNK = 16384;
  var PH_SRC = randHex(6);
  var phPendingType = "";
  var phRenderSeq = 0;
  var phRx = {};
  var phSending = {};
  var phSeenOther = {};
  var phWantAt = 0;
  var phSweepTimer = null;
  var phLastSig = "";

  function phSyncOn() {
    return !!(unlocked && secu && secu.ck && state && !isKicked());
  }
  function phIsOrdo(r) {
    return !!(r && r.type === "ordo");
  }
  /* 1.99 — photo d’ordonnance : fin de l’ordonnance de la fiche (fin de journée). Si la fiche a 2 ordonnances (1.95),
     on garde la plus tardive des deux qui tombe après la prise de la photo (on ne sait pas laquelle est photographiée :
     la photo reste tant qu’une ordonnance en cours la couvre). Aucune date (ou seulement des dates passées au moment
     de la prise) : 90 jours après la prise. */
  function phOrdoExp(rec, p) {
    var at = Number(rec && rec.at) || 0;
    var ends = ordoDateList(p).map(function (d) { return parseISODate(d).getTime() + 86400000 - 1; }).filter(function (end) {
      return end >= at;
    });
    return ends.length ? Math.max.apply(null, ends) : at + PH_DAYS * 86400000;
  }
  function phPatientOf(pid) {
    return state && state.patients && pid ? patientById(pid) : null;
  }
  /* Expiration d’une entrée de l’état. Ordonnance : recalculée depuis la fiche si on l’a ; sinon la valeur stockée. */
  function phMetaExp(m, p) {
    if (!m) return 0;
    var stored = Number(m.exp) || 0;
    if (m.del || !phIsOrdo(m)) return stored;
    if (p === undefined) p = phPatientOf(m.pid);
    return p ? phOrdoExp(m, p) : stored;
  }
  function phAlive(m, now) {
    return !!(m && !m.del && phMetaExp(m) > (now || Date.now()));
  }
  function phCleanHas(h) {
    var byFold = {};
    Object.keys(h || {}).forEach(function (n) {
      var name = String(n || "").trim().slice(0, 24);
      var t = Number(h[n]) || 0;
      var f = foldName(name);
      if (!f || !t) return;
      if (!byFold[f] || t > byFold[f].t) byFold[f] = { name: name, t: t };
    });
    var out = {};
    Object.keys(byFold).slice(0, 12).forEach(function (f) { out[byFold[f].name] = byFold[f].t; });
    return out;
  }
  function phCleanMeta(m) {
    var id = String(m.id || "");
    if (!/^[0-9a-f]{12}$/.test(id)) return null;
    var exp = Number(m.exp) || 0;
    var pid = String(m.pid || "").slice(0, 64);
    if (m.del) return { id: id, pid: pid, exp: exp, del: Number(m.del) || 1 };
    return {
      id: id,
      pid: pid,
      type: PH_TYPES[m.type] ? m.type : "acces",
      at: Number(m.at) || 0,
      exp: exp,
      by: String(m.by || "").slice(0, 24),
      h: String(m.h || "").replace(/[^0-9a-f]/g, "").slice(0, 32),
      has: phCleanHas(m.has)
    };
  }
  /* Fusion : la pierre tombale gagne, l’expiration ne peut que raccourcir, l’expiré disparaît de l’état.
     1.99 : photo d’ordonnance vivante → « exp » = horizon de nettoyage, le plus grand des deux et de la fin
     d’ordonnance de la fiche fusionnée (patientOf) ; il ne fait que grandir, l’expiration réelle vient de la fiche. */
  function mergePhMeta(a, b, deleted, patientOf) {
    function ordoHorizon(m) {
      var p = patientOf ? patientOf(m.pid) : null;
      return p ? Math.max(Number(m.exp) || 0, phOrdoExp(m, p)) : (Number(m.exp) || 0);
    }
    var now = Date.now();
    var out = {};
    [a, b].forEach(function (src) {
      Object.keys(src || {}).forEach(function (id) {
        var raw = src[id];
        if (!raw || raw.id !== id) return;
        var cur = phCleanMeta(raw);
        if (cur && !cur.del && phIsOrdo(cur)) cur.exp = ordoHorizon(cur);
        if (!cur || !(cur.exp > now)) return;
        var prev = out[id];
        if (!prev) { out[id] = cur; return; }
        var exp = Math.min(prev.exp, cur.exp);
        if (!prev.del && !cur.del && phIsOrdo(prev) && phIsOrdo(cur)) exp = Math.max(prev.exp, cur.exp);
        if (prev.del || cur.del) {
          out[id] = { id: id, pid: prev.pid || cur.pid, exp: exp, del: Math.max(prev.del || 0, cur.del || 0) };
          return;
        }
        var has = {};
        [prev.has, cur.has].forEach(function (h) { Object.keys(h || {}).forEach(function (n) { has[n] = Math.max(has[n] || 0, h[n] || 0); }); });
        var keep = (cur.at || 0) && (cur.at < (prev.at || Infinity)) ? cur : prev;
        out[id] = { id: id, pid: keep.pid, type: keep.type, at: keep.at, exp: exp, by: keep.by, h: keep.h || prev.h || cur.h, has: phCleanHas(has) };
      });
    });
    Object.keys(out).forEach(function (id) {
      var m = out[id];
      if (!m.del && m.pid && deleted && deleted[m.pid] && deleted[m.pid] >= (m.at || 0)) {
        out[id] = { id: id, pid: m.pid, exp: m.exp, del: deleted[m.pid] };
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  function idbList(prefix) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        var out = [];
        var tx = db.transaction("kv", "readonly");
        var req = tx.objectStore("kv").openCursor();
        req.onsuccess = function () {
          var c = req.result;
          if (!c) return;
          if (String(c.key).indexOf(prefix) === 0) out.push({ k: c.key, v: c.value });
          c.continue();
        };
        tx.oncomplete = function () { db.close(); resolve(out); };
        tx.onerror = function () { db.close(); resolve(out); };
      });
    }).catch(function () { return []; });
  }
  function phExpiry(rec, p) {
    if (phIsOrdo(rec)) return phOrdoExp(rec, p);
    var lim = (rec.at || 0) + PH_DAYS * 86400000;
    var ends = ordoDateList(p).map(function (d) { return parseISODate(d).getTime() + 86400000 - 1; }).filter(function (end) {
      return end >= (rec.at || 0) && end < lim;
    });
    if (ends.length) lim = Math.max.apply(null, ends);
    return lim;
  }
  /* Expiration effective d’une copie : la plus proche entre la date fixée à la création, la règle 90 j / ordonnance,
     et celle de l’état du cabinet. Une copie reçue tard ne prolonge jamais rien. */
  function phEffExp(rec, p, m) {
    if (phIsOrdo(rec)) {
      /* 1.99 : ordonnance → la fiche décide (prolongation comprise) ; fiche pas encore reçue : la plus lointaine connue. */
      if (p) return phOrdoExp(rec, p);
      return Math.max(Number(rec.exp) || 0, m && !m.del ? phMetaExp(m, null) : 0) || phOrdoExp(rec, null);
    }
    var e = phExpiry(rec, p);
    if (Number(rec.exp) > 0) e = Math.min(e, Number(rec.exp));
    if (m && Number(m.exp) > 0) e = Math.min(e, Number(m.exp));
    return e;
  }
  /* Expiration affichée / vérifiée pour une entrée de l’état (copie pas encore reçue). */
  function phMetaEff(m, p) {
    if (phIsOrdo(m)) return phMetaExp(m, p || null);
    return Math.min(Number(m.exp) || 0, phExpiry(m, p));
  }
  function phTombstone(id, pid, exp) {
    if (!state.phMeta) state.phMeta = {};
    var m = state.phMeta[id];
    state.phMeta[id] = { id: id, pid: (m && m.pid) || pid || "", exp: Math.min((m && m.exp) || Infinity, exp || Infinity, Date.now() + PH_DAYS * 86400000), del: Date.now() };
  }
  async function purgePhotos() {
    var all = await idbList("ph:");
    var now = Date.now();
    var mm = (state && state.phMeta) || {};
    var changed = false;
    for (var i = 0; i < all.length; i++) {
      var r = all[i].v || {};
      var m = r.id ? mm[r.id] : null;
      var p = r.pid ? patientById(r.pid) : null;
      /* Patient pas encore reçu mais photo vivante dans l’état : on garde (il arrive avec l’état). */
      var gone = p ? isPatientGone(p) : !phAlive(m, now);
      var expired = now > phEffExp(r, p, m);
      /* 1.99 : copie d’ordonnance déjà partagée (empreinte) mais plus dans l’état = nettoyée partout : on l’efface aussi
         (évite qu’une date prolongée plus tard ne la fasse revivre sur ce seul téléphone). */
      var orphan = phIsOrdo(r) && !!r.h && !m && phSyncOn();
      if ((m && m.del) || gone || expired || orphan) {
        await idbDel(all[i].k);
        /* Pierre tombale : patient supprimé, ou expiration fixe (accès / carte vitale). Pas pour la fin d’ordonnance :
           chaque téléphone l’applique selon sa fiche, une fiche en retard ne doit rien effacer chez les autres. */
        if (phSyncOn() && m && !m.del && r.id && (gone || !phIsOrdo(r))) { phTombstone(r.id, r.pid, m.exp); changed = true; }
      }
    }
    if (state && state.phMeta) {
      Object.keys(state.phMeta).forEach(function (id) {
        var sm = state.phMeta[id];
        var e = Number(sm.exp) || 0;
        if (!sm.del && phIsOrdo(sm)) {
          /* Horizon de nettoyage d’une ordonnance : suit une date de fin prolongée (ne raccourcit jamais). */
          var sp = phPatientOf(sm.pid);
          var d = sp && !isPatientGone(sp) ? phOrdoExp(sm, sp) : 0;
          if (d > e) { sm.exp = e = d; changed = true; }
        }
        if (!(e > now)) { delete state.phMeta[id]; changed = true; }
      });
    }
    Object.keys(phRx).forEach(function (id) {
      if ((mm[id] && !phAlive(mm[id], now)) || (phRx[id].t || 0) < now - 120000) delete phRx[id];
    });
    if (changed && unlocked && key) persist(false);
    return changed;
  }
  async function phHashHex(u8) {
    var d = new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
    var s = "";
    for (var i = 0; i < 16; i++) s += ("0" + d[i].toString(16)).slice(-2);
    return s;
  }
  function phBlobOf(rec) {
    return concat(unb64(rec.iv), new Uint8Array(rec.ct));
  }
  async function phLocalIds(pid) {
    var list = await idbList(pid ? "ph:" + pid + ":" : "ph:");
    var out = {};
    list.forEach(function (x) { if (x.v && x.v.id) out[x.v.id] = x; });
    return out;
  }
  async function phCountFor(pid) {
    var ids = await phLocalIds(pid);
    var now = Date.now();
    Object.keys((state && state.phMeta) || {}).forEach(function (id) {
      var m = state.phMeta[id];
      if (m.pid === pid && phAlive(m, now)) ids[id] = true;
      else if (m.pid === pid && m.del) delete ids[id];
    });
    return Object.keys(ids).length;
  }
  function phNoteHave(id, t) {
    var me = localDisplayName();
    var m = state.phMeta && state.phMeta[id];
    if (!me || !phAlive(m)) return false;
    if (!m.has) m.has = {};
    var f = foldName(me);
    var known = Object.keys(m.has).some(function (n) { return foldName(n) === f; });
    if (known) return false;
    m.has[me] = t || Date.now();
    return true;
  }
  async function phSave(dataUrl, type) {
    if (!editingId || !key || !dataUrl) return false;
    if ((await phCountFor(editingId)) >= PH_MAX) { toast("6 photos maximum pour ce patient."); return false; }
    var bytes = unb64(dataUrl.split(",")[1] || "");
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes);
    var id = randHex(6);
    var at = Date.now();
    var me = localDisplayName() || "";
    var rec = { v: 1, pid: editingId, id: id, type: type, at: at, iv: b64(iv), ct: ct, by: me };
    rec.exp = phExpiry(rec, patientById(editingId));
    var sync = phSyncOn();
    if (sync) rec.h = await phHashHex(phBlobOf(rec));
    await idbPut("ph:" + editingId + ":" + id, rec);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (eP) {}
    if (sync) {
      if (!state.phMeta) state.phMeta = {};
      var has = {};
      if (me) has[me] = at;
      state.phMeta[id] = { id: id, pid: editingId, type: type, at: at, exp: rec.exp, by: me, h: rec.h, has: has };
      await persist(true);
      phPush(id);
    }
    return true;
  }
  /* Photos prises avant la réplication (1.91 → 1.95) : on les déclare au cabinet, avec leur expiration d’origine. */
  async function phAdoptLocal() {
    if (!phSyncOn()) return;
    var all = await idbList("ph:");
    var now = Date.now();
    var changed = false;
    if (!state.phMeta) state.phMeta = {};
    for (var i = 0; i < all.length; i++) {
      var r = all[i].v || {};
      if (!r.id || !r.pid || state.phMeta[r.id]) continue;
      if (phIsOrdo(r) && r.h) continue; /* déjà partagée puis nettoyée : pas de retour */
      var p = patientById(r.pid);
      if (!p || isPatientGone(p)) continue;
      var exp = phEffExp(r, p, null);
      if (exp <= now) continue;
      r.exp = exp;
      r.h = r.h || await phHashHex(phBlobOf(r));
      await idbPut(all[i].k, r);
      var who = r.by || localDisplayName() || "";
      var has = {};
      if (localDisplayName()) has[localDisplayName()] = now;
      state.phMeta[r.id] = { id: r.id, pid: r.pid, type: r.type, at: r.at, exp: exp, by: who, h: r.h, has: has };
      changed = true;
    }
    if (changed) persist(true);
  }
  function phPublish(obj) {
    if (!phSyncOn() || !mqttHandle || !mqttHandle.publishTo || !mqttLive) return Promise.resolve(false);
    obj.src = PH_SRC;
    return encV2(obj, secu.ck).then(function (env) {
      env.kind = "ph";
      return mqttHandle && mqttHandle.publishTo ? mqttHandle.publishTo("ph", JSON.stringify(env), false) : false;
    });
  }
  async function phPush(id) {
    if (!phSyncOn() || phSending[id]) return;
    var m = state.phMeta && state.phMeta[id];
    if (!phAlive(m)) return;
    var loc = (await phLocalIds(m.pid))[id];
    if (!loc || !loc.v || !loc.v.ct) return;
    var p = patientById(m.pid);
    if (Date.now() > phEffExp(loc.v, p, m)) return;
    phSending[id] = true;
    try {
      var blob = phBlobOf(loc.v);
      var n = Math.ceil(blob.length / PH_CHUNK);
      var hdr = { pid: m.pid, type: m.type, at: m.at, exp: phIsOrdo(m) ? Math.max(Number(m.exp) || 0, phMetaExp(m, p)) : m.exp, by: m.by, h: m.h };
      for (var i = 0; i < n; i++) {
        if (!phAlive(state.phMeta && state.phMeta[id])) break;
        var ok = await phPublish({ op: "chunk", id: id, i: i, n: n, m: hdr, d: b64(blob.subarray(i * PH_CHUNK, (i + 1) * PH_CHUNK)) });
        if (!ok) break;
        await new Promise(function (r) { setTimeout(r, 30); });
      }
    } catch (eS) {
    } finally {
      phSending[id] = false;
    }
  }
  async function phMissingIds() {
    var now = Date.now();
    var mine = await phLocalIds("");
    return Object.keys((state && state.phMeta) || {}).filter(function (id) {
      var m = state.phMeta[id];
      if (!phAlive(m, now) || mine[id]) return false;
      var p = patientById(m.pid);
      return !!p && !isPatientGone(p);
    });
  }
  async function phAskMissing(force) {
    if (!phSyncOn() || !mqttLive) return;
    var now = Date.now();
    if (!force && now - phWantAt < 15000) return;
    var ids = await phMissingIds();
    if (!ids.length) return;
    phWantAt = now;
    await phPublish({ op: "want", ids: ids.slice(0, 40) });
  }
  async function phOnMsg(env) {
    if (!phSyncOn() || !env || !env.ct || !env.iv) return;
    var o;
    try { o = await decryptEnvelope(env, secu.ck); } catch (eD) { return; }
    if (!o || o.src === PH_SRC) return;
    if (o.op === "want") phOnWant(o);
    else if (o.op === "chunk") await phOnChunk(o);
  }
  async function phOnWant(o) {
    var mine = await phLocalIds("");
    (o.ids || []).slice(0, 40).forEach(function (id) {
      id = String(id || "");
      if (!mine[id] || !phAlive(state.phMeta && state.phMeta[id])) return;
      var delay = 150 + Math.floor(Math.random() * 1200);
      setTimeout(function () {
        if ((phSeenOther[id] || 0) > Date.now() - 8000) return; /* un autre téléphone l’envoie déjà */
        phPush(id);
      }, delay);
    });
  }
  async function phOnChunk(o) {
    var id = String(o.id || "");
    if (!/^[0-9a-f]{12}$/.test(id)) return;
    var now = Date.now();
    phSeenOther[id] = now;
    var m = state.phMeta && state.phMeta[id];
    var hm = o.m || {};
    if (m && !phAlive(m, now)) return; /* supprimée ou expirée : refusée */
    var exp;
    if ((m ? m.type : hm.type) === "ordo") {
      /* 1.99 : ordonnance → fin d’ordonnance de notre fiche (même règle que l’émetteur) ; fiche inconnue : celle annoncée. */
      var op = phPatientOf(String((m && m.pid) || hm.pid || ""));
      exp = op ? phOrdoExp({ at: (m && m.at) || Number(hm.at) || 0 }, op) : Math.max(Number(hm.exp) || 0, m ? Number(m.exp) || 0 : 0);
    } else {
      exp = Math.min(Number(hm.exp) || 0, m ? Number(m.exp) || 0 : Infinity, (Number(hm.at) || 0) + PH_DAYS * 86400000);
    }
    if (!(exp > now)) return;
    var n = o.n | 0, i = o.i | 0;
    if (n < 1 || n > 64 || i < 0 || i >= n || typeof o.d !== "string") return;
    var rx = phRx[id];
    if (!rx || rx.n !== n) rx = phRx[id] = { n: n, parts: new Array(n), got: 0, t: now };
    if (!rx.parts[i]) { rx.parts[i] = unb64(o.d); rx.got++; }
    rx.t = now;
    if (rx.got === 1 && editingId && editingId === (m ? m.pid : hm.pid)) phRenderSoon();
    if (rx.got < n) return;
    delete phRx[id];
    var pid = String((m && m.pid) || hm.pid || "");
    if ((await phLocalIds(pid))[id]) return;
    var total = 0;
    rx.parts.forEach(function (u) { total += u.length; });
    var blob = new Uint8Array(total);
    var off = 0;
    rx.parts.forEach(function (u) { blob.set(u, off); off += u.length; });
    var h = await phHashHex(blob);
    var want = (m && m.h) || String(hm.h || "");
    if (!want || h !== want || blob.length < 13) return;
    var rec = {
      v: 1, pid: pid, id: id,
      type: (m && m.type) || (PH_TYPES[hm.type] ? hm.type : "acces"),
      at: (m && m.at) || Number(hm.at) || 0,
      exp: exp, by: String((m && m.by) || hm.by || "").slice(0, 24), h: h,
      iv: b64(blob.subarray(0, 12)), ct: blob.slice(12).buffer
    };
    var cur = state.phMeta && state.phMeta[id];
    if (cur && !phAlive(cur)) return;
    await idbPut("ph:" + pid + ":" + id, rec);
    if (!state.phMeta) state.phMeta = {};
    if (!state.phMeta[id]) {
      var mc = phCleanMeta({ id: id, pid: pid, type: rec.type, at: rec.at, exp: exp, by: rec.by, h: h, has: {} });
      if (mc) state.phMeta[id] = mc;
    }
    phNoteHave(id, now);
    persist(false);
    if (editingId === pid) renderPatientPhotos();
  }
  var phRenderTimer = null;
  function phRenderSoon() {
    clearTimeout(phRenderTimer);
    phRenderTimer = setTimeout(function () { if (editingId) renderPatientPhotos(); }, 120);
  }
  function phSigFor(pid) {
    var mm = (state && state.phMeta) || {};
    return pid + "|" + Object.keys(mm).filter(function (id) { return mm[id].pid === pid; }).sort().map(function (id) {
      var m = mm[id];
      return id + ":" + (m.del ? "x" : Object.keys(m.has || {}).sort().join(","));
    }).join(";");
  }
  /* Après chaque fusion de l’état : suppressions / expirations appliquées, demande de ce qui manque. */
  function phAfterMerge() {
    if (!phSyncOn()) return;
    purgePhotos().then(function () {
      phAskMissing(false);
      if (editingId && $("modal-patient") && !$("modal-patient").hidden) {
        var sig = phSigFor(editingId);
        if (sig !== phLastSig) renderPatientPhotos();
      }
    }).catch(function () {});
  }
  function phOnConnect() {
    setTimeout(function () { phAskMissing(true).catch(function () {}); }, 1500);
  }
  function phStartSweep() {
    if (phSweepTimer) clearInterval(phSweepTimer);
    phSweepTimer = setInterval(function () {
      if (!unlocked) return;
      purgePhotos().then(function (ch) {
        if (ch && editingId) renderPatientPhotos();
        phAskMissing(false);
      }).catch(function () {});
    }, 60000);
  }
  function phStopSweep() {
    if (phSweepTimer) clearInterval(phSweepTimer);
    phSweepTimer = null;
    phRx = {};
    phSending = {};
    phSeenOther = {};
    phWantAt = 0;
    phLastSig = "";
  }
  async function phOpen(rec) {
    var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, rec.ct);
    return URL.createObjectURL(new Blob([pt], { type: "image/jpeg" }));
  }
  function phRevokeGrid(g) {
    if (!g) return;
    Array.prototype.forEach.call(g.querySelectorAll("img"), function (im) { try { URL.revokeObjectURL(im.src); } catch (e) {} });
    g.innerHTML = "";
  }
  function phNameList(names) {
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " ou " + names[names.length - 1];
  }
  function phOthers(m) {
    var me = foldName(localDisplayName());
    var out = [];
    var anon = false;
    Object.keys((m && m.has) || {}).forEach(function (n) {
      var f = foldName(n);
      if (!f || f === me) return;
      if (isHiddenPresence(n)) { anon = true; return; }
      out.push(n);
    });
    if (anon) out.push("un autre téléphone");
    return out;
  }
  function phWhere(item) {
    if (!phSyncOn()) return "Sur ce téléphone uniquement";
    var m = item.m;
    var others = phOthers(m);
    if (item.local) {
      if (others.length) return "Aussi chez " + others.join(", ").replace(/, ([^,]*)$/, " et $1");
      return "Pas encore chez les autres · part dès qu’un téléphone du cabinet est en ligne";
    }
    if (phRx[m.id]) return "Réception en cours…";
    var holders = others.length ? others : (m && m.by && foldName(m.by) !== foldName(localDisplayName()) && !isHiddenPresence(m.by) ? [m.by] : []);
    return "Pas encore sur ce téléphone · arrive quand " + (holders.length ? phNameList(holders) : "un téléphone qui l’a") + " est en ligne";
  }
  async function fillPhotoGrid(gridId, items, p, seq) {
    var g = $(gridId);
    if (!g) return true;
    phRevokeGrid(g);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = it.v || it.m;
      var fig = document.createElement("figure");
      fig.className = "ph-item" + (it.local ? "" : " ph-wait");
      if (it.local) {
        var url = "";
        try { url = await phOpen(it.v); } catch (eD) { url = ""; }
        if (seq !== phRenderSeq) { if (url) URL.revokeObjectURL(url); return false; }
        if (url) {
          var im = document.createElement("img");
          im.src = url;
          im.alt = PH_TYPES[r.type] || "Photo";
          im.addEventListener("click", (function (u) { return function () { phView(u); }; })(url));
          fig.appendChild(im);
        } else {
          var bad = document.createElement("div");
          bad.className = "ph-bad";
          bad.textContent = "Illisible";
          fig.appendChild(bad);
        }
      } else {
        var wait = document.createElement("div");
        wait.className = "ph-bad ph-pending";
        wait.textContent = phRx[r.id] ? "⏳ Réception…" : "⏳ En attente";
        fig.appendChild(wait);
      }
      var cap = document.createElement("figcaption");
      var ex = new Date(it.local ? phEffExp(it.v, p, it.m) : phMetaEff(it.m, p));
      var exOpt = { day: "numeric", month: "short" };
      if (ex.getFullYear() !== new Date().getFullYear()) exOpt.year = "numeric"; /* 1.99 : fin d’ordonnance parfois l’an prochain */
      cap.textContent = (PH_TYPES[r.type] || "Photo") + " · effacée le " + ex.toLocaleDateString("fr-FR", exOpt);
      var where = document.createElement("span");
      where.className = "ph-where";
      where.textContent = phWhere(it);
      cap.appendChild(where);
      fig.appendChild(cap);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "ph-del";
      del.setAttribute("aria-label", "Supprimer la photo");
      del.textContent = "×";
      del.addEventListener("click", (function (k, id, pid) {
        return function () {
          var sync = phSyncOn();
          askConfirm("Supprimer la photo ?", sync ? "Elle est effacée sur tous les téléphones du cabinet." : "Elle est effacée de ce téléphone.", function () {
            phDelete(k, id, pid);
          });
        };
      })(it.k || "", r.id, r.pid));
      fig.appendChild(del);
      g.appendChild(fig);
    }
    return true;
  }
  function phDelete(k, id, pid) {
    var done = k ? idbDel(k) : Promise.resolve();
    if (phSyncOn() && id && state.phMeta && state.phMeta[id]) {
      phTombstone(id, pid, state.phMeta[id].exp);
      persist(true);
    }
    return done.then(renderPatientPhotos);
  }
  function phHidePickers(keepTypes) {
    if ($("ph-source")) $("ph-source").hidden = true;
    if ($("ordo-ph-source")) $("ordo-ph-source").hidden = true;
    if (!keepTypes && $("ph-types")) $("ph-types").hidden = true;
  }
  function phShowSource(fromOrdo) {
    if ($("ph-types")) $("ph-types").hidden = true;
    if ($("ph-source")) $("ph-source").hidden = !!fromOrdo;
    if ($("ordo-ph-source")) $("ordo-ph-source").hidden = !fromOrdo;
  }
  function phSetAddState(full, unsaved) {
    var msgSave = "Enregistrez d’abord la fiche, puis rouvrez-la pour ajouter des photos.";
    var msgFull = "6 photos maximum. Supprimez-en une pour en ajouter.";
    [["ph-msg", "btn-ph-add"], ["ordo-ph-msg", "btn-ordo-ph-add"]].forEach(function (ids) {
      var msg = $(ids[0]), add = $(ids[1]);
      if (add) add.disabled = !!(unsaved || full);
      if (msg) {
        if (unsaved) { msg.hidden = false; msg.textContent = msgSave; }
        else if (full) { msg.hidden = false; msg.textContent = msgFull; }
        else { msg.hidden = true; msg.textContent = ""; }
      }
    });
    if (unsaved || full) phHidePickers();
  }
  var PH_TXT = {
    sync: {
      lock: "🔒 Chiffrées · partagées avec le cabinet",
      ordo: "Visibles sur tous les téléphones du cabinet. Chiffrées avec la clé du cabinet et envoyées de téléphone à téléphone : rien n’est gardé sur les relais. Une photo arrive quand un téléphone qui l’a est en ligne en même temps. Effacées partout à la fin de l’ordonnance (date de fin indiquée sur la fiche), ou après 90 jours s’il n’y a pas de date. 6 photos maximum en tout, avec l’onglet Photos.",
      photos: "Documents seulement (accès / clé, ordonnance, carte vitale), jamais le patient. Visibles sur tous les téléphones du cabinet, chiffrées, envoyées de téléphone à téléphone sans rester sur les relais. Ordonnance : effacée partout à la fin de l’ordonnance (90 jours sans date) ; accès / clé et carte vitale : après 90 jours (ou à la fin de l’ordonnance si plus tôt). 6 maximum."
    },
    local: {
      lock: "🔒 Sur ce téléphone uniquement",
      ordo: "Visibles seulement sur ce téléphone, pas sur les autres. Chiffrées, jamais partagées. Effacées à la fin de l’ordonnance (date de fin indiquée sur la fiche), ou après 90 jours s’il n’y a pas de date. 6 photos maximum en tout, avec l’onglet Photos.",
      photos: "Documents seulement (accès / clé, ordonnance, carte vitale), jamais le patient. Chiffrées, jamais partagées. Ordonnance : effacée à la fin de l’ordonnance (90 jours sans date) ; accès / clé et carte vitale : après 90 jours (ou à la fin de l’ordonnance si plus tôt). 6 maximum."
    }
  };
  function phSetTexts() {
    var t = phSyncOn() ? PH_TXT.sync : PH_TXT.local;
    [["ph-lock", t.lock], ["ordo-ph-lock", t.lock], ["ph-hint", t.photos], ["ordo-ph-hint", t.ordo]].forEach(function (x) {
      if ($(x[0]) && $(x[0]).textContent !== x[1]) $(x[0]).textContent = x[1];
    });
  }
  async function renderPatientPhotos() {
    var seq = ++phRenderSeq;
    phRevokeGrid($("ph-grid"));
    phRevokeGrid($("ordo-ph-grid"));
    phSetTexts();
    if (!editingId) {
      phLastSig = "";
      phSetAddState(false, true);
      return;
    }
    var pid = editingId;
    var local = await idbList("ph:" + pid + ":");
    if (seq !== phRenderSeq) return;
    var p = patientById(pid);
    var mm = (state && state.phMeta) || {};
    var now = Date.now();
    var items = [];
    var seen = {};
    local.forEach(function (x) {
      var m = x.v && x.v.id ? mm[x.v.id] : null;
      if (m && m.del) return;
      if (now > phEffExp(x.v, p, m)) return;
      seen[x.v.id] = true;
      items.push({ local: true, k: x.k, v: x.v, m: m });
    });
    if (phSyncOn()) {
      Object.keys(mm).forEach(function (id) {
        var m = mm[id];
        if (seen[id] || m.pid !== pid || !phAlive(m, now)) return;
        if (now > phMetaEff(m, p)) return;
        items.push({ local: false, m: m });
      });
    }
    phLastSig = phSigFor(pid);
    items.sort(function (a, b) { return ((a.v || a.m).at || 0) - ((b.v || b.m).at || 0); });
    var ordoItems = items.filter(function (a) { return (a.v || a.m).type === "ordo"; });
    if (!(await fillPhotoGrid("ph-grid", items, p, seq))) return;
    if (!(await fillPhotoGrid("ordo-ph-grid", ordoItems, p, seq))) return;
    phSetAddState(items.length >= PH_MAX, false);
  }
  function phView(url) {
    if (!$("modal-ph-view")) return;
    $("ph-view-img").src = url;
    $("modal-ph-view").hidden = false;
  }
  if ($("modal-ph-view")) $("modal-ph-view").addEventListener("click", function () {
    $("modal-ph-view").hidden = true;
    $("ph-view-img").removeAttribute("src");
  });
  if ($("btn-ph-add")) $("btn-ph-add").addEventListener("click", function () {
    phHidePickers(true);
    if ($("ph-types")) $("ph-types").hidden = !$("ph-types").hidden;
  });
  if ($("btn-ordo-ph-add")) $("btn-ordo-ph-add").addEventListener("click", function () {
    if (!editingId) return;
    phPendingType = "ordo";
    phShowSource(true);
  });
  Array.prototype.forEach.call(document.querySelectorAll("#ph-types [data-ph]"), function (b) {
    b.addEventListener("click", function () {
      phPendingType = b.getAttribute("data-ph");
      phShowSource(false);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".ph-source [data-ph-src]"), function (b) {
    b.addEventListener("click", function () {
      var src = b.getAttribute("data-ph-src");
      var inp = src === "gallery" ? $("ph-input-gallery") : $("ph-input");
      if (!inp) return;
      inp.value = "";
      inp.click();
    });
  });
  function phOnChosenFiles(inp) {
    var files = inp && inp.files ? Array.prototype.slice.call(inp.files) : [];
    var type = phPendingType || "acces";
    if (inp) inp.value = "";
    if (!files.length) return;
    var i = 0;
    var saved = 0;
    function next() {
      if (i >= files.length) {
        if (saved) {
          var sync = phSyncOn();
          var one = sync ? "Photo enregistrée (chiffrée). Elle part vers les autres téléphones dès qu’ils sont en ligne." : "Photo enregistrée sur ce téléphone (chiffrée).";
          var many = sync ? saved + " photos enregistrées (chiffrées). Elles partent vers les autres téléphones dès qu’ils sont en ligne." : saved + " photos enregistrées sur ce téléphone (chiffrées).";
          toast(saved === 1 ? one : many);
          phHidePickers();
        }
        renderPatientPhotos();
        return;
      }
      var f = files[i++];
      compressImageFile(f, function (url) {
        if (!url) { toast("Photo illisible ou trop lourde."); next(); return; }
        phSave(url, type).then(function (ok) {
          if (ok) saved++;
          next();
        }).catch(function () { toast("Enregistrement impossible."); next(); });
      }, { q: 0.75, limit: 600000 });
    }
    next();
  }
  if ($("ph-input")) $("ph-input").addEventListener("change", function () { phOnChosenFiles($("ph-input")); });
  if ($("ph-input-gallery")) $("ph-input-gallery").addEventListener("change", function () { phOnChosenFiles($("ph-input-gallery")); });

  function compressImageFile(file, cb, opts) {
    var q1 = (opts && opts.q) || 0.58;
    var lim = (opts && opts.limit) || 180000;
    if (!file) { cb(""); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 800;
        var w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w >= h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        var c = document.createElement("canvas");
        c.width = Math.max(1, w);
        c.height = Math.max(1, h);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var url = c.toDataURL("image/jpeg", q1);
        if (url.length > lim * 0.78) url = c.toDataURL("image/jpeg", Math.min(q1, 0.42));
        cb(url.length > lim ? "" : url);
      };
      img.onerror = function () { cb(""); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(""); };
    reader.readAsDataURL(file);
  }

  function openTxRapide(pid) {
    if (!unlocked) return;
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    var p = patientById(pid);
    if (!p) return;
    txRapidePid = pid;
    if ($("tx-rapide-patient")) $("tx-rapide-patient").textContent = displayName(p);
    if ($("tx-rapide-text")) $("tx-rapide-text").value = "";
    if ($("modal-tx-rapide")) $("modal-tx-rapide").hidden = false;
    setTimeout(function () {
      if ($("tx-rapide-text")) $("tx-rapide-text").focus();
    }, 80);
  }

  function closeTxRapide() {
    if (isVoixRecording() && recDest === "rapide") { stopVoixRec(true); finishVoiceReady(null); }
    if (voiceReadyDest === "rapide") finishVoiceReady(null);
    txRapidePid = "";
    pendingTxVoice = null;
    if ($("modal-tx-rapide")) $("modal-tx-rapide").hidden = true;
    if ($("tx-rapide-text")) $("tx-rapide-text").value = "";
    if ($("tx-rapide-voix-status")) $("tx-rapide-voix-status").hidden = true;
  }

  function sendTxRapide() {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    if (!unlocked || !txRapidePid) return;
    if (txSending) return;
    var p = patientById(txRapidePid);
    if (!p) {
      closeTxRapide();
      return;
    }
    var el = $("tx-rapide-text");
    var text = el ? String(el.value || "").trim() : "";
    if (!text) {
      toast("Écris un mémo avant d’envoyer.");
      if (el) el.focus();
      return;
    }
    if (text.length > 800) text = text.slice(0, 800);
    txSending = true;
    pendingTxVoice = null;
    var day = todayISO();
    var rec = ensureDayTx(day);
    var itemId = uid();
    rec.items.push({
      id: itemId,
      from: name.slice(0, 24),
      text: text,
      t: Date.now(),
      updatedAt: Date.now(),
      kind: "rapide",
      patientId: String(p.id),
      patientName: displayName(p).slice(0, 80),
      voiceId: ""
    });
    if (rec.items.length > 80) rec.items = rec.items.slice(rec.items.length - 80);
    bumpDayTx(day);
    closeTxRapide();
    persist(true);
    syncWatchToIdb();
    renderTransmissions();
    if (currentTab !== "transmissions") updateTxBadge();
    txSending = false;
    toast(navigator.onLine === false
      ? "Mémo enregistré hors ligne. Il partira au retour du réseau."
      : "Mémo envoyé.");
  }

  function healReplyKinds() {
    if (!state || !state.transmissions) return;
    Object.keys(state.transmissions).forEach(function (day) {
      var rec = state.transmissions[day];
      if (!rec || !rec.items) return;
      rec.items.forEach(function (it) {
        if (!it || !it.replyTo) return;
        it.kind = "reply";
      });
    });
  }

  function repliesOf(day, parentId) {
    var rec = ensureDayTx(day);
    return liveTxItems(rec).filter(function (it) {
      if (!it || it.replyTo !== parentId) return false;
      if (it.kind !== "reply") it.kind = "reply";
      return true;
    }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
  }

  function voiceIdForItem(day, post) {
    if (!post) return "";
    if (post.voiceId) return post.voiceId;
    var rec = state.transmissions && state.transmissions[day];
    if (!rec || !post.id) return "";
    var found = "";
    liveVoices(rec.voices).forEach(function (v) {
      if (v && v.itemId && v.itemId === post.id) found = v.id;
    });
    if (found) post.voiceId = found;
    return found;
  }

  function renderItemVoice(box, voiceId, day, post) {
    if (!voiceId) return;
    var row = document.createElement("div");
    row.className = "voix-item";
    appendVoicePlay(row, voiceId);
    box.appendChild(row);
  }

  function renderReplies(box, day, parent) {
    var list = repliesOf(day, parent.id);
    var me = localDisplayName();
    list.forEach(function (rep) {
      var row = document.createElement("div");
      row.className = "tx-reply";
      var who = document.createElement("span");
      who.className = "tx-rapide-entry-meta";
      who.textContent = "↳ " + (rep.from || "Réponse") + (rep.t ? "  ·  " + formatTimeHm(rep.t) : "");
      row.appendChild(who);
      if (rep.text && String(rep.text).trim() !== "Vocal") {
        var body = document.createElement("span");
        body.className = "tx-rapide-entry-text";
        body.textContent = rep.text;
        row.appendChild(body);
      }
      if (voiceIdForItem(day, rep)) renderItemVoice(row, rep.voiceId, day, rep);
      if (me && samePerson(rep.from, me)) {
        var delR = document.createElement("button");
        delR.type = "button";
        delR.className = "btn btn-danger";
        delR.textContent = "Supprimer";
        delR.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!confirm("Supprimer cette réponse ?")) return;
          if (deleteTxItem(day, rep.id)) {
            renderTransmissions();
            toast("Réponse supprimée.");
          }
        });
        row.appendChild(delR);
      }
      box.appendChild(row);
    });
    if (txReplyTo === parent.id) {
      var form = document.createElement("div");
      form.className = "tx-reply-box";
      var ta = document.createElement("textarea");
      ta.className = "tx-area";
      ta.rows = 2;
      ta.maxLength = 800;
      ta.placeholder = "Ta réponse — mémo écrit.";
      form.appendChild(ta);
      var bar = document.createElement("div");
      bar.className = "row-btns";
      var send = document.createElement("button");
      send.type = "button";
      send.className = "btn btn-primary";
      send.textContent = "Envoyer";
      send.addEventListener("click", function () {
        sendTxReply(day, parent, ta.value);
      });
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-ghost";
      cancel.textContent = "Annuler";
      cancel.addEventListener("click", function () {
        txReplyTo = "";
        txReplyParent = null;
        pendingReplyVoice = null;
        renderTransmissions();
      });
      bar.appendChild(send);
      bar.appendChild(cancel);
      form.appendChild(bar);
      box.appendChild(form);
    }
  }

  function openTxReply(day, post) {
    if (!localDisplayName()) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    txReplyTo = post.id;
    txReplyDay = day;
    txReplyParent = post;
    pendingReplyVoice = null;
    renderTransmissions();
  }

  function sendTxReply(day, parent, raw) {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    if (txSending) return;
    var text = String(raw || "").trim();
    if (!text) {
      toast("Écris une réponse avant d’envoyer.");
      return;
    }
    if (text.length > 800) text = text.slice(0, 800);
    txSending = true;
    pendingReplyVoice = null;
    var rec = ensureDayTx(day);
    var itemId = uid();
    rec.items.push({
      id: itemId,
      from: name.slice(0, 24),
      text: text,
      t: Date.now(),
      updatedAt: Date.now(),
      kind: "reply",
      replyTo: parent.id,
      patientId: parent.patientId || "",
      patientName: parent.patientName || "",
      voiceId: ""
    });
    txReplyTo = "";
    txReplyParent = null;
    txReplyDay = "";
    bumpDayTx(day);
    persist(true);
    syncWatchToIdb();
    renderTransmissions();
    txSending = false;
    toast("Réponse envoyée.");
  }

  function sendTx() {
    var name = localDisplayName();
    if (!name) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return;
    }
    if (!unlocked) return;
    if (txSending) return;
    var el = $("tx-today");
    var text = el ? String(el.value || "").trim() : "";
    if (!text) {
      toast("Écris un mémo avant d’envoyer.");
      if (el) el.focus();
      return;
    }
    if (text.length > 800) text = text.slice(0, 800);
    txSending = true;
    var day = todayISO();
    var rec = ensureDayTx(day);
    var itemId = uid();
    rec.items.push({
      id: itemId,
      from: name.slice(0, 24),
      text: text,
      t: Date.now(),
      updatedAt: Date.now(),
      voiceId: ""
    });
    if (rec.items.length > 80) rec.items = rec.items.slice(rec.items.length - 80);
    bumpDayTx(day);
    if (el) el.value = "";
    persist(true);
    syncWatchToIdb();
    renderTransmissions();
    txSending = false;
    toast(navigator.onLine === false
      ? "Mémo enregistré hors ligne. Il partira au retour du réseau."
      : "Mémo envoyé.");
  }

  function samePerson(a, b) {
    return !!a && !!b && foldName(a) === foldName(b);
  }

  function saveTxItem(day, id, text) {
    if (!unlocked || !day || !id) return false;
    var me = localDisplayName();
    if (!me) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return false;
    }
    var rec = ensureDayTx(day);
    text = String(text || "").slice(0, 800);
    var i;
    for (i = 0; i < rec.items.length; i++) {
      var it = rec.items[i];
      if (!it || it.id !== id) continue;
      if (!samePerson(it.from, me)) {
        toast("Tu ne peux modifier que tes transmissions.");
        return false;
      }
      rec.items[i] = {
        id: it.id,
        from: it.from,
        text: text,
        t: it.t || Date.now(),
        updatedAt: Date.now()
      };
      if (it.kind) rec.items[i].kind = it.kind;
      if (it.patientId) rec.items[i].patientId = it.patientId;
      if (it.patientName) rec.items[i].patientName = it.patientName;
      if (it.voiceId) rec.items[i].voiceId = it.voiceId;
      if (it.replyTo) rec.items[i].replyTo = it.replyTo;
      bumpDayTx(day);
      persist(true);
      syncWatchToIdb();
      return true;
    }
    return false;
  }

  function deleteLinkedVoiceOnly(rec, it) {
    if (!rec || !it) return;
    var vid = String(it.voiceId || "");
    var iid = String(it.id || "");
    (rec.voices || []).forEach(function (v) {
      if (!v || v.deletedAt) return;
      var hit = false;
      if (vid && v.id === vid) hit = true;
      else if (iid && v.itemId && String(v.itemId) === iid) hit = true;
      if (!hit) return;
      v.deletedAt = Date.now();
      delete voiceBlobs[v.id];
      if (mqttHandle && mqttHandle.publishTo) mqttHandle.publishTo("voix/" + v.id, "{}", true);
    });
  }

  function deleteTxItem(day, id) {
    if (!unlocked || !day || !id) return false;
    var me = localDisplayName();
    if (!me) {
      openPrenomModal(false);
      toast("Indiquez un prénom.");
      return false;
    }
    var rec = ensureDayTx(day);
    var i;
    var target = null;
    for (i = 0; i < rec.items.length; i++) {
      var it = rec.items[i];
      if (!it || it.id !== id || it.deletedAt) continue;
      if (!samePerson(it.from, me)) {
        toast("Tu ne peux supprimer que tes transmissions.");
        return false;
      }
      target = it;
      break;
    }
    if (!target) return false;
    var now = Date.now();
    target.deletedAt = now;
    target.updatedAt = now;
    target.text = "";
    delete target.patientName;
    deleteLinkedVoiceOnly(rec, target);
    // Si on retire le message parent, on retire aussi SES réponses (pas les autres vocaux).
    if (target.kind !== "reply" && !target.replyTo) {
      rec.items.forEach(function (rep) {
        if (!rep || rep.deletedAt) return;
        if (rep.replyTo !== target.id) return;
        rep.deletedAt = now;
        rep.updatedAt = now;
        rep.text = "";
        delete rep.patientName;
        deleteLinkedVoiceOnly(rec, rep);
      });
    }
    bumpDayTx(day);
    persist(true);
    syncWatchToIdb();
    return true;
  }

  var txEdit = { day: "", id: "" };

  function adoptUnsignedTx(rec, day) {
    if (!rec) return false;
    var txt = String(rec.text || "").trim();
    if (!txt) return false;
    rec.items = rec.items || [];
    var id = "legacy:" + day;
    var i, found = -1;
    for (i = 0; i < rec.items.length; i++) {
      if (rec.items[i] && rec.items[i].id === id) { found = i; break; }
    }
    if (found < 0) {
      rec.items.push({
        id: id,
        from: "Cabinet",
        text: txt.slice(0, 800),
        t: rec.updatedAt || Date.now(),
        updatedAt: rec.updatedAt || Date.now()
      });
    } else if (!String(rec.items[found].from || "").trim()) {
      rec.items[found].from = "Cabinet";
    }
    rec.text = "";
    rec.updatedAt = Date.now();
    return true;
  }

  function txPostsOf(rec, day) {
    var posts = [];
    if (rec && String(rec.text || "").trim()) {
      posts.push({ id: "legacy:" + day, from: "Cabinet", text: String(rec.text), t: rec.updatedAt || 0, legacy: true });
    }
    liveTxItems(rec).forEach(function (it) {
      if (it && (it.kind === "reply" || it.replyTo)) return;
      posts.push(it);
    });
    posts.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    return posts;
  }

  function isTxRapide(post) {
    if (!post || post.kind === "reply" || post.replyTo) return false;
    return !!(post.kind === "rapide" || post.patientId || post.patientName);
  }

  function renderTxRapideRecap(box, day, posts) {
    if (!posts || !posts.length) return;
    var me = localDisplayName();
    var byPat = {};
    var order = [];
    posts.forEach(function (post) {
      var key = String(post.patientId || "") || ("n:" + String(post.patientName || "").toLowerCase()) || ("id:" + post.id);
      if (!byPat[key]) {
        byPat[key] = {
          name: String(post.patientName || "Patient").trim() || "Patient",
          items: []
        };
        order.push(key);
      }
      byPat[key].items.push(post);
    });
    order.sort(function (a, b) {
      return String(byPat[a].name).localeCompare(String(byPat[b].name), "fr", { sensitivity: "base" });
    });

    var card = document.createElement("article");
    card.className = "msg-row other tx-post tx-rapide-recap";
    var meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = "Récap du jour · transmissions rapides";
    card.appendChild(meta);

    var wrap = document.createElement("div");
    wrap.className = "msg-bubble-wrap";
    var bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    var title = document.createElement("strong");
    title.className = "tx-rapide-recap-title";
    title.textContent = order.length + " patient" + (order.length > 1 ? "s" : "");
    bubble.appendChild(title);

    order.forEach(function (key) {
      var group = byPat[key];
      var block = document.createElement("div");
      block.className = "tx-rapide-block";
      var pat = document.createElement("strong");
      pat.className = "tx-patient-name";
      pat.textContent = group.name;
      block.appendChild(pat);

      group.items.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      group.items.forEach(function (post) {
        var mine = !!(me && post.from && samePerson(post.from, me) && !post.legacy);
        var editing = !!(mine && txEdit.day === day && txEdit.id === post.id);
        var entry = document.createElement("div");
        entry.className = "tx-rapide-entry";

        if (editing) {
          var ta = document.createElement("textarea");
          ta.className = "tx-area";
          ta.rows = 3;
          ta.value = post.text || "";
          entry.appendChild(ta);
          var actions = document.createElement("div");
          actions.className = "tx-post-actions";
          var save = document.createElement("button");
          save.type = "button";
          save.className = "btn btn-primary";
          save.textContent = "Enregistrer";
          save.addEventListener("click", function () {
            if (saveTxItem(day, post.id, ta.value)) {
              txEdit = { day: "", id: "" };
              renderTransmissions();
              toast("Transmission modifiée.");
            }
          });
          var cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "btn btn-ghost";
          cancel.textContent = "Annuler";
          cancel.addEventListener("click", function () {
            txEdit = { day: "", id: "" };
            renderTransmissions();
          });
          actions.appendChild(save);
          actions.appendChild(cancel);
          entry.appendChild(actions);
        } else {
          var em = document.createElement("span");
          em.className = "tx-rapide-entry-meta";
          var who = String(post.from || "").trim();
          em.textContent = who
            ? (who + (post.t ? "  ·  " + formatTimeHm(post.t) : ""))
            : (post.t ? formatTimeHm(post.t) : "");
          entry.appendChild(em);
          var hasVoice = !!voiceIdForItem(day, post);
          var txt = String(post.text || "").trim();
          if (txt && !(hasVoice && txt === "Vocal")) {
            var body = document.createElement("span");
            body.className = "tx-rapide-entry-text";
            body.textContent = txt;
            entry.appendChild(body);
          }
          if (hasVoice) renderItemVoice(entry, post.voiceId, day, post);
          renderReplies(entry, day, post);
          if (txReplyTo !== post.id) {
            var replyBtn = document.createElement("button");
            replyBtn.type = "button";
            replyBtn.className = "btn btn-ghost";
            replyBtn.textContent = "Répondre";
            replyBtn.addEventListener("click", function () { openTxReply(day, post); });
            entry.appendChild(replyBtn);
          }
          if (mine) {
            var actions2 = document.createElement("div");
            actions2.className = "tx-post-actions";
            var isVoiceOnly = !!(post.voiceId && (!String(post.text || "").trim() || String(post.text || "").trim() === "Vocal"));
            if (!isVoiceOnly) {
              var mod = document.createElement("button");
              mod.type = "button";
              mod.className = "btn btn-ghost";
              mod.textContent = "Modifier";
              mod.addEventListener("click", function () {
                if (!localDisplayName()) {
                  openPrenomModal(false);
                  toast("Indiquez un prénom.");
                  return;
                }
                txEdit = { day: day, id: post.id };
                renderTransmissions();
              });
              actions2.appendChild(mod);
            }
            var del = document.createElement("button");
            del.type = "button";
            del.className = "btn btn-danger";
            del.textContent = "Supprimer";
            del.addEventListener("click", function () {
              if (!localDisplayName()) {
                openPrenomModal(false);
                toast("Indiquez un prénom.");
                return;
              }
              if (!confirm("Supprimer cette transmission rapide ?")) return;
              if (deleteTxItem(day, post.id)) {
                txEdit = { day: "", id: "" };
                renderTransmissions();
                if (typeof updateTxBadge === "function") updateTxBadge();
                toast("Transmission supprimée.");
              }
            });
            actions2.appendChild(del);
            entry.appendChild(actions2);
          }
        }
        block.appendChild(entry);
      });
      bubble.appendChild(block);
    });

    wrap.appendChild(bubble);
    card.appendChild(wrap);
    box.appendChild(card);
  }

  function renderTxPosts(box, day, posts) {
    var rapides = [];
    var autres = [];
    (posts || []).forEach(function (post) {
      if (isTxRapide(post)) rapides.push(post);
      else autres.push(post);
    });
    renderTxRapideRecap(box, day, rapides);
    autres.forEach(function (post) { renderTxPost(box, day, post); });
  }

  function renderTxPost(box, day, post) {
    var me = localDisplayName();
    var mine = !!(me && post.from && samePerson(post.from, me) && !post.legacy);
    var canEdit = mine;
    var editing = !!(mine && txEdit.day === day && txEdit.id === post.id);
    var card = document.createElement("article");
    card.className = "msg-row " + (mine ? "own" : "other") + " tx-post";
    var meta = document.createElement("div");
    meta.className = "msg-meta";
    var whoName = String(post.from || "").trim();
    meta.textContent = whoName
      ? (whoName + (post.t ? "  ·  " + formatTimeHm(post.t) : ""))
      : (post.t ? formatTimeHm(post.t) : "");
    card.appendChild(meta);
    if (editing) {
      var ta = document.createElement("textarea");
      ta.className = "tx-area";
      ta.rows = 4;
      ta.value = post.text || "";
      card.appendChild(ta);
      var actions = document.createElement("div");
      actions.className = "tx-post-actions";
      var save = document.createElement("button");
      save.type = "button";
      save.className = "btn btn-primary";
      save.textContent = "Enregistrer";
      save.addEventListener("click", function () {
        if (saveTxItem(day, post.id, ta.value)) {
          txEdit = { day: "", id: "" };
          renderTransmissions();
          toast("Transmission modifiée.");
        }
      });
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-ghost";
      cancel.textContent = "Annuler";
      cancel.addEventListener("click", function () {
        txEdit = { day: "", id: "" };
        renderTransmissions();
      });
      actions.appendChild(save);
      actions.appendChild(cancel);
      card.appendChild(actions);
    } else {
      var wrap = document.createElement("div");
      wrap.className = "msg-bubble-wrap";
      var tx = document.createElement("div");
      tx.className = "msg-bubble";
      if (whoName) {
        var who = document.createElement("strong");
        who.className = "tx-from-name";
        who.textContent = whoName;
        tx.appendChild(who);
      }
      if (post.patientName) {
        var pat = document.createElement("strong");
        pat.className = "tx-patient-name";
        pat.textContent = "Patient · " + post.patientName;
        tx.appendChild(pat);
      }
      var hasVoice2 = !!voiceIdForItem(day, post);
      var txt2 = String(post.text || "").trim();
      if (txt2 && !(hasVoice2 && txt2 === "Vocal")) {
        var body = document.createElement("span");
        body.textContent = txt2;
        tx.appendChild(body);
      }
      if (hasVoice2) renderItemVoice(tx, post.voiceId, day, post);
      wrap.appendChild(tx);
      card.appendChild(wrap);
      renderReplies(card, day, post);
      if (txReplyTo !== post.id) {
        var replyBtn2 = document.createElement("button");
        replyBtn2.type = "button";
        replyBtn2.className = "btn btn-ghost";
        replyBtn2.textContent = "Répondre";
        replyBtn2.addEventListener("click", function () { openTxReply(day, post); });
        card.appendChild(replyBtn2);
      }
      if (canEdit) {
        var actions2 = document.createElement("div");
        actions2.className = "tx-post-actions";
        var isVoiceOnly2 = !!(post.voiceId && (!String(post.text || "").trim() || String(post.text || "").trim() === "Vocal"));
        if (!isVoiceOnly2) {
          var mod = document.createElement("button");
          mod.type = "button";
          mod.className = "btn btn-ghost";
          mod.textContent = "Modifier";
          mod.addEventListener("click", function () {
            if (!localDisplayName()) {
              openPrenomModal(false);
              toast("Indiquez un prénom.");
              return;
            }
            txEdit = { day: day, id: post.id };
            renderTransmissions();
          });
          actions2.appendChild(mod);
        }
        var del2 = document.createElement("button");
        del2.type = "button";
        del2.className = "btn btn-danger";
        del2.textContent = "Supprimer";
        del2.addEventListener("click", function () {
          if (!localDisplayName()) {
            openPrenomModal(false);
            toast("Indiquez un prénom.");
            return;
          }
          if (!confirm("Supprimer cette transmission ?")) return;
          if (deleteTxItem(day, post.id)) {
            txEdit = { day: "", id: "" };
            renderTransmissions();
            if (typeof updateTxBadge === "function") updateTxBadge();
            toast("Transmission supprimée.");
          }
        });
        actions2.appendChild(del2);
        card.appendChild(actions2);
      }
    }
    box.appendChild(card);
  }

  function renderTransmissions() {
    if (!$("tx-today")) return;
    ensureTx();
    var today = todayISO();
    $("tx-today-label").textContent = formatDateFr(today);
    var rec = ensureDayTx(today);
    if (adoptUnsignedTx(rec, today)) persist(true);
    var me = localDisplayName();
    if ($("tx-today")) {
      $("tx-today").placeholder = me
        ? ("Transmission de " + me + "…")
        : "Indiquez d’abord votre prénom.";
    }
    var list = $("tx-today-list");
    if (list) {
      list.innerHTML = "";
      var posts = txPostsOf(rec, today);
      if (!posts.length && !liveVoices(rec.voices).length) {
        var empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "Aucune transmission aujourd’hui.";
        list.appendChild(empty);
      } else {
        renderTxPosts(list, today, posts);
      }
    }

    var hist = $("tx-history");
    hist.innerHTML = "";
    renderVoixInto($("voix-list"), today);

    var days = Object.keys(state.transmissions).filter(function (d) {
      if (d === today) return false;
      return txRecHasContent(state.transmissions[d]);
    }).sort(function (a, b) {
      if (a < b) return 1;
      if (a > b) return -1;
      return 0;
    });

    if (days.length) {
      var h = document.createElement("p");
      h.className = "tx-hist-title";
      h.textContent = "Historique";
      hist.appendChild(h);
    }

    days.forEach(function (d) {
      var r = state.transmissions[d];
      if (adoptUnsignedTx(r, d)) persist(false);
      var card = document.createElement("article");
      var open = !!txOpen[d];
      card.className = "tx-card" + (open ? " open" : "");
      card.setAttribute("data-day", d);

      var head = document.createElement("button");
      head.type = "button";
      head.className = "tx-card-head";
      var title = document.createElement("h3");
      title.textContent = formatDateFr(d);
      head.appendChild(title);
      var preview = document.createElement("p");
      preview.className = "tx-preview";
      var nVoix = liveVoices(r.voices).length;
      preview.textContent = snippet(txDayText(r), 90) || (nVoix ? (nVoix + " vocal" + (nVoix > 1 ? "x" : "")) : "");
      head.appendChild(preview);
      head.addEventListener("click", function () {
        txOpen[d] = !txOpen[d];
        renderTransmissions();
      });
      card.appendChild(head);

      var body = document.createElement("div");
      body.className = "tx-card-body";
      if (!open) body.hidden = true;
      var postsBox = document.createElement("div");
      postsBox.className = "tx-post-list msg-list";
      renderTxPosts(postsBox, d, txPostsOf(r, d));
      body.appendChild(postsBox);
      var vbox = document.createElement("div");
      vbox.className = "voix-list";
      vbox.setAttribute("data-voix-day", d);
      body.appendChild(vbox);
      renderVoixInto(vbox, d);
      card.appendChild(body);
      hist.appendChild(card);
    });
  }

  // Vocaux transmissions désactivés
  if ($("btn-msg-voix")) $("btn-msg-voix").addEventListener("click", function () { toggleVoixRec("msg"); });
  if ($("btn-tx-send")) $("btn-tx-send").addEventListener("click", sendTx);
  if ($("btn-tx-rapide-send")) $("btn-tx-rapide-send").addEventListener("click", sendTxRapide);
  function setTourSlot(slot) {
    if (!splitToursOn()) return;
    tourSlot = slot === "pm" ? "pm" : "am";
    render();
  }
  if ($("btn-slot-am")) $("btn-slot-am").addEventListener("click", function () { setTourSlot("am"); });
  if ($("btn-slot-pm")) $("btn-slot-pm").addEventListener("click", function () { setTourSlot("pm"); });
  if ($("btn-tx-rapide-cancel")) $("btn-tx-rapide-cancel").addEventListener("click", closeTxRapide);
  if ($("modal-tx-rapide")) $("modal-tx-rapide").addEventListener("click", function (e) {
    if (e.target === $("modal-tx-rapide")) closeTxRapide();
  });

  if ($("tx-today")) $("tx-today").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      sendTx();
    }
  });

  if ($("btn-carte")) $("btn-carte").addEventListener("click", openTourneeMap);
  if ($("btn-close-map")) $("btn-close-map").addEventListener("click", closeTourneeMap);
  if ($("btn-map-itin")) $("btn-map-itin").addEventListener("click", function () {
    var ads = (state.patients || []).filter(function (p) {
      if (!p || !p.id) return false;
      if (isPatientGone(p)) return false;
      if (!isPatientActif(p)) return false;
      if (!visitsToday(p)) return false;
      return !!normAddr(p.adresse);
    }).map(function (p) { return normAddr(p.adresse); });
    var href = mapsDirHref(ads);
    if (!href) { toast("Ajoutez des adresses d’abord."); return; }
    window.location.href = href;
  });
  if ($("modal-map")) $("modal-map").addEventListener("click", function (e) {
    if (e.target === $("modal-map")) closeTourneeMap();
  });

  function showUpdateModal(remote) {
    if (!remote || remote === APP_VER) return;
    if ($("update-text")) $("update-text").textContent = "Nouvelle version " + remote + " — actualiser pour l’avoir.";
    if ($("modal-update")) $("modal-update").hidden = false;
  }

  function checkAppUpdate() {
    var url = "./index.html?tourneeCheck=1&t=" + Date.now();
    fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var remote = null;
        var meta = html.match(/name="tournee-version" content="([^"]+)"/);
        if (meta) remote = meta[1];
        else {
          var m = html.match(/Vydel v(\d+)/i) || html.match(/VYDEL v(\d+)/) || html.match(/Shift Link v(\d+)/) || html.match(/Shift v(\d+)/) || html.match(/Tournée v(\d+)/);
          if (!m) return;
          remote = "v" + m[1];
        }
        showUpdateModal(remote);
      })
      .catch(function () {});
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        (regs || []).forEach(function (r) {
          try { r.update(); } catch (e) {}
          if (r.waiting) {
            if ($("update-text")) $("update-text").textContent = "Nouvelle version disponible — actualiser pour l’avoir.";
            if ($("modal-update")) $("modal-update").hidden = false;
          }
        });
      });
    }
  }

  function applyAppUpdate() {
    function go() {
      window.location.replace("./index.html?v=" + encodeURIComponent(APP_VER) + "&t=" + Date.now());
    }
    var p = Promise.resolve();
    try {
      if (navigator.serviceWorker) {
        p = navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all((regs || []).map(function (r) { return r.unregister(); }));
        });
      }
    } catch (e) {}
    p.then(function () {
      if (!window.caches) return;
      return caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      });
    }).then(go, go);
  }

  if ($("menu-ver")) $("menu-ver").textContent = "Vydel — " + APP_VER;
  if ($("btn-menu-update")) $("btn-menu-update").addEventListener("click", applyAppUpdate);
  if ($("btn-update")) $("btn-update").addEventListener("click", applyAppUpdate);
  if ($("btn-update-later")) $("btn-update-later").addEventListener("click", function () {
    if ($("modal-update")) $("modal-update").hidden = true;
  });
  if (navigator.serviceWorker) {
    // Plus de reload silencieux : on affiche la fenêtre MAJ, l’utilisateur clique Actualiser.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      checkAppUpdate();
    });
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            checkAppUpdate();
          }
        });
      });
    });
  }
  setTimeout(checkAppUpdate, 800);
  setInterval(checkAppUpdate, 60000);
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) checkAppUpdate();
  });

  function cguAccepted() {
    try { return localStorage.getItem(LS_CGU) === CGU_VER; } catch (e) { return false; }
  }

  function continueAfterCgu() {
    meta = loadMeta();
    if (loadMeta2() || (meta && meta.pinHash)) {
      if (pendingInvite && loadMeta2()) { pendingInvite = null; toast("Ce téléphone est déjà dans un cabinet."); }
      if (pendingTrialLink) { pendingTrialLink = ""; toast("Ce téléphone est déjà dans un cabinet."); }
      openPin("unlock", "Code PIN", pendingInvite ? "Saisissez le PIN du cabinet pour utiliser l’invitation." : "Saisissez le PIN du cabinet.");
    } else if (pendingTrialLink && !pendingInvite) {
      var tl = pendingTrialLink;
      pendingTrialLink = "";
      if ($("beta-error")) $("beta-error").hidden = true;
      if ($("beta-key-input")) $("beta-key-input").value = tl;
      showScreen("screen-beta");
      submitBetaKey();
    } else if (pendingInvite) {
      if ($("join-error")) $("join-error").hidden = true;
      if ($("join-pin")) $("join-pin").value = "";
      if ($("join-invite")) $("join-invite").value = "Invitation reçue ✓ vj=" + pendingInvite.raw;
      showScreen("screen-join");
    } else {
      showScreen("screen-welcome");
    }
  }

  function openCgu(fromMenu) {
    cguFromMenu = !!fromMenu;
    if ($("btn-cgu-close")) $("btn-cgu-close").hidden = !cguAccepted();
    showScreen("screen-cgu");
  }

  function acceptCgu() {
    try { localStorage.setItem(LS_CGU, CGU_VER); } catch (e) {}
    if (cguFromMenu && unlocked) {
      cguFromMenu = false;
      showScreen("screen-app");
      return;
    }
    cguFromMenu = false;
    continueAfterCgu();
  }

  if ($("btn-cgu-accept")) $("btn-cgu-accept").addEventListener("click", acceptCgu);
  if ($("btn-cgu-close")) $("btn-cgu-close").addEventListener("click", function () {
    if (unlocked) {
      cguFromMenu = false;
      showScreen("screen-app");
    } else {
      continueAfterCgu();
    }
  });
  if ($("btn-cgu")) $("btn-cgu").addEventListener("click", function () {
    if ($("modal-menu")) $("modal-menu").hidden = true;
    openCgu(true);
  });

  function renderPlanning() {
    ensureTx();
    var label = $("plan-month-label");
    if (label) label.textContent = monthLabel(planYear, planMonth);
    if (currentTab === "planning" && $("counter")) {
      $("counter").textContent = monthLabel(planYear, planMonth);
    }
    var grid = $("plan-grid");
    if (!grid) return;
    grid.innerHTML = "";
    var first = new Date(planYear, planMonth, 1);
    var startPad = (first.getDay() + 6) % 7;
    var nDays = new Date(planYear, planMonth + 1, 0).getDate();
    var today = todayISO();
    var i;
    for (i = 0; i < startPad; i++) {
      var pad = document.createElement("div");
      pad.className = "plan-cell pad";
      pad.setAttribute("aria-hidden", "true");
      grid.appendChild(pad);
    }
    for (var d = 1; d <= nDays; d++) {
      var iso = isoFromParts(planYear, planMonth, d);
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "plan-cell" + (iso === today ? " today" : "") + (dayHasFait(iso) ? " has-fait" : "");
      cell.setAttribute("data-iso", iso);
      var num = document.createElement("span");
      num.className = "plan-num";
      num.textContent = String(d);
      cell.appendChild(num);
      var who = planName(iso);
      if (who) {
        var nm = document.createElement("span");
        nm.className = "plan-who";
        nm.textContent = who;
        cell.appendChild(nm);
      }
      cell.addEventListener("click", function (ev) {
        var el = ev.currentTarget;
        openPlanDay(el.getAttribute("data-iso"));
      });
      grid.appendChild(cell);
    }
  }

  function dayHasFait(iso) {
    var day = state.history && state.history[iso];
    var fait = day && day.fait;
    if (!fait) return false;
    var ids = Object.keys(fait);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (fait[ids[i]] && fait[ids[i]].done === true) return true;
    }
    return false;
  }

  function fillPlanFaitList(iso) {
    var box = $("plan-fait-list");
    if (!box) return;
    box.innerHTML = "";
    var day = state.history && state.history[iso];
    var fait = (day && day.fait) || {};
    var rows = [];
    Object.keys(fait).forEach(function (id) {
      var rec = fait[id];
      if (!rec || rec.done === false) return;
      rows.push({
        name: rec.name || "Patient",
        by: String(rec.by || "").trim()
      });
    });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name, "fr"); });
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "plan-fait-empty";
      empty.textContent = "Aucun Fait enregistré ce jour.";
      box.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "plan-fait-row";
      row.textContent = r.by ? (r.name + " · " + r.by) : r.name;
      box.appendChild(row);
    });
  }

  function fillPlanDayTx(iso) {
    var el = $("plan-tx-text");
    var rec = state.transmissions && state.transmissions[iso];
    var text = rec ? txDayText(rec).trim() : "";
    if (el) {
      el.textContent = text || "Aucune transmission écrite.";
      el.className = "plan-tx-text" + (text ? "" : " muted");
    }
    renderVoixInto($("plan-voix-list"), iso, "Vocal — ouvrir Transmissions pour écouter");
  }

  function openPlanDay(iso) {
    planEditingIso = iso;
    if ($("plan-date")) $("plan-date").textContent = formatDateFr(iso);
    if ($("plan-name")) $("plan-name").value = planName(iso);
    fillPlanFaitList(iso);
    fillPlanDayTx(iso);
    if ($("modal-planning")) $("modal-planning").hidden = false;
    setTimeout(function () {
      if ($("plan-name")) $("plan-name").focus();
    }, 150);
  }

  function closePlanDay() {
    planEditingIso = "";
    if ($("modal-planning")) $("modal-planning").hidden = true;
  }

  function savePlanDay(name) {
    if (!planEditingIso) return;
    ensureTx();
    var n = String(name || "").trim();
    if (n.length > 40) n = n.slice(0, 40);
    state.planning[planEditingIso] = { name: n, updatedAt: Date.now() };
    closePlanDay();
    renderPlanning();
    persist(true);
  }

  if ($("btn-plan-prev")) $("btn-plan-prev").addEventListener("click", function () {
    planMonth -= 1;
    if (planMonth < 0) { planMonth = 11; planYear -= 1; }
    renderPlanning();
  });
  if ($("btn-plan-next")) $("btn-plan-next").addEventListener("click", function () {
    planMonth += 1;
    if (planMonth > 11) { planMonth = 0; planYear += 1; }
    renderPlanning();
  });
  if ($("btn-plan-save")) $("btn-plan-save").addEventListener("click", function () {
    savePlanDay($("plan-name") ? $("plan-name").value : "");
  });
  if ($("btn-plan-clear")) $("btn-plan-clear").addEventListener("click", function () {
    savePlanDay("");
  });
  if ($("btn-plan-cancel")) $("btn-plan-cancel").addEventListener("click", function () {
    closePlanDay();
  });
  if ($("plan-name")) $("plan-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      savePlanDay($("plan-name").value);
    }
  });

  /* 1.98 : lien d’essai (#ve=…) et lien d’activation des essais (#vessai=…) */
  (function () {
    try {
      var h = String(location.hash || "");
      if (h.indexOf("#vessai=") === 0) {
        try { sessionStorage.setItem(SS_TRIAL_ACT, h.slice(8)); } catch (eS) {}
        history.replaceState(null, "", location.pathname + location.search);
      } else if (h.indexOf("#ve=") === 0) {
        pendingTrialLink = decodeURIComponent(h.slice(4));
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (e) {}
  })();
  setInterval(function () { trialSync(); }, 180000);
  /* boot */
  (function () {
    try {
      var h = String(location.hash || "");
      if (h.indexOf("vj=") === -1) return;
      var inv = parseInvite(h);
      if (inv) {
        inv.raw = h.slice(h.indexOf("vj=") + 3);
        pendingInvite = inv;
      }
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  })();
  if ($("btn-secu")) $("btn-secu").addEventListener("click", openSecuModal);
  if ($("btn-secu-go")) $("btn-secu-go").addEventListener("click", function () {
    askConfirm(
      "Sécuriser le cabinet ?",
      "Une vraie clé secrète remplace le PIN pour protéger les échanges. Les autres téléphones suivent tout seuls à leur prochaine connexion. Même PIN, mêmes patients. Gardez ce téléphone connecté une minute.",
      function () { secureCabinetNow(); }
    );
  });
  if ($("btn-secu-close-old")) $("btn-secu-close-old").addEventListener("click", function () {
    askConfirm(
      "Terminer la transition ?",
      "L’ancienne copie protégée par le PIN sera effacée. Les téléphones pas encore à jour ne recevront plus les changements. À faire quand tout le monde est passé.",
      closeTransitionNow
    );
  });
  if ($("btn-secu-invite")) $("btn-secu-invite").addEventListener("click", function () {
    if ($("modal-secu")) $("modal-secu").hidden = true;
    openStaffModal(true);
  });
  if ($("btn-secu-use-invite")) $("btn-secu-use-invite").addEventListener("click", function () {
    var inv = parseInvite($("secu-invite-input") ? $("secu-invite-input").value : "");
    if (!inv) { toast("Lien d’invitation non reconnu."); return; }
    if ($("modal-secu")) $("modal-secu").hidden = true;
    useInviteOnLegacy(inv);
  });
  if ($("btn-secu-done")) $("btn-secu-done").addEventListener("click", function () {
    if ($("modal-secu")) $("modal-secu").hidden = true;
  });

  /* ===================== 1.99 — Ouverture du cabinet et « Importer mes patients » =====================
     Tout est lu et découpé sur le téléphone (js/import.js : règles simples, sans IA, sans OCR, sans réseau).
     Les patients validés entrent dans l’état du cabinet comme une saisie normale (chiffré, puis synchro).
     Le fait d’avoir vu / passé le tutoriel est noté sur ce téléphone seulement. */
  var LS_ONB_SEEN = "tournee.onbSeen";
  var LS_ONB_PENDING = "tournee.onbPending";
  var LS_ONB_CARD = "tournee.onbCard";
  var IMPORT_UNDO_DAYS = 7;
  var IMP = window.VydelImport || null;
  var onb = { mode: "tuto", auto: false, step: "", hist: [], rows: [], aCount: 0, aLast: "", csv: null, source: "" };
  var ONB_TITLES = {
    welcome: "Bienvenue dans votre cabinet",
    choice: "Comment ajouter vos patients ?",
    a1: "Votre premier patient", a2: "Où habite-t-il ?", a3: "Son téléphone", a4: "Quels jours, à quelle heure ?",
    a5: "Une remarque ?", a6: "Patient ajouté",
    b1: "Préparez votre note", b2: "Copiez votre note", b3: "Collez-la ici", b4: "Vérifiez vos patients",
    b5: "Déjà dans votre cabinet ?", b6: "Patients ajoutés",
    file: "Importer un fichier Excel ou CSV",
    end: "Votre tournée est prête"
  };
  var ONB_NUM = { a1: 1, a2: 2, a3: 3, a4: 4, a5: 5, a6: 6, b1: 1, b2: 2, b3: 3, b4: 4, b5: 5, b6: 6 };

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function cabTopic() { return (meta && meta.blobId) || ""; }
  function contactsSupported() { return ("contacts" in navigator) && ("ContactsManager" in window); }
  function livingPatients() { return (state.patients || []).filter(function (p) { return !isPatientGone(p); }); }

  /* Appelé à la création d’un nouveau cabinet (essai de 14 jours compris). Jamais pour un cabinet rejoint. */
  function markNewCabinetOnboarding() {
    var t = cabTopic();
    if (!t) return;
    lsSet(LS_ONB_CARD, t);
    if (!lsGet(LS_ONB_SEEN)) lsSet(LS_ONB_PENDING, t);
  }

  function maybeStartOnboarding() {
    var t = cabTopic();
    if (!t || lsGet(LS_ONB_PENDING) !== t || isKicked()) return false;
    (function wait(n) {
      if (!unlocked || lsGet(LS_ONB_PENDING) !== t) return;
      var busy = ["modal-rec", "modal-prenom", "modal-rec-use"].some(function (id) { return $(id) && !$(id).hidden; });
      if (busy && n < 1200) { setTimeout(function () { wait(n + 1); }, 500); return; }
      openOnboarding("tuto", true);
    })(0);
    return true;
  }

  function onbShowStep(step, noHist) {
    if (!noHist && onb.step && onb.step !== step) onb.hist.push(onb.step);
    onb.step = step;
    Array.prototype.forEach.call(document.querySelectorAll("#modal-import .onb-step"), function (sec) {
      sec.hidden = sec.getAttribute("data-step") !== step;
    });
    var title = ONB_TITLES[step] || "";
    if (step === "a1" && onb.aCount) title = "Patient suivant";
    if (onb.mode === "import" && step === "choice") title = "Importer mes patients";
    $("onb-title").textContent = title;
    var n = ONB_NUM[step];
    $("onb-stepn").textContent = n ? ("Étape " + n + " sur 6") : "";
    $("btn-onb-skip").textContent = onb.mode === "tuto" ? "Passer" : "Fermer";
    var noBack = ["welcome", "a6", "b6", "end"].indexOf(step) >= 0 || !onb.hist.length || (step === "choice" && onb.mode === "import");
    $("btn-onb-back").hidden = noBack;
    if (step === "a1") {
      $("btn-onb-contacts").hidden = !contactsSupported();
      $("onb-contacts-ios").hidden = contactsSupported() || !isIosDevice();
      setTimeout(function () { try { $("onb-prenom").focus(); } catch (e) {} }, 120);
    }
    var sheet = document.querySelector("#modal-import .sheet-onb");
    if (sheet) sheet.scrollTop = 0;
  }

  function openOnboarding(mode, auto) {
    if (!IMP) { toast("Import indisponible : mettez l’appli à jour."); return; }
    onb = { mode: mode, auto: !!auto, step: "", hist: [], rows: [], aCount: 0, aLast: "", csv: null, source: "" };
    if ($("modal-menu")) $("modal-menu").hidden = true;
    if ($("modal-tuto")) $("modal-tuto").hidden = true;
    resetOnbA();
    $("onb-paste").value = "";
    $("onb-b3-error").hidden = true;
    $("onb-example").textContent = IMP.EXAMPLE;
    $("modal-import").hidden = false;
    onbShowStep(mode === "tuto" ? "welcome" : "choice", true);
  }

  function closeImportModal() {
    $("modal-import").hidden = true;
    onb.rows = [];
    onb.csv = null;
    $("onb-paste").value = "";
    $("onb-review").innerHTML = "";
    $("onb-dups").innerHTML = "";
    render();
  }

  /* Fin du tutoriel (vu, passé ou « Plus tard ») : noté sur ce téléphone seulement. */
  function finishOnboarding() {
    var wasAuto = onb.auto;
    lsSet(LS_ONB_SEEN, "1");
    lsSet(LS_ONB_PENDING, "");
    closeImportModal();
    if (wasAuto) setTimeout(maybeAskTuto, 400);
  }

  $("btn-onb-skip").addEventListener("click", function () {
    if (onb.mode === "tuto") {
      askConfirm("Passer le tutoriel ?", "Vous pourrez le reprendre dans Menu → Aide → Revoir le tutoriel. Les patients déjà enregistrés sont gardés.", finishOnboarding);
      return;
    }
    if ((onb.step === "b4" || onb.step === "b5") && onb.rows.length) {
      askConfirm("Fermer sans enregistrer ?", "Les patients de cette liste ne sont pas encore enregistrés.", closeImportModal);
      return;
    }
    closeImportModal();
  });
  $("btn-onb-back").addEventListener("click", function () {
    var prev = onb.hist.pop();
    if (prev) onbShowStep(prev, true);
  });
  $("btn-onb-start").addEventListener("click", function () { onbShowStep("choice"); });
  $("btn-onb-manual").addEventListener("click", function () { resetOnbA(); onbShowStep("a1"); });
  $("btn-onb-paste").addEventListener("click", function () { onbShowStep("b1"); });
  $("btn-onb-file").addEventListener("click", function () { resetOnbFile(); onbShowStep("file"); });
  $("btn-onb-later").addEventListener("click", function () {
    if (onb.mode === "tuto") finishOnboarding();
    else closeImportModal();
  });
  $("btn-onb-end").addEventListener("click", finishOnboarding);
  if ($("btn-onb-card")) $("btn-onb-card").addEventListener("click", function () { openOnboarding("import"); });
  if ($("btn-onb-replay")) $("btn-onb-replay").addEventListener("click", function () { openOnboarding("tuto"); });
  if ($("btn-import-open")) $("btn-import-open").addEventListener("click", function () { openOnboarding("import"); });

  function afterPathDone() {
    if (onb.mode === "tuto") onbShowStep("end");
    else closeImportModal();
  }

  /* —— Parcours A : un patient à la fois —— */
  var onbA = { jours: {}, am: false, pm: false };
  function resetOnbA() {
    ["onb-prenom", "onb-nom", "onb-adresse", "onb-tel", "onb-heure", "onb-rem", "onb-ordo"].forEach(function (id) { if ($(id)) $(id).value = ""; });
    if ($("onb-imp")) $("onb-imp").checked = false;
    $("onb-a-error").hidden = true;
    onbA = { jours: {}, am: false, pm: false };
    paintOnbA();
  }
  function paintOnbA() {
    var wrap = $("onb-jours");
    wrap.innerHTML = "";
    JOUR_ORDER.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "jour-btn" + (onbA.jours[d] ? " on" : "");
      b.textContent = JOUR_LETTERS[d];
      b.setAttribute("aria-label", JOUR_NAMES[d]);
      b.setAttribute("aria-pressed", onbA.jours[d] ? "true" : "false");
      b.setAttribute("data-d", String(d));
      b.addEventListener("click", function () { onbA.jours[d] = !onbA.jours[d]; paintOnbA(); });
      wrap.appendChild(b);
    });
    $("onb-am").classList.toggle("on", onbA.am);
    $("onb-am").setAttribute("aria-pressed", onbA.am ? "true" : "false");
    $("onb-pm").classList.toggle("on", onbA.pm);
    $("onb-pm").setAttribute("aria-pressed", onbA.pm ? "true" : "false");
  }
  $("onb-am").addEventListener("click", function () { onbA.am = !onbA.am; paintOnbA(); });
  $("onb-pm").addEventListener("click", function () { onbA.pm = !onbA.pm; paintOnbA(); });
  $("btn-onb-a1").addEventListener("click", function () {
    if (!$("onb-prenom").value.trim() && !$("onb-nom").value.trim()) {
      $("onb-a-error").textContent = "Indiquez au moins un prénom ou un nom.";
      $("onb-a-error").hidden = false;
      return;
    }
    $("onb-a-error").hidden = true;
    onbShowStep("a2");
    setTimeout(function () { try { $("onb-adresse").focus(); } catch (e) {} }, 120);
  });
  $("btn-onb-a2").addEventListener("click", function () { onbShowStep("a3"); });
  $("btn-onb-a3").addEventListener("click", function () { onbShowStep("a4"); });
  $("btn-onb-notel").addEventListener("click", function () { $("onb-tel").value = ""; onbShowStep("a4"); });
  $("btn-onb-a4").addEventListener("click", function () { onbShowStep("a5"); });
  $("btn-onb-a5").addEventListener("click", function () {
    var jours = Object.keys(onbA.jours).filter(function (k) { return onbA.jours[k]; }).map(Number);
    if (jours.length === 7) jours = [];
    var cre = null;
    var h = $("onb-heure").value;
    var imp = $("onb-imp").checked;
    if (/^\d{2}:\d{2}$/.test(h)) {
      var c = timeToCr(hmToMin(h), null, imp);
      if (c) { cre = {}; cre[halfOfStart(c.s)] = c; }
    }
    var slot = "both";
    if (onbA.am && !onbA.pm) slot = "am";
    else if (onbA.pm && !onbA.am) slot = "pm";
    else if (!onbA.am && !onbA.pm && cre) slot = cre.am ? "am" : "pm";
    var row = {
      prenom: $("onb-prenom").value.trim(), nom: $("onb-nom").value.trim(),
      adresse: $("onb-adresse").value.trim(), tel: $("onb-tel").value.trim(),
      jours: jours, tourSlot: slot, creneaux: cre, remarques: $("onb-rem").value.trim(),
      ordoExp: /^\d{4}-\d{2}-\d{2}$/.test($("onb-ordo").value) ? $("onb-ordo").value : ""
    };
    var p = makePatientFromRow(row, Date.now());
    state.patients.push(p);
    render();
    persist(false);
    syncWatchToIdb();
    queueGeocode(p.id);
    onb.aCount++;
    $("onb-a6-text").textContent = displayName(p) + " est dans votre tournée.";
    onb.hist = [];
    onbShowStep("a6", true);
  });
  $("btn-onb-next-patient").addEventListener("click", function () { resetOnbA(); onb.hist = []; onbShowStep("a1", true); });
  $("btn-onb-a-done").addEventListener("click", afterPathDone);

  /* Contacts du téléphone (Chrome Android) : elle coche elle-même chaque contact. */
  $("btn-onb-contacts").addEventListener("click", async function () {
    if (!contactsSupported()) return;
    try {
      var want = ["name", "tel"];
      try {
        var props = await navigator.contacts.getProperties();
        if (props && props.indexOf("address") >= 0) want.push("address");
      } catch (eP) {}
      var list = await navigator.contacts.select(want, { multiple: true });
      if (!list || !list.length) return;
      var rows = list.map(contactToRow).filter(function (r) { return r.nom || r.prenom || r.tel; });
      if (!rows.length) { toast("Aucun contact utilisable."); return; }
      startReview(rows, "contacts");
    } catch (e) {
      toast("Contacts indisponibles sur ce téléphone.");
    }
  });
  function contactToRow(c) {
    var name = String((c.name && c.name[0]) || "").trim();
    var sp = name ? IMP.splitName(name.split(/\s+/), false) : { nom: "", prenom: "" };
    var tel = c.tel && c.tel[0] ? IMP.fmtTel(c.tel[0]) : "";
    var adr = "";
    var a = c.address && c.address[0];
    if (a) {
      var line = (a.addressLine || []).join(" ").trim();
      var pc = String(a.postalCode || "").trim();
      var city = String(a.city || "").trim();
      adr = [line, (pc + " " + city).trim()].filter(Boolean).join(", ");
    }
    var fam = [];
    (c.tel || []).slice(1, 4).forEach(function (t) { fam.push({ label: "Autre n°", tel: IMP.fmtTel(t) }); });
    var warn = [];
    if (!adr) warn.push("noaddr");
    if (sp.warn) warn.push("nom");
    warn.push("jours");
    return { prenom: sp.prenom || "", nom: sp.nom || "", tel: tel, adresse: adr, jours: [], tourSlot: "", creneaux: null, ordoExp: "", ordoExp2: "", remarques: "", famille: fam, medecin: "", medecinTel: "", warn: warn };
  }

  /* —— Parcours B : coller une note —— */
  $("btn-onb-b1").addEventListener("click", function () { onbShowStep("b2"); });
  $("btn-onb-copy-ex").addEventListener("click", function () {
    var ex = IMP.EXAMPLE;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ex).then(function () { toast("Exemple copié."); }, function () { toast("Copie impossible : sélectionnez l’exemple."); });
    } else toast("Copie impossible : sélectionnez l’exemple.");
  });
  $("btn-onb-b2").addEventListener("click", function () {
    onbShowStep("b3");
    setTimeout(function () { try { $("onb-paste").focus(); } catch (e) {} }, 120);
  });
  $("btn-onb-clip").addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) {
        if (t && t.trim()) { $("onb-paste").value = t; $("onb-b3-error").hidden = true; }
        else toast("Le presse-papiers est vide.");
      }, function () { toast("Appui long dans le cadre, puis Coller."); });
    } else toast("Appui long dans le cadre, puis Coller.");
  });
  $("btn-onb-parse").addEventListener("click", function () {
    var t = $("onb-paste").value;
    if (!t.trim()) {
      $("onb-b3-error").textContent = "Collez d’abord votre note dans le cadre.";
      $("onb-b3-error").hidden = false;
      return;
    }
    var rows = IMP.parseList(t, { today: todayISO() });
    if (!rows.length) {
      $("onb-b3-error").textContent = "Aucun patient trouvé. Vérifiez qu’il y a un nom par patient.";
      $("onb-b3-error").hidden = false;
      return;
    }
    $("onb-b3-error").hidden = true;
    startReview(rows, "paste");
  });

  /* —— Fichier CSV (et .xlsx simple) lu sur le téléphone —— */
  function resetOnbFile() {
    onb.csv = null;
    $("onb-file-input").value = "";
    $("onb-file-name").textContent = "";
    $("onb-file-error").hidden = true;
    $("onb-map").hidden = true;
    $("onb-map").innerHTML = "";
    $("btn-onb-file-go").hidden = true;
  }
  $("btn-onb-file-pick").addEventListener("click", function () { $("onb-file-input").click(); });
  $("onb-file-input").addEventListener("change", async function () {
    var f = this.files && this.files[0];
    if (!f) return;
    resetOnbFileKeepInput();
    $("onb-file-name").textContent = f.name;
    try {
      var buf = await f.arrayBuffer();
      var u8 = new Uint8Array(buf);
      var parsed;
      if (/\.xlsx$/i.test(f.name) || (u8[0] === 0x50 && u8[1] === 0x4b)) {
        var rowsX;
        try { rowsX = await IMP.readXlsx(buf); }
        catch (eX) { throw new Error("xlsx"); }
        var g = IMP.guessMapping(rowsX[0] || []);
        parsed = { rows: rowsX, header: g.header, map: g.map };
      } else {
        parsed = IMP.parseCsv(IMP.decodeBytes(buf));
      }
      if (!parsed.rows.length) throw new Error("vide");
      onb.csv = parsed;
      paintMapping();
    } catch (e) {
      $("onb-file-error").textContent = (e && e.message === "xlsx")
        ? "Ce fichier Excel n’a pas pu être lu sur ce téléphone. Dans Excel : Fichier → Enregistrer sous → CSV, puis importez le CSV."
        : "Fichier illisible. Utilisez un fichier CSV (séparateur ; ou ,) ou Excel .xlsx.";
      $("onb-file-error").hidden = false;
    }
  });
  function resetOnbFileKeepInput() {
    onb.csv = null;
    $("onb-file-error").hidden = true;
    $("onb-map").hidden = true;
    $("onb-map").innerHTML = "";
    $("btn-onb-file-go").hidden = true;
  }
  function paintMapping() {
    var wrap = $("onb-map");
    wrap.innerHTML = "";
    var c = onb.csv;
    if (!c.header) {
      var p0 = document.createElement("p");
      p0.className = "hint";
      p0.textContent = "Pas d’en-tête de colonnes reconnu : chaque ligne sera lue comme une note collée.";
      wrap.appendChild(p0);
    } else {
      var p1 = document.createElement("p");
      p1.className = "hint";
      p1.textContent = "Colonnes trouvées : vérifiez à quoi chacune correspond.";
      wrap.appendChild(p1);
      (c.rows[0] || []).forEach(function (h, i) {
        var row = document.createElement("div");
        row.className = "onb-map-row";
        var lab = document.createElement("span");
        lab.textContent = h || ("Colonne " + (i + 1));
        var sel = document.createElement("select");
        sel.setAttribute("data-col", String(i));
        IMP.FIELDS.concat([["remarques_col", "Dans les remarques"]]).forEach(function (fd) {
          var o = document.createElement("option");
          o.value = fd[0];
          o.textContent = fd[1];
          sel.appendChild(o);
        });
        sel.value = c.map[i] || "remarques_col";
        sel.addEventListener("change", function () { c.map[i] = sel.value; });
        row.appendChild(lab);
        row.appendChild(sel);
        wrap.appendChild(row);
      });
    }
    var n = Math.max(0, c.rows.length - (c.header ? 1 : 0));
    var p2 = document.createElement("p");
    p2.className = "hint";
    p2.textContent = n + " ligne" + (n > 1 ? "s" : "") + " dans le fichier.";
    wrap.appendChild(p2);
    wrap.hidden = false;
    $("btn-onb-file-go").hidden = false;
  }
  $("btn-onb-file-go").addEventListener("click", function () {
    if (!onb.csv) return;
    var rows = onb.csv.header ? IMP.rowsFromTable(onb.csv.rows, onb.csv.map, { today: todayISO() }) : IMP.rowsFromCsv(onb.csv, null, { today: todayISO() });
    if (!rows.length) {
      $("onb-file-error").textContent = "Aucun patient trouvé dans ce fichier.";
      $("onb-file-error").hidden = false;
      return;
    }
    startReview(rows, "file");
  });

  /* —— Revue et correction (rien n’est enregistré avant « Tout est bon ») —— */
  var WARN_TXT = {
    noname: "Nom manquant : complétez ou retirez ce patient.",
    nom: "Prénom et nom : vérifiez qu’ils ne sont pas inversés.",
    noaddr: "Adresse non trouvée.",
    cp: "Adresse sans code postal.",
    adresse: "Adresse à vérifier.",
    jours: "Jours non précisés : tous les jours par défaut.",
    date: "Une date n’a pas été comprise comme fin d’ordonnance (gardée dans les remarques)."
  };
  var WARN_FIELD = { noname: ["prenom", "nom"], nom: ["prenom", "nom"], noaddr: ["adresse"], cp: ["adresse"], adresse: ["adresse"], jours: ["jours"], date: ["remarques"] };
  function rowWarns(r) { return (r.warn || []).filter(function (w) { return WARN_TXT[w]; }); }

  function startReview(rows, source) {
    onb.source = source;
    onb.rows = rows.map(function (r) {
      r._on = true;
      r._dup = "";
      if (!r.jours) r.jours = [];
      return r;
    });
    paintReview();
    onbShowStep("b4");
  }
  function crText(c) { return c ? hmLabel(c.s) + "-" + hmLabel(c.e) : ""; }
  function timeToCr(s, e, imp) {
    if (s == null || s < 0) return null;
    s = Math.floor(s / CRENEAU_STEP) * CRENEAU_STEP;
    var en = e != null && e > s ? Math.ceil(e / CRENEAU_STEP) * CRENEAU_STEP : s + 30;
    return validCr({ s: minToHm(s), e: minToHm(Math.min(en, hmToMin(CRENEAU_CUSTOM.to))), imp: !!imp });
  }
  function parseCrText(t, imp) {
    var m = /(\d{1,2})\s*[h:]\s*(\d{2})?(?:\s*(?:-|à|a|–)\s*(\d{1,2})\s*[h:]?\s*(\d{2})?)?/i.exec(String(t || ""));
    if (!m) return null;
    var s = Number(m[1]) * 60 + Number(m[2] || 0);
    var e = m[3] ? Number(m[3]) * 60 + Number(m[4] || 0) : null;
    return timeToCr(s, e, imp);
  }
  function reviewSummary() {
    var on = onb.rows.filter(function (r) { return r._on; });
    var chk = on.filter(function (r) { return rowWarns(r).length; }).length;
    var n = on.length;
    var txt = n + " patient" + (n > 1 ? "s" : "") + " trouvé" + (n > 1 ? "s" : "");
    txt += chk ? ", " + chk + " à vérifier. Touchez un champ orange pour le corriger." : ". Tout semble bon : relisez puis validez.";
    $("onb-b4-sum").textContent = txt;
  }
  function paintReview() {
    var wrap = $("onb-review");
    wrap.innerHTML = "";
    var split = splitToursOn();
    onb.rows.forEach(function (r, idx) {
      var card = document.createElement("div");
      card.className = "onbr-row";
      card.setAttribute("data-i", String(idx));
      function syncCls() {
        card.classList.toggle("off", !r._on);
        card.classList.toggle("warn", r._on && rowWarns(r).length > 0);
      }
      var head = document.createElement("div");
      head.className = "onbr-row-head";
      var nm = document.createElement("strong");
      function paintName() { nm.textContent = (idx + 1) + ". " + (((r.prenom || "") + " " + (r.nom || "")).trim() || "Sans nom"); }
      paintName();
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "imp-rm";
      function paintRm() { rm.textContent = r._on ? "Retirer ce patient" : "Remettre"; }
      paintRm();
      rm.addEventListener("click", function () { r._on = !r._on; paintRm(); syncCls(); reviewSummary(); });
      head.appendChild(nm);
      head.appendChild(rm);
      card.appendChild(head);
      var why = document.createElement("p");
      why.className = "imp-why";
      function paintWhy() {
        var ws = rowWarns(r).map(function (w) { return WARN_TXT[w]; });
        why.textContent = ws.join(" ");
        why.hidden = !ws.length;
        Array.prototype.forEach.call(card.querySelectorAll("[data-f]"), function (el) {
          var f = el.getAttribute("data-f");
          var bad = rowWarns(r).some(function (w) { return (WARN_FIELD[w] || []).indexOf(f) >= 0; });
          el.classList.toggle("f-warn", bad);
        });
        syncCls();
      }
      function clearWarn(field) {
        r.warn = (r.warn || []).filter(function (w) {
          if (field === "nom" || field === "prenom") {
            if (w === "nom") return false;
            if (w === "noname") return !(r.nom || r.prenom);
          }
          if (field === "adresse" && (w === "noaddr" || w === "cp" || w === "adresse")) return !r.adresse;
          if (field === "jours" && w === "jours") return false;
          if (field === "remarques" && w === "date") return false;
          return true;
        });
        paintWhy();
        reviewSummary();
      }
      function input(label, field, opts) {
        opts = opts || {};
        var box = document.createElement("div");
        var l = document.createElement("label");
        l.textContent = label;
        var el = document.createElement(opts.area ? "textarea" : "input");
        if (opts.type) el.type = opts.type;
        if (opts.max) el.maxLength = opts.max;
        el.value = r[field] || "";
        el.setAttribute("data-f", field);
        el.autocomplete = "off";
        el.addEventListener("input", function () {
          r[field] = el.value;
          if (field === "nom" || field === "prenom") paintName();
          clearWarn(field);
        });
        box.appendChild(l);
        box.appendChild(el);
        return box;
      }
      var two = document.createElement("div");
      two.className = "imp-two";
      two.appendChild(input("Prénom", "prenom", { max: 80 }));
      two.appendChild(input("Nom", "nom", { max: 80 }));
      card.appendChild(two);
      card.appendChild(input("Adresse", "adresse", { max: 200 }));
      card.appendChild(input("Téléphone", "tel", { type: "tel", max: 24 }));
      var lj = document.createElement("label");
      lj.textContent = "Jours (aucun touché = tous les jours)";
      card.appendChild(lj);
      var jw = document.createElement("div");
      jw.className = "jours";
      jw.setAttribute("data-f", "jours");
      function paintJ() {
        jw.innerHTML = "";
        JOUR_ORDER.forEach(function (d) {
          var on = r.jours.indexOf(d) >= 0;
          var b = document.createElement("button");
          b.type = "button";
          b.className = "jour-btn" + (on ? " on" : "");
          b.textContent = JOUR_LETTERS[d];
          b.setAttribute("aria-label", JOUR_NAMES[d]);
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.addEventListener("click", function () {
            var k = r.jours.indexOf(d);
            if (k >= 0) r.jours.splice(k, 1); else r.jours.push(d);
            if (r.jours.length === 7) r.jours = [];
            paintJ();
            clearWarn("jours");
          });
          jw.appendChild(b);
        });
      }
      paintJ();
      card.appendChild(jw);
      if (split) {
        var ls = document.createElement("label");
        ls.textContent = "Tournée";
        var sel = document.createElement("select");
        [["both", "Matin et soir"], ["am", "Matin"], ["pm", "Soir"]].forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0];
          op.textContent = o[1];
          sel.appendChild(op);
        });
        sel.value = r.tourSlot || "both";
        sel.setAttribute("data-f", "tourSlot");
        sel.addEventListener("change", function () { r.tourSlot = sel.value; });
        card.appendChild(ls);
        card.appendChild(sel);
      }
      var cr = r.creneaux || {};
      var two2 = document.createElement("div");
      two2.className = "imp-two";
      ["am", "pm"].forEach(function (h) {
        var box = document.createElement("div");
        var l = document.createElement("label");
        l.textContent = h === "am" ? "Heure matin" : "Heure après-midi";
        var el = document.createElement("input");
        el.value = crText(cr[h]);
        el.placeholder = h === "am" ? "8h-8h30" : "17h-17h30";
        el.setAttribute("data-f", "cr-" + h);
        el.addEventListener("change", function () {
          var imp = !!(r.creneaux && ((r.creneaux.am && r.creneaux.am.imp) || (r.creneaux.pm && r.creneaux.pm.imp)));
          var c = el.value.trim() ? parseCrText(el.value, imp) : null;
          if (el.value.trim() && !c) { toast("Heure non comprise (ex. 8h-8h30, entre 6h et 21h)."); el.value = crText(r.creneaux && r.creneaux[h]); return; }
          r.creneaux = r.creneaux || {};
          if (c) r.creneaux[h] = c; else delete r.creneaux[h];
          if (!r.creneaux.am && !r.creneaux.pm) r.creneaux = null;
          el.value = crText(c);
        });
        box.appendChild(l);
        box.appendChild(el);
        two2.appendChild(box);
      });
      card.appendChild(two2);
      var impL = document.createElement("label");
      impL.className = "onb-check";
      var impC = document.createElement("input");
      impC.type = "checkbox";
      impC.checked = !!((cr.am && cr.am.imp) || (cr.pm && cr.pm.imp));
      impC.addEventListener("change", function () {
        if (!r.creneaux) return;
        if (r.creneaux.am) r.creneaux.am.imp = impC.checked;
        if (r.creneaux.pm) r.creneaux.pm.imp = impC.checked;
      });
      impL.appendChild(impC);
      impL.appendChild(document.createTextNode(" Heure impérative"));
      card.appendChild(impL);
      var two3 = document.createElement("div");
      two3.className = "imp-two";
      two3.appendChild(input("Fin d’ordonnance", "ordoExp", { type: "date" }));
      two3.appendChild(input("Fin d’ordonnance 2", "ordoExp2", { type: "date" }));
      card.appendChild(two3);
      card.appendChild(input("Remarques", "remarques", { area: true, max: 400 }));
      if (r.famille && r.famille.length) {
        var pf = document.createElement("p");
        pf.className = "hint";
        pf.textContent = "Autres numéros : " + r.famille.map(function (f) { return (f.label ? f.label + " " : "") + f.tel; }).join(" · ");
        card.appendChild(pf);
      }
      card.appendChild(why);
      paintWhy();
      wrap.appendChild(card);
    });
    reviewSummary();
  }
  $("btn-onb-b4").addEventListener("click", function () {
    var on = onb.rows.filter(function (r) { return r._on; });
    if (!on.length) { toast("Aucun patient gardé."); return; }
    var noName = on.filter(function (r) { return !String(r.nom || "").trim() && !String(r.prenom || "").trim(); });
    if (noName.length) {
      toast(noName.length + " patient" + (noName.length > 1 ? "s" : "") + " sans nom : complétez ou retirez.");
      var idx = onb.rows.indexOf(noName[0]);
      var el = document.querySelector('#onb-review .onbr-row[data-i="' + idx + '"]');
      if (el) try { el.scrollIntoView({ block: "center" }); } catch (e) {}
      return;
    }
    on.forEach(function (r) { r.nom = String(r.nom || "").trim(); r.prenom = String(r.prenom || "").trim(); });
    IMP.findDuplicates(on, livingPatients());
    var dups = on.filter(function (r) { return r.dupOf || r.dupIn >= 0; });
    if (!dups.length) { saveImport(); return; }
    paintDups(on, dups);
    onbShowStep("b5");
  });
  function paintDups(on, dups) {
    var wrap = $("onb-dups");
    wrap.innerHTML = "";
    dups.forEach(function (r, k) {
      var card = document.createElement("div");
      card.className = "onbr-row warn";
      var t = document.createElement("strong");
      t.textContent = ((r.prenom || "") + " " + (r.nom || "")).trim();
      card.appendChild(t);
      var p = document.createElement("p");
      p.className = "hint";
      var ex = r.dupOf ? patientById(r.dupOf) : null;
      var opts;
      if (ex) {
        p.textContent = "Ressemble à « " + displayName(ex) + " »" + (ex.adresse ? " · " + ex.adresse : "") + ".";
        opts = [["keep", "Garder l’existant"], ["replace", "Remplacer"], ["create", "Créer quand même"]];
        if (!r._dup) r._dup = "keep";
      } else {
        p.textContent = "Déjà plus haut dans la note.";
        opts = [["skip", "Ne le garder qu’une fois"], ["create", "Créer quand même"]];
        if (!r._dup) r._dup = "skip";
      }
      card.appendChild(p);
      var box = document.createElement("div");
      box.className = "imp-dup-choices";
      opts.forEach(function (o) {
        var l = document.createElement("label");
        var rb = document.createElement("input");
        rb.type = "radio";
        rb.name = "dup-" + k;
        rb.value = o[0];
        rb.checked = r._dup === o[0];
        rb.addEventListener("change", function () { if (rb.checked) r._dup = o[0]; });
        l.appendChild(rb);
        l.appendChild(document.createTextNode(" " + o[1]));
        box.appendChild(l);
      });
      card.appendChild(box);
      wrap.appendChild(card);
    });
  }
  $("btn-onb-b5").addEventListener("click", saveImport);

  function cleanCreneaux(c) {
    if (!c) return undefined;
    var out = {};
    if (c.am) { var a = validCr(c.am); if (a) out.am = a; }
    if (c.pm) { var b = validCr(c.pm); if (b) out.pm = b; }
    return (out.am || out.pm) ? out : undefined;
  }
  function cleanIso(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : ""; }
  /* Même modèle que « + Patient » (champs minimaux). */
  function makePatientFromRow(r, now) {
    var o1 = cleanIso(r.ordoExp), o2 = cleanIso(r.ordoExp2);
    if (!o1 && o2) { o1 = o2; o2 = ""; }
    var jours = (r.jours || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; });
    if (jours.length === 7) jours = [];
    var al = r.alerte && r.alerte.t ? { t: String(r.alerte.t).slice(0, 60), d: cleanIso(r.alerte.d) || todayISO() } : undefined;
    return {
      id: uid(),
      prenom: String(r.prenom || "").trim().slice(0, 80),
      nom: String(r.nom || "").trim().slice(0, 80),
      tel: String(r.tel || "").trim().slice(0, 24),
      medecin: String(r.medecin || "").trim().slice(0, 80),
      medecinTel: String(r.medecinTel || "").trim().slice(0, 24),
      famille: (r.famille || []).filter(function (f) { return f && f.tel; }).slice(0, MAX_FAMILLE).map(function (f) { return { label: String(f.label || "").slice(0, 40), tel: String(f.tel).slice(0, 24) }; }),
      jours: jours,
      adresse: String(r.adresse || "").trim().slice(0, 200),
      remarques: String(r.remarques || "").trim().slice(0, 400),
      ordoExp: o1,
      ordoExp2: o2 || undefined,
      creneaux: cleanCreneaux(r.creneaux),
      alerte: al,
      photos: [],
      tourSlot: splitToursOn() ? (r.tourSlot === "am" || r.tourSlot === "pm" ? r.tourSlot : "both") : "both",
      example: false,
      actif: r.actif !== false,
      updatedAt: now,
      lat: null,
      lng: null,
      geoQ: ""
    };
  }

  function ensureImports() { if (!Array.isArray(state.imports)) state.imports = []; }
  function saveImport() {
    var now = Date.now();
    var impId = uid();
    var ids = [], repl = [], prev = {};
    onb.rows.forEach(function (r) {
      if (!r._on) return;
      if (r._dup === "keep" || r._dup === "skip") return;
      if (r._dup === "replace" && r.dupOf) {
        var cur = patientById(r.dupOf);
        if (cur) {
          prev[cur.id] = JSON.parse(JSON.stringify(cur));
          var np = makePatientFromRow(r, now);
          ["prenom", "nom", "tel", "adresse", "jours", "remarques", "ordoExp", "tourSlot"].forEach(function (k) { cur[k] = np[k]; });
          if (np.ordoExp2) cur.ordoExp2 = np.ordoExp2; else delete cur.ordoExp2;
          if (np.creneaux) cur.creneaux = np.creneaux; else delete cur.creneaux;
          if (np.famille.length) cur.famille = np.famille;
          if (np.medecin) cur.medecin = np.medecin;
          if (np.medecinTel) cur.medecinTel = np.medecinTel;
          if (normAddr(cur.adresse) !== cur.geoQ) { cur.lat = null; cur.lng = null; cur.geoQ = ""; }
          cur.example = false;
          cur.updatedAt = now;
          repl.push(cur.id);
          return;
        }
      }
      var p = makePatientFromRow(r, now);
      state.patients.push(p);
      ids.push(p.id);
    });
    if (!ids.length && !repl.length) { toast("Aucun patient à enregistrer."); return; }
    ensureImports();
    state.imports.push({ id: impId, at: now, by: localDisplayName() || "", src: onb.source || "", ids: ids, prev: prev, undone: 0 });
    state.imports = mergeImports(state.imports, []);
    render();
    persist(false);
    syncWatchToIdb();
    /* Placement sur la carte après l’enregistrement, comme pour « + Patient ». */
    ids.concat(repl).forEach(function (id) { queueGeocode(id); });
    var n = ids.length + repl.length;
    $("onb-b6-text").textContent = n + " patient" + (n > 1 ? "s sont" : " est") + " dans votre tournée." +
      (repl.length ? " Dont " + repl.length + " fiche" + (repl.length > 1 ? "s" : "") + " remplacée" + (repl.length > 1 ? "s" : "") + "." : "");
    onb.rows = [];
    $("onb-review").innerHTML = "";
    $("onb-dups").innerHTML = "";
    $("onb-paste").value = "";
    onb.hist = [];
    onbShowStep("b6", true);
  }
  $("btn-onb-b6").addEventListener("click", afterPathDone);

  function mergeImports(a, b) {
    var map = {};
    var cutoff = Date.now() - (IMPORT_UNDO_DAYS + 1) * 86400000;
    (a || []).concat(b || []).forEach(function (r) {
      if (!r || !r.id || !(r.at > cutoff)) return;
      var p = map[r.id];
      if (!p) { map[r.id] = r; return; }
      if ((r.undone || 0) > (p.undone || 0)) {
        var c = {};
        Object.keys(p).forEach(function (k) { c[k] = p[k]; });
        c.undone = r.undone;
        map[r.id] = c;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return x.at - y.at; }).slice(-10);
  }

  /* 1.99.1 : bouton d’annulation d’import retiré à la demande ; state.imports reste synchronisé, inerte. */
  $("btn-menu").addEventListener("click", function () {
    if ($("menu-aide")) $("menu-aide").hidden = isKicked();
  });

  /* Carte « Ajouter mes patients » : nouveau cabinet, tant que la tournée est vide. */
  function renderOnbCard() {
    var el = $("onb-card");
    if (!el) return;
    var t = cabTopic();
    var on = !!t && lsGet(LS_ONB_CARD) === t && unlocked && !isKicked();
    if (on && livingPatients().length) { lsSet(LS_ONB_CARD, ""); on = false; }
    el.hidden = !(on && currentTab === "tournee");
  }

  if (!cguAccepted()) {
    openCgu(false);
  } else {
    continueAfterCgu();
  }
})();
