// Barra lateral plegable (05-SDD §3.1/§3.2) con conmutador de tema e indicador de conexión.
// Los ítems del backoffice solo aparecen para encargado+ (§6): un vendedor nunca entra a /admin.
import { NavLink } from 'react-router-dom';
import { useCola } from '../cola.js';
import { useSesion } from '../sesion.js';
import { useEnLinea } from '../tema.js';
import { rolAlcanza, type RolUsuario } from '../tipos.js';

const ITEMS: { a: string; etiqueta: string; icono: string; rol: RolUsuario }[] = [
  { a: '/', etiqueta: 'Mostrador', icono: '◧', rol: 'vendedor' },
  { a: '/mis-ventas', etiqueta: 'Mis ventas', icono: '◍', rol: 'vendedor' },
  { a: '/admin/productos', etiqueta: 'Productos', icono: '▤', rol: 'encargado' },
  { a: '/admin/snacks', etiqueta: 'Alta de snack', icono: '⊞', rol: 'encargado' },
  { a: '/admin/ventas', etiqueta: 'Ventas', icono: '◈', rol: 'encargado' },
  { a: '/admin/turnos', etiqueta: 'Turnos', icono: '▦', rol: 'encargado' },
  { a: '/admin/duplicados', etiqueta: 'Duplicados', icono: '⧉', rol: 'encargado' },
  { a: '/admin/auditoria', etiqueta: 'Auditoría', icono: '≣', rol: 'encargado' },
  { a: '/admin/sync', etiqueta: 'Sincronización', icono: '⇄', rol: 'admin' },
];

/** Estados de 05-SDD §8.1: en línea · sin conexión · sin conexión con N pendientes · enviando N. */
export function IndicadorConexion() {
  const enLinea = useEnLinea();
  const { pendientes, enviando } = useCola();
  const punto = enviando ? 'bg-ac animate-pulse' : enLinea ? 'bg-ok' : 'bg-alerta';
  const texto = enviando
    ? `enviando ${pendientes}…`
    : !enLinea && pendientes > 0
      ? `sin conexión · ${pendientes} venta${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''}`
      : enLinea
        ? 'en línea'
        : 'sin conexión';
  return (
    <div aria-live="polite" className="flex items-center gap-2 px-3 text-chico text-lab2">
      <span className={`inline-block h-2 w-2 rounded-full ${punto}`} aria-hidden="true" />
      {texto}
    </div>
  );
}

interface Props {
  plegada: boolean;
  onPlegar: () => void;
  tema: 'claro' | 'oscuro';
  onTema: () => void;
}

export function BarraLateral({ plegada, onPlegar, tema, onTema }: Props) {
  const { usuario, salir } = useSesion();
  const etiqueta = (visible: boolean, texto: string) => (
    <span
      className="whitespace-nowrap transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? undefined : 'none' }}
    >
      {texto}
    </span>
  );
  return (
    <nav className="material-barra no-imprimir flex h-full flex-col gap-1 overflow-hidden border-r border-sep py-4">
      <a
        href="#buscador"
        className="sr-only focus:not-sr-only focus:mx-3 focus:block focus:rounded focus:px-2 focus:py-1 focus:text-chico"
      >
        Saltar al buscador
      </a>
      <div className="mb-2 flex items-center justify-between px-3">
        {!plegada ? <span className="text-tit text-lab">OnPlay</span> : null}
        <button
          type="button"
          onClick={onPlegar}
          aria-label={plegada ? 'Desplegar la barra' : 'Plegar la barra'}
          className={`flex h-item-barra items-center justify-center rounded px-2 text-lab2 ${plegada ? 'w-full' : ''}`}
        >
          {plegada ? '⇥' : '⇤'}
        </button>
      </div>

      {ITEMS.filter((item) => usuario && rolAlcanza(usuario.rol, item.rol)).map((item) => (
        <NavLink
          key={item.a}
          to={item.a}
          end={item.a === '/'}
          aria-label={item.etiqueta}
          className={({ isActive }) =>
            `mx-2 flex h-item-barra items-center gap-3 rounded px-3 text-cuerpo ${
              isActive ? 'bg-ac-suave font-semibold text-lab' : 'text-lab2'
            } ${plegada ? 'justify-center' : ''}`
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className="relative">
                {item.icono}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute -left-2 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-rosa"
                  />
                ) : null}
              </span>
              {etiqueta(!plegada, item.etiqueta)}
            </>
          )}
        </NavLink>
      ))}

      <div className="mt-auto flex flex-col gap-2 border-t border-sep pt-3">
        {!plegada ? <IndicadorConexion /> : null}
        <button
          type="button"
          onClick={onTema}
          aria-pressed={tema === 'oscuro'}
          aria-label={tema === 'claro' ? 'Modo oscuro' : 'Modo claro'}
          className={`mx-2 flex h-item-barra items-center gap-3 rounded px-3 text-cuerpo text-lab2 ${plegada ? 'justify-center' : ''}`}
        >
          <span aria-hidden="true">{tema === 'claro' ? '☾' : '☀'}</span>
          {etiqueta(!plegada, tema === 'claro' ? 'Modo oscuro' : 'Modo claro')}
        </button>
        <button
          type="button"
          onClick={() => void salir()}
          aria-label="Salir"
          className={`mx-2 flex h-item-barra items-center gap-3 rounded px-3 text-cuerpo text-lab2 ${plegada ? 'justify-center' : ''}`}
        >
          <span aria-hidden="true">◔</span>
          {etiqueta(!plegada, `Salir · ${usuario?.nombre ?? ''}`)}
        </button>
      </div>
    </nav>
  );
}
