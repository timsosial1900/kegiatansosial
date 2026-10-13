/* Halaman admin statis: login kata sandi, lalu kelola kegiatan lewat POST ke Apps Script. */
(function () {
  var CATEGORY_LABELS = { zoom: 'Zoom', attendance: 'Presensi', materials: 'Materi', invitation: 'Undangan', background: 'Latar belakang', documentation: 'Dokumentasi', other: 'Lainnya' };
  var PUBLICATION_LABELS = { draft: 'Draf', published: 'Terbit', archived: 'Arsip' };
  var TIME_LABELS = { upcoming: 'Akan datang', ongoing: 'Berlangsung', finished: 'Selesai', '': 'Jadwal belum lengkap' };
  var FIELD_LABELS = { title: 'Judul', description: 'Deskripsi', mode: 'Mode', location: 'Lokasi', slug: 'Shortlink kegiatan', starts_at: 'Mulai', ends_at: 'Selesai', publicationAck: 'Konfirmasi publikasi', resources: 'Tautan', label: 'Label', category: 'Kategori', url: 'URL', id: 'ID' };
  // Lewat id, bukan form.elements: baris tautan juga punya input bernama "slug".
  var EDITOR_FIELDS = { title: 'f-title', description: 'f-description', mode: 'f-mode', location: 'f-location', slug: 'f-slug', starts_local: 'f-starts', ends_local: 'f-ends' };
  var state = { siteUrl: '', current: null, saving: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function show(view) {
    ['login', 'list', 'editor', 'preview'].forEach(function (name) { $('view-' + name).hidden = name !== view; });
    scrollTo(0, 0);
  }
  function status(message) {
    $('global-status').textContent = message || '';
    $('global-status').hidden = !message;
  }
  var CONFIG = window.PORTAL_CONFIG || {};
  var TOKEN_KEY = 'portal.admin.token';
  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(value) {
    try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* abaikan */ }
  }
  function post(body) {
    if (!CONFIG.API_URL || /GANTI/.test(CONFIG.API_URL)) {
      return Promise.reject(new Error('API_URL di assets/config.js belum diisi'));
    }
    // text/plain: permintaan "sederhana" sehingga Apps Script bisa dipanggil tanpa preflight CORS.
    return fetch(CONFIG.API_URL, {
      method: 'POST', body: JSON.stringify(body), redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }
  function call(action, extra) {
    var body = { action: action, token: token() };
    Object.keys(extra || {}).forEach(function (key) { body[key] = extra[key]; });
    return post(body).then(function (result) {
      if (result.error === 'unauthorized') {
        setToken('');
        showLogin('Sesi berakhir. Masuk kembali.');
        throw new Error('__handled__');
      }
      if (!result.ok) throw new Error(result.message || result.error);
      return result.value;
    });
  }

  var LOGIN_ERRORS = {
    bad_password: 'Kata sandi salah.',
    locked: 'Terlalu banyak percobaan gagal. Coba lagi setelah 15 menit.',
    not_configured: 'ADMIN_PASSWORD belum diisi di Script Properties (minimal 8 karakter).',
    bad_name: 'Isi nama Anda (maksimum 60 karakter).'
  };
  function showLogin(message) {
    $('admin-user').textContent = '';
    $('logout').hidden = true;
    $('nav-list').hidden = true;
    $('login-error').textContent = message || '';
    $('login-error').hidden = !message;
    status('');
    show('login');
    $('login-password').value = '';
  }
  function signedIn(name) {
    $('admin-user').textContent = name;
    $('logout').hidden = false;
    $('nav-list').hidden = false;
  }
  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = $('login-form').querySelector('button');
    button.disabled = true;
    post({ action: 'login', name: $('login-name').value, password: $('login-password').value }).then(function (result) {
      button.disabled = false;
      if (!result.ok) return showLogin(LOGIN_ERRORS[result.error] || ('Gagal masuk: ' + result.error));
      setToken(result.token);
      try { localStorage.setItem('portal.admin.name', result.name); sessionStorage.setItem('portal.admin.name', result.name); } catch (e) { /* abaikan */ }
      signedIn(result.name);
      loadList();
    }).catch(function (error) {
      button.disabled = false;
      showLogin('Tidak dapat menghubungi Apps Script: ' + error.message);
    });
  });
  $('logout').addEventListener('click', function () {
    post({ action: 'logout', token: token() }).catch(function () {});
    setToken('');
    showLogin('Anda sudah keluar.');
  });
  function formatWib(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) + ' WIB';
  }
  function eventUrl(id) { return state.siteUrl + '/kegiatan/?id=' + encodeURIComponent(id); }
  function shortUrl(slug) { return state.siteUrl + '/s/?k=' + encodeURIComponent(slug); }

  function loadList() {
    status('Memuat kegiatan…');
    return call('list').then(function (data) {
      state.siteUrl = data.siteUrl;
      status('');
      var table = el('table', { 'class': 'admin-table' }, [
        el('thead', {}, [el('tr', {}, ['Judul', 'Publikasi', 'Waktu', 'Diubah', ''].map(function (h) { return el('th', { text: h }); }))]),
        el('tbody', {}, data.events.length ? data.events.map(function (event) {
          return el('tr', {}, [
            el('td', {}, [el('strong', { text: event.title || '(tanpa judul)' }), event.slug ? el('div', { 'class': 'muted', text: '/s/?k=' + event.slug }) : null]),
            el('td', { text: PUBLICATION_LABELS[event.publication] || event.publication }),
            el('td', { text: TIME_LABELS[event.time_status] }),
            el('td', { 'class': 'muted', text: formatWib(event.updated_at) }),
            el('td', {}, [el('button', { type: 'button', text: 'Edit', onclick: function () { openEditor(event.id); } })])
          ]);
        }) : [el('tr', {}, [el('td', { colspan: '5', text: 'Belum ada kegiatan.' })])])
      ]);
      $('event-table').replaceChildren(table);
      show('list');
    }).catch(fail);
  }

  function fail(error) {
    if (error && error.message === '__handled__') return;
    status('Terjadi kesalahan: ' + (error && error.message ? error.message : error) + '. Muat ulang halaman bila berlanjut.');
    state.saving = false;
    setBusy(false);
  }

  function resourceRow(resource) {
    resource = resource || {};
    var category = el('select', { name: 'category' }, [el('option', { value: '', text: 'Pilih kategori' })].concat(Object.keys(CATEGORY_LABELS).map(function (key) {
      var option = el('option', { value: key, text: CATEGORY_LABELS[key] });
      if (resource.category === key) option.selected = true;
      return option;
    })));
    function input(name, value, label, extra) {
      var attrs = { name: name };
      Object.keys(extra || {}).forEach(function (key) { attrs[key] = extra[key]; });
      var field = el('input', attrs);
      field.value = value || '';
      return el('div', { 'class': 'field' }, [el('label', { text: label }), field]);
    }
    var row = el('fieldset', { 'class': 'resource-row' }, [
      el('legend', { text: 'Tautan' }),
      el('div', { 'class': 'resource-grid' }, [
        input('label', resource.label, 'Label', { maxlength: '100' }),
        el('div', { 'class': 'field' }, [el('label', { text: 'Kategori' }), category]),
        input('url', resource.url, 'URL HTTPS', { type: 'url', placeholder: 'https://', spellcheck: 'false' }),
        input('slug', resource.slug, 'Shortlink (opsional)', { maxlength: '50', autocapitalize: 'off', spellcheck: 'false' })
      ]),
      el('div', { 'class': 'row-actions' }, [
        el('button', { type: 'button', text: 'Naik', onclick: function () { if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); numberRows(); } }),
        el('button', { type: 'button', text: 'Turun', onclick: function () { if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); numberRows(); } }),
        el('button', { type: 'button', text: 'Hapus', onclick: function () { row.remove(); numberRows(); } })
      ])
    ]);
    row.dataset.id = resource.id || '';
    return row;
  }
  function numberRows() {
    var rows = $('resource-rows').children;
    for (var i = 0; i < rows.length; i++) rows[i].querySelector('legend').textContent = 'Tautan ' + (i + 1);
    $('add-resource').disabled = rows.length >= 30;
  }

  function openEditor(id) {
    clearErrors();
    $('saved-notice').hidden = true;
    if (!id) return fillEditor(null);
    status('Memuat kegiatan…');
    return call('get', { id: id }).then(function (event) {
      status('');
      if (!event) return status('Kegiatan tidak ditemukan.');
      fillEditor(event);
    }).catch(fail);
  }

  function fillEditor(event) {
    state.current = event;
    var form = $('event-editor');
    form.reset();
    Object.keys(EDITOR_FIELDS).forEach(function (name) {
      $(EDITOR_FIELDS[name]).value = event ? (event[name] || '') : '';
    });
    $('resource-rows').replaceChildren.apply($('resource-rows'), (event && event.resources.length ? event.resources : [{}]).map(resourceRow));
    numberRows();
    var publication = event ? event.publication : 'draft';
    $('editor-title').textContent = event ? 'Edit kegiatan' : 'Buat kegiatan';
    $('editor-publication').textContent = 'Publikasi: ' + PUBLICATION_LABELS[publication];
    $('editor-meta').textContent = event ? 'Waktu: ' + TIME_LABELS[event.time_status] + ' · Versi ' + event.version + ' · Diubah ' + formatWib(event.updated_at) + ' oleh ' + (event.updated_by || '-') : '';
    $('archive-note').hidden = publication !== 'published';
    var actions = [];
    if (publication === 'draft') {
      actions.push(el('button', { 'class': 'primary', type: 'button', text: 'Simpan draf', onclick: function () { save('save_draft'); } }));
      actions.push(el('button', { type: 'button', text: 'Publikasikan', onclick: function () { save('publish'); } }));
    } else {
      actions.push(el('button', { 'class': 'primary', type: 'button', text: 'Simpan perubahan publik', onclick: function () { save('save_public'); } }));
      if (publication === 'published') actions.push(el('button', { type: 'button', text: 'Arsipkan', onclick: function () { if (confirm('Arsipkan kegiatan ini? Tidak dapat dikembalikan ke draf.')) save('archive'); } }));
    }
    if (event) actions.push(el('button', { type: 'button', text: 'Pratinjau', onclick: function () { preview(event.id); } }));
    $('editor-actions').replaceChildren.apply($('editor-actions'), actions);
    renderLinks(event);
    updateSlugPreview();
    show('editor');
  }

  function renderLinks(event) {
    var box = $('public-links');
    box.replaceChildren();
    if (!event || event.publication === 'draft' || !state.siteUrl) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('strong', { text: 'Tautan publik' }));
    var links = [['Halaman kegiatan', eventUrl(event.id)]];
    if (event.slug) links.push(['Shortlink', shortUrl(event.slug)]);
    event.resources.forEach(function (resource) { if (resource.slug) links.push(['Shortlink ' + resource.label, shortUrl(resource.slug)]); });
    links.forEach(function (pair) {
      box.appendChild(el('p', {}, [el('span', { text: pair[0] + ': ' }), el('a', { href: pair[1], target: '_blank', rel: 'noopener', text: pair[1] })]));
    });
  }

  function updateSlugPreview() {
    var slug = $('f-slug').value.trim().toLowerCase();
    $('slug-preview').textContent = slug && state.siteUrl ? 'Akan menjadi: ' + shortUrl(slug) : 'Huruf kecil, angka, dan tanda hubung.';
  }

  function collect(action) {
    var payload = { action: action, publicationAck: $('f-ack').checked, resources: [] };
    Object.keys(EDITOR_FIELDS).forEach(function (name) { payload[name] = $(EDITOR_FIELDS[name]).value; });
    if (state.current) { payload.id = state.current.id; payload.version = state.current.version; }
    Array.prototype.forEach.call($('resource-rows').children, function (row) {
      payload.resources.push({
        id: row.dataset.id || '',
        label: row.querySelector('[name=label]').value,
        category: row.querySelector('[name=category]').value,
        url: row.querySelector('[name=url]').value,
        slug: row.querySelector('[name=slug]').value
      });
    });
    return payload;
  }

  function setBusy(busy) {
    Array.prototype.forEach.call($('editor-actions').querySelectorAll('button'), function (button) { button.disabled = busy; });
  }

  function clearErrors() {
    $('error-summary').hidden = true;
    $('error-list').replaceChildren();
    $('reload-latest').hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('[aria-invalid]'), function (node) { node.removeAttribute('aria-invalid'); });
  }

  function fieldFor(key) {
    var map = { title: 'f-title', description: 'f-description', mode: 'f-mode', location: 'f-location', slug: 'f-slug', starts_at: 'f-starts', ends_at: 'f-ends', publicationAck: 'f-ack' };
    if (map[key]) return $(map[key]);
    var match = /^resources\.(\d+)\.(\w+)$/.exec(key);
    if (!match) return null;
    var row = $('resource-rows').children[Number(match[1])];
    return row && row.querySelector('[name=' + match[2] + ']');
  }

  function showErrors(errors, conflict) {
    clearErrors();
    Object.keys(errors).forEach(function (key) {
      var match = /^resources\.(\d+)\.(\w+)$/.exec(key);
      var label = match ? 'Tautan ' + (Number(match[1]) + 1) + ' — ' + (FIELD_LABELS[match[2]] || match[2]) : (FIELD_LABELS[key] || '');
      var field = fieldFor(key);
      if (field) field.setAttribute('aria-invalid', 'true');
      $('error-list').appendChild(el('li', { text: (label ? label + ': ' : '') + errors[key] }));
    });
    $('reload-latest').hidden = !conflict || !state.current;
    $('error-summary').hidden = false;
    $('error-summary').focus();
  }

  function save(action) {
    if (state.saving) return;
    state.saving = true;
    setBusy(true);
    $('saved-notice').hidden = true;
    status('Menyimpan…');
    call('save', { payload: collect(action) }).then(function (result) {
      state.saving = false;
      status('');
      if (!result.ok) { setBusy(false); return showErrors(result.errors, result.conflict); }
      return call('get', { id: result.id }).then(function (event) {
        fillEditor(event);
        $('saved-notice').hidden = false;
      });
    }).catch(fail);
  }

  function preview(id) {
    status('Memuat pratinjau…');
    call('get', { id: id }).then(function (event) {
      status('');
      var resources = event.resources.length ? event.resources.map(function (resource) {
        return el('a', { 'class': 'resource-link', href: resource.url, target: '_blank', rel: 'noopener noreferrer', text: resource.label + ' (' + (CATEGORY_LABELS[resource.category] || resource.category) + ')' });
      }) : [el('p', { 'class': 'empty-state', text: 'Tautan kegiatan belum tersedia' })];
      $('preview-body').replaceChildren(
        el('div', { 'class': 'detail-heading' }, [
          el('span', { 'class': 'status status-' + event.time_status, text: TIME_LABELS[event.time_status] }),
          el('span', { 'class': 'muted', text: ' ' + PUBLICATION_LABELS[event.publication] }),
          el('h1', { text: event.title || '(tanpa judul)' }),
          el('p', { 'class': 'schedule', text: formatWib(event.starts_at) + ' — ' + formatWib(event.ends_at) }),
          el('p', { 'class': 'muted', text: [{ online: 'Daring', offline: 'Luring', hybrid: 'Hibrida' }[event.mode], event.location].filter(Boolean).join(' · ') })
        ]),
        el('div', { 'class': 'description', text: event.description }),
        el('section', { 'class': 'access' }, [el('h2', { text: 'Akses kegiatan' }), el('div', { 'class': 'resources' }, resources)])
      );
      show('preview');
    }).catch(fail);
  }

  $('nav-list').addEventListener('click', function (event) { event.preventDefault(); loadList(); });
  $('new-event').addEventListener('click', function () { openEditor(null); });
  $('add-resource').addEventListener('click', function () { $('resource-rows').appendChild(resourceRow()); numberRows(); });
  $('reload-latest').addEventListener('click', function () { openEditor(state.current.id); });
  $('preview-back').addEventListener('click', function () { show('editor'); });
  $('f-slug').addEventListener('input', updateSlugPreview);
  try { $('login-name').value = localStorage.getItem('portal.admin.name') || ''; } catch (e) { /* abaikan */ }
  if (token()) {
    var savedName = '';
    try { savedName = sessionStorage.getItem('portal.admin.name') || ''; } catch (e) { /* abaikan */ }
    signedIn(savedName);
    loadList();
  } else {
    showLogin('');
  }
})();
