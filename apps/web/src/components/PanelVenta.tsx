// Panel de venta (05-SDD V2 §7.1): líneas con pasos −/+, precio editable con
// insignia, descuento global en pesos con tope, total en --t-total y Cobrar de 50 px.
import { memo, useState } from 'react';
import type { LineaCarrito } from '../tipos.js';
import { clp } from '../utils/formato.js';
import { Boton, CampoMonto, Insignia } from './base.js';

export const LineaVenta = memo(function LineaVenta({
  linea,
  onCantidad,
  onPrecio,
  onEliminar,
}: {
  linea: LineaCarrito;
  onCantidad: (clave: string, cantidad: number) => void;
  onPrecio: (clave: string, precio: number) => void;
  onEliminar: (clave: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<number | ''>(linea.precioUnitario);
  const editado = linea.precioCatalogo !== null && linea.precioUnitario !== linea.precioCatalogo;

  const menos = () => {
    if (linea.cantidad <= 1) {
      onEliminar(linea.clave);
      return;
    }
    onCantidad(linea.clave, linea.cantidad - 1);
  };

  const confirmarPrecio = () => {
    setEditando(false);
    if (borrador !== '' && borrador !== linea.precioUnitario) onPrecio(linea.clave, borrador);
  };

  return (
    <li className="border-b border-sep py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-cuerpo font-medium text-lab">{linea.descripcion}</span>
        <span className="num shrink-0 font-semibold text-lab">
          {clp(linea.cantidad * linea.precioUnitario)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={menos}
            aria-label={linea.cantidad <= 1 ? `Quitar ${linea.descripcion}` : 'Restar uno'}
            className="flex h-[36px] w-[36px] items-center justify-center rounded border border-sep bg-bg text-lab2"
          >
            −
          </button>
          <span className="num w-8 text-center text-cuerpo text-lab">{linea.cantidad}</span>
          <button
            type="button"
            onClick={() => onCantidad(linea.clave, linea.cantidad + 1)}
            aria-label="Sumar uno"
            className="flex h-[36px] w-[36px] items-center justify-center rounded border border-sep bg-bg text-lab2"
          >
            +
          </button>
        </div>
        {editando ? (
          <div className="w-[128px]">
            <CampoMonto
              etiqueta="Precio unitario"
              valor={borrador}
              onValor={setBorrador}
              autoFocus
              onBlur={confirmarPrecio}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmarPrecio();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setBorrador(linea.precioUnitario);
                  setEditando(false);
                }
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setBorrador(linea.precioUnitario);
              setEditando(true);
            }}
            aria-label={`Editar precio de ${linea.descripcion}`}
            className="num rounded px-2 py-1 text-cuerpo text-lab2 underline decoration-dotted underline-offset-4"
          >
            {clp(linea.precioUnitario)} c/u
          </button>
        )}
      </div>
      {editado ? (
        <div className="mt-1 text-right">
          <Insignia tono="alerta">precio editado · catálogo {clp(linea.precioCatalogo!)}</Insignia>
        </div>
      ) : null}
    </li>
  );
});

interface Props {
  lineas: LineaCarrito[];
  descuento: number | '';
  onDescuento: (v: number | '') => void;
  onCantidad: (clave: string, cantidad: number) => void;
  onPrecio: (clave: string, precio: number) => void;
  onEliminar: (clave: string) => void;
  onCobrar: () => void;
}

/** Motivo por el que no se puede cobrar, o null si se puede (I6). */
export function motivoNoCobrable(lineas: LineaCarrito[], descuento: number | ''): string | null {
  if (lineas.length === 0) return 'Agrega productos para cobrar.';
  const enCero = lineas.filter((l) => l.precioUnitario === 0).length;
  if (enCero > 0) return `Hay ${enCero} producto${enCero > 1 ? 's' : ''} con precio en $0.`;
  const totalLineas = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  if ((descuento || 0) > totalLineas) return `El descuento no puede superar ${clp(totalLineas)}.`;
  return null;
}

export function PanelVenta({ lineas, descuento, onDescuento, onCantidad, onPrecio, onEliminar, onCobrar }: Props) {
  const totalLineas = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const total = Math.max(0, totalLineas - (descuento || 0));
  const motivo = motivoNoCobrable(lineas, descuento);
  const errorDescuento =
    (descuento || 0) > totalLineas ? `El descuento no puede superar ${clp(totalLineas)}.` : undefined;
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  return (
    <section aria-label="Venta actual" className="flex h-full flex-col rounded-tarjeta bg-bg p-4 shadow-tarjeta">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-tit text-lab">Venta actual</h2>
        {unidades > 0 ? <Insignia>{unidades} ítem{unidades > 1 ? 's' : ''}</Insignia> : null}
      </div>

      {lineas.length === 0 ? (
        <p className="flex-1 py-8 text-center text-cuerpo text-lab3">
          Busca o escanea un producto para empezar.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {lineas.map((l) => (
            <LineaVenta
              key={l.clave}
              linea={l}
              onCantidad={onCantidad}
              onPrecio={onPrecio}
              onEliminar={onEliminar}
            />
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-sep pt-3">
        <div className="num flex items-center justify-between text-cuerpo text-lab2">
          <span>Subtotal</span>
          <span>{clp(totalLineas)}</span>
        </div>
        <div className="mt-2">
          <CampoMonto
            etiqueta="Descuento"
            valor={descuento}
            onValor={onDescuento}
            error={errorDescuento}
          />
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-cuerpo text-lab2">Total</span>
          <span className="num text-total font-semibold text-lab">{clp(total)}</span>
        </div>
        <div className="mt-3">
          <Boton
            variante="principal"
            tamano="grande"
            onClick={onCobrar}
            deshabilitado={motivo !== null}
            motivoDeshabilitado={lineas.length > 0 ? (motivo ?? undefined) : undefined}
          >
            Cobrar · F2
          </Boton>
        </div>
      </div>
    </section>
  );
}
