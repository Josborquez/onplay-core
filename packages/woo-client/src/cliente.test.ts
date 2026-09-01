import { describe, expect, it } from 'vitest';
import { ClienteWoo, ErrorEscrituraBloqueada, describeError } from './cliente.js';

const config = {
  url: 'https://ejemplo.test',
  ck: 'ck_x',
  cs: 'cs_x',
  soloLectura: true,
};

describe('candado SYNC_SOLO_LECTURA (02-SDD §11)', () => {
  it('bloquea POST, PUT y DELETE antes de tocar la red', async () => {
    const cliente = new ClienteWoo(config);
    await expect(cliente.solicitar('POST', 'products')).rejects.toBeInstanceOf(ErrorEscrituraBloqueada);
    await expect(cliente.solicitar('PUT', 'products/1')).rejects.toBeInstanceOf(ErrorEscrituraBloqueada);
    await expect(cliente.solicitar('DELETE', 'products/1')).rejects.toBeInstanceOf(ErrorEscrituraBloqueada);
  });

  it('el mensaje deja claro que es el candado de la Etapa 1', async () => {
    const cliente = new ClienteWoo(config);
    await expect(cliente.solicitar('POST', 'products')).rejects.toThrow(/SYNC_SOLO_LECTURA/);
  });
});

describe('describeError', () => {
  it('reconoce una respuesta HTML de un WAF', () => {
    expect(describeError(403, '<!DOCTYPE html><html>bloqueado</html>')).toMatch(/HTML/);
  });

  it('recorta cuerpos de texto normales', () => {
    expect(describeError(500, 'error interno')).toBe('HTTP 500: error interno');
  });
});
