/**
 * data-service.js — Supabase data access layer for VisitAPS
 *
 * Provides window.VisitData with methods to read/write:
 *   - Agent profile
 *   - Rondas
 *   - Relevamientos (CRUD)
 *   - Módulo Visita, Vivienda, Sistemas (upsert)
 *   - Pacientes (CRUD)
 */

(function () {
  'use strict';

  var db = function () { return window.supabaseClient; };

  window.VisitData = {

    // ── Agent profile ─────────────────────────────────────────────────────
    /**
     * Get the agent record linked to the current auth user
     * @returns {Promise<{data, error}>}
     */
    getAgente: function () {
      return window.supabaseClient.auth.getUser().then(function(result) {
        var uid = result.data && result.data.user ? result.data.user.id : null;
        if (!uid) return { data: null, error: { message: 'No auth user' } };
        return window.supabaseClient.from('agentes')
          .select('*')
          .eq('auth_uid', uid)
          .single();
      });
    },

    // ── Rondas ────────────────────────────────────────────────────────────
    /**
     * Get all rondas available to the current agent
     * @returns {Promise<{data, error}>}
     */
    getRondas: function () {
      return db().from('rondas')
        .select('*')
        .order('id', { ascending: false });
    },

    // ── Relevamientos ─────────────────────────────────────────────────────
    /**
     * Get relevamientos for a specific ronda and the current agent
     * @param {number} rondaId
     * @param {number} agenteId
     * @returns {Promise<{data, error}>}
     */
    getRelevamientos: function (rondaId, agenteId) {
      return db().from('relevamientos')
        .select('*')
        .eq('ronda_id', rondaId)
        .eq('agente_id', agenteId)
        .order('created_at', { ascending: false });
    },

    /**
     * Create a new relevamiento (estado = borrador)
     * @param {number} rondaId
     * @param {number} agenteId
     * @returns {Promise<{data, error}>}
     */
    createRelevamiento: function (rondaId, agenteId) {
      return db().from('relevamientos')
        .insert({
          ronda_id: rondaId,
          agente_id: agenteId,
          estado: 'borrador'
        })
        .select()
        .single();
    },

    /**
     * Get a single relevamiento with all related modules
     * @param {number} relevamientoId
     * @returns {Promise<{data, error}>}
     */
    getRelevamientoCompleto: function (relevamientoId) {
      return db().from('relevamientos')
        .select('*, rondas(*), modulo_visita(*), modulo_vivienda(*), modulo_sistemas(*), pacientes(*)')
        .eq('id', relevamientoId)
        .single();
    },

    /**
     * Update relevamiento estado
     * @param {number} id
     * @param {string} estado - 'borrador' | 'no_enviado' | 'enviado'
     * @returns {Promise<{data, error}>}
     */
    updateEstado: function (id, estado) {
      return db().from('relevamientos')
        .update({ estado: estado })
        .eq('id', id)
        .select()
        .single();
    },

    /**
     * Update relevamiento identi field
     * @param {number} id
     * @param {string} identi
     * @returns {Promise<{data, error}>}
     */
    updateIdenti: function (id, identi) {
      return db().from('relevamientos')
        .update({ identi: identi })
        .eq('id', id)
        .select()
        .single();
    },

    // ── Módulo Visita ─────────────────────────────────────────────────────
    /**
     * Upsert módulo visita data
     * @param {number} relevamientoId
     * @param {object} fields - { fecha_visita, tipo_visita, ... }
     * @returns {Promise<{data, error}>}
     */
    upsertModuloVisita: function (relevamientoId, fields) {
      var row = Object.assign({ relevamiento_id: relevamientoId }, fields);
      return db().from('modulo_visita')
        .upsert(row, { onConflict: 'relevamiento_id' })
        .select()
        .single();
    },

    // ── Módulo Vivienda ───────────────────────────────────────────────────
    /**
     * Upsert módulo vivienda data
     * @param {number} relevamientoId
     * @param {object} fields
     * @returns {Promise<{data, error}>}
     */
    upsertModuloVivienda: function (relevamientoId, fields) {
      var row = Object.assign({ relevamiento_id: relevamientoId }, fields);
      return db().from('modulo_vivienda')
        .upsert(row, { onConflict: 'relevamiento_id' })
        .select()
        .single();
    },

    // ── Módulo Sistemas ───────────────────────────────────────────────────
    /**
     * Upsert módulo sistemas data
     * @param {number} relevamientoId
     * @param {object} fields
     * @returns {Promise<{data, error}>}
     */
    upsertModuloSistemas: function (relevamientoId, fields) {
      var row = Object.assign({ relevamiento_id: relevamientoId }, fields);
      return db().from('modulo_sistemas')
        .upsert(row, { onConflict: 'relevamiento_id' })
        .select()
        .single();
    },

    // ── Pacientes ─────────────────────────────────────────────────────────
    /**
     * Upsert a patient record
     * @param {number} relevamientoId
     * @param {number} nro - patient number within the relevamiento
     * @param {object} fields
     * @returns {Promise<{data, error}>}
     */
    upsertPaciente: function (relevamientoId, nro, fields) {
      var row = Object.assign({ relevamiento_id: relevamientoId, nro: nro }, fields);
      // Upsert by relevamiento_id + nro combination
      return db().from('pacientes')
        .upsert(row, { onConflict: 'relevamiento_id,nro', ignoreDuplicates: false })
        .select()
        .single();
    },

    /**
     * Delete a patient
     * @param {number} relevamientoId
     * @param {number} nro
     * @returns {Promise<{error}>}
     */
    deletePaciente: function (relevamientoId, nro) {
      return db().from('pacientes')
        .delete()
        .eq('relevamiento_id', relevamientoId)
        .eq('nro', nro);
    },

    /**
     * Get all patients for a relevamiento
     * @param {number} relevamientoId
     * @returns {Promise<{data, error}>}
     */
    getPacientes: function (relevamientoId) {
      return db().from('pacientes')
        .select('*')
        .eq('relevamiento_id', relevamientoId)
        .order('nro', { ascending: true });
    },

    /**
     * Delete a relevamiento (cascade deletes modules and patients)
     * @param {number} id
     * @returns {Promise<{error}>}
     */
    deleteRelevamiento: function (id) {
      return db().from('relevamientos')
        .delete()
        .eq('id', id);
    },

    /**
     * Accept terms and conditions for the current agent
     * @param {number} agenteId
     * @returns {Promise<{data, error}>}
     */
    acceptTyc: function (agenteId) {
      return db().from('agentes')
        .update({ accepted_tyc: true })
        .eq('id', agenteId);
    },

    /**
     * Fetch all relevamientos with nested modules for cube report
     * @param {object} filtros - { agenteId }
     * @returns {Promise<{data, error}>}
     */
    getCuboReporte: function (filtros) {
      var query = db().from('relevamientos')
        .select([
          'id, identi, agente_id',
          'agentes!relevamientos_agente_id_fkey(id, nombre, apellido, provincia, localidad, establecimiento, zona)',
          'modulo_visita!modulo_visita_relevamiento_id_fkey(id, fecha_visita, tipo_visita, tipo_zona, direccion, manzana, situacion_vivienda, acceso_vivienda, telefono1, telefono2, telefono3)',
          'modulo_vivienda!modulo_vivienda_relevamiento_id_fkey(id, identificacion, tipo_vivienda, cant_dormitorios, cant_habitantes, luz_electrica, sistema_cocina, red_cloacal, agua_red_publica, recoleccion_residuos, cant_no_leer_escribir, primario_incompleto, secundario_incompleto, fuente_ingreso, hay_desocupados, presencia_animales, reservorios_agua, acciones_larvas, vigilancia_entomologica, consejeria_dengue, cant_perros, perros_vacunados, cant_gatos, gatos_vacunados, animales_sin_control)',
          'modulo_sistemas!modulo_sistemas_relevamiento_id_fkey(id, recurren_caps, referencia_salud, acceso_medicamentos, obtencion_turno, demora_turnos)',
          'pacientes!pacientes_relevamiento_id_fkey(id, nro, apellido, nombre, fecha_nacimiento, sexo, dni, situacion_vivienda, tel, mail, pais_nacimiento, pueblo_originario)'
        ].join(', '));

      if (filtros.agenteId) query = query.eq('agente_id', filtros.agenteId);

      return query;
    },

    /**
     * Get distinct filter options from agentes (for admin dropdowns)
     * @returns {Promise<{data, error}>}
     */
    getFilterOptions: function () {
      return db().from('agentes')
        .select('provincia, localidad, establecimiento, zona');
    },

    /**
     * Get all agentes (for admin/supervisor user management)
     * @returns {Promise<{data, error}>}
     */
    getAgentes: function () {
      return db().from('agentes')
        .select('*')
        .order('id', { ascending: true });
    },

    updateAgente: function (id, fields) {
      return db().from('agentes')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
    },

    updateAgentePassword: function (id, newPassword) {
      return Promise.resolve({
        error: { message: 'Requiere service_role key — pendiente implementación backend' }
      });
    }
  };

})();
