/**
 * form-sync.js — Binds detalle-relevamiento form fields to Supabase
 *
 * Reads field values from the DOM, debounces saves (1.5s), and populates
 * fields when loading an existing relevamiento.
 *
 * Exposed as window.FormSync with init() and saveAll() methods.
 */

(function () {
  'use strict';

  var DEBOUNCE_MS = 1500;
  var debounceTimers = {};
  var currentRelevamientoId = null;
  var currentAgenteId = null;

  // ── Field ID → DB column mappings ─────────────────────────────────────────

  var VISITA_FIELDS = {
    'date-text-10090':  { col: 'fecha_visita', type: 'date' },
    'dd-10100':         { col: 'tipo_visita', type: 'dropdown' },
    'dd-10120':         { col: 'tipo_zona', type: 'dropdown' },
    'f10130':           { col: 'direccion', type: 'text' },
    'f10140':           { col: 'manzana', type: 'text' },
    'dd-10150':         { col: 'situacion_vivienda', type: 'dropdown' },
    'dd-10160':         { col: 'acceso_vivienda', type: 'dropdown' },
    'f10170':           { col: 'telefono1', type: 'text' },
    'f10180':           { col: 'telefono2', type: 'text' },
    'f10190':           { col: 'telefono3', type: 'text' }
  };

  var VIVIENDA_FIELDS = {
    'f10-010-10200':           { col: 'identificacion', type: 'text' },
    'dd-10-010-10210':         { col: 'tipo_vivienda', type: 'dropdown' },
    'f10-010-10220':           { col: 'cant_dormitorios', type: 'number' },
    'f10-010-10240':           { col: 'cant_habitantes', type: 'number' },
    'dd-10-020-10250':         { col: 'luz_electrica', type: 'dropdown' },
    'dd-10-020-10260':         { col: 'sistema_cocina', type: 'dropdown' },
    'dd-10-020-10270':         { col: 'red_cloacal', type: 'dropdown' },
    'dd-10-020-10280':         { col: 'agua_red_publica', type: 'dropdown' },
    'dd-10-020-10290':         { col: 'recoleccion_residuos', type: 'dropdown' },
    'f10-030-10300':           { col: 'cant_no_leer_escribir', type: 'number' },
    'dd-10-030-10310':         { col: 'primario_incompleto', type: 'dropdown' },
    'dd-10-030-10320':         { col: 'secundario_incompleto', type: 'dropdown' },
    'dd-10-030-10330':         { col: 'fuente_ingreso', type: 'dropdown' },
    'dd-10-030-10340':         { col: 'hay_desocupados', type: 'dropdown' },
    'dd-10-040-10350':         { col: 'presencia_animales', type: 'multiselect' },
    'dd-10-040-10360':         { col: 'reservorios_agua', type: 'dropdown' },
    'dd-10-040-10370':         { col: 'acciones_larvas', type: 'dropdown' },
    'dd-10-040-10380':         { col: 'vigilancia_entomologica', type: 'dropdown' },
    'dd-10-040-10382':         { col: 'consejeria_dengue', type: 'dropdown' },
    'f10-040-10410':           { col: 'cant_perros', type: 'number' },
    'f10-040-10420':           { col: 'perros_vacunados', type: 'number' },
    'f10-040-10430':           { col: 'cant_gatos', type: 'number' },
    'f10-040-10440':           { col: 'gatos_vacunados', type: 'number' },
    'dd-10-040-10450':         { col: 'animales_sin_control', type: 'dropdown' }
  };

  var SISTEMAS_FIELDS = {
    'dd-20-050-10460':         { col: 'recurren_caps', type: 'dropdown' },
    'dd-20-050-10480':         { col: 'referencia_salud', type: 'multiselect' },
    'dd-20-050-10490':         { col: 'acceso_medicamentos', type: 'multiselect' },
    'dd-20-050-10500':         { col: 'obtencion_turno', type: 'multiselect' },
    'dd-20-050-11500':         { col: 'demora_turnos', type: 'dropdown' }
  };

  var PACIENTE_FIELDS = {
    '30-101-10510': { col: 'apellido', type: 'text' },
    '30-101-10520': { col: 'nombre', type: 'text' },
    '30-101-10530': { col: 'fecha_nacimiento', type: 'date' },
    '30-101-10550': { col: 'sexo', type: 'dropdown' },
    '30-101-10560': { col: 'dni', type: 'text' },
    '30-101-10570': { col: 'situacion_vivienda', type: 'dropdown' },
    '30-101-10580': { col: 'tel', type: 'text' },
    '30-101-10590': { col: 'mail', type: 'text' },
    '30-101-10600': { col: 'pais_nacimiento', type: 'dropdown' },
    '30-101-10610': { col: 'pueblo_originario', type: 'dropdown' }
  };

  // ── Read a field value from DOM ───────────────────────────────────────────

  function readField(fieldId, fieldDef) {
    var el;
    switch (fieldDef.type) {
      case 'text':
      case 'number':
        el = document.getElementById(fieldId);
        if (!el) return null;
        var val = el.value.trim();
        if (fieldDef.type === 'number') return val ? parseInt(val, 10) : null;
        return val || null;

      case 'dropdown':
        // Custom dropdowns store selected value in the trigger text
        var trigger = document.querySelector('#' + CSS.escape(fieldId) + ' .dropdown-trigger');
        if (!trigger) return null;
        var text = trigger.textContent.trim();
        return (text && text !== 'Seleccionar') ? text : null;

      case 'multiselect':
        // Multiselect stores checked values
        var display = document.querySelector('[id^="ms-display-"]');
        var container = document.getElementById(fieldId);
        if (!container) return null;
        var checked = container.querySelectorAll('.ms-checkbox:checked, input[type="checkbox"]:checked');
        var values = [];
        checked.forEach(function (cb) {
          var label = cb.closest('.ms-option, .dropdown-option');
          if (label) values.push(label.textContent.trim());
        });
        return values.length > 0 ? values : null;

      case 'date':
        el = document.getElementById(fieldId);
        if (!el) return null;
        var dateVal = el.value || el.textContent;
        if (!dateVal || dateVal.trim() === '' || dateVal === 'dd/mm/aaaa') return null;
        // Convert dd/mm/yyyy to yyyy-mm-dd for PostgreSQL
        var parts = dateVal.trim().split('/');
        if (parts.length === 3) {
          return parts[2] + '-' + parts[1] + '-' + parts[0];
        }
        return dateVal;

      default:
        return null;
    }
  }

  // ── Write a field value to DOM ────────────────────────────────────────────

  /**
   * Escribe un valor en el campo editable Y en su contraparte readonly.
   * Extrae un baseId numérico quitando prefijos (date-text-, dd-, f) del fieldId,
   * ya que los IDs readonly usan solo el código numérico (ej. readonly-10100).
   * @param {string} fieldId - ID del campo editable en el DOM
   * @param {object} fieldDef - Definición del campo ({col, type})
   * @param {*} value - Valor a escribir
   */
  function writeField(fieldId, fieldDef, value) {
    if (value === null || value === undefined) return;
    var el;

    // Extraer ID base para readonly: quitar prefijos dd-, f, date-text-
    var baseId = fieldId
      .replace(/^date-text-/, '')
      .replace(/^dd-/, '')
      .replace(/^f/, '');

    switch (fieldDef.type) {
      case 'text':
      case 'number':
        el = document.getElementById(fieldId);
        if (el) el.value = value;
        var roEl = document.getElementById('input-readonly-f' + baseId);
        if (roEl) roEl.textContent = value;
        break;

      case 'dropdown':
        var trigger = document.querySelector('#' + CSS.escape(fieldId) + ' .dropdown-trigger');
        if (trigger) { trigger.textContent = value; trigger.classList.add('selected'); }
        var roDD = document.getElementById('readonly-' + baseId);
        if (roDD) roDD.textContent = value;
        break;

      case 'multiselect':
        // Escribe el texto separado por comas en ms-display-{baseId} (span visible),
        // y sincroniza el estado visual (checked/svg) de cada opción en dl-{baseId}.
        var msText = Array.isArray(value) ? value.join(', ') : (value || '');

        // Escribir en el span de display directamente por ID (más confiable que querySelector)
        var msDisplayEl = document.getElementById('ms-display-' + baseId);
        if (msDisplayEl) msDisplayEl.textContent = msText || 'Selecciona';

        // Marcar opciones como checked en el DOM fuente
        if (Array.isArray(value) && value.length > 0) {
          var srcList = document.getElementById('dl-' + baseId);
          if (srcList) {
            srcList.querySelectorAll('.ms-option').forEach(function(opt) {
              // Obtener solo el texto del label (ignorar el checkbox div)
              var checkboxDiv = opt.querySelector('.ms-checkbox');
              var label = opt.textContent.replace(checkboxDiv ? checkboxDiv.textContent : '', '').trim();
              var isChecked = value.indexOf(label) !== -1;
              opt.classList.toggle('checked', isChecked);
              var svg = opt.querySelector('svg');
              if (svg) svg.style.display = isChecked ? 'block' : 'none';
            });
          }
        }

        // Readonly
        var roMS = document.getElementById('readonly-' + baseId);
        if (roMS) roMS.textContent = msText || '—';
        break;

      case 'date':
        el = document.getElementById(fieldId);
        if (el && value) {
          var parts = value.split('-');
          if (parts.length === 3) {
            var display = parts[2] + '/' + parts[1] + '/' + parts[0];
            el.value = display;
            el.textContent = display;
            var roDt = document.getElementById('date-readonly-' + baseId);
            if (roDt) roDt.textContent = display;
          }
        }
        break;
    }
  }

  // ── Collect all fields for a module ────────────────────────────────────────

  function collectModuleData(fieldMap) {
    var data = {};
    Object.keys(fieldMap).forEach(function (fieldId) {
      var def = fieldMap[fieldId];
      var val = readField(fieldId, def);
      if (val !== null) {
        data[def.col] = val;
      }
    });
    return data;
  }

  // ── Populate fields from DB data ──────────────────────────────────────────

  function populateModule(fieldMap, data) {
    if (!data) return;
    Object.keys(fieldMap).forEach(function (fieldId) {
      var def = fieldMap[fieldId];
      if (data[def.col] !== undefined) {
        writeField(fieldId, def, data[def.col]);
      }
    });
  }

  // ── Debounced save for a module ───────────────────────────────────────────

  function debouncedSave(moduleKey, saveFn) {
    if (debounceTimers[moduleKey]) {
      clearTimeout(debounceTimers[moduleKey]);
    }
    debounceTimers[moduleKey] = setTimeout(function () {
      saveFn();
    }, DEBOUNCE_MS);
  }

  // ── Save functions ────────────────────────────────────────────────────────

  function saveModuloVisita() {
    if (!currentRelevamientoId) return;
    var data = collectModuleData(VISITA_FIELDS);
    window.VisitData.upsertModuloVisita(currentRelevamientoId, data).then(function (result) {
      if (result.error) console.error('Error saving módulo visita:', result.error);
    });
  }

  function saveModuloVivienda() {
    if (!currentRelevamientoId) return;
    var data = collectModuleData(VIVIENDA_FIELDS);
    window.VisitData.upsertModuloVivienda(currentRelevamientoId, data).then(function (result) {
      if (result.error) console.error('Error saving módulo vivienda:', result.error);
    });
  }

  function saveModuloSistemas() {
    if (!currentRelevamientoId) return;
    var data = collectModuleData(SISTEMAS_FIELDS);
    window.VisitData.upsertModuloSistemas(currentRelevamientoId, data).then(function (result) {
      if (result.error) console.error('Error saving módulo sistemas:', result.error);
    });
  }

  // Construye el fieldId de cada campo del paciente: prefijo según tipo
  // (f para text/number, date-text- para date, dd- para dropdown) + baseId + sufijo -pN.
  function savePaciente(nro) {
    if (!currentRelevamientoId) return;
    var suffix = '-p' + nro;
    var data = {};
    Object.keys(PACIENTE_FIELDS).forEach(function (baseId) {
      var def = PACIENTE_FIELDS[baseId];
      var fieldId;
      if (def.type === 'text' || def.type === 'number') {
        fieldId = 'f' + baseId + suffix;
      } else if (def.type === 'date') {
        fieldId = 'date-text-' + baseId + suffix;
      } else if (def.type === 'dropdown') {
        fieldId = 'dd-' + baseId + suffix;
      }
      var val = readField(fieldId, def);
      if (val !== null) {
        data[def.col] = val;
      }
    });
    window.VisitData.upsertPaciente(currentRelevamientoId, nro, data).then(function (result) {
      if (result.error) console.error('Error saving paciente ' + nro + ':', result.error);
    });
  }

  // ── Attach change listeners ───────────────────────────────────────────────

  function attachListeners() {
    var appEl = document.getElementById('app');
    if (!appEl) return;

    // Listen for input changes on text/number/tel fields
    appEl.addEventListener('input', function (e) {
      var el = e.target;
      if (!el.id) return;

      // Determine which module this field belongs to
      if (VISITA_FIELDS[el.id]) {
        debouncedSave('visita', saveModuloVisita);
      } else if (VIVIENDA_FIELDS[el.id]) {
        debouncedSave('vivienda', saveModuloVivienda);
      } else if (SISTEMAS_FIELDS[el.id]) {
        debouncedSave('sistemas', saveModuloSistemas);
      } else if (el.id.match(/p\d+$/)) {
        // Patient field — extract nro from ID suffix
        var match = el.id.match(/p(\d+)$/);
        if (match) {
          var nro = parseInt(match[1], 10);
          debouncedSave('paciente-' + nro, function () { savePaciente(nro); });
        }
      }
    });

    /*
     * MutationObserver para dropdowns custom: estos no disparan eventos nativos
     * de input al cambiar el texto del trigger. El observer detecta mutaciones
     * childList/characterData en .custom-dropdown y rutea al save del módulo correcto.
     */
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type !== 'childList' && mutation.type !== 'characterData') return;
        var target = mutation.target;
        var dropdownEl = target.closest ? target.closest('.custom-dropdown') : null;
        if (!dropdownEl || !dropdownEl.id) return;

        var ddId = dropdownEl.id;
        if (VISITA_FIELDS[ddId]) {
          debouncedSave('visita', saveModuloVisita);
        } else if (VIVIENDA_FIELDS[ddId]) {
          debouncedSave('vivienda', saveModuloVivienda);
        } else if (SISTEMAS_FIELDS[ddId]) {
          debouncedSave('sistemas', saveModuloSistemas);
        } else if (ddId.match(/p\d+$/)) {
          var match = ddId.match(/p(\d+)$/);
          if (match) {
            var nro = parseInt(match[1], 10);
            debouncedSave('paciente-' + nro, function () { savePaciente(nro); });
          }
        }
      });
    });

    observer.observe(appEl, { childList: true, subtree: true, characterData: true });
  }

  // ── Populate all fields from a complete relevamiento ──────────────────────

  /**
   * Popula todos los campos del formulario con datos de Supabase.
   * Supabase devuelve relaciones 1:1 como arrays de un elemento ([{...}]),
   * por eso se desempaqueta con Array.isArray check antes de pasarlo a populateModule.
   * Los pacientes se ordenan por nro y se crean dinámicamente con agregarPaciente().
   * @param {Object} data - Relevamiento completo con joins (modulo_visita, modulo_vivienda, etc.)
   */
  function populateAll(data) {
    if (!data) return;

    // Supabase devuelve relaciones como arrays — tomar el primer elemento
    var mv = data.modulo_visita;
    if (mv) populateModule(VISITA_FIELDS, Array.isArray(mv) ? mv[0] : mv);

    var mvi = data.modulo_vivienda;
    if (mvi) populateModule(VIVIENDA_FIELDS, Array.isArray(mvi) ? mvi[0] : mvi);

    var ms = data.modulo_sistemas;
    if (ms) populateModule(SISTEMAS_FIELDS, Array.isArray(ms) ? ms[0] : ms);

    // Populate patients
    if (data.pacientes && data.pacientes.length > 0) {
      data.pacientes.sort(function (a, b) { return a.nro - b.nro; });
      data.pacientes.forEach(function (pac) {
        // First patient is already in the DOM, others need to be added
        if (typeof window.agregarPaciente === 'function') {
          window.agregarPaciente();
        }
        var suffix = '-p' + pac.nro;
        Object.keys(PACIENTE_FIELDS).forEach(function (baseId) {
          var def = PACIENTE_FIELDS[baseId];
          var fieldId;
          if (def.type === 'text' || def.type === 'number') {
            fieldId = 'f' + baseId + suffix;
          } else if (def.type === 'date') {
            fieldId = 'date-text-' + baseId + suffix;
          } else if (def.type === 'dropdown') {
            fieldId = 'dd-' + baseId + suffix;
          }
          writeField(fieldId, def, pac[def.col]);
        });
      });
    }
  }

  // ── Save everything at once (for "Completar y Guardar" button) ────────────

  function saveAll() {
    if (!currentRelevamientoId) return Promise.resolve();

    var promises = [
      (function () {
        var data = collectModuleData(VISITA_FIELDS);
        return window.VisitData.upsertModuloVisita(currentRelevamientoId, data);
      })(),
      (function () {
        var data = collectModuleData(VIVIENDA_FIELDS);
        return window.VisitData.upsertModuloVivienda(currentRelevamientoId, data);
      })(),
      (function () {
        var data = collectModuleData(SISTEMAS_FIELDS);
        return window.VisitData.upsertModuloSistemas(currentRelevamientoId, data);
      })()
    ];

    // Save all patients
    var pacienteSections = document.querySelectorAll('[id^="acc-paciente-p"]');
    pacienteSections.forEach(function (section) {
      var match = section.id.match(/p(\d+)/);
      if (match) {
        var nro = parseInt(match[1], 10);
        promises.push((function (n) {
          return new Promise(function (resolve) {
            savePaciente(n);
            resolve();
          });
        })(nro));
      }
    });

    // Update estado to no_enviado
    promises.push(
      window.VisitData.updateEstado(currentRelevamientoId, 'no_enviado')
    );

    return Promise.all(promises);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.FormSync = {
    /**
     * Initialize form sync for a relevamiento
     * @param {number} relevamientoId - existing relevamiento ID
     * @param {number} agenteId - current agent ID
     */
    init: function (relevamientoId, agenteId) {
      currentRelevamientoId = relevamientoId;
      currentAgenteId = agenteId;

      // Attach change listeners for real-time save
      attachListeners();

      // Load existing data if editing
      if (relevamientoId) {
        window.VisitData.getRelevamientoCompleto(relevamientoId).then(function (result) {
          if (result.error) {
            console.error('Error loading relevamiento:', result.error);
            return;
          }
          if (result.data) {
            populateAll(result.data);
          }
        });
      }
    },

    /**
     * Save all form data at once
     * @returns {Promise}
     */
    saveAll: saveAll,

    /**
     * Get the current relevamiento ID
     * @returns {number|null}
     */
    getRelevamientoId: function () {
      return currentRelevamientoId;
    }
  };

})();
