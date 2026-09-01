// Cron incremental (02-SDD §6.5): node-cron cada 30 minutos, dentro del
// proceso de la API (Principio P6). Canales sin credenciales se saltan en
// silencio; un fallo de corrida queda en SyncLog y no tumba el proceso.
import cron from 'node-cron';
import { prisma } from '../db.js';
import { entorno } from '../entorno.js';
import { CANALES_WOO, sincronizarIncremental } from './importador.js';

let corriendo = false;

export async function correrIncrementales(log: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }): Promise<void> {
  if (corriendo) return; // una corrida a la vez
  corriendo = true;
  try {
    for (const canalId of CANALES_WOO) {
      const cfg = entorno.canales[canalId];
      if (!cfg.url || !cfg.ck || !cfg.cs) continue;
      try {
        const r = await sincronizarIncremental(canalId);
        log.info(r, `sync incremental ${canalId}`);
      } catch (e) {
        log.error(e, `sync incremental ${canalId} falló`);
        await prisma.syncLog
          .create({
            data: {
              canalId,
              operacion: 'incremental',
              resultado: 'error',
              detalle: `corrida fallida: ${(e as Error).message}`,
            },
          })
          .catch(() => {});
      }
    }
  } finally {
    corriendo = false;
  }
}

export function iniciarCronIncremental(log: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }): void {
  if (!entorno.syncHabilitado) {
    log.info({}, 'cron incremental deshabilitado por SYNC_HABILITADO=false (§11)');
    return;
  }
  cron.schedule(entorno.syncCron, () => void correrIncrementales(log));
  log.info({ cron: entorno.syncCron }, 'cron incremental programado (§6.5)');
}
