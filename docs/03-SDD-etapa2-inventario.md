# SDD — Etapa 2: Inventario real
## Especificación ejecutable

| | |
|---|---|
| **Versión** | 1.0 — 2026-09-02 |
| **Estado** | Vinculante. Fase 0 ratificada por el dueño el 2026-09-02 (regla de prioridad §6.9). **Fases 1–5 implementadas y verificadas el 2026-09-02** (commits `420bcc2`, `ca16f27`, `1fd4eaa`, `7b6d622`, `db75125`). Fase 6: documentación cerrada; **criterio 18 (recuento real) pendiente del dueño** |
| **Precedentes** | `01-SDD-general.md` §3, §6.2, §9 · `02-SDD-etapa1-mostrador.md` · `07-SDD-etapa4-cliente-monedero.md` (formato) · `06-SDD-etapa3-sincronizacion.md` (lo que E3 exige de E2) · `08-bitacora-revision.md` R-009, R-011 |
| **Resuelve** | O3 del SDD general: que exista un inventario real y auditable de lo que hay en la tienda |
| **Referencias externas** | `onplay-erp` (cuarto intento): gate reservar→confirmar con `FOR UPDATE`, cola de excepciones · `OnplayPOS`: lo que NO hacer (stock absoluto a ciegas, ventas sin movimiento) |

> **Regla de lectura.** Lo que no está aquí no es de E2. Lo que E3 necesita de E2 (§13) sí está aquí porque cuesta menos hacerlo ahora que migrar después; nada más de E3 entra.

---

## 1. Qué resuelve esta etapa

Hoy `onplay-core` vende sin saber cuánto hay. Todos los productos tienen `controlaStock = false` (P4) y el mostrador no descuenta nada. El stock real vive en dos WooCommerce que se desincronizan de la tienda física en cada venta presencial, y la sobreventa entre la web y el mostrador **ya ocurrió en la vida real** (R-011).

Al terminar E2:

1. Existe un **libro de movimientos de stock** por producto y ubicación (P5: append-only, el stock es siempre una suma).
2. El mostrador **descuenta stock al vender** los productos que lo controlan, y lo repone al anular.
3. El encargado hace **recuentos guiados** por categoría y tanda, y con ellos enciende `controlaStock` producto por producto (P4, activación gradual: snacks y sellado primero).
4. Hay **ajustes, mermas y traslados** entre ubicaciones, siempre con motivo y usuario.
5. El sistema **avisa** de quiebres, stock bajo, stock negativo y del **último disponible en la web** (espejo de solo lectura del stock del canal, §6.8).
6. Las **devoluciones** existen como operación propia: devuelven dinero desde la caja abierta y reponen stock, y resuelven el hueco de E1 «una venta de turno cerrado no se anula» (`02` §5.5).
7. Queda listo el terreno que E3b exige: `Ubicacion.publicable`, `referencia_tipo = 'pedido_canal'` reservado, y dos recuentos consecutivos que cuadren.

### 1.1 Lo que enseñaron los intentos anteriores

| Lección | Origen | Cómo la cierra E2 |
|---|---|---|
| Vender sin registrar movimiento deja el kardex inservible | OnplayPOS decrementaba `stock_qty` directo; el filtro «Ventas» del kardex siempre salía vacío | **Toda** mutación de stock es una fila de `movimiento_stock`; `stock_actual` es un resumen que se actualiza en la misma transacción (§6.1). No existe endpoint que cambie `stock_actual` a mano |
| Dos escritores del mismo número se pisan | OnplayPOS empujaba absolutos a Woo sin leer; onplay-erp ignoraba a Woo por diseño | E2 **no escribe** en los canales (P2). Solo lee `stock_quantity` como espejo informativo (§6.8). Escribir es E3b con S2 |
| La carrera se resuelve con un candado de fila, no con «esperar que no pase» | onplay-erp `inventory.js` reserva bajo `FOR UPDATE` | El descuento por venta bloquea la fila de `stock_actual` dentro de la transacción de la venta, antes del `Correlativo` (§6.3; mismo orden anti-interbloqueo que E4 §6.2) |
| El pedido web perdedor va a excepción manual, nunca cancelación automática | onplay-erp D5-04 | Queda **reservado para E3c**. E2 solo garantiza que el libro pueda recibir `venta_online` y `pedido_canal` sin migrar |
| Bloquear la venta física por un número del sistema mata la adopción | R6 del SDD general; P8 (offline no puede consultar stock) | **El mostrador nunca bloquea por stock** (§6.3). El producto está en la mano del cliente. Si el libro queda negativo, se avisa al encargado y se corrige con recuento |

---

## 2. Qué NO hace esta etapa

- **No escribe stock ni precio en WooCommerce.** Ni siquiera con dryRun. Eso es E3b (`06` §4). El candado `SYNC_SOLO_LECTURA` sigue puesto.
- **No ingiere pedidos web ni descuenta por ventas online.** Es E3c. El motivo `venta_online` existe en el enum desde ya porque el SDD general lo define, pero **nadie lo genera en E2**.
- **No calcula costos ni márgenes.** `costo_referencia` y el costo promedio ponderado son E6. `movimiento_stock` no lleva costo.
- **No crea órdenes de compra ni proveedores** (E6). El motivo `compra` sirve para ingresos manuales de mercadería con nota, sin OC.
- **No obliga a inventariar el catálogo completo.** 2.878 singles de onplay.cl pueden quedar con `controlaStock = false` hasta el final de la etapa o más allá.
- **No bloquea una venta por falta de stock** (§6.3). Tampoco un traslado ni una merma: el libro acepta negativos y los reporta.
- **No implementa números de serie ni unidades individuales por carta** (el modelo `StockUnit` de onplay-erp). Todo es cantidad por producto y ubicación. Si algún día una carta puntual necesita identidad propia, es un producto distinto.
- **No toca el arqueo de E1 salvo para restar devoluciones y sumar/restar movimientos de caja** (§6.6, §6.7). La fórmula `calcularArqueo` gana dos términos; no cambia de forma.

---

## 3. Alcance funcional

| # | Capacidad | Rol | Prioridad |
|---|---|---|---|
| C1 | Ubicaciones semilla (`mostrador`, `carpetas`, `vitrina`, `bodega`) administrables por el encargado | encargado | P0 |
| C2 | Libro `movimiento_stock` + resumen `stock_actual` por producto y ubicación; stock visible en la ficha del producto (V5), en el buscador del mostrador y en la grilla | todos | P0 |
| C3 | La venta del mostrador descuenta stock (motivo `venta`) de la ubicación de venta; la anulación lo repone (`devolucion`) | sistema | P0 |
| C4 | Recuento guiado por ubicación + categoría/tanda; al cerrarlo genera `recuento_inicial` o `ajuste` por diferencia y **enciende `controlaStock`** en lo contado | encargado | P0 |
| C5 | Ajuste, merma, ingreso manual (`compra` sin OC) y traslado entre ubicaciones, con nota obligatoria | encargado | P0 |
| C6 | Alertas: quiebre (0), stock bajo (≤ `stockMinimo`), stock negativo, y «último en la web» (§6.8) | encargado (panel) · vendedor (aviso en cobro) | P1 |
| C7 | Espejo de solo lectura del stock del canal (`stockCanal`, `stockCanalEn`) alimentado por el sync existente de E1 | sistema | P1 |
| C8 | Devoluciones: total o parcial sobre una venta completada, aunque su turno esté cerrado; devuelve dinero desde la caja abierta y repone stock por línea | encargado | P0 |
| C9 | Movimientos de caja: ingreso y retiro de efectivo durante el turno, con nota; entran al arqueo | encargado | P1 |
| C10 | Historial de movimientos por producto (kardex) y export CSV del stock actual | encargado | P1 |

Las prioridades P0 son el corte mínimo para que E2 sea útil sola (P1 del SDD general): con C1–C5 y C8 la tienda tiene inventario de snacks y sellado, vende descontando, y puede devolver.

---

## 4. Principios de esta etapa

- **M1 — Nada cambia `stock_actual` salvo una fila nueva en `movimiento_stock`, en la misma transacción.** Es P5 llevado al código: no hay `UPDATE stock_actual SET cantidad = x` fuera de `registrarMovimiento`.
- **M2 — El stock puede ser negativo, y eso es una alerta, no un error.** Bloquear cuesta ventas; avisar cuesta un recuento.
- **M3 — Todo movimiento tiene usuario, motivo y referencia.** `usuarioId` obligatorio (como M5 de E4). Los motivos manuales (`ajuste`, `merma`, `traslado`, `compra`) exigen `nota`.
- **M4 — Un traslado es un solo acto y dos filas.** Sale de A y entra a B en la misma transacción, con el mismo `referenciaId` (el id del traslado). Nunca queda medio traslado.
- **M5 — `controlaStock` se enciende con datos, no a mano.** Se activa al cerrar un recuento que incluyó al producto (o al registrar su primer ingreso manual). Apagarlo es una acción auditada del encargado con nota.
- **M6 — El espejo del canal es informativo.** `stockCanal` nunca participa en un cálculo de stock propio ni bloquea nada. Sirve para que el vendedor sepa que va a vender el último que la web también ofrece.

---

## 5. Modelo de datos

Prisma en `camelCase`; el SDD general documenta en `snake_case`. Dinero no aparece en esta etapa salvo en devoluciones y movimientos de caja (CLP `Int`).

### 5.1 Entidades nuevas

```prisma
model Ubicacion {
  id         String  @id @default(cuid())
  codigo     String  @unique // mostrador · carpetas · vitrina · bodega (semilla) · libre después
  nombre     String
  publicable Boolean @default(false) // §13: E3 suma solo estas. Semilla: bodega = true
  esVenta    Boolean @default(false) // de aquí descuenta el mostrador. Semilla: mostrador = true, única
  activa     Boolean @default(true)
  orden      Int     @default(0)

  movimientos MovimientoStock[]
  stock       StockActual[]
  recuentos   Recuento[]
}

enum MotivoStock {
  recuento_inicial // primer recuento del producto en esa ubicación: fija el punto de partida
  compra           // ingreso de mercadería (sin OC en E2; E6 le pone referencia)
  venta            // descuento por venta del mostrador (referencia venta)
  venta_online     // reservado: lo genera E3c (referencia pedido_canal)
  ajuste           // recuento posterior con diferencia, o corrección manual con nota
  merma            // pérdida, daño, robo
  devolucion       // reposición por devolución o anulación (referencia devolucion | venta)
  traslado         // salida de A y entrada a B (dos filas, misma referencia)
}

/// Libro append-only (P5). El stock es SUM(cantidad).
model MovimientoStock {
  id             String      @id @default(cuid())
  productoId     String
  producto       Producto    @relation(fields: [productoId], references: [id])
  ubicacionId    String
  ubicacion      Ubicacion   @relation(fields: [ubicacionId], references: [id])
  cantidad       Int         // CON SIGNO: positivo entra, negativo sale. Nunca 0
  motivo         MotivoStock
  referenciaTipo String?     // 'venta' | 'devolucion' | 'recuento' | 'traslado' | 'ajuste' | 'pedido_canal' (E3)
  referenciaId   String?
  nota           String?     @db.Text
  usuarioId      String
  usuario        Usuario     @relation(fields: [usuarioId], references: [id])
  creadoEn       DateTime    @default(now())

  @@index([productoId, ubicacionId, creadoEn])
  @@index([referenciaTipo, referenciaId])
  @@index([motivo, creadoEn])
}

/// Resumen materializado (01 §6.2). Se actualiza SOLO desde registrarMovimiento, en la misma tx,
/// con SELECT … FOR UPDATE sobre esta fila. Nunca se escribe desde otro sitio (M1).
model StockActual {
  productoId    String
  producto      Producto  @relation(fields: [productoId], references: [id])
  ubicacionId   String
  ubicacion     Ubicacion @relation(fields: [ubicacionId], references: [id])
  cantidad      Int       @default(0)
  actualizadoEn DateTime  @updatedAt

  @@id([productoId, ubicacionId])
  @@index([ubicacionId, cantidad])
}

enum EstadoRecuento {
  abierto
  cerrado
  descartado
}

/// Recuento guiado (C4): una ubicación, opcionalmente una categoría (subárbol) o una lista de productos.
model Recuento {
  id          String         @id @default(cuid())
  ubicacionId String
  ubicacion   Ubicacion      @relation(fields: [ubicacionId], references: [id])
  categoriaId String?        // filtro del alcance; null = productos elegidos a mano
  nombre      String         // "Snacks mostrador 02-09", libre
  estado      EstadoRecuento @default(abierto)
  usuarioId   String
  usuario     Usuario        @relation(fields: [usuarioId], references: [id])
  creadoEn    DateTime       @default(now())
  cerradoEn   DateTime?
  nota        String?        @db.Text

  lineas RecuentoLinea[]

  @@index([ubicacionId, estado])
}

model RecuentoLinea {
  id               String   @id @default(cuid())
  recuentoId       String
  recuento         Recuento @relation(fields: [recuentoId], references: [id], onDelete: Cascade)
  productoId       String
  producto         Producto @relation(fields: [productoId], references: [id])
  cantidadSistema  Int      // snapshot de stock_actual al agregar la línea
  cantidadContada  Int?     // null = todavía no contado
  contadoEn        DateTime?

  @@unique([recuentoId, productoId])
}

/// Devolución (C8): dinero sale de la caja ABIERTA de quien la hace, stock vuelve por línea.
model Devolucion {
  id          String    @id @default(cuid())
  folio       String    @unique // D-2026-00001, Correlativo clave 'devolucion_{año}'
  ventaId     String
  venta       Venta     @relation(fields: [ventaId], references: [id])
  turnoCajaId String    // turno ABIERTO en que se devuelve (puede ser otro que el de la venta)
  turnoCaja   TurnoCaja @relation(fields: [turnoCajaId], references: [id])
  monto       Int       // CLP devuelto, ≤ lo pagado y no devuelto de esa venta
  medio       MedioPago // cómo se devuelve: efectivo (sale del arqueo) o monedero (E4, movimiento devolucion)
  motivo      String    @db.Text
  usuarioId   String
  usuario     Usuario   @relation(fields: [usuarioId], references: [id])
  creadoEn    DateTime  @default(now())

  lineas DevolucionLinea[]

  @@index([ventaId])
  @@index([turnoCajaId])
}

model DevolucionLinea {
  id           String     @id @default(cuid())
  devolucionId String
  devolucion   Devolucion @relation(fields: [devolucionId], references: [id], onDelete: Cascade)
  ventaLineaId String
  ventaLinea   VentaLinea @relation(fields: [ventaLineaId], references: [id])
  cantidad     Int        // ≤ cantidad vendida − ya devuelta
  reponeStock  Boolean    @default(true) // false = producto dañado: se registra merma, no devolucion
  montoLinea   Int

  @@index([ventaLineaId])
}

enum TipoMovimientoCaja {
  ingreso
  retiro
}

/// Movimiento de caja (C9): efectivo que entra o sale del turno sin ser venta (02 §5.5 lo agenda para E2).
model MovimientoCaja {
  id          String             @id @default(cuid())
  turnoCajaId String
  turnoCaja   TurnoCaja          @relation(fields: [turnoCajaId], references: [id])
  tipo        TipoMovimientoCaja
  monto       Int                // siempre positivo; el tipo da el signo
  nota        String             @db.Text // obligatoria
  usuarioId   String
  usuario     Usuario            @relation(fields: [usuarioId], references: [id])
  creadoEn    DateTime           @default(now())

  @@index([turnoCajaId])
}
```

### 5.2 Cambios sobre entidades existentes

| Entidad | Cambio | Por qué |
|---|---|---|
| `Producto` | `stockMinimo Int @default(0)` | Umbral de «stock bajo» (C6). 0 = sin alerta de bajo, solo quiebre |
| `Producto` | back-relations `movimientosStock`, `stock`, `recuentoLineas` | Prisma |
| `Producto.controlaStock` | **sin cambio de tipo**; deja de ser «siempre false» (`02` §4.1) y pasa a encenderse por recuento o ingreso (M5) | Activación gradual P4 |
| `ProductoCanal` | `stockCanal Int?`, `stockCanalEn DateTime?`, `manejaStockCanal Boolean?` | Espejo de solo lectura (§6.8). **Distinto de `stockPublicado`** de E3 (`06` §4.1), que es «lo que el maestro escribió»; este es «lo que el canal dice hoy» |
| `Venta` | back-relation `devoluciones` | C8 |
| `VentaLinea` | back-relation `devolucionLineas` | C8 |
| `TurnoCaja` | back-relations `devoluciones`, `movimientosCaja` | Arqueo (§6.6, §6.7) |
| `Usuario` | back-relations `movimientosStock`, `recuentos`, `devoluciones`, `movimientosCaja` | Prisma |
| `AccionAuditoria` | `+ devolver`, `+ recuento`, `+ ajustar_stock`, `+ vender_reservado` al **final** del enum | Auditoría legible (E1 F11 aprendió a no reutilizar `editar`) |
| `Correlativo` | claves nuevas `devolucion_{año}` | Folio `D-2026-00001` |

### 5.3 Migración

Una sola migración `e2_inventario`. Semilla idempotente en `prisma/seed.ts`: las cuatro ubicaciones (`mostrador` esVenta, `bodega` publicable). **No** enciende `controlaStock` en ningún producto: eso lo hace el primer recuento (M5).

---

## 6. Reglas de negocio

Las reglas puras viven en `packages/dominio/src/stock.ts` con tests desde el primer commit; la transacción vive en `apps/api`.

### 6.1 Registrar un movimiento (M1)

`registrarMovimiento(tx, { productoId, ubicacionId, cantidad, motivo, referenciaTipo?, referenciaId?, nota?, usuarioId })`:

1. `cantidad ≠ 0`; `nota` obligatoria si el motivo es `ajuste`, `merma`, `compra` o `traslado` (`validarMovimientoStock` en el dominio → `CANTIDAD_INVALIDA` / `NOTA_REQUERIDA`).
2. `SELECT … FOR UPDATE` sobre `StockActual(productoId, ubicacionId)`; si no existe la fila, se crea con 0 (con `INSERT … ON DUPLICATE KEY UPDATE cantidad = cantidad` para no perder la carrera de creación).
3. `INSERT movimiento_stock`.
4. `UPDATE stock_actual SET cantidad = cantidad + :cantidad` sobre la fila bloqueada.
5. Devuelve `{ movimientoId, cantidadAnterior, cantidadNueva }`.

**Orden de candados** cuando el movimiento ocurre dentro de otra transacción (venta, devolución): primero `Cliente` (E4, si hay monedero), después **`StockActual` en orden ascendente de `(productoId, ubicacionId)`**, y **`Correlativo` siempre al final**. Es el orden fijo anti-interbloqueo de E4 §6.2 extendido.

### 6.2 Stock disponible y alertas

- `stock(producto, ubicacion) = stock_actual.cantidad` (equivale a `SUM(movimiento_stock.cantidad)`; un job nocturno o un endpoint admin `POST /stock/verificar` recalcula la suma y reporta diferencias — no las corrige solo).
- `stockTotal(producto) = SUM sobre ubicaciones activas`.
- **Estados** (`estadoStock` en el dominio, puro): `sin_control` (controlaStock false) · `negativo` (< 0 en alguna ubicación) · `quiebre` (total = 0) · `bajo` (0 < total ≤ stockMinimo) · `ok`.
- El mostrador muestra el total y el de la ubicación de venta; la ficha (V5) muestra el desglose por ubicación (cierra el «Agendado (E2)» de R-009).

### 6.3 La venta descuenta (C3) — y nunca bloquea (M2)

Dentro de la transacción de `POST /ventas`, por cada línea con `productoId` cuyo producto tenga `controlaStock = true`:

- `registrarMovimiento(-cantidad, motivo 'venta', referenciaTipo 'venta', referenciaId = venta.id, ubicacion = la única con esVenta)`.
- Si el resultado deja la ubicación en negativo, la venta **igual se registra** y la respuesta trae `advertencias: [{ tipo: 'STOCK_NEGATIVO', productoId, ubicacion, cantidadNueva }]` (mismo vehículo que las advertencias de precio congelado de E1). El mostrador lo muestra un momento; el panel de alertas lo lista hasta que un recuento o ajuste lo cierre.
- Líneas sin `productoId` (ítem suelto) o con `controlaStock = false` no tocan el libro.
- **Cola offline (P8):** las ventas encoladas descuentan cuando llegan al servidor, en el orden en que llegan. Es aceptable: el stock físico ya salió; el libro lo refleja con retraso.
- **Anulación** (`POST /ventas/:id/anular`, sigue exigiendo turno abierto): por cada movimiento `venta` de esa venta, un movimiento **positivo** `devolucion` con la misma referencia. El original no se toca (P9).

### 6.4 Recuento guiado (C4)

1. `POST /recuentos` `{ ubicacionId, categoriaId?, productoIds?, nombre }` (encargado): crea el recuento y sus líneas con `cantidadSistema` = stock actual de cada producto en esa ubicación. Con `categoriaId` incluye todos los productos **activos** del subárbol; con `productoIds`, esos. Tope 500 líneas por recuento (una tanda: `01` §9 «por categoría y por tanda»).
2. `PATCH /recuentos/:id/lineas/:productoId` `{ cantidadContada }`: guarda el conteo; se puede corregir mientras el recuento esté abierto. Se pueden **agregar** productos escaneados que no estaban en el alcance (`POST /recuentos/:id/lineas`).
3. `POST /recuentos/:id/cerrar` (transacción): por cada línea **contada**, `diferencia = contada − stock actual en ese momento` (no el snapshot: pudo haber ventas durante el conteo). Si `diferencia ≠ 0`: movimiento `recuento_inicial` si el producto no tenía `controlaStock`, `ajuste` si ya lo tenía, con `referenciaTipo 'recuento'`. Luego **`controlaStock = true`** en todos los productos contados (M5) y `Auditoria` `recuento` con el resumen `{ lineas, conDiferencia, sumaAbs }`. Líneas sin contar **no** cambian nada ni encienden el control.
4. `POST /recuentos/:id/descartar` con nota: no genera movimientos.
5. **Criterio «dos recuentos consecutivos que cuadran»** (`01` §9): `GET /recuentos?ubicacionId&categoriaId` muestra por recuento cerrado el porcentaje de líneas sin diferencia. Es un indicador, no un bloqueo.

### 6.5 Ajuste, merma, ingreso y traslado (C5)

`POST /stock/movimientos` (encargado) `{ productoId, ubicacionId, cantidad, motivo: 'ajuste'|'merma'|'compra', nota }`:
- `merma` y `compra` llevan el signo implícito (merma siempre negativa, compra siempre positiva; el cuerpo trae la cantidad en positivo y el servidor la firma). `ajuste` viene con signo.
- Un ingreso `compra` sobre un producto sin control **lo enciende** (M5) con `Auditoria`.

`POST /stock/traslados` `{ productoId, desdeUbicacionId, hastaUbicacionId, cantidad, nota }`: dos `registrarMovimiento` en la misma transacción (`−` en origen, `+` en destino), `referenciaTipo 'traslado'`, `referenciaId` = un cuid generado. Origen ≠ destino, cantidad > 0. Si el origen queda negativo, se acepta y se advierte (M2).

### 6.6 Devoluciones (C8)

`POST /ventas/:id/devoluciones` (encargado, exige **turno abierto del usuario**; la venta puede ser de cualquier turno, incluso cerrado):

- Cuerpo `{ lineas: [{ ventaLineaId, cantidad, reponeStock }], medio, motivo }`. `cantidad ≤ vendida − ya devuelta` por línea (`validarDevolucion` puro → `CANTIDAD_EXCEDE_VENTA`). `montoLinea = cantidad × precioUnitario − descuento proporcional`; `monto = Σ montoLinea`; el descuento global de la venta se prorratea por línea.
- `medio`: `efectivo` (sale de la caja del turno abierto y **resta en el arqueo**), o `monedero` si la venta tiene `clienteId` (genera `MovimientoMonedero` `devolucion` positivo, E4 §6.4). Otros medios (débito, transferencia) se registran como `otro` con nota: el reembolso ocurre fuera del sistema y el arqueo no lo toca.
- Stock: por línea con `reponeStock = true` y producto con `controlaStock`, movimiento `devolucion` positivo en la ubicación de venta. Con `reponeStock = false` (producto dañado) **no hay movimiento**: el `venta` original ya lo descontó y el producto no vuelve a la estantería; la línea lo deja anotado para trazabilidad.
- Folio `D-{año}-{#####}` por `Correlativo` `FOR UPDATE` al final de la transacción.
- Una venta **anulada** no admite devoluciones (`409 VENTA_ANULADA`). Una venta con devoluciones **no** se puede anular (`409 VENTA_CON_DEVOLUCIONES`): el camino es devolver el resto.
- `Auditoria` `devolver` con `{ folioVenta, folioDevolucion, monto, medio }`.

### 6.7 Movimientos de caja (C9)

`POST /turnos/:id/movimientos-caja` (encargado, turno abierto propio o de cualquiera si es admin) `{ tipo, monto > 0, nota }`. Sin nota → `422 NOTA_REQUERIDA`.

**Arqueo (`calcularArqueo`, `packages/dominio/src/venta.ts`) gana dos términos:**

```
esperadoEfectivo = montoApertura
                 + Σ pagos efectivo de ventas completadas del turno
                 − Σ devoluciones en efectivo del turno
                 + Σ ingresos de caja − Σ retiros de caja
```

Los tests de arqueo de E1 se extienden; ninguno existente cambia de resultado cuando devoluciones y movimientos son cero.

### 6.8 Espejo del stock del canal (C7, R-011)

El pull de catálogo de E1 (`importador.ts`, completo e incremental) ya lee cada producto/variación de Woo. E2 le agrega: guardar `stock_quantity` → `ProductoCanal.stockCanal`, `manage_stock` → `manejaStockCanal`, y la hora → `stockCanalEn`. **Es lectura pura** (P2). Entra al hash de sync para que el incremental lo refresque.

Uso:
- Ficha del producto (V5): «onplaygames: 0 · hace 12 min».
- Mostrador, al agregar al carrito un producto con `stockCanal ≤ umbral` (`01` §14 D-E2-3, default 1): aviso no bloqueante «Último en la web (onplaygames) · sync hace 12 min». Es la primera defensa contra R-011 hasta que E3 cierre el ciclo.
- Panel de alertas: lista «último en la web» junto a quiebres y negativos.

`stockCanal` **nunca** se suma al stock propio ni se usa para descontar (M6).

### 6.9 Prioridad entre canales (decisión del dueño, 2026-09-02)

> **Regla de negocio.** La venta física en la tienda (Merced) tiene prioridad sobre la venta online. **Excepción:** un pedido online **con el pago realizado** tiene prioridad sobre la venta física.

Cómo se aplica en E2, con el espejo de §6.8 como única fuente sobre la web:

- WooCommerce descuenta `stock_quantity` cuando el pedido pasa a `processing` (pagado). Los pedidos `pending`/`on-hold` (sin pago) **no** lo descuentan. Por lo tanto `stockCanal` **ya refleja solo los pedidos pagados**, que son exactamente los que ganan. Los pedidos sin pagar no se ven, y no deben verse: la tienda física les gana.
- **Conflicto probable** = el producto controla stock, `manejaStockCanal = true` en algún canal, `stockCanal ≤ 0` en ese canal y el stock propio en la ubicación de venta es `≥ 1`. Lectura: la unidad que está en la mano del cliente probablemente ya la compró y pagó alguien en la web.
- En ese caso **el cobro se detiene** con un diálogo: «Este producto figura agotado en onplaygames (dato de hace N min). Probablemente lo compró y pagó un cliente online, y ese pedido tiene prioridad.» Opciones: **Quitar de la venta** (default) o **Vender igual**, solo `encargado`, con nota obligatoria; queda en `Auditoria` con acción `vender_reservado` y el detalle `{ productoId, stockCanal, stockCanalEn, stockPropio }`.
- **Sin conexión** se aplica la misma regla con `stockCanalMin` del caché offline (§7.3): el dato es más viejo, el diálogo lo dice, y la nota del encargado viaja en la venta encolada.
- **La decisión D-E2-1 se mantiene para el otro caso:** stock propio en 0 o negativo **sin** conflicto con la web no bloquea nada, solo advierte (`STOCK_NEGATIVO`). Bloquear ahí sería castigar un error de conteo.
- **Lo que E2 no puede saber:** si el espejo está viejo (hasta 30 min con el cron incremental) o si el pedido pagado ya fue despachado. Por eso el bloqueo tiene salida de encargado. E3c lo vuelve exacto: con los pedidos ingeridos en el libro, «reservado» deja de ser probable y pasa a ser un hecho (`06` §8.4).

---

## 7. API

Todas bajo `/api/v1`. Roles como en E1: `vendedor` < `encargado` < `admin`.

### 7.1 Ubicaciones y stock

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| `GET` | `/ubicaciones` | vendedor | Activas, con `esVenta`/`publicable` |
| `POST` | `/ubicaciones` · `PATCH /ubicaciones/:id` | encargado | Alta y edición; `esVenta` solo puede estar en una; desactivar exige stock 0 en ella |
| `GET` | `/stock?ubicacionId&estado&categoriaId&q&pagina` | vendedor | Stock actual paginado; `estado` = `negativo|quiebre|bajo|ok|sin_control` |
| `GET` | `/stock/alertas` | encargado | Negativos, quiebres, bajos, «último en la web»; conteos por tipo |
| `GET` | `/productos/:id/stock` | vendedor | Desglose por ubicación + espejo del canal |
| `GET` | `/productos/:id/movimientos?pagina` | encargado | Kardex |
| `POST` | `/stock/movimientos` | encargado | §6.5 |
| `POST` | `/stock/traslados` | encargado | §6.5 |
| `GET` | `/stock/export.csv?ubicacionId` | encargado | `sku,nombre,ubicacion,cantidad,stockMinimo` |
| `POST` | `/stock/verificar` | admin | Compara `stock_actual` con `SUM(movimientos)`; solo reporta |
| `PATCH` | `/productos/:id` | encargado | Gana `stockMinimo` y `controlaStock` (apagar exige `nota`, auditado) |

### 7.2 Recuentos

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/recuentos?ubicacionId&estado` · `GET /recuentos/:id` | encargado |
| `POST` | `/recuentos` | encargado |
| `POST` | `/recuentos/:id/lineas` · `PATCH /recuentos/:id/lineas/:productoId` | encargado |
| `POST` | `/recuentos/:id/cerrar` · `POST /recuentos/:id/descartar` | encargado |

### 7.3 Ventas, devoluciones y caja

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| `POST` | `/ventas` | vendedor | Sin cambio de contrato; la respuesta puede traer `advertencias` `STOCK_NEGATIVO` |
| `POST` | `/ventas/:id/devoluciones` | encargado | §6.6 |
| `GET` | `/ventas/:id/devoluciones` · `GET /devoluciones?desde&hasta&pagina` | encargado | |
| `POST` | `/turnos/:id/movimientos-caja` · `GET /turnos/:id/movimientos-caja` | encargado | §6.7 |
| `GET` | `/turnos/:id/resumen` | vendedor | Gana `devolucionesEfectivo`, `ingresosCaja`, `retirosCaja` |

`GET /productos`, `GET /productos/buscar` y `catalogo-offline` ganan `stockTotal` y `stockVenta` (nullable cuando `controlaStock=false`), y `stockCanalMin` (el menor `stockCanal` entre los canales que manejan stock). El caché offline versiona su esquema (R-006) a 3.

---

## 8. Pantallas

Lenguaje visual de `05` — Cristal OnPlay. Continúa la numeración: `V19`–`V24`. Las pantallas de encargado viven en `/admin/*`.

### V19 — Stock *(encargado)* `/admin/stock`
Tabla o grilla (conmutador de R-009) con producto, ubicación, cantidad, mínimo y estado con insignia (`negativo` peligro, `quiebre` peligro, `bajo` alerta). Filtros por ubicación, estado, categoría y texto. Acciones por fila: Ajustar, Merma, Ingresar, Trasladar (abre V21). Botón Exportar CSV. Contador de alertas arriba, con enlace a V22.

### V20 — Recuento *(encargado)* `/admin/recuentos` y `/admin/recuentos/:id`
Lista de recuentos con estado y «% cuadrado». Nuevo recuento: ubicación + categoría (o productos a mano) + nombre. Dentro: buscador con foco permanente (I2 de `05`) que **acepta el escáner**; cada lectura suma 1 a la línea (o la crea si no estaba en el alcance); lista con sistema / contado / diferencia; barra de progreso «contados N de M». Cerrar muestra el resumen «N con diferencia, se encenderá el control de stock en M productos» y pide confirmación.

### V21 — Diálogo de movimiento de stock *(encargado)*
Motivo (Ajuste / Merma / Ingreso / Traslado), ubicación (y destino en traslado), cantidad, nota obligatoria, vista previa «pasará de 3 a 1 en mostrador». Reutiliza la estructura de V17 de E4.

### V22 — Alertas de stock *(encargado)* `/admin/stock/alertas`
Cuatro secciones: Negativos, Quiebres, Bajo mínimo, Último en la web. Cada fila con acción directa (Recontar → V20 con ese producto; Ajustar → V21).

### V23 — Devolución *(encargado)* desde V7 admin Ventas y desde la ficha de cliente
Sobre una venta: líneas con cantidad vendida, ya devuelta y a devolver; casilla «repone stock» por línea; medio de devolución (efectivo / monedero si hay cliente / otro); motivo obligatorio; total a devolver. Aviso cuando el turno de la venta está cerrado: «El dinero sale de tu caja abierta, no del turno original». Confirmación con folio `D-…`. Botón «Imprimir» B/N como el cierre de E1.

### V24 — Movimiento de caja *(encargado)* desde el Mostrador (menú del turno) y V8 Turnos
Ingreso / Retiro, monto, nota. V8 muestra los movimientos del turno y el arqueo con los dos términos nuevos.

### Cambios en pantallas existentes
- **V2 Mostrador:** en resultados, grilla y lista aparece «stock: 3» (o nada si no controla); al agregar, aviso no bloqueante «Último en la web» (§6.8); al cobrar, si hay conflicto probable con un pedido web pagado, diálogo de §6.9 (Quitar / Vender igual solo encargado con nota); tras cobrar, «Stock quedó en −1: avisa al encargado» si vino `STOCK_NEGATIVO`.
- **V5 Productos:** columna Stock deja de decir «cant. E2» y muestra el total con insignia de estado; la ficha muestra el desglose por ubicación, el espejo del canal y el botón «Ver movimientos».
- **V7 admin Ventas:** botón «Devolver» (siempre) junto a «Anular» (solo turno abierto).
- **V8 Turnos:** arqueo con devoluciones y movimientos de caja.

---

## 9. Plan de implementación

### Fase 0 — Decisiones (el dueño ratifica o cambia; defaults propuestos)

| # | Decisión | Default propuesto | Alternativa |
|---|---|---|---|
| D-E2-1 | ¿La venta del mostrador bloquea cuando no hay stock? | **Ratificada con matiz (2026-09-02):** stock propio en 0 o negativo **no bloquea, advierte** (M2). **Sí se detiene** cuando el espejo del canal dice que la web ya vendió y cobró la última unidad (§6.9): salida solo de encargado con nota, auditada | — |
| D-E2-2 | ¿De qué ubicación descuenta la venta? | **`mostrador`** (única `esVenta`) | Elegir por línea (más clics, poco valor) |
| D-E2-3 | Umbral de «último en la web» | **`stockCanal = 1`** avisa (no bloquea); **`stockCanal ≤ 0`** con stock propio detiene el cobro (§6.9) | Avisar desde 2 |
| D-E2-4 | ¿Qué ubicación publica E3 después? | **`bodega`** `publicable` (recomendación de `06` §4) | `mostrador` |
| D-E2-5 | ¿Devolución en medio distinto de efectivo/monedero? | **Se registra como `otro` con nota; el arqueo no lo toca** | Bloquear hasta E6 |
| D-E2-6 | ¿Construir en local ahora? | **Sí** (mismo criterio que E4 F0: los 7 días de E1 en producción son precondición para *desplegar* E2, no para escribirla) | Esperar |
| D-E2-7 | Orden de activación de `controlaStock` | **Snacks → sellado → accesorios → juegos de mesa; singles al final o nunca** (`01` §9) | Todo de una vez (no recomendado) |

### Fase 1 — Cimientos
Migración `e2_inventario` (§5), semilla de ubicaciones, dominio `stock.ts` (`validarMovimientoStock`, `estadoStock`, `aplicarMovimiento` puro), `devolucion.ts` (`validarDevolucion`, prorrateo), `calcularArqueo` extendido; tests. **Nada visible aún.**

### Fase 2 — Libro y venta (C1, C2, C3)
`registrarMovimiento` transaccional con `FOR UPDATE`; rutas de ubicaciones y stock; `POST /ventas` descuenta y anular repone; `advertencias STOCK_NEGATIVO`; stock en `GET /productos`, `buscar` y `catalogo-offline` (esquema 3); V5 muestra desglose; Mostrador muestra «stock: N». **Test de concurrencia obligatorio:** dos ventas simultáneas de la última unidad → dos 201, libro en −1, una advertencia, `stock_actual` = SUM.

### Fase 3 — Recuento y movimientos manuales (C4, C5)
Rutas de recuentos, movimientos y traslados; V20, V21, V19 básico. Criterio: un recuento de snacks enciende `controlaStock` solo en lo contado.

### Fase 4 — Alertas y espejo del canal (C6, C7, C10)
`stockCanal` en el importador (hash + incremental); `GET /stock/alertas`; V22; aviso «último en la web» en el cobro; kardex y CSV.

### Fase 5 — Devoluciones y caja (C8, C9)
Rutas, folio `D-`, arqueo extendido, V23, V24, cambios en V7/V8. Criterio: una devolución en efectivo sobre una venta de turno cerrado cuadra el arqueo del turno abierto.

### Fase 6 — Cierre
README y CLAUDE.md al día; `docs/08` con lo aprendido; recuento real de snacks y sellado con el encargado (criterio «listo» de `01` §9: dos recuentos consecutivos que cuadran) — **depende del usuario**, como los criterios de E1.

---

## 10. Criterios de aceptación

1. `SUM(movimiento_stock.cantidad)` = `stock_actual.cantidad` para todo producto/ubicación después de 1.000 movimientos aleatorios concurrentes (test).
2. No existe en el código ningún `UPDATE`/`upsert` de `StockActual` fuera de `registrarMovimiento` (grep en CI/test).
3. Una venta de 2 unidades de un producto con control deja un movimiento `venta −2` con `referenciaId` = la venta; anularla deja `devolucion +2`; el original no cambia.
4. Una venta de un producto **sin** control no genera movimientos.
5. Dos `POST /ventas` simultáneos por la última unidad → ambos 201, `stock_actual = −1`, exactamente una respuesta con `STOCK_NEGATIVO` (la segunda en tomar el candado).
6. Una venta encolada offline descuenta al llegar al servidor con `idempotencyKey` repetida **una sola vez**.
7. Cerrar un recuento con 3 líneas contadas y 2 sin contar enciende `controlaStock` en 3 y genera movimientos solo donde hay diferencia.
8. Un traslado deja dos filas con la misma referencia; si la transacción falla a mitad, no queda ninguna.
9. Merma y compra sin nota → `422 NOTA_REQUERIDA`.
10. `stockCanal` se actualiza en el sync incremental cuando cambia solo el stock en Woo (el hash lo detecta).
11. Devolución parcial de 1 de 3 unidades: `monto` prorratea el descuento global; segunda devolución de 3 → `422 CANTIDAD_EXCEDE_VENTA`.
12. Devolución en efectivo de una venta de turno cerrado resta en el arqueo del turno abierto del encargado, no del original.
13. Retiro de caja de $20.000 con nota: `esperadoEfectivo` baja $20.000; sin nota → 422.
14. Un vendedor no puede crear movimientos, recuentos, devoluciones ni movimientos de caja (403 verificado por curl).
15. `GET /stock/alertas` lista un producto con `stock_actual = −1` como `negativo` y uno con `stockCanal = 1` como «último en la web».
15b. Cobrar un producto con `controlaStock`, stock propio 1 y `stockCanal = 0` (canal con `manejaStockCanal`) como vendedor → `409 RESERVADO_WEB` con `{ canalId, stockCanal, stockCanalEn }`; como encargado con `forzarReservado: { nota }` → 201 y `Auditoria` `vender_reservado`. La misma venta encolada offline con la nota → 201 al llegar.
16. La ficha V5 muestra el desglose por ubicación y el espejo del canal con su hora.
17. `npm test` verde; `npm run build` limpio; los tests de arqueo de E1 pasan sin cambios de valor esperado cuando no hay devoluciones ni movimientos.
18. **Depende del usuario:** dos recuentos consecutivos de snacks y sellado que cuadren (`01` §9).

**Estado al cierre de la Fase 6 (2026-09-02):** 1 ✅ (1.000 movimientos concurrentes en 3 s, `POST /stock/verificar` sin diferencias) · 2 ✅ (grep: ninguna escritura de `StockActual` fuera de `libro.ts`) · 3 ✅ · 4 ✅ · 5 ✅ · 6 ✅ (misma `idempotencyKey` dos veces → un descuento) · 7 ✅ · 8 ✅ · 9 ✅ · 10 ✅ (el hash incluye `stockCanal`; corrida real 467/469) · 11 ✅ · 12 ✅ · 13 ✅ · 14 ✅ · 15 ✅ · 15b ✅ · 16 ✅ · 17 ✅ (103 tests, build limpio) · **18 pendiente del dueño**.

---

## 11. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| RI1 | El primer recuento se hace mal y el libro nace con basura | Alto | Recuento por tanda chica (snacks primero); `recuento_inicial` se puede corregir con otro recuento; nada se borra (P9) |
| RI2 | El personal ignora las alertas de negativo y el libro se degrada | Medio | Contador de alertas visible en la barra del backoffice; el criterio «listo» exige dos recuentos que cuadren |
| RI3 | El espejo del canal se lee como stock propio | Medio | M6; etiqueta siempre «en la web», nunca «stock» a secas; no entra a ninguna suma |
| RI4 | Interbloqueo entre venta con monedero y stock | Alto | Orden fijo de candados §6.1: Cliente → StockActual (ordenado) → Correlativo; test de concurrencia de Fase 2 |
| RI5 | Devoluciones usadas para sacar efectivo de la caja | Medio | Solo encargado, motivo obligatorio, folio, auditoría, visible en V8 y en el arqueo |
| RI6 | E2 se amplía hacia E3 («ya que leemos el stock de Woo, escribámoslo») | Crítico (R4) | Este documento §2: E2 no escribe en canales; `SYNC_SOLO_LECTURA` sigue |

---

## 12. Huecos en los contratos previos que esta etapa cierra

| # | Hueco | Origen | Resolución |
|---|---|---|---|
| HE1 | «Una venta de turno cerrado no se anula; se resuelve con devolución (E2)» sin definir la devolución | `02` §5.5 | §6.6 |
| HE2 | «La entidad `movimiento_caja` llega en E2» | `02` §5.5 | §5.1, §6.7 |
| HE3 | `referencia_tipo` de `movimiento_stock` descrito como «venta, OC o ajuste» | `01` §6.2, `06` §5 | Lista abierta en §5.1 incluyendo `pedido_canal` para E3c |
| HE4 | `Ubicacion.publicable` exigido por E3 sin definir en E2 | `06` §4 | §5.1, D-E2-4 |
| HE5 | Columna Stock de V5 dice «cant. E2» | `08` R-009 | §8 cambios en V5 |
| HE6 | Sobreventa web/mostrador sin mecanismo ni regla de prioridad | `08` R-011 | Regla del dueño en §6.9 (físico gana; online pagado gana); aviso y bloqueo con salida de encargado ahora; gate + excepciones en E3c (`06` §8.4) |

---

## 13. Lo que habilita esta etapa

- **E3b** (push de stock): `stock_actual` por ubicación, `Ubicacion.publicable`, `S_maestro` calculable, motivos `venta_online`/`ajuste`/`devolucion` listos, `referencia_tipo 'pedido_canal'` reservado.
- **E3c** (pedidos web): el libro acepta el descuento del pedido y la cola de excepciones de onplay-erp encaja sobre `registrarMovimiento` sin cambiar el modelo.
- **E6** (compras y márgenes): el motivo `compra` ya existe; E6 le agrega la OC como referencia y el costo por migración.
- **Operación diaria:** recuentos por tanda, alertas y devoluciones con folio.
