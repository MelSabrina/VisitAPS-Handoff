-- VisitAPS Database Schema
-- Run this in the Supabase SQL Editor (https://asmfwqsygqebhywujuvo.supabase.co)

-- ── Agentes sanitarios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agentes (
  id            BIGSERIAL PRIMARY KEY,
  auth_uid      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre        TEXT NOT NULL DEFAULT '',
  apellido      TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  provincia     TEXT NOT NULL DEFAULT '',
  localidad     TEXT NOT NULL DEFAULT '',
  region        TEXT NOT NULL DEFAULT '',
  establecimiento TEXT NOT NULL DEFAULT '',
  zona          TEXT NOT NULL DEFAULT '',
  nivel_acceso  TEXT NOT NULL DEFAULT 'Agente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Rondas sanitarias ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rondas (
  id            BIGSERIAL PRIMARY KEY,
  caps          TEXT NOT NULL DEFAULT '',
  descripcion   TEXT NOT NULL DEFAULT '',
  nombre        TEXT NOT NULL DEFAULT '',
  id_ronda      INTEGER,
  fecha_desde   DATE,
  fecha_hasta   DATE,
  provincia     TEXT NOT NULL DEFAULT '',
  region        TEXT NOT NULL DEFAULT '',
  localidad     TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Relevamientos ───────────────────────────────────────────────────────────
CREATE TYPE estado_relevamiento AS ENUM ('borrador', 'no_enviado', 'enviado');

CREATE TABLE IF NOT EXISTS relevamientos (
  id            BIGSERIAL PRIMARY KEY,
  ronda_id      BIGINT REFERENCES rondas(id) ON DELETE CASCADE,
  agente_id     BIGINT REFERENCES agentes(id) ON DELETE CASCADE,
  identi        TEXT NOT NULL DEFAULT '',
  estado        estado_relevamiento NOT NULL DEFAULT 'borrador',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Módulo Visita ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulo_visita (
  id                BIGSERIAL PRIMARY KEY,
  relevamiento_id   BIGINT NOT NULL REFERENCES relevamientos(id) ON DELETE CASCADE,
  fecha_visita      DATE,
  tipo_visita       TEXT,         -- Censo, Ronda, Campaña
  tipo_zona         TEXT,         -- Rural, Urbana, Periurbana
  direccion         TEXT,         -- 10130
  manzana           TEXT,         -- 10140
  situacion_vivienda TEXT,        -- Habitada, Deshabilitada, Temporal, En construcción
  acceso_vivienda   TEXT,         -- Accedió, Ausente, Rechazo
  telefono1         TEXT,         -- 10170
  telefono2         TEXT,         -- 10180
  telefono3         TEXT,         -- 10190
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(relevamiento_id)
);

-- ── Módulo Vivienda ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulo_vivienda (
  id                    BIGSERIAL PRIMARY KEY,
  relevamiento_id       BIGINT NOT NULL REFERENCES relevamientos(id) ON DELETE CASCADE,
  -- Situación de la vivienda
  identificacion        TEXT,         -- 10200
  tipo_vivienda         TEXT,         -- 10210
  cant_dormitorios      INTEGER,      -- 10220
  cant_habitantes       INTEGER,      -- 10240
  -- Servicios de la vivienda
  luz_electrica         TEXT,         -- 10250
  sistema_cocina        TEXT,         -- 10260
  red_cloacal           TEXT,         -- 10270
  agua_red_publica      TEXT,         -- 10280
  recoleccion_residuos  TEXT,         -- 10290
  -- Situación socioeconómica
  cant_no_leer_escribir INTEGER,      -- 10300
  primario_incompleto   TEXT,         -- 10310
  secundario_incompleto TEXT,         -- 10320
  fuente_ingreso        TEXT,         -- 10330
  hay_desocupados       TEXT,         -- 10340
  -- Riesgos sanitarios
  presencia_animales    TEXT[],       -- 10350 (multiselect)
  reservorios_agua      TEXT,         -- 10360
  acciones_larvas       TEXT,         -- 10370
  vigilancia_entomologica TEXT,       -- 10380
  consejeria_dengue     TEXT,         -- 10382
  cant_perros           INTEGER,      -- 10410
  perros_vacunados      INTEGER,      -- 10420
  cant_gatos            INTEGER,      -- 10430
  gatos_vacunados       INTEGER,      -- 10440
  animales_sin_control  TEXT,         -- 10450
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(relevamiento_id)
);

-- ── Módulo Sistemas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modulo_sistemas (
  id                    BIGSERIAL PRIMARY KEY,
  relevamiento_id       BIGINT NOT NULL REFERENCES relevamientos(id) ON DELETE CASCADE,
  recurren_caps         TEXT,         -- 10460
  referencia_salud      TEXT[],       -- 10480 (multiselect)
  acceso_medicamentos   TEXT[],       -- 10490 (multiselect)
  obtencion_turno       TEXT[],       -- 10500 (multiselect)
  demora_turnos         TEXT,         -- 11500
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(relevamiento_id)
);

-- ── Pacientes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pacientes (
  id                    BIGSERIAL PRIMARY KEY,
  relevamiento_id       BIGINT NOT NULL REFERENCES relevamientos(id) ON DELETE CASCADE,
  nro                   INTEGER NOT NULL DEFAULT 1,
  apellido              TEXT,         -- 10510
  nombre                TEXT,         -- 10520
  fecha_nacimiento      DATE,         -- 10530
  sexo                  TEXT,         -- 10550
  dni                   TEXT,         -- 10560
  situacion_vivienda    TEXT,         -- 10570
  tel                   TEXT,         -- 10580
  mail                  TEXT,         -- 10590
  pais_nacimiento       TEXT,         -- 10600
  pueblo_originario     TEXT,         -- 10610
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_relevamientos_ronda ON relevamientos(ronda_id);
CREATE INDEX idx_relevamientos_agente ON relevamientos(agente_id);
CREATE INDEX idx_relevamientos_estado ON relevamientos(estado);
CREATE INDEX idx_pacientes_relevamiento ON pacientes(relevamiento_id);
CREATE INDEX idx_agentes_auth ON agentes(auth_uid);

-- ── RLS (Row Level Security) ────────────────────────────────────────────────
ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rondas ENABLE ROW LEVEL SECURITY;
ALTER TABLE relevamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulo_visita ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulo_vivienda ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulo_sistemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

-- Agentes: users can read their own record
CREATE POLICY agentes_select ON agentes FOR SELECT
  USING (auth_uid = auth.uid());

-- Rondas: all authenticated users can read
CREATE POLICY rondas_select ON rondas FOR SELECT
  TO authenticated USING (true);

-- Relevamientos: agents can CRUD their own
CREATE POLICY relevamientos_select ON relevamientos FOR SELECT
  USING (agente_id IN (SELECT id FROM agentes WHERE auth_uid = auth.uid()));
CREATE POLICY relevamientos_insert ON relevamientos FOR INSERT
  WITH CHECK (agente_id IN (SELECT id FROM agentes WHERE auth_uid = auth.uid()));
CREATE POLICY relevamientos_update ON relevamientos FOR UPDATE
  USING (agente_id IN (SELECT id FROM agentes WHERE auth_uid = auth.uid()));

-- Modules: access through relevamiento ownership
CREATE POLICY modulo_visita_all ON modulo_visita FOR ALL
  USING (relevamiento_id IN (
    SELECT r.id FROM relevamientos r
    JOIN agentes a ON a.id = r.agente_id
    WHERE a.auth_uid = auth.uid()
  ));

CREATE POLICY modulo_vivienda_all ON modulo_vivienda FOR ALL
  USING (relevamiento_id IN (
    SELECT r.id FROM relevamientos r
    JOIN agentes a ON a.id = r.agente_id
    WHERE a.auth_uid = auth.uid()
  ));

CREATE POLICY modulo_sistemas_all ON modulo_sistemas FOR ALL
  USING (relevamiento_id IN (
    SELECT r.id FROM relevamientos r
    JOIN agentes a ON a.id = r.agente_id
    WHERE a.auth_uid = auth.uid()
  ));

CREATE POLICY pacientes_all ON pacientes FOR ALL
  USING (relevamiento_id IN (
    SELECT r.id FROM relevamientos r
    JOIN agentes a ON a.id = r.agente_id
    WHERE a.auth_uid = auth.uid()
  ));

-- ── Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_relevamientos_updated BEFORE UPDATE ON relevamientos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modulo_visita_updated BEFORE UPDATE ON modulo_visita
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modulo_vivienda_updated BEFORE UPDATE ON modulo_vivienda
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_modulo_sistemas_updated BEFORE UPDATE ON modulo_sistemas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pacientes_updated BEFORE UPDATE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
