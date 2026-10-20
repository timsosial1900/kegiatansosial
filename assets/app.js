/*
 * Perilaku halaman publik: beranda/arsip, detail kegiatan, dan shortlink.
 * Semua teks dari server dimasukkan lewat textContent (tidak pernah innerHTML).
 */
(function () {
  'use strict';

  var CONFIG = window.PORTAL_CONFIG || {};
  var Core = window.PortalCore;
  var ROOT = document.documentElement.getAttribute('data-root') || '.';
  var SITE_URL = String(CONFIG.SITE_URL || '').replace(/\/+$/, '');
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var STATUS_LABELS = { upcoming: 'Akan datang', ongoing: 'Berlangsung', finished: 'Selesai' };
  var MODE_LABELS = { online: 'Daring', offline: 'Luring', hybrid: 'Hibrida' };
  var STORAGE_KEY = 'portal.public.directory';
  var clockOffset = 0;

  function now() { return Date.now() + clockOffset; }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function api(params) {
    if (!CONFIG.API_URL || /GANTI/.test(CONFIG.API_URL)) {
      return Promise.reject(new Error('API_URL di assets/config.js belum diisi.'));
    }
    var url = CONFIG.API_URL + '?' + new URLSearchParams(params).toString();
    // GET tanpa header khusus agar tidak memicu preflight CORS ke Apps Script.
    return fetch(url, { cache: 'no-store', redirect: 'follow' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (body) {
      var serverNow = Date.parse(body.serverNow);
      if (!isNaN(serverNow)) clockOffset = serverNow - Date.now();
      return body;
    });
  }

  function eventPath(id) { return ROOT + '/kegiatan/?id=' + encodeURIComponent(id); }
  function eventUrl(id) { return SITE_URL + '/kegiatan/?id=' + encodeURIComponent(id); }
  function shortUrl(slug) { return SITE_URL + '/s/?k=' + encodeURIComponent(slug); }

  // Ikon garis 24px (gaya Lucide), digambar sebagai SVG agar tajam dan mewarisi warna teks.
  var ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    check: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    external: '<path d="M7 7h10v10M7 17 17 7"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
  };
  var CATEGORY_ICONS = { zoom: 'video', attendance: 'check', materials: 'file', invitation: 'mail', background: 'info', documentation: 'folder' };

  function icon(name, extraClass) {
    var span = document.createElement('span');
    span.innerHTML = '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
    return span.firstChild;
  }

  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  /** Bagian tanggal dalam WIB (UTC+7, tanpa DST), apa pun zona perangkat. */
  function wib(iso) {
    var date = new Date(Date.parse(iso) + 7 * 3600000);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return {
      day: date.getUTCDate(), month: date.getUTCMonth(), year: date.getUTCFullYear(),
      weekday: DAYS[date.getUTCDay()], time: pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes())
    };
  }

  function sameDay(a, b) { return a.day === b.day && a.month === b.month && a.year === b.year; }

  /** Tanggal, jam, dan mode/lokasi sebagai daftar fakta berikon. */
  function facts(event, long) {
    var start = wib(event.starts_at);
    var end = wib(event.ends_at);
    var items = [];
    if (sameDay(start, end)) {
      var dateText = long
        ? start.weekday + ', ' + start.day + ' ' + MONTHS_LONG[start.month] + ' ' + start.year
        : start.weekday + ', ' + start.day + ' ' + MONTHS[start.month] + ' ' + start.year;
      items.push(el('li', {}, [icon('calendar'), el('span', {}, [el('time', { datetime: event.starts_at, text: dateText })])]));
      items.push(el('li', {}, [icon('clock'), el('span', {}, [
        el('time', { datetime: event.starts_at, text: start.time }), '–',
        el('time', { datetime: event.ends_at, text: end.time }), ' WIB'
      ])]));
    } else {
      items.push(el('li', {}, [icon('calendar'), el('span', {}, [
        el('time', { datetime: event.starts_at, text: Core.formatWib(event.starts_at) }), ' sampai ',
        el('time', { datetime: event.ends_at, text: Core.formatWib(event.ends_at) }), ' WIB'
      ])]));
    }
    var place = [MODE_LABELS[event.mode], event.location].filter(Boolean).join(' · ');
    if (place) items.push(el('li', {}, [icon(event.mode === 'online' ? 'video' : 'pin'), el('span', { text: place })]));
    return el('ul', { 'class': 'facts' }, items);
  }

  function statusBadge(event) {
    var status = Core.timeStatus(event, now());
    var nodes = [el('span', { 'class': 'status status-' + status, text: STATUS_LABELS[status] })];
    if (event.publication === 'archived') nodes.push(el('span', { 'class': 'archive-tag', text: 'Diarsipkan' }));
    return nodes;
  }

  function dateTile(event) {
    var start = wib(event.starts_at);
    return el('div', { 'class': 'date-tile', 'aria-hidden': 'true' }, [
      el('span', { 'class': 'day', text: String(start.day) }),
      el('span', { 'class': 'month', text: MONTHS[start.month] })
    ]);
  }

  function card(event) {
    var status = Core.timeStatus(event, now());
    return el('article', { 'class': 'event-card is-' + status }, [
      dateTile(event),
      el('div', { 'class': 'event-meta' }, statusBadge(event)),
      el('h3', {}, [el('a', { href: eventPath(event.id), text: event.title })]),
      facts(event, false)
    ]);
  }

  function skeletonCards(count) {
    var cards = [];
    for (var i = 0; i < count; i++) {
      cards.push(el('div', { 'class': 'event-card skeleton', 'aria-hidden': 'true' }, [
        el('div', { 'class': 'date-tile' }),
        el('span', { 'class': 'bar', style: 'width:30%' }),
        el('span', { 'class': 'bar', style: 'width:80%;height:18px' }),
        el('span', { 'class': 'bar', style: 'width:55%' })
      ]));
    }
    return cards;
  }

  // ---------------------------------------------------------------- Direktori
  function directoryPage() {
    var form = document.getElementById('directory-form');
    var results = document.getElementById('directory-results');
    var feedback = document.getElementById('directory-feedback');
    var retry = document.getElementById('directory-retry');
    var reset = form.querySelector('[data-reset]');
    var scope = form.getAttribute('data-scope');
    var events = null;
    var loadedAt = 0;
    var timer;

    function params() {
      var search = new URLSearchParams(location.search);
      return {
        q: search.get('q') || '',
        status: search.get('status') || 'all',
        scope: scope,
        page: Number(search.get('page')) || 1
      };
    }

    function pageHref(state, page) {
      var search = new URLSearchParams();
      if (state.q) search.set('q', state.q);
      if (state.status !== 'all') search.set('status', state.status);
      if (page > 1) search.set('page', String(page));
      var query = search.toString();
      return location.pathname + (query ? '?' + query : '');
    }

    function render() {
      clearTimeout(timer);
      var state = params();
      form.elements.q.value = state.q;
      form.elements.status.value = state.status;
      reset.hidden = !state.q && state.status === 'all';
      var error = Core.validateParams(state);
      if (error) {
        feedback.textContent = error;
        results.replaceChildren();
        return;
      }
      var page = Core.directory(events, state, now());
      var nodes = [];
      var items = page.items;
      var count = page.count;
      if (page.nearest && page.nearest.length) {
        var shown = {};
        page.nearest.forEach(function (event) { shown[event.id] = true; });
        items = items.filter(function (event) { return !shown[event.id]; });
        count -= page.nearest.length;
      }
      if (page.nearest) {
        nodes.push(el('section', { id: 'nearest-events', 'aria-labelledby': 'nearest-heading' }, [
          el('h2', { id: 'nearest-heading', text: 'Kegiatan terdekat' }),
          el('div', { 'class': 'nearest-grid' }, page.nearest.length
            ? page.nearest.map(card)
            : [el('p', { text: 'Belum ada kegiatan terdekat.' })])
        ]));
      }
      var list = items.length ? items.map(card) : page.nearest && page.nearest.length ? [] : [el('div', { 'class': 'empty-state' },
        state.q || state.status !== 'all'
          ? [el('h3', { text: 'Tidak ada kegiatan yang sesuai' }), el('p', { text: 'Coba kata kunci lain atau pilih status lain.' }),
            el('a', { href: location.pathname, 'data-reset': '', text: 'Hapus filter' })]
          : [el('h3', { text: 'Belum ada kegiatan' }), el('p', { text: 'Informasi kegiatan akan tampil di sini setelah diterbitkan.' })])];
      var section = el('section', { 'class': 'results', 'aria-labelledby': 'results-heading' }, [
        el('div', { 'class': 'section-heading' }, [
          el('h2', { id: 'results-heading', text: scope === 'archive' ? 'Daftar arsip' : page.nearest ? 'Kegiatan lainnya' : 'Daftar kegiatan' }),
          el('p', { id: 'result-count', text: count + ' kegiatan' })
        ]),
        el('div', { 'class': 'event-list' }, list)
      ]);
      if (page.pages > 1) {
        section.appendChild(el('nav', { 'class': 'pagination', 'aria-label': 'Halaman hasil' }, [
          page.page > 1 ? el('a', { href: pageHref(state, page.page - 1), 'data-nav': '', text: 'Sebelumnya' }) : null,
          el('span', { text: 'Halaman ' + page.page + ' dari ' + page.pages }),
          page.page < page.pages ? el('a', { href: pageHref(state, page.page + 1), 'data-nav': '', text: 'Berikutnya' }) : null
        ]));
      }
      if (list.length) nodes.push(section);
      results.replaceChildren.apply(results, nodes);
      feedback.className = 'visually-hidden';
      feedback.textContent = page.count ? page.count + ' kegiatan ditemukan.' : 'Tidak ada kegiatan yang sesuai.';
      // Render ulang saat ada kegiatan yang mulai/selesai; ambil data baru tiap 5 menit.
      var delay = page.nextChangeAt ? Math.min(60000, Math.max(1000, page.nextChangeAt - now() + 100)) : 60000;
      timer = setTimeout(function () {
        if (now() - loadedAt > 300000) load(); else render();
      }, delay);
    }

    function load() {
      results.setAttribute('aria-busy', 'true');
      if (!events) {
        feedback.textContent = 'Memuat kegiatan.';
        feedback.className = 'visually-hidden';
        results.replaceChildren(el('section', { 'class': 'skeleton', 'aria-hidden': 'true' }, [
          el('span', { 'class': 'bar skeleton-heading' }),
          el('div', { 'class': 'nearest-grid skeleton-grid' }, skeletonCards(3))
        ]));
      }
      retry.hidden = true;
      return api({ action: 'events' }).then(function (body) {
        if (!body.ok) throw new Error(body.error);
        events = body.events;
        loadedAt = now();
        render();
      }).catch(function (error) {
        console.error(error);
        if (!events) results.replaceChildren();
        feedback.className = '';
        feedback.textContent = 'Kegiatan belum dapat dimuat. Periksa koneksi lalu coba lagi.';
        retry.hidden = false;
      }).then(function () {
        results.removeAttribute('aria-busy');
      });
    }

    function navigate(href) {
      history.pushState(null, '', href);
      if (events) render();
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      navigate(pageHref({ q: form.elements.q.value.trim(), status: form.elements.status.value }, 1));
    });
    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-reset], [data-nav]');
      if (link) {
        event.preventDefault();
        navigate(link.hasAttribute('data-reset') ? location.pathname : link.getAttribute('href'));
        return;
      }
      if (event.target.closest('a[href*="kegiatan/?id="]')) saveContext();
    });
    // Memilih status langsung menerapkan filter, tanpa perlu menekan Cari.
    form.addEventListener('change', function (event) {
      if (event.target.name === 'status') form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    retry.addEventListener('click', load);
    addEventListener('popstate', function () { if (events) render(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && events && now() - loadedAt > 120000) load();
    });
    addEventListener('pagehide', saveContext);

    function saveContext() {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ url: location.pathname + location.search, scroll: scrollY }));
      } catch (error) { /* Penyimpanan bisa dinonaktifkan browser. */ }
    }

    load().then(function () {
      try {
        var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && saved.url === location.pathname + location.search) scrollTo(0, saved.scroll);
      } catch (error) { /* abaikan */ }
    });
  }

  // ---------------------------------------------------------------- QR
  function qrSvg(text) {
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }

  // ---------------------------------------------------------------- Detail
  function detailPage() {
    var container = document.getElementById('detail');
    var id = new URLSearchParams(location.search).get('id') || '';
    var back = document.querySelector('[data-directory-back]');
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.url) back.href = saved.url;
    } catch (error) { /* tetap ke beranda */ }

    function notFound() {
      document.title = 'Kegiatan tidak ditemukan';
      container.replaceChildren(el('div', { 'class': 'empty-state' }, [
        el('h1', { text: 'Kegiatan tidak ditemukan' }),
        el('p', { text: 'Kegiatan mungkin belum diterbitkan atau tautannya salah.' })
      ]));
    }

    if (!UUID.test(id)) return notFound();

    function load() {
      container.setAttribute('aria-busy', 'true');
      container.replaceChildren(
        el('p', { 'class': 'visually-hidden', text: 'Memuat kegiatan…' }),
        el('div', { 'class': 'skeleton', 'aria-hidden': 'true' }, [
          el('span', { 'class': 'bar', style: 'width:110px;height:24px' }),
          el('span', { 'class': 'bar', style: 'width:70%;height:36px;margin-top:16px' }),
          el('span', { 'class': 'bar', style: 'width:45%;margin-top:16px' }),
          el('div', { 'class': 'panel', style: 'margin-top:28px;max-width:720px' }, [
            el('span', { 'class': 'bar', style: 'width:40%;height:20px' }),
            el('span', { 'class': 'bar', style: 'height:52px;margin-top:20px' }),
            el('span', { 'class': 'bar', style: 'height:52px' })
          ])
        ])
      );
      api({ action: 'detail', id: id }).then(function (body) {
        if (!body.ok) return notFound();
        render(body.event);
      }).catch(function (error) {
        console.error(error);
        var retry = el('button', { type: 'button', 'class': 'primary', text: 'Coba lagi' });
        retry.addEventListener('click', load);
        container.replaceChildren(el('div', { 'class': 'empty-state' }, [
          el('h1', { text: 'Kegiatan belum dapat dimuat' }),
          el('p', { text: 'Periksa koneksi internet, lalu coba lagi.' }),
          retry
        ]));
      }).then(function () { container.removeAttribute('aria-busy'); });
    }
    load();

    function render(event) {
      document.title = event.title + ' — Kegiatan Tim Sosial';
      var canonical = eventUrl(event.id);
      var link = document.querySelector('link[rel=canonical]') || document.head.appendChild(el('link', { rel: 'canonical' }));
      link.href = canonical;
      var status = Core.timeStatus(event, now());
      // Tautan utama (Zoom sebelum/selama acara; materi/dokumentasi setelahnya) tampil paling atas.
      var ORDER = { zoom: 0, attendance: 1, materials: 2, documentation: 3, invitation: 4, background: 5 };
      var mainCategory = status === 'finished' ? null : event.mode === 'offline' ? 'attendance' : 'zoom';
      var resources = event.resources.filter(function (resource) {
        return /^https:\/\//i.test(resource.url);
      }).map(function (resource, index) {
        var primary = status === 'finished'
          ? resource.category === 'materials' || resource.category === 'documentation'
          : resource.category === mainCategory;
        var rank = ORDER.hasOwnProperty(resource.category) ? ORDER[resource.category] : 9;
        return { resource: resource, primary: primary, rank: rank, index: index };
      }).sort(function (a, b) {
        return (b.primary - a.primary) || (a.rank - b.rank) || (a.index - b.index);
      }).map(function (item) {
        return el('a', {
          'class': 'resource-link' + (item.primary ? ' primary' : ''),
          href: item.resource.url, target: '_blank', rel: 'noopener noreferrer',
          'aria-describedby': 'resource-tab-note'
        }, [
          icon(CATEGORY_ICONS[item.resource.category] || 'link'),
          el('span', { 'class': 'label', text: item.resource.label }),
          icon('external', 'ext')
        ]);
      });
      var shareUrl = event.slug ? shortUrl(event.slug) : canonical;
      var qrBox = el('div', { 'class': 'qr', role: 'img', 'aria-label': event.slug ? 'Kode QR shortlink kegiatan' : 'Kode QR tautan kegiatan' });
      qrBox.innerHTML = qrSvg(shareUrl);
      var copy = el('button', { id: 'copy-link', type: 'button' }, [icon('copy'), 'Salin tautan']);
      var copyFeedback = el('p', { id: 'copy-feedback', role: 'status' });
      var download = el('button', { type: 'button', 'class': 'download-link' }, [icon('download'), 'Unduh QR (PNG)']);
      var links = [];
      if (event.slug) {
        links.push(el('p', { 'class': 'link-caption', text: 'Shortlink' }),
          el('div', { 'class': 'link-field' }, [el('a', { id: 'short-url', 'class': 'permanent-url', href: shareUrl, text: shareUrl })]));
      }
      links.push(el('p', { 'class': 'link-caption', text: 'Tautan permanen' }),
        el('div', { 'class': 'link-field' }, [el('a', { id: 'permanent-url', 'class': 'permanent-url', href: canonical, text: canonical })]));

      var main = [
        el('section', { 'class': 'panel access', 'aria-labelledby': 'resources-heading' }, [
          el('h2', { id: 'resources-heading', text: 'Akses kegiatan' }),
          el('p', { id: 'resource-tab-note', text: 'Tautan dibuka di tab baru.' }),
          el('div', { 'class': 'resources' }, resources.length ? resources
            : [el('p', { 'class': 'muted', text: 'Tautan kegiatan belum tersedia. Silakan cek kembali menjelang acara.' })]),
          el('p', { 'class': 'access-note', text: 'Tidak perlu login portal. Izin akses Zoom, presensi, dan Drive diatur oleh layanan masing-masing.' })
        ])
      ];
      if (event.description) {
        main.push(el('section', { 'class': 'panel', 'aria-labelledby': 'about-heading' }, [
          el('h2', { id: 'about-heading', text: 'Tentang kegiatan' }),
          el('div', { 'class': 'description', text: event.description })
        ]));
      }

      container.replaceChildren(
        el('div', { 'class': 'detail-heading' }, [
          el('div', { 'class': 'event-meta' }, statusBadge(event)),
          el('h1', { text: event.title }),
          facts(event, true)
        ]),
        el('div', { 'class': 'detail-layout' }, [
          el('div', {}, main),
          el('aside', { 'class': 'panel sharing', 'aria-labelledby': 'sharing-heading' }, [
            el('h2', { id: 'sharing-heading', text: 'Bagikan kegiatan' }),
            el('p', { text: 'Pindai QR atau salin tautan untuk dibagikan.' }),
            qrBox
          ].concat(links, [
            el('div', { 'class': 'sharing-actions' }, [copy, download]),
            copyFeedback
          ]))
        ])
      );

      copy.addEventListener('click', function () {
        function manual() { copyFeedback.textContent = 'Salin manual: tekan lama tautan di atas.'; }
        if (!navigator.clipboard) return manual();
        navigator.clipboard.writeText(shareUrl).then(function () {
          copyFeedback.textContent = 'Tautan disalin.';
        }, manual);
      });
      // PNG agar mudah ditempel di WhatsApp, Word, atau PowerPoint.
      download.addEventListener('click', function () {
        var name = 'qr-' + (event.slug || event.id);
        var svgUrl = URL.createObjectURL(new Blob([qrSvg(shareUrl)], { type: 'image/svg+xml' }));
        var image = new Image();
        function save(href, extension) {
          var anchor = el('a', { href: href, download: name + extension });
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }
        image.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1024;
          var context = canvas.getContext('2d');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, 1024, 1024);
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, 1024, 1024);
          canvas.toBlob(function (blob) {
            if (!blob) return save(svgUrl, '.svg');
            var pngUrl = URL.createObjectURL(blob);
            save(pngUrl, '.png');
            setTimeout(function () { URL.revokeObjectURL(pngUrl); URL.revokeObjectURL(svgUrl); }, 1000);
          }, 'image/png');
        };
        image.onerror = function () { save(svgUrl, '.svg'); };
        image.src = svgUrl;
      });
    }
  }

  // ---------------------------------------------------------------- Shortlink
  function shortlinkPage() {
    var message = document.getElementById('shortlink-message');
    var slug = String(new URLSearchParams(location.search).get('k') || '').trim().toLowerCase();
    function missing() {
      document.title = 'Tautan tidak ditemukan';
      message.replaceChildren(
        el('h1', { text: 'Tautan tidak ditemukan' }),
        el('p', { text: 'Shortlink ini tidak ada atau kegiatannya belum diterbitkan.' }),
        el('a', { href: ROOT + '/', text: 'Lihat semua kegiatan' })
      );
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) return missing();
    api({ action: 'resolve', k: slug }).then(function (body) {
      if (!body.ok) return missing();
      var target = body.target;
      if (target.type === 'url' && /^https:\/\//i.test(target.url)) {
        location.replace(target.url);
      } else if (target.type === 'event' && UUID.test(target.id)) {
        location.replace(eventPath(target.id));
      } else {
        missing();
      }
    }).catch(function (error) {
      console.error(error);
      message.replaceChildren(
        el('h1', { text: 'Tautan belum dapat dibuka' }),
        el('p', { text: 'Periksa koneksi lalu muat ulang halaman.' })
      );
    });
  }

  var adminLink = document.querySelector('.admin-entry');
  if (adminLink) adminLink.href = ROOT + '/admin/';

  var page = document.body.getAttribute('data-page');
  if (page === 'directory') directoryPage();
  else if (page === 'detail') detailPage();
  else if (page === 'shortlink') shortlinkPage();
})();
