// V3 — Cobro (05-SDD §7.2). Teclado dentro del diálogo: foco en Efectivo,
// 1–6 eligen medio, Enter agrega el pago por lo que falta, segundo Enter confirma.
import { useEffect, useRef, useState } from 'react';
import { ErrorApi } from '../api.js';
import { ETIQUETA_MEDIO, MEDIOS_ORDEN, type MedioPago, type PagoNuevo } from '../tipos.js';
import { clp } from '../utils/formato.js';
import { Banner, Boton, Campo, CampoMonto, Dialogo, Insignia } from './base.js';

const CON_REFERENCIA: MedioPago[] = ['debito', 'credito', 'transferencia'];

interface Exito {
  /** null = quedó encolada sin conexión; el folio lo asigna el servidor al llegar. */
  folio: string | null;
  total: number;
  vuelto: number;
  advertencias: number;
}

interface Props {
  abierto: boolean;
  total: number;
  enLinea: boolean;
  onCerrar: () => void;
  /** Hace el POST /ventas y devuelve folio + nº de advertencias. */
  onConfirmar: (pagos: PagoNuevo[]) => Promise<{ folio: string; advertencias: number }>;
  /** Sin conexión: encola la venta en IndexedDB (F10). */
  onEncolar: (pagos: PagoNuevo[]) => void;
  /** Éxito consumido: limpiar carrito y devolver el foco al buscador. */
  onListo: () => void;
}

export function DialogoCobro({ abierto, total, enLinea, onCerrar, onConfirmar, onEncolar, onListo }: Props) {
  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [monto, setMonto] = useState<number | ''>('');
  const [recibido, setRecibido] = useState<number | ''>('');
  const [referencia, setReferencia] = useState('');
  const [pagos, setPagos] = useState<PagoNuevo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState<Exito | null>(null);
  const refEfectivo = useRef<HTMLButtonElement>(null);

  const asignado = pagos.reduce((s, p) => s + p.monto, 0);
  const falta = total - asignado;

  // Al abrir: estado limpio, monto precargado con el total y foco en Efectivo.
  useEffect(() => {
    if (!abierto) return;
    setMedio('efectivo');
    setMonto(total);
    setRecibido('');
    setReferencia('');
    setPagos([]);
    setEnviando(false);
    setError('');
    setExito(null);
    const id = setTimeout(() => refEfectivo.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [abierto, total]);

  // Éxito: 2 segundos y de vuelta al mostrador (Enter lo adelanta).
  useEffect(() => {
    if (!exito) return;
    const id = setTimeout(onListo, 2000);
    return () => clearTimeout(id);
  }, [exito, onListo]);

  const elegirMedio = (m: MedioPago) => {
    setMedio(m);
    setError('');
  };

  const agregarPago = () => {
    const montoNum = monto === '' ? falta : monto;
    if (montoNum <= 0) {
      setError('El monto debe ser mayor que $0.');
      return;
    }
    if (montoNum > falta) {
      setError(`Este pago no puede superar lo que falta (${clp(falta)}).`);
      return;
    }
    const pago: PagoNuevo = { medio, monto: montoNum };
    if (medio === 'efectivo' && recibido !== '') {
      if (recibido < montoNum) {
        setError('Lo recibido no puede ser menor que el monto en efectivo.');
        return;
      }
      pago.montoRecibido = recibido;
    }
    if (CON_REFERENCIA.includes(medio) && referencia.trim() !== '') {
      pago.referencia = referencia.trim();
    }
    const nuevos = [...pagos, pago];
    setPagos(nuevos);
    setError('');
    setMonto(total - nuevos.reduce((s, p) => s + p.monto, 0));
    setRecibido('');
    setReferencia('');
  };

  const quitarPago = (i: number) => {
    const nuevos = pagos.filter((_, j) => j !== i);
    setPagos(nuevos);
    setMonto(total - nuevos.reduce((s, p) => s + p.monto, 0));
  };

  const vueltoDe = (lista: PagoNuevo[]) =>
    lista.reduce((s, p) => s + (p.montoRecibido != null ? p.montoRecibido - p.monto : 0), 0);

  const encolar = () => {
    onEncolar(pagos);
    setExito({ folio: null, total, vuelto: vueltoDe(pagos), advertencias: 0 });
  };

  const confirmar = async () => {
    if (falta !== 0 || enviando) return;
    if (!enLinea) {
      // F10: sin conexión se encola en IndexedDB, sin ningún diálogo extra.
      encolar();
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const r = await onConfirmar(pagos);
      setExito({ folio: r.folio, total, vuelto: vueltoDe(pagos), advertencias: r.advertencias });
    } catch (e) {
      if (!(e instanceof ErrorApi)) {
        // La red se cayó a mitad del cobro: se encola igual (la idempotencyKey
        // persistida garantiza que si el POST sí llegó, no se duplica).
        encolar();
        return;
      }
      const detalle = typeof e.cuerpo.detalle === 'string' ? ` ${e.cuerpo.detalle}` : '';
      setError(`No se pudo registrar la venta.${detalle} Intenta de nuevo.`);
      setEnviando(false);
    }
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (exito) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onListo();
      }
      return;
    }
    const enCampo = e.target instanceof HTMLInputElement;
    if (!enCampo && e.key >= '1' && e.key <= '6') {
      const m = MEDIOS_ORDEN[Number(e.key) - 1];
      if (m) {
        e.preventDefault();
        elegirMedio(m);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (falta > 0) agregarPago();
      else void confirmar();
    }
  };

  const vueltoVivo = medio === 'efectivo' && recibido !== '' && monto !== '' && recibido >= monto ? recibido - monto : null;

  return (
    <Dialogo
      abierto={abierto}
      titulo={exito ? (exito.folio ? 'Venta registrada' : 'Venta pendiente') : 'Cobrar'}
      onCerrar={exito ? onListo : onCerrar}
      cerrable={!enviando && !exito}
      ancho={480}
    >
      <div onKeyDown={alTeclear}>
        {exito ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            {exito.folio ? (
              <>
                <span aria-hidden="true" className="text-total text-ok">✓</span>
                <p className="text-tit text-lab">{exito.folio}</p>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-total text-alerta">⧗</span>
                <p className="text-tit text-lab">Pendiente de enviar</p>
                <p className="text-chico text-lab2">Se enviará sola cuando vuelva la conexión.</p>
              </>
            )}
            <p className="num text-total font-semibold text-lab">{clp(exito.total)}</p>
            {exito.vuelto > 0 ? (
              <p className="num text-tit text-lab">Vuelto: {clp(exito.vuelto)}</p>
            ) : null}
            {exito.advertencias > 0 ? (
              <p className="text-chico text-alerta">
                {exito.advertencias} producto{exito.advertencias > 1 ? 's' : ''} se vendió a un precio
                distinto del catálogo.
              </p>
            ) : null}
            <p className="text-chico text-lab3">Enter para seguir vendiendo.</p>
          </div>
        ) : (
          <>
            <p className="num mb-1 text-center text-total font-semibold text-lab">{clp(total)}</p>
            <p className="num mb-4 text-center text-cuerpo text-lab2">
              {falta > 0 ? `Falta por pagar: ${clp(falta)}` : 'Falta por pagar: $0'}
            </p>

            <div role="group" aria-label="Medio de pago" className="grid grid-cols-3 gap-2">
              {MEDIOS_ORDEN.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  ref={m === 'efectivo' ? refEfectivo : undefined}
                  onClick={() => elegirMedio(m)}
                  aria-pressed={medio === m}
                  className={`h-tactil rounded-campo border px-2 text-cuerpo ${
                    medio === m ? 'border-ac bg-ac-suave font-semibold text-lab' : 'border-sep bg-bg text-lab2'
                  }`}
                >
                  <span aria-hidden="true" className="num mr-1 text-chico text-lab3">{i + 1}</span>
                  {ETIQUETA_MEDIO[m]}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <CampoMonto etiqueta="Monto" valor={monto} onValor={setMonto} />
              {medio === 'efectivo' ? (
                <CampoMonto
                  etiqueta="Recibí"
                  valor={recibido}
                  onValor={setRecibido}
                  ayuda={vueltoVivo !== null ? `Vuelto: ${clp(vueltoVivo)}` : 'Opcional, para calcular el vuelto.'}
                />
              ) : CON_REFERENCIA.includes(medio) ? (
                <Campo
                  etiqueta="N° de operación"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  ayuda="Número del voucher o de la transferencia."
                />
              ) : (
                <div />
              )}
            </div>

            {falta > 0 ? (
              <div className="mt-3">
                <Boton onClick={agregarPago}>Agregar pago · Enter</Boton>
              </div>
            ) : null}

            {pagos.length > 0 ? (
              <ul className="mt-3 divide-y divide-sep rounded-campo border border-sep">
                {pagos.map((p, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-cuerpo text-lab">
                      {ETIQUETA_MEDIO[p.medio]}
                      {p.montoRecibido != null ? (
                        <span className="ml-2 text-chico text-lab3">
                          recibí {clp(p.montoRecibido)} · vuelto {clp(p.montoRecibido - p.monto)}
                        </span>
                      ) : null}
                      {p.referencia ? <span className="ml-2 font-mono text-chico text-lab3">{p.referencia}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num font-semibold text-lab">{clp(p.monto)}</span>
                      <button
                        type="button"
                        onClick={() => quitarPago(i)}
                        aria-label={`Quitar pago de ${ETIQUETA_MEDIO[p.medio]}`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded text-lab2"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {error ? (
              <div className="mt-3">
                <Banner tono="peligro">{error}</Banner>
              </div>
            ) : null}

            <div className="mt-4">
              <Boton
                variante="principal"
                tamano="grande"
                cargando={enviando}
                deshabilitado={falta !== 0}
                onClick={() => void confirmar()}
              >
                {falta !== 0
                  ? `Faltan ${clp(falta)} por asignar.`
                  : enLinea
                    ? 'CONFIRMAR VENTA'
                    : 'CONFIRMAR VENTA · sin conexión'}
              </Boton>
            </div>
            {pagos.length === 0 ? (
              <p className="mt-2 text-center text-chico text-lab3">
                <Insignia>Enter agrega el pago por lo que falta</Insignia>
              </p>
            ) : null}
          </>
        )}
      </div>
    </Dialogo>
  );
}
