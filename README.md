# Recompras VicoVital

Plataforma local para no perder la recompra de suplementos. Calcula, para cada cliente y
cada producto que recibió, la fecha en que se le va a acabar el frasco, programa el aviso
antes de esa fecha y deja el mensaje listo para que una persona lo apruebe.

Corre entera en tu computador. No necesita servicios en la nube para funcionar.

---

## Arranque rápido

```bash
npm install
npm run seed
npm run dev
```

Abre <http://localhost:3000>. Con eso ya tienes la plataforma funcionando con 50 clientes
y 200 compras ficticias, sin necesidad de ninguna credencial.

Para trabajar con tus datos reales de Lucid Bot en vez de los ficticios:

```bash
npx tsx scripts/limpiar-demo.ts
npm run sync
```

La primera sincronización tarda varios minutos: Lucid Bot no permite listar contactos, así
que hay que pedir cada uno por separado. Las siguientes son rápidas porque solo trae los
que faltan.

---

## Requisitos

- **Node.js 20 o superior** (probado con 24.15).
- Nada más. La base es SQLite: un archivo, sin Docker y sin instalar un motor aparte.

---

## Cómo funciona el cálculo

Todo el sistema depende de una cuenta muy simple:

```
duración del frasco  = unidades del envase ÷ dosis diaria
días totales         = duración × cantidad de frascos × factor de ajuste
fecha de agotamiento = fecha de entrega + días totales
fecha de aviso       = fecha de agotamiento − días de anticipación
```

Cuatro reglas que no son obvias y que explican casi todas las diferencias con una hoja de
cálculo:

**1. El ciclo arranca el día de la entrega, no el del pedido.** En contraentrega un pedido
en tránsito o devuelto nunca llegó a consumirse. Contarlo adelantaría todos los avisos. Se
puede cambiar en *Configuración → Solo las entregas arrancan un ciclo*, pero no deberías.

**2. Varios frascos en una misma orden se suman.** El cliente no se toma tres frascos en
paralelo: se toma uno, luego otro, luego otro.

**3. Si recompra antes de agotar, el frasco nuevo empieza cuando se acaba el anterior.** El
ciclo previo queda marcado como recomprado y el nuevo arranca desde la fecha de agotamiento
del viejo, no desde la fecha de compra.

**4. El factor de ajuste corrige la teoría con la realidad.** Cuando un cliente ya compró el
mismo producto dos o más veces, sus propios intervalos entre compras dicen la verdad mejor
que la etiqueta del envase. Se usa la **mediana** de `intervalo real ÷ duración teórica`, y
el resultado se acota al rango `[0,6 – 1,6]` para que un pedido raro no arruine las fechas
siguientes.

> **Ojo con las dosis.** Las que trae el catálogo son las de la etiqueta habitual de cada
> tipo de producto, **no están confirmadas con el proveedor**. Es el único dato del sistema
> que no se puede deducir de los pedidos y del que dependen todas las fechas. Revísalo en
> *Productos* antes de mandar el primer mensaje.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la aplicación en <http://localhost:3000> y activa el cron diario. |
| `npm run seed` | Catálogo + 50 clientes y 200 compras ficticias. |
| `npm run seed:catalogo` | Solo catálogo, alias, escalas de precio y plantillas. |
| `npm run sync` | Trae pedidos y contactos desde la fuente configurada. |
| `npm run sync -- --dry-run` | Valida y cuenta sin escribir una sola fila. |
| `npm run sync -- --desde=2026-01-01` | Solo pedidos desde esa fecha. |
| `npm run sync -- --refrescar` | Vuelve a pedir también los contactos que ya conoce. |
| `npm test` | Pruebas del núcleo de cálculo. |
| `npm run test:watch` | Las mismas, en modo continuo. |
| `npm run db:studio` | Explorador visual de la base. |
| `npm run db:reset` | Borra y recrea la base desde cero. |
| `npx tsx scripts/limpiar-demo.ts` | Borra los datos de demostración y deja los reales. |

---

## Variables de entorno

Copia `.env.example` a `.env`. **La aplicación arranca sin ninguna credencial**: con
`npm run seed` trae datos ficticios y las integraciones quedan en modo simulado.

Las que importan si vas a conectar datos reales:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Ruta del archivo SQLite. Por defecto `file:./dev.db`. |
| `LUCIDBOT_TOKEN` | Panel de Lucid Bot → Configuración → Integraciones → API Token. |
| `LUCIDBOT_PIPELINE_ID` | El pipeline que contiene los pedidos. En esta cuenta, `967216`. |
| `LUCIDBOT_ETAPAS_ENTREGADO` | Etapas que significan "el cliente ya lo tiene". Por defecto `Entregados`. |
| `MODO_ENVIO` | `simulado` (por defecto) o `real`. |
| `CRON_ACTIVO` | `false` apaga el job diario; queda solo el botón manual. |

---

## Conectar otra fuente de datos

La ingesta pasa por un adaptador con tres implementaciones:

- **`LocalDbAdapter`** — la propia base. Es el que usa la plataforma cuando los datos ya
  están cargados.
- **`LucidBotAdapter`** — Lucid Bot / Chatrace. Absorbe las particularidades del origen:
  los pedidos son *opportunities* dentro de un pipeline, la paginación es de 100 como
  máximo, no existe listado de contactos y la API corta con 429 si se le pide demasiado
  seguido (por eso reintenta con espera creciente).
- **`RestApiAdapter`** — cualquier otro proveedor, **sin escribir código**. La forma de su
  JSON se describe en un mapeo declarativo; si el proveedor cambia un nombre de campo, se
  edita el mapeo y ya. Ver [`docs/mapeo-ejemplo.json`](docs/mapeo-ejemplo.json).
- **`CsvImportAdapter`** — importación desde archivo, con validación fila por fila, reporte
  de rechazos con número de línea y modo de prueba. Ver
  [`docs/ejemplo-compras.csv`](docs/ejemplo-compras.csv).

Para conectar una API REST propia:

1. Escribe el mapeo siguiendo `docs/mapeo-ejemplo.json`.
2. Ponlo en el `.env` en una sola línea:
   ```
   REST_API_BASE_URL="https://api.tuproveedor.com"
   REST_API_KEY="Bearer xxxxx"
   REST_API_MAPEO='{"compras":{"ruta":"/orders", ...}}'
   ```
3. `npm run sync -- --fuente=rest --dry-run` para comprobar sin escribir nada.

La ingesta es **idempotente**: la clave es el id del pedido en el origen y, a falta de ese,
`cliente + producto + fecha`. Correrla diez veces seguidas deja la base igual que correrla
una vez.

---

## API

Todos los errores salen con la misma forma:

```json
{ "error": { "code": "DATOS_INVALIDOS", "message": "...", "details": [...] } }
```

Códigos: `DATOS_INVALIDOS` (400), `NO_ENCONTRADO` (404), `CONFLICTO` (409),
`REGLA_DE_NEGOCIO` (422), `ORIGEN_EXTERNO` (502), `ERROR_INTERNO` (500).

| Método y ruta | Qué hace |
|---|---|
| `GET /api/health` | Estado, día en Bogotá y conteos de la base. |
| `GET /api/customers` | Lista con búsqueda, filtros y paginación. |
| `POST /api/customers` | Crea un cliente. |
| `GET /api/customers/:id` | Ficha con historial, ciclos y perfil de consumo. |
| `PATCH /api/customers/:id` | Edita un cliente. |
| `GET /api/products` | Catálogo con alias y escalas de precio. |
| `POST /api/products` | Crea un producto (la duración se deriva, no se recibe). |
| `PATCH /api/products/:id` | Edita y recalcula los ciclos afectados. |
| `DELETE /api/products/:id` | Borra, o desactiva si ya tiene compras. |
| `GET /api/purchases` | Compras, con filtro `?revision=true`. |
| `POST /api/purchases` | Registra una compra y devuelve el ciclo que generó. |
| `GET /api/cycles` | Ciclos con `?estado=&desde=&hasta=&q=&productId=`. |
| `PATCH /api/cycles/:id` | Pausar, cancelar, marcar recomprado, mover la fecha. |
| `POST /api/cycles/recalculate` | Recálculo masivo. |
| `GET /api/dashboard/metrics` | KPIs, proyección de 12 semanas y lista de acción. |
| `GET /api/notifications` | Bandeja de salida. |
| `POST /api/notifications/generate` | Prepara mensajes. No envía. |
| `POST /api/notifications/dispatch` | Procesa la bandeja pendiente. |
| `GET /api/templates` · `POST` · `PATCH /:id` · `DELETE /:id` | Plantillas. |
| `GET /api/settings` · `PATCH` | Configuración global. |
| `POST /api/sync` | Ingesta. Acepta `dryRun`, `desde`, `fuente`, `csv`. |
| `GET /api/jobs/run` · `POST` | Estado del motor y ejecución manual. |

---

## El botón de WhatsApp

En el panel, la tabla de clientes, la de ciclos, la ficha de cada cliente y la bandeja hay
un botón verde que **abre el chat de WhatsApp con el mensaje ya escrito**.

Usa `wa.me`, el "click to chat" oficial: funciona igual en WhatsApp Web, en la aplicación
de escritorio y en el teléfono, sin credenciales ni API de por medio. El texto queda en la
caja del chat **sin enviarse**: tú lo lees, lo editas si quieres y pulsas enviar. Coherente
con el resto del sistema, que nunca escribe a nadie por su cuenta.

El mensaje sale de la misma función que usa el job (`redactarMensaje`), así que el chat y
la bandeja nunca dicen cosas distintas. Depende del estado del ciclo: uno por vencer recibe
el recordatorio amable y uno vencido, el texto de "ya se te acabó".

Detalles que conviene saber:

- Los números se normalizan solos: `+57 300 123 4567`, `3001234567` y `573001234567` llevan
  al mismo chat. Si el teléfono no sirve, el botón no aparece en vez de dar un enlace roto.
- Si el cliente **no dio consentimiento**, el botón se pone ámbar y lo dice al pasar el
  ratón. No se bloquea: escribirle es tu decisión, no la del sistema. Lo que sí está
  bloqueado es que la plataforma le genere mensajes sola.
- En clientes sin ciclo en ventana el botón abre el chat en blanco.

---

## Seguridad y buen comportamiento

Cuatro cosas están puestas a propósito y conviene no quitarlas:

**Modo simulado por defecto.** Los mensajes se guardan en la bandeja y no salen hacia
ningún proveedor hasta que cambies `modoEnvio` a `real` en Configuración. Es la protección
más barata contra que una prueba le escriba a un cliente de verdad.

**Consentimiento en el modelo desde el día uno.** Sin `consentimientoMarketing` no se
genera ni un mensaje. En los datos de Lucid Bot se toma del campo `subscribed`, que es el
opt-in de WhatsApp.

**Límite de frecuencia.** Nadie recibe dos mensajes en menos de los días configurados, y el
límite es por cliente, no por ciclo: quien tenga tres productos a punto de acabarse recibe
un mensaje, no tres.

**Aprobación humana.** El job diario prepara mensajes pero nunca los despacha. Alguien tiene
que darle a *Procesar* mirando la pantalla.

Las credenciales viven solo en el `.env` y nunca se mandan al navegador. La pantalla de
Configuración muestra si están puestas, no su valor.

**Sobre el texto de los mensajes:** son suplementos, no medicamentos. Las plantillas no
deben prometer resultados terapéuticos, y conviene que el texto final lo revise quien lleve
el tema regulatorio.

---

## El motor

Un `node-cron` dentro del propio proceso de Next corre todos los días a las **08:00 hora de
Bogotá** y hace tres cosas:

1. Recalcula los ciclos y reclasifica sus estados
   (`PROGRAMADO → POR_VENCER → VENCIDO`).
2. Prepara los mensajes de los que entraron en ventana.
3. Deja todo registrado en la auditoría.

Nunca pisa una decisión humana: los estados `CONTACTADO`, `RECOMPRADO`, `PAUSADO` y
`CANCELADO` los respeta tal cual.

### Los siete estados

| Estado | Quién lo pone | Qué significa |
|---|---|---|
| **Programado** | el motor | Todavía le queda producto de sobra. |
| **Por vencer** | el motor | Entró en la ventana de aviso. Es a quien hay que escribirle. |
| **Vencido** | el motor | Ya se le acabó y no ha vuelto a comprar. |
| **Contactado** | una persona | Ya le escribiste. Sale de la lista de pendientes. |
| **Recomprado** | el motor o una persona | Llegó otra compra del mismo producto. |
| **Pausado** | una persona | Fuera del motor temporalmente. |
| **Cancelado** | una persona | Fuera del motor para siempre. |

**Sobre "Contactado":** marcarlo cuenta como un contacto real — actualiza la fecha del
último contacto y suma uno al contador de intentos, igual que si el mensaje hubiera salido
por la bandeja. Eso hace que el límite de frecuencia lo tenga en cuenta y que no se le
generen mensajes nuevos.

El motor no lo toca nunca; si pudiera, la siguiente corrida lo devolvería a *Por vencer* y
la marca no habría servido de nada. Lo único que lo saca de ahí es que **el cliente vuelva
a comprar**: al llegar una compra posterior del mismo producto, el ciclo pasa a
*Recomprado* solo.

Como consecuencia, un cliente al que escribiste y nunca respondió se queda en *Contactado*
indefinidamente. Para que eso no se pierda de vista, el panel tiene el KPI **Contactados
sin respuesta**, y esos ciclos siguen contando como abiertos y entran en el denominador de
la tasa de recompra.

Para probarlo sin esperar al día siguiente hay un botón **Ejecutar ahora** en
*Configuración*. Ojo: el cron solo corre mientras `npm run dev` esté levantado.

---

## Pruebas

```bash
npm test
```

Cubren el núcleo de cálculo, que es lo único que realmente hay que tener bien:

- duración del envase y redondeo hacia abajo;
- cálculo base y anticipación configurable;
- varios frascos en una misma orden;
- recompra anticipada y encadenamiento de ciclos;
- factor de ajuste, mediana y acotado fuera de rango;
- cambios de mes, de año y años bisiestos;
- zona horaria de Bogotá contra UTC;
- lectura de títulos de Lucid Bot y escalas de precio;
- reclasificación de estados;
- renderizado de plantillas.

El núcleo (`src/lib/domain/`) no importa Prisma, ni Next, ni nada de red: son funciones
puras sobre datos planos, y por eso se puede probar entero sin levantar la aplicación.

---

## Pasar a PostgreSQL

```bash
npm run db:postgres
# ajusta DATABASE_URL y DATABASE_PROVIDER en el .env
npx prisma migrate dev --name cambio-de-motor
npm run seed:catalogo
```

Prisma no admite el motor por variable de entorno, así que el script reescribe esa línea
del esquema. Los adaptadores de driver para ambos motores ya están instalados.

---

## Estructura

```
prisma/
  schema.prisma        11 entidades
  catalogo.ts          productos, alias, escalas y plantillas base
  seed.ts              semilla (catálogo + demostración)
src/
  lib/domain/          núcleo puro y testeado: fechas, duración, ciclos,
                       factor de ajuste, estados, productos, plantillas
  lib/adapters/        DataSourceAdapter + LocalDb, LucidBot, RestApi, Csv
  lib/services/        orquestación: ciclos, sincronización, notificaciones,
                       motor, métricas, configuración, auditoría
  lib/validation/      esquemas Zod de todo lo que entra por HTTP
  app/api/             endpoints REST
  app/                 seis pantallas del panel
  instrumentation.ts   arranque del cron
scripts/               sincronizar, cambiar de motor, limpiar demostración
tests/domain/          Vitest
docs/                  mapeo REST de ejemplo y CSV de ejemplo
```

---

## Limitaciones conocidas

Cosas que la plataforma **no** hace, para que no te sorprendan:

- **Un tercio de los pedidos de Lucid Bot llega con el título vacío.** Sin producto no hay
  duración posible, así que se marcan para revisión manual en vez de estimarse a ciegas.
  Están en *Ciclos → Ver pedidos en revisión*.
- **Los pedidos con varios productos distintos también van a revisión.** El valor total no
  permite saber cuántas unidades hay de cada uno, y repartirlo sería inventar.
- **El factor de ajuste necesita historial.** Con clientes que solo han comprado una vez
  manda la duración teórica del frasco. En los datos actuales casi nadie ha recomprado el
  mismo producto todavía, así que el factor tardará un ciclo completo en volverse útil.
- **El envío real no está conectado.** En modo `real` el despacho falla de forma explícita
  en vez de fingir que envió. Conectar WhatsApp Cloud API exige plantillas aprobadas por
  Meta por la ventana de 24 horas, y eso se decide con el número ya verificado.
- **Lucid Bot no guarda la ciudad del contacto**, así que ese campo queda vacío en los
  clientes importados.
- **El cron vive dentro del proceso de Next.** Si cierras la terminal, no corre.
