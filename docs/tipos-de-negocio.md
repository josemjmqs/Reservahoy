# Tipos de negocio: citas y pedidos

Documento de diseño, todavía sin implementar. Describe cómo hacer que Reservahoy funcione distinto según el rubro (barbería, mecánico, comida) sin romper lo que ya existe.

## Resumen

- Cada negocio tiene una **forma de reservar** (`Business.mode`), fija desde el registro: `APPOINTMENTS` (citas, lo de hoy) u `ORDERS` (pedidos para retirar, la comida).
- Dentro de cada forma, el **rubro** (`Business.kind`) solo elige textos y valores por defecto de ajustes que el dueño puede cambiar después.
- Los pedidos usan **tablas propias** (`Product`, `Order`, `OrderItem`); no se fuerzan dentro de `Booking`.

## 1. Rubro: textos y ajustes por defecto

Los negocios de citas se parecen entre sí: barbería, peluquería, mecánico, estética. Lo que cambia es el vocabulario y qué ajustes conviene tener encendidos.

### Regla

El código nunca pregunta `kind === 'MECHANIC'` en distintas pantallas. Pregunta por el ajuste concreto (por ejemplo, más adelante, los campos que se piden al reservar). Es la misma idea que `isOwner` en vez de comparar con `'STAFF'`:

- Agregar un rubro nuevo es agregar una fila de valores por defecto y de textos, no buscar condiciones repartidas por el código.

El aviso de servicio listo (al marcar una reserva Completada) partió como un ajuste pensado para el mecánico (`Business.notifyCompleted`), pero hoy está siempre activado para todos los negocios y ya no es un ajuste.

### Textos

Un archivo de vocabulario por rubro en el frontend (por ejemplo `lib/vocabulary.ts`), que las pantallas leen a partir de `useMe()`:

| Concepto | Barbería | Mecánico | Otro |
|---|---|---|---|
| Profesional | Barbero | Mecánico | Profesional |
| Servicio | Servicio | Trabajo | Servicio |
| Completada | Completada | Listo para retirar | Completada |

### Ajustes por defecto

Al elegir el rubro (en el registro o en Ajustes) se ponen sus ajustes por defecto. El dueño los puede cambiar después uno por uno.

- Mecánico: pedir patente y modelo del vehículo al reservar (primer caso de los "campos personalizados" que están en pendientes, con campos que vienen armados según el rubro).
- Barbería y otros: lo de hoy.

### Datos

- `Business.kind`: enum `BusinessKind` (`BARBER`, `MECHANIC`, `FOOD`, `OTHER`…), por defecto `OTHER` en la migración para los negocios existentes.
- Se elige en el registro y se cambia en Ajustes (solo el dueño, `PATCH /business`).
- Viaja en `/auth/me` (`membership.business.kind`) para que el panel elija los textos, y en `GET /public/:slug` si la página pública los usa.

## 2. Forma de reservar: citas y pedidos

### La diferencia

| | Citas (barbería, mecánico) | Pedidos (comida) |
|---|---|---|
| Hora que elige el cliente | Inicio del servicio | Hora de retiro |
| Cuándo se trabaja | Desde esa hora, durante lo que dura | **Antes**: preparación = retiro − tiempo de preparación |
| Qué se ocupa | Un profesional, en exclusiva | La **capacidad** de la cocina, compartida |
| Dos a la misma hora | No (409 por `booking_no_overlap`) | Sí, hasta un máximo |
| Qué se pide | Servicios | Productos **con cantidad** |

Por eso aquí el rubro no puede ser solo un valor por defecto: decide qué modelo de datos y qué cálculo de disponibilidad se usa. `Business.mode` (`APPOINTMENTS` | `ORDERS`) se fija al registrarse y no se cambia desde el panel; el rubro `FOOD` implica `ORDERS`.

### Por qué no reutilizar `Booking`

Meter los pedidos en `Booking` obligaría a inventar un "profesional cocina" para cumplir con `memberId` y a desactivar `booking_no_overlap` solo para algunos negocios. La garantía contra dobles reservas, que hoy es simple y total, quedaría con excepciones.

## 3. Modelo de datos de pedidos

Tablas nuevas:

- **`Product`**: `businessId`, `name`, `description`, `price`, `prepMin` (tiempo de preparación), `category`, `imageKey`, `active`. No se asigna a profesionales.
- **`Order`**: `businessId`, `customerId` (el mismo `Customer` de hoy), `pickupAt` (hora de retiro, UTC), `prepStartsAt` (calculado y guardado: ordena la cocina y permite cambiar después la forma de medir la capacidad sin migrar datos), `status`, `notes`, `manageToken` (enlace para que el cliente vea o cancele, como en `/reserva/[token]`), `createdAt`.
- **`OrderItem`**: `orderId`, `productId`, `quantity`, `unitPrice` (el precio al momento del pedido: el del menú puede cambiar), `position`.

Estados de `Order`: `PENDING` → `PREPARING` → `READY` (con aviso al cliente, como el de servicio listo al completar una reserva) → `PICKED_UP`; además `CANCELLED`. Pensar desde el principio en un estado de pago aparte (ver riesgos).

Se comparte con las citas: negocio, cuentas, roles, invitaciones, página pública (`/[slug]`), clientes, correos (`NotificationsService.send`), logo y color de marca, y bloqueos (`TimeBlock`, aquí para cerrar un día o una tarde).

## 4. Disponibilidad: cuándo cabe otro pedido

### Capacidad

De lo más simple a lo más preciso:

1. **Máximo de pedidos por franja de retiro** (por ejemplo, 6 cada 15 minutos). Es fácil de configurar y de explicar ("13:00 está lleno"). **Se parte por esta.**
2. **Carga de la cocina**: cada pedido ocupa su tramo de preparación (`prepStartsAt` a `pickupAt`), y en ningún momento puede haber más de N pedidos preparándose a la vez. Es más real (un pedido grande pesa más), pero más difícil de entender para el dueño.

Como `prepStartsAt` se guarda desde el principio, pasar de la 1 a la 2 no requiere migrar datos.

Ajustes del negocio (nuevos, solo el dueño): tamaño de la franja (15 min) y máximo de pedidos por franja.

### Tiempo de preparación

- El de un pedido es el del producto más lento (`max(prepMin)`), no la suma: la cocina trabaja en paralelo. Alternativa más simple: un tiempo fijo del negocio.
- `prepStartsAt = pickupAt − tiempo de preparación`.
- **Anticipación mínima**: no se puede pedir para retirar antes de ahora + tiempo de preparación.

### Horario

Para pedidos manda el horario del local, no el de cada persona. Opciones: usar el horario del dueño que creó el negocio (sin cambiar el modelo) o agregar un horario del negocio. La hora de retiro debe caer dentro del horario; la preparación puede empezar antes de abrir solo si el negocio lo permite (por defecto, no).

### Garantía contra excederse

Hoy la garantía final es una restricción de PostgreSQL (`booking_no_overlap`). Con capacidad (contar pedidos) no hay restricción equivalente: dos pedidos simultáneos podrían pasar el conteo y dejar 7 donde caben 6.

Solución: al crear un pedido, dentro de la transacción tomar un candado por negocio (`pg_advisory_xact_lock` con una clave derivada del `businessId`), contar los pedidos activos de la franja e insertar. Si no cabe, 409, igual que hoy. Para negocios chicos el candado por negocio no es un cuello de botella. Probarlo con un test de integración que cree pedidos en paralelo.

## 5. Panel y página pública

Panel de un negocio `ORDERS`:

- **Pedidos** en vez de Agenda: lista por hora de retiro con "empezar a las 12:40", cantidades y botones para pasar de estado. Pensada para mirarse en la cocina, en el celular.
- **Menú** en vez de Servicios: productos con precio, foto, categoría y tiempo de preparación.
- **Equipo** igual (cuentas y roles). **Horario** por persona deja de tener sentido: se reemplaza por el horario del local.
- **Ajustes**: capacidad por franja y lo que ya existe.

Página pública: menú por categoría con cantidades, elegir hora de retiro entre las franjas con espacio y datos del cliente (los mismos de hoy). La confirmación muestra la hora de retiro como el comprobante actual.

Las reglas de siempre siguen valiendo: `businessId` desde la membresía, rutas nuevas en `PANEL_ROUTES`/`PUBLIC_ROUTES` y en `RESERVED_SLUGS`, fechas en UTC con luxon.

## 6. Riesgos y pendientes

- **No llega a retirar**: en comida cuesta más que en una cita, porque el pedido ya se preparó. Suele resolverse con pago por adelantado (pagos está en pendientes). `Order` debería poder tener un estado de pago sin rediseñarse.
- **Pedidos para "lo antes posible"**: se pueden modelar como el retiro más cercano con espacio, sin un tipo aparte.
- **Avisos al negocio**: un pedido nuevo debería avisar a la cocina (correo hoy; más adelante, notificación del panel instalable).

## 7. Orden sugerido

1. **Rubro y textos** (`Business.kind`, vocabulario, ajustes por defecto). PR chico, solo para citas.
2. **Campos según el rubro en la reserva** (patente y modelo para el mecánico).
3. **Pedidos**: `Business.mode`, tablas, disponibilidad con capacidad por franja, panel de Pedidos y Menú, página pública de pedidos. Varios PR, empezando por el backend con sus tests de integración (incluido el de concurrencia).
