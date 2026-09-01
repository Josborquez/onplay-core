// V5 — Productos (05-SDD §7): tabla paginada por cursor, 50 por página.
// NUNCA se carga el catálogo completo. Sin contador total (§14 H5), sin filtro
// por canal (§14 H4); la columna Canales sale de GET /productos/:id al expandir.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ErrorApi } from '../../api.js';
import { categorias } from '../../catalogo.js';
import { useEnLinea } from '../../tema.js';
import { ETIQUETA_TIPO, type ProductoAdmin, type TipoProducto } from '../../tipos.js';
import { clp, fecha } from '../../utils/formato.js';
import { Banner, Boton, Campo, CampoMonto, Cargando, Dialogo, Insignia, Segmentado, Vacio } from '../../components/base.js';
import { aplanarCategorias, Encabezado, Selecto, type OpcionCategoria } from './util.js';

interface DetalleProducto extends ProductoAdmin {
  canales: { canalId: string; externoSku: string | null; precioCanal: number | null; sincronizadoEn: string | null }[];
}

const OPCIONES_TIPO = (Object.keys(ETIQUETA_TIPO) as TipoProducto[]).map((t) => ({
  valor: t,
  etiqueta: ETIQUETA_TIPO[t],
}));

function FilaProducto({
  producto,
  onCambiarPrecio,
}: {
  producto: ProductoAdmin;
  onCambiarPrecio: (p: ProductoAdmin) => void;
}) {
  const [detalle, setDetalle] = useState<DetalleProducto | 'cargando' | null>(null);
  const abierta = detalle !== null;

  const conmutar = async () => {
    if (abierta) {
      setDetalle(null);
      return;
    }
    setDetalle('cargando');
    try {
      setDetalle(await api<DetalleProducto>(`/productos/${producto.id}`));
    } catch {
      setDetalle(null);
    }
  };

  return (
    <li>
      <div className="flex min-h-fila w-full items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={() => void conmutar()}
          aria-expanded={abierta}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-2">
            <span className={`truncate text-cuerpo ${producto.activo ? 'text-lab' : 'text-lab3'}`}>
              {producto.nombre}
            </span>
            {producto.posibleDuplicado ? <Insignia tono="alerta">⚠ posible duplicado</Insignia> : null}
            {!producto.activo ? <Insignia>inactivo</Insignia> : null}
          </span>
          <span className="block font-mono text-chico text-lab3">
            {producto.sku}
            {producto.cardNumber ? ` · ${producto.cardNumber}` : ''}
          </span>
        </button>
        <span className="hidden w-[112px] shrink-0 text-chico text-lab2 sm:block">{ETIQUETA_TIPO[producto.tipo]}</span>
        <button
          type="button"
          onClick={() => onCambiarPrecio(producto)}
          className="num w-[96px] shrink-0 rounded px-1 text-right text-cuerpo text-lab underline decoration-dotted underline-offset-4"
          aria-label={`Cambiar el precio de ${producto.nombre}`}
        >
          {clp(producto.precioVenta)}
        </button>
      </div>
      {abierta ? (
        <div className="border-t border-sep bg-bg2 px-4 py-3 text-chico text-lab2">
          {detalle === 'cargando' ? (
            <Cargando texto="Cargando canales…" />
          ) : (
            <>
              <p className="mb-1 text-lab3">Canales</p>
              {detalle.canales.length === 0 ? (
                <p>Solo en la tienda física: no está publicado en ningún canal.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detalle.canales.map((c) => (
                    <li key={c.canalId} className="flex flex-wrap items-center gap-2">
                      <Insignia>{c.canalId}</Insignia>
                      {c.externoSku ? <span className="font-mono">{c.externoSku}</span> : null}
                      {c.precioCanal !== null ? <span className="num">{clp(c.precioCanal)}</span> : null}
                      {c.sincronizadoEn ? <span className="text-lab3">sync {fecha(c.sincronizadoEn)}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function Productos() {
  const [parametros] = useSearchParams();
  const [q, setQ] = useState(parametros.get('q') ?? '');
  const [tipo, setTipo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [soloDuplicados, setSoloDuplicados] = useState<'si' | null>(null);
  const [actividad, setActividad] = useState<'activos' | 'inactivos' | null>(null);
  const [opcionesCategoria, setOpcionesCategoria] = useState<OpcionCategoria[]>([]);
  const [lista, setLista] = useState<ProductoAdmin[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(false);
  const [editando, setEditando] = useState<ProductoAdmin | null>(null);
  const [precioNuevo, setPrecioNuevo] = useState<number | ''>('');
  const [guardando, setGuardando] = useState(false);
  const enLinea = useEnLinea();

  useEffect(() => {
    void categorias().then((arbol) => setOpcionesCategoria(aplanarCategorias(arbol)));
  }, []);

  const consulta = useCallback(
    (conCursor: string | null) => {
      const p = new URLSearchParams({ limit: '50' });
      if (q.trim().length >= 2) p.set('q', q.trim());
      if (tipo) p.set('tipo', tipo);
      if (categoriaId) p.set('categoriaId', categoriaId);
      if (soloDuplicados) p.set('posibleDuplicado', 'true');
      if (actividad) p.set('activo', actividad === 'activos' ? 'true' : 'false');
      if (conCursor) p.set('cursor', conCursor);
      return api<{ productos: ProductoAdmin[]; siguienteCursor: string | null }>(`/productos?${p}`);
    },
    [q, tipo, categoriaId, soloDuplicados, actividad],
  );

  // Primera página al cambiar cualquier filtro, con debounce por el texto.
  const generacion = useRef(0);
  useEffect(() => {
    const mia = ++generacion.current;
    setError(false);
    const id = setTimeout(() => {
      consulta(null)
        .then((r) => {
          if (generacion.current !== mia) return;
          setLista(r.productos);
          setCursor(r.siguienteCursor);
        })
        .catch(() => {
          if (generacion.current === mia) setError(true);
        });
    }, 300);
    return () => clearTimeout(id);
  }, [consulta]);

  const cargarMas = async () => {
    if (!cursor) return;
    setCargandoMas(true);
    try {
      const r = await consulta(cursor);
      setLista((prev) => [...(prev ?? []), ...r.productos]);
      setCursor(r.siguienteCursor);
    } catch {
      setError(true);
    } finally {
      setCargandoMas(false);
    }
  };

  const abrirCambioPrecio = (p: ProductoAdmin) => {
    setEditando(p);
    setPrecioNuevo(p.precioVenta);
  };

  // Cambiar el precio pide confirmación con valor anterior y nuevo: acción auditada (V5).
  const confirmarPrecio = async () => {
    if (!editando || precioNuevo === '') return;
    setGuardando(true);
    try {
      const actualizado = await api<ProductoAdmin>(`/productos/${editando.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ precioVenta: precioNuevo }),
      });
      setLista((prev) => prev?.map((p) => (p.id === actualizado.id ? { ...p, precioVenta: actualizado.precioVenta } : p)) ?? null);
      setEditando(null);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'PRECIO_INVALIDO') setPrecioNuevo('');
      else setError(true);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4">
      <Encabezado titulo="Productos" />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-[256px]">
          <Campo etiqueta="Buscar" placeholder="Nombre del producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-[176px]">
          <Selecto etiqueta="Tipo" valor={tipo} onValor={setTipo} opciones={OPCIONES_TIPO} vacia="Todos" />
        </div>
        <div className="w-[224px]">
          <Selecto
            etiqueta="Categoría"
            valor={categoriaId}
            onValor={setCategoriaId}
            opciones={opcionesCategoria.map((c) => ({ valor: c.id, etiqueta: c.etiqueta }))}
            vacia="Todas"
          />
        </div>
        <Segmentado
          opciones={[{ valor: 'si', etiqueta: '⚠ Duplicados' }]}
          valor={soloDuplicados}
          onChange={setSoloDuplicados}
        />
        <Segmentado
          opciones={[
            { valor: 'activos', etiqueta: 'Activos' },
            { valor: 'inactivos', etiqueta: 'Inactivos' },
          ]}
          valor={actividad}
          onChange={setActividad}
        />
      </div>

      {error ? (
        <div className="mb-3">
          <Banner tono="peligro" accion={<Boton onClick={() => setQ((v) => v)}>Reintentar</Boton>}>
            No se pudo cargar el listado. Revisa la conexión y vuelve a intentar.
          </Banner>
        </div>
      ) : null}

      {lista === null ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="rounded-tarjeta bg-bg p-4 shadow-tarjeta">
          <Vacio mensaje="No hay productos con estos filtros. Ajusta la búsqueda o los filtros." />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-sep overflow-hidden rounded-tarjeta bg-bg shadow-tarjeta">
            {lista.map((p) => (
              <FilaProducto key={p.id} producto={p} onCambiarPrecio={abrirCambioPrecio} />
            ))}
          </ul>
          {cursor ? (
            <div className="mt-3 w-[192px]">
              <Boton cargando={cargandoMas} onClick={() => void cargarMas()}>
                Cargar 50 más
              </Boton>
            </div>
          ) : null}
        </>
      )}

      <Dialogo
        abierto={editando !== null}
        titulo="Cambiar el precio"
        onCerrar={() => setEditando(null)}
        ancho={420}
      >
        {editando ? (
          <div className="flex flex-col gap-4">
            <p className="text-cuerpo text-lab">{editando.nombre}</p>
            <p className="text-cuerpo text-lab2">
              Precio actual: <span className="num text-lab">{clp(editando.precioVenta)}</span>
            </p>
            <CampoMonto etiqueta="Precio nuevo" valor={precioNuevo} onValor={setPrecioNuevo} autoFocus />
            <p className="text-chico text-lab3">El cambio queda registrado en la auditoría con el valor anterior y el nuevo.</p>
            <Boton
              variante="principal"
              cargando={guardando}
              deshabilitado={precioNuevo === '' || precioNuevo === editando.precioVenta || !enLinea}
              motivoDeshabilitado={
                !enLinea
                  ? 'Necesitas conexión para esto.'
                  : precioNuevo === ''
                    ? 'Escribe el precio nuevo.'
                    : precioNuevo === editando.precioVenta
                      ? 'El precio nuevo es igual al actual.'
                      : undefined
              }
              onClick={() => void confirmarPrecio()}
            >
              {precioNuevo === '' ? 'Confirmar cambio' : `Cambiar a ${clp(precioNuevo)}`}
            </Boton>
          </div>
        ) : null}
      </Dialogo>
    </div>
  );
}
