# 08 — Bitácora de revisión visual y novedades

**Propósito.** Registro vivo de lo que aparece al revisar el sistema con datos reales: defectos, datos raros del origen, mejoras chicas y decisiones tomadas sobre la marcha. Es el complemento operativo de las specs (01, 02, 05, 06, 07): las specs dicen qué se construye; este documento dice qué se encontró al usarlo y qué se hizo.

**Reglas de este documento.**

- Cada hallazgo recibe un número `R-NNN` y no se reutiliza.
- Se anota la fecha, dónde se vio (pantalla, endpoint, canal), qué se decidió y en qué archivo quedó el cambio.
- Lo que amplía alcance (P1) se registra aquí como **Agendado** con la etapa a la que pertenece; no se construye hasta esa etapa.
- Los estados posibles son: `Abierto`, `Corregido`, `Agendado (E#)`, `Descartado` (con motivo).
- Los cambios al importador se aplican a los productos ya cargados con una corrida completa (`POST /sync/:canalId?dryRun=false`); el sync incremental solo alcanza lo modificado en Woo desde la última marca.

---

## Resumen

| Nº | Fecha | Área | Título | Estado |
|---|---|---|---|---|
| R-001 | 2026-09-02 | Importador | Variaciones con el nombre del padre repetido | Corregido |
| R-002 | 2026-09-02 | Importador / Mostrador | El SKU de las variaciones es un EAN y no llegaba a `codigoBarras` | Corregido |
| R-003 | 2026-09-02 | Importador | Las variaciones no recordaban a su producto padre | Corregido |
| R-004 | 2026-09-02 | Datos del origen | Variación sin SKU en Woo (Katana Blue, id 2898) | Abierto (dato del canal) |
| R-005 | 2026-09-02 | Mostrador (V2) | Accesos rápidos con pestañas fijas en vez de las categorías reales | Corregido (ajusta 05-SDD) |
| R-006 | 2026-09-02 | Mostrador (V2) | Accesos rápidos: vista de lista con miniatura además de la grilla | Corregido (amplía 05-SDD §5.2) |

---

## Detalle

### R-001 · Variaciones con el nombre del padre repetido

- **Fecha:** 2026-09-02. **Estado:** Corregido.
- **Dónde se vio:** buscador del mostrador (V2) con «katana». Producto de referencia: <https://onplaygames.cl/producto/katana-sleeves-standard-size-100/> (id 2897, variable, 19 variaciones por color).
- **Qué pasaba:** en Woo el atributo de variación se llama igual que el producto y cada opción repite el nombre completo («Katana Sleeves Standard Size (100) - Red»). El importador armaba `padre — opción`, y quedaba «Katana Sleeves Standard Size (100) — Katana Sleeves Standard Size (100) - Red» (105–110 caracteres). En el buscador las 19 filas empezaban idénticas y el color quedaba al final. Afectaba a 242 productos de 35 padres variables.
- **Decisión:** el nombre de una variación no repite el padre. Regla en `nombreDeVariacion` (`apps/api/src/sync/variaciones.ts`):
  - la opción repite el padre como prefijo → `padre — resto` («… (100) — Red»);
  - la opción es un nombre completo por sí sola → se usa la opción sola. Cuenta como completa si contiene el padre entero, o si tiene 4+ palabras y comparte la mitad o más de las palabras del padre (caso Cortex: padre «Protectores Ultimate Guard: Cortex Sleeves Matte Standard Size (100pzs)», opción «Cortex Sleeves Matte Standard Size (100) - Transparent»);
  - cualquier otra → `padre — opción`, como antes. Varias opciones siguen uniéndose con ` / `.
  - La comparación ignora mayúsculas, espacios dobles, guiones tipográficos y comillas («» vs ""): el origen los mezcla (caso «Guild Summit»).
- **Resultado en datos:** dos corridas completas de onplaygames_cl el 2026-09-02 (469 y 98 actualizados); ningún nombre con ` — ` supera los 85 caracteres.
- **Alcance:** cambia solo el `nombre`. No toca SKU maestro, tipo, categoría ni `externoSku` (P3). Como el nombre entra al hash de sync, la siguiente corrida completa actualiza los 242.
- **Tests:** `apps/api/src/sync/variaciones.test.ts`.

### R-002 · El SKU de las variaciones es un EAN y no llegaba a `codigoBarras`

- **Fecha:** 2026-09-02. **Estado:** Corregido.
- **Dónde se vio:** escáner en el mostrador. `GET /productos/buscar?q=4260250073780` (EAN del Katana Red) devolvía 0 resultados.
- **Qué pasaba:** el importador solo llenaba `codigoBarras` desde `meta_data` (claves `barcode`, `ean`, `gtin`…), y onplaygames.cl no las usa. Pero en ese canal el SKU de la variación **es** el EAN-13 del fabricante (Ultimate Guard, etc.). Había 337 filas de `ProductoCanal` en onplaygames_cl con SKU externo numérico de 12–14 dígitos y `codigoBarras` nulo. Ninguna se podía escanear.
- **Decisión:** si el SKU externo tiene forma de código de barras (EAN-8, UPC-A, EAN-13, GTIN-14: solo dígitos, largo 8 o 12–14) y no vino uno por `meta_data`, se copia a `codigoBarras`. Regla `codigoBarrasDesdeSku` en `variaciones.ts`; aplica a variaciones y a productos simples.
- **Resultado en datos:** 338 productos con `codigoBarras` tras la corrida (antes: 1). `GET /productos/buscar?q=4260250073780` devuelve ACC-000079 «Katana Sleeves Standard Size (100) — Red».
- **Regla de actualización (§6.5):** en productos ya importados el importador **completa** `codigoBarras` solo si está vacío. Un código cargado a mano nunca se pisa (`completarFaltantes` en `importador.ts`).
- **Tests:** `variaciones.test.ts` (acepta 8/12/13/14 dígitos, rechaza `OP11-001-NM-EN`, `2897-V2898`, 9 dígitos).

### R-003 · Las variaciones no recordaban a su producto padre

- **Fecha:** 2026-09-02. **Estado:** Corregido (dato guardado; sin uso en UI todavía).
- **Qué pasaba:** cada color de un producto variable queda como producto independiente (§6.2 regla 3, correcto para E1), pero nada vinculaba a los 19 Katana entre sí. E2 (stock por variante) y E3 (escribir a Woo, donde la variación cuelga del padre: `products/{padre}/variations/{id}`) necesitan ese vínculo.
- **Decisión:** guardar en `Producto.atributos` (JSON) dos claves: `padreExternoId` (id del producto padre en el canal, como texto) y `variante` (texto limpio de la opción, ej. «Red»). No se agrega columna ni tabla (SDD §6.2: nada antes de la etapa que lo necesita); cuando E3 lo requiera, migrar desde el JSON es trivial.
- **Regla de actualización:** en productos ya importados solo se agregan las claves si faltan; el resto de `atributos` no se toca.
- **Resultado en datos:** 241 productos con `padreExternoId` (las 242 variaciones menos la que falla por SKU duplicado en el origen).
- **Agendado (E3):** usar `padreExternoId` para agrupar variantes en la UI y para el push de stock/precio por variación.

### R-004 · Variación sin SKU en Woo (Katana Blue, id 2898)

- **Fecha:** 2026-09-02. **Estado:** Abierto (corrección de datos en el canal, no de código).
- **Qué pasa:** de las 19 variaciones del Katana (id 2897), solo «Blue» (id 2898) no tiene SKU en Woo. El importador le sintetiza `externoSku = 2897-V2898` (regla existente) y por lo tanto no tiene EAN escaneable.
- **Acción sugerida:** cargar el EAN en el SKU de esa variación en onplaygames.cl; el próximo sync incremental lo recoge y R-002 lo convierte en `codigoBarras`. (P2: se corrige en el canal, `onplay-core` solo lee.)

### R-005 · Accesos rápidos con pestañas fijas en vez de las categorías reales

- **Fecha:** 2026-09-02. **Estado:** Corregido. **Ajusta 05-SDD §V2 «Accesos rápidos»** (que fijaba `Snacks`, `Sellado`, `Cartas`).
- **Dónde se vio:** Mostrador (V2), control segmentado sobre la grilla táctil.
- **Qué pasaba:** las tres pestañas estaban escritas en el código. El catálogo real tiene además **Accesorios** (263 productos activos) y **Juegos de Mesa** (50) que no se podían alcanzar sin escribir en el buscador, y las subcategorías de Snacks (Bebidas, Aguas, Confitería, Energéticas) no se veían. Además el árbol de categorías no se guardaba localmente: sin conexión al abrir, no había pestañas (P8).
- **Decisión:** las pestañas son las **categorías raíz reales que tienen productos en el caché local** (las vacías, como Eventos o Sin clasificar, no aparecen). Dentro de una raíz, las subcategorías con productos aparecen como filtros con su conteo («Bebidas · 1»). Se conserva la regla original de «Cartas», ahora generalizada: si la selección supera 60 productos y tiene subcategorías, hay que elegir una primero; si una hoja supera 60, se muestran 60 en orden alfabético con el aviso «Se muestran 60 de N…». El árbol de categorías se persiste en IndexedDB (`meta.categorias`) como respaldo offline.
- **Archivos:** `apps/web/src/components/AccesoRapido.tsx`, `apps/web/src/catalogo.ts` (`contarProductos`, `categorias()` con respaldo local).
- **Agendado (E2):** cuando exista stock, ocultar de la grilla los productos con stock 0 en la ubicación del mostrador.

### R-006 · Accesos rápidos: vista de lista con miniatura además de la grilla

- **Fecha:** 2026-09-02. **Estado:** Corregido. Pedido del dueño durante la revisión visual.
- **Qué pasaba:** los productos de los accesos rápidos solo se veían como tarjetas (grilla), sin imagen. Para protectores, carpetas y sellado el color o la portada se reconoce mejor por la foto que por el nombre.
- **Decisión:** conmutador **Grilla / Lista** junto a las pestañas. La grilla queda igual (tarjeta con precio y «+»). La lista muestra miniatura de 40 px, nombre, SKU, precio y «+»; si no hay imagen o no carga (sin conexión), aparece un marcador neutro. La preferencia se recuerda en `localStorage` (`onplay.accesos-vista`, solo interfaz, S3).
- **Cambio de contrato acotado:** `GET /productos/catalogo-offline` agrega `imagenUrl` a los campos de `02-SDD §5.2`. Es solo la URL (la imagen se descarga bajo demanda con `loading="lazy"`), así que el payload crece poco y el caché sigue siendo utilizable sin conexión. Para que las filas ya cacheadas reciban el campo, el caché lleva un número de esquema (`meta.esquema`, hoy 2): si no coincide, la próxima actualización baja el catálogo completo una sola vez y luego vuelve al delta `?desde`.
- **Archivos:** `apps/api/src/rutas/productos.ts` (select del offline), `apps/web/src/catalogo.ts` (`imagenUrl` opcional en `ProductoCache`, `ESQUEMA_CATALOGO`), `apps/web/src/components/AccesoRapido.tsx` (`ConmutadorVista`, `FilaProducto`, `Miniatura`).
- **Agendado (E3):** las imágenes vienen de los sitios Woo; si algún día se sirven desde `onplay-core`, cambiar solo la URL en el importador.

---

## Cómo agregar una entrada

1. Tomar el siguiente `R-NNN`.
2. Agregar la fila al Resumen y la sección en Detalle con: fecha, dónde se vio, qué pasaba, decisión, alcance/tests.
3. Si es un cambio de código, nombrar el archivo y agregar el test.
4. Si amplía alcance, marcar `Agendado (E#)` y dejarlo; no construirlo.
