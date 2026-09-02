# SDD — Diseño de interfaz, Etapa 1
## Cristal OnPlay · especificación ejecutable de la capa visual

| | |
|---|---|
| **Proyecto** | `onplay-core` |
| **Etapa** | 1 de 6 — Consulta de precios y venta en mostrador |
| **Dirección visual** | **Cristal OnPlay** (elegida el 25-08-2026) |
| **Versión** | 2.0 |
| **Fecha** | 25 de agosto de 2026 |
| **Documento padre** | `docs/02-SDD-etapa1-mostrador.md` |
| **Prototipo de referencia** | Espécimen interactivo, dirección D del comparativo |
| **Destinatario** | Claude Code |

> **Qué es este documento.** `02` define *qué* hace el sistema y con qué contrato de API. Este define *cómo se ve y cómo se comporta*. Las decisiones están cerradas: no hay que elegir paleta, tipografía ni disposición.
>
> **Regla de alcance.** Este documento no introduce funcionalidad. Cuando el diseño necesitó algo que `02` §5 no define, no se inventó el endpoint: está anotado en **§14, Huecos en el contrato**.
>
> **Convención.** Principios de interfaz `I1`–`I8`, pantallas `V0`–`V11`. No colisionan con los principios `P1`–`P9` ni las decisiones `D1`–`D5` del SDD general.

---

## 1. Para quién se diseña

No es una aplicación de escritorio para un administrativo sentado. Es una herramienta que se usa **de pie, con un cliente enfrente esperando, y a veces con una sola mano libre** porque la otra sostiene una carpeta de cartas.

1. **El dolor a resolver es de segundos.** El objetivo O1 es saber un precio en menos de 5 segundos.
2. **Quien atiende no siempre es el dueño.** Puede llevar una semana y no saber qué es un "alt art".
3. **Hay un lector de código de barras.** Se comporta como un teclado: escribe rápido y manda Enter.
4. **La conexión se cae.** El local está en una galería del centro.

Del [benchmark de UX de POS 2026](https://creative.navy/blog/pos-software-ux-benchmarking-2026-the-coherence-gap/) vienen dos criterios que este diseño toma como propios: **economía de atención** (la interfaz debe ser usable sin enfoque visual sostenido) y **estabilidad de condicionamiento** (los cambios no pueden romper las secuencias motoras que se ejecutan sin mirar). El rediseño de Square de 2025 introdujo 2–3 segundos de latencia en la búsqueda y movió el momento de apertura del cajón: eso es lo que se está evitando.

---

## 2. Principios de interfaz

**I1 — Una pantalla para vender.** Buscar, agregar, ajustar y cobrar no cambian de página.

**I2 — El foco vive en el buscador.** Al cargar, tras agregar, tras cerrar un diálogo y tras completar una venta, el cursor vuelve solo. Nunca hay que hacer clic para empezar a escribir.

**I3 — Todo se puede hacer con teclado.** El mouse y el tacto son alternativas, no el camino principal.

**I4 — Los números primero.** El total es lo más grande de la pantalla. El énfasis lo da el tamaño, **no el color**.

**I5 — El error se muestra donde se comete.** El mensaje general solo resume.

**I6 — Nada bloquea sin decir por qué.** Un botón deshabilitado siempre lleva el motivo visible.

**I7 — El estado de conexión es permanente y discreto.** Un indicador siempre presente que no interrumpe.

**I8 — La marca vive en los neutros.** El color de marca aparece en la acción principal y en nada más. Un morado en el total, en las pestañas y en los bordes al mismo tiempo no comunica marca: comunica ruido.

---

## 3. Estructura y comportamiento

### 3.1 Disposición

```
┌────────────┬───────────────────────────┬──────────────────┐
│            │  Mostrador                │  Venta        3  │
│  ◧ Mostr.  │  ┌─────────────────────┐  │ ──────────────── │
│  ▤ Produc. │  │ Buscar o escanear…  │  │  Coca-Cola…      │
│  ◍ Ventas  │  └─────────────────────┘  │  − 2 +    $3.000 │
│  ▦ Turnos  │  [Snacks][Sellado][Cartas]│ ──────────────── │
│  ⇄ Sync    │  ┌─────────────────────┐  │  Jewelry Bonney  │
│            │  │ Coca-Cola lata   ●  │  │  − 1 +    $8.000 │
│  ──────    │  │ Coca-Cola Zero      │  │                  │
│  ☾ Oscuro  │  │ Coca-Cola 1,5 L     │  │  Total   $11.000 │
│  ◔ Cerrar  │  └─────────────────────┘  │  [   COBRAR   ]  │
└────────────┴───────────────────────────┴──────────────────┘
   236 px            flexible                   344 px
```

### 3.2 Barra lateral plegable

| Estado | Ancho | Qué se ve |
|---|---|---|
| Desplegada | 236 px | Icono + etiqueta |
| Plegada | 72 px | Solo icono, centrado |

- Se pliega con el botón `⇤` junto al título, y con **F3**.
- La transición anima `grid-template-columns` en 320 ms con `cubic-bezier(.32,.72,0,1)`. Bajo `prefers-reduced-motion` el cambio es instantáneo.
- **El estado persiste** por dispositivo en `localStorage` (`onplay.lateral`). Alguien que trabaja plegado no tiene que volver a plegarla cada mañana.
- Material translúcido: `backdrop-filter: saturate(180%) blur(22px)` sobre el token `--barra`. Si el navegador no lo soporta, el token cae a un color sólido equivalente — se degrada, no se rompe.
- Plegada, cada ítem conserva su `aria-label`; la etiqueta se oculta con `opacity` y `pointer-events:none`, no con `display:none`, para que el lector de pantalla la siga anunciando.

### 3.3 Tema claro y oscuro

- **Primera visita:** se respeta `prefers-color-scheme` del sistema.
- **Al conmutar:** la elección se guarda en `localStorage` (`onplay.tema`) y manda sobre el sistema desde ahí en adelante.
- El conmutador vive en el **pie de la barra lateral**, con icono `☾` / `☀` y etiqueta que dice a qué modo se va, no en cuál se está: *"Modo oscuro"* cuando estás en claro.
- Implementación: atributo `data-tema="claro|oscuro"` en el elemento raíz de la aplicación. **Todo color sale de un token**; ningún componente declara un color literal.

### 3.4 Adaptación a la pantalla

| Ancho | Barra lateral | Panel de venta |
|---|---|---|
| `≥ 1024px` | Completa, plegable | Columna fija de 344 px |
| `640–1023px` | **Siempre plegada** (72 px), no expandible | Cajón lateral + **barra fija inferior con total y Cobrar** |
| `< 640px` | Barra inferior de 4 pestañas | Cajón + **barra fija con total y Cobrar** |

> En menos de 1024 px el total y el botón Cobrar **nunca** se esconden dentro del cajón. Si lo hicieran, el diseño incumpliría I4 y los criterios 3 y 10 de §12.

---

## 4. Sistema de diseño

### 4.1 Color

Los valores de marca se **muestrearon del logotipo**, no se eligieron a ojo: morado `#440084` (6,0 % de los píxeles), violeta `#A88AF8`, rosa `#FF3B77`, blanco.

Apple no publica valores hex: diseña con **roles semánticos** que cada tema resuelve distinto. Esta paleta hace lo mismo — por eso el mismo sistema da un morado profundo con texto blanco en claro, y un morado medio en oscuro, sin dejar de ser la misma marca.

```js
// apps/web/tailwind.config.js — los tokens se declaran como variables CSS
// y Tailwind solo las referencia. Ver §4.1.1.
```

#### Tema claro

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--bg` | `#FFFFFF` | Tarjetas, listas, panel de venta | — |
| `--bg2` | `#F5F3F9` | Fondo de la aplicación | — |
| `--bg3` | `#FFFFFF` | Superficie elevada | — |
| `--barra` | `rgba(248,246,252,.72)` | Barra lateral translúcida | — |
| `--lab` | `#1A1220` | Texto principal, **totales** | 18,24:1 |
| `--lab2` | `rgba(58,45,72,.80)` | Etiquetas y secundario | 6,79:1 |
| `--lab3` | `rgba(58,45,72,.72)` | Códigos, ayuda | 5,29:1 |
| `--sep` | `rgba(58,45,72,.13)` | Filetes y bordes | — |
| `--ac` | `#440084` | **Solo**: relleno de la acción principal y anillo de foco | 13,30:1 |
| `--sobre-ac` | `#FFFFFF` | Texto sobre el relleno | 13,30:1 |
| `--ac-suave` | `rgba(68,0,132,.045)` | Tinte de fila seleccionada | — |
| `--rosa` | `#FF3B77` | **Solo**: punto de 5 px de la sección activa | 3,42:1 (elemento, no texto) |
| `--ok` | `#1D7F3A` | Confirmación | — |
| `--alerta` | `#B25000` | Atención sin bloqueo | — |
| `--peligro` | `#C4001A` | Bloqueo, error, anulación | — |

#### Tema oscuro

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--bg` | `#0A0610` | Tarjetas, listas, panel de venta | — |
| `--bg2` | `#171021` | Fondo de la aplicación | — |
| `--bg3` | `#211830` | Superficie elevada | — |
| `--barra` | `rgba(23,16,33,.74)` | Barra lateral translúcida | — |
| `--lab` | `#F4F0F8` | Texto principal, **totales** | 17,84:1 |
| `--lab2` | `rgba(236,230,245,.62)` | Etiquetas y secundario | 6,54:1 |
| `--lab3` | `rgba(236,230,245,.55)` | Códigos, ayuda | 5,30:1 |
| `--sep` | `rgba(168,138,248,.16)` | Filetes y bordes | — |
| `--ac` | `#B79CF9` | Foco y acento de texto | 8,73:1 |
| `--ac-relleno` | `#7A3AD6` | Relleno de la acción principal | 3,25:1 vs fondo |
| `--sobre-ac` | `#FFFFFF` | Texto sobre el relleno | 6,17:1 |
| `--ac-suave` | `rgba(168,138,248,.09)` | Tinte de fila seleccionada | — |
| `--rosa` | `#FF5D8F` | Punto de la sección activa | — |
| `--ok` | `#30D158` · `--alerta` `#FF9F0A` · `--peligro` `#FF453A` | | |

**Los 19 pares de color de ambos temas fueron verificados por cálculo. Ninguno baja de 4,5:1 en texto ni de 3:1 en elementos de interfaz.**

#### 4.1.1 Reglas de contención de la marca

Estas cuatro reglas son el diseño. Sin ellas, la paleta se vuelve ruido:

1. **El morado aparece en un solo lugar visible: el relleno del botón Cobrar.** Más el anillo de foco, que es funcional.
2. **El total va en `--lab`, nunca en morado.** A 52 px el énfasis ya lo da la tipografía.
3. **El rosa aparece en un solo lugar: el punto de 5 px de la sección activa.** No es semántico. Si se usara para avisos competiría con `--peligro`, y en una pantalla donde importa distinguir "atención" de "error", eso es un fallo real. **El rosa nunca lleva texto encima** — blanco sobre `#FF3B77` da 3,42:1.
4. **Los grises llevan sesgo violeta a propósito.** `#F5F3F9`, no `#F5F5F7`. Un gris neutro puro junto a este morado se ve sucio. La marca vive aquí y en el logotipo.

Fila seleccionada, control segmentado activo, sección activa de la barra y pasos de cantidad: **todos neutros**.

### 4.2 Tipografía

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=IBM+Plex+Mono:wght@400;500&display=swap">
```

- **Inter** para todo el texto. Es el sustituto libre más fiel de SF Pro; se declara con `-apple-system` como primer recurso para que en un Mac o un iPad use la fuente del sistema.
- **IBM Plex Mono** para códigos, números de carta y atajos.
- `font-feature-settings: 'cv05','ss01'` — la `l` con cola y la `a` de un piso, que separan mejor `l`/`1`/`I` en códigos de producto.
- **`font-variant-numeric: tabular-nums` en todo dinero y cantidad.** Sin esto los importes de una columna no se alinean y leer una lista de precios se hace más lento.

#### Escala fluida

El tamaño **se recalcula con el ancho real de la pantalla**, sin puntos de quiebre. Cinco escalones, todos como tokens:

| Token | Valor | Uso |
|---|---|---|
| `--t-total` | `clamp(30px, 3.3vw, 52px)` | Total a cobrar |
| `--t-tit` | `clamp(17px, 1.35vw, 22px)` | Títulos de pantalla y de panel |
| `--t-cuerpo` | `clamp(13.5px, 1vw, 16px)` | Cuerpo, campos, botones |
| `--t-chico` | `clamp(11.5px, .82vw, 13px)` | Etiquetas, códigos, ayuda |
| `--t-rot` | `clamp(9.5px, .68vw, 11px)` | Atajos y rótulos |

**Excepción obligatoria:** los `<input>` de texto nunca bajan de **16 px reales**. Por debajo, iOS hace zoom al enfocar y descoloca la pantalla en pleno cobro. Donde `--t-cuerpo` pueda quedar bajo 16 px, el campo usa `max(16px, var(--t-cuerpo))`.

Pesos: 400 cuerpo · 500 nombres de producto · 600 títulos, precios y totales · 700 solo en el contador del carrito. `letter-spacing` negativo creciente con el tamaño: `-0.01em` en cuerpo, `-0.02em` en títulos, `-0.035em` en el total.

### 4.3 Espaciado, formas y sombras

- **Rejilla de 8 px** con subdivisiones de 4: solo `4, 8, 12, 16, 20, 24, 32, 48`.
- **Radios:** `6px` menores (pasos de cantidad, atajos) · `8px` (ítems de la barra, botones secundarios) · `11px` (campos, botón principal) · `12px` (tarjetas y listas).
- **Sombra:** una sola, discreta. Claro `0 1px 2px rgba(26,18,32,.05), 0 6px 20px rgba(26,18,32,.05)`. Oscuro, más profunda. Solo en listas, diálogos y cajones; los paneles se separan con `--sep`.
- **Foco:** borde en `--ac` más `box-shadow: 0 0 0 3.5px var(--ac-suave)`. **Nunca `outline:none` sin reemplazo.**

### 4.4 Objetivos táctiles

Mínimo **44 × 44 px**. Botón principal **50 px** de alto. Filas de lista **56 px**. Ítems de la barra lateral **40 px** de alto con área activa completa. Al menos 8 px entre dos objetivos distintos: eliminar una línea y editar su precio no pueden quedar a un pulgar de distancia.

### 4.5 Formato de datos

| Dato | Formato | Ejemplo |
|---|---|---|
| Dinero | `$` + `toLocaleString('es-CL')`, sin decimales | `$11.000` |
| Dinero negativo | Con signo explícito | `−$1.240` |
| Fecha y hora | `America/Santiago`, 24 h | `25-08-2026 14:32` |
| Folio | Tal cual del servidor | `V-2026-00042` |

Un único helper, `apps/web/src/utils/formato.js`, exporta `clp()`, `fecha()`, `hora()`. **Ningún componente formatea dinero por su cuenta.**

---

## 5. Inventario de componentes

Componentes propios, sin librería externa (`02` §12). En `apps/web/src/components/`.

### 5.1 Base

| Componente | Props | Notas |
|---|---|---|
| `Boton` | `variante` (`principal`\|`secundario`\|`peligro`\|`fantasma`), `tamano`, `cargando`, `deshabilitado`, `motivoDeshabilitado` | El motivo se renderiza como texto de `--t-chico` en `--peligro` junto al botón, **no** como `title` — en pantalla táctil no existe |
| `Campo` | `etiqueta`, `tipo`, `error`, `ayuda`, `prefijo` | Mínimo 16 px reales |
| `CampoMonto` | + `value` numérico | Solo enteros. Prefijo `$`. Selecciona todo al enfocar |
| `Dialogo` | `abierto`, `titulo`, `onCerrar`, `cerrable` | Atrapa el foco y lo devuelve al cerrarse |
| `Segmentado` | `opciones`, `valor`, `onChange` | Activo en neutro sobre `--bg3` |
| `Insignia` | `tono` (`neutro`\|`ok`\|`alerta`\|`peligro`) | Sin tono de marca: la marca no etiqueta |
| `Banner` · `Vacio` · `Cargando` | | `Vacio` ofrece **una sola** acción |

### 5.2 De aplicación

| Componente | Responsabilidad |
|---|---|
| `BarraLateral` | Navegación, plegado, conmutador de tema, logotipo |
| `ConmutadorTema` | Alterna y persiste el tema |
| `IndicadorConexion` | `en línea` / `sin conexión · N ventas pendientes` |
| `Buscador` | Campo con foco permanente y lista de resultados |
| `ResultadoBusqueda` | Nombre, código, número de carta, categoría, precio |
| `AccesoRapido` | Grilla táctil por categoría |
| `PanelVenta` | Líneas, subtotal, descuento, total, Cobrar |
| `LineaVenta` | Nombre, pasos de cantidad, precio, total |
| `BarraTotalFija` | En `<1024px`: total y Cobrar siempre visibles |
| `DialogoCobro` · `DialogoItemSuelto` · `DialogoApertura` · `DialogoCierre` | |
| `TablaVentas` · `FormularioProducto` · `AltaRapidaSnack` | |

---

## 6. Rutas

```
/                    Mostrador (exige turno abierto)
/mis-ventas          Ventas del turno propio — cualquier rol
/entrar              Login
/admin               Backoffice — encargado o superior
  /productos · /snacks · /ventas · /turnos · /duplicados   (encargado+)
  /sync                                                     (admin)
  /usuarios      → depende de §14 H1
  /auditoria     → depende de §14 H2
```

**Un `vendedor` nunca entra a `/admin`.** Sus ventas las ve en `/mis-ventas`, desde la barra lateral. Esto respeta a la vez `02` §8 (backoffice = encargado o superior) y `02` §5.3 (un vendedor sí consulta `GET /ventas?turnoCajaId=<su turno>`).

---

## 7. Pantallas

### V0 — Entrar

Formulario centrado sobre `--bg2`, tarjeta en `--bg` de 380 px. Logotipo arriba. Foco inicial en Correo; `Enter` en Contraseña envía.

- Credenciales malas: banner `--peligro` — *"Correo o contraseña incorrectos."* Nunca se dice cuál de los dos falló.
- **Sesión:** el token de acceso vive en memoria. El *refresh token* dura 30 días (`02` §11): en `localStorage` sería legible por cualquier XSS, lo que contradice la regla S3 (`01` §8.3). Va en **cookie `httpOnly` + `SameSite=Strict`**. Ver §14 H7.
- **Renovación silenciosa:** `JWT_EXPIRA=8h` pero un turno real pasa de once horas. Se llama a `POST /auth/refresh` cuando quedan menos de 30 minutos. *"Tu sesión venció"* solo si el refresh también falla.

### V1 — Apertura de turno

Diálogo **no cerrable**: sin turno abierto no hay nada más que hacer.

Campo de monto grande, y un texto que **explica por qué importa**: *"Cuenta el efectivo antes de escribirlo. Este monto se usa para cuadrar la caja al cierre."* Sin esa frase, la gente escribe cualquier cosa y el arqueo pierde sentido.

Acepta `0`. Si el servidor responde `409 TURNO_YA_ABIERTO`, el diálogo se cierra solo y carga el turno existente — pasa al abrir en un segundo dispositivo.

### V2 — Mostrador

#### El buscador

- **Foco permanente** (I2), recuperado tras cada acción salvo con un diálogo abierto o un campo del carrito en edición.
- *Debounce* 150 ms, mínimo 2 caracteres.
- **Busca por nombre, código, número de carta y código de barras** — los cuatro de F4 (`02` §3), los cuatro en el caché local (`02` §7.4).
- **Siempre el caché local primero.** Solo si no hay resultados locales y hay conexión se consulta `GET /productos/buscar`.
- Si el texto coincide exacto con un `codigoBarras`, **se agrega sin mostrar la lista**.
- `↓` `↑` mueven el resaltado, `Enter` agrega, `Esc` limpia. Tras agregar, la búsqueda se limpia y el foco vuelve.

#### Los resultados

Lista agrupada en tarjeta de radio 12. Máximo 20 filas de 56 px. Cada una: nombre en peso 500, código y número de carta en mono `--lab3`, categoría, precio en peso 600. La fila resaltada lleva **solo** el tinte `--ac-suave`, sin barra lateral.

Un producto ya en el carrito muestra insignia neutra `en carrito · 2`; agregarlo otra vez suma uno.

**Sin resultados**, según rol:

| Rol | Acciones |
|---|---|
| `vendedor` | **Vender como ítem suelto** · *"Si el producto no está, pídele a un encargado que lo dé de alta."* |
| `encargado`+ | **Vender como ítem suelto** · **Darlo de alta ahora** (abre V6 con el término precargado) |

El alta exige rol `encargado` (`02` §5.2); ofrecérsela a un vendedor produciría un `403` en el peor momento.

#### Ítem suelto

`DialogoItemSuelto`: descripción (precargada con el término buscado) y precio. La línea se envía con **`productoId: null`** y su `descripcion`, como exige la validación 4 de `02` §5.4.

#### Accesos rápidos

Control segmentado con `Snacks`, `Sellado`, `Cartas`. Abre una grilla táctil **ordenada alfabéticamente** y resuelta contra el caché local, para que funcione sin conexión.

> **Ajuste R-005 (2026-09-02, `08-bitacora-revision.md`):** las pestañas ya no son fijas: son las categorías raíz reales con productos en el caché, y las subcategorías con productos aparecen como filtros con conteo. La regla de «Cartas» de abajo se generaliza a cualquier selección con más de 60 productos y subcategorías.

`Cartas` **no** despliega la categoría completa: son más de 2.100 productos (`02` §6.1) y una grilla de ese tamaño no sirve. Muestra primero las subcategorías (Magic, One Piece, Pokémon…) y dentro de cada una, máximo 60 productos con el aviso *"Usa el buscador para encontrar una carta puntual."*

#### El panel de venta

- Pasos `−` / `+` neutros. Bajar de 1 elimina la línea, con confirmación solo si la cantidad era mayor que 1.
- Precio editable tocándolo. Si difiere del catálogo: insignia `--alerta` — `precio editado · catálogo $8.000`.
- Descuento global en pesos, no en porcentaje: es lo que se negocia en el mostrador. Tope: el total de las líneas (validación 7 de `02` §5.4). Si se excede, campo en `--peligro`: *"El descuento no puede superar $11.000."*
- **`descuentoLinea` no se expone en la Etapa 1.** Existe en el contrato y siempre se envía en `0`. Está dicho para que no se lea como un olvido.
- **Total en `--t-total`, color `--lab`.**
- Cobrar de 50 px en `--ac`. Deshabilitado si el carrito está vacío o hay una línea inválida, **siempre con el motivo debajo** (I6): *"Hay 1 producto con precio en $0."*

> El contrato acepta `precioUnitario >= 0` (validación 3), así que `0` no es inválido técnicamente. La interfaz igual lo bloquea: regalar un producto sin querer es más caro que el clic extra. Si alguna vez hay que vender en `$0`, se destraba desde el campo con confirmación explícita.

#### Atajos

| Tecla | Acción |
|---|---|
| `F1` | Lista de atajos |
| `F2` | Abrir el cobro |
| `F3` | Plegar / desplegar la barra lateral |
| `F4` | Ir al backoffice |
| `F8` | Vaciar el carrito (con confirmación) |
| `Esc` | Limpiar búsqueda · cerrar diálogo · salir de un campo |
| `↓` `↑` `Enter` | Navegar y agregar resultados |

**Solo teclas de función.** No colisionan con la escritura ni con atajos del navegador (`Ctrl+B` abre los marcadores), y ningún carácter imprimible dispara una acción: el lector de código de barras podría lanzarla en medio de una ráfaga.

### V3 — Cobro

Diálogo de 480 px. Total en `--t-total` arriba, centrado. Rejilla de seis medios de pago en dos filas.

**Teclado dentro del diálogo** — sin esto el criterio 1 de §12 no se cumple:

- Al abrir, el foco cae en **Efectivo**, el medio más frecuente.
- `1`–`6` seleccionan el medio, en el orden dibujado.
- `Enter` **agrega el pago** por lo que falta.
- Si tras agregarlo falta `$0`, un segundo `Enter` **confirma la venta**.
- `Esc` cierra y devuelve al carrito intacto.

**Flujo:** el monto se precarga con lo que falta por pagar — caso normal, un medio y un `Enter`. En efectivo aparece "Recibí" y el **vuelto se calcula en vivo**; se envía `montoRecibido` junto al pago, pero `monto` es siempre **lo imputado** (`02` §5.4). Si sobra por pagar, se elige otro medio: eso es el pago mixto.

`CONFIRMAR VENTA` se habilita **solo cuando "Falta por pagar" llega exactamente a $0**; si no, el botón dice *"Faltan $4.000 por asignar."*

**Referencia:** en débito, crédito y transferencia, campo opcional "N° de operación" con ayuda *"Número del voucher o de la transferencia."* — **nunca se piden dígitos de tarjeta** (`01` §10).

**Al confirmar:** se genera un `idempotencyKey` (ULID) antes de enviar y **se persiste junto con la venta en la cola de IndexedDB** hasta que el servidor la confirme. No basta con conservarla mientras el diálogo esté abierto: una venta encolada sin conexión puede reintentarse horas después, con la aplicación recargada. Si ahí se generara una clave nueva, la venta se duplicaría y el criterio 9 de `02` se rompería.

Éxito: la confirmación muestra folio, total y **vuelto** (es el momento en que se entrega) durante 2 segundos. `Enter` vuelve al mostrador con el carrito vacío y el foco en el buscador.

Si el servidor devuelve `advertencias`, se muestran en `--alerta`: *"1 producto se vendió a un precio distinto del catálogo."* No es error y no requiere acción.

**Sin conexión:** el botón dice `CONFIRMAR VENTA · sin conexión`, la venta se encola y la confirmación muestra `Pendiente de enviar` en vez del folio, con *"Se enviará sola cuando vuelva la conexión."* El folio lo asigna el servidor al llegar (`02` §5.5).

### V4 — Cierre de caja

Resumen del turno, totales por medio de pago, y el **arqueo con su desglose completo**:

```
Monto de apertura                $50.000
+ Ventas en efectivo             $64.500
─────────────────────────────────────────
Debería haber                   $114.500
```

Quien cierra tiene que ver de dónde sale el número. Si solo ve "diferencia: −$3.200" no puede hacer nada con eso.

| Diferencia | Presentación |
|---|---|
| `0` | `--ok` — *"La caja cuadra."* |
| `≠ 0` | `--alerta` — *"Diferencia: −$3.200 (falta efectivo)"* + **Nota obligatoria** |

Botón deshabilitado con *"Escribe una nota explicando la diferencia."* hasta que haya texto. La validación también vive en el servidor —`422 NOTA_REQUERIDA`—: la interfaz es cortesía, no garantía.

**El cierre es irreversible** y se advierte: *"Al cerrar no se pueden registrar más ventas en este turno."* Al confirmar, resumen con **Imprimir / Compartir** (`window.print()` con hoja de estilos en blanco y negro), como pide `02` §7.3.

### V5 — Productos *(encargado+)*

Tabla en tarjeta. Paginación por cursor, 50 por página: **nunca se carga el catálogo completo**.

- Filtros que el contrato admite: `tipo`, `categoriaId`, `posibleDuplicado`, `activo`. **No hay filtro por canal** (§14 H4). La *columna* Canales sí es viable: `GET /productos/:id` devuelve `canales[]`.
- **Sin contador total**: la paginación por cursor no lo entrega (§14 H5).
- Código maestro y número de carta bajo el nombre, en mono.
- `posibleDuplicado` con `⚠` y filtrable — la mitigación del riesgo R3 disponible desde el primer día.
- Cambiar el precio **pide confirmación** mostrando valor anterior y nuevo: es una acción auditada.

### V6 — Alta rápida de snack

La pantalla que resuelve el problema original. Optimizada para **dar de alta 50 productos seguidos sin tocar el mouse**.

Cuatro campos: nombre, precio, categoría, código de barras.

- **El `tipo` se deriva de la categoría y se envía siempre explícito** (`snack` para cualquier hija de Snacks, `accesorio` para Accesorios…). Sin eso el producto nacería `indeterminado`, el SKU saldría `IND-…` en vez de `SNK-…` y quedaría registrado como error en `SyncLog` (`02` §6.2 y §6.4), ensuciando el criterio de aceptación 2.
- `Enter` en cualquier campo = **Guardar y otro**: guarda, limpia nombre / precio / código, **mantiene la categoría**, devuelve el foco al nombre. Ese ciclo es lo que permite cargar la tienda en una sesión.
- Confirmación de 2 s con el código asignado: *"Guardado como SNK-000018."*
- **Aviso de duplicado en vivo:** si el nombre normalizado coincide con uno del caché local, `--alerta` bajo el campo: *"Ya existe «Coca-Cola lata 350 cc» a $1.500."* con enlace para editarlo. Se resuelve contra el caché, sin endpoint nuevo. No bloquea.

### V7 — Ventas

`/mis-ventas` (cualquier rol, solo el turno propio abierto, sin filtros) y `/admin/ventas` (encargado+, con fecha y estado).

- **No hay filtro por vendedor** (§14 H3) ni total agregado del rango (§14 H5).
- Filas expandibles con líneas y pagos.
- Anuladas **tachadas** con insignia `--peligro`, nunca ocultas (`01` §3 P9).
- **Anular** (encargado) exige motivo escrito y advierte: *"Esto no devuelve el dinero ni repone stock. Solo marca la venta como anulada."*
- Turno ya cerrado: botón deshabilitado con *"No se puede anular una venta de un turno cerrado. Corresponde una devolución, que llega en la Etapa 2."*

### V8 — Turnos *(encargado+)*

Fecha · Vendedor · Apertura · Esperado · Declarado · Diferencia. `GET /turnos`.

Es lo que hace útil el arqueo: una diferencia aislada no dice nada; tres seguidas en el mismo turno, sí. Diferencia en `--ok` cuando es `$0`, `--alerta` en cualquier otro valor. Al expandir, la nota del cierre y el resumen por medio de pago. Un turno abierto muestra `Esperado` en vivo y las tres últimas columnas vacías.

### V9 — Duplicados *(encargado+)*

Dos tarjetas lado a lado, de a un par.

| Acción | Endpoint |
|---|---|
| Conservar el de la izquierda / derecha | `POST /productos/:id/fusionar` |
| **No son el mismo** | **Sin endpoint** — §14 H6 |

Nunca hay fusión automática (`02` §6.6). Mientras H6 no se resuelva, solo las dos acciones de fusión; el par descartado reaparece en la siguiente revisión.

### V10 — Sincronización *(admin)*

Insignia **`SOLO LECTURA · Etapa 1` permanente y no ocultable**: es el recordatorio visible del criterio de aceptación 8.

`Simular importación` es el botón principal; `Importar` es secundario — coherente con la regla S1 (`01` §8.3): simular es el camino por defecto. Errores de `SyncLog` con acción "Marcar resuelto" (`PATCH /sync/logs/:id`); el criterio 2 exige llegar a cero.

### V11 — Usuarios *(admin)* y Auditoría *(encargado+)*

**Especificadas pero bloqueadas**: `02` §8 las exige, `02` §5 no define sus endpoints. Ver §14 H1 y H2. No se implementan hasta que el contrato exista.

---

## 8. Estados transversales

| Estado | Presentación |
|---|---|
| **Cargando inicial** | Esqueletos con la forma del contenido real. Pantalla completa solo en el arranque de la aplicación |
| **Cargando en fondo** | Nunca reemplaza el contenido. Barra de 2 px bajo el título. Filtros y scroll se conservan |
| **Vacío** | `Vacio` con **una sola** acción. El mensaje dice qué hacer |
| **Error** | `Banner` `--peligro` con qué pasó y Reintentar. Nunca un código HTTP a secas |
| **Sin permiso** | Pantalla propia con el rol requerido y botón para volver |

| Situación | Texto |
|---|---|
| Servidor caído | *"No se puede conectar con el servidor. Revisa que esté encendido y vuelve a intentar."* |
| Sesión vencida (y el refresh falló) | *"Tu sesión venció. Vuelve a entrar."* |
| Sin permiso (403) | *"Esta acción es solo para {rol}. Pídele a un {rol} que la haga."* — el rol se interpola: para `/admin/sync` no sirve pedírselo a un encargado |
| `409 TURNO_NO_ABIERTO` | *"No tienes la caja abierta."* → abre V1 |
| `409 TURNO_YA_ABIERTO` | Silencioso: carga el turno existente |
| `409 TURNO_CERRADO` | *"Este turno ya se cerró. No se pueden anular sus ventas; corresponde una devolución, que llega en la Etapa 2."* |
| `422 PAGOS_NO_CUADRAN` | *"Los pagos suman {X} y el total es {Y}."* |
| `422 NOTA_REQUERIDA` | *"Falta la nota que explica la diferencia de caja."* |
| `422 DESCUENTO_INVALIDO` | *"El descuento no puede superar {total de las líneas}."* |
| Error inesperado | *"Algo salió mal. Si vuelve a pasar, anota la hora y avisa."* |

**Ningún mensaje del mostrador muestra un código de estado ni un `stack trace`.** En el backoffice, el detalle técnico va en un `<details>` plegado.

### 8.1 Sin conexión

| Estado | Aspecto |
|---|---|
| En línea | Punto `--ok` · *"en línea"* |
| Sin conexión | Punto `--alerta` · *"sin conexión"* |
| Con pendientes | Punto `--alerta` · *"sin conexión · 3 ventas pendientes"* |
| Enviando | Punto `--ac` con pulso · *"enviando 3…"* |

Al vaciar la cola, banner `--ok` de 4 s: *"Se enviaron 3 ventas pendientes."* Si alguna falla, banner `--peligro` que no se cierra solo, con "Ver detalle".

**Sigue funcionando:** buscar en el caché, accesos rápidos, armar el carrito, ítems sueltos, cobrar y encolar.
**No funciona:** backoffice, alta de productos, cierre de caja y sincronización — botones deshabilitados con *"Necesitas conexión para esto."*

---

## 9. Accesibilidad

- **Contraste AA verificado por cálculo** en los dos temas (§4.1). Sin excepciones por tamaño.
- **Foco visible siempre.**
- **Orden de tabulación** según el orden visual: buscador → resultados → líneas → descuento → Cobrar. La barra lateral va antes, pero con un enlace "Saltar al buscador" como primer elemento tabulable.
- **Foco atrapado en diálogos**, devuelto al abridor.
- `aria-live="polite"` en el contador de resultados, el total y el indicador de conexión.
- **Etiquetas reales** (`<label for>`). Los `placeholder` no son etiquetas.
- **Nunca solo color:** campo inválido = borde `--peligro` **y** texto. Venta anulada = insignia **y** tachado. Sección activa = fondo tenue **y** peso 600, no solo el punto rosa.
- El conmutador de tema es un `button` con `aria-pressed`.
- `prefers-reduced-motion` elimina el plegado animado y el pulso del indicador.

---

## 10. Microcopy

**Español de Chile, tuteo, directo.** Se le habla a quien atiende.

| Se dice | No se dice |
|---|---|
| Cobrar | Procesar pago |
| Abrir caja / Cerrar caja | Iniciar sesión de caja |
| ¿Cuánto efectivo hay? | Monto declarado |
| La caja cuadra | Arqueo sin diferencias |
| Falta efectivo / Sobra efectivo | Diferencia negativa / positiva |
| Vuelto | Cambio |
| Código | SKU |

1. **Un error dice qué hacer.** No *"Precio inválido"* sino *"El precio tiene que ser un número entero mayor que cero."*
2. **Sin jerga interna en el mostrador.** "SKU", "sincronización", "canal" viven en el backoffice; en el mostrador la etiqueta es **"código"**.
3. **Los números en las frases van formateados:** *"Faltan $4.000 por asignar"*, nunca *"Faltan 4000"*.

---

## 11. Rendimiento percibido

| Interacción | Objetivo |
|---|---|
| Tecla → resultados | < 100 ms (caché local; nunca espera al servidor) |
| Agregar al carrito | Inmediato, sin llamada |
| Abrir el cobro | < 50 ms |
| Confirmar venta | < 800 ms con conexión; inmediato sin ella |
| Carga inicial | < 2 s incluida la hidratación del caché |

- La búsqueda usa `useDeferredValue` sobre el índice local: **nunca bloquea el tecleo**.
- `React.memo` en `ResultadoBusqueda` y `LineaVenta`.
- El caché offline se descarga al entrar y se refresca por delta cada 30 minutos (`02` §7.4).
- Sin virtualización en la Etapa 1: resultados topados en 20, accesos rápidos en 60.
- **`backdrop-filter` solo en la barra lateral.** Es caro; en más superficies se nota en un equipo modesto.

---

## 12. Criterios de aceptación del diseño

1. Una venta de tres productos se completa **sin tocar el mouse**: escribir · `Enter` · escribir · `Enter` · escribir · `Enter` · `F2` · `1` · `Enter` · `Enter`.
2. El lector de código de barras agrega el producto sin ningún clic y sin mostrar la lista.
3. El total se lee desde un metro, en cualquier ancho.
4. Todo botón deshabilitado tiene su motivo escrito, visible sin pasar el mouse por encima.
5. El cierre de caja muestra el desglose completo del arqueo.
6. Con el wifi apagado se registran tres ventas y el indicador dice *"sin conexión · 3 ventas pendientes"*, sin ningún diálogo.
7. Ningún mensaje del mostrador contiene un código HTTP, un nombre de campo técnico ni una palabra en inglés.
8. Se dan de alta 20 snacks seguidos solo con el teclado, y todos reciben un código `SNK-…`.
9. Navegando con `Tab`, el foco es visible siempre y sigue el orden visual.
10. En un celular de 360 px, el total **y** el botón Cobrar están siempre visibles sin scroll.
11. Un turno de once horas no expulsa a nadie de la sesión.
12. **El tema y el plegado elegidos siguen ahí al día siguiente.**
13. **Auditoría de marca:** en la pantalla de mostrador, el morado aparece en un solo elemento y el rosa en uno solo. Si aparece en un tercero, es un defecto.

---

## 13. Lo que este documento NO diseña

- **Pantallas de las Etapas 2 a 6.** Se diseñan cuando su etapa esté especificada.
- **Manual de marca.** Este documento usa el logotipo y su paleta; no los define.
- **Impresión de boleta fiscal.** El resumen de turno se imprime con `window.print()`; la boleta electrónica está fuera del alcance (`01` §2.3).
- **Sonidos.** Ni al agregar, ni al cobrar, ni al fallar. Un local con música y gente no es un sitio donde un `beep` comunique algo.

---

## 14. Huecos en el contrato de `02`

Siete puntos que este diseño necesita y que `02` §5 no define. La regla de alcance prohíbe inventarlos.

| # | Falta | Lo pide | Propuesta |
|---|---|---|---|
| **H1** | Endpoints de usuarios | `02` §8 lista la pantalla; §5 no define rutas, y §4.3 solo contempla crear el admin por script | `GET/POST/PATCH /usuarios` (admin) + flujo de contraseña inicial |
| **H2** | Endpoint de auditoría | `02` §8 lista la pantalla y §4.1 modela la tabla; no hay forma de leerla | `GET /auditoria` con filtros `entidad`, `entidadId`, `usuarioId`, `desde`, `hasta` (encargado) |
| **H3** | Filtro por vendedor en ventas | Un encargado necesita responder "¿qué vendió Carla ayer?" | Añadir `usuarioId` a `GET /ventas` |
| **H4** | Filtro por canal en productos | `02` §8 promete filtro por canal; §5.2 no lo acepta | Añadir `canalId` a `GET /productos` |
| **H5** | Totales en respuestas paginadas | Ni productos ni ventas puede mostrar un total | `total` en `GET /productos`; `total` y `sumaTotal` en `GET /ventas` · **Resuelto para productos el 2026-09-02 (R-009, `08-bitacora-revision.md`): `GET /productos` devuelve `total` y acepta `pagina`; V5 pagina por número de página** |
| **H6** | Descartar un par de duplicados | `02` §8 dice "fusionar o descartar"; §5.2 solo define fusionar | `PATCH /productos/:id { posibleDuplicado:false }` en ambos, auditado |
| **H7** | Dónde vive el refresh token | §5.1 define el endpoint, no el almacenamiento. 30 días en `localStorage` contradice S3 | Cookie `httpOnly` + `SameSite=Strict` emitida en el login |

**H1, H2 y H7 bloquean funcionalidad.** H3–H6 son degradaciones aceptables: el diseño ya está escrito para funcionar sin ellas.
