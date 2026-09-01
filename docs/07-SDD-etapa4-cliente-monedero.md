# SDD — Etapa 4: Cliente único y monedero
## Especificación ejecutable

| | |
|---|---|
| **Proyecto** | `onplay-core` |
| **Etapa** | 4 de 6 |
| **Versión** | 1.1 |
| **Revisión 1.1** | Cierra RC2: cargar saldo con dinero es una venta. Corrige el bloqueo de concurrencia, el endpoint de vinculación y los roles del historial |
| **Fecha** | 25 de agosto de 2026 |
| **Documento padre** | `docs/01-SDD-general.md` |
| **Precedente** | `docs/02-SDD-etapa1-mostrador.md` |
| **Diseño visual** | `docs/05-SDD-diseno-interfaz-etapa1.md` — Cristal OnPlay |
| **Destinatario** | Claude Code |

> **Dependencia:** solo la Etapa 1. **No requiere inventario ni sincronización** (`01` §9.1). Si el negocio prioriza el monedero antes que el stock, esta etapa se puede construir inmediatamente después de E1.
>
> **E4 no abre el candado de E1.** `SYNC_SOLO_LECTURA` permanece en `true`: la vinculación con los canales (§7.3) es estrictamente de lectura, y el `woo-client` debe seguir lanzando excepción ante cualquier `POST`, `PUT` o `DELETE`. Abrirlo es una decisión de la Etapa 3.

---

## 1. Qué resuelve esta etapa

**Objetivo O5:** que un cliente sea el mismo cliente compre donde compre, con saldo y crédito propios.

Hoy hay tres bases de clientes que no se conocen: los usuarios de onplay.cl, los de onplaygames.cl, y la nada que existe en el mostrador. El mismo cliente que juega el torneo del viernes, compra un display el sábado en línea y unos singles el martes en la tienda es tres personas distintas para el sistema.

Y hay una necesidad concreta que nunca se resolvió: **el premio de un torneo es saldo**. Hoy se anota en un cuaderno o se recuerda de memoria.

### 1.1 Esta etapa reemplaza dos intentos anteriores

La línea base (`00` §3.2 y §4.2) encontró **dos monederos instalados y desactivados**, uno en cada sitio:

- `WooCommerce Customer Wallet 1.0.0` en onplay.cl
- `OnplayWallet 1.0.0` (desarrollo propio) en onplaygames.cl

Ninguno quedó operativo, y cada uno habría creado un saldo distinto en cada sitio — que es el problema, no la solución. **Al cerrar esta etapa los dos se desinstalan**, previa verificación de si dejaron saldos reales (Fase 6). Es parte de los criterios de aceptación.

## 2. Qué NO hace esta etapa

- **No es un programa de puntos ni de fidelización.** Saldo en pesos, no puntos que se convierten. Si más adelante se quiere acumulación por compra, es otra etapa.
- **No cobra online con el monedero.** El saldo se gasta **solo en el mostrador**. Habilitar el monedero en el checkout de WooCommerce exige un plugin en cada sitio y es una etapa aparte.
- **No emite documentos tributarios.** La emisión al SII está fuera del alcance del proyecto (`01` §2.3).
- **No tiene portal de cliente.** Nadie consulta su saldo desde el sitio: lo consulta preguntando en la tienda. Un portal implica autenticación de clientes, que no está en el alcance.
- **No importa el historial de compras pasadas** de los dos WooCommerce. Solo vincula identidades desde la fecha de puesta en marcha. Traer años de pedidos es un proyecto de migración con su propio riesgo.
- **No maneja tarjetas de regalo al portador.** El saldo está siempre asociado a un cliente identificado.

---

## 3. Alcance funcional

| # | Funcionalidad | Prioridad |
|---|---|---|
| C1 | Alta de cliente en dos campos desde el mostrador | P0 |
| C2 | Buscador de cliente por nombre, RUT, teléfono o correo | P0 |
| C3 | Asociar un cliente a una venta | P0 |
| C4 | Libro de monedero: carga, consumo, devolución, ajuste, premio | P0 |
| C5 | Pago con saldo como medio de pago en el cobro | P0 |
| C6 | Ficha de cliente con saldo e historial consolidado | P0 |
| C7 | Vinculación con las cuentas de usuario de ambos WooCommerce | P1 |
| C8 | Crédito con límite, por cliente y con autorización | P1 |
| C9 | Fusión asistida de clientes duplicados | P1 |

---

## 4. Principios de esta etapa

**M1 — El saldo es una suma, nunca un campo.** `saldo = SUM(movimiento_monedero.monto)`. No existe una columna `saldo` que se actualice. Es el principio P5 (`01` §3) del SDD general, y aquí no es una preferencia de estilo: un campo que se sobrescribe pierde el rastro de cómo llegó a ese número, y el número es plata.

**M2 — Identificar a un cliente no puede costar tiempo de mostrador.** Dar de alta a alguien son dos campos y un Enter. Todo lo demás —RUT, correo, teléfono— se completa después, o nunca.

**M3 — Vender sin cliente sigue siendo lo normal.** La inmensa mayoría de las ventas son anónimas. El cliente es opcional en toda la etapa; si asociarlo se vuelve un paso obligatorio, el mostrador se frena.

**M4 — Nada se borra.** Una carga equivocada se compensa con un movimiento inverso, no se elimina. Anular una venta pagada con saldo devuelve el saldo con un movimiento nuevo.

**M5 — El saldo no se toca sin dejar nombre.** Toda carga, ajuste o devolución lleva el usuario que la hizo y un motivo. Sin excepción.

---

## 5. Modelo de datos

> **Los bloques marcados con `// ... campos de 02 §4.1 ...` son *diferencias*, no modelos completos.** El esquema resultante contiene los campos de E1 **más** los aquí listados. La Fase 1 entrega el `schema.prisma` consolidado, y ese es el que manda.

### 5.1 Entidades nuevas

```prisma
model Cliente {
  id            String    @id @default(cuid())
  nombre        String                        // lo único obligatorio (M2)
  rut           String?   @unique             // normalizado sin puntos, con guion: "12345678-9"
  email         String?
  telefono      String?
  notas         String?   @db.Text
  activo        Boolean   @default(true)

  // Crédito: apagado por defecto. Encenderlo es una decisión por cliente (C8).
  permiteCredito Boolean  @default(false)
  limiteCredito  Int      @default(0)         // CLP. Solo aplica si permiteCredito

  // Nombre normalizado (minúsculas, sin tildes, sin puntuación) para búsqueda
  // por prefijo. MATCH...AGAINST en modo natural NO hace coincidencia parcial
  // y con innodb_ft_min_token_size=3 ignora tokens de 1-2 caracteres:
  // escribir "Ped" no encontraría "Pedro", y el criterio 2 exige que sí.
  nombreBusqueda String

  creadoEn      DateTime  @default(now())
  actualizadoEn DateTime  @updatedAt

  canales       ClienteCanal[]
  movimientos   MovimientoMonedero[]
  ventas        Venta[]
  pedidos       PedidoCanal[]          // solo si E3 existe; ver §7.2

  @@index([nombreBusqueda])
  @@index([telefono])
}

// Mismo patrón que ProductoCanal (02 §4.1): la identidad externa se mapea,
// no se migra. Un cliente puede tener cuenta en los dos sitios, en uno, o
// en ninguno — quien solo compra en la tienda no tiene ClienteCanal.
model ClienteCanal {
  id            String   @id @default(cuid())
  clienteId     String
  cliente       Cliente  @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  canalId       String
  canal         Canal    @relation(fields: [canalId], references: [id])
  externoUserId Int
  externoEmail  String?
  vinculadoEn   DateTime @default(now())
  desvinculadoEn DateTime?             // desvincular NO borra la fila (M4)

  @@unique([canalId, externoUserId])
  @@unique([clienteId, canalId])
  @@index([clienteId])
}

enum MotivoMonedero {
  carga           // el cliente entrega dinero y queda como saldo
  consumo         // pagó una venta con saldo
  devolucion      // se anuló una venta pagada con saldo
  premio_evento   // premio de torneo (lo usará E5)
  ajuste          // corrección con nota obligatoria
  reverso_carga   // se deshace una carga equivocada
}

// Libro append-only. El saldo es SUM(monto). Nunca se actualiza ni se borra
// una fila: una corrección es una fila nueva de signo contrario (M1, M4).
model MovimientoMonedero {
  id             String          @id @default(cuid())
  clienteId      String
  cliente        Cliente         @relation(fields: [clienteId], references: [id])
  monto          Int                             // CON SIGNO: + entra, − sale
  motivo         MotivoMonedero
  referenciaTipo String?                         // "venta" | "movimiento_monedero"
  referenciaId   String?
  nota           String?         @db.Text
  usuarioId      String
  usuario        Usuario         @relation(fields: [usuarioId], references: [id])
  creadoEn       DateTime        @default(now())

  @@index([clienteId, creadoEn])
  @@index([referenciaTipo, referenciaId])
}
```

### 5.2 Cambios sobre entidades de E1

```prisma
model Venta {
  // ... campos de 02 §4.1 ...

  clienteId     String?
  cliente       Cliente?  @relation(fields: [clienteId], references: [id])

  // clienteNombre SE MANTIENE. Es el texto libre de E1 y guarda el nombre
  // tal como se escribió en su momento. No se migra a Cliente de forma
  // automática: "Pedro" no identifica a nadie.
  clienteNombre String?

  @@index([clienteId])
}

enum MedioPago {
  efectivo
  debito
  credito
  transferencia
  mercadopago
  otro
  monedero        // ← se agrega en esta etapa (previsto en 01 §6.2)
}
```

### 5.3 Back-relations en modelos de E1

Prisma exige la relación declarada en ambos lados:

```prisma
model Usuario {
  // ... campos y relaciones de 02 §4.1 ...
  movimientosMonedero  MovimientoMonedero[]
}

model Canal {
  // ... campos y relaciones de 02 §4.1 ...
  clientes             ClienteCanal[]
}
```

### 5.4 Migración

`ALTER TABLE` para añadir `clienteId` y el valor de enum. Ninguna venta existente se modifica.

> **`monedero` va al FINAL del enum, después de `otro`.** En MySQL 8 añadir un valor de enum es una operación instantánea *solo si se añade al final*; insertarlo en medio cambia la representación ordinal y fuerza una copia de la tabla. El orden es gratis de elegir y el rendimiento no.

---

## 6. Reglas de negocio

### 6.1 Saldo

```
saldo(cliente) = SUM(movimiento_monedero.monto WHERE clienteId = cliente)
```

Se calcula con una consulta agregada indexada por `clienteId`. **No se materializa** en la Etapa 4: con el volumen de esta tienda —cientos de clientes, decenas de movimientos por cliente— la suma es instantánea. Si algún día deja de serlo, se añade una tabla de resumen actualizada dentro de la misma transacción, nunca un campo suelto.

### 6.2 Pagar con saldo

Es la operación delicada de la etapa: dos personas cobrando a la vez al mismo cliente no pueden gastar el mismo saldo dos veces.

Dentro de la **misma transacción** de `POST /ventas` (`02` §5.4):

1. `SELECT id FROM Cliente WHERE id = ? FOR UPDATE` — **se bloquea la fila del cliente, no el rango del libro.** Bloquear `movimiento_monedero` no sirve: si el cliente no tiene movimientos no hay filas que bloquear, y solo el gap lock de InnoDB en REPEATABLE READ salvaría el caso — desapareciendo si alguien configura READ COMMITTED. El test de concurrencia pasaría en local y fallaría en producción. Bloquear la fila `Cliente` es determinista, funciona con cero movimientos en cualquier nivel de aislamiento, y de paso serializa los cambios de `limiteCredito`.
2. Calcular el saldo.
3. Validar el tope:
   - Sin crédito: `monto <= saldo`. Si no → `422 SALDO_INSUFICIENTE` con `{ saldo, solicitado, falta }`.
   - Con crédito: `monto <= saldo + limiteCredito`. Si no → `422 LIMITE_CREDITO_EXCEDIDO`.
4. Insertar el `MovimientoMonedero` negativo, motivo `consumo`, con `referenciaTipo = 'venta'` y el id de la venta.
5. La venta se confirma con todos sus pagos, o no se confirma ninguno.

**Orden de adquisición de cerrojos, obligatorio:** `Cliente` primero, `Correlativo` (`02` §5.4, paso 10) **siempre al final**. Sin un orden fijo, dos ventas concurrentes pueden tomarlos en sentido inverso y provocar un interbloqueo.

**Un pago con monedero exige `clienteId` en la venta.** Sin cliente identificado no hay saldo del que descontar. Si llega `medio: "monedero"` sin `clienteId` → `422 CLIENTE_REQUERIDO`.

**El monedero puede ser parte de un pago mixto.** Saldo $3.000 y venta de $11.000: $3.000 de monedero y $8.000 de efectivo. La validación de `02` §5.4 no cambia — `SUM(pagos) === total` sigue siendo la regla.

### 6.3 Cargar saldo ES una venta

**Decisión cerrada.** Cuando un cliente entrega $10.000 en efectivo y se le carga el saldo, ese efectivo entra al cajón. Si la carga viviera fuera del flujo de venta, el arqueo del turno descuadraría en exactamente esa cifra todos los días, y el objetivo O2 —que la caja cuadre— quedaría roto por la etapa que se suponía que no lo tocaba.

Por eso una carga con dinero se registra como una **venta normal** de un producto-servicio:

| Elemento | Valor |
|---|---|
| Producto semilla | `SRV-000001 · Carga de saldo`, `tipo: servicio`, `controlaStock: false` |
| Línea | Cantidad 1, precio = el monto cargado |
| Pago | El medio real: efectivo, débito, transferencia. **Nunca `monedero`** |
| Efecto | La venta genera el `MovimientoMonedero` positivo de motivo `carga` |

Esto exige añadir **`servicio` a `TipoProducto`** (el valor existía en el borrador de `02` §4.1 y se eliminó por no usarse) y sembrar el producto en la migración.

**Cargas sin dinero** —un premio de torneo, un ajuste, un reverso— **no** son ventas: van por `POST /clientes/:id/monedero` y no tocan la caja. La distinción es simple: si entra plata al cajón, es venta; si no, es movimiento.

### 6.4 Anular una venta pagada con saldo

`POST /ventas/:id/anular` (`02` §5.3, rol `encargado`) gana un paso: por cada pago de medio `monedero`, se crea un `MovimientoMonedero` **positivo** de motivo `devolucion`, con `referenciaTipo = 'venta'` y el id de la venta anulada.

**No se borra ni se edita el movimiento original** (M4). El historial del cliente muestra el consumo y su devolución, ambos con fecha y usuario.

**El caso simétrico: anular una venta de carga.** Si se anula una venta del producto `SRV-000001`, se crea un `MovimientoMonedero` **negativo** de motivo `reverso_carga`. Sin esta regla, anular una carga devolvería el efectivo y dejaría el saldo cargado: el cliente se llevaría el dinero y el saldo.

Se mantiene la restricción de E1: **una venta de un turno ya cerrado no se anula**.

**Remedio provisional mientras no exista E2.** Como esta etapa puede construirse antes que el inventario (`01` §9.1), sin este párrafo el saldo consumido en un turno ya cerrado no se recuperaría por ninguna vía: `POST /clientes/:id/monedero` prohíbe el motivo `devolucion`. Hasta que E2 traiga las devoluciones, el encargado usa un `ajuste` positivo **con nota obligatoria que cite el folio de la venta**. Queda en `Auditoria` como cualquier otro ajuste.

### 6.4 Crédito

Apagado por defecto. Encenderlo por cliente exige rol `encargado`, un límite explícito y una nota — queda en `Auditoria`.

Un cliente con saldo negativo aparece marcado en toda la interfaz: en el buscador, en el cobro y en su ficha. **No se le bloquea la venta**; se muestra el número. Decidir si se le fía es del encargado, no del sistema.

### 6.5 RUT

Opcional, pero si se escribe **se valida con módulo 11** y se normaliza a `12345678-9` (sin puntos, con guion, dígito verificador en mayúscula). Un RUT inválido se rechaza en el momento, con el mensaje *"Ese RUT no es válido. Revisa el dígito verificador."*

Es `@unique`: es el único identificador de verdad que existe en Chile, y sirve de ancla para la deduplicación.

### 6.6 Clientes duplicados

La detección corre al crear un cliente y en la vinculación con los canales:

| Coincide | Confianza |
|---|---|
| `rut` idéntico | **Alta** — se avisa en el momento y no se crea el duplicado |
| `email` idéntico | Alta |
| `telefono` idéntico | Media — se propone, no se impone |
| `nombre` normalizado idéntico | Baja — solo se propone en el panel |

La fusión (`POST /clientes/:id/fusionar`, misma forma que la de productos en `02` §6.6) reasigna al sobreviviente los `ClienteCanal`, los `MovimientoMonedero` y las `Venta` del absorbido, y lo marca `activo = false`. **Nunca se borra** (M4) y **nunca es automática**.

> El saldo del absorbido no se "transfiere": sus movimientos pasan a pertenecer al sobreviviente, de modo que la suma da lo correcto sin crear ningún movimiento artificial. Es la ventaja de que el saldo sea una suma y no un campo.

**Esta reasignación es la única excepción documentada a M1.** El comentario del modelo dice que un `MovimientoMonedero` nunca se actualiza, y aquí se actualiza su `clienteId`. Se acepta porque la alternativa —crear movimientos artificiales de traspaso— inventaría plata que nunca se movió. A cambio, la excepción es auditada en detalle: **una fila de `Auditoria` por cada entidad reasignada**, con la lista de ids, no una sola fila que diga "fusión".

**Colisión de canal.** Si ambos clientes tienen un `ClienteCanal` del mismo canal, la reasignación violaría `@@unique([clienteId, canalId])`. Igual que en `02` §6.6: **sobrevive el de `vinculadoEn` más reciente**; el otro se marca con `desvinculadoEn` y no se borra.

---

## 7. API

Base `/api/v1`.

### 7.1 Clientes

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/clientes/buscar?q=` | vendedor | Optimizado para el mostrador. Máx 10. Busca por nombre, RUT, teléfono y correo. **p95 < 200 ms** |
| `GET` | `/clientes` | encargado | Query: `q`, `conSaldo`, `conCredito`, `activo`, `limit`, `cursor` |
| `GET` | `/clientes/:id` | vendedor | Ficha: datos, **saldo calculado**, canales vinculados |
| `POST` | `/clientes` | **vendedor** | Alta. Solo `nombre` es obligatorio (M2) |
| `PATCH` | `/clientes/:id` | encargado | Edición. Cambiar `permiteCredito` o `limiteCredito` exige nota |
| `POST` | `/clientes/:id/fusionar` | encargado | `{ absorbidoId, nota }`. Misma forma que `02` §6.6 |

> **`POST /clientes` es la única escritura de esta etapa permitida a un `vendedor`.** Si dar de alta un cliente exigiera un encargado, en la práctica nadie daría de alta a nadie y la etapa entera no serviría. Un cliente mal escrito se corrige; un cliente que no existe no se recupera.

### 7.2 Monedero

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/clientes/:id/movimientos` | vendedor* | Historial de saldo con saldo corriente |
| `POST` | `/clientes/:id/monedero` | **encargado** | `{ monto, motivo, nota }`. Carga, premio, ajuste o reverso |
| `GET` | `/clientes/:id/compras` | vendedor* | Historial consolidado: ventas del mostrador + pedidos de ambos canales |
| `POST` | `/clientes/:id/desvincular` | encargado | `{ canalId }`. Marca `desvinculadoEn`, **no borra** |

> **\* Vista reducida para el `vendedor`.** `02` §5.3 es taxativo: un vendedor solo consulta ventas de su turno abierto, y el criterio 10 de `02` §10 exige verificarlo por `curl`. Estos dos endpoints tocan ventas de cualquier turno y de cualquier vendedor, así que para el rol `vendedor` devuelven **fecha, total y origen, sin folio, sin nombre del vendedor y sin enlace al detalle**. El `encargado` ve todo. Sin esta restricción, E4 abriría por la puerta lateral algo que E1 cerró a propósito.

**Reglas de `POST /clientes/:id/monedero`:**

- `motivo` no puede ser `consumo` ni `devolucion`: esos los genera el sistema desde una venta, nunca una persona a mano.
- `monto` entero distinto de cero. Positivo en `carga` y `premio_evento`; negativo en `reverso_carga`; con signo libre en `ajuste`.
- **`nota` obligatoria en `ajuste` y `reverso_carga`.** Un movimiento de corrección sin explicación es un agujero en la auditoría.
- Todo movimiento registra en `Auditoria`.

**`GET /clientes/:id/compras`** une dos fuentes: las `Venta` con ese `clienteId`, y los `PedidoCanal` con ese `clienteId`.

> **Depende de dos campos que define la Etapa 3.** `PedidoCanal` necesita `clienteExternoId` (el `customer_id` de WooCommerce) y `clienteId`, resuelto en la ingesta cuando existe un `ClienteCanal` que lo empate. Ambos están en `06` §5.2. Sin ellos la unión solo sería posible por correo, lo que falla con compras de invitado y con quien usa otro correo.
>
> Si E3 aún no está construida, la parte de pedidos viene vacía y la respuesta lo indica con `{ pedidosDisponibles: false }` — la pantalla se degrada, no falla.

### 7.3 Vinculación con los canales (C7)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/sync/:canalId/clientes` | admin | Importa usuarios del canal. `dryRun` por defecto |
| `GET` | `/clientes/candidatos` | encargado | Coincidencias propuestas sin confirmar |
| `POST` | `/clientes/:id/vincular` | encargado | `{ canalId, externoUserId }` |

Lee **`GET /wp-json/wc/v3/customers?per_page=100`**, no `wp/v2/users`. Las claves `ck_`/`cs_` de `02` §11 autentican contra `wc/v3`; `wp/v2/users` exige cookie de sesión o application password de WordPress más la capacidad `list_users`, y no expone el correo a una llamada así. Con `wc/v3/customers` funcionan las mismas claves de solo lectura y el `id` que devuelve **es exactamente** el `externoUserId` que espera `ClienteCanal`.

**Solo lectura sobre el canal**: nunca escribe en WordPress. La regla S1 aplica igual — la simulación muestra qué vincularía y qué crearía, sin tocar nada.

Coincidencia por correo. Sin coincidencia, se propone crear un cliente nuevo, **nunca se crea solo**: importar 200 usuarios de un WordPress mal higienizado a ciegas es cómo se ensucia una base desde el primer día.

---

## 8. Pantallas

Lenguaje visual de `05` — Cristal OnPlay. Continúa la numeración: `V15`–`V18`.

### V15 — Cliente en el cobro *(mostrador)*

En `DialogoCobro` (V3 de `05`), el campo "Nombre del cliente (opcional)" se convierte en un buscador.

- Escribir busca clientes; los resultados muestran nombre, RUT si lo tiene, y **el saldo si es distinto de cero**.
- Elegir uno lo asocia a la venta y, **si tiene saldo, habilita `Monedero` como medio de pago** con el disponible a la vista: `Monedero · $3.000 disponibles`.
- Si no aparece, un botón **"Crear cliente"** abre un diálogo de dos campos —nombre y teléfono— que crea y asocia sin salir del cobro (M2).
- Se puede seguir escribiendo un nombre libre sin crear cliente: eso alimenta `clienteNombre`, como en E1 (M3).
- Saldo negativo: el resultado muestra el número en `--peligro` con la etiqueta `debe $4.200`. No bloquea nada.

**Al elegir `Monedero` como medio**, el monto se precarga con **el menor entre lo que falta por pagar y el saldo disponible**. Es el caso real: alguien con $3.000 de saldo pagando $11.000 quiere usar los $3.000 y el resto en efectivo.

### V16 — Ficha de cliente *(vendedor)*

Encabezado con nombre, datos de contacto y **el saldo en `--t-total`**, con el mismo tratamiento tipográfico que el total del mostrador: tinta, no color. Saldo negativo en `--peligro`.

Tres secciones:

- **Movimientos** — fecha, motivo en castellano (*"Premio de torneo"*, *"Pagó una venta"*), monto con signo, usuario, nota, y el saldo corriente después de cada uno. Cada consumo enlaza a su venta.
- **Compras** — historial consolidado con una insignia de origen: `Tienda`, `onplay.cl`, `onplaygames.cl`.
- **Cuentas vinculadas** — los `ClienteCanal`, con acción para desvincular.

Botón **Cargar saldo** visible solo para `encargado`.

### V17 — Cargar saldo *(encargado)*

Diálogo con el saldo actual arriba, monto, selector de motivo (Carga, Premio de torneo, Ajuste, Reverso) y nota —obligatoria en Ajuste y Reverso—.

**Antes de confirmar se muestra el resultado**: *"El saldo pasará de $3.000 a $13.000."* Un movimiento de plata no se confirma a ciegas.

**Si la carga es con dinero, no se hace desde aquí.** V17 cubre premios, ajustes y reversos — los movimientos que no tocan la caja. Una carga contra efectivo o tarjeta se cobra en el mostrador como una venta del producto `Carga de saldo` (§6.3), para que entre al arqueo. El selector de motivo de esta pantalla **no ofrece `carga`** por eso mismo.

### V18 — Clientes *(encargado)*

Tabla con nombre, contacto, saldo, crédito y última compra. Filtros: con saldo, con deuda, con crédito. Ordenable por saldo.

Los candidatos a duplicado aparecen con `⚠` y son filtrables, igual que los productos de E1.

---

## 9. Plan de implementación

### Fase 0 — Verificación

1. Confirmar que E1 lleva siete días en producción con la caja cuadrando (criterio 11 de `02` §10).
2. **Decidir con el negocio si el crédito entra en esta etapa** o se posterga. Es la única funcionalidad de la etapa con consecuencias de plata más allá del saldo.
3. **Sembrar el producto-servicio `SRV-000001 · Carga de saldo`** y confirmar con el negocio la redacción que verá en el listado de ventas del día (§6.3).

### Fase 1 — Cimientos

Migración de §5 con las back-relations de §5.3, el valor `monedero` **al final** de la enum, el valor `servicio` en `TipoProducto` y el producto semilla `SRV-000001`. Cálculo de saldo, validador de RUT con módulo 11, `nombreBusqueda`, detección de duplicados.

**Entregable:** el `schema.prisma` consolidado, no un diff.

**Verificable:** los tests de `packages/dominio` cubren el módulo 11 con casos reales, la suma de saldo, las reglas de tope de §6.2 y la normalización de `nombreBusqueda`.

### Fase 2 — Clientes en el mostrador (C1, C2, C3, C6)

Alta, buscador, asociación a la venta, ficha. **Sin monedero todavía.**

**Verificable:** se crea un cliente en dos campos desde el cobro sin salir del diálogo, y su ficha muestra sus compras.

### Fase 3 — Monedero (C4, C5)

Libro, carga, pago con saldo, devolución al anular.

**Verificable:** con $3.000 de saldo se paga una venta de $11.000 mixta; anular esa venta devuelve exactamente $3.000; una carga de $10.000 en efectivo aparece en el arqueo; y dos cobros simultáneos al mismo cliente **no gastan dos veces el mismo saldo** — se prueba con dos peticiones concurrentes, no en la interfaz.

### Fase 4 — Vinculación con los canales (C7)

Importación en simulación, revisión de las coincidencias propuestas, confirmación manual por tandas.

### Fase 5 — Crédito y fusión (C8, C9)

Solo si la Fase 0 lo aprobó.

### Fase 6 — Desinstalar los monederos viejos

Desactivar y **desinstalar** `WooCommerce Customer Wallet` de onplay.cl y `OnplayWallet` de onplaygames.cl. Verificar que ninguno dejó datos con saldo real: si los tiene, se migran a `MovimientoMonedero` con motivo `ajuste` y nota, antes de desinstalar.

---

## 10. Criterios de aceptación

1. Un cliente se crea desde el diálogo de cobro con **nombre y teléfono**, sin salir del cobro y sin tocar el mouse.
2. Buscar por nombre parcial, RUT o teléfono devuelve al cliente en **menos de 200 ms**.
3. Un RUT con dígito verificador incorrecto se rechaza en el momento con un mensaje comprensible.
4. **El premio de un torneo cargado como saldo se puede gastar en el mostrador el mismo día.** Es el caso de uso que originó la etapa.
5. El saldo es siempre la suma de los movimientos: se comprueba sumando a mano el historial de un cliente con al menos diez movimientos.
6. Pagar $11.000 con $3.000 de monedero y $8.000 de efectivo registra dos pagos y deja el saldo en cero.
7. **Sin crédito, no se puede gastar más de lo que hay.** El intento responde `422 SALDO_INSUFICIENTE` indicando cuánto falta.
8. **Dos cobros concurrentes al mismo cliente no gastan dos veces el mismo saldo.** Verificado con peticiones simultáneas, no en la interfaz.
9. Anular una venta pagada con saldo devuelve el saldo con un movimiento de motivo `devolucion`. **El movimiento original sigue ahí.**
10. Un pago con `medio: "monedero"` sin `clienteId` responde `422 CLIENTE_REQUERIDO`.
11. Toda carga, ajuste y reverso queda en `Auditoria` con usuario, monto, motivo y nota.
12. Un `vendedor` puede crear clientes pero **no** cargar saldo. Verificado contra la API con `curl`, no solo en la interfaz.
13. Vincular una cuenta de onplaygames.cl a un cliente hace que su ficha muestre las compras de ambos orígenes.
14. **Los dos plugins de monedero quedan desinstalados** de los dos sitios.
15. Vender sin cliente sigue siendo posible y no exige ningún paso adicional.
16. **Una carga de $10.000 en efectivo aparece en el arqueo del turno** y la caja cuadra al cierre. Anular esa venta genera un `reverso_carga` y el saldo vuelve a bajar.
17. Buscar "Ped" encuentra a "Pedro": la búsqueda es por prefijo sobre `nombreBusqueda`, no `MATCH…AGAINST` en modo natural.
18. Un `vendedor` que consulta el historial de un cliente **no ve folios ni el nombre de otros vendedores**. Verificado con `curl`.
19. Fusionar dos clientes deja **una fila de `Auditoria` por entidad reasignada**, no una sola que diga "fusión".
20. Desvincular una cuenta de canal **no borra la fila**: marca `desvinculadoEn`.

---

## 11. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **RC1** | Dos cobros simultáneos gastan el mismo saldo | **Crítico** | `SELECT ... FOR UPDATE` dentro de la transacción de la venta (§6.2), con test de concurrencia obligatorio |
| **RC2** | El efectivo de una carga de saldo no entra al arqueo y la caja descuadra | Alto | **Resuelto en §6.3:** una carga con dinero es una venta del producto-servicio `SRV-000001`, con su pago y su folio. Entra al arqueo como cualquier otra |
| **RC3** | La base se llena de clientes duplicados por altas rápidas | Medio | Aviso en vivo al crear (§6.6), panel de candidatos y fusión asistida |
| **RC4** | Importar usuarios de WordPress ensucia la base desde el primer día | Medio | Simulación obligatoria y confirmación manual por tandas. Nunca creación automática |
| **RC5** | Un encargado carga saldo por error y no hay forma de deshacerlo | Medio | `reverso_carga` con nota obligatoria, y la vista previa de V17 que muestra el saldo resultante antes de confirmar |
| **RC6** | Se acumula saldo sin control y se vuelve una deuda invisible del negocio | Medio | La pantalla V18 ordena por saldo y permite ver el total comprometido. Fuera de alcance su tratamiento contable |
| **RC7** | Datos personales de clientes sin necesidad | Bajo | Solo nombre, contacto y RUT opcional. **Ningún dato de tarjeta**, igual que en E1 (`01` §10) |

---

## 12. Huecos en el contrato previo

| # | Falta | Propuesta |
|---|---|---|
| ~~**HC1**~~ | ~~`Auditoria` sin endpoint de lectura~~ | **CERRADO**: `GET /auditoria` añadido a `02` §5.2 |
| **HC2** | `02` §5.4 no contempla `clienteId` en el cuerpo de `POST /ventas` | Añadir `clienteId` opcional. Obligatorio solo si algún pago es de medio `monedero` |
| **HC3** | `02` §5.3 no describe el efecto de la anulación sobre pagos con monedero | Añadir los pasos de §6.4 al contrato de `POST /ventas/:id/anular` |
| ~~**HC4**~~ | ~~`TipoProducto` sin el valor `servicio`~~ | **CERRADO**: `servicio` y el prefijo `SRV` añadidos a `02` §4.1 y §6.4 |

---

## 13. Lo que habilita esta etapa

No es alcance de E4, pero conviene tenerlo presente porque condiciona decisiones de diseño:

- **E5 (Eventos)** usa `premio_evento` para pagar los premios de torneo como saldo, y `Cliente` como inscrito. El motivo ya está en la enum por eso.
- **E6 (Compras y márgenes)** puede cruzar margen por cliente una vez que las ventas llevan `clienteId`.
- Un **portal de cliente** o el **pago con saldo en línea** son etapas propias, y ambas se apoyan en `ClienteCanal` sin necesidad de rehacer nada.
