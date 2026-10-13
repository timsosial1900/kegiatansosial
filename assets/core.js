/*
 * Logika direktori publik tanpa DOM: status waktu, pencarian, urutan, paginasi.
 * Port dari events/queries.py dan events/domain.py. Bisa diuji di Node.
 */
(function (root) {
  'use strict';

  var PAGE_SIZE = 20;
  var STATUSES = ['all', 'upcoming', 'ongoing', 'finished'];
  var SCOPES = ['all', 'archive'];

  function ms(iso) { return Date.parse(iso); }

  function timeStatus(event, now) {
    if (now < ms(event.starts_at)) return 'upcoming';
    if (now < ms(event.ends_at)) return 'ongoing';
    return 'finished';
  }

  function normalizeSearch(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLowerCase().trim();
  }

  function compareId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

  /** Berlangsung, lalu akan datang (mulai terdekat), lalu selesai (terbaru dahulu). */
  function directoryOrder(events, now) {
    function group(event) {
      if (ms(event.starts_at) <= now && ms(event.ends_at) > now) return 0;
      return ms(event.starts_at) > now ? 1 : 2;
    }
    return events.slice().sort(function (a, b) {
      var ga = group(a), gb = group(b);
      if (ga !== gb) return ga - gb;
      if (ga < 2 && ms(a.starts_at) !== ms(b.starts_at)) return ms(a.starts_at) - ms(b.starts_at);
      if (ga === 2 && ms(a.ends_at) !== ms(b.ends_at)) return ms(b.ends_at) - ms(a.ends_at);
      return compareId(a, b);
    });
  }

  function validateParams(params) {
    if (String(params.q || '').trim().length > 200) return 'Pencarian maksimal 200 karakter.';
    if (STATUSES.indexOf(params.status) === -1) return 'Filter waktu tidak valid.';
    if (SCOPES.indexOf(params.scope) === -1) return 'Cakupan pencarian tidak valid.';
    return '';
  }

  /**
   * params: { q, status, scope, page }. Mengembalikan item halaman, jumlah, nearest
   * (hanya beranda tanpa filter, halaman 1) dan nextChangeAt untuk render ulang otomatis.
   */
  function directory(events, params, now) {
    var query = normalizeSearch(params.q);
    var candidates = events.filter(function (event) {
      return !query || normalizeSearch(event.title + ' ' + event.description).indexOf(query) !== -1;
    });
    var boundaries = [];
    candidates.forEach(function (event) {
      if (ms(event.starts_at) > now) boundaries.push(ms(event.starts_at));
      if (ms(event.ends_at) > now) boundaries.push(ms(event.ends_at));
    });
    var nextChangeAt = boundaries.length ? Math.min.apply(null, boundaries) : null;

    var filtered = candidates.filter(function (event) {
      return params.status === 'all' || timeStatus(event, now) === params.status;
    });
    var ordered;
    if (params.scope === 'archive') {
      ordered = filtered.filter(function (event) {
        return event.publication === 'archived' || ms(event.ends_at) <= now;
      }).sort(function (a, b) {
        return ms(b.ends_at) - ms(a.ends_at) || compareId(a, b);
      });
    } else {
      ordered = directoryOrder(filtered, now);
    }

    var pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
    var page = Math.max(1, Math.min(Number(params.page) || 1, pages));
    var showNearest = params.scope === 'all' && !query && params.status === 'all' && page === 1;
    return {
      items: ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      count: ordered.length,
      page: page,
      pages: pages,
      nearest: showNearest ? directoryOrder(events.filter(function (event) {
        return event.publication === 'published' && ms(event.ends_at) > now;
      }), now).slice(0, 3) : null,
      nextChangeAt: nextChangeAt
    };
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /** "20 Okt 2026 · 09:00" dalam WIB (UTC+7, tanpa DST), apa pun zona perangkat. */
  function formatWib(iso) {
    var date = new Date(ms(iso) + 7 * 3600000);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(date.getUTCDate()) + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear() +
      ' · ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes());
  }

  var api = {
    PAGE_SIZE: PAGE_SIZE,
    timeStatus: timeStatus,
    normalizeSearch: normalizeSearch,
    directoryOrder: directoryOrder,
    validateParams: validateParams,
    directory: directory,
    formatWib: formatWib
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PortalCore = api;
})(this);
