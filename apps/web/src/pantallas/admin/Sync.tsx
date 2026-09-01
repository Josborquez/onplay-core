// V10 — Sincronización (05-SDD §7, solo admin). Insignia SOLO LECTURA permanente
// y no ocultable (criterio 8). Simular es el botón principal; Importar, secundario
// (regla S1). Errores de SyncLog con "Marcar resuelto": el criterio 2 exige cero.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useEnLinea } from '../../tema.js';
import { fecha, hora } from '../../utils/formato.js';
import { Banner, Boton, Cargando, Insignia, Segmentado, Vacio } from '../../components/base.js';
import { Encabezado, Paginacion } from './util.js';

const CANALES = [
  { id: 'onplay_cl', nombre: 'onplay.cl' },
  { id: 'onplaygames_cl', nombre: 'onplaygames.cl' },
];

interface EstadoSync {
  soloLectura: boolean;
  canales: { canalId: string; productos: number; ultimoSync: string | null }[];
  erroresAbiertos: number;
  ultimaCorrida: { creadoEn: string; canalId: string | null; resultado: string } | null;
}

interface ResumenImportacion {
  canalId: string;
  dryRun: boolean;
  procesados: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  sinPrecio: number;
  sinClasificar: number;
  duplicadosMarcados: number;
  errores: { detalle: string }[];
  duracionMs: number;
}

interface RegistroSync {
  id: string;
  canalId: string | null;
  operacion: string;
  productoId: string | null;
  resultado: string;
  resuelto: boolean;
  detalle: string | null;
  creadoEn: string;
}

export function Sync() {
  const [estado, setEstado] = useState<EstadoSync | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [corriendo, setCorriendo] = useState<string | null>(null); // `${canalId}:${dryRun}`
  const [logs, setLogs] = useState<{ total: number; porPagina: number; logs: RegistroSync[] } | null>(null);
  const [soloErrores, setSoloErrores] = useState<'si' | null>('si');
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const enLinea = useEnLinea();

  const cargarEstado = useCallback(async () => {
    try {
      setEstado(await api<EstadoSync>('/sync/estado'));
    } catch {
      setError('No se pudo cargar el estado de sincronización.');
    }
  }, []);

  const cargarLogs = useCallback(async () => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    if (soloErrores) {
      p.set('resultado', 'error');
      p.set('resuelto', 'false');
    }
    try {
      setLogs(await api<{ total: number; porPagina: number; logs: RegistroSync[] }>(`/sync/logs?${p}`));
    } catch {
      setError('No se pudo cargar la bitácora de sincronización.');
    }
  }, [pagina, soloErrores]);

  useEffect(() => {
    void cargarEstado();
  }, [cargarEstado]);
  useEffect(() => {
    void cargarLogs();
  }, [cargarLogs]);

  const importar = async (canalId: string, dryRun: boolean) => {
    if (!dryRun && !window.confirm('Esto escribe en el catálogo maestro. ¿Importar de verdad?')) return;
    setCorriendo(`${canalId}:${dryRun}`);
    setResumen(null);
    setError(null);
    try {
      const r = await api<ResumenImportacion>(`/sync/${canalId}/importar?dryRun=${dryRun}`, { method: 'POST' });
      setResumen(r);
      await Promise.all([cargarEstado(), cargarLogs()]);
    } catch {
      setError('La importación falló. Revisa la bitácora y vuelve a intentar.');
    } finally {
      setCorriendo(null);
    }
  };

  const marcarResuelto = async (id: string) => {
    try {
      await api(`/sync/logs/${id}`, { method: 'PATCH', body: JSON.stringify({ resuelto: true }) });
      await Promise.all([cargarEstado(), cargarLogs()]);
    } catch {
      setError('No se pudo marcar el registro como resuelto.');
    }
  };

  return (
    <div className="p-4">
      {/* Recordatorio permanente del criterio de aceptación 8: E1 no escribe en Woo. */}
      <Encabezado titulo="Sincronización" extra={<Insignia tono="alerta">SOLO LECTURA · Etapa 1</Insignia>} />

      {error ? (
        <div className="mb-3">
          <Banner tono="peligro">{error}</Banner>
        </div>
      ) : null}

      {estado === null ? (
        <Cargando />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            {CANALES.map((canal) => {
              const info = estado.canales.find((c) => c.canalId === canal.id);
              return (
                <div key={canal.id} className="flex-1 rounded-tarjeta bg-bg p-4 shadow-tarjeta">
                  <p className="text-cuerpo font-semibold text-lab">{canal.nombre}</p>
                  <p className="mt-1 text-chico text-lab2">
                    {info ? `${info.productos} vínculos de producto` : 'Sin productos vinculados todavía'}
                    {info?.ultimoSync ? ` · último sync ${fecha(info.ultimoSync)} ${hora(info.ultimoSync)}` : ''}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Boton
                      variante="principal"
                      cargando={corriendo === `${canal.id}:true`}
                      deshabilitado={corriendo !== null || !enLinea}
                      motivoDeshabilitado={!enLinea ? 'Necesitas conexión para esto.' : undefined}
                      onClick={() => void importar(canal.id, true)}
                    >
                      Simular importación
                    </Boton>
                    <Boton
                      cargando={corriendo === `${canal.id}:false`}
                      deshabilitado={corriendo !== null || !enLinea}
                      onClick={() => void importar(canal.id, false)}
                    >
                      Importar
                    </Boton>
                  </div>
                </div>
              );
            })}
          </div>

          {resumen ? (
            <div className="mb-4 rounded-tarjeta bg-bg p-4 shadow-tarjeta">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-cuerpo font-semibold text-lab">
                  Resultado · {CANALES.find((c) => c.id === resumen.canalId)?.nombre ?? resumen.canalId}
                </p>
                {resumen.dryRun ? <Insignia>simulación: no se escribió nada</Insignia> : <Insignia tono="ok">importado</Insignia>}
              </div>
              <p className="num text-cuerpo text-lab2">
                {resumen.procesados} procesados · {resumen.creados} creados · {resumen.actualizados} actualizados ·{' '}
                {resumen.omitidos} omitidos · {resumen.sinPrecio} sin precio · {resumen.sinClasificar} sin clasificar ·{' '}
                {resumen.duplicadosMarcados} posibles duplicados · {resumen.errores.length} errores ·{' '}
                {(resumen.duracionMs / 1000).toFixed(1)} s
              </p>
            </div>
          ) : null}

          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-cuerpo font-semibold text-lab">Bitácora</h2>
            <div className="flex items-center gap-3">
              {estado.erroresAbiertos > 0 ? (
                <Insignia tono="peligro">{estado.erroresAbiertos} error(es) abiertos</Insignia>
              ) : (
                <Insignia tono="ok">0 errores abiertos</Insignia>
              )}
              <Segmentado
                opciones={[{ valor: 'si', etiqueta: 'Solo errores abiertos' }]}
                valor={soloErrores}
                onChange={(v) => {
                  setSoloErrores(v);
                  setPagina(1);
                }}
              />
            </div>
          </div>

          {logs === null ? (
            <Cargando />
          ) : logs.logs.length === 0 ? (
            <div className="rounded-tarjeta bg-bg p-4 shadow-tarjeta">
              <Vacio mensaje={soloErrores ? 'No hay errores abiertos. Ese es el estado esperado.' : 'La bitácora está vacía.'} />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-sep overflow-hidden rounded-tarjeta bg-bg shadow-tarjeta">
                {logs.logs.map((registro) => (
                  <li key={registro.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Insignia
                          tono={
                            registro.resultado === 'error' ? 'peligro' : registro.resultado.startsWith('ok') ? 'ok' : 'neutro'
                          }
                        >
                          {registro.resultado}
                        </Insignia>
                        <span className="text-chico text-lab2">{registro.operacion}</span>
                        {registro.canalId ? <span className="font-mono text-chico text-lab3">{registro.canalId}</span> : null}
                        <span className="text-chico text-lab3">
                          {fecha(registro.creadoEn)} {hora(registro.creadoEn)}
                        </span>
                        {registro.resuelto ? <Insignia>resuelto</Insignia> : null}
                      </div>
                      {registro.detalle ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-chico text-lab3">Detalle técnico</summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-chico text-lab2">
                            {registro.detalle}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    {registro.resultado === 'error' && !registro.resuelto ? (
                      <div className="w-[150px] shrink-0">
                        <Boton onClick={() => void marcarResuelto(registro.id)}>Marcar resuelto</Boton>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Paginacion pagina={pagina} porPagina={logs.porPagina} total={logs.total} onPagina={setPagina} />
            </>
          )}
        </>
      )}
    </div>
  );
}
