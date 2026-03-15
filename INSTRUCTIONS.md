## Contexto crítico
Esta es una **aplicación móvil** (390px max-width, diseñada para agentes sanitarios de campo en Android). 
El diseño visual es INTOCABLE — fue desarrollado específicamente para este producto y será 
legado al equipo de devs del Ministerio. No refactorizar, no "mejorar" estilos, no agregar 
frameworks CSS externos. Solo conectar navegación y backend.

BRIEF PARA CLAUDE CODE — VisitAPS
Tengo 8 archivos HTML estáticos en esta carpeta que forman el prototipo de una app móvil para agentes sanitarios del Ministerio de Salud Argentina. El objetivo es convertirlos en una SPA navegable con backend real en Supabase.
Supabase:

URL: https://asmfwqsygqebhywujuvo.supabase.co
Anon key: sb_publishable_kYWhsnzlR3I8MO1ufQnDNA_skePVmct
Password va en .env como SUPABASE_PASSWORD — pedímela antes de usarla

Archivos existentes:

visitaps-login-v2.html
visitaps-menu.html
visitaps-perfil.html
visitaps-actualizar-zona.html
visitaps-rondas.html
visitaps-relevamientos.html
visitaps-detalle-relevamiento.html (el más complejo — formulario con 4 módulos y sub-acordeones de pacientes)


TAREAS EN ORDEN:
1. Convertir a SPA con router
Un index.html principal que monta cada pantalla dinámicamente. Hash-based routing (#login, #menu, #rondas, etc). Mantener el CSS y JS de cada pantalla intacto — no refactorizar el diseño, solo envolver.
2. Supabase Auth

Login real con usuario/contraseña contra Supabase Auth
Guardar sesión en localStorage
Logout limpia sesión

3. Schema de base de datos
Crear estas tablas en Supabase vía migrations:
sqlagentes (id, nombre, apellido, email, provincia, localidad, region, establecimiento, zona, nivel_acceso)
rondas (id, caps, descripcion, nombre, id_ronda, fecha_desde, fecha_hasta, provincia, region, localidad)
relevamientos (id, ronda_id, agente_id, identi, estado, created_at, updated_at)
modulo_visita (id, relevamiento_id, fecha_visita, tipo_visita, tipo_zona, direccion, manzana, situacion_vivienda, acceso_vivienda, telefono1, telefono2, telefono3)
modulo_vivienda (id, relevamiento_id, [todos los campos del módulo])
modulo_sistemas (id, relevamiento_id, [todos los campos del módulo])
pacientes (id, relevamiento_id, nro, apellido, nombre, fecha_nacimiento, sexo, dni, situacion_vivienda, tel, mail, pais_nacimiento, pueblo_originario)
Estado del relevamiento: borrador | no_enviado | enviado
4. Navegación — reglas específicas

Ícono Perfil (arriba derecha): guarda la pantalla actual en sessionStorage antes de navegar. Al volver desde perfil, retorna a esa pantalla. Transición con fade de opacidad suave (300ms).
Ícono Logout: abre popup "¿Deseas cerrar sesión?" con botón Cancelar (gris) y Confirmar en #C9A84C (gold). Al confirmar, limpia sesión Supabase y redirige a login.
Abrir un relevamiento desde la lista: carga el detalle-relevamiento con los datos ya guardados de ese relevamiento — muestra el estado actual de todos los campos.
Botón + en Relevamientos: crea un relevamiento nuevo en la base de datos (estado borrador, agente_id del usuario logueado, ronda_id actual), luego navega al detalle en blanco para completar.

5. Conectar formularios

Cada campo del formulario en detalle-relevamiento se guarda en Supabase en tiempo real (debounce 1.5s) o al clickear "Completar y Guardar"
La lista de relevamientos carga desde Supabase filtrada por ronda y agente
Los íconos de estado (borrador/no enviado/enviado) se renderizan desde el campo estado de la DB

6. Código limpio para handoff

Comentar cada módulo/función con propósito, inputs y outputs
Un README.md que explique la arquitectura, cómo correr el proyecto y cómo conectar a producción
Variables de entorno documentadas en .env.example

Deploy final en Vercel.