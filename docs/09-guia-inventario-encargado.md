# 09 — Guía del encargado: inventario (Etapa 2)

Para quien atiende la tienda. Sin jerga: qué hacer, en qué orden y qué esperar. La spec técnica es `03-SDD-etapa2-inventario.md`.

## La idea en tres líneas

1. **El sistema no adivina cuánto hay: alguien lo cuenta.** Hasta que un producto se cuente, se vende igual, pero sin descontar nada.
2. **Contar enciende el control.** Al cerrar un recuento, los productos contados empiezan a descontar con cada venta.
3. **Nada se borra.** Cada entrada y salida queda anotada con quién, cuándo y por qué. Si un número está mal, se corrige con un recuento o un ajuste, no se edita.

## Por dónde empezar (orden recomendado)

Snacks → sellado → accesorios → juegos de mesa. Las cartas sueltas al final, o nunca: son miles y se venden bien sin control.

## Primer recuento, paso a paso

1. Backoffice → **Recuentos** → **Nuevo recuento**.
2. Nombre («Snacks mostrador 03-09»), ubicación **Mostrador**, alcance **Snacks**. Crear y contar.
3. Con la lista abierta: escanea cada producto o escribe su nombre y pulsa Enter. **Cada lectura suma 1.** Si prefieres, escribe el total directo en la columna «Contado».
4. Lo que no esté en la lista (un producto nuevo) se agrega solo al escanearlo.
5. Marca «Solo pendientes» para ver qué falta. La barra muestra el avance.
6. **Cerrar recuento.** El resumen dice cuántos contaste, cuántos tenían diferencia y cuántos empiezan a controlar stock. Confirma.
7. Lo que **no** contaste no cambia ni se enciende. Puedes hacer otro recuento después.

**Cuándo está listo el inventario de una tanda:** dos recuentos seguidos que cuadren (la lista muestra «100% cuadrado»).

## Día a día

| Situación | Qué hacer | Dónde |
|---|---|---|
| Llegó mercadería | **Ingresar** con nota («pedido proveedor X») | Stock → fila → Ingresar |
| Se rompió, venció o se perdió algo | **Merma** con nota | Stock → fila → Merma |
| El número no calza y ya sabes por qué | **Ajustar** con nota | Stock → fila → Ajustar |
| El número no calza y no sabes por qué | **Recontar** ese producto | Alertas → Recontar |
| Mueves cosas de bodega al mostrador | **Trasladar** | Stock → fila → Trasladar |
| Un producto sin control empieza a importar | **Ingresar y encender** (o incluirlo en un recuento) | Stock → filtro «Sin control» |

La nota es obligatoria en todos: sin ella no se guarda.

## Qué significan los avisos

- **stock 3**: hay 3 en total (todas las ubicaciones).
- **sin stock** (rojo): el sistema cree que no queda y **no deja agregarlo a la venta**. Si el producto está en la mano del cliente, el número del sistema está mal: un encargado lo corrige con **Ingresar** o **Recontar** y después se vende.
- El carrito no acepta más unidades que las disponibles; el «+» se apaga en el tope.
- **último en la web**: la tienda online muestra 1. Avísale al cliente si es la última.
- **agotado en la web / reservado para un pedido web pagado**: la web ya lo vendió y cobró. **El pedido web tiene prioridad.** El vendedor no puede cobrarlo; un encargado puede «vender igual» escribiendo el motivo, y queda registrado.

## Devoluciones

Backoffice → **Ventas** → abre la venta → **Devolver…**

- Elige cuántas unidades vuelven por línea. Desmarca «Repone» si el producto viene dañado (no vuelve al stock).
- Efectivo: sale de **tu** caja abierta, aunque la venta sea de otro día. Monedero: queda como saldo del cliente. Otro: débito o transferencia devueltos fuera del sistema.
- El motivo es obligatorio. Sale un folio **D-2026-00001**.
- Una venta con devoluciones ya no se anula: se devuelve el resto.

## Caja

Mostrador → **Caja ±**: retiro (depósito al banco) o ingreso (sencillo para vueltos), con nota. Al cerrar la caja, el sistema ya lo descuenta o lo suma.

## Lo que el sistema NO hace todavía (para no buscarlo)

- No escribe stock ni precios en la web. Eso es la Etapa 3.
- No descuenta las ventas online. También Etapa 3. Por eso el aviso «reservado» es una probabilidad basada en lo que la web publica, con hasta 30 minutos de atraso.
- No calcula costos ni márgenes (Etapa 6).
