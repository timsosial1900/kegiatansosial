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

  function schedule(event) {
    var nodes = [el('p', { 'class': 'schedule' }, [
      el('time', { datetime: event.starts_at, text: Core.formatWib(event.starts_at) }),
      el('span', { text: ' — ' }),
      el('time', { datetime: event.ends_at, text: Core.formatWib(event.ends_at) }),
      ' WIB'
    ])];
    var extra = [MODE_LABELS[event.mode], event.location].filter(Boolean).join(' · ');
    if (extra) nodes.push(el('p', { 'class': 'muted', text: extra }));
    return nodes;
  }

  function statusBadge(event) {
    var status = Core.timeStatus(event, now());
    var nodes = [el('span', { 'class': 'status status-' + status, text: STATUS_LABELS[status] })];
    if (event.publication === 'archived') nodes.push(el('span', { 'class': 'muted', text: 'Arsip' }));
    return nodes;
  }

  function card(event) {
    var href = eventPath(event.id);
    return el('article', { 'class': 'event-card' }, [
      el('div', { 'class': 'event-meta' }, statusBadge(event)),
      el('h3', {}, [el('a', { href: href, text: event.title })])
    ].concat(schedule(event), [
      el('a', { 'class': 'detail-link', href: href, text: 'Lihat kegiatan →' })
    ]));
  }

  // ---------------------------------------------------------------- Direktori
  function directoryPage() {
    var form = document.getElementById('directory-form');
    var results = document.getElementById('directory-results');
    var feedback = document.getElementById('directory-feedback');
    var retry = document.getElementById('directory-retry');
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
      var error = Core.validateParams(state);
      if (error) {
        feedback.textContent = error;
        results.replaceChildren();
        return;
      }
      var page = Core.directory(events, state, now());
      var nodes = [];
      if (page.nearest) {
        nodes.push(el('section', { id: 'nearest-events', 'aria-labelledby': 'nearest-heading' }, [
          el('h2', { id: 'nearest-heading', text: 'Kegiatan terdekat' }),
          el('div', { 'class': 'nearest-grid' }, page.nearest.length
            ? page.nearest.map(card)
            : [el('p', { text: 'Belum ada kegiatan terdekat.' })])
        ]));
      }
      var list = page.items.length ? page.items.map(card) : [el('div', { 'class': 'empty-state' },
        state.q || state.status !== 'all'
          ? [el('h3', { text: 'Tidak ada kegiatan yang sesuai.' }), el('p', { text: 'Coba kata kunci lain atau reset filter.' })]
          : [el('h3', { text: 'Belum ada kegiatan' }), el('p', { text: 'Informasi kegiatan akan tampil di sini setelah diterbitkan.' })])];
      var section = el('section', { 'class': 'results', 'aria-labelledby': 'results-heading' }, [
        el('div', { 'class': 'section-heading' }, [
          el('h2', { id: 'results-heading', text: scope === 'archive' ? 'Daftar arsip' : 'Daftar kegiatan' }),
          el('p', { id: 'result-count', text: page.count + ' kegiatan' })
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
      nodes.push(section);
      results.replaceChildren.apply(results, nodes);
      feedback.textContent = '';
      // Render ulang saat ada kegiatan yang mulai/selesai; ambil data baru tiap 5 menit.
      var delay = page.nextChangeAt ? Math.min(60000, Math.max(1000, page.nextChangeAt - now() + 100)) : 60000;
      timer = setTimeout(function () {
        if (now() - loadedAt > 300000) load(); else render();
      }, delay);
    }

    function load() {
      results.setAttribute('aria-busy', 'true');
      if (!events) feedback.textContent = 'Memuat kegiatan.';
      retry.hidden = true;
      return api({ action: 'events' }).then(function (body) {
        if (!body.ok) throw new Error(body.error);
        events = body.events;
        loadedAt = now();
        render();
      }).catch(function (error) {
        console.error(error);
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
    container.setAttribute('aria-busy', 'true');
    api({ action: 'detail', id: id }).then(function (body) {
      if (!body.ok) return notFound();
      render(body.event);
    }).catch(function (error) {
      console.error(error);
      container.replaceChildren(el('div', { 'class': 'empty-state' }, [
        el('h1', { text: 'Kegiatan belum dapat dimuat' }),
        el('p', { text: 'Periksa koneksi lalu muat ulang halaman.' })
      ]));
    }).then(function () { container.removeAttribute('aria-busy'); });

    function render(event) {
      document.title = event.title + ' — Kegiatan Tim Sosial';
      var canonical = eventUrl(event.id);
      var link = document.querySelector('link[rel=canonical]') || document.head.appendChild(el('link', { rel: 'canonical' }));
      link.href = canonical;
      var status = Core.timeStatus(event, now());
      var resources = event.resources.filter(function (resource) {
        return /^https:\/\//i.test(resource.url);
      }).map(function (resource) {
        var primary = status === 'finished'
          ? resource.category === 'materials' || resource.category === 'documentation'
          : resource.category === 'zoom';
        return el('a', {
          'class': 'resource-link' + (primary ? ' primary' : ''),
          href: resource.url, target: '_blank', rel: 'noopener noreferrer',
          'aria-describedby': 'resource-tab-note', text: resource.label
        });
      });
      var shareUrl = event.slug ? shortUrl(event.slug) : canonical;
      var qrBox = el('div', { 'class': 'qr', role: 'img', 'aria-label': 'QR tautan kegiatan' });
      qrBox.innerHTML = qrSvg(shareUrl);
      var copy = el('button', { id: 'copy-link', type: 'button', text: 'Salin tautan' });
      var copyFeedback = el('p', { id: 'copy-feedback', role: 'status' });
      var download = el('a', { 'class': 'download-link', href: '#', text: 'Unduh QR' });
      var urls = [el('a', { id: 'permanent-url', 'class': 'permanent-url', href: canonical, text: canonical })];
      if (event.slug) {
        urls.unshift(el('a', { id: 'short-url', 'class': 'permanent-url', href: shareUrl, text: shareUrl }));
      }

      container.replaceChildren(
        el('div', { 'class': 'detail-heading' }, statusBadge(event).concat([el('h1', { text: event.title })], schedule(event))),
        el('div', { 'class': 'detail-layout' }, [
          el('div', {}, [
            el('div', { 'class': 'description', text: event.description }),
            el('section', { 'class': 'access', 'aria-labelledby': 'resources-heading' }, [
              el('h2', { id: 'resources-heading', text: 'Akses kegiatan' }),
              el('p', { id: 'resource-tab-note', text: 'Tautan sumber dibuka di tab baru.' }),
              el('div', { 'class': 'resources' }, resources.length ? resources
                : [el('p', { 'class': 'empty-state', text: 'Tautan kegiatan belum tersedia' })]),
              el('p', { text: 'Tautan sumber dapat dibuka tanpa login portal. Izin akses Zoom, presensi, dan Drive dikelola oleh layanan asal.' })
            ])
          ]),
          el('aside', { 'class': 'sharing', 'aria-labelledby': 'sharing-heading' }, [
            el('h2', { id: 'sharing-heading', text: 'Bagikan kegiatan' }),
            el('p', { text: event.slug ? 'Shortlink dan tautan permanen kegiatan ini.' : 'Tautan permanen untuk kegiatan ini.' }),
            qrBox
          ].concat(urls, [copy, copyFeedback, download]))
        ])
      );

      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(shareUrl).then(function () {
          copyFeedback.textContent = 'Tautan disalin';
        }, function () {
          copyFeedback.textContent = 'Salin manual: pilih tautan di atas.';
        });
      });
      download.addEventListener('click', function (clickEvent) {
        clickEvent.preventDefault();
        var blob = new Blob([qrSvg(shareUrl)], { type: 'image/svg+xml' });
        var objectUrl = URL.createObjectURL(blob);
        var anchor = el('a', { href: objectUrl, download: 'qr-' + (event.slug || event.id) + '.svg' });
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
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

  // Tautan "Admin" di header mengarah ke Web App admin bila sudah dikonfigurasi.
  var adminLink = document.querySelector('.admin-entry');
  if (adminLink) {
    if (CONFIG.ADMIN_URL && !/GANTI/.test(CONFIG.ADMIN_URL)) adminLink.href = CONFIG.ADMIN_URL;
    else adminLink.remove();
  }

  var page = document.body.getAttribute('data-page');
  if (page === 'directory') directoryPage();
  else if (page === 'detail') detailPage();
  else if (page === 'shortlink') shortlinkPage();
})();
