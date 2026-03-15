# VisitAPS

Aplicación móvil para agentes sanitarios del Ministerio de Salud Argentina. Permite realizar relevamientos domiciliarios durante rondas sanitarias.

## Arquitectura

```
index.html              ← SPA shell (carga fuentes, contenedor #app, scripts)
js/
  router.js             ← Router hash-based, fetch/parse/inject de páginas
  supabase-client.js    ← Cliente Supabase + helpers de auth
  data-service.js       ← CRUD: agentes, rondas, relevamientos, módulos, pacientes
  form-sync.js          ← Binding bidireccional formulario ↔ Supabase (debounce 1.5s)
pantallas/              ← 7 pantallas HTML estáticas (diseño INTOCABLE)
supabase/
  migrations/
    001_create_tables.sql ← Schema completo: tablas, índices, RLS, triggers
```

### Flujo de navegación

```
#login → #menu → #rondas → #relevamientos?ronda=ID → #detalle?relevamiento=ID
                     ↕              ↕                        ↕
                  #perfil        #perfil                  #perfil
                  (vuelve)       (vuelve)                 (vuelve)
```

### Cómo funciona el router

1. El router escucha `hashchange` y mapea el hash a un archivo en `pantallas/`
2. Hace fetch del HTML, lo parsea con `DOMParser`
3. Extrae los `<style>` del `<head>`, el contenido del `<body>`, y los `<script>`
4. Inyecta los estilos en `<style id="page-styles">` (swap completo, sin conflictos CSS)
5. Inyecta el HTML en `#app` y re-ejecuta los scripts
6. Detecta íconos de navegación por contenido SVG (sin modificar los HTML originales)

## Cómo correr el proyecto

```bash
# Instalar dependencia de servidor local
npm install -g serve

# Correr
serve . -p 3000

# Abrir en navegador
open http://localhost:3000
```

## Base de datos (Supabase)

### Setup inicial

1. Ir al [SQL Editor de Supabase](https://asmfwqsygqebhywujuvo.supabase.co)
2. Ejecutar `supabase/migrations/001_create_tables.sql`
3. Crear un usuario en Auth → Users con email y contraseña
4. Crear un registro en la tabla `agentes` con el `auth_uid` del usuario creado

### Tablas

| Tabla | Descripción |
|-------|-------------|
| `agentes` | Datos del agente sanitario (vinculado a auth.users) |
| `rondas` | Rondas sanitarias con fechas y ubicación |
| `relevamientos` | Registro por vivienda (estado: borrador/no_enviado/enviado) |
| `modulo_visita` | Datos de la visita (fecha, tipo, dirección, teléfonos) |
| `modulo_vivienda` | Datos de la vivienda (tipo, servicios, riesgos sanitarios) |
| `modulo_sistemas` | Acceso a sistemas de salud |
| `pacientes` | Personas en la vivienda (datos filiatorios, 1:N con relevamiento) |

### Row Level Security (RLS)

Cada agente solo puede ver y modificar sus propios relevamientos. Las rondas son visibles para todos los usuarios autenticados.

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_PASSWORD=...    # Solo para migraciones
```

## Deploy (Vercel)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# O para producción
vercel --prod
```

El proyecto es estático puro (HTML/CSS/JS) — no requiere build step.

## Notas para el equipo de desarrollo

- **El diseño visual es intocable** — no modificar CSS, layouts, ni SVGs inline
- Los archivos en `pantallas/` son los originales del prototipo y se cargan tal cual
- La autenticación usa Supabase Auth con email/contraseña
- Los formularios guardan en tiempo real con debounce de 1.5 segundos
- El botón "Completar y Guardar" fuerza un save inmediato y cambia el estado a `no_enviado`
