// Accesos rápidos por categoría (05-SDD V2): grilla táctil alfabética contra el caché local.
// «Cartas» muestra primero subcategorías; máximo 60 productos por grilla.
import { useEffect, useMemo, useState } from 'react';
import {
  categorias,
  idsDelSubarbol,
  productosDeCategorias,
  type Categoria,
  type ProductoCache,
} from '../catalogo.js';
import { alCambiarCatalogo } from '../catalogo.js';
import { clp } from '../utils/formato.js';
import { Segmentado } from './base.js';

type Acceso = 'snacks' | 'sellado' | 'cartas';

export function AccesoRapido({ onAgregar }: { onAgregar: (p: ProductoCache) => void }) {
  const [acceso, setAcceso] = useState<Acceso | null>(null);
  const [raices, setRaices] = useState<Categoria[]>([]);
  const [subcategoria, setSubcategoria] = useState<Categoria | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void categorias().then(setRaices).catch(() => {});
    return alCambiarCatalogo(() => setVersion((v) => v + 1));
  }, []);

  const raiz = useMemo(() => {
    if (!acceso) return null;
    const buscada = { snacks: 'snacks', sellado: 'sellado', cartas: 'cartas' }[acceso];
    return raices.find((r) => r.slug === buscada || r.slug.startsWith(buscada)) ?? null;
  }, [acceso, raices]);

  useEffect(() => setSubcategoria(null), [acceso]);

  const productos = useMemo(() => {
    void version;
    if (!raiz) return [];
    if (acceso === 'cartas' && !subcategoria) return []; // primero las subcategorías
    const base = acceso === 'cartas' && subcategoria ? subcategoria : raiz;
    return productosDeCategorias(idsDelSubarbol(base), 60);
  }, [raiz, acceso, subcategoria, version]);

  return (
    <div className="no-imprimir">
      <Segmentado<Acceso>
        opciones={[
          { valor: 'snacks', etiqueta: 'Snacks' },
          { valor: 'sellado', etiqueta: 'Sellado' },
          { valor: 'cartas', etiqueta: 'Cartas' },
        ]}
        valor={acceso}
        onChange={setAcceso}
      />

      {acceso === 'cartas' && raiz && !subcategoria ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {raiz.hijos.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSubcategoria(sub)}
              className="h-tactil rounded border border-sep bg-bg px-3 text-left text-cuerpo text-lab"
            >
              {sub.nombre}
            </button>
          ))}
        </div>
      ) : null}

      {acceso && productos.length > 0 ? (
        <>
          {acceso === 'cartas' && subcategoria ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubcategoria(null)}
                className="h-[36px] rounded border border-sep bg-bg px-3 text-chico text-lab2"
              >
                ← {raiz?.nombre}
              </button>
              <p className="text-chico text-lab3">Usa el buscador para encontrar una carta puntual.</p>
            </div>
          ) : null}
          <div className="mt-3 grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {productos.map((p) => (
              // Tarjeta al estilo del POS de referencia: pie con precio + botón «+».
              // El botón es el objetivo accesible (teclado); el resto de la tarjeta también agrega.
              <div
                key={p.id}
                onClick={() => onAgregar(p)}
                className="flex min-h-fila cursor-pointer flex-col overflow-hidden rounded-tarjeta border border-sep bg-bg transition-all active:scale-[0.97]"
              >
                <p className="flex-1 p-2 text-left text-cuerpo font-medium leading-tight text-lab line-clamp-2">
                  {p.nombre}
                </p>
                <div className="mt-auto flex items-center justify-between gap-1 px-2 pb-2">
                  <span className="num font-black text-cuerpo leading-none text-lab">{clp(p.precioVenta)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgregar(p);
                    }}
                    aria-label={`Agregar ${p.nombre}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ac-relleno text-sobre-ac transition-all active:scale-90"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : acceso && !(acceso === 'cartas' && !subcategoria) ? (
        <p className="mt-3 text-chico text-lab3">No hay productos en esta categoría todavía.</p>
      ) : null}
    </div>
  );
}
