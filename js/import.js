/* Vydel 1.99 — import de patients : découpage 100 % local (règles simples, sans IA, sans OCR, sans réseau).
   Aucune donnée n’est envoyée nulle part depuis ce fichier. Ne pas journaliser de données patient. */
(function (root) {
  "use strict";

  /* —— Pliage (minuscules, sans accents) en gardant la même longueur —— */
  var ACC = { "à": "a", "â": "a", "ä": "a", "á": "a", "ã": "a", "å": "a", "ç": "c", "é": "e", "è": "e", "ê": "e", "ë": "e", "î": "i", "ï": "i", "í": "i", "ì": "i", "ô": "o", "ö": "o", "ó": "o", "ò": "o", "õ": "o", "û": "u", "ù": "u", "ü": "u", "ú": "u", "ÿ": "y", "ñ": "n", "œ": "o", "æ": "a", "’": "'", "‘": "'", "–": "-", "—": "-" };
  function fold(s) {
    s = String(s || "");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var l = c.toLowerCase();
      if (l.length !== 1) l = c;
      out += ACC[l] || l;
    }
    return out;
  }
  function squash(s) { return String(s || "").replace(/[ \t\u00a0]+/g, " ").trim(); }

  var DAY_WORDS = { lundi: 1, lun: 1, mardi: 2, mar: 2, mercredi: 3, mer: 3, jeudi: 4, jeu: 4, vendredi: 5, ven: 5, samedi: 6, sam: 6, dimanche: 0, dim: 0 };
  var DAY_FULL = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
  var DAY_RE_SRC = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim";
  var MONTHS = { janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, sep: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
  var STREET_STRONG = "rue|avenue|av|ave|bd|boulevard|bld|blvd|chemin|chem|allee|allees|impasse|imp|route|rte|quai|traverse|trav|montee|square|esplanade|promenade|prom|corniche|faubourg|fbg|descente|ruelle|sentier|passage|place|pl|cours|residence|res|lotissement|lot|hameau|cite|clos|parc|domaine|villa|voie|lieu-dit|parvis|rond-point|carrefour|vallon|plateau|cour";
  var STOP_WORDS = ["tel", "tél", "telephone", "portable", "mobile", "fixe", "port", "ordo", "ordonnance", "jusqu", "fin", "code", "digicode", "interphone", "etage", "bat", "batiment", "escalier", "esc", "apt", "appt", "appartement", "porte", "chez", "matin", "soir", "midi", "aprem", "apres-midi", "apres", "tous", "tlj", "les", "le", "du", "au", "de", "et", "a", "vers", "passage", "passages", "cle", "chien", "chat", "attention", "prevoir", "soins", "soin", "injection", "insuline", "pansement", "toilette", "prise", "glycemie", "dextro", "pilulier", "semaine", "week-end", "weekend", "imperatif", "precis", "pile", "rdv", "medecin", "dr", "docteur", "fille", "fils", "voisin", "voisine", "mari", "epouse", "femme", "frere", "soeur", "niece", "neveu", "aidant", "gardien", "gardienne", "famille", "urgence", "infos", "info", "remarque", "remarques", "note", "notes", "nb", "rem", "ok", "jours", "jour", "horaire", "horaires", "heure", "creneau", "adresse"];
  var STOP = {};
  STOP_WORDS.forEach(function (w) { STOP[w] = true; });
  Object.keys(DAY_WORDS).forEach(function (w) { STOP[w] = true; });
  var COUNTRY = { france: 1, monaco: 1, italie: 1, belgique: 1, suisse: 1 };
  var TITLES = /^(?:mme|madame|mlle|mademoiselle|mr|monsieur|m|mm)\.?$/;
  var PARTICLES = { de: 1, du: 1, des: 1, la: 1, le: 1, "d'": 1, van: 1, von: 1, di: 1, da: 1, del: 1, dos: 1, ben: 1, el: 1 };
  var FAMILY_RE = /\b(fille|fils|voisin|voisine|mari|epoux|epouse|femme|conjoint|conjointe|frere|soeur|niece|neveu|petite?-?fille|petit-?fils|belle-?fille|gendre|aidant|aidante|gardien|gardienne|tuteur|tutrice|curateur|curatrice|famille|urgence|proche|ami|amie|auxiliaire|aide|concierge|enfant|parent|pere|mere)\b/;
  var MED_RE = /\b(medecin|dr|docteur|generaliste|cabinet medical)\b/;
  var OWN_RE = /\b(fixe|domicile|portable|mobile|perso|maison|tel|telephone)\b/;

  /* Prénoms courants (aide à distinguer prénom / nom quand rien n’est en majuscules). */
  var PRENOMS = {};
  ("jeanne marie anne catherine francoise monique nicole sylvie isabelle nathalie christine martine michele jacqueline danielle sandrine valerie veronique sophie stephanie celine helene brigitte chantal patricia nadine josiane colette simone yvette odette paulette denise suzanne germaine madeleine marcelle lucienne georgette raymonde andree ginette huguette renee therese claudine evelyne genevieve annie elisabeth laurence florence christiane bernadette yvonne louise alice rose lucie julie camille lea emma chloe manon sarah laura marion pauline aurelie emilie elodie audrey melanie caroline claire agnes beatrice corinne dominique joelle mireille solange arlette eliane josette micheline paule rolande juliette margaux ines jade louna zoe clara eva anna lola nina charlotte mathilde lena romane victoire adele olivia ambre agathe alix gabrielle " +
   "jean pierre michel andre philippe rene louis alain jacques bernard marcel daniel roger robert paul claude christian henri georges nicolas francois patrick gerard christophe joseph lucien maurice raymond guy jules gilbert eric frederic laurent stephane olivier david pascal thierry didier dominique bruno serge yves marc franck sebastien julien thomas antoine alexandre maxime hugo lucas leo gabriel arthur raphael jules adam louis ethan nathan mathis theo noah tom enzo victor leon emile albert fernand armand gaston edouard emile felix lucas martin simon vincent xavier yann gilles jerome fabrice cedric fabien ludovic romain benoit guillaume arnaud damien mickael kevin anthony jordan dylan florian quentin valentin baptiste clement remi samuel benjamin mathieu matthieu jeremy jonathan loic gael axel noel roland marius jean-pierre jean-claude jean-marie jean-paul jean-luc jean-louis jean-jacques jean-michel jean-francois marie-claude marie-therese marie-france marie-christine anne-marie marie-jose marie-louise marie-paule marie-laure").split(" ").forEach(function (n) { if (n) PRENOMS[n] = true; });

  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  function isoOf(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }
  function validYmd(y, m, d) {
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function todayParts(today) {
    var t = today ? new Date(today + "T12:00:00") : new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), iso: isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate()) };
  }
  /* Date sans année : la prochaine occurrence (ou d’il y a moins de 60 jours). */
  function guessYear(m, d, today) {
    var tp = todayParts(today);
    var y = tp.y;
    var iso = isoOf(y, m, d);
    var back = new Date(tp.y, tp.m - 1, tp.d - 60);
    if (new Date(y, m - 1, d) < back) y += 1;
    return y;
  }

  function fmtTel(raw) {
    var d = String(raw || "").replace(/[^\d+]/g, "");
    if (/^\+33/.test(d)) d = "0" + d.slice(3);
    else if (/^0033/.test(d)) d = "0" + d.slice(4);
    d = d.replace(/^0\(0\)/, "0");
    if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    return squash(raw);
  }
  function telDigits(raw) {
    var d = String(raw || "").replace(/[^\d+]/g, "");
    if (/^\+33/.test(d)) d = "0" + d.slice(3);
    else if (/^0033/.test(d)) d = "0" + d.slice(4);
    return d;
  }

  /* —— Heures → créneaux (pas de 15 min, 6h–21h, comme la fiche) —— */
  function hm(n) { return pad2(Math.floor(n / 60)) + ":" + pad2(n % 60); }
  function mkCr(sMin, eMin, imp) {
    var s = Math.floor(sMin / 15) * 15;
    var e = eMin != null ? Math.ceil(eMin / 15) * 15 : s + 30;
    if (s < 360 || s >= 1260) return null;
    if (e <= s) e = s + 30;
    if (e > 1260) e = 1260;
    return { s: hm(s), e: hm(e), imp: !!imp };
  }
  function halfOf(cr) { var p = cr.s.split(":"); return Number(p[0]) * 60 + Number(p[1]) < 780 ? "am" : "pm"; }

  /* —— Découpage du texte en blocs (un patient par ligne, ou par paragraphe) —— */
  var SEP_LINE = /^\s*(?:[-–—_*=~#.•·]{3,}|\s*)\s*$/;
  var BULLET = /^\s*(?:\d{1,3}\s*[.)\-:]\s+|[-–•*·>]\s*|\(\d{1,3}\)\s*)/;

  function stripBullet(l) { return l.replace(BULLET, ""); }

  var PHONE_SRC = "(?:\\+\\s?33\\s?(?:\\(0\\)\\s?)?|0033\\s?|\\b0)[1-9](?:[\\s.\\-/]?\\d{2}){4}(?!\\d)";

  function hasPhone(s) { return new RegExp(PHONE_SRC).test(s); }
  function hasStreet(f) { return new RegExp("(?:^|[^a-z0-9])\\d{1,4}\\s?(?:bis|ter|b|a)?\\s*,?\\s+(?:" + STREET_STRONG + ")\\b").test(f) || /\b\d{5}\s+[a-z]/.test(f); }
  function hasDays(f) { return new RegExp("\\b(?:" + DAY_RE_SRC + ")\\b|tous les jours|\\btlj\\b|7\\s?j\\s?/\\s?7").test(f); }
  function hasTime(f) { return /\b\d{1,2}\s?(?:h|:)\s?\d{0,2}\b/.test(f) || /\b(?:matin|soir|apres-midi|aprem)\b/.test(f); }

  function nameLikeLine(line) {
    var l = squash(stripBullet(line)).replace(/[,;:]+$/, "");
    if (!l || /\d/.test(l) || l.length > 60) return false;
    var words = l.split(/\s+/);
    if (words.length > 5) return false;
    var real = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var f = fold(w).replace(/[.,]/g, "");
      if (TITLES.test(f)) { real += 0; continue; }
      if (PARTICLES[f]) continue;
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’\-.]+$/.test(w)) return false;
      if (w.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 2) return false;
      if (w.charAt(0) !== w.charAt(0).toUpperCase() || w.charAt(0) === w.charAt(0).toLowerCase()) return false;
      if ((STOP[f] && !isUpperWord(w)) || MONTHS[f] || COUNTRY[f]) return false;
      real++;
    }
    return real >= 1;
  }
  function titleStart(line) { return /^\s*(?:mme|madame|mlle|mademoiselle|mr|monsieur|m\.)\s/i.test(stripBullet(line)); }
  function dataScore(line) {
    var f = fold(line);
    var n = 0;
    if (hasPhone(line)) n++;
    if (hasStreet(f)) n++;
    if (hasDays(f) || hasTime(f)) n++;
    return n;
  }
  function hardData(line) { return hasPhone(line) || hasStreet(fold(line)); }
  function isUpperWord(w) { var l = String(w || "").replace(/[^A-Za-zÀ-ÿ]/g, ""); return l.length >= 2 && l === l.toUpperCase() && l !== l.toLowerCase(); }
  function startsWithName(line) {
    var l = squash(stripBullet(line));
    var m = /^((?:(?:mme|madame|mlle|mademoiselle|mr|monsieur|m)\.?\s+)?[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+){0,3})/i.exec(l);
    if (!m) return false;
    var w0 = m[1].split(/\s+/)[0];
    var first = fold(w0).replace(/\.$/, "");
    if ((STOP[first] && !isUpperWord(w0)) || MONTHS[first] || COUNTRY[first]) return false;
    return /^[A-ZÀ-ÖØ-Þ]/.test(l) || titleStart(l);
  }
  function headerLine(line) {
    var l = squash(line);
    if (!/:\s*$/.test(l) || /\d{2}/.test(l) || l.length > 50) return null;
    var f = fold(l);
    var ctx = {};
    var days = parseDays(l, f).days;
    if (days) ctx.jours = days;
    if (/\bmatin\b/.test(f) && !/\bsoir\b|apres-midi|aprem/.test(f)) ctx.tourSlot = "am";
    else if (/\bsoir\b|apres-midi|aprem/.test(f) && !/\bmatin\b/.test(f)) ctx.tourSlot = "pm";
    return ctx;
  }

  function splitBlocks(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").split("\n");
    var groups = [];
    var cur = [];
    lines.forEach(function (l) {
      if (SEP_LINE.test(l)) { if (cur.length) groups.push(cur); cur = []; }
      else cur.push(l.replace(/\s+$/, ""));
    });
    if (cur.length) groups.push(cur);
    var blocks = [];
    var ctx = {};
    groups.forEach(function (g) {
      /* En-têtes de section (« Matin : », « Lundi, mercredi : ») : appliqués aux patients suivants. */
      while (g.length && headerLine(g[0]) && !hardData(g[0])) {
        ctx = headerLine(g[0]);
        g = g.slice(1);
      }
      if (!g.length) return;
      var lineMode = false;
      if (g.length >= 2) {
        var full = 0, names = 0;
        g.forEach(function (l) {
          if (startsWithName(l) && dataScore(l) >= 1) full++;
          if (nameLikeLine(l)) names++;
        });
        if (full / g.length >= 0.6 || names === g.length) lineMode = true;
      }
      if (lineMode) {
        g.forEach(function (l) {
          var h = headerLine(l);
          if (h && !hardData(l)) { ctx = h; return; }
          blocks.push({ lines: [l], ctx: ctx });
        });
        return;
      }
      /* Paragraphes collés sans ligne vide : nouveau patient quand une ligne « nom » (ou numérotée)
         arrive alors que le patient en cours a déjà un nom et au moins une donnée. */
      var b = [];
      var bHasName = false, bHasData = false;
      g.forEach(function (l) {
        var h = headerLine(l);
        if (h && !hardData(l)) {
          if (b.length) blocks.push({ lines: b, ctx: ctx });
          b = []; bHasName = false; bHasData = false;
          ctx = h;
          return;
        }
        var numbered = /^\s*(?:\d{1,3}\s*[.)]\s+|\(\d{1,3}\)\s*)/.test(l);
        var isName = nameLikeLine(l) || (titleStart(l) && !dataScore(l));
        var startsNew = b.length && ((numbered && (bHasName || bHasData)) || (isName && bHasName && bHasData) || (startsWithName(l) && dataScore(l) >= 2 && bHasName && bHasData));
        if (startsNew) { blocks.push({ lines: b, ctx: ctx }); b = []; bHasName = false; bHasData = false; }
        b.push(l);
        if (isName || (b.length === 1 && startsWithName(l))) bHasName = true;
        if (dataScore(l)) bHasData = true;
      });
      if (b.length) blocks.push({ lines: b, ctx: ctx });
    });
    return blocks;
  }

  /* —— Jours —— */
  function parseDays(orig, f) {
    var set = {};
    var spans = [];
    var any = false;
    var all = false;
    function addSpan(i, j) { spans.push([i, j]); }
    var m;
    var reAll = /\b(?:tous les jours|tlj|7\s?j\s?\/\s?7|7\s?\/\s?7|quotidien(?:ne)?|chaque jour)\b/g;
    while ((m = reAll.exec(f))) { all = true; any = true; addSpan(m.index, m.index + m[0].length); }
    var reWeek = /\b(?:en semaine|du lundi au vendredi|jours ouvres|lun(?:di)?\s?(?:-|a|au|>)\s?ven(?:dredi)?)\b/g;
    var reRange = new RegExp("\\b(?:du\\s+|de\\s+)?(" + DAY_RE_SRC + ")s?\\.?\\s*(?:-|–|au|a|>|->|jusqu'?au)\\s*(" + DAY_RE_SRC + ")s?\\b\\.?", "g");
    while ((m = reRange.exec(f))) {
      var a = DAY_WORDS[m[1]], z = DAY_WORDS[m[2]];
      var order = [1, 2, 3, 4, 5, 6, 0];
      var ia = order.indexOf(a), iz = order.indexOf(z);
      if (ia < 0 || iz < 0) continue;
      if (iz < ia) iz += 7;
      for (var k = ia; k <= iz; k++) set[order[k % 7]] = true;
      any = true;
      addSpan(m.index, m.index + m[0].length);
    }
    while ((m = reWeek.exec(f))) { [1, 2, 3, 4, 5].forEach(function (d) { set[d] = true; }); any = true; addSpan(m.index, m.index + m[0].length); }
    if (/\b(?:week-?end|we)\b/.test(f) && /\bweek-?end\b/.test(f)) {
      var mw = /\bweek-?ends?\b/.exec(f);
      set[6] = true; set[0] = true; any = true; addSpan(mw.index, mw.index + mw[0].length);
    }
    function covered(i) { for (var q = 0; q < spans.length; q++) if (i >= spans[q][0] && i < spans[q][1]) return true; return false; }
    var reDay = new RegExp("\\b(" + DAY_RE_SRC + ")(s)?\\b(\\.)?", "g");
    var cands = [];
    while ((m = reDay.exec(f))) {
      if (covered(m.index)) continue;
      cands.push({ i: m.index, j: m.index + m[0].length, w: m[1], dot: !!m[3] });
    }
    cands.forEach(function (c, idx) {
      var full = !!DAY_FULL[c.w];
      var origTok = orig.substr(c.i, c.w.length);
      var lower = origTok === origTok.toLowerCase();
      var near = cands.some(function (o, oi) { return oi !== idx && Math.abs(o.i - c.i) <= 14; });
      if (full || lower || c.dot || near) {
        set[DAY_WORDS[c.w]] = true;
        any = true;
        addSpan(c.i, c.j);
      }
    });
    /* Lettres : « L M M J V », « L,Ma,Me,J,V » (majuscules seulement, au moins deux). */
    var reL = /(^|[\s(:;,])((?:Ma|Me|Lu|Je|Ve|Sa|Di|L|M|J|V|S|D)(?:\s*[,.\/·\-]?\s*(?:Ma|Me|Lu|Je|Ve|Sa|Di|L|M|J|V|S|D)){1,6})(?=$|[\s),.;])/g;
    while ((m = reL.exec(orig))) {
      var st = m.index + m[1].length;
      if (covered(st)) continue;
      var toks = m[2].split(/[\s,.\/·\-]+/).filter(Boolean);
      var prev = -1;
      var ok = true;
      var got = [];
      toks.forEach(function (t) {
        var d;
        if (t === "L" || t === "Lu") d = 1;
        else if (t === "Ma") d = 2;
        else if (t === "Me") d = 3;
        else if (t === "M") d = prev < 2 ? 2 : 3;
        else if (t === "J" || t === "Je") d = 4;
        else if (t === "V" || t === "Ve") d = 5;
        else if (t === "S" || t === "Sa") d = 6;
        else if (t === "D" || t === "Di") d = 7;
        else ok = false;
        prev = d;
        got.push(d === 7 ? 0 : d);
      });
      if (!ok || got.length < 2) continue;
      got.forEach(function (d) { set[d] = true; });
      any = true;
      addSpan(st, st + m[2].length);
    }
    var days = null;
    if (any) {
      days = Object.keys(set).map(Number);
      if (all || days.length === 7) days = [];
    }
    return { days: days, spans: spans };
  }

  /* —— Heures et demi-journées —— */
  function parseTimes(f) {
    var spans = [];
    var crs = [];
    var m;
    var reR = /\b(?:de\s+|entre\s+)?(\d{1,2})\s?(?:h|:)\s?(\d{2})?\s*(?:-|–|a|à|et|\/|>)\s*(\d{1,2})\s?(?:h|:)?\s?(\d{2})?\b(?!\s*(?:jours?|j\b|min))/g;
    while ((m = reR.exec(f))) {
      var a = Number(m[1]) * 60 + Number(m[2] || 0), b = Number(m[3]) * 60 + Number(m[4] || 0);
      if (Number(m[1]) > 23 || Number(m[3]) > 23 || b <= a || b - a > 240) continue;
      var c = mkCr(a, b);
      if (!c) continue;
      crs.push(c);
      spans.push([m.index, m.index + m[0].length]);
    }
    function covered(i) { for (var q = 0; q < spans.length; q++) if (i >= spans[q][0] && i < spans[q][1]) return true; return false; }
    var reS = /\b(?:vers\s+|a\s+|à\s+)?(\d{1,2})\s?(?:h|:)\s?(\d{2})?\b(?!\s*(?:jours?|min))/g;
    while ((m = reS.exec(f))) {
      if (covered(m.index)) continue;
      var h = Number(m[1]);
      if (h > 23) continue;
      var c2 = mkCr(h * 60 + Number(m[2] || 0), null);
      if (!c2) continue;
      crs.push(c2);
      spans.push([m.index, m.index + m[0].length]);
    }
    var halves = {};
    crs.forEach(function (c) { halves[halfOf(c)] = true; });
    var reSoir = /\b(?:le\s+|l')?(soir|apres-midi|apres midi|aprem|apm|fin d'apres-midi|soiree)\b/g;
    var f2 = f;
    while ((m = reSoir.exec(f))) { halves.pm = true; spans.push([m.index, m.index + m[0].length]); f2 = blank(f2, m.index, m.index + m[0].length); }
    var reMat = /\b(?:le\s+)?(matin|midi|matinee)\b/g;
    while ((m = reMat.exec(f2))) { halves.am = true; spans.push([m.index, m.index + m[0].length]); }
    var reBoth = /\b(?:2|deux)\s?(?:x|fois)\s?(?:\/|par)\s?(?:j|jour)\b/g;
    while ((m = reBoth.exec(f))) { halves.am = true; halves.pm = true; spans.push([m.index, m.index + m[0].length]); }
    var imp = false;
    var reImp = /\b(?:imperati(?:f|ve)|heure precise|precis|pile|a l'heure)\b/g;
    while ((m = reImp.exec(f))) { imp = true; spans.push([m.index, m.index + m[0].length]); }
    var cre = {};
    crs.forEach(function (c) {
      var h2 = halfOf(c);
      if (!cre[h2]) { c.imp = imp; cre[h2] = c; }
    });
    var tourSlot = "";
    if (halves.am && halves.pm) tourSlot = "both";
    else if (halves.am) tourSlot = "am";
    else if (halves.pm) tourSlot = "pm";
    return { creneaux: (cre.am || cre.pm) ? cre : null, tourSlot: tourSlot, spans: spans, imp: imp };
  }

  /* —— Dates —— */
  function findDates(f, today) {
    var out = [];
    var m;
    var re1 = /\b(\d{1,2})\s?[\/.\-]\s?(\d{1,2})(?:\s?[\/.\-]\s?(\d{4}|\d{2}))?\b/g;
    while ((m = re1.exec(f))) {
      var d = Number(m[1]), mo = Number(m[2]);
      var y = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : 0;
      if (!m[3]) {
        /* « 7/7 », « 2x/j » ne sont pas des dates ; exiger un jour/mois plausible et un contexte. */
        if (mo > 12 || d > 31 || mo < 1 || d < 1) continue;
        y = guessYear(mo, d, today);
      }
      if (!validYmd(y, mo, d)) continue;
      out.push({ i: m.index, j: m.index + m[0].length, iso: isoOf(y, mo, d), noYear: !m[3] });
    }
    var re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re2.exec(f))) {
      if (validYmd(Number(m[1]), Number(m[2]), Number(m[3]))) out.push({ i: m.index, j: m.index + m[0].length, iso: isoOf(Number(m[1]), Number(m[2]), Number(m[3])) });
    }
    var re3 = /\b(?:le\s+)?(\d{1,2})(?:er)?\s+(janvier|janv|jan|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|sep|octobre|oct|novembre|nov|decembre|dec)\.?(?:\s+(\d{4}))?\b/g;
    while ((m = re3.exec(f))) {
      var mo3 = MONTHS[m[2]], d3 = Number(m[1]);
      var y3 = m[3] ? Number(m[3]) : guessYear(mo3, d3, today);
      if (validYmd(y3, mo3, d3)) out.push({ i: m.index, j: m.index + m[0].length, iso: isoOf(y3, mo3, d3), noYear: !m[3] });
    }
    out.sort(function (a, b) { return a.i - b.i; });
    return out.filter(function (x, k) { return !k || x.i >= out[k - 1].j; });
  }

  /* —— Adresse —— */
  function parseAddress(rest, f) {
    var lines = [];
    var pos = 0;
    rest.split("\n").forEach(function (l) { lines.push({ s: pos, t: l }); pos += l.length + 1; });
    var reSt = new RegExp("(^|[^a-z0-9'])((\\d{1,4})\\s?(bis|ter|b|a)?\\s*,?\\s+)?(" + STREET_STRONG + ")\\.?(?=\\s)", "g");
    var best = null;
    var m;
    while ((m = reSt.exec(f))) {
      var start = m.index + m[1].length;
      var hasNum = !!m[2];
      var type = m[5];
      var weak = /^(cours|parc|cour|voie|villa|domaine|place|pl|passage|residence|res|clos|cite|lot|lotissement|hameau|plateau|vallon|carrefour|lieu-dit|parvis|imp|av|ave|prom|chem|trav|rte|bd|bld|blvd|fbg|res)$/.test(type);
      var after = f.slice(m.index + m[0].length, m.index + m[0].length + 6);
      var follows = /^\s+(?:de |du |des |d'|la |le |l'|les |[a-z])/.test(after);
      if (!hasNum && (weak || !/^\s+(?:de |du |des |d'|la |le |l')/.test(after))) continue;
      if (!follows) continue;
      best = { start: start, typeEnd: m.index + m[0].length };
      break;
    }
    var lineOf = function (i) { for (var k = lines.length - 1; k >= 0; k--) if (i >= lines[k].s) return k; return 0; };
    if (!best) {
      /* Pas de voie : une ligne « 06000 Nice » seule donne au moins la ville. */
      var pc = /(^|\s)(\d{5})\s+([a-z][a-z' \-]{1,40})/.exec(f);
      if (pc) {
        var li0 = lineOf(pc.index);
        var st0 = pc.index + pc[1].length;
        var cityEnd0 = cityEnd(rest, f, st0 + 5, lines[li0].s + lines[li0].t.length);
        return { start: st0, end: cityEnd0, text: squash(rest.slice(st0, cityEnd0)).replace(/^(\d{5})\s*/, "$1 "), extra: null, partial: true, hasPc: true };
      }
      return null;
    }
    var li = lineOf(best.start);
    var lineEnd = lines[li].s + lines[li].t.length;
    var seg = f.slice(best.start, lineEnd);
    var pcm = /\b(\d{5})\b/.exec(seg);
    var end;
    var extra = null;
    if (pcm) {
      end = cityEnd(rest, f, best.start + pcm.index + 5, lineEnd);
    } else {
      /* Fin de la voie : délimiteur fort, mot-clé, ou trou laissé par un téléphone retiré. */
      var i = best.typeEnd;
      var words = 0;
      end = i;
      var re = /\s*([^\s,;|()]+)/g;
      re.lastIndex = i;
      var w;
      while ((w = re.exec(f)) && w.index < lineEnd) {
        var gap = f.slice(end, w.index);
        if (/[;|(]|\s{3,}| - | – /.test(gap)) break;
        if (/,/.test(gap) && words >= 2) {
          var tokf = w[1].replace(/[.:]$/, "");
          if (STOP[tokf] || /\d/.test(tokf)) break;
        }
        var tk = w[1].replace(/[.:]$/, "");
        if (STOP[tk] && !PARTICLES[tk] && tk !== "les" && tk !== "le" && tk !== "du" && tk !== "de") break;
        if (/^\d/.test(tk)) break;
        if (/[:]$/.test(w[1])) break;
        end = w.index + w[0].length;
        if (++words >= 12) break;
      }
      /* Code postal + ville sur la ligne suivante. */
      var nl = lines[li + 1];
      if (nl) {
        var pcl = /^\s*(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' \-]{1,40})/.exec(nl.t);
        if (pcl) {
          var ce = cityEnd(rest, f, nl.s + nl.t.indexOf(pcl[1]) + 5, nl.s + nl.t.length);
          extra = { start: nl.s + nl.t.indexOf(pcl[1]), end: ce };
        }
      }
    }
    var text = squash(rest.slice(best.start, end)).replace(/[,\s]+$/, "");
    if (extra) text += ", " + squash(rest.slice(extra.start, extra.end));
    text = text.replace(/\s*,?\s*(\d{5})\s+/, ", $1 ").replace(/^(\d+)\s*,\s*/, "$1 ").replace(/,\s*,/g, ",");
    return { start: best.start, end: end, text: text, extra: extra, partial: !pcm && !extra, hasPc: !!(pcm || extra) };
  }
  function cityEnd(rest, f, from, lineEnd) {
    var re = /(\s*)([^\s,;|()]+)/g;
    re.lastIndex = from;
    var end = from;
    var n = 0;
    var w;
    while ((w = re.exec(f)) && w.index < lineEnd) {
      if (w.index + w[0].length > lineEnd) break;
      if (/[,;|(]/.test(f.slice(end, w.index + w[1].length)) && n) break;
      if (w[1].length >= 3 && n) break;
      var tok = w[2].replace(/[.:]$/, "");
      var orig = rest.substr(w.index + w[1].length, w[2].length);
      if (!/[a-z]/.test(tok)) break;
      if (/\d/.test(tok)) { if (/^cedex$/.test(tok)) { } break; }
      if (STOP[tok] && !PARTICLES[tok]) break;
      if (n && !/^[A-ZÀ-ÖØ-Þ]/.test(orig) && orig !== orig.toUpperCase()) {
        if (!/^(?:sur|sous|les|lès|en|de|du|des|la|le|d'.*)$/.test(tok)) break;
        var nx = /^\s+([A-ZÀ-ÖØ-Þ][^\s,;|()]*)/.exec(rest.slice(w.index + w[0].length, lineEnd));
        if (!nx) break;
      }
      end = w.index + w[0].length;
      if (++n >= 5) break;
      if (/[.:]$/.test(w[2]) && !/^st\.?$/.test(tok)) break;
    }
    return end;
  }

  /* —— Nom / prénom —— */
  function splitName(words, hadTitle) {
    var up = [], low = [];
    words.forEach(function (w) {
      var letters = w.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) up.push(w);
      else low.push(w);
    });
    var warn = false;
    if (up.length && low.length) return { nom: up.join(" "), prenom: low.join(" "), warn: false };
    if (words.length === 1) {
      if (PRENOMS[fold(words[0])]) return { prenom: words[0], nom: "", warn: true };
      return { nom: words[0], prenom: "", warn: !up.length };
    }
    if (up.length && !low.length) {
      /* Tout en majuscules : « DUPONT JEANNE » → le prénom connu, sinon NOM Prénom. */
      var lastU = fold(words[words.length - 1]), firstU = fold(words[0]);
      if (PRENOMS[firstU] && !PRENOMS[lastU]) return { prenom: words[0], nom: words.slice(1).join(" "), warn: false };
      return { nom: words.slice(0, -1).join(" "), prenom: words[words.length - 1], warn: !PRENOMS[lastU] };
    }
    var first = fold(words[0]), last = fold(words[words.length - 1]);
    if (PRENOMS[first] && !PRENOMS[last]) return { prenom: words[0], nom: words.slice(1).join(" "), warn: false };
    if (PRENOMS[last] && !PRENOMS[first]) return { prenom: words[words.length - 1], nom: words.slice(0, -1).join(" "), warn: false };
    warn = true;
    if (hadTitle) return { nom: words.slice(0, -1).join(" "), prenom: words[words.length - 1], warn: warn };
    return { prenom: words[0], nom: words.slice(1).join(" "), warn: warn };
  }

  /* Remplace une portion du texte par des espaces (même longueur, sauts de ligne gardés). */
  function blank(s, i, j) {
    var mid = s.slice(i, j).replace(/[^\n]/g, " ");
    return s.slice(0, i) + mid + s.slice(j);
  }

  function parseBlock(lines, ctx, today) {
    ctx = ctx || {};
    var src = lines.join("\n");
    var rest = lines.map(function (l, k) { return k === 0 ? l : l; }).join("\n");
    var r = { prenom: "", nom: "", tel: "", adresse: "", jours: null, tourSlot: "", creneaux: null, ordoExp: "", ordoExp2: "", remarques: "", famille: [], medecin: "", medecinTel: "", warn: [], src: src };
    var f;
    function refold() { f = fold(rest); }
    refold();
    var m;
    /* Étiquettes explicites : « Nom : », « Prénom : », « Remarque : »… */
    var labNom = null, labPrenom = null, labRem = [];
    rest = rest.replace(/^([ \t]*)(nom(?: de famille)?|prenom|prénom|patient|remarques?|notes?|infos?|commentaires?|nb)\s*:\s*(.*)$/gim, function (all, ind, lab, val) {
      var lf = fold(lab);
      if (lf === "prenom") labPrenom = squash(val);
      else if (/^nom/.test(lf)) labNom = squash(val);
      else if (lf === "patient") { labNom = labNom || ""; labPrenom = labPrenom || ""; return ind + val; }
      else labRem.push(squash(val));
      return all.replace(/[^\n]/g, " ");
    });
    refold();
    /* Téléphones */
    var reP = new RegExp(PHONE_SRC, "g");
    var phones = [];
    while ((m = reP.exec(rest))) phones.push({ i: m.index, j: m.index + m[0].length, raw: m[0] });
    phones.forEach(function (p) {
      var lineStart = rest.lastIndexOf("\n", p.i - 1) + 1;
      var before = rest.slice(lineStart, p.i);
      var cut = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("|"), before.lastIndexOf("("), before.lastIndexOf("  "));
      var lab = before.slice(cut + 1);
      var labF = fold(lab);
      var labStart = lineStart + cut + 1;
      var labClean = squash(lab.replace(/[:\-–=>]+\s*$/, "").replace(/^[\s:\-–]+/, ""));
      if (MED_RE.test(labF) && labClean.length <= 40) {
        if (!r.medecinTel) {
          r.medecinTel = fmtTel(p.raw);
          r.medecin = squash(labClean.replace(/^(?:m[ée]decin|t[ée]l\.?)\s*:?\s*/i, "")).slice(0, 80);
          if (/^(?:dr|docteur)$/i.test(r.medecin)) r.medecin = "";
          rest = blank(rest, labStart, p.j);
          return;
        }
      }
      if (FAMILY_RE.test(labF) && labClean.length <= 40) {
        r.famille.push({ label: labClean.replace(/^(?:t[ée]l\.?|n°)\s*/i, "").slice(0, 40), tel: fmtTel(p.raw) });
        rest = blank(rest, labStart, p.j);
        return;
      }
      if (!r.tel) {
        r.tel = fmtTel(p.raw);
        var lm = /(t[ée]l(?:[ée]phone)?\.?|portable|mobile|fixe|port\.?|domicile|n°)\s*:?\s*$/i.exec(before);
        rest = blank(rest, lm ? p.i - lm[0].length : p.i, p.j);
      } else {
        var labOther = labClean && labClean.length <= 30 && !/\d/.test(labClean) && OWN_RE.test(labF) ? labClean : "Autre n°";
        r.famille.push({ label: labOther.slice(0, 40), tel: fmtTel(p.raw) });
        rest = blank(rest, OWN_RE.test(labF) ? labStart : p.i, p.j);
      }
    });
    refold();
    /* Dates (fin d’ordonnance si un mot-clé est juste avant) */
    var dates = findDates(f, today);
    var ordo = [];
    var otherDates = 0;
    dates.forEach(function (d) {
      var lineStart = f.lastIndexOf("\n", d.i - 1) + 1;
      var before = f.slice(Math.max(lineStart, d.i - 40), d.i);
      var km = /(?:fin\s+(?:d'?\s?)?(?:ordo(?:nnance)?|de\s+(?:l'?\s?)?ordo(?:nnance)?|de\s+soins?|de\s+prise\s+en\s+charge)|ordo(?:nnance)?s?|valable|validite|expir\w*|renouvel\w*|ald|pec|prise en charge|jusqu'?\s?(?:au|a|à)?|fin)\s*(?:n°?\s?\d\s*)?(?:valable\s*)?(?:jusqu'?\s?(?:au|a)?\s*)?(?:le\s*|du\s*|au\s*)?[:=\-]?\s*$/.exec(before);
      if (km && ordo.length < 2) {
        if (d.noYear && /\b\d{1,2}\s?\/\s?7\b/.test(f.slice(d.i, d.j))) return;
        ordo.push(d.iso);
        rest = blank(rest, d.i - km[0].length, d.j);
      } else otherDates++;
    });
    if (ordo.length) { r.ordoExp = ordo[0]; if (ordo[1] && ordo[1] !== ordo[0]) r.ordoExp2 = ordo[1]; }
    if (otherDates) r.warn.push("date");
    refold();
    /* Adresse */
    var ad = parseAddress(rest, f);
    if (ad) {
      r.adresse = ad.text.slice(0, 200);
      var am = /(adresse|adr\.?|domicile)\s*:?\s*$/i.exec(rest.slice(Math.max(0, ad.start - 12), ad.start));
      rest = blank(rest, am ? ad.start - am[0].length : ad.start, ad.end);
      if (ad.extra) rest = blank(rest, ad.extra.start, ad.extra.end);
      if (!ad.hasPc) r.warn.push("cp");
      else if (ad.partial) r.warn.push("adresse");
    }
    refold();
    /* Jours */
    var pd = parseDays(rest, f);
    pd.spans.forEach(function (s) { rest = blank(rest, s[0], s[1]); });
    refold();
    /* Heures */
    var pt = parseTimes(f);
    pt.spans.forEach(function (s) { rest = blank(rest, s[0], s[1]); });
    refold();
    r.jours = pd.days != null ? pd.days : (ctx.jours ? ctx.jours.slice() : null);
    r.creneaux = pt.creneaux;
    r.tourSlot = pt.tourSlot || ctx.tourSlot || "";
    if (r.jours == null) { r.jours = []; r.warn.push("jours"); }
    /* Nom : début de la première ligne non vide (avant toute donnée). */
    if (labNom != null || labPrenom != null) {
      if (labNom && labPrenom == null) {
        var sp0 = splitName(labNom.split(/\s+/), false);
        r.nom = sp0.nom; r.prenom = sp0.prenom;
      } else { r.nom = labNom || ""; r.prenom = labPrenom || ""; }
    }
    if (!r.nom && !r.prenom) {
      var rl = rest.split("\n");
      var off = 0;
      for (var li = 0; li < rl.length; li++) {
        var line = rl[li];
        var bm = BULLET.exec(line);
        var bOff = 0;
        if (bm && line.trim()) { bOff = bm[0].length; }
        var body = line.slice(bOff);
        if (!body.trim()) { off += line.length + 1; continue; }
        var lead = /^\s*/.exec(body)[0].length;
        var seg = body.slice(lead);
        /* « DUPONT, Jeanne » */
        var cm = /^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+)?)\s*,\s*([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+(?:[ \-][A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+)?)(?=\s*(?:[,;:\-–|(]|\s{2,}|$))/.exec(seg);
        if (cm && !STOP[fold(cm[1])] && !STOP[fold(cm[2])]) {
          r.nom = cm[1]; r.prenom = cm[2];
          rest = blank(rest, off + bOff + lead, off + bOff + lead + cm[0].length);
          break;
        }
        var toks = [];
        var re = /([^\s,;:|()]+)(\s*)/g;
        var tm;
        var hadTitle = false;
        var endIdx = 0;
        while ((tm = re.exec(seg))) {
          var tok = tm[1];
          var tf = fold(tok).replace(/\.$/, "");
          if (!toks.length && !hadTitle && TITLES.test(tf + (tok.slice(-1) === "." ? "" : "")) && /^(?:mme|madame|mlle|mademoiselle|mr|monsieur|m|mm)$/.test(tf)) {
            if (tf === "m" && !/^M\.?$/.test(tok)) break;
            hadTitle = true; endIdx = tm.index + tm[0].length; continue;
          }
          if (!toks.length && !/[A-Za-zÀ-ÿ0-9]/.test(tok)) { endIdx = tm.index + tm[0].length; continue; }
          if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’\-.]+$/.test(tok) || /^[.\-']+$/.test(tok)) break;
          var isPart = !!PARTICLES[tf] && (toks.length > 0 || hadTitle || isUpperWord(tok));
          if (!isPart && ((STOP[tf] && !isUpperWord(tok)) || MONTHS[tf] || COUNTRY[tf])) break;
          if (!isPart && tok.charAt(0) === tok.charAt(0).toLowerCase() && toks.length) break;
          if (!isPart && tok.charAt(0) === tok.charAt(0).toLowerCase() && !toks.length && !hadTitle) break;
          toks.push(tok.replace(/\.$/, ""));
          endIdx = tm.index + tm[1].length;
          if (toks.length >= 4) break;
          var sep = seg.charAt(tm.index + tm[1].length);
          if (sep && /[,;:|(]/.test(sep)) break;
          if (tm[2].length >= 3 && toks.length >= 2) break;
        }
        while (toks.length && PARTICLES[fold(toks[toks.length - 1])]) toks.pop();
        if (toks.length) {
          var sp = splitName(toks, hadTitle);
          r.nom = sp.nom; r.prenom = sp.prenom;
          if (sp.warn) r.warn.push("nom");
          rest = blank(rest, off + bOff + lead, off + bOff + lead + endIdx);
        }
        break;
      }
    }
    r.nom = squash(r.nom).slice(0, 80);
    r.prenom = squash(r.prenom).slice(0, 80);
    /* Le reste → remarques (rien n’est perdu). */
    var bits = rest.split("\n").map(function (l) {
      return squash(l.replace(BULLET, "").replace(/\b(?:t[ée]l(?:[ée]phone)?|adresse|adr|jours?|horaires?|heure|cr[ée]neau|ordo(?:nnance)?|passages?)\s*:\s*/gi, " "))
        .replace(/^[\s,;:.\-–|/·]+|[\s,;:\-–|/·]+$/g, "")
        .replace(/\s*([,;])(?:\s*[,;])+/g, "$1")
        .replace(/\(\s*\)/g, "")
        .trim();
    }).filter(function (l) { return l && /[A-Za-zÀ-ÿ0-9]/.test(l) && !/^(?:et|ou|de|du|le|la|les|au|a|à|tel|tél|le matin|et le|vers|n°|mobile|domicile|fixe|portable|maison|travail|perso|principal|iphone|domicile|france)$/i.test(l); });
    var rem = labRem.concat(bits).join(" · ");
    r.remarques = rem.slice(0, 400);
    if (!r.nom && !r.prenom) r.warn.push("noname");
    if (!r.adresse) r.warn.push("noaddr");
    if (!r.tel) r.warn.push("notel");
    return r;
  }

  function isEmptyRow(r) {
    return !r.nom && !r.prenom && !r.tel && !r.adresse && !r.ordoExp && !r.creneaux && !r.remarques;
  }

  /* Point d’entrée « Coller une liste ». */
  function parseList(text, opts) {
    opts = opts || {};
    var t = String(text || "");
    if (!t.trim()) return [];
    var lines = t.replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim(); });
    /* Tableau copié d’Excel (tabulations) ou CSV collé : lecture par colonnes. */
    var tabs = lines.filter(function (l) { return l.indexOf("\t") >= 0; }).length;
    if (lines.length >= 2 && tabs >= Math.max(2, lines.length * 0.6)) {
      var tbl = parseDelimited(t, "\t");
      var map = guessMapping(tbl[0]);
      if (map.header) return rowsFromTable(tbl, map.map, opts);
    }
    var semi = lines.filter(function (l) { return (l.match(/;/g) || []).length >= 3; }).length;
    if (lines.length >= 2 && semi >= lines.length * 0.8) {
      var tb2 = parseDelimited(t, ";");
      var map2 = guessMapping(tb2[0]);
      if (map2.header) return rowsFromTable(tb2, map2.map, opts);
    }
    var blocks = splitBlocks(t.replace(/\t/g, "  "));
    var out = [];
    blocks.forEach(function (b) {
      var r = parseBlock(b.lines, b.ctx, opts.today);
      if (!isEmptyRow(r)) out.push(r);
    });
    return out;
  }

  /* —— CSV / tableau —— */
  function detectSep(text) {
    var first = String(text || "").split(/\r?\n/).filter(function (l) { return l.trim(); })[0] || "";
    var c = { ";": 0, ",": 0, "\t": 0 };
    var q = false;
    for (var i = 0; i < first.length; i++) {
      var ch = first.charAt(i);
      if (ch === '"') q = !q;
      else if (!q && c[ch] != null) c[ch]++;
    }
    if (c["\t"] >= c[";"] && c["\t"] >= c[","] && c["\t"] > 0) return "\t";
    return c[";"] >= c[","] ? ";" : ",";
  }
  function parseDelimited(text, sep) {
    text = String(text || "").replace(/^\ufeff/, "");
    var rows = [];
    var row = [];
    var cell = "";
    var q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else q = false;
        } else cell += ch;
      } else if (ch === '"' && !cell.trim()) { q = true; cell = ""; }
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(function (c) { return String(c).trim(); })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function (c) { return String(c).trim(); })) rows.push(row);
    return rows.map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
  }

  var FIELDS = [
    ["ignore", "Ignorer"], ["prenom", "Prénom"], ["nom", "Nom"], ["fullname", "Nom et prénom"], ["tel", "Téléphone"],
    ["adresse", "Adresse"], ["cp", "Code postal"], ["ville", "Ville"], ["complement", "Complément d’accès"],
    ["jours", "Jours"], ["tournee", "Tournée (matin / soir)"], ["heure", "Heure de passage"],
    ["am_s", "Créneau matin : début"], ["am_e", "Créneau matin : fin"], ["am_imp", "Créneau matin : impératif"],
    ["pm_s", "Créneau après-midi : début"], ["pm_e", "Créneau après-midi : fin"], ["pm_imp", "Créneau après-midi : impératif"],
    ["ordo", "Fin d’ordonnance"], ["ordo2", "Fin d’ordonnance 2"], ["medecin", "Médecin"], ["medecin_tel", "Téléphone médecin"],
    ["c1_lab", "Contact 1 : qui"], ["c1_tel", "Contact 1 : téléphone"], ["c2_lab", "Contact 2 : qui"], ["c2_tel", "Contact 2 : téléphone"],
    ["remarques", "Remarques"], ["alerte_t", "Alerte : texte"], ["alerte_d", "Alerte : jour"], ["actif", "Actif (oui / non)"]
  ];
  var SYN = [
    ["prenom", /^(prenom|prénom|first ?name|given ?name|prenoms)$/],
    ["nom", /^(nom|nom de famille|last ?name|family ?name|surname|nom_usage|nom d'usage)$/],
    ["fullname", /^(patient|nom complet|nom et prenom|nom prenom|name|full ?name|identite|nom_prenom)$/],
    ["tel", /^(tel|tél|telephone|téléphone|portable|mobile|phone|telephone_1|tel1|tel_patient|numero|n° de telephone)$/],
    ["adresse", /^(adresse|address|rue|voie|adresse_1|adresse1|domicile)$/],
    ["cp", /^(code_postal|code postal|cp|postal|zip|code_post)$/],
    ["ville", /^(ville|commune|city|localite)$/],
    ["complement", /^(complement_acces|complement|complement d'acces|acces|digicode|adresse_2|adresse2)$/],
    ["jours", /^(jours|jours de passage|passages|days)$/],
    ["tournee", /^(tournee|tournée|moment|demi-journee)$/],
    ["heure", /^(heure|horaire|horaires|creneau|créneau|heure de passage)$/],
    ["am_s", /^creneau_matin_debut$/], ["am_e", /^creneau_matin_fin$/], ["am_imp", /^creneau_matin_imperatif$/],
    ["pm_s", /^creneau_apm_debut$/], ["pm_e", /^creneau_apm_fin$/], ["pm_imp", /^creneau_apm_imperatif$/],
    ["ordo", /^(fin_ordonnance|fin d'ordonnance|fin ordonnance|ordonnance|ordo|fin ordo|date fin|date_fin|fin_ordo|expiration)$/],
    ["ordo2", /^(fin_ordonnance_2|fin_ordonnance2|ordo2|ordonnance 2)$/],
    ["medecin", /^(medecin|médecin|medecin traitant|docteur)$/], ["medecin_tel", /^(medecin_tel|tel medecin|telephone medecin)$/],
    ["c1_lab", /^contact1_libelle$/], ["c1_tel", /^contact1_tel$/], ["c2_lab", /^contact2_libelle$/], ["c2_tel", /^contact2_tel$/],
    ["remarques", /^(remarques|remarque|notes|note|commentaire|commentaires|observations|infos)$/],
    ["alerte_t", /^alerte_texte$/], ["alerte_d", /^alerte_jour$/], ["actif", /^(actif|active|statut)$/],
    ["ignore", /^(id_source|id|identifiant)$/]
  ];
  function guessMapping(header) {
    var map = [];
    var hits = 0;
    (header || []).forEach(function (h) {
      var f = fold(h).replace(/\s+/g, " ").trim();
      var got = "";
      for (var i = 0; i < SYN.length; i++) if (SYN[i][1].test(f)) { got = SYN[i][0]; break; }
      if (got && got !== "ignore") hits++;
      map.push(got || "remarques_col");
    });
    return { header: hits >= 2, map: map };
  }
  function cellDate(v, today) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return validYmd(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10)) ? v.slice(0, 10) : "";
    if (/^\d{5}(?:\.\d+)?$/.test(v)) { /* numéro de série Excel */
      var n = Math.floor(Number(v));
      if (n > 30000 && n < 80000) { var d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    }
    var ds = findDates(fold(v), today);
    return ds.length ? ds[0].iso : "";
  }
  function cellTime(v) {
    v = fold(v).trim();
    if (!v) return null;
    if (/^0?\.\d+$/.test(v)) { var mins = Math.round(Number(v) * 1440); return mins; }
    var m = /^(\d{1,2})\s?(?:h|:)\s?(\d{2})?/.exec(v);
    return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
  }
  function yes(v) { return /^(oui|o|yes|y|1|x|vrai|true|imperatif)$/.test(fold(v).trim()); }

  function rowsFromTable(rows, map, opts) {
    opts = opts || {};
    var out = [];
    var header = rows[0] || [];
    rows.slice(1).forEach(function (row) {
      if (!row.some(function (c) { return c; })) return;
      var v = {};
      var remCols = [];
      map.forEach(function (fld, i) {
        var c = row[i] != null ? String(row[i]).trim() : "";
        if (!c) return;
        if (fld === "remarques_col") remCols.push(squash(header[i] || "Colonne " + (i + 1)) + " : " + c);
        else if (fld !== "ignore") v[fld] = v[fld] ? v[fld] + " " + c : c;
      });
      var r = { prenom: "", nom: "", tel: "", adresse: "", jours: null, tourSlot: "", creneaux: null, ordoExp: "", ordoExp2: "", remarques: "", famille: [], medecin: "", medecinTel: "", warn: [], src: row.join(" ; "), actif: true };
      if (v.fullname) {
        var sp = splitName(squash(v.fullname).replace(/^(?:mme|madame|mlle|mr|monsieur|m)\.?\s+/i, "").split(/\s+/), false);
        r.nom = sp.nom; r.prenom = sp.prenom;
        if (sp.warn) r.warn.push("nom");
      }
      if (v.nom) r.nom = squash(v.nom);
      if (v.prenom) r.prenom = squash(v.prenom);
      if (v.tel) r.tel = fmtTel(v.tel);
      var ad = squash(v.adresse || "");
      var cpv = squash(v.cp || ""), vil = squash(v.ville || "");
      if (/^\d{4}$/.test(cpv)) cpv = "0" + cpv;
      if (cpv || vil) ad = ad ? ad + ", " + squash(cpv + " " + vil) : squash(cpv + " " + vil);
      r.adresse = ad.slice(0, 200);
      if (r.adresse && !/\b\d{5}\b/.test(r.adresse)) r.warn.push("cp");
      if (v.jours) {
        var pdj = parseDays(v.jours, fold(v.jours));
        r.jours = pdj.days;
      }
      if (r.jours == null) { r.jours = []; if (!v.jours) r.warn.push("jours"); }
      var cre = {};
      var as = cellTime(v.am_s), ae = cellTime(v.am_e), ps = cellTime(v.pm_s), pe = cellTime(v.pm_e);
      if (as != null) cre.am = mkCr(as, ae);
      if (ps != null) cre.pm = mkCr(ps, pe);
      if (cre.am) cre.am.imp = yes(v.am_imp || "");
      if (cre.pm) cre.pm.imp = yes(v.pm_imp || "");
      if (!cre.am) delete cre.am;
      if (!cre.pm) delete cre.pm;
      var slotFromTimes = "";
      if (v.heure) {
        var ptm = parseTimes(fold(v.heure));
        if (ptm.creneaux) { if (ptm.creneaux.am && !cre.am) cre.am = ptm.creneaux.am; if (ptm.creneaux.pm && !cre.pm) cre.pm = ptm.creneaux.pm; }
        slotFromTimes = ptm.tourSlot;
      }
      r.creneaux = (cre.am || cre.pm) ? cre : null;
      var t = fold(v.tournee || "");
      if (/deux|both|matin.*soir|soir.*matin|2/.test(t)) r.tourSlot = "both";
      else if (/matin|am/.test(t)) r.tourSlot = "am";
      else if (/soir|apm|apres|pm/.test(t)) r.tourSlot = "pm";
      else if (cre.am && cre.pm) r.tourSlot = "both";
      else if (cre.am) r.tourSlot = "am";
      else if (cre.pm) r.tourSlot = "pm";
      else r.tourSlot = slotFromTimes || "";
      r.ordoExp = cellDate(v.ordo, opts.today);
      r.ordoExp2 = cellDate(v.ordo2, opts.today);
      if (v.ordo && !r.ordoExp) remCols.push("Fin d’ordonnance : " + v.ordo);
      if (v.medecin) r.medecin = squash(v.medecin).slice(0, 80);
      if (v.medecin_tel) r.medecinTel = fmtTel(v.medecin_tel);
      [["c1_lab", "c1_tel"], ["c2_lab", "c2_tel"]].forEach(function (k) {
        if (v[k[1]]) r.famille.push({ label: squash(v[k[0]] || "").slice(0, 40), tel: fmtTel(v[k[1]]) });
      });
      var rem = [];
      if (v.complement) rem.push(squash(v.complement));
      if (v.remarques) rem.push(squash(v.remarques));
      r.remarques = rem.concat(remCols).join(" · ").slice(0, 400);
      if (v.alerte_t) r.alerte = { t: squash(v.alerte_t).slice(0, 60), d: cellDate(v.alerte_d, opts.today) || "" };
      if (v.actif && /^(non|n|no|0|faux|false|inactif)$/.test(fold(v.actif).trim())) r.actif = false;
      if (!r.nom && !r.prenom) r.warn.push("noname");
      if (!r.adresse) r.warn.push("noaddr");
      if (!r.tel) r.warn.push("notel");
      if (!isEmptyRow(r)) out.push(r);
    });
    return out;
  }

  function parseCsv(text, opts) {
    var sep = detectSep(text);
    var rows = parseDelimited(text, sep);
    var g = guessMapping(rows[0] || []);
    return { sep: sep, rows: rows, header: g.header, map: g.map };
  }
  function rowsFromCsv(parsed, map, opts) {
    if (!parsed.header && !map) {
      /* Pas d’en-tête reconnu : chaque ligne est lue comme du texte collé. */
      return parseList(parsed.rows.map(function (r) { return r.join("  "); }).join("\n"), opts);
    }
    return rowsFromTable(parsed.rows, map || parsed.map, opts);
  }

  /* Décodage d’un fichier : UTF-8, sinon ancien encodage Windows (windows-1252). */
  function decodeBytes(buf) {
    var u8 = new Uint8Array(buf);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
    catch (e) { return new TextDecoder("windows-1252").decode(u8); }
  }

  /* —— .xlsx minimal (zip + XML), lu sur le téléphone avec DecompressionStream —— */
  async function inflateRaw(u8) {
    var ds = new DecompressionStream("deflate-raw");
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzipEntries(buf, wanted) {
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip");
    var n = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var out = {};
    var dec = new TextDecoder("utf-8");
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true);
      var name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + xlen + clen;
      if (!wanted(name)) continue;
      var lnl = dv.getUint16(lho + 26, true), lxl = dv.getUint16(lho + 28, true);
      var data = u8.subarray(lho + 30 + lnl + lxl, lho + 30 + lnl + lxl + csize);
      out[name] = method === 0 ? data : await inflateRaw(data);
    }
    return out;
  }
  function xmlText(s) {
    return String(s).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (a, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, "&");
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || "");
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  async function readXlsx(buf) {
    if (typeof DecompressionStream === "undefined") throw new Error("nodecomp");
    var files = await unzipEntries(buf, function (n) { return n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n) || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels"; });
    var dec = new TextDecoder("utf-8");
    var shared = [];
    if (files["xl/sharedStrings.xml"]) {
      var ss = dec.decode(files["xl/sharedStrings.xml"]);
      var re = /<si>([\s\S]*?)<\/si>/g, m;
      while ((m = re.exec(ss))) {
        var parts = [];
        var rt = /<t[^>]*>([\s\S]*?)<\/t>/g, mt;
        while ((mt = rt.exec(m[1]))) parts.push(xmlText(mt[1]));
        shared.push(parts.join(""));
      }
    }
    var sheetName = "xl/worksheets/sheet1.xml";
    if (files["xl/workbook.xml"] && files["xl/_rels/workbook.xml.rels"]) {
      var wb = dec.decode(files["xl/workbook.xml"]);
      var rels = dec.decode(files["xl/_rels/workbook.xml.rels"]);
      var sm = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb);
      if (sm) {
        var rm = new RegExp('<Relationship\\b[^>]*Id="' + sm[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + sm[1] + '"').exec(rels);
        if (rm) sheetName = "xl/" + rm[1].replace(/^\/?xl\//, "").replace(/^\.\//, "");
      }
    }
    var sx = files[sheetName] || files["xl/worksheets/sheet1.xml"];
    if (!sx) throw new Error("sheet");
    var xml = dec.decode(sx);
    var rows = [];
    var rr = /<row\b[^>]*>([\s\S]*?)<\/row>/g, mr;
    while ((mr = rr.exec(xml))) {
      var row = [];
      var rc = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, mc;
      var auto = 0;
      while ((mc = rc.exec(mr[1]))) {
        var attrs = mc[1];
        var refm = /\br="([A-Z]+\d+)"/.exec(attrs);
        var ci = refm ? colIndex(refm[1]) : auto;
        auto = ci + 1;
        var tm2 = /\bt="([^"]+)"/.exec(attrs);
        var t = tm2 ? tm2[1] : "";
        var inner = mc[2] || "";
        var vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        var val = "";
        if (t === "s" && vm) val = shared[Number(vm[1])] || "";
        else if (t === "inlineStr") { var im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner); val = im ? xmlText(im[1]) : ""; }
        else if (vm) val = xmlText(vm[1]);
        while (row.length < ci) row.push("");
        row[ci] = String(val).trim();
      }
      if (row.some(function (c) { return c; })) rows.push(row);
    }
    return rows;
  }

  /* —— Doublons —— */
  function nameKey(p) {
    var t = fold((p.prenom || "") + " " + (p.nom || "")).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
    return t;
  }
  function addrKey(a) { return fold(a || "").replace(/[^a-z0-9]/g, ""); }
  function findDuplicates(rows, existing) {
    var ex = (existing || []).map(function (p) { return { p: p, nk: nameKey(p), td: telDigits(p.tel), ak: addrKey(p.adresse), nomk: fold(p.nom || "").replace(/[^a-z]/g, "") }; });
    var seen = {};
    rows.forEach(function (r, i) {
      r.dupOf = null;
      r.dupIn = -1;
      var nk = nameKey(r);
      var td = telDigits(r.tel);
      var ak = addrKey(r.adresse);
      var nomk = fold(r.nom || "").replace(/[^a-z]/g, "");
      for (var k = 0; k < ex.length; k++) {
        var e = ex[k];
        if ((nk && nk === e.nk) || (nomk && nomk === e.nomk && ak && ak === e.ak) || (td && td.length >= 10 && td === e.td && nomk && nomk === e.nomk)) { r.dupOf = e.p.id; break; }
      }
      if (nk) {
        if (seen[nk] != null) r.dupIn = seen[nk];
        else seen[nk] = i;
      }
    });
    return rows;
  }

  var EXAMPLE = [
    "Mme EXEMPLE Jeanne",
    "12 rue Fictive 06000 Nice",
    "06 39 98 00 01",
    "lun mer ven, 8h impératif",
    "ordo jusqu’au 31/12/2026",
    "code porte 1234A",
    "",
    "M. DEMO Paul",
    "5 avenue Imaginaire 06100 Nice",
    "06 39 98 00 03",
    "tous les jours, matin et soir",
    "fin d’ordo 15/01/2027"
  ].join("\n");

  var API = {
    fold: fold, parseList: parseList, parseBlock: parseBlock, splitBlocks: splitBlocks, parseCsv: parseCsv, rowsFromCsv: rowsFromCsv,
    rowsFromTable: rowsFromTable, guessMapping: guessMapping, parseDelimited: parseDelimited, detectSep: detectSep,
    decodeBytes: decodeBytes, readXlsx: readXlsx, findDuplicates: findDuplicates, nameKey: nameKey, fmtTel: fmtTel,
    telDigits: telDigits, FIELDS: FIELDS, EXAMPLE: EXAMPLE, splitName: splitName
  };
  root.VydelImport = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
