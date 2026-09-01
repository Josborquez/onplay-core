import { construirServidor } from './servidor.js';
import { entorno } from './entorno.js';
import { iniciarCronIncremental } from './sync/cron.js';

const app = await construirServidor();

try {
  await app.listen({ port: entorno.puerto, host: '0.0.0.0' });
  iniciarCronIncremental(app.log); // §6.5: solo en el proceso servidor, no en tests
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
