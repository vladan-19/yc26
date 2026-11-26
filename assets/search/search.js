/* =========================================================
   Pretraga sajta: lupa u navigaciji otvara pretragu kroz
   Projekte, Događaje, Blog, Preporuke i ostale stranice sajta.

   Traži po naslovu, opisu i celom tekstu članka:
   - prikazuje članke u kojima postoje sve otkucane reči zajedno ("dan am": članci
     sa rečju koja počinje na "dan" i rečju koja počinje na "am")
   - reč se traži po početku, pa rezultati stižu već dok se kuca ("ameri" -> Amerika)
   - na vrhu su članci u kojima reči stoje jedna do druge, kao u rečenici,
     zatim oni u kojima su reči blizu, pa ostali; naslov ima prednost pred tekstom
   - ne razlikuje velika i mala slova ni č/ć/c, š/s, ž/z, đ/dj; razume i ćirilicu
   - znaci između reči (tačka, zarez, crtica, navodnici) se ne računaju
   - istaknute reči u naslovu i u delu članka gde stoje zajedno
   - prečice: "/" ili Ctrl+K otvara, Esc zatvara, strelice biraju rezultat

   Na engleskim stranicama (<html lang="en">) traži kroz englesku verziju
   sajta (search-index-en.js) i sve poruke ispisuje na engleskom.

   Indeks (search-index.js) pravi alati/indeks-pretrage.py; učitava se
   tek kad posetilac pređe mišem preko lupe ili otvori pretragu.
   ========================================================= */
(function () {
  'use strict';

  var SCRIPT_SRC = document.currentScript ? document.currentScript.src : location.href;
  var ROOT = new URL('../../', SCRIPT_SRC);
  var EN = (document.documentElement.lang || '').toLowerCase().slice(0, 2) === 'en';
  /* indeks dobija istu oznaku verzije (?v=...) kao ovaj fajl, da pregledač ne koristi stari iz keša */
  var INDEX_SRC = new URL((EN ? 'search-index-en.js' : 'search-index.js') + new URL(SCRIPT_SRC).search, SCRIPT_SRC).href;
  var INDEX_VAR = EN ? 'YC_SEARCH_INDEX_EN' : 'YC_SEARCH_INDEX';

  /* tekstovi prozora i naziv sekcije iznad naslova rezultata */
  var T = EN ? {
    search: 'Search', close: 'Close search', loading: 'Loading…', none: 'No results',
    failed: 'Search is currently unavailable',
    label: { projekti: 'Projects', dogadjaji: 'Events', blog: 'Blog', preporuke: 'Recommendations', stranice: 'Page', autor: 'Author' }
  } : {
    search: 'Pretraga', close: 'Zatvori pretragu', loading: 'Učitavanje…', none: 'Nema rezultata',
    failed: 'Pretraga trenutno nije dostupna',
    label: { projekti: 'Projekti', dogadjaji: 'Događaji', blog: 'Blog', preporuke: 'Preporuke', stranice: 'Stranica', autor: 'Autor' }
  };
  var LABEL = T.label;

  /* ---------------------------------------------------------
     Normalizacija teksta
     --------------------------------------------------------- */
  var CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'dj', 'е': 'e', 'ж': 'z', 'з': 'z',
    'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'c', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
    'ч': 'c', 'џ': 'dz', 'ш': 's'
  };
  var foldCache = Object.create(null);
  function fold(ch) {
    var f = foldCache[ch];
    if (f !== undefined) return f;
    var l = ch.toLowerCase();
    if (l === 'đ') f = 'dj';
    else if (CYR[l]) f = CYR[l];
    else f = l.normalize('NFD').replace(/[̀-ͯ]/g, '');
    foldCache[ch] = f;
    return f;
  }
  function norm(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) out += fold(str[i]);
    return out;
  }
  /* isto kao norm, uz mapu: položaj u normalizovanom tekstu -> položaj u originalu */
  function normMap(str) {
    var out = '', map = [];
    for (var i = 0; i < str.length; i++) {
      var f = fold(str[i]);
      for (var k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
    }
    map.push(str.length);
    return { s: out, map: map };
  }

  var ALNUM = /[a-z0-9]/;
  function startsWith(w, p) { return w.lastIndexOf(p, 0) === 0; }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------
     Indeks
     --------------------------------------------------------- */
  var data = null, loading = false, failed = false;

  function prepare(items) {
    data = items.map(function (it, i) {
      var doc = {
        order: i,
        section: it.section,
        label: it.label || it.section,                   // oznaka iznad naslova (npr. Autor u sekciji Blog)
        url: it.url,
        title: it.title || '',
        date: it.date || '',
        image: it.image || '',
        width: it.width || 0,
        height: it.height || 0,
        description: it.description || '',
        text: it.text || ''
      };
      doc.nTitle = norm(doc.title);
      doc.nDesc = norm(doc.description);
      doc.nText = norm(doc.text);
      return doc;
    });
  }

  function loadIndex() {
    if (data || loading) return;
    if (window[INDEX_VAR]) { prepare(window[INDEX_VAR]); return; }
    loading = true;
    failed = false;
    var s = document.createElement('script');
    s.src = INDEX_SRC;
    s.async = true;
    s.onload = function () {
      loading = false;
      if (window[INDEX_VAR]) prepare(window[INDEX_VAR]);
      else failed = true;
      if (ui) run();
    };
    s.onerror = function () {
      loading = false;
      failed = true;
      s.remove();
      if (ui) run();
    };
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------
     Upit: sve otkucane reči moraju da postoje u istom članku, bilo gde;
     reči pod navodnicima ("dan amerike") moraju da stoje tačno tako, jedna do druge
     --------------------------------------------------------- */
  var START = '(?:^|[^a-z0-9])';                     // na početku reči
  var GAP = '[^a-z0-9]+';                            // razmak i znaci između dve reči
  var REST = '[a-z0-9]*';                            // ostatak reči koja počinje otkucanim slovima
  var END = '(?![a-z0-9])';                          // kraj reči
  var QUOTES = /["“”„«»]/g;  // " „ “ ” « »

  function parse(raw) {
    var parts = norm(raw.replace(QUOTES, '"')).split('"');
    var open = parts.length % 2 === 0;               // navodnik je otvoren, a još nije zatvoren
    var words = [], phrases = [], letters = '';
    parts.forEach(function (part, i) {
      var ws = part.match(/[a-z0-9]+/g) || [];
      letters += ws.join('');
      if (i % 2 === 0) { words = words.concat(ws); return; }
      if (!ws.length) return;
      /* dok se fraza još kuca, poslednja reč može da se nastavlja */
      var body = START + ws.map(esc).join(GAP) + (open && i === parts.length - 1 ? '' : END);
      phrases.push({ re: new RegExp(body), reAll: new RegExp(body, 'g') });
    });
    if (letters.length < 2) return { empty: true, raw: raw };   // jedno slovo je premalo
    var seen = Object.create(null), terms = [];
    words.forEach(function (w) {
      if (seen[w]) return;
      seen[w] = true;
      terms.push({
        w: w,
        re: new RegExp(START + esc(w)),
        reAll: new RegExp(START + esc(w), 'g'),
        mark: w.length > 1                             // pojedinačna slova se ne ističu
      });
    });
    var chain = words.map(esc).join(REST + GAP);       // reči jedna do druge, svaka može da se nastavlja
    return {
      empty: false,
      raw: raw,
      terms: terms,
      phrases: phrases,
      reStart: words.length ? new RegExp('^' + chain) : null,    // naslov počinje otkucanim tekstom
      near: words.length > 1 ? { re: new RegExp(START + chain), reAll: new RegExp(START + chain, 'g') } : null
    };
  }

  /* ---------------------------------------------------------
     Bodovanje: reči jedna do druge > reči blizu > reči bilo gde;
     naslov pre opisa, opis pre teksta
     --------------------------------------------------------- */
  function count(str, re, max) {
    re.lastIndex = 0;
    var c = 0;
    while (re.exec(str) && c < max) c++;
    return c;
  }

  /* najmanji broj reči u tekstu između kojih se nalaze sve tražene reči */
  function span(doc, terms) {
    if (!doc.tokens) doc.tokens = doc.nText.match(/[a-z0-9]+/g) || [];
    var tk = doc.tokens, pos = [], i, j;
    for (i = 0; i < tk.length; i++) {
      for (j = 0; j < terms.length; j++) {
        if (startsWith(tk[i], terms[j].w)) pos.push([i, j]);
      }
    }
    var need = terms.length, have = 0, cnt = [], best = Infinity, l = 0;
    for (var r = 0; r < pos.length; r++) {
      if (!cnt[pos[r][1]]) have++;
      cnt[pos[r][1]] = (cnt[pos[r][1]] || 0) + 1;
      while (have === need) {
        best = Math.min(best, pos[r][0] - pos[l][0]);
        if (!--cnt[pos[l][1]]) have--;
        l++;
      }
    }
    return best;
  }

  /* bodovi za skup reči jedna do druge; 0 ako ga nema nigde */
  function phraseScore(doc, ph) {
    var pt = ph.re.test(doc.nTitle), pd = ph.re.test(doc.nDesc), px = count(doc.nText, ph.reAll, 50);
    return (pt ? 200 : 0) + (pd ? 60 : 0) + (px ? 100 + 10 * Math.log(px) : 0);
  }

  function score(doc, q) {
    var s = 0, inTitle = 0, inDesc = 0, i;
    for (i = 0; i < q.terms.length; i++) {
      var t = q.terms[i];
      var a = t.re.test(doc.nTitle), b = t.re.test(doc.nDesc), c = count(doc.nText, t.reAll, 50);
      if (!a && !b && !c) return 0;                    // svaka reč mora da postoji u članku
      if (a) inTitle++;
      if (b) inDesc++;
      s += Math.log(1 + c);
    }
    s += inTitle * 30 + inDesc * 8;
    for (i = 0; i < q.phrases.length; i++) {
      var ps = phraseScore(doc, q.phrases[i]);
      if (!ps) return 0;                               // fraza pod navodnicima mora da postoji tačno tako
      s += ps;
    }
    if (q.near) {
      var ns = phraseScore(doc, q.near);
      s += ns || 40 / (1 + span(doc, q.terms));        // jedna do druge na vrh, zatim što bliže
    }
    if (q.reStart && q.reStart.test(doc.nTitle)) s += 40;
    return s;
  }

  function search(q) {
    var list = [];
    data.forEach(function (doc) {
      var s = score(doc, q);
      if (s > 0) list.push({ doc: doc, score: s });
    });
    list.sort(function (a, b) { return b.score - a.score || a.doc.order - b.doc.order; });
    return list;
  }

  /* ---------------------------------------------------------
     Isticanje reči i deo članka
     --------------------------------------------------------- */
  /* pogoci u normalizovanom tekstu: [početak, kraj, koja reč ili 'p' za rečenicu] */
  function hits(ns, q) {
    var out = [], m;
    q.terms.forEach(function (t, i) {
      if (!t.mark) return;
      t.reAll.lastIndex = 0;
      while ((m = t.reAll.exec(ns))) {
        var start = m.index + m[0].length - t.w.length, end = m.index + m[0].length;
        while (end < ns.length && ALNUM.test(ns[end])) end++;      // cela reč
        out.push([start, end, i]);
      }
    });
    q.phrases.concat(q.near ? [q.near] : []).forEach(function (ph) {
      ph.reAll.lastIndex = 0;
      while ((m = ph.reAll.exec(ns))) {
        var ps = m.index + (ALNUM.test(m[0][0]) ? 0 : 1), pe = m.index + m[0].length;
        while (pe < ns.length && ALNUM.test(ns[pe])) pe++;
        out.push([ps, pe, 'p']);
      }
    });
    out.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    return out;
  }

  function highlight(str, q) {
    if (!str) return '';
    var nm = normMap(str), merged = [];
    hits(nm.s, q).forEach(function (r) {                 // reči jedna do druge ističu se zajedno
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    var html = '', pos = 0;
    merged.forEach(function (r) {
      var a = nm.map[r[0]], b = nm.map[r[1] - 1] + 1;
      html += escHtml(str.slice(pos, a)) + '<mark>' + escHtml(str.slice(a, b)) + '</mark>';
      pos = b;
    });
    return html + escHtml(str.slice(pos));
  }

  /* deo teksta gde reči stoje zajedno; ako ih nema zajedno, gde ih je najviše na jednom mestu */
  function excerpt(doc, q) {
    var text = doc.text;
    if (!doc.map) doc.map = normMap(text);
    var found = hits(doc.map.s, q);
    if (!found.length) return highlight(cut(doc.description || text, 0, 300), q);
    var phrase = found.filter(function (r) { return r[2] === 'p'; });
    var bestAt = phrase.length ? phrase[0][0] : found[0][0];
    if (!phrase.length) {
      var WINDOW = 170, bestCount = 0, j = 0, seen = {}, distinct = 0;
      for (var i = 0; i < found.length; i++) {
        var id = found[i][2];
        if (!seen[id]) distinct++;
        seen[id] = (seen[id] || 0) + 1;
        while (found[i][0] - found[j][0] > WINDOW) {
          var old = found[j++][2];
          if (!--seen[old]) distinct--;
        }
        if (distinct > bestCount) { bestCount = distinct; bestAt = found[j][0]; }
      }
    }
    var at = doc.map.map[bestAt];
    var from = Math.max(0, at - 70);
    if (from > 0) {
      var sp = text.indexOf(' ', from);
      if (sp !== -1 && sp < at) from = sp + 1;
    }
    return highlight(cut(text, from, 300), q);
  }
  function cut(text, from, len) {
    var to = Math.min(text.length, from + len);
    if (to < text.length) {
      var sp = text.lastIndexOf(' ', to);
      if (sp > from + 40) to = sp;
    }
    /* tri tačke se lepe za susednu reč, da ne padnu same u novi red */
    return (from > 0 ? '… ' : '') + text.slice(from, to) + (to < text.length ? ' …' : '');
  }

  /* ---------------------------------------------------------
     Prozor pretrage
     --------------------------------------------------------- */
  var ui = null, isOpen = false, lastFocus = null, result = null, query = parse(''), timer = 0;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.75"/><path d="M15.6 15.6 21 21"/></svg>';

  function build() {
    var root = document.createElement('div');
    root.className = 'yc-search';
    root.id = 'yc-search';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', T.search);
    root.innerHTML =
      '<div class="yc-search__head">' +
        '<div class="yc-search__wrap">' +
          '<div class="yc-search__top">' +
            '<form class="yc-search__form" role="search" action="#">' +
              '<label class="yc-search__label" for="yc-search-input">' + T.search + '</label>' +
              ICON.replace('<svg', '<svg class="yc-search__icon"') +
              '<input class="yc-search__input" id="yc-search-input" type="search" placeholder="' + T.search + '" ' +
                'autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">' +
            '</form>' +
            '<button class="yc-search__close" type="button" aria-label="' + T.close + '"><span></span><span></span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="yc-search__body">' +
        '<p class="yc-search__status" role="status" aria-live="polite"></p>' +
        '<ul class="yc-search__results"></ul>' +
      '</div>';
    document.body.appendChild(root);

    ui = {
      root: root,
      head: root.querySelector('.yc-search__head'),
      form: root.querySelector('.yc-search__form'),
      input: root.querySelector('.yc-search__input'),
      close: root.querySelector('.yc-search__close'),
      status: root.querySelector('.yc-search__status'),
      list: root.querySelector('.yc-search__results')
    };

    ui.input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 70);
    });
    ui.form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(timer);
      run();
      ui.input.blur();                                  // na telefonu skloni tastaturu, rezultati ostaju
    });
    ui.close.addEventListener('click', close);
    root.addEventListener('scroll', function () {
      ui.head.classList.toggle('is-scrolled', root.scrollTop > 4);
    }, { passive: true });
    root.addEventListener('keydown', onKeys);
  }

  function run() {
    query = parse(ui.input.value);
    result = (data && !query.empty) ? search(query) : null;
    ui.root.scrollTop = 0;
    render();
  }

  function plural(n) {
    if (EN) return n + (n === 1 ? ' result' : ' results');
    var d = n % 10, h = n % 100;
    return n + (d === 1 && h !== 11 ? ' rezultat' : ' rezultata');
  }

  function render() {
    if (query.empty || !data || !result) {
      ui.status.textContent = query.empty ? '' : (failed ? T.failed : T.loading);
      ui.list.innerHTML = '';
      return;
    }
    ui.status.textContent = result.length ? plural(result.length) : T.none;
    ui.list.innerHTML = result.map(function (r) { return hit(r.doc); }).join('');
  }

  function hit(doc) {
    var href = new URL(doc.url, ROOT).href;
    var img = '';
    if (doc.image) {
      img =
        '<div class="yc-hit__media"><div class="yc-hit__frame"><div class="yc-hit__photo">' +
          '<img src="' + escHtml(new URL(doc.image, ROOT).href) + '"' +
          (doc.width && doc.height ? ' width="' + doc.width + '" height="' + doc.height + '"' : '') +
          ' alt="" loading="lazy" decoding="async">' +
        '</div></div></div>';
    }
    return '<li class="yc-hit">' +
      '<a class="yc-hit__link" href="' + escHtml(href) + '">' +
        '<div class="yc-hit__body">' +
          '<p class="yc-hit__meta"><span>' + escHtml(LABEL[doc.label] || '') + '</span>' +
            (doc.date ? '<span>' + escHtml(doc.date) + '</span>' : '') + '</p>' +
          '<h2 class="yc-hit__title">' + highlight(doc.title, query) + '</h2>' +
          '<p class="yc-hit__text">' + excerpt(doc, query) + '</p>' +
        '</div>' +
        img +
      '</a>' +
    '</li>';
  }

  /* strelice kroz rezultate, Tab ostaje u prozoru */
  function onKeys(e) {
    var links = [].slice.call(ui.list.querySelectorAll('.yc-hit__link'));
    var active = document.activeElement;
    var i = links.indexOf(active);

    if (e.key === 'ArrowDown' && (active === ui.input || i !== -1)) {
      var next = active === ui.input ? links[0] : links[i + 1];
      if (next) { e.preventDefault(); focusHit(next); }
    } else if (e.key === 'ArrowUp' && i !== -1) {
      e.preventDefault();
      if (i === 0) { ui.input.focus(); ui.root.scrollTop = 0; }
      else focusHit(links[i - 1]);
    } else if (e.key === 'Tab') {
      var items = [ui.input, ui.close].concat(links);
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  }
  function focusHit(link) {
    ui.root.style.scrollPaddingTop = ui.head.offsetHeight + 'px';
    link.focus({ preventScroll: true });
    link.scrollIntoView({ block: 'nearest' });
  }

  function setExpanded(on) {
    [].forEach.call(document.querySelectorAll('.yc-nav__search'), function (b) {
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }

  function open(trigger) {
    if (isOpen) return;
    var menuBtn = document.querySelector('.yc-nav__toggle[aria-expanded="true"]');
    if (menuBtn) menuBtn.click();                        // zatvori meni na telefonu
    if (!ui) build();
    loadIndex();
    lastFocus = trigger || document.activeElement;
    isOpen = true;
    ui.root.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    setExpanded(true);
    ui.input.focus();
    ui.input.select();
    if (document.activeElement !== ui.input) requestAnimationFrame(function () { ui.input.focus(); });
    if (!query.empty && !result && data) run(); else render();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    ui.root.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    setExpanded(false);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }

  /* ---------------------------------------------------------
     Pokretanje
     --------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.yc-nav__search');
    if (btn) { e.preventDefault(); open(btn); }
  });
  ['pointerenter', 'focusin', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (e.target.closest && e.target.closest('.yc-nav__search')) loadIndex();
    }, { capture: true, passive: true });
  });

  document.addEventListener('keydown', function (e) {
    if (isOpen) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    var t = e.target;
    var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();
      open(document.querySelector('.yc-nav__search'));
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open(document.querySelector('.yc-nav__search'));
    }
  });

  window.YCSearch = {
    open: function () { open(document.querySelector('.yc-nav__search')); },
    close: close,
    /* za proveru iz konzole: YCSearch.test('dan am') */
    test: function (raw) {
      if (!data) return EN ? 'index not loaded' : 'indeks nije učitan';
      var q = parse(raw), list = q.empty ? [] : search(q);
      return { count: list.length, titles: list.map(function (x) { return x.doc.title; }) };
    }
  };
})();
