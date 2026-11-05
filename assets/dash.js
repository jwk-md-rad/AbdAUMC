/*
 * Kleine vervanging van de claude.ai dashboard-runtime, zodat de pagina's
 * zelfstandig werken (GitHub Pages of lokaal geopend).
 *
 * Gebruik in een pagina, vóór de eigen scripts:
 *   <script src="assets/d3.v7.9.0.min.js"></script>
 *   window.DASH_DATA = {bezetting: {csv: '...'}}     (gezet door assets/gate.js)
 *   <script src="assets/dash.js"></script>
 *
 * API (zelfde als in de oorspronkelijke dashboards):
 *   dash.data(id)            -> {status, data, columns, message}
 *   dash.calc(id, {inputs, fn})
 *   dash.draw(name, fn)      registreert fn(el) voor elk [data-draw=name]
 *   dash.draw(name)          tekent die opnieuw
 *   dash.onData(fn)
 *   dash.colors              acht reeks-kleuren (CSS-variabelen, licht/donker)
 */
(function () {
  'use strict';

  var datasets = {};   // id -> {status, data, columns, message}
  var calcs = {};      // id -> {inputs, fn}
  var calcCache = {};  // id -> result
  var draws = {};      // name -> fn
  var listeners = [];

  function ok(rows) { return {status: 'ok', data: rows, rows: rows, columns: rows.columns || (rows[0] ? Object.keys(rows[0]) : []), refreshing: false, meta: []}; }

  function data(id) {
    if (datasets[id]) return datasets[id];
    if (calcs[id]) {
      if (calcCache[id]) return calcCache[id];
      var c = calcs[id], args = [];
      for (var i = 0; i < c.inputs.length; i++) {
        var r = data(c.inputs[i]);
        if (r.status !== 'ok') return {status: r.status, data: [], rows: [], columns: [], message: r.message};
        args.push(r.data);
      }
      try {
        var out = c.fn.apply(null, args);
        calcCache[id] = ok(Array.isArray(out) ? out : [out]);
      } catch (e) {
        console.error('dash.calc ' + id, e);
        calcCache[id] = {status: 'error', data: [], rows: [], columns: [], message: String(e)};
      }
      return calcCache[id];
    }
    return {status: 'missing', data: [], rows: [], columns: []};
  }

  function runDraw(name) {
    var fn = draws[name];
    if (!fn) return;
    var els = document.querySelectorAll('[data-draw="' + name + '"]');
    for (var i = 0; i < els.length; i++) {
      try { fn(els[i]); } catch (e) { console.error('dash.draw ' + name, e); }
    }
  }

  function redrawAll() {
    for (var n in draws) runDraw(n);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { console.error(e); }
    }
  }

  var colors = [];
  for (var k = 0; k < 8; k++) colors.push('var(--series-' + k + ')');

  window.dash = {
    data: data,
    calc: function (id, spec) { calcs[id] = {inputs: spec.inputs || [], fn: spec.fn}; delete calcCache[id]; },
    loader: function () {},
    draw: function (name, fn) {
      if (typeof fn === 'function') draws[name] = fn;
      runDraw(name);
    },
    onData: function (fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    refresh: function () {},
    colors: colors,
    params: function () { return {}; },
    setParams: function () {},
    resetParams: function () {},
    setLink: function () {}
  };

  function setDataset(id, rows) {
    datasets[id] = ok(rows);
    calcCache = {};
    redrawAll();
  }
  function failDataset(id, msg) {
    datasets[id] = {status: 'error', data: [], rows: [], columns: [], message: msg};
    calcCache = {};
    redrawAll();
    var root = document.getElementById('dash-root');
    if (root && !document.querySelector('.dash-error')) {
      var p = document.createElement('p');
      p.className = 'dash-error';
      p.textContent = 'De data konden niet worden geladen (' + msg + ').';
      root.prepend(p);
    }
  }

  // Datasets: window.DASH_DATA = {id: {csv: "..."} | {url: "..."}}
  function load() {
    var src = window.DASH_DATA || {};
    Object.keys(src).forEach(function (id) {
      var s = src[id];
      datasets[id] = {status: 'loading', data: [], rows: [], columns: []};
      if (s.csv) {
        setTimeout(function () { setDataset(id, d3.csvParse(s.csv)); }, 0);
      } else if (s.url) {
        d3.csv(s.url).then(function (rows) { setDataset(id, rows); }, function (e) { failDataset(id, String(e)); });
      }
    });
  }

  // Opnieuw tekenen bij een andere breedte
  var lastW = 0, timer = null;
  function watchWidth() {
    var root = document.getElementById('dash-root');
    if (!root || !window.ResizeObserver) return;
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      clearTimeout(timer);
      timer = setTimeout(redrawAll, 120);
    }).observe(root);
  }

  load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWidth);
  else watchWidth();
})();
