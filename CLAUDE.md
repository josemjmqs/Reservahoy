# Reservahoy

Plataforma de reservas online para pequeños negocios. Cada negocio tiene una página pública (`/[slug]`) donde sus clientes reservan sin cuenta, y un panel para administrar servicios, equipo, horarios y agenda.

## Stack
- Backend: NestJS 12 (CommonJS), TypeScript, Prisma 6.19 (NO usar Prisma 7), PostgreSQL 16
- Frontend: Next.js (App Router, `src/`), TypeScript, Tailwind v4 (`@tailwindcss/postcss`)
- Node 22. Tests: Jest en modo ESM (unitarios `*.spec.ts`, integración `*.int-spec.ts` contra PostgreSQL)
- Infra: Vercel (frontend), Render (API), Neon (DB), Cloudflare (DNS, R2 para respaldos y para fotos de servicios), Resend (correo)

## Estructura
- `backend/`: API (auth, business, services, members, working-hours, time-blocks, availability, bookings, agenda, notifications, settings, storage, health)
- `frontend/`: Next.js. El navegador llama a `/api/*` (rewrite hacia el backend con `API_URL`), así la cookie de sesión es first-party
- `docker-compose.yml`: PostgreSQL local en el puerto 5433

## Comandos
- Todo `npm`/`npx` se ejecuta DENTRO de `backend/` o `frontend/`; en la raíz solo `docker compose` y `git`
- Backend: `npm run start:dev`, `npx nest build`, `npm test`, `npm run test:integration`
- Frontend: `npm run dev` (puerto 3001), `npx tsc --noEmit`, `npm run lint`, `npm run build`
- Base local: `docker compose up -d`; consola: `docker compose exec db psql -U reservaya -d reservaya`
- Datos de prueba: `npx prisma db seed` (en `backend/`, `prisma/seed.mts`): negocio demo `demo-peluqueria`, login de la dueña `demo@reservahoy.local` / `demo1234` y del profesional (STAFF) `diego@reservahoy.local` / `demo1234`; `SEED_TODAY=1` agrega reservas hoy. Solo corre contra bases locales

## Reglas del proyecto
- El `businessId` SIEMPRE se obtiene de la membresía del usuario autenticado, nunca del cliente, con `getMembership` (`auth/membership.ts`), que solo acepta membresías activas. Recursos de otro negocio responden 404
- Roles: `OWNER` puede todo; `STAFF` ve y cambia solo lo suyo: su agenda (incluido cancelar), su horario sin poder cambiarlo, sus bloqueos y los de todo el negocio (no los de otros profesionales; crea y borra solo los suyos), sus ajustes, y en solo lectura servicios, equipo y datos del negocio. Una acción que no es de su rol responde 403; un recurso de otro profesional, 404. Usar `isOwner`, `assertOwner` y `scopeMemberId` (`auth/membership.ts`), nunca comparar `role === 'STAFF'` (un rol nuevo debe partir limitado). Las reglas como casos: `staff-permissions.int-spec.ts`
- La restricción `booking_no_overlap` (exclusion constraint de PostgreSQL) es la garantía final contra dobles reservas; solape y deadlock se traducen a 409
- Todas las fechas se guardan en UTC y se convierten con luxon según la zona del negocio (`America/Santiago`)
- Código y nombres en inglés; textos visibles al usuario en español
- Sesión: JWT en cookie `httpOnly` (también se acepta header Bearer para pruebas) que dura 30 días y se renueva con el uso, como mucho una vez al día (`renewSession` en `auth/session.ts`, desde `JwtAuthGuard`). El token lleva `sv` (`User.sessionVersion`): restablecer la contraseña la incrementa y cierra las demás sesiones (`AuthService.validateSession`). En el panel, un 401 lleva a `/login?expired=1` (`lib/api.ts`)
- Correos: nunca deben romper el flujo principal (el envío captura sus errores) y se mandan sin `await` (`void`). Todos pasan por `NotificationsService.send`, que reintenta 3 veces ante fallas pasajeras (`isTransient`) con la misma clave de idempotencia de Resend
- Al crear una reserva se avisa por correo a los dueños y al profesional de la reserva, activos, con cuenta y `notifyNewBookings` (`BookingsService.notifyStaff`, preferencia en `/settings`): un profesional no recibe datos de clientes de otros
- Si el negocio cancela (el dueño, o el profesional en una reserva suya: `PATCH /agenda/:id/status` a `CANCELLED`, motivo opcional `reason`), se avisa al cliente por correo una sola vez: solo quien pasa la reserva de activa a cancelada envía (`updateMany` condicional en `AgendaService.updateStatus`)
- Datos del negocio (nombre, teléfono): `GET/PATCH /business`, solo el `OWNER` los cambia. Las preferencias de cada miembro van en `/settings`
- Los correos se normalizan a minúsculas (trim + lowercase)
- Un negocio recibe reservas solo si su dueño tiene `emailVerifiedAt` (`AvailabilityService.acceptsBookings`)
- Los tokens de un solo uso (reset de contraseña, verificación de correo) se guardan solo como hash SHA-256
- Al crear una ruta nueva en el frontend, agregarla a `RESERVED_SLUGS` (`register.dto.ts`)
- Una reserva tiene uno o más servicios en `BookingItem` (orden en `position`) y los hace un solo profesional seguidos: el bloque dura la suma (`blockFor`). Usar `AvailabilityService.resolveServices` y `membersForServices`; máximo en `MAX_SERVICES_PER_BOOKING`
- Fotos: se guarda solo `imageKey` (ruta en el bucket) y la API responde `imageUrl` armada con `R2_PUBLIC_URL` (`StorageService.urlFor`). El tipo se valida por los bytes (`detectImageType`), nunca por el nombre o el Content-Type. Sin variables `R2_*` la subida responde 503

## Tests
- Jest corre en ESM porque NestJS 12 es solo ESM: configuración en `jest.config.ts`, `test/jest-int.json` y `tsconfig.spec.json`; los scripts usan `node --experimental-vm-modules`
- Los servicios se prueban instanciándolos con un `PrismaClient` real (ej. `time-blocks.service.int-spec.ts`)
- Todavía no se puede cargar `AppModule` ni `AuthController` en Jest: `@nestjs/throttler` es CommonJS y hace `require` de `@nestjs/common` (ESM); Jest lo soporta recién en Node 24.9+
- Pruebas e2e con Playwright en `frontend/e2e/` (`npm run e2e` en `frontend/`, con backend y frontend levantados y el seed corrido): `api-isolation.spec.ts` prueba todas las rutas del panel (401 sin sesión, 404 con otro negocio, y lo que responde el profesional demo: 404 en lo de otro profesional, 403 en lo que es solo del dueño); el resto, los flujos en el navegador (reserva, cancelación con enlace, registro, configuración del negocio, horario cargando). El dueño demo inicia sesión una sola vez (`auth.setup.ts`) y las pruebas reutilizan la sesión con `loginAsDemo`: el login tiene un límite de 5 por minuto. Backend con `THROTTLE_LIMIT=1000` (límite global configurable; en producción queda en 60). Las pruebas que cambian el negocio demo lo dejan como estaba (horario, datos del negocio, ajustes, bloqueos), salvo las reservas, clientes y servicios de prueba, que no se pueden borrar desde la API y se acumulan hasta el próximo `npx prisma db seed`; en CI no afecta, porque cada corrida parte de una base nueva. Al crear una ruta nueva en el backend, agregarla a `PANEL_ROUTES` (con sus casos `other`, otro negocio, y `staff`, el profesional demo) o a `PUBLIC_ROUTES`: la prueba falla si hay rutas sin clasificar
- Cada carpeta de `frontend/src/app` debe estar en `RESERVED_SLUGS`: lo revisa `auth-dto.spec.ts`

## Prisma y migraciones
- No editar migraciones ya aplicadas; crear nuevas con `npx prisma migrate dev --name ...`
- Detener el servidor antes de `prisma generate`/`migrate` (EPERM en Windows)
- Producción aplica migraciones con `prisma migrate deploy` al arrancar (Render)
- `/health/live` no debe tocar la base: UptimeRobot lo visita cada 5 min para que Render gratis no duerma el backend

## Seguridad
- NUNCA leer, mostrar ni commitear archivos `.env`, claves de Neon/R2/Resend, ni `age-key.txt`
- Los respaldos y dumps viven fuera del repo
- No ejecutar comandos destructivos ni contra producción sin confirmación explícita

## Flujo de trabajo
- Una rama por función (`feat/...`, `fix/...`, `docs/...`), PR, CI en verde (`backend`, `frontend`, `integration`, `e2e`) y merge
- Por ahora los PR se mergean apenas el CI está en verde, con el merge automático de GitHub (mergear a `main` despliega a producción). Cuando el proyecto tenga usuarios reales, el dueño pasará a mergear él mismo tras revisar
- Push y PR desde la carpeta local con la sesión de GitHub CLI del dueño (`gh auth login` + `gh auth setup-git`): `git push -u origin <rama>`, `gh pr create` y, enseguida, `gh pr merge <n> --auto --merge`. GitHub mergea solo cuando pasan los checks obligatorios y borra la rama remota (el repo tiene "Allow auto-merge" y "Automatically delete head branches"). Si se suben más commits al PR, el merge automático sigue activo. Si `gh` no está en el PATH, usar `C:\Program Files\GitHub CLI\gh.exe`. Nunca pedir ni manejar tokens: si la sesión vence, el dueño corre `gh auth login`
- `main` está protegida por un ruleset: solo se cambia por PR, exige `backend`, `frontend`, `integration` y `e2e` en verde y la rama al día con `main` (si quedó atrás: `gh pr update-branch <n>`). Si un check falla, el merge automático espera: arreglar en la misma rama y subir otro commit. Un job de CI nuevo que deba bloquear el merge se agrega también al ruleset
- Para volver a `main` tras un merge usar `git switch -C main origin/main`, nunca `git checkout main` con un `main` local desactualizado
- Tras mergear, borrar la rama y crear una nueva para el siguiente cambio
- Antes de commitear: `npx nest build` (backend) y `npx tsc --noEmit` + `npm run lint` + `npm run build` (frontend)
- En efectos de React no llamar `setState` de forma síncrona: el efecto llama a una función que solo hace el fetch y guarda el resultado en el `.then` (regla de `eslint-config-next`)
- Cambios de interfaz: antes de mergear, levantar backend y frontend con el seed e iniciar sesión con Playwright para revisarlos en pantalla (escritorio y celular)
- Commits pequeños con prefijos `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- Tras cada cambio, anotar en `CODE_REVIEW.md` los archivos modificados en orden de lectura, agrupados por commit (hash + mensaje). Es una lista local (en `.gitignore`): el dueño lo lee de arriba hacia abajo y borra lo que ya revisó, así que las entradas nuevas van SIEMPRE al final y nunca se restauran las borradas

## Pendientes conocidos
- Recordatorios por correo 24 h antes
- Correo de contacto con dominio propio (Cloudflare Email Routing)
- Trabajadores con cuenta propia: los permisos por rol están listos; faltan:
  - Invitar por correo: una persona pertenece a un solo negocio; un dueño sin verificar no habilita reservas aunque el profesional invitado sí lo esté
  - Quitar acceso: `/auth/me` debe armarse con `getMembership` (hoy lista también membresías desactivadas, sin orden) y definir qué ve alguien sin membresía activa (hoy carga el panel y recibe 403 en todo)
  - Panel según el rol: pestañas y botones solo de lo que puede hacer; agenda sin filtro de otros profesionales; título de Horario con su nombre (hoy muestra al dueño); Bloqueos parte en el propio profesional (hoy en "Todo el negocio", que le da 403); Ajustes sin datos del negocio y con el texto del aviso para sus reservas
  - Panel cómodo en celular (hoy las pestañas no caben a 375 px) e instalable (PWA)
- Rol de recepción: alguien que ve toda la agenda sin atender clientes. Hoy no se puede crear un miembro no reservable (`bookable`), y como `STAFF` vería una agenda vacía
- Avisos de cancelación: cuando el cliente cancela con su enlace no se avisa a nadie del negocio, y cuando un profesional cancela la dueña no se entera. Si se agregan, configurables como el de reservas nuevas
- Deuda técnica: `GET /working-hours` lee `memberId` sin DTO (repetido en la URL da 500 al dueño); `GET /agenda` no valida `from` ≤ `to` ni limita el largo del rango; `npm run lint` del backend marca `main.ts` (promesa sin manejar) y avisos `no-misused-spread` en DTO
- WhatsApp, campos personalizados, pagos