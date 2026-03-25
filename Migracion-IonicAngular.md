# Guia de Migracion: VisitAPS → Ionic/Angular

> Este documento esta escrito desde un lugar de colaboracion entre devs. Es el trabajo que hice, y estas son mis sugerencias para que la integracion sea lo mas fluida posible. El equipo que reciba el proyecto es quien decide como y cuando aplicar cada punto.

I mean, give Claude this (je).

---

## Indice

1. [Arquitectura actual y equivalencias](#1-arquitectura-actual-y-equivalencias)
2. [Design system: tokens CSS → styles.scss](#2-design-system-tokens-css--stylesscss)
3. [data-service.js → DataService injectable](#3-data-servicejs--dataservice-injectable)
4. [form-sync.js → Reactive Forms](#4-form-syncjs--reactive-forms)
5. [Sistema de modos (data-mode) → @Input() mode](#5-sistema-de-modos-data-mode--input-mode)
6. [Bottom sheets → IonModal / IonActionSheet](#6-bottom-sheets--ionmodal--ionactionsheet)
7. [router.js → RouterModule + servicios](#7-routerjs--routermodule--servicios)
8. [pacienteFieldsTemplate → PacienteComponent](#8-pacientefieldstemplate--pacientecomponent)
9. [TODOs de backend → endpoints Java](#9-todos-de-backend--endpoints-java)
10. [Nota sobre RLS y permisos](#10-nota-sobre-rls-y-permisos)
11. [Orden sugerido de migracion](#11-orden-sugerido-de-migracion)

---

## 1. Arquitectura actual y equivalencias

### Como funciona hoy

```
index.html (shell)
  ├── js/supabase-client.js   →  window.supabaseClient, window.VisitAuth
  ├── js/data-service.js      →  window.VisitData (queries a Supabase)
  ├── js/form-sync.js         →  window.FormSync (binding campos ↔ DB)
  └── js/router.js            →  Hash routing, fetch de pantallas/, postMount()
       └── pantallas/*.html   →  Una por pantalla, con <style> + <body> + <script>
```

El router hace `fetch()` del HTML de cada pantalla, lo parsea con `DOMParser`, inyecta estilos en `<style id="page-styles">`, HTML en `#app`, y re-ejecuta los `<script>`. No hay componentes, no hay estado reactivo, no hay build.

### Equivalencia en Angular/Ionic

| Actual (Vanilla) | Angular/Ionic |
|---|---|
| `index.html` (shell) | `app.component.html` con `<ion-app><ion-router-outlet>` |
| `pantallas/*.html` | Un componente por pantalla en `src/app/pages/` |
| `js/router.js` | `AppRoutingModule` con lazy-loaded routes |
| `js/data-service.js` | `DataService` injectable (`@Injectable({providedIn: 'root'})`) |
| `js/form-sync.js` | Reactive Forms (`FormGroup`, `FormControl`) |
| `js/supabase-client.js` | `SupabaseService` injectable con `environment.ts` |
| `window.__routeParams` | `ActivatedRoute.queryParams` |
| `window.navigateTo()` | `Router.navigate()` |
| `postMount()` | `ngOnInit()` / resolvers |

---

## 2. Design system: tokens CSS → styles.scss

Los tokens de diseno estan definidos como CSS custom properties en `index.html` dentro de `:root`. Se pueden copiar directamente a un `styles.scss` global:

```scss
// styles.scss — copiar de index.html :root
:root {
  --navy:       #1B2A4A;
  --navy-light: #243660;
  --gold:       #C9A84C;
  --gold-light: #D9BC72;
  --cream:      #EDEAE4;
  --cream-dark: #DDD9D2;
  --text-main:  #2C2C2C;
  --text-soft:  #7A7672;
  --gray-btn:   #8A8580;
  --steel:      #5A7290;
  --steel-light:#6B84A3;
  --teal:       #50b7b2;

  // Badges
  --badge-steel-bg:  rgba(90, 114, 144, 0.15);
  --badge-teal-bg:   rgba(80, 183, 178, 0.15);
  --badge-teal-text: #2a9490;
  --badge-gold-bg:   rgba(201, 168, 76, 0.15);
  --badge-gold-text: #a07a1a;
  --badge-navy-bg:   rgba(27, 42, 74, 0.08);
}
```

**Tipografia:**
- Titulos: `Lora, serif` (400/600/700)
- Cuerpo: `Montserrat, sans-serif` (300/400/500/600/700)

**Espaciado clave:**
- Padding horizontal de contenido: `52px` (ambos lados)
- Max-width del contenido: `720px`
- Top bar dorada: `height: 4px; background: var(--gold)`

**Recomendacion:** No usar Ionic themes ni variables de Ionic para los colores. Mantener los custom properties tal cual. El diseno fue hecho a medida y es parte de la identidad del producto.

---

## 3. data-service.js → DataService injectable

`data-service.js` expone `window.VisitData` con metodos que retornan Promises. La migracion es directa:

```typescript
// data.service.ts
@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private supabase: SupabaseService) {}

  getAgente(): Observable<Agente> {
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(result => {
        const uid = result.data?.user?.id;
        return from(this.supabase.client
          .from('agentes')
          .select('*')
          .eq('auth_uid', uid)
          .single()
        );
      }),
      map(result => result.data as Agente)
    );
  }

  // ... mismo patron para getRondas(), getRelevamientos(), etc.
}
```

**Si se migra a backend Java:** los metodos de `DataService` apuntarian a endpoints REST en vez de Supabase directo. Los nombres de metodos y la estructura de datos se mantienen igual — solo cambia el transporte.

Todos los metodos estan documentados con JSDoc en `data-service.js`.

---

## 4. form-sync.js → Reactive Forms

`form-sync.js` mapea IDs de campos del DOM a columnas de la DB. Estos mapeos son la fuente de verdad:

```javascript
// Ejemplo de VISITA_FIELDS (ver form-sync.js linea 20)
var VISITA_FIELDS = {
  'date-text-10090': { col: 'fecha_visita', type: 'date' },
  'dd-10100':        { col: 'tipo_visita',  type: 'dropdown' },
  // ...
};
```

### Equivalencia en Angular

```typescript
this.visitaForm = this.fb.group({
  fecha_visita: [''],
  tipo_visita: [''],
  tipo_zona: [''],
  direccion: [''],
  // ... ver VISITA_FIELDS completo en form-sync.js
});
```

Los mapeos completos para los 4 modulos estan en:
- `VISITA_FIELDS` — 10 campos (modulo_visita)
- `VIVIENDA_FIELDS` — 23 campos (modulo_vivienda)
- `SISTEMAS_FIELDS` — 5 campos (modulo_sistemas)
- `PACIENTE_FIELDS` — 10 campos (pacientes, instancia multiple)

**Debounce:** hoy se hace con `setTimeout` de 1.5s. En Angular, usar `valueChanges.pipe(debounceTime(1500))`.

---

## 5. Sistema de modos (data-mode) → @Input() mode

El detalle de relevamiento tiene 3 modos controlados por `#app[data-mode]`:

| Modo | Que muestra | Cuando |
|---|---|---|
| `nuevo` | Campos editables + "Descartar / Guardar" | Crear relevamiento nuevo |
| `lectura` | Valores readonly + "Eliminar / Editar" | Ver relevamiento existente |
| `edicion` | Campos editables + "Salir sin guardar / Guardar cambios" | Editar relevamiento |

### En Angular

```typescript
@Input() mode: 'nuevo' | 'lectura' | 'edicion' = 'lectura';

// En el template:
<input *ngIf="mode !== 'lectura'" [formControl]="direccion">
<span *ngIf="mode === 'lectura'">{{ direccion.value }}</span>
```

---

## 6. Bottom sheets → IonModal / IonActionSheet

El proyecto usa bottom sheets custom con este patron:

```css
.bs-sheet {
  position: fixed; bottom: 0; left: 50%;
  transform: translateX(-50%) translateY(100%);  /* cerrado */
}
.bs-sheet.open { transform: translateX(-50%) translateY(0); }
```

### Equivalencia en Ionic

| Uso actual | Ionic |
|---|---|
| Seleccion de localidad (lista) | `IonModal` con `breakpoints` |
| Acciones de usuario (editar/contraseña) | `IonActionSheet` |
| Crear/editar establecimiento (formulario) | `IonModal` con `initialBreakpoint` |
| Confirmar eliminacion | `IonAlert` |

---

## 7. router.js → RouterModule + servicios

`router.js` concentra varias responsabilidades que en Angular se separan naturalmente:

| Logica en router.js | Destino sugerido |
|---|---|
| Routing | `AppRoutingModule` |
| `postMount()` por pantalla | `ngOnInit()` de cada componente |
| `getAgente()` (cache) | `AgenteService` con `shareReplay(1)` |
| `initReportes()` + `flattenCubo()` | `ReportesService` |
| `navigateWithTycCheck()` | `TycGuard` (CanActivate) |
| `showToast()` / popups | `UIService` con `ToastController` / `AlertController` |
| Back-guard (bloqueo boton atras) | `CanDeactivate` guard |
| Navigation stack custom | Angular Router nativo |

---

## 8. pacienteFieldsTemplate → PacienteComponent

Hoy existe un template string que se clona para cada paciente. En Angular:

```typescript
@Component({ selector: 'app-paciente' })
export class PacienteComponent {
  @Input() paciente: FormGroup;
  @Input() nro: number;
  @Input() mode: 'nuevo' | 'lectura' | 'edicion';
  @Output() eliminar = new EventEmitter<number>();
}
```

```html
<app-paciente
  *ngFor="let pac of pacienteForms.controls; let i = index"
  [paciente]="pac"
  [nro]="i + 1"
  [mode]="mode"
  (eliminar)="onEliminarPaciente($event)"
/>
```

Los 10 campos de cada paciente estan definidos en `PACIENTE_FIELDS` (form-sync.js, linea 68).

---

## 9. TODOs de backend → endpoints Java

### Tabla `zonas` (no existe aun)

```
Columnas sugeridas: id, descripcion, sisa, latitud, longitud, establecimiento_id
```

| Operacion | Archivo | Endpoint Java |
|---|---|---|
| Listar zonas | `administracion.html` ~L1029 | `GET /api/zonas?establecimiento_id=X` |
| Crear zona | `administracion.html` ~L1198 | `POST /api/zonas` |
| Editar zona | `administracion.html` ~L1181 | `PUT /api/zonas/:id` |
| Eliminar zona | `administracion.html` ~L1159 | `DELETE /api/zonas/:id` |

### Tabla `establecimientos` (no existe aun)

| Operacion | Archivo | Endpoint Java |
|---|---|---|
| Crear establecimiento | `administracion.html` ~L1378 | `POST /api/establecimientos` |
| Editar establecimiento | `administracion.html` ~L1333 | `PUT /api/establecimientos/:id` |
| Eliminar establecimiento | `administracion.html` ~L1346 | `DELETE /api/establecimientos/:id` |

### Cambio de contrasena de otro usuario

| Operacion | Archivo | Endpoint Java |
|---|---|---|
| Cambiar password ajeno | `data-service.js` L276 | `PUT /api/agentes/:id/password` |

Hoy `updateAgentePassword()` retorna un error intencional porque necesita `service_role` key de Supabase, que no se puede exponer en frontend. En un backend Java esto se resuelve con un endpoint autenticado que use la key del servidor.

---

## 10. Nota sobre RLS y permisos

Supabase tiene **Row Level Security (RLS)** configurado en las tablas principales. Las politicas actuales restringen que cada agente solo pueda ver y modificar sus propios relevamientos, y que supervisores solo accedan a los agentes de su establecimiento.

**Al migrar al backend Java, esta logica de permisos debe replicarse server-side.** No alcanza con validar en el frontend — el backend necesita verificar el nivel de acceso del usuario autenticado antes de ejecutar cualquier query.

Los tres niveles son `agente`, `supervisor` y `admin_provincial`. La logica de filtrado por nivel esta implementada en `router.js` (`postMount` → `administracion`) y puede servir como referencia para las reglas del backend.

---

## 11. Orden sugerido de migracion

### Fase 1: Infraestructura

1. Crear proyecto Ionic/Angular con estructura de carpetas
2. Migrar el design system — copiar tokens CSS a `styles.scss`, instalar fuentes
3. Crear `SupabaseService` con `environment.ts`
4. Crear `DataService` — traducir metodos de `data-service.js` a Observables
5. Crear `AgenteService` con cache `shareReplay`

### Fase 2: Pantallas core

6. Login
7. Menu / Menu-admin
8. Rondas → Relevamientos
9. Detalle relevamiento (la mas compleja — sistema de modos, Reactive Forms, PacienteComponent)

### Fase 3: Administracion

10. Administracion — tabs, tabla de usuarios, bottom sheets
11. Crear/Editar usuario
12. Establecimientos y Zonas — requiere endpoints Java pendientes

### Fase 4: Extras

13. Reportes
14. Perfil
15. Terminos y condiciones

### Nota sobre migracion incremental

Cada pantalla en `pantallas/` es independiente. Se puede migrar pantalla por pantalla mientras el router vanilla sigue funcionando para las que aun no se migraron — no hace falta hacer todo de una vez.

---

## Contacto

Si tienen dudas o necesitan contexto adicional sobre alguna parte del codigo, no duden en consultar :)
