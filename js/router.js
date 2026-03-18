/**
 * router.js — Hash-based SPA router for VisitAPS
 *
 * Fetches original HTML pages from pantallas/, parses them with DOMParser,
 * extracts <style>, body content, and <script> blocks, then injects them
 * into #app. Original files stay untouched.
 *
 * Routes: #login, #menu, #perfil, #zona, #rondas, #relevamientos, #detalle, #terminos, #reportes
 */

(function () {
  'use strict';

  // ── Route → file mapping ──────────────────────────────────────────────────
  var ROUTES = {
    login:          'pantallas/visitaps-login-v2.html',
    menu:           'pantallas/visitaps-menu.html',
    perfil:         'pantallas/visitaps-perfil.html',
    zona:           'pantallas/visitaps-actualizar-zona.html',
    rondas:         'pantallas/visitaps-rondas.html',
    relevamientos:  'pantallas/visitaps-relevamientos.html',
    detalle:        'pantallas/visitaps-detalle-relevamiento.html',
    terminos:       'pantallas/visitaps-terminos.html',
    reportes:       'pantallas/visitaps-reportes.html',
    'menu-admin':      'pantallas/visitaps-menu-admin.html',
    administracion:       'pantallas/visitaps-administracion.html',
    'editar-usuario':     'pantallas/visitaps-editar-usuario.html',
    'crear-usuario':      'pantallas/visitaps-crear-usuario.html'
  };

  var DEFAULT_ROUTE = 'login';

  // ── Cache fetched pages to avoid re-downloading ───────────────────────────
  var pageCache = {};

  // ── DOM references ────────────────────────────────────────────────────────
  var appEl = document.getElementById('app');
  var pageStylesEl = document.getElementById('page-styles');

  // ── Current page tracking ─────────────────────────────────────────────────
  var currentPage = null;
  var currentFullHash = null;      // e.g. 'relevamientos?ronda=2&nombre=X'

  // ── Navigation stack (excludes perfil — perfil is a lateral screen) ──────
  var navigationStack = [];        // main flow history for back-button
  var profileReturnHash = null;    // full hash to return to when leaving perfil
  var isGoingBack = false;         // flag to prevent stack push on back navigation

  // ── Public navigation function ────────────────────────────────────────────
  window.navigateTo = function (hash, params) {
    if (params) {
      window.location.hash = hash + '?' + params;
    } else {
      window.location.hash = hash;
    }
  };

  // ── Parse hash from URL ───────────────────────────────────────────────────
  function parseHash() {
    var raw = window.location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
    var parts = raw.split('?');
    return { page: parts[0], query: parts[1] || '' };
  }

  // ── Parse query string into object ────────────────────────────────────────
  function parseQuery(queryStr) {
    if (!queryStr) return {};
    var params = {};
    queryStr.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return params;
  }

  // ── Fetch and cache a page ────────────────────────────────────────────────
  function fetchPage(pageId, callback) {
    if (pageCache[pageId]) {
      callback(null, pageCache[pageId]);
      return;
    }
    var url = ROUTES[pageId];
    if (!url) {
      callback(new Error('Route not found: ' + pageId));
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?v=' + Date.now(), true);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        pageCache[pageId] = xhr.responseText;
        callback(null, xhr.responseText);
      } else {
        callback(new Error('Failed to load ' + url + ': ' + xhr.status));
      }
    };
    xhr.onerror = function () {
      callback(new Error('Network error loading ' + url));
    };
    xhr.send();
  }

  // ── Parse HTML string and extract styles, body, scripts ───────────────────
  function parsePage(htmlString) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, 'text/html');

    // Extract all <style> from <head> (page-level CSS, not SVG internal styles)
    var headStyles = doc.querySelectorAll('head > style');
    var cssText = '';
    for (var i = 0; i < headStyles.length; i++) {
      cssText += headStyles[i].textContent + '\n';
    }

    // Remove html,body rules from page CSS since the shell handles those
    cssText = cssText.replace(
      /html\s*,\s*body\s*\{[^}]*\}/g,
      '/* html,body rules handled by shell */'
    );

    // Extract body innerHTML
    var body = doc.body;

    // Collect script contents and remove <script> tags from body
    var scripts = [];
    var scriptEls = body.querySelectorAll('script');
    for (var j = 0; j < scriptEls.length; j++) {
      if (scriptEls[j].textContent.trim()) {
        scripts.push(scriptEls[j].textContent);
      }
      scriptEls[j].parentNode.removeChild(scriptEls[j]);
    }

    return {
      css: cssText,
      html: body.innerHTML,
      scripts: scripts
    };
  }

  // ── Execute script strings after DOM injection ────────────────────────────
  function executeScripts(scripts) {
    scripts.forEach(function (code) {
      var s = document.createElement('script');
      s.textContent = code;
      appEl.appendChild(s);
    });
  }

  // ── Mount a page into #app ────────────────────────────────────────────────
  function mountPage(pageId, parsed, queryParams) {
    // Set page CSS
    pageStylesEl.textContent = parsed.css;

    // Set body content
    appEl.innerHTML = parsed.html;

    // Execute page scripts
    if (parsed.scripts.length > 0) {
      executeScripts(parsed.scripts);
    }

    currentPage = pageId;

    // Make query params available globally for page scripts
    window.__routeParams = queryParams || {};

    // Wire up navigation elements after mount
    wireNavigation(pageId);

    // Load data from Supabase after mount (deferred to ensure page scripts are fully registered)
    setTimeout(function() {
      postMount(pageId, queryParams);
    }, 0);
  }

  // ── Fade transition then mount ────────────────────────────────────────────
  function transitionTo(pageId, queryParams) {
    var isFirstLoad = currentPage === null;
    var isSamePage = pageId === currentPage;

    // Skip if same page AND same params (avoid redundant re-mounts)
    if (isSamePage && JSON.stringify(queryParams) === JSON.stringify(window.__routeParams || {})) {
      return;
    }

    // Clear app content immediately to prevent flash of mockup data
    if (!isFirstLoad) {
      appEl.classList.remove('fade-in');
      appEl.classList.add('fade-out');
    }

    fetchPage(pageId, function (err, htmlString) {
      if (err) {
        console.error(err);
        appEl.innerHTML = '<p style="padding:40px;text-align:center;color:#C9A84C;">Error cargando la página.</p>';
        return;
      }

      var parsed = parsePage(htmlString);

      if (isFirstLoad) {
        // No transition on first load
        mountPage(pageId, parsed, queryParams);
        appEl.classList.add('fade-in');
      } else {
        // Clear mockup content during fade-out, then mount with real data
        setTimeout(function () {
          appEl.innerHTML = '';
          mountPage(pageId, parsed, queryParams);
          appEl.classList.remove('fade-out');
          appEl.classList.add('fade-in');
        }, 160);
      }
    });
  }

  // ── Post-mount data loading from Supabase ──────────────────────────────
  // Cache the agente record for the session
  var cachedAgente = null;

  function getAgente() {
    if (cachedAgente) return Promise.resolve(cachedAgente);
    return window.VisitData.getAgente().then(function (result) {
      if (result.data) cachedAgente = result.data;
      return cachedAgente;
    });
  }

  // ── Pie chart for rondas storage display ──────────────────────────────────
  function renderPieChart() {
    var total = 8000000000;
    var ocupado = 720000;
    var ocupPct = ocupado / total;
    var dispPct = 1 - ocupPct;

    var dispEl = document.getElementById('pct-disponible');
    var ocuEl = document.getElementById('pct-ocupado');
    if (dispEl) dispEl.textContent = (dispPct * 100).toFixed(3) + '%';
    if (ocuEl) ocuEl.textContent = (ocupPct * 100).toFixed(3) + '%';

    var svg = document.getElementById('pie-chart');
    if (!svg) return;

    var cx = 50, cy = 50, r = 42;
    function polar(deg) {
      var rad = (deg - 90) * Math.PI / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function addSlice(a1, a2, color) {
      var s = polar(a1), e = polar(a2);
      var large = (a2 - a1) > 180 ? 1 : 0;
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M ' + cx + ' ' + cy +
        ' L ' + s.x + ' ' + s.y +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e.x + ' ' + e.y + ' Z');
      p.setAttribute('fill', color);
      svg.appendChild(p);
    }
    var dispDeg = dispPct * 360;
    addSlice(0, dispDeg, '#1B2A4A');
    if (ocupPct > 0) addSlice(dispDeg, 360, '#C9A84C');

    var sep = polar(0);
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    line.setAttribute('x2', sep.x); line.setAttribute('y2', sep.y);
    line.setAttribute('stroke', '#EDEAE4');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
  }

  function postMount(pageId, params) {
    // Perfil — populate agent info
    if (pageId === 'perfil') {
      getAgente().then(function (agente) {
        if (!agente) return;
        var fields = appEl.querySelectorAll('.field-value');
        // Order matches the perfil page structure
        var mapping = ['id', 'nombre', 'email', 'email', 'provincia', 'localidad', 'region', 'establecimiento', 'zona', 'nivel_acceso'];
        fields.forEach(function (el, i) {
          if (mapping[i] && agente[mapping[i]] !== undefined) {
            if (mapping[i] === 'nombre' && agente.apellido) {
              el.textContent = agente.nombre + ' ' + agente.apellido;
            } else {
              el.textContent = agente[mapping[i]];
            }
          }
        });
      });
    }

    // Rondas — load from Supabase
    if (pageId === 'rondas') {
      var listEl = document.getElementById('rondas-list');
      if (listEl) {
        listEl.innerHTML = '';
        window.VisitData.getRondas().then(function (result) {
          if (result.error || !result.data || result.data.length === 0) return;
          listEl.innerHTML = '';
          result.data.forEach(function (r, i) {
            var div = document.createElement('div');
            div.className = 'ronda-item';
            div.setAttribute('data-id', r.id);
            div.style.animationDelay = (i * 0.04) + 's';
            var sub = (r.descripcion || '') + (r.fecha_hasta ? ' - Fecha Fin: ' + r.fecha_hasta : '');
            div.innerHTML =
              '<div class="ronda-info">' +
                '<div class="ronda-id">id:' + r.id + ' CAPS: ' + (r.caps || '') + '</div>' +
                '<div class="ronda-sub">' + sub + '</div>' +
              '</div>' +
              '<svg class="ronda-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">' +
                '<path d="M1 1l5 5-5 5" stroke="#1B2A4A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>';
            listEl.appendChild(div);
          });
          wireRondaItems();
        });
      }

      // Render pie chart (static storage info)
      renderPieChart();
    }

    // Relevamientos — load from Supabase filtered by ronda and agente
    if (pageId === 'relevamientos' && params && params.ronda) {
      var rondaId = parseInt(params.ronda, 10);
      // Store current ronda ID globally for new relevamiento creation
      window.__currentRondaId = rondaId;

      // Update page subtitle with ronda name
      if (params.nombre) {
        var subtitle = appEl.querySelector('.page-subtitle');
        if (subtitle) subtitle.textContent = decodeURIComponent(params.nombre);
      }

      getAgente().then(function (agente) {
        if (!agente) return;
        window.__currentAgenteId = agente.id;

        var listEl = document.getElementById('relev-list') || appEl.querySelector('.relev-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        window.VisitData.getRelevamientos(rondaId, agente.id).then(function (result) {
          if (result.error) { console.error(result.error); return; }
          if (!result.data) return;
          var statusIcons = {
            enviado: '<svg width="16" height="13" viewBox="0 0 16 13" fill="none"><path d="M1.5 6.5l4.5 4.5 8.5-10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            no_enviado: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2l-9 9" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
            borrador: '<svg width="18" height="20" viewBox="0 0 14 15" fill="none"><rect x="1.5" y="1.5" width="11" height="12" rx="1.5" stroke="#fff" stroke-width="1.8"/><line x1="4" y1="5.5" x2="10" y2="5.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="8" x2="10" y2="8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="10.5" x2="7.5" y2="10.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>'
          };
          // Map DB estado values to CSS class names
          var estadoCssClass = {
            enviado: 'enviado',
            no_enviado: 'no-env',
            borrador: 'borrador'
          };

          result.data.forEach(function (r, i) {
            var div = document.createElement('div');
            div.className = 'relev-item';
            div.setAttribute('data-id', r.id);
            div.style.animationDelay = (i * 0.04) + 's';
            var icon = statusIcons[r.estado] || statusIcons.borrador;
            var cssClass = estadoCssClass[r.estado] || 'borrador';
            div.innerHTML =
              '<div class="relev-status ' + cssClass + '">' + icon + '</div>' +
              '<div class="relev-info">' +
                '<div class="relev-name">' + (r.identi || 'Sin identificación') + '</div>' +
                '<div class="relev-sub">Estado: ' + r.estado + '</div>' +
              '</div>' +
              '<svg class="relev-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">' +
                '<path d="M1 1l5 5-5 5" stroke="#1B2A4A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>';
            listEl.appendChild(div);
          });
          // Re-wire relevamiento click handlers
          wireRelevamientoItems();
        });
      });
    }

    // Detalle — three modes: nuevo, lectura, edicion
    if (pageId === 'detalle') {
      var modo = (params && params.modo) || '';
      var guardarBtn = appEl.querySelector('.btn-guardar');
      var btnWrap = guardarBtn ? guardarBtn.closest('.btn-wrap') : null;

      if (params && params.nuevo === '1') {
        // ── Mode 1: nuevo — create blank relevamiento, editable
        getAgente().then(function (agente) {
          if (!agente) return;
          var rondaId = window.__currentRondaId;
          if (!rondaId) { console.error('No ronda ID for new relevamiento'); return; }
          window.VisitData.createRelevamiento(rondaId, agente.id).then(function (result) {
            if (result.error) { console.error(result.error); return; }
            window.FormSync.init(result.data.id, agente.id);
          });
        });
        // Keep guardar button as-is for new relevamientos
        if (guardarBtn) {
          guardarBtn.addEventListener('click', function (e) {
            e.preventDefault();
            guardarBtn.disabled = true;
            guardarBtn.textContent = 'Guardando…';
            window.FormSync.saveAll().then(function () {
              guardarBtn.textContent = 'Guardado ✓';
              setTimeout(function () {
                guardarBtn.disabled = false;
                guardarBtn.textContent = 'Completar y Guardar';
              }, 2000);
            });
          });
        }

      } else if (params && params.relevamiento && modo === 'lectura') {
        // ── Mode 2: lectura — read-only view
        var relevId = parseInt(params.relevamiento, 10);
        getAgente().then(function (agente) {
          if (!agente) return;
          window.FormSync.init(relevId, agente.id);
        });

        // Disable all form inputs after data loads
        setTimeout(function () {
          appEl.querySelectorAll('input, textarea, select').forEach(function (el) {
            el.disabled = true;
            el.style.opacity = '0.7';
          });
          appEl.querySelectorAll('.dropdown-trigger, .custom-dropdown').forEach(function (el) {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.7';
          });
        }, 600);

        // Hide guardar button, add bottom padding, show fixed lectura actions
        if (btnWrap) btnWrap.style.display = 'none';
        var scrollBody = appEl.querySelector('.scroll-body');
        if (scrollBody) scrollBody.style.paddingBottom = '80px';

        var actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:16px 52px 24px;background:linear-gradient(to bottom,transparent,var(--cream) 30%);display:flex;justify-content:space-between;align-items:center;z-index:50;';

        var editLink = document.createElement('span');
        editLink.textContent = 'Editar';
        editLink.style.cssText = 'font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:var(--steel);cursor:pointer;transition:opacity 0.2s;';
        editLink.addEventListener('click', function () {
          navigateTo('detalle', 'relevamiento=' + relevId + '&modo=edicion');
        });

        var deleteLink = document.createElement('span');
        deleteLink.textContent = 'ELIMINAR';
        deleteLink.style.cssText = 'font-family:Montserrat,sans-serif;font-size:12px;font-weight:300;color:#C0392B;cursor:pointer;letter-spacing:0.05em;text-transform:uppercase;transition:opacity 0.2s;';
        deleteLink.addEventListener('click', function () {
          showDetallePopup(
            '¿Eliminar relevamiento?',
            'Esta acción no se puede deshacer. El relevamiento y todos sus datos serán eliminados permanentemente.',
            'Cancelar', 'Eliminar',
            function () {
              window.VisitData.deleteRelevamiento(relevId).then(function (result) {
                if (result.error) {
                  showToast('Error: ' + result.error.message);
                  return;
                }
                var rondaId = window.__currentRondaId;
                if (rondaId) {
                  isGoingBack = true;
                  navigationStack.pop();
                  navigateTo('relevamientos', 'ronda=' + rondaId);
                } else {
                  navigateTo('rondas');
                }
                showToast('Relevamiento eliminado');
              });
            }
          );
        });

        actionsDiv.appendChild(editLink);
        actionsDiv.appendChild(deleteLink);

        // Inject into .phone (not scroll-body) for fixed positioning
        var phoneEl = appEl.querySelector('.phone');
        if (phoneEl) {
          phoneEl.appendChild(actionsDiv);
        }

      } else if (params && params.relevamiento && modo === 'edicion') {
        // ── Mode 3: edicion — editable with save/discard
        var relevId = parseInt(params.relevamiento, 10);
        getAgente().then(function (agente) {
          if (!agente) return;
          window.FormSync.init(relevId, agente.id);
        });

        // Hide guardar button, add bottom padding, show fixed edicion actions
        if (btnWrap) btnWrap.style.display = 'none';
        var scrollBody = appEl.querySelector('.scroll-body');
        if (scrollBody) scrollBody.style.paddingBottom = '80px';

        var actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:16px 52px 24px;background:linear-gradient(to bottom,transparent,var(--cream) 30%);display:flex;justify-content:space-between;align-items:center;z-index:50;';

        var exitLink = document.createElement('span');
        exitLink.textContent = 'Salir sin guardar';
        exitLink.style.cssText = 'font-family:Montserrat,sans-serif;font-size:13px;font-weight:400;color:var(--text-soft);cursor:pointer;transition:opacity 0.2s;';
        exitLink.addEventListener('click', function () {
          showDetallePopup(
            '¿Salir sin guardar?',
            'Los cambios no guardados se perderán.',
            'Quedarme', 'Salir',
            function () {
              navigateTo('detalle', 'relevamiento=' + relevId + '&modo=lectura');
            }
          );
        });

        var saveLink = document.createElement('span');
        saveLink.textContent = 'GUARDAR CAMBIOS';
        saveLink.style.cssText = 'font-family:Montserrat,sans-serif;font-size:12px;font-weight:600;color:var(--steel);cursor:pointer;letter-spacing:0.05em;text-transform:uppercase;transition:opacity 0.2s;';
        saveLink.addEventListener('click', function () {
          saveLink.style.opacity = '0.5';
          saveLink.style.pointerEvents = 'none';
          window.FormSync.saveAll().then(function () {
            navigateTo('detalle', 'relevamiento=' + relevId + '&modo=lectura');
            showToast('Cambios guardados correctamente');
          });
        });

        actionsDiv.appendChild(exitLink);
        actionsDiv.appendChild(saveLink);

        // Inject into .phone for fixed positioning
        var phoneEl = appEl.querySelector('.phone');
        if (phoneEl) {
          phoneEl.appendChild(actionsDiv);
        }

      } else if (params && params.relevamiento) {
        // Fallback: no modo specified — treat as lectura
        navigateTo('detalle', 'relevamiento=' + params.relevamiento + '&modo=lectura');
        return;
      }
    }

    // Terminos — two modes: aceptacion (checkbox + buttons) / lectura (read-only)
    if (pageId === 'terminos') {
      var modo = (params && params.modo) || 'aceptacion';

      if (modo === 'lectura') {
        // Hide checkbox, action buttons, and error popup
        var acceptWrap = appEl.querySelector('.accept-wrap');
        var actionBtns = appEl.querySelector('.action-buttons');
        var popupOverlay = document.getElementById('popup-overlay');
        if (acceptWrap) acceptWrap.style.display = 'none';
        if (actionBtns) actionBtns.style.display = 'none';
        if (popupOverlay) popupOverlay.style.display = 'none';

        // Add a "Volver" link at the bottom
        var volverLink = document.createElement('span');
        volverLink.textContent = '\u2190 Volver';
        volverLink.style.cssText = 'font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer;display:block;text-align:center;padding:22px 0 0;';
        volverLink.addEventListener('click', function () {
          isGoingBack = true;
          var prev = navigationStack.pop();
          window.location.hash = prev || 'menu';
        });
        var content = appEl.querySelector('.content');
        if (content) content.appendChild(volverLink);
      } else {
        // Aceptacion mode — wire confirm/cancel/popup
        window.handleCancelar = function () {
          window.VisitAuth.logout().then(function () {
            cachedAgente = null;
            window._reporteAgente   = null;
            window._reporteOpciones = null;
            navigationStack = [];
            navigateTo('login');
          });
        };
        window.handleConfirmar = function () {
          var check = document.getElementById('accept-check');
          var popupOv = document.getElementById('popup-overlay');
          if (!check || !check.checked) {
            if (popupOv) popupOv.classList.add('active');
            return;
          }
          getAgente().then(function (agente) {
            if (!agente) return;
            window.VisitData.acceptTyc(agente.id).then(function (result) {
              if (result.error) {
                var popupMsg = popupOv ? popupOv.querySelector('.popup-msg') : null;
                if (popupMsg) popupMsg.textContent = 'Error: ' + result.error.message;
                if (popupOv) popupOv.classList.add('active');
                return;
              }
              if (cachedAgente) cachedAgente.accepted_tyc = true;
              var nivel = (agente.nivel_acceso || 'agente').toLowerCase();
              if (nivel === 'supervisor' || nivel === 'admin_provincial') {
                navigateTo('menu-admin');
              } else {
                navigateTo('menu');
              }
              showToast('Términos aceptados correctamente');
            });
          });
        };
        window.closePopup = function () {
          var popupOv = document.getElementById('popup-overlay');
          if (popupOv) popupOv.classList.remove('active');
        };
        window.handleOverlayClick = function (e) {
          if (e.target === document.getElementById('popup-overlay')) window.closePopup();
        };

        // Update button labels for this mode
        var cancelarBtn = appEl.querySelector('.btn-cancelar');
        var confirmarBtn = appEl.querySelector('.btn-confirmar');
        if (cancelarBtn) cancelarBtn.textContent = 'Rechazar';
        if (confirmarBtn) confirmarBtn.textContent = 'Aceptar';
      }
    }

    // Zona — render chart + wire action buttons to navigate to rondas
    if (pageId === 'zona') {
      setTimeout(function () {
        if (typeof window.renderChart === 'function') window.renderChart();
      }, 0);
      var actionBtns = appEl.querySelectorAll('.btn-action');
      actionBtns.forEach(function (btn) {
        var text = btn.textContent.trim().toLowerCase();
        if (text.indexOf('bajar') !== -1) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            btn.disabled = true;
            btn.innerHTML = '<span>Descargando…</span>';
            setTimeout(function () {
              navigateTo('rondas');
            }, 1200);
          });
        } else if (text.indexOf('continuar') !== -1) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            navigateTo('rondas');
          });
        }
      });
    }

    // Reportes — wire filters + cube report from Supabase
    if (pageId === 'reportes') {
      initReportes();
    }

    if (pageId === 'menu-admin') {
      getAgente().then(function (agente) {
        if (!agente) return;
        var badgeEl = document.getElementById('role-badge');
        if (badgeEl) {
          var nivel = (agente.nivel_acceso || '').toLowerCase();
          if (nivel === 'supervisor') {
            badgeEl.textContent = 'Supervisor';
            badgeEl.className = 'role-badge supervisor';
          } else {
            badgeEl.textContent = 'Administrador Provincial';
            badgeEl.className = 'role-badge admin';
          }
        }
      });
      wireMenuAdminButtons();
    }

    if (pageId === 'administracion') {
      getAgente().then(function(agente) {
        if (!agente) return;
        var nivel = (agente.nivel_acceso || 'agente').toLowerCase();

        if (window.initAdminTabs) window.initAdminTabs(nivel);

        window.VisitData.getAgentes().then(function(result) {
          if (result.error || !result.data) return;
          var usuarios = result.data;

          if (nivel === 'supervisor') {
            usuarios = usuarios.filter(function(u) {
              return u.establecimiento === agente.establecimiento;
            });
          }

          window._adminUsuarios = usuarios;
          window._zonasList = [];
          usuarios.forEach(function(u) {
            if (u.zona && window._zonasList.indexOf(u.zona) === -1)
              window._zonasList.push(u.zona);
          });

          if (window.renderTablaUsuarios) window.renderTablaUsuarios(usuarios);

          if (nivel === 'supervisor') {
            var zonasMap = {};
            usuarios.forEach(function(u) {
              if (u.zona) zonasMap[u.zona] = (zonasMap[u.zona] || 0) + 1;
            });
            var zonasArr = Object.keys(zonasMap).map(function(z) {
              return { zona: z, count: zonasMap[z] };
            });
            if (window.renderTablaZonas) window.renderTablaZonas(zonasArr);
          }

          if (nivel === 'admin_provincial' && window.initEstablecimientos) {
            // Construir mapa localidad → establecimientos desde agentes
            var locsArr = [];
            var estsPorLoc = {};
            usuarios.forEach(function(u) {
              if (u.localidad && locsArr.indexOf(u.localidad) === -1)
                locsArr.push(u.localidad);
              if (u.localidad && u.establecimiento) {
                if (!estsPorLoc[u.localidad]) estsPorLoc[u.localidad] = [];
                var existe = estsPorLoc[u.localidad].some(function(e) {
                  return e.nombre === u.establecimiento;
                });
                if (!existe) estsPorLoc[u.localidad].push({ nombre: u.establecimiento });
              }
            });
            window.initEstablecimientos(agente, locsArr, estsPorLoc);
          }
        });
      });
    }

    if (pageId === 'editar-usuario') {
      var usuario = window.__editUsuario;
      var zonas   = window._zonasList || [];
      setTimeout(function() {
        if (window.initEditUsuario) window.initEditUsuario(usuario, zonas);
      }, 0);
    }

    if (pageId === 'crear-usuario') {
      getAgente().then(function(agente) {
        if (!agente) return;
        var nivel = (agente.nivel_acceso || 'agente').toLowerCase();
        var nivelesPermitidos;
        if (nivel === 'admin_provincial') {
          nivelesPermitidos = [['agente','Agente'],['supervisor','Supervisor']];
        } else {
          nivelesPermitidos = [['agente','Agente']];
        }
        setTimeout(function() {
          if (window.initCrearUsuario) {
            window.initCrearUsuario(agente, window._zonasList || [], nivelesPermitidos);
          }
        }, 0);
      });
    }
  }

  // ── Reportes — full initialization ──────────────────────────────────────
  function initReportes() {
    // Limpiar estado anterior para forzar re-render limpio
    window._reporteAgente   = null;
    window._reporteOpciones = null;

    // Field mappings: [dbColumn, code, label]
    var VISITA_FIELDS = [
      ['fecha_visita','10090','Fecha_visita'],
      ['tipo_visita','10100','Tipo_de_visita'],
      ['tipo_zona','10120','Tipo_zona'],
      ['direccion','10130','Direccion'],
      ['manzana','10140','Manzana'],
      ['situacion_vivienda','10150','Situacion_vivienda'],
      ['acceso_vivienda','10160','Acceso_vivienda'],
      ['telefono1','10170','Telefono1'],
      ['telefono2','10180','Telefono2'],
      ['telefono3','10190','Telefono3']
    ];
    var VIVIENDA_FIELDS = [
      ['identificacion','10200','Identificacion'],
      ['tipo_vivienda','10210','Tipo_vivienda'],
      ['cant_dormitorios','10220','Cant_dormitorios'],
      ['cant_habitantes','10240','Cant_habitantes'],
      ['luz_electrica','10250','Luz_electrica'],
      ['sistema_cocina','10260','Sistema_cocina'],
      ['red_cloacal','10270','Red_cloacal'],
      ['agua_red_publica','10280','Agua_red_publica'],
      ['recoleccion_residuos','10290','Recoleccion_residuos'],
      ['cant_no_leer_escribir','10300','No_leer_escribir'],
      ['primario_incompleto','10310','Primario_incompleto'],
      ['secundario_incompleto','10320','Secundario_incompleto'],
      ['fuente_ingreso','10330','Fuente_ingreso'],
      ['hay_desocupados','10340','Desocupados'],
      ['presencia_animales','10350','Presencia_animales'],
      ['reservorios_agua','10360','Reservorios_agua'],
      ['acciones_larvas','10370','Acciones_larvas'],
      ['vigilancia_entomologica','10380','Vigilancia_entomologica'],
      ['consejeria_dengue','10382','Consejeria_dengue'],
      ['cant_perros','10410','Cant_perros'],
      ['perros_vacunados','10420','Perros_vacunados'],
      ['cant_gatos','10430','Cant_gatos'],
      ['gatos_vacunados','10440','Gatos_vacunados'],
      ['animales_sin_control','10450','Animales_sin_control']
    ];
    var SISTEMAS_FIELDS = [
      ['recurren_caps','10460','Recurren_caps'],
      ['referencia_salud','10480','Referencia_salud'],
      ['acceso_medicamentos','10490','Acceso_medicamentos'],
      ['obtencion_turno','10500','Obtencion_turno'],
      ['demora_turnos','11500','Demora_turnos']
    ];
    var PACIENTES_FIELDS = [
      ['apellido','10510','Apellido'],
      ['nombre','10520','Nombre'],
      ['fecha_nacimiento','10530','Fecha_nacimiento'],
      ['sexo','10550','Sexo'],
      ['dni','10560','DNI'],
      ['situacion_vivienda','10570','Situacion_vivienda'],
      ['tel','10580','Telefono'],
      ['mail','10590','Mail'],
      ['pais_nacimiento','10600','Pais_nacimiento'],
      ['pueblo_originario','10610','Pueblo_originario']
    ];

    var MODULOS = [
      { key: 'modulo_visita',    code: '01', desc: 'Módulo Visita',    modulo: 'VISITA',    fields: VISITA_FIELDS },
      { key: 'modulo_vivienda',  code: '10', desc: 'Módulo Vivienda',  modulo: 'VIVIENDA',  fields: VIVIENDA_FIELDS },
      { key: 'modulo_sistemas',  code: '20', desc: 'Módulo Sistemas',  modulo: 'SISTEMAS',  fields: SISTEMAS_FIELDS },
      { key: 'pacientes',        code: '30', desc: 'Módulo Pacientes', modulo: 'PACIENTE',  fields: PACIENTES_FIELDS }
    ];

    function flattenCubo(rawData, fechaDesde, fechaHasta) {
      var rows = [];
      rawData.forEach(function (rel) {
        var ag = rel.agentes;
        if (Array.isArray(ag)) ag = ag[0];
        ag = ag || {};

        // Get fecha_visita for date filtering
        var mv = rel.modulo_visita;
        if (Array.isArray(mv)) mv = mv[0] || null;
        var fechaVisita = mv ? (mv.fecha_visita || '') : '';

        // Date range filter — skip entire relevamiento if outside range
        if (fechaDesde || fechaHasta) {
          if (!fechaVisita) return;
          if (fechaDesde && fechaVisita < fechaDesde) return;
          if (fechaHasta && fechaVisita > fechaHasta) return;
        }

        var base = {
          idEncuesta: rel.id || '',
          Zona: ag.zona || '',
          Establecimiento: ag.establecimiento || '',
          Localidad: ag.localidad || '',
          Provincia: ag.provincia || '',
          Fecha: fechaVisita,
          Lat: rel.lat || '',
          Lng: rel.lng || '',
          Identificador: rel.identi || '',
          Agente: ((ag.apellido || '') + ', ' + (ag.nombre || '')).replace(/^, |, $/g, '')
        };

        MODULOS.forEach(function (mod) {
          var modData = rel[mod.key];
          if (modData === null || modData === undefined) return;

          if (mod.key === 'pacientes') {
            var patients = Array.isArray(modData) ? modData : [modData];
            patients.forEach(function (pac, idx) {
              if (!pac) return;
              var row = Object.assign({}, base);
              row.idgrupo = pac.id || '';
              row.codigoGrupo = mod.code;
              row.descripcionGrupo = mod.desc;
              row.instancia = idx + 1;
              row.modulo = mod.modulo;
              mod.fields.forEach(function (f) {
                var colName = mod.code + '-001-' + f[1] + '-' + f[2];
                var val = pac[f[0]];
                row[colName] = (val !== null && val !== undefined) ? String(val) : '';
              });
              rows.push(row);
            });
          } else {
            var m = Array.isArray(modData) ? modData[0] : modData;
            if (!m) return;
            var row = Object.assign({}, base);
            row.idgrupo = m.id || '';
            row.codigoGrupo = mod.code;
            row.descripcionGrupo = mod.desc;
            row.instancia = 0;
            row.modulo = mod.modulo;
            mod.fields.forEach(function (f) {
              var colName = mod.code + '-001-' + f[1] + '-' + f[2];
              var val = m[f[0]];
              row[colName] = (val !== null && val !== undefined) ? String(val) : '';
            });
            rows.push(row);
          }
        });
      });
      return rows;
    }

    getAgente().then(function (agente) {
      // Limpiar datos de sesión anterior
      window._reporteAgente   = null;
      window._reporteOpciones = null;

      if (!agente) {
        console.error('[initReportes] No se pudo obtener el agente');
        return;
      }

      // Exponer agente para que selectOption() lo lea en cascada
      window._reporteAgente = agente;
      window.reporteData = [];

      var nivel = (agente.nivel_acceso || 'agente').toLowerCase();

      // Init calendars
      window.initCal('desde');
      window.initCal('hasta');

      // Hook pickDate para limpiar error de fecha
      var origPickDate = window.pickDate;
      window.pickDate = function (id, day) {
        origPickDate(id, day);
        var fechaErr = document.getElementById('fecha-error');
        if (fechaErr) fechaErr.style.display = 'none';
      };

      // Guardar HTML del botón generar para restaurar después de loading
      var genBtn = appEl.querySelector('.btn-generar');
      var genBtnHTML = genBtn ? genBtn.innerHTML : '';

      // Override generarReporte con implementación Supabase real
      window.generarReporte = function () {
        var desde = window.getDateStr('desde');
        var hasta = window.getDateStr('hasta');
        var fechaErr = document.getElementById('fecha-error');
        if (desde && hasta && desde > hasta) {
          if (fechaErr) fechaErr.style.display = 'block';
          return;
        }
        if (fechaErr) fechaErr.style.display = 'none';

        var filtros = {};
        if (nivel === 'agente') {
          filtros.agenteId = agente.id;
        }

        if (genBtn) { genBtn.disabled = true; genBtn.innerHTML = 'Generando…'; }

        window.VisitData.getCuboReporte(filtros).then(function (result) {
          if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = genBtnHTML; }
          if (result.error) { showToast('Error: ' + result.error.message); return; }

          window.reporteData = flattenCubo(result.data || [], desde, hasta);

          var total = window.reporteData.length;
          var emptyState      = document.getElementById('empty-state');
          var resultsSection  = document.getElementById('results-section');
          var previewSection  = document.getElementById('preview-section');
          var exportRow       = document.getElementById('export-row');

          if (total === 0) {
            resultsSection.classList.remove('visible');
            previewSection.classList.remove('visible');
            exportRow.classList.remove('visible');
            if (emptyState) emptyState.style.display = 'block';
            return;
          }

          if (emptyState) emptyState.style.display = 'none';
          document.getElementById('stat-total').textContent = total;

          var byProv = {}, byLoc = {};
          window.reporteData.forEach(function (r) {
            if (r.Provincia) byProv[r.Provincia] = (byProv[r.Provincia] || 0) + 1;
            if (r.Localidad) byLoc[r.Localidad]  = (byLoc[r.Localidad]  || 0) + 1;
          });

          document.getElementById('stat-provincia').innerHTML = window.buildStatRows(byProv);
          document.getElementById('stat-localidad').innerHTML = window.buildStatRows(byLoc, 5);

          var cols = Object.keys(window.reporteData[0]);
          document.getElementById('preview-head').innerHTML =
            '<tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
          document.getElementById('preview-body').innerHTML =
            window.reporteData.slice(0, 50).map(function(r) {
              return '<tr>' + cols.map(function(c) {
                var v = r[c]; return '<td>' + (v != null ? v : '') + '</td>';
              }).join('') + '</tr>';
            }).join('');

          resultsSection.classList.add('visible');
          previewSection.classList.add('visible');
          exportRow.classList.add('visible');
          setTimeout(function() {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        });
      };

      // Cargar opciones y renderizar filtros
      if (nivel !== 'agente') {
        window.VisitData.getFilterOptions().then(function (result) {
          var opciones = { localidades: [], establecimientos: {}, zonas: {} };
          if (result.data) {
            result.data.forEach(function (row) {
              if (row.localidad && opciones.localidades.indexOf(row.localidad) === -1)
                opciones.localidades.push(row.localidad);
              if (row.localidad && row.establecimiento) {
                if (!opciones.establecimientos[row.localidad]) opciones.establecimientos[row.localidad] = [];
                if (opciones.establecimientos[row.localidad].indexOf(row.establecimiento) === -1)
                  opciones.establecimientos[row.localidad].push(row.establecimiento);
              }
              if (row.establecimiento && row.zona) {
                if (!opciones.zonas[row.establecimiento]) opciones.zonas[row.establecimiento] = [];
                if (opciones.zonas[row.establecimiento].indexOf(row.zona) === -1)
                  opciones.zonas[row.establecimiento].push(row.zona);
              }
            });
          }
          // Para supervisor: zonas como array plano del establecimiento asignado
          if (nivel === 'supervisor') {
            opciones.zonas = opciones.zonas[agente.establecimiento] || [];
          }
          window._reporteAgente   = agente;
          window._reporteOpciones = opciones;
          document.dispatchEvent(new CustomEvent('reportes:ready', {
            detail: { agente: agente, opciones: opciones }
          }));
        });
      } else {
        window._reporteAgente   = agente;
        window._reporteOpciones = {};
        document.dispatchEvent(new CustomEvent('reportes:ready', {
          detail: { agente: agente, opciones: {} }
        }));
      }
    });
  }

  // ── Detect nav icons by SVG content (profile = circle person, logout = door) ─
  function findNavIcons() {
    // Profile and logout icons are grouped: .nav-icon divs or inline-styled divs
    // Profile SVG contains a <circle> element; logout SVG does not
    var containers = appEl.querySelectorAll('.nav-icon, .top-nav div[style*="32px"]');
    var profileIcon = null;
    var logoutIcon = null;

    containers.forEach(function (el) {
      var svg = el.querySelector('svg');
      if (!svg) return;
      if (svg.querySelector('circle')) {
        profileIcon = el;
      } else if (svg.querySelector('path[d^="M9 3H4"]') || svg.querySelector('path[d^="M15 15l4"]')) {
        logoutIcon = el;
      }
    });

    return { profile: profileIcon, logout: logoutIcon };
  }

  // ── Wire navigation handlers on injected DOM ─────────────────────────────
  function buildHomeIcon(pageId) {
    var div = document.createElement('div');
    div.className = 'nav-icon';
    div.style.cssText = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.55;transition:opacity 0.2s;';
    div.innerHTML = '<img src="Logos/logo-button.svg" width="28" height="28" alt="Inicio" style="display:block;">';
    div.addEventListener('mouseenter', function() { div.style.opacity = '1'; });
    div.addEventListener('mouseleave', function() { div.style.opacity = '0.55'; });

    function goHome() {
      getAgente().then(function(agente) {
        var nivel = agente ? (agente.nivel_acceso || 'agente').toLowerCase() : 'agente';
        if (nivel === 'supervisor' || nivel === 'admin_provincial') {
          navigateTo('menu-admin');
        } else {
          navigateTo('menu');
        }
      });
    }

    div.addEventListener('click', function(e) {
      e.preventDefault();
      if (pageId === 'detalle') {
        var qp = window.__routeParams || {};
        if (qp.modo === 'edicion') {
          showDetallePopup(
            '¿Salir sin guardar?',
            'Los cambios no guardados se perderán. El relevamiento se mantendrá como estaba.',
            'Quedarme', 'Salir',
            goHome
          );
          return;
        } else if (qp.nuevo === '1') {
          showDetallePopup(
            '¿Salir sin guardar?',
            'Los cambios no guardados se perderán. El relevamiento quedará guardado como borrador.',
            'Quedarme', 'Salir',
            goHome
          );
          return;
        }
      }
      goHome();
    });
    return div;
  }

  function wireNavigation(pageId) {
    // "Atras" buttons — custom stack navigation
    var backBtns = appEl.querySelectorAll('.btn-atras');
    backBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();

        // Detalle — special back behavior per mode
        if (pageId === 'detalle') {
          var qp = window.__routeParams || {};
          var rondaId = window.__currentRondaId;
          var destHash = rondaId ? 'relevamientos?ronda=' + rondaId : 'rondas';

          function goBackToList() {
            isGoingBack = true;
            // Pop detalle (and possibly zona) entries so we land cleanly on relevamientos
            while (navigationStack.length > 0) {
              var top = navigationStack[navigationStack.length - 1];
              if (top.indexOf('relevamientos') === 0 || top === 'rondas' || top === 'menu') break;
              navigationStack.pop();
            }
            window.location.hash = destHash;
          }

          if (qp.modo === 'lectura') {
            goBackToList();
          } else if (qp.modo === 'edicion') {
            showDetallePopup(
              '¿Salir sin guardar?',
              'Los cambios no guardados se perderán. El relevamiento se mantendrá como estaba.',
              'Quedarme', 'Salir',
              goBackToList
            );
          } else if (qp.nuevo === '1') {
            showDetallePopup(
              '¿Salir sin guardar?',
              'Los cambios no guardados se perderán. El relevamiento quedará guardado como borrador.',
              'Quedarme', 'Salir',
              goBackToList
            );
          } else {
            goBackToList();
          }
          return;
        }

        isGoingBack = true;
        if (pageId === 'perfil') {
          // Perfil is lateral — return to saved hash (with full query params)
          var returnHash = profileReturnHash;
          profileReturnHash = null;
          if (returnHash) {
            window.location.hash = returnHash;
          } else {
            // Fallback: nivel-aware home screen
            getAgente().then(function (ag) {
              var n = ag && ag.nivel_acceso ? ag.nivel_acceso.toLowerCase() : 'agente';
              window.location.hash = (n === 'supervisor' || n === 'admin_provincial') ? 'menu-admin' : 'menu';
            });
          }
        } else {
          // Pop from navigation stack
          var prev = navigationStack.pop();
          if (prev) {
            window.location.hash = prev;
          } else {
            window.location.hash = 'menu';
          }
        }
      });
    });

    // Detect profile and logout icons by SVG content
    var MENU_SCREENS = { menu: true, 'menu-admin': true };

    if (MENU_SCREENS[pageId]) {
      // Menú principal: comportamiento original — perfil + logout
      var navIcons = findNavIcons();
      if (navIcons.profile) {
        navIcons.profile.addEventListener('click', function(e) {
          e.preventDefault();
          navigateTo('perfil');
        });
      }
      if (navIcons.logout) {
        navIcons.logout.addEventListener('click', function(e) {
          e.preventDefault();
          showLogoutPopup();
        });
      }
    } else {
      // Pantallas internas: ocultar perfil, reemplazar logout con home
      var navIcons = findNavIcons();
      if (navIcons.profile) {
        navIcons.profile.style.display = 'none';
      }
      if (navIcons.logout) {
        // Reemplazar el icono logout con el icono Home
        var homeIcon = buildHomeIcon(pageId);
        navIcons.logout.parentNode.replaceChild(homeIcon, navIcons.logout);
      }
    }

    // Login button — authenticate with Supabase
    if (pageId === 'login') {
      var loginBtn = appEl.querySelector('.btn-ingresar');
      if (loginBtn) {
        // Submit on Enter key from either input
        appEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            loginBtn.click();
          }
        });
        loginBtn.addEventListener('click', function (e) {
          e.preventDefault();
          var emailInput = appEl.querySelector('input[type="text"], input[type="email"]');
          var passInput = appEl.querySelector('input[type="password"]');
          if (!emailInput || !passInput) return;

          var email = emailInput.value.trim();
          var password = passInput.value;

          if (!email || !password) {
            showToast('Completá usuario y contraseña');
            return;
          }

          // Disable button while authenticating
          loginBtn.disabled = true;
          loginBtn.textContent = 'Ingresando…';

          window.VisitAuth.login(email, password).then(function (result) {
            if (result.error) {
              loginBtn.disabled = false;
              loginBtn.textContent = 'Ingresar';
              showToast('Error: ' + result.error.message);
              return;
            }
            // Check TyC acceptance before going to menu
            cachedAgente = null;
            getAgente().then(function (agente) {
              if (agente && agente.accepted_tyc) {
                var nivel = (agente.nivel_acceso || 'agente').toLowerCase();
                if (nivel === 'supervisor' || nivel === 'admin_provincial') {
                  navigateTo('menu-admin');
                } else {
                  navigateTo('menu');
                }
              } else {
                navigateTo('terminos', 'modo=aceptacion');
              }
            });
          });
        });
      }
    }

    // Menu buttons
    if (pageId === 'menu') {
      wireMenuButtons();
    }

    if (pageId === 'menu-admin') {
      wireMenuAdminButtons();
    }

    if (pageId === 'administracion') {
      wireAdminButtons();
    }

    // Ronda items — navigate to relevamientos
    if (pageId === 'rondas') {
      wireRondaItems();
    }

    // Relevamiento items — navigate to detalle
    if (pageId === 'relevamientos') {
      wireRelevamientoItems();
    }

    // Perfil page — wire action buttons
    if (pageId === 'perfil') {
      var actionBtns = appEl.querySelectorAll('.btn-action');
      actionBtns.forEach(function (btn) {
        var text = btn.textContent.trim().toLowerCase();
        if (text.indexOf('cerrar') !== -1) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            showLogoutPopup();
          });
        }
        if (text.indexOf('contraseña') !== -1 || text.indexOf('contrase') !== -1) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            showChangePasswordPopup();
          });
        }
      });
    }
  }

  // ── TyC gate popup ──────────────────────────────────────────────────────
  function showTycGatePopup() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeInOverlay 0.2s ease;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#EDEAE4;border-radius:12px;padding:28px 24px 20px;width:300px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);';

    var msg = document.createElement('p');
    msg.style.cssText = 'font-family:Montserrat,sans-serif;font-size:13px;font-weight:500;color:#2C2C2C;margin-bottom:20px;line-height:1.5;';
    msg.textContent = 'Debés aceptar los Términos y condiciones para continuar';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#8A8580;color:#F0EDE8;';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    var goBtn = document.createElement('button');
    goBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:12px;font-weight:600;cursor:pointer;background:#C9A84C;color:#1B2A4A;';
    goBtn.textContent = 'Ir a Términos';
    goBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
      navigateTo('terminos');
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(goBtn);
    card.appendChild(msg);
    card.appendChild(btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  // ── Navigate with TyC check ────────────────────────────────────────────
  function navigateWithTycCheck(targetHash) {
    getAgente().then(function (agente) {
      if (agente && agente.accepted_tyc) {
        navigateTo(targetHash);
      } else {
        showTycGatePopup();
      }
    });
  }

  // ── Menu button wiring ────────────────────────────────────────────────────
  function wireMenuButtons() {
    var buttons = appEl.querySelectorAll('.btn-menu');
    buttons.forEach(function (btn) {
      var text = btn.textContent.trim().toLowerCase();
      if (text.indexOf('ronda') !== -1) {
        btn.addEventListener('click', function () { navigateWithTycCheck('zona'); });
      } else if (text.indexOf('reporte') !== -1) {
        btn.addEventListener('click', function () { navigateWithTycCheck('reportes'); });
      }
    });
  }

  // ── Menu-admin button wiring ─────────────────────────────────────────────
  function wireMenuAdminButtons() {
    var buttons = appEl.querySelectorAll('.btn-menu');
    buttons.forEach(function (btn) {
      var text = btn.textContent.trim().toLowerCase();
      if (text.indexOf('administraci') !== -1) {
        btn.addEventListener('click', function () {
          navigateTo('administracion');
        });
      } else if (text.indexOf('reporte') !== -1) {
        btn.addEventListener('click', function () {
          navigateWithTycCheck('reportes');
        });
      }
    });

    // TyC link
    var tycLink = appEl.querySelector('.tyc-link');
    if (tycLink) {
      tycLink.onclick = null;
      tycLink.addEventListener('click', function () {
        navigateTo('terminos', 'modo=lectura');
      });
    }
  }

  // ── Admin page button wiring (HTML wires internally) ─────────────────────
  function wireAdminButtons() {}

  // ── Ronda item wiring ─────────────────────────────────────────────────────
  function wireRondaItems() {
    var items = appEl.querySelectorAll('.ronda-item');
    items.forEach(function (item) {
      item.addEventListener('click', function () {
        var id = item.getAttribute('data-id');
        var nom = item.querySelector('.ronda-id');
        var name = nom ? nom.textContent : '';
        navigateTo('relevamientos', 'ronda=' + id + '&nombre=' + encodeURIComponent(name));
      });
    });
  }

  // ── Relevamiento item wiring ──────────────────────────────────────────────
  function wireRelevamientoItems() {
    var items = appEl.querySelectorAll('.relev-item');
    items.forEach(function (item) {
      item.addEventListener('click', function () {
        var id = item.getAttribute('data-id');
        navigateTo('detalle', 'relevamiento=' + id + '&modo=lectura');
      });
    });

    // FAB button — new relevamiento
    var fab = appEl.querySelector('.fab');
    if (fab) {
      fab.style.bottom = '80px';
      fab.addEventListener('click', function () {
        navigateTo('detalle', 'nuevo=1');
      });
    }
  }

  // ── Logout confirmation popup ─────────────────────────────────────────────
  // ── Generic confirmation popup for detalle actions ──────────────────────
  function showDetallePopup(title, message, cancelText, confirmText, onConfirm) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeInOverlay 0.2s ease;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#EDEAE4;border-radius:12px;padding:28px 24px 20px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.2);';

    var titleEl = document.createElement('p');
    titleEl.style.cssText = 'font-family:Lora,serif;font-size:15px;font-weight:600;color:#1B2A4A;margin-bottom:10px;text-align:center;';
    titleEl.textContent = title;

    var msgEl = document.createElement('p');
    msgEl.style.cssText = 'font-family:Montserrat,sans-serif;font-size:12px;font-weight:400;color:#7A7672;line-height:1.6;margin-bottom:20px;text-align:center;';
    msgEl.textContent = message;

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#8A8580;color:#F0EDE8;';
    cancelBtn.textContent = cancelText;
    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#C9A84C;color:#1B2A4A;';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
      onConfirm();
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    card.appendChild(titleEl);
    card.appendChild(msgEl);
    card.appendChild(btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  function showLogoutPopup() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeInOverlay 0.2s ease;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#EDEAE4;border-radius:16px;padding:28px 24px 20px;width:280px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);';

    var p = document.createElement('p');
    p.style.cssText = 'font-family:Montserrat,sans-serif;font-size:14px;font-weight:500;color:#2C2C2C;margin-bottom:20px;';
    p.textContent = '¿Deseas cerrar sesión?';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#8A8580;color:#F0EDE8;';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#C9A84C;color:#1B2A4A;';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
      window.VisitAuth.logout().then(function () {
        cachedAgente = null;
        window._reporteAgente   = null;
        window._reporteOpciones = null;
        navigateTo('login');
      });
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    card.appendChild(p);
    card.appendChild(btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

  // ── Change password popup ────────────────────────────────────────────────
  function showChangePasswordPopup() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeInOverlay 0.2s ease;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#EDEAE4;border-radius:12px;padding:28px 24px 20px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.2);';

    var title = document.createElement('p');
    title.style.cssText = 'font-family:Montserrat,sans-serif;font-size:15px;font-weight:600;color:#2C2C2C;margin-bottom:20px;text-align:center;';
    title.textContent = 'Nueva contraseña';

    var inputStyle = 'width:100%;padding:10px 0;border:none;border-bottom:1px solid #B8B4AE;background:transparent;font-family:Montserrat,sans-serif;font-size:13px;font-weight:400;color:#2C2C2C;outline:none;transition:border-color 0.2s;';

    var pass1 = document.createElement('input');
    pass1.type = 'password';
    pass1.placeholder = 'Nueva contraseña';
    pass1.style.cssText = inputStyle + 'margin-bottom:14px;';

    var pass2 = document.createElement('input');
    pass2.type = 'password';
    pass2.placeholder = 'Confirmar contraseña';
    pass2.style.cssText = inputStyle + 'margin-bottom:6px;';

    var errorMsg = document.createElement('p');
    errorMsg.style.cssText = 'font-family:Montserrat,sans-serif;font-size:11px;font-weight:500;color:#C75050;min-height:18px;margin-bottom:14px;';
    errorMsg.textContent = '';

    // Focus styling
    [pass1, pass2].forEach(function (input) {
      input.addEventListener('focus', function () { input.style.borderBottomColor = '#5A7290'; });
      input.addEventListener('blur', function () { input.style.borderBottomColor = '#B8B4AE'; });
    });

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#8A8580;color:#F0EDE8;';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:1;padding:12px 0;border:none;border-radius:50px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;cursor:pointer;background:#C9A84C;color:#1B2A4A;';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', function () {
      var p1 = pass1.value;
      var p2 = pass2.value;

      if (p1.length < 6) {
        errorMsg.textContent = 'La contraseña debe tener al menos 6 caracteres';
        return;
      }
      if (p1 !== p2) {
        errorMsg.textContent = 'Las contraseñas no coinciden';
        return;
      }

      errorMsg.textContent = '';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Guardando…';

      window.VisitAuth.updatePassword(p1).then(function (result) {
        if (result.error) {
          errorMsg.textContent = result.error.message;
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirmar';
          return;
        }
        document.body.removeChild(overlay);
        showToast('Contraseña actualizada correctamente');
      });
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    card.appendChild(title);
    card.appendChild(pass1);
    card.appendChild(pass2);
    card.appendChild(errorMsg);
    card.appendChild(btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });

    pass1.focus();
  }

  // ── Toast notification (for login errors, etc.) ──────────────────────────
  function showToast(message) {
    var existing = document.querySelector('.visitaps-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'visitaps-toast';
    toast.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#1B2A4A;color:#F0EDE8;padding:12px 24px;border-radius:50px;font-family:Montserrat,sans-serif;font-size:12px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);opacity:0;transition:opacity 0.3s;max-width:320px;text-align:center;';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ── Block browser back from root screens (#login, #menu) ────────────────
  // When mounting a root screen, push a null state and attach a popstate
  // listener that re-pushes if the user is still on that screen.
  // The listener removes itself once the user navigates away.
  var ROOT_SCREENS = { login: true, menu: true, 'menu-admin': true };
  var _backGuardCleanup = null;

  function installBackGuard(hash) {
    // Remove previous guard if any
    if (_backGuardCleanup) _backGuardCleanup();

    var guardHash = '#' + hash;
    window.history.pushState(null, '', guardHash);

    function blockBack() {
      if (window.location.hash === guardHash || window.location.hash === '') {
        window.history.pushState(null, '', guardHash);
      } else {
        // Navigated away — remove this guard
        window.removeEventListener('popstate', blockBack);
        _backGuardCleanup = null;
      }
    }

    window.addEventListener('popstate', blockBack);
    _backGuardCleanup = function () {
      window.removeEventListener('popstate', blockBack);
      _backGuardCleanup = null;
    };
  }

  // ── Handle hash changes with session guard ────────────────────────────────
  function onHashChange() {
    var route = parseHash();
    if (!ROUTES[route.page]) {
      route.page = DEFAULT_ROUTE;
    }
    var queryParams = parseQuery(route.query);
    var newFullHash = route.query ? route.page + '?' + route.query : route.page;

    // ── Stack management (before transition) ──────────────────────────────
    if (isGoingBack) {
      // Back navigation — stack was already popped, just update current tracking
      isGoingBack = false;
    } else if (route.page === 'perfil') {
      // Perfil is lateral — save where we came from but don't touch the stack
      if (currentFullHash && currentPage !== 'perfil') {
        profileReturnHash = currentFullHash;
      }
    } else if (route.page === 'login' || route.page === 'menu' || route.page === 'menu-admin') {
      // Login and menu reset everything — these are "root" screens
      navigationStack = [];
      profileReturnHash = null;
    } else {
      // Normal forward navigation — push previous page to stack
      if (currentFullHash && currentPage && currentPage !== 'perfil' && currentPage !== 'login') {
        navigationStack.push(currentFullHash);
      }
    }
    currentFullHash = newFullHash;

    // Public pages don't require auth
    if (route.page === 'login') {
      transitionTo(route.page, queryParams);
      installBackGuard(route.page);
      return;
    }

    // Protected pages — check session
    window.VisitAuth.isLoggedIn().then(function (loggedIn) {
      if (!loggedIn) {
        navigateTo('login');
        return;
      }
      transitionTo(route.page, queryParams);
      if (ROOT_SCREENS[route.page]) installBackGuard(route.page);
    });
  }

  // ── Close dropdown portals on scroll (once) ─────────────────────────────
  document.addEventListener('scroll', function () {
    if (window.closePortal) window.closePortal();
  }, { passive: true, capture: true });

  // ── Initialize ────────────────────────────────────────────────────────────
  window.addEventListener('hashchange', onHashChange);

  // Initial load
  onHashChange();

})();
