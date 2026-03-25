# VisitAPS

Aplicacion web progresiva (PWA) para agentes sanitarios de campo del Ministerio de Salud de la Nacion Argentina. Permite realizar relevamientos domiciliarios durante rondas sanitarias, gestionar usuarios y establecimientos, y generar reportes exportables a CSV.

## Que hace la aplicacion

Los agentes sanitarios visitan viviendas en sus zonas asignadas y registran datos sobre:
- La vivienda (tipo, servicios basicos, riesgos sanitarios)
- Los habitantes (datos filiatorios, DNI, cobertura de salud)
- Acceso a sistemas de salud (CAPS, medicamentos, turnos)

VisitAPS digitaliza el registro de visitas domiciliarias, reemplazando formularios en papel o herramientas no específicas para trabajo de campo con una lógica offline first.

## Stack tecnico

| Componente | Tecnologia |
|---|---|
| Frontend | Vanilla JS (ES5/ES6), HTML, CSS custom — sin frameworks |
| Routing | SPA hash-based (`#login`, `#menu`, `#detalle`, etc.) |
| Backend / DB | [Supabase](https://supabase.com) (Auth + PostgreSQL + RLS) |
| Deploy | [Vercel](https://vercel.com) — sitio estatico, sin build step |
| PWA | manifest.json + service worker (sw.js) |

## Estructura de carpetas

```
/
├── index.html              ← Shell de la SPA (CSS variables, scripts globales, #app)
├── manifest.json           ← Configuracion PWA
├── sw.js                   ← Service worker
├── serve.json              ← Rewrites para Vercel / serve
├── .env.example            ← Variables de entorno necesarias
├── Migracion-IonicAngular.md  ← Guia de migracion a Ionic/Angular
│
├── js/
│   ├── supabase-client.js  ← Cliente Supabase + helpers de auth (window.VisitAuth)
│   ├── data-service.js     ← Capa de acceso a datos (window.VisitData)
│   ├── form-sync.js        ← Binding formulario <-> Supabase con debounce (window.FormSync)
│   └── router.js           ← Router hash-based, carga de datos post-mount, popups, navegacion
│
├── pantallas/              ← 13 pantallas HTML estaticas (una por vista)
│   ├── visitaps-login.html
│   ├── visitaps-menu.html
│   ├── visitaps-menu-admin.html
│   ├── visitaps-perfil.html
│   ├── visitaps-actualizar-zona.html
│   ├── visitaps-rondas.html
│   ├── visitaps-relevamientos.html
│   ├── visitaps-detalle-relevamiento.html
│   ├── visitaps-administracion.html
│   ├── visitaps-crear-usuario.html
│   ├── visitaps-editar-usuario.html
│   ├── visitaps-reportes.html
│   └── visitaps-terminos.html
│
├── Logos/
│   ├── favicon.png
│   ├── logo-button.svg
│   ├── icon-192.png
│   └── icon-512.png
│
└── supabase/
    └── migrations/
        └── 001_create_tables.sql
```

## Como correr el proyecto localmente

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd VisitAPS-Handoff
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `js/supabase-client.js` (lineas 12-13) con los valores reales:

```js
var SUPABASE_URL = 'https://tu-proyecto.supabase.co';
var SUPABASE_ANON_KEY = 'tu_anon_key_aqui';
```

### 3. Servir con cualquier servidor estatico

El proyecto no necesita build. Cualquier servidor HTTP funciona:

```bash
# Con npx (Node.js)
npx serve .

# Con Python
python -m http.server 8080

# Con PHP
php -S localhost:8080
```

Abrir en el navegador con vista mobile en DevTools, o desde un dispositivo movil.

### 4. Base de datos

1. Crear un proyecto en [Supabase](https://supabase.com)
2. Ejecutar `supabase/migrations/001_create_tables.sql` en el SQL Editor
3. Crear un usuario en Auth > Users con email y contrasena
4. Crear un registro en la tabla `agentes` con el `auth_uid` del usuario

El esquema completo de tablas esta documentado en `Migracion-IonicAngular.md`.

## Variables de entorno

| Variable | Descripcion | Donde se usa |
|---|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase | `js/supabase-client.js` |
| `SUPABASE_ANON_KEY` | Clave publica (anon) de Supabase | `js/supabase-client.js` |
| `SUPABASE_PASSWORD` | Password de la DB (solo para migraciones) | No se expone en frontend |

## Niveles de acceso

| Nivel | Menu | Capacidades |
|---|---|---|
| `agente` | menu.html | Rondas, relevamientos y reportes propios |
| `supervisor` | menu-admin.html | Ve agentes de su establecimiento, gestiona zonas |
| `admin_provincial` | menu-admin.html | Ve todos los agentes, gestiona establecimientos |

## Flujo de navegacion

```
#login → #menu/#menu-admin → #rondas → #relevamientos?ronda=ID → #detalle?relevamiento=ID
              ↕                  ↕              ↕                        ↕
           #perfil           #perfil         #perfil                  #perfil
           (lateral)         (lateral)       (lateral)                (lateral)

#menu-admin → #administracion → #editar-usuario / #crear-usuario
            → #reportes
```

## Migracion a Ionic/Angular

Adjunto documento de migración ionic/angular para el equipo de desarrollo:
**[Migracion-IonicAngular.md](./Migracion-IonicAngular.md)**
