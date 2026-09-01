# SDD — Etapa 1: Consulta de precios y venta en mostrador
## Especificación ejecutable

| | |
|---|---|
| **Proyecto** | `onplay-core` |
| **Etapa** | 1 de 6 |
| **Versión** | 1.3 |
| **Revisión 1.3** | Añade `GET /auditoria` (cierra el hueco H2 de `05`) y el tipo `servicio` que necesita la Etapa 4 |
| **Fecha** | 22 de agosto de 2026 |
| **Revisión 1.1/1.2** | Incorpora las reglas S1–S4 derivadas de la revisión de código del Binder OP (`docs/03-revision-codigo-binder-op.md`) |
| **Documento padre** | `docs/01-SDD-general.md` |
| **Línea base** | `docs/00-linea-base-sistema-actual.md` |
| **Destinatario** | Claude Code |

> **Cómo usar este documento.** Es la especificación completa de la Etapa 1. Las decisiones de diseño están cerradas: no hay que elegir, hay que implementar. Si durante la implementación se encuentra una contradicción entre este documento y la realidad de los datos, **detente y repórtalo** — no improvises una solución.
>
> **Regla de alcance (Riesgo R4 del SDD general):** todo lo que no esté listado en §3 de este documento está fuera de la Etapa 1, sin excepción, aunque parezca trivial de agregar.

---

## 1. Qué resuelve esta etapa

Una persona en el mostrador de Merced 832 debe poder:

1. **Saber el precio de cualquier producto en menos de 5 segundos**, incluidos los snacks que hoy no están en ningún sistema.
2. **Cobrar y registrar la venta**, con pago en efectivo, tarjeta, transferencia o una combinación.
3. **Cerrar la caja al final del día** y saber si cuadra.

Nada más.

## 2. Qué NO hace esta etapa

- No escribe nada en onplay.cl ni onplaygames.cl. La sincronización es **estrictamente de lectura**.
- No controla stock. Los productos se crean con `controlaStock = false` (Principio P4). La venta no descuenta inventario.
- No tiene clientes ni monedero. Las ventas son anónimas o con un nombre libre.
- No gestiona eventos ni inscripciones.
- No emite boleta ni factura.
- No tiene compras, proveedores ni costos. **El campo `costoReferencia` no existe en el esquema de E1**; se agrega por migración en E6.
- **No permite retiros ni ingresos de efectivo durante el turno.** El único movimiento de caja es la venta. Si en la práctica se retira efectivo, se anota en las notas del cierre y se acepta la diferencia. La entidad `movimiento_caja` llega en E2.
- No tiene reportes más allá del listado de ventas del día y el cierre de caja.

---

## 3. Alcance funcional (la lista cerrada)

| # | Funcionalidad | Prioridad |
|---|---|---|
| F1 | Importación inicial del catálogo desde ambos WooCommerce (solo lectura) | P0 |
| F2 | Sincronización incremental de catálogo y precios cada 30 minutos | P0 |
| F3 | Alta manual de productos, con foco en snacks y confitería | P0 |
| F4 | Buscador de mostrador: nombre, SKU, número de carta **y código de barras** | P0 |
| F5 | Venta con carrito, descuento y pago mixto | P0 |
| F6 | Turno de caja: apertura, cierre y arqueo | P0 |
| F7 | Backoffice: alta/edición de producto, listado de ventas del día, cierre de caja | P0 |
| F8 | Autenticación y roles (`vendedor`, `encargado`, `admin`) | P0 |
| F9 | Anulación de venta (con motivo, por rol `encargado`, solo en turnos abiertos) | P1 |
| F10 | Modo offline de la PWA: catálogo cacheado y cola de ventas | P1 |
| F11 | Detección y fusión asistida de productos duplicados entre canales | P1 |

P0 = sin esto la etapa no sirve. P1 = se implementa dentro de la etapa, después de que todo P0 esté en producción.

> F11 es P1 y no P2 porque es la mitigación del Riesgo R3 del SDD general. La *detección* (marcar `posibleDuplicado`) forma parte del importador P0; solo el flujo de fusión es P1.

---

## 4. Modelo de datos de la Etapa 1

Solo las tablas necesarias para F1–F11. El resto del modelo del SDD general **no se crea todavía**.

### 4.1 Esquema Prisma

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextIndex", "fullTextSearch"]
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// Prisma exige un valor de enum por línea; no se pueden escribir en una sola.
enum TipoProducto {
  single
  sellado
  accesorio
  snack
  juego_mesa
  juguete
  evento
  indeterminado
  servicio        // productos que no son mercadería: "Carga de saldo" (E4 §6.3)
}

enum RolUsuario {
  vendedor
  encargado
  admin
}

enum EstadoVenta {
  completada
  anulada
}

enum MedioPago {
  efectivo
  debito
  credito
  transferencia
  mercadopago
  otro
}

enum EstadoTurno {
  abierto
  cerrado
}

enum AccionAuditoria {
  crear
  editar
  anular
  cambiar_precio
  abrir_turno
  cerrar_turno
}

model Canal {
  id            String    @id                     // "onplay_cl" | "onplaygames_cl" | "tienda_fisica"
  nombre        String
  tipo          String                            // "woocommerce" | "fisico"
  urlBase       String?
  activo        Boolean   @default(true)

  productos     ProductoCanal[]
  ventas        Venta[]
}

model Categoria {
  id            String      @id @default(cuid())
  nombre        String
  slug          String      @unique
  padreId       String?
  padre         Categoria?  @relation("Jerarquia", fields: [padreId], references: [id])
  hijos         Categoria[] @relation("Jerarquia")
  productos     Producto[]
}

model Producto {
  id                String    @id @default(cuid())
  sku               String    @unique                // SKU maestro interno
  nombre            String
  tipo              TipoProducto @default(indeterminado)
  juego             String?                          // campo libre: "magic" | "one_piece" | ...
  categoriaId       String?
  categoria         Categoria? @relation(fields: [categoriaId], references: [id])
  precioVenta       Int       @default(0)            // CLP, sin decimales
  controlaStock     Boolean   @default(false)        // Principio P4
  activo            Boolean   @default(true)
  posibleDuplicado  Boolean   @default(false)        // marcado por el importador, §6.6
  imagenUrl         String?   @db.Text
  codigoBarras      String?                          // columna propia: se busca e indexa
  cardNumber        String?                          // columna propia: se busca e indexa
  atributos         Json?                            // resto de metadatos por tipo, §4.2
  creadoEn          DateTime  @default(now())
  actualizadoEn     DateTime  @updatedAt

  canales           ProductoCanal[]
  lineas            VentaLinea[]

  @@index([tipo, activo])
  @@index([codigoBarras])
  @@index([cardNumber])
  @@fulltext([nombre])
}

model ProductoCanal {
  id                String    @id @default(cuid())
  productoId        String
  producto          Producto  @relation(fields: [productoId], references: [id], onDelete: Cascade)
  canalId           String
  canal             Canal     @relation(fields: [canalId], references: [id])
  externoId         Int?                            // ID del post en WooCommerce
  externoSku        String?                         // SKU tal cual está publicado
  publicado         Boolean   @default(true)
  precioCanal       Int?                            // null => hereda producto.precioVenta
  sincronizadoEn    DateTime?
  hashUltimoSync    String?

  @@unique([canalId, externoId])
  @@unique([canalId, externoSku])
  @@unique([productoId, canalId])
  @@index([productoId])
}

model Usuario {
  id            String      @id @default(cuid())
  nombre        String
  email         String      @unique
  passwordHash  String
  rol           RolUsuario  @default(vendedor)
  activo        Boolean     @default(true)
  creadoEn      DateTime    @default(now())

  turnos          TurnoCaja[]
  ventas          Venta[]     @relation("VentasRegistradas")
  ventasAnuladas  Venta[]     @relation("VentasAnuladas")
  auditorias      Auditoria[]
}

model TurnoCaja {
  id               String       @id @default(cuid())
  usuarioId        String
  usuario          Usuario      @relation(fields: [usuarioId], references: [id])
  estado           EstadoTurno  @default(abierto)
  abiertoEn        DateTime     @default(now())
  montoApertura    Int
  cerradoEn        DateTime?
  montoDeclarado   Int?                              // efectivo contado al cierre
  montoEsperado    Int?                              // calculado por el sistema, §5.3
  diferencia       Int?                              // declarado - esperado
  notas            String?      @db.Text

  ventas           Venta[]

  @@index([usuarioId, estado])
}

model Venta {
  id              String       @id @default(cuid())
  folio           String       @unique                 // "V-2026-00001", §5.5
  idempotencyKey  String       @unique                 // ULID generado por el cliente, §5.4
  canalId         String       @default("tienda_fisica")
  canal           Canal        @relation(fields: [canalId], references: [id])
  turnoCajaId     String
  turnoCaja       TurnoCaja    @relation(fields: [turnoCajaId], references: [id])
  usuarioId       String
  usuario         Usuario      @relation("VentasRegistradas", fields: [usuarioId], references: [id])
  clienteNombre   String?                              // texto libre en E1; entidad Cliente en E4
  subtotal        Int
  descuento       Int          @default(0)
  total           Int
  estado          EstadoVenta  @default(completada)
  motivoAnulacion String?      @db.Text
  anuladaEn       DateTime?
  anuladaPorId    String?
  anuladaPor      Usuario?     @relation("VentasAnuladas", fields: [anuladaPorId], references: [id])
  creadoEn        DateTime     @default(now())

  lineas          VentaLinea[]
  pagos           Pago[]

  @@index([creadoEn])
  @@index([turnoCajaId])
}

model VentaLinea {
  id              String    @id @default(cuid())
  ventaId         String
  venta           Venta     @relation(fields: [ventaId], references: [id], onDelete: Cascade)
  productoId      String?                            // null => ítem suelto no catalogado
  producto        Producto? @relation(fields: [productoId], references: [id])
  descripcion     String                             // congelada al momento de la venta
  cantidad        Int
  precioUnitario  Int
  descuentoLinea  Int       @default(0)
  totalLinea      Int

  @@index([ventaId])
  @@index([productoId])
}

model Pago {
  id             String     @id @default(cuid())
  ventaId        String
  venta          Venta      @relation(fields: [ventaId], references: [id], onDelete: Cascade)
  medio          MedioPago
  monto          Int                                 // importe IMPUTADO a la venta
  montoRecibido  Int?                                // solo efectivo, para el vuelto
  referencia     String?                             // nº de operación o voucher. NUNCA dígitos de tarjeta

  @@index([ventaId])
}

model Correlativo {
  clave   String  @id                                // "venta"
  anio    Int
  ultimo  Int     @default(0)
}

// Bitácora de la máquina: lo que hace el sync contra WooCommerce.
model SyncLog {
  id          String    @id @default(cuid())
  canalId     String?                                // sin relación: el log sobrevive a borrados
  operacion   String                                 // "importar" | "incremental" | ...
  productoId  String?
  resultado   String                                 // "creado" | "actualizado" | "omitido" | "error"
  resuelto    Boolean   @default(false)              // para errores que requieren revisión manual
  detalle     String?   @db.Text
  creadoEn    DateTime  @default(now())

  @@index([canalId, creadoEn])
  @@index([resultado, resuelto])
}

// Bitácora de las personas: lo que hace un usuario. Tabla DISTINTA de SyncLog.
model Auditoria {
  id             String          @id @default(cuid())
  usuarioId      String
  usuario        Usuario         @relation(fields: [usuarioId], references: [id])
  entidad        String                               // "producto" | "venta" | "turno_caja" | "usuario"
  entidadId      String
  accion         AccionAuditoria
  valorAnterior  Json?
  valorNuevo     Json?
  creadoEn       DateTime        @default(now())

  @@index([entidad, entidadId])
  @@index([usuarioId, creadoEn])
}
```

> **Por qué `SyncLog` y `Auditoria` están separadas.** El criterio de aceptación 2 exige que `SyncLog` no tenga errores sin resolver. Si un cambio manual de precio se registrara ahí, ese criterio sería imposible de evaluar. `SyncLog` es de la máquina; `Auditoria` es de las personas.
>
> **Por qué `codigoBarras` y `cardNumber` son columnas y no viven en `atributos`.** Son los dos campos por los que se busca en el mostrador. Como columnas se indexan; dentro de un JSON, no.

### 4.2 Contenido de `Producto.atributos`

JSON sin esquema rígido, con estas formas conocidas. `card_number` y `codigo_barras` **no** van aquí (§4.1).

```jsonc
// single de Magic (origen: plugin OnPlay Binder)
{
  "set_code": "MOM", "rarity": "rare", "is_foil": "no",
  "condicion": "NM", "idioma": "EN", "scryfall_id": "f487b582-…"
}

// single de One Piece (origen: Binder OP)
{
  "set_code": "EB04", "set_full_code": "OP15-EB04",
  "rarity_code": "L", "rarity": "leader", "is_alt_art": "yes",
  "color": "Red/Yellow", "card_type": "LEADER", "condicion": "NM", "idioma": "EN"
}

// snack
{ "formato": "lata 350cc", "sabor": "original" }
```

### 4.3 Datos semilla obligatorios

```
Canal:      onplay_cl (woocommerce), onplaygames_cl (woocommerce), tienda_fisica (fisico)

Categoria:  Cartas
              └ Magic · One Piece · Pokémon · Riftbound · Star Wars · Flesh and Blood
            Sellado
            Accesorios
            Juegos de Mesa
            Juegos de Rol
            Juguetes y Colección
            Snacks
              └ Bebidas · Aguas · Energéticas · Confitería
            Eventos              ← destino de las categorías de evento del importador
            Sin clasificar       ← destino por defecto cuando no hay coincidencia

Correlativo: { clave: "venta", anio: <año actual>, ultimo: 0 }

Usuario:    un admin inicial creado por script (`npm run crear-admin`)
```

La categoría `Snacks` y sus cuatro hijas son la razón de ser de esta etapa: hoy no existen en ningún sistema. `Sin clasificar` y `Eventos` son obligatorias porque el importador escribe en ellas (§6.3).

---

## 5. API

Base: `/api/v1`. Todas las respuestas en JSON. Todos los endpoints excepto `/auth/login` y `/salud` requieren `Authorization: Bearer <jwt>`.

### 5.1 Autenticación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | — | `{email, password}` → `{token, refreshToken, usuario}` |
| `POST` | `/auth/refresh` | — | `{refreshToken}` → `{token}` |
| `GET` | `/auth/yo` | cualquiera | Usuario de la sesión actual |

### 5.2 Catálogo

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/productos` | vendedor | Query: `q`, `tipo`, `juego`, `categoriaId`, `activo`, `posibleDuplicado`, `limit` (máx 100), `cursor`. **Nunca devuelve el catálogo completo sin paginar** |
| `GET` | `/productos/buscar?q=` | vendedor | Endpoint optimizado del mostrador. Máx 20 resultados por relevancia. Objetivo: **p95 < 200 ms** |
| `GET` | `/productos/catalogo-offline?desde=<ISO>` | vendedor | Payload comprimido (gzip) para el caché de la PWA. Campos: `id, sku, nombre, precioVenta, categoriaId, codigoBarras, cardNumber, activo`. Sin `desde` devuelve el catálogo completo; con `desde` solo el delta |
| `GET` | `/productos/:id` | vendedor | Detalle, incluye `canales[]` |
| `POST` | `/productos` | encargado | Alta manual (F3). Registra en `Auditoria` |
| `PATCH` | `/productos/:id` | encargado | Edición. Todo cambio de `precioVenta` registra en `Auditoria` con valor anterior y nuevo |
| `POST` | `/productos/:id/fusionar` | encargado | `{productoAbsorbidoId}` (F11, §6.6) |
| `GET` | `/categorias` | vendedor | Árbol completo (es chico, se cachea en el cliente) |
| `GET` | `/auditoria` | encargado | Rastro de cambios. Query: `entidad`, `entidadId`, `usuarioId`, `accion`, `desde`, `hasta`. Alimenta la pantalla de Auditoría de §8 |

### 5.3 Venta y caja

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/turnos/abrir` | vendedor | `{montoApertura}`. Falla con `409 TURNO_YA_ABIERTO` si el usuario ya tiene uno |
| `GET` | `/turnos/actual` | vendedor | Turno abierto del usuario, o `null` |
| `POST` | `/turnos/:id/cerrar` | vendedor | `{montoDeclarado, notas}` → `{montoEsperado, diferencia}`. Ver reglas abajo |
| `GET` | `/turnos/:id/resumen` | vendedor | Totales por medio de pago, cantidad de ventas, ticket promedio |
| `GET` | `/turnos` | encargado | Historial de turnos con su arqueo |
| `POST` | `/ventas` | vendedor | Crea la venta. Ver §5.4 |
| `GET` | `/ventas` | vendedor* | *Un `vendedor` **solo** puede consultar con `?turnoCajaId=<su turno abierto>`; sin ese filtro, o con el turno de otro, responde `403`. Un `encargado` consulta libremente con `desde`, `hasta`, `estado` |
| `GET` | `/ventas/:id` | vendedor* | Mismo criterio: el vendedor solo ve ventas de su turno abierto |
| `POST` | `/ventas/:id/anular` | encargado | `{motivo}`. No borra: marca `anulada` (Principio P9) |

**Reglas del cierre de turno (`POST /turnos/:id/cerrar`):**

```
montoEsperado = turno.montoApertura
              + SUM(pago.monto)  WHERE pago.medio = 'efectivo'
                                   AND venta.turnoCajaId = turno.id
                                   AND venta.estado = 'completada'
diferencia    = montoDeclarado - montoEsperado
```

- **Incluir `montoApertura` es obligatorio.** Sin él, la diferencia sería siempre igual al monto de apertura y la caja nunca cuadraría.
- Las ventas anuladas quedan fuera por el filtro de estado.
- Si `diferencia !== 0` y `notas` viene vacío → `422 NOTA_REQUERIDA`. **Esta validación vive en el servidor**, no solo en la interfaz (criterio de aceptación 9).
- El cierre es irreversible: el turno pasa a `cerrado` y no se reabre.

**Reglas de la anulación (`POST /ventas/:id/anular`):**

- Solo se anulan ventas cuyo `turnoCaja.estado === 'abierto'`. Si el turno ya cerró → `409 TURNO_CERRADO`, con el mensaje de que corresponde una devolución (E2). Anular una venta de un turno cerrado invalidaría un arqueo ya persistido.
- `motivo` es obligatorio. Se registra en `Auditoria` con `accion: anular`.

### 5.4 Contrato de `POST /ventas`

```jsonc
// petición
{
  "idempotencyKey": "01J…",          // ULID generado por el cliente; obligatorio
  "clienteNombre": "Pedro",          // opcional
  "descuento": 0,                    // descuento global en CLP
  "lineas": [
    { "productoId": "clx…", "cantidad": 2, "precioUnitario": 2600, "descuentoLinea": 0 },
    { "productoId": null, "descripcion": "Varios", "cantidad": 1, "precioUnitario": 2000 }
  ],
  "pagos": [
    { "medio": "efectivo", "monto": 3200, "montoRecibido": 5000 },
    { "medio": "debito",   "monto": 4000, "referencia": "OP-889231" }
  ]
}
```

**Fórmulas de cálculo — el servidor las calcula, el cliente no las envía:**

```
totalLinea  = (cantidad × precioUnitario) − descuentoLinea
subtotal    = SUM(cantidad × precioUnitario)          // antes de todo descuento
totalLineas = SUM(totalLinea)
total       = totalLineas − descuento
```

**Validaciones del servidor, en este orden:**

1. Existe un turno abierto para el usuario. Si no → `409 TURNO_NO_ABIERTO`.
2. `idempotencyKey` no fue usada antes. Si ya existe → devuelve **la venta original con `200`**, no crea otra. Esto es lo que hace segura la cola offline de F10.
3. Hay al menos una línea. Cada línea: `cantidad > 0`, `precioUnitario >= 0`.
4. Si `productoId` es null, `descripcion` es obligatoria. Si no lo es, `descripcion` se toma del producto y se congela.
5. `0 <= descuentoLinea <= cantidad × precioUnitario`. Si no → `422 DESCUENTO_LINEA_INVALIDO`.
6. Se calculan `totalLinea`, `subtotal`, `totalLineas` y `total` con las fórmulas de arriba.
7. `0 <= descuento <= totalLineas`. Si no → `422 DESCUENTO_INVALIDO`. (Sin este tope, un descuento global desmedido podría llevar la venta a cero pasando la sola validación de `total >= 0`.)
8. `SUM(pagos.monto) === total`. Si no → `422 PAGOS_NO_CUADRAN`, con la diferencia en el detalle.
9. Para pagos en efectivo con `montoRecibido`: `montoRecibido >= monto`. El vuelto es `montoRecibido − monto` y **no se persiste**; es un dato de la interfaz.
10. Se reserva el folio contra `Correlativo` con `SELECT ... FOR UPDATE` (§5.5).

**`Pago.monto` es el importe imputado a la venta, no el recibido.** Si el cliente paga $5.000 por una venta de $4.990, se registra `monto: 4990, montoRecibido: 5000`. Guardar el recibido en `monto` rompería la validación 8 e inflaría el arqueo.

**El precio se congela en la venta.** `precioUnitario` viene del cliente y se almacena tal cual; el servidor **advierte** en la respuesta si difiere del `precioVenta` vigente (`{advertencias: [{lineaIndex, precioActual, precioEnviado}]}`) pero **no rechaza** — el vendedor puede haber acordado otro precio. La advertencia se registra en `Auditoria`.

Todo, incluida la reserva de folio, dentro de una **única transacción de base de datos**.

### 5.5 Folio correlativo

```sql
-- dentro de la transacción de la venta
SELECT ultimo, anio FROM Correlativo WHERE clave = 'venta' FOR UPDATE;
-- si anio != año actual → reiniciar ultimo a 0 y actualizar anio
UPDATE Correlativo SET ultimo = ultimo + 1 WHERE clave = 'venta';
-- folio = `V-${anio}-${String(ultimo).padStart(5,'0')}`
```

**Consecuencia a documentar en la interfaz:** una venta registrada sin conexión recibe su folio al **llegar** al servidor, no al momento del cobro. El folio refleja el orden de llegada, no siempre el orden cronológico.

### 5.6 Sincronización

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/sync/:canalId/importar` | admin | Importación completa. `dryRun` es el **valor por defecto**: omitir el parámetro simula. Escribir exige `?dryRun=false` explícito (regla S1 del SDD general) |
| `POST` | `/sync/:canalId/incremental` | admin | Solo lo modificado desde `sincronizadoEn` |
| `GET` | `/sync/logs` | admin | Query: `canalId`, `resultado`, `resuelto`, `desde` |
| `PATCH` | `/sync/logs/:id` | admin | `{resuelto: true}` — marcar un error como atendido |
| `GET` | `/sync/estado` | admin | Última corrida por canal, conteos, errores pendientes |

### 5.7 Salud

`GET /salud` (público) → `{ ok, db: bool, canales: {onplay_cl: bool, onplaygames_cl: bool}, version }`

---

## 6. Importador de catálogo (F1)

### 6.1 Origen

WooCommerce REST API v3, `GET /wp-json/wc/v3/products`, paginado de 100 en 100, con `?status=publish`.

Volúmenes esperados según la línea base:

| Canal | Publicados | Simples | Variables |
|---|---|---|---|
| onplay.cl | 2.132 | 2.132 | 0 |
| onplaygames.cl | 260 | 226 | **34** |
| **Total** | **2.392** | 2.358 | 34 |

### 6.2 Mapeo de campos

| Campo WooCommerce | Campo `Producto` | Notas |
|---|---|---|
| `id` | `ProductoCanal.externoId` | |
| `sku` | `ProductoCanal.externoSku` | **Se conserva tal cual** (Principio P3) |
| `name` | `nombre` | |
| `price` → fallback `regular_price` | `precioVenta` | Ver regla de precio abajo |
| `images[0].src` | `imagenUrl` | |
| `categories[]` | `categoriaId`, `tipo`, `juego` | Vía §6.3 |
| `meta_data._card_number` | `cardNumber` | Columna propia |
| `meta_data` (barcode/EAN si existe) | `codigoBarras` | Columna propia |
| `meta_data[]` (resto) | `atributos` | Solo las claves listadas en §4.2. **Todo lo demás se descarta** |
| — | `sku` (maestro) | §6.4 |
| — | `controlaStock` | **Siempre `false`** en E1 |

**Regla de precio (crítica).**

1. Se usa `price` (precio efectivo, ya contempla `sale_price`), no `regular_price`. Usar `regular_price` haría que el mostrador cotice **más caro** que el sitio cuando hay una oferta activa.
2. Si `price` viene vacío, se usa `regular_price`.
3. **Si `type === "variable"`** (34 productos en onplaygames.cl — sleeves, carpetas y deck boxes, justamente los que arrastran los ~40 atributos `pa_*`), el padre devuelve el precio vacío. Se llama `GET /products/:id/variations` y **se crea un producto por variación**, con:
   - `nombre` = `{nombre del padre} — {resumen de atributos de la variación}` (ej. *"Dragon Shield Matte Standard — Negro"*)
   - `ProductoCanal.externoId` = ID de la variación
   - `ProductoCanal.externoSku` = SKU de la variación, o el del padre con sufijo si no tiene
   - misma categoría y tipo que el padre

   Sin esta regla, 13% del catálogo de onplaygames.cl entraría sin precio y el objetivo O1 fallaría justo en los accesorios.
4. Si tras todo lo anterior no hay precio: `precioVenta = 0`, `activo = false`, y se registra en `SyncLog` con `resultado: "error"` para revisión manual.

**Productos sin tipo determinable:** `tipo = indeterminado`, prefijo de SKU `IND`, `categoriaId` = "Sin clasificar", registro en `SyncLog`. Esto rompe la dependencia circular entre §6.3 (que determina el tipo) y §6.4 (que lo necesita para el SKU).

### 6.3 Mapeo de categorías

Las 310 categorías de onplay.cl y las 40 de onplaygames.cl **no se importan tal cual**. Se mapean a la taxonomía interna limpia (§4.3).

**Regla general:** un producto puede tener varias categorías en WooCommerce. Se evalúan **en el orden de la tabla** y gana la primera coincidencia; las categorías contenedoras genéricas (`juego-de-cartas`) se evalúan al final.

**Las reglas son por canal.** onplay.cl vende singles; onplaygames.cl vende sellado. Aplicar la misma regla a ambos marcaría como "single" los 7 productos sellados de One Piece de onplaygames.cl.

#### onplay.cl → siempre `tipo: single`

| Patrón de slug | Categoría interna | `juego` |
|---|---|---|
| termina en `-magic-the-gathering` | Cartas > Magic | `magic` |
| desciende de `one-piece-tcg` | Cartas > One Piece | `one_piece` |
| `uncategorized` o sin coincidencia | Sin clasificar | null |

El set original **no se pierde**: queda en `atributos.set_code` / `atributos.set_full_code`. La jerarquía de 310 categorías existe para el SEO del sitio; el sistema interno no la necesita.

#### onplaygames.cl → lista explícita de los 40 slugs reales

| Slug(s) | Categoría interna | `tipo` | `juego` |
|---|---|---|---|
| `magic`, `magic-the-gathering`, `mtg-final-fantasy`, `final-fantasy`, `duskmourn`, `edge-of-eternities`, `secrets-of-strixhaven`, `tarkir-dragonstorm`, `secret-lair`, `single-magic`, `avatar-the-last-airbender`, `marvels-spider-man`, `the-lord-of-the-rings`, `the-hobbit`, `marvel-super-heroes` | Sellado | `sellado` | `magic` |
| `pokemon` | Sellado | `sellado` | `pokemon` |
| `one-piece-tcg` | Sellado | `sellado` | `one_piece` |
| `riftbound-league-of-legends` | Sellado | `sellado` | `riftbound` |
| `star-wars-unlimited` | Sellado | `sellado` | `star_wars` |
| `flesh-and-blood` | Sellado | `sellado` | `flesh_and_blood` |
| `tcg-sellado` | Sellado | `sellado` | null |
| `accesorios`, `sleeves`, `carpetas`, `deck-box`, `dados`, `playmate-tube` | Accesorios | `accesorio` | null |
| `figuras-pokemon`, `juguetes-coleccion` | Juguetes y Colección | `juguete` | null |
| `juego-de-mesa`, `juegos-de-mesa`, `familiar`, `fiesta` | Juegos de Mesa | `juego_mesa` | null |
| `juego-de-rol`, `juegos-de-rol` | Juegos de Rol | `juego_mesa` | null |
| `eventos`, `eventos-tcg` | Eventos | `evento` | null → además `activo: false` (E5 los tomará) |
| `juego-de-cartas` | *contenedor genérico* — **se ignora si el producto tiene otra categoría**; si es la única, → Sellado | `sellado` | null |
| `uncategorized`, `sin-categorizar`, cualquier otro | Sin clasificar | `indeterminado` | null |

> Los slugs duplicados de la línea base (`juego-de-mesa`/`juegos-de-mesa`, `magic`/`magic-the-gathering`, `juego-de-rol`/`juegos-de-rol`) **se fusionan aquí**, en el mapeo. La limpieza en el origen se hace después, no antes.
>
> **Los atributos `pa_*` de onplaygames.cl se descartan por completo** (Riesgo R5) salvo cuando definen una variación (§6.2, regla 3), donde se usan solo para componer el nombre.

### 6.4 Generación del SKU maestro

```ts
// packages/dominio/src/sku.ts
function generarSkuMaestro(p: ProductoWoo, tipo: TipoProducto): string {
  // 1. One Piece: el SKU externo ya tiene la forma OP-{FILEBASE}
  if (p.sku?.startsWith('OP-')) return `OPT-${p.sku.slice(3)}`;

  // 2. Magic: SKU externo con forma {SET}-{Nº}-{COND}-{IDIOMA}
  const mtg = p.sku?.match(/^([A-Z0-9]{2,5})-(\d+)-(NM|LP|MP|HP|DMG)-([A-Z]{2})$/);
  if (mtg) {
    const [, set, num, cond, idioma] = mtg;
    return `MTG-${set}-${num.padStart(3, '0')}-${cond}-${idioma}`;
  }

  // 3. Todo lo demás: prefijo por tipo + correlativo reservado en base de datos
  //    sellado→SLD  accesorio→ACC  snack→SNK  juego_mesa→JDM
  //    juguete→JGT  evento→EVT     servicio→SRV   indeterminado→IND
  return reservarCorrelativo(prefijoPorTipo(tipo));   // SLD-000142, ACC-000073, SNK-000018…
}
```

Si dos productos generan el mismo SKU maestro, **no se sobrescribe**: se registra `resultado: "error"` en `SyncLog` con ambos IDs externos y el producto queda sin importar, para revisión manual.

### 6.5 Sincronización incremental (F2)

- `node-cron` cada 30 minutos, dentro del proceso de la API (Principio P6).
- Filtro: `?modified_after=<ISO UTC>&dates_are_gmt=true`. **El parámetro `dates_are_gmt` es obligatorio**: sin él WooCommerce interpreta la fecha en la zona horaria del sitio y, con Chile en UTC−4/−3, cada corrida perdería o reprocesaría una ventana de tres a cuatro horas — un fallo intermitente e invisible.
- Actualiza **solo** `nombre`, `precioVenta`, `imagenUrl` y `publicado`. No toca `atributos`, `tipo` ni categorías después de la importación inicial (evitaría revertir correcciones manuales).
- Si un producto desaparece de WooCommerce, **no se borra**: se marca `ProductoCanal.publicado = false` (Principio P9).
- Todo en `SyncLog`. Un error por producto no aborta la corrida.

### 6.6 Detección y fusión de duplicados (F11)

**Detección — parte del importador, P0.** Tras cada importación, se marca `posibleDuplicado = true` en ambos productos cuando:

- pertenecen a canales distintos,
- su `nombre` normalizado (minúsculas, sin tildes, sin puntuación, espacios colapsados) es idéntico,
- y `precioVenta` difiere en menos de ±10%.

El backoffice expone `?posibleDuplicado=true` como filtro desde el primer día. Con esto sola, el Riesgo R3 ya está mitigado.

**Fusión — P1.** `POST /productos/:id/fusionar` con `{productoAbsorbidoId}`:

- Se reasignan los `ProductoCanal` del absorbido al sobreviviente.
- **Si ambos tienen una fila del mismo canal** (la restricción `@@unique([productoId, canalId])` lo impediría), sobrevive la del canal cuyo `sincronizadoEn` sea más reciente; la otra se elimina y el hecho se registra en `Auditoria`.
- El absorbido queda `activo = false`. **No se borra** (Principio P9).
- Nunca automático: siempre requiere confirmación humana en la interfaz.

---

## 7. Aplicación de mostrador (PWA)

### 7.1 Pantalla única de venta

El mostrador tiene **una sola pantalla**. Todo ocurre ahí.

```
┌──────────────────────────────────────────────────────────────┐
│  OnPlay · Mostrador          Turno abierto · Jose · 14:32     │
├───────────────────────────────┬──────────────────────────────┤
│  🔍 [ buscar…              ]  │   CARRITO                    │
│                               │                              │
│  ┌─────────────────────────┐  │   Coca-Cola 350cc      $1.500│
│  │ Coca-Cola lata 350cc    │  │   x2                   $3.000│
│  │ SNK-000018       $1.500 │  │                              │
│  ├─────────────────────────┤  │   Jewelry Bonney       $8.000│
│  │ Jewelry Bonney EB04-001 │  │   EB04-001 (Alt Art)   x1    │
│  │ OPT-EB04-001-P1  $8.000 │  │                              │
│  ├─────────────────────────┤  │  ─────────────────────────── │
│  │ Sobre OP-11             │  │   Subtotal          $11.000  │
│  │ SLD-000142       $4.990 │  │   Descuento              $0  │
│  └─────────────────────────┘  │   TOTAL             $11.000  │
│                               │                              │
│  [Snacks] [Sellado] [Cartas]  │   [    COBRAR    ]           │
└───────────────────────────────┴──────────────────────────────┘
```

**Reglas de interacción:**

- El foco está **siempre** en el buscador. Escribir y presionar Enter agrega el primer resultado al carrito. Un lector de código de barras USB funciona sin configuración: escribe y manda Enter.
- Búsqueda con *debounce* de 150 ms, mínimo 2 caracteres. Los resultados aparecen mientras se escribe.
- Los accesos rápidos por categoría (`Snacks`, `Sellado`, `Cartas`) muestran una grilla táctil — esto es lo que hace usable la venta de bebidas sin escribir.
- El precio de una línea se puede editar tocándolo (queda la advertencia de §5.4).
- Sin turno abierto, la pantalla muestra el diálogo de apertura de caja y no deja hacer nada más.

### 7.2 Diálogo de cobro

- Total a pagar, grande.
- Botones de medio de pago. Al elegir `efectivo`, calculadora de vuelto: se ingresa el **monto recibido**, se muestra el vuelto, y se envía `monto` (imputado) junto a `montoRecibido`.
- **Pago mixto:** se agregan varios pagos hasta cubrir el total. El botón de confirmar se habilita solo cuando `SUM(pagos.monto) === total`.
- Al confirmar: se envía con `idempotencyKey` (ULID generado en el cliente), se muestra el folio y el carrito se vacía. Máximo un clic para empezar la siguiente venta.

### 7.3 Cierre de caja

- Resumen del turno: cantidad de ventas, total por medio de pago, ticket promedio.
- Campo "efectivo contado".
- Al cerrar, muestra el monto de apertura, el esperado, lo declarado y la diferencia. Si hay diferencia, la nota es obligatoria — validado también en el servidor (§5.3).
- Genera un resumen imprimible/compartible del turno.

### 7.4 Modo offline (F10)

- Al iniciar sesión, la PWA descarga `GET /productos/catalogo-offline` y lo guarda en **IndexedDB**. Se refresca cada 30 minutos usando `?desde=<último sync>` para bajar solo el delta.
- **Campos cacheados:** `id`, `sku`, `nombre`, `precioVenta`, `categoriaId`, `codigoBarras`, `cardNumber`, `activo`. Los dos últimos son imprescindibles: sin ellos, buscar "EB04-001" o pasar el lector por una lata no devolvería nada sin conexión, y la regla de "consultar al servidor solo si no hay resultados locales" provocaría justamente el peor caso.
- Con 2.392 productos, el payload ronda **menos de 1 MB** sin comprimir; se sirve con gzip.
- La búsqueda funciona contra el caché local **siempre**, con o sin conexión. El servidor solo se consulta si el término no da resultados locales y hay conexión.
- Sin conexión, las ventas se encolan en IndexedDB con su `idempotencyKey` y se envían al reconectar. La `idempotencyKey` garantiza que un reintento no duplique la venta (§5.4).
- Indicador visible del estado: `en línea` / `sin conexión · N ventas pendientes`.

### 7.5 Diseño visual

- Tailwind, tema oscuro por defecto (coherente con el Binder OP y con la iluminación de una tienda).
- Objetivos táctiles de **44 px mínimo**.
- Layout responsive: dos columnas en ≥ lg, carrito en cajón inferior deslizable en móvil.
- Sin librerías de componentes externas. Sin animaciones más allá de transiciones de 150 ms.

---

## 8. Backoffice (F7)

Mínimo viable, mismo bundle React, ruta `/admin`, rol `encargado` o superior.

| Pantalla | Contenido |
|---|---|
| **Productos** | Tabla con búsqueda y filtros por tipo/categoría/canal y por `posibleDuplicado`. Alta y edición. Marca visible de en qué canales está publicado |
| **Alta rápida de snack** | Formulario de un solo paso: nombre, precio, categoría, código de barras. Optimizado para dar de alta 50 productos en una sesión |
| **Ventas del día** | Listado con folio, hora, total, medios de pago, vendedor. Detalle expandible. Botón de anular |
| **Turnos** | Historial de turnos con apertura, esperado, declarado y diferencia |
| **Sincronización** | Estado por canal, última corrida, botón de importar/incremental, log de errores con acción "marcar resuelto" |
| **Auditoría** | Últimos cambios de precio, anulaciones y altas, con usuario y valor anterior |
| **Usuarios** | Alta y cambio de rol (solo `admin`) |
| **Duplicados** | (F11) Candidatos con acción de fusionar o descartar |

---

## 9. Plan de implementación

Cada fase termina con algo ejecutable y verificable. No se avanza sin cerrar la anterior.

### Fase 0 — Verificación de supuestos (antes de escribir código)

1. **Confirmar el plan de Hostinger** (Riesgo R1 / Decisión D1). ¿Se puede correr Node y abrir un puerto? Si la respuesta es no, **detenerse y reportar** — cambia el stack completo.
2. **Verificar acceso a la API REST de WooCommerce** en ambos sitios: generar claves `ck_`/`cs_` de **solo lectura** y confirmar que `GET /wp-json/wc/v3/products?per_page=1` responde en los dos.
3. **Confirmar que existe un campo de código de barras** en algún `meta_data` de onplaygames.cl. Si no existe (probable), los códigos de barras se capturan a mano en la Fase 6 y `codigoBarras` queda vacío en la importación.
4. **Subir el código real del Binder OP a su repositorio** (Riesgo R2).
5. Confirmar contra la línea base que los volúmenes siguen siendo ~2.132 y ~260 productos (226 simples + 34 variables). Si difieren en más de 10%, reportar antes de continuar.

### Fase 1 — Cimientos

- Monorepo, TypeScript, Fastify, Prisma, esquema de §4.1, migración inicial.
- Semillas de §4.3.
- `GET /salud`, autenticación con JWT, roles, script `npm run crear-admin`.
- **Verificable:** `prisma validate` y `prisma migrate dev` pasan, el login funciona, `/salud` responde y la base tiene las categorías semilla.

### Fase 2 — Importador (F1)

- Cliente tipado de WooCommerce en `packages/woo-client`, con el candado de solo lectura (§11).
- `POST /sync/:canalId/importar` con `dryRun`.
- Mapeo de §6.2 (incluida la expansión de variables), §6.3 y generación de SKU de §6.4.
- Detección de duplicados de §6.6.
- **Verificable:** `dryRun` sobre ambos canales reporta 2.392 productos + las variaciones expandidas, con su clasificación y sin escribir. Menos del 5% cae en "Sin clasificar". La corrida real los deja en base con su `ProductoCanal`.

### Fase 3 — Catálogo y búsqueda (F3, F4)

- `GET /productos`, `/productos/buscar`, `/productos/catalogo-offline`, `POST /productos`, `PATCH /productos/:id`.
- Índice fulltext sobre `nombre`, índices sobre `codigoBarras` y `cardNumber`.
- **Verificable:** buscar "coca", "EB04-001" o un código de barras devuelve el producto correcto en menos de 200 ms (p95) con el catálogo completo cargado.

### Fase 4 — Venta y caja (F5, F6)

- Turnos, `POST /ventas` con toda la validación de §5.4, idempotencia, folio correlativo, pagos mixtos.
- Cierre de turno con la fórmula de §5.3.
- **Verificable:** se registra una venta con pago mixto; el turno cierra y el arqueo cuadra **incluyendo el monto de apertura**. Reenviar la misma `idempotencyKey` devuelve la venta original y no crea una segunda. Dos ventas concurrentes obtienen folios distintos y consecutivos.

### Fase 5 — Mostrador (PWA)

- Pantalla única de §7.1, diálogo de cobro, cierre de caja.
- **Verificable:** una venta completa de tres ítems se hace en menos de 30 segundos, solo con teclado.

### Fase 6 — Backoffice (F7) y carga de snacks

- Pantallas de §8.
- **Carga real de los snacks** con el encargado de la tienda. Este es el hito que hace visible el valor de la etapa.
- **Verificable:** todas las bebidas y confitería de la tienda tienen precio consultable.

### Fase 7 — Endurecimiento (F9, F10, F11)

- Anulación de ventas, modo offline, fusión asistida de duplicados.
- Sincronización incremental programada.
- **Verificable:** con el wifi apagado se registran tres ventas y al reconectar aparecen las tres, sin duplicados.

---

## 10. Criterios de aceptación de la Etapa 1

La etapa está terminada cuando **todos** se cumplen:

1. Un vendedor encuentra el precio de un snack, de un single de Magic y de un single de One Piece — buscando por nombre, por número de carta o pasando el lector de código de barras — en menos de 5 segundos cada uno.
2. Los 2.392 productos publicados en ambos sitios están importados, con las 34 variaciones de onplaygames.cl expandidas y con precio. Los registros `error` de `SyncLog` fueron resueltos manualmente antes de cerrar la etapa (meta: 0 pendientes con `resuelto = false`).
3. Menos del 5% del catálogo quedó en "Sin clasificar".
4. Los snacks, bebidas y confitería de la tienda están cargados con precio.
5. Se registra una venta con dos productos y pago mixto (efectivo + débito), y el folio se emite correlativo.
6. El turno cierra y la diferencia de arqueo es la real —con el monto de apertura incluido en el esperado—; si es distinta de cero, el servidor exige nota.
7. Un cambio de precio hecho en WooCommerce aparece en el sistema en **menos de 35 minutos** (el cron corre cada 30 y la corrida toma unos minutos), sin intervención.
8. Un cambio de precio hecho en el sistema **no** modifica nada en WooCommerce. Verificación explícita de que E1 es de solo lectura.
9. Con la conexión caída se registran tres ventas y al reconectar aparecen exactamente tres, no seis.
10. Un `vendedor` no puede anular una venta, cambiar un precio ni ver las ventas de otro turno; un `encargado` sí. Verificado contra la API con `curl`, no solo en la interfaz.
11. Durante siete días corridos, todas las ventas presenciales quedan en el sistema y la caja cuadra al cierre.

---

## 11. Variables de entorno

```env
# apps/api/.env
NODE_ENV=production
PORT=3010
DATABASE_URL="mysql://usuario:clave@localhost:3306/onplay_core"
TZ=UTC

JWT_SECRET=<cadena aleatoria de 64+ caracteres>
JWT_EXPIRA=8h
REFRESH_EXPIRA=30d

# WooCommerce — SOLO LECTURA en Etapa 1
WOO_ONPLAY_URL=https://onplay.cl
WOO_ONPLAY_CK=ck_xxxxxxxx
WOO_ONPLAY_CS=cs_xxxxxxxx

WOO_ONPLAYGAMES_URL=https://onplaygames.cl
WOO_ONPLAYGAMES_CK=ck_xxxxxxxx
WOO_ONPLAYGAMES_CS=cs_xxxxxxxx

SYNC_HABILITADO=true
SYNC_CRON="*/30 * * * *"
SYNC_SOLO_LECTURA=true      # ← candado de la Etapa 1. Cambiarlo a false es una decisión de E3

CORS_ORIGINS=https://pos.onplay.cl,http://localhost:5173
```

```env
# apps/web/.env
VITE_API_URL=https://api.onplay.cl
```

`SYNC_SOLO_LECTURA=true` es un candado explícito: mientras esté activo, el `woo-client` **lanza una excepción** ante cualquier intento de `POST`, `PUT` o `DELETE` hacia WooCommerce. Es la garantía técnica del criterio de aceptación 8, y debe estar cubierta por un test unitario.

**Ninguna variable `VITE_*` puede contener un secreto** (regla S3 del SDD general). Vite las incrusta en el bundle en tiempo de compilación: lo que ponga ahí queda en texto plano en el JavaScript que descarga cualquier navegador. Las credenciales de WooCommerce y `JWT_SECRET` viven **solo** en `apps/api/.env`; el navegador solo maneja el token de sesión que recibe al iniciar sesión. Esto es exactamente lo que hoy está mal en el Binder OP (`03-revision-codigo-binder-op.md`, P0 #1) y es la razón de que la Etapa 1 use JWT y no una clave compartida.

---

## 12. Convenciones de código

- **TypeScript estricto** (`strict: true`). Sin `any` salvo en los límites de deserialización, y ahí con validación de esquema (`zod` o los esquemas nativos de Fastify).
- **Español en el dominio, inglés en la infraestructura** (Principio P7): `producto`, `venta`, `calcularTotal`, `TurnoCaja`; `Repository`, `Service`, `Controller`, `Middleware`.
- **Nombres en `camelCase`** en Prisma y en las columnas de MySQL, sin `@map`. El SDD general los escribe en `snake_case` por legibilidad; la correspondencia es directa.
- **Montos en enteros CLP**, siempre. Nunca `float`. Nunca decimales.
- **Fechas en UTC** en la base de datos (`TZ=UTC` en el proceso), con formato en `America/Santiago` en la presentación. Toda llamada a WooCommerce con parámetros de fecha usa `dates_are_gmt=true`.
- **Sin librería de componentes** en el frontend. Tailwind y componentes propios.
- **Tests** con `vitest`, solo sobre las reglas de negocio de `packages/dominio`:
  - cálculo de `totalLinea`, `subtotal` y `total`, incluidos los topes de descuento (§5.4)
  - `montoEsperado` del arqueo, con apertura y con ventas anuladas (§5.3)
  - `generarSkuMaestro` para los casos de la tabla de §6.4
  - validación de que `SUM(pagos) === total`
  - el candado `SYNC_SOLO_LECTURA`

  Sin tests de interfaz ni end-to-end en esta etapa.
- **Migraciones nunca destructivas** sin respaldo verificado previo.

---

## 13. Entregable

Un repositorio `onplay-core` con:

- Monorepo funcionando con `npm install` en la raíz y `npm run dev` levantando API y web.
- Esquema Prisma de §4.1 con su migración inicial y las semillas de §4.3.
- API completa de §5.
- Importador de §6, verificado con `dryRun` contra ambos canales.
- PWA de mostrador de §7 y backoffice de §8.
- `CLAUDE.md` en la raíz documentando: comandos, arquitectura, el candado `SYNC_SOLO_LECTURA`, la convención de SKU maestro, el modelo de `ProductoCanal` y la separación entre `SyncLog` y `Auditoria`.
- `README.md` con instalación, variables de entorno y el procedimiento de despliegue.
- Los tres documentos de diseño (`00`, `01`, `02`) en `docs/`.

**Empezar por la Fase 0.** Si alguno de sus cinco puntos falla, detenerse y reportar antes de escribir código de aplicación.