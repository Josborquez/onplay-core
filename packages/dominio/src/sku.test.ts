import { describe, expect, it } from 'vitest';
import { formatearSkuCorrelativo, skuMaestroDesdeExterno } from './sku.js';

describe('skuMaestroDesdeExterno (§6.4)', () => {
  it('One Piece: OP-{FILEBASE} → OPT-{FILEBASE}', () => {
    expect(skuMaestroDesdeExterno('OP-EB04-001-P1')).toBe('OPT-EB04-001-P1');
  });

  it('Magic: {SET}-{Nº}-{COND}-{IDIOMA} → MTG con número a 3 dígitos', () => {
    expect(skuMaestroDesdeExterno('MOM-75-NM-EN')).toBe('MTG-MOM-075-NM-EN');
    expect(skuMaestroDesdeExterno('MOM-075-NM-EN')).toBe('MTG-MOM-075-NM-EN');
    expect(skuMaestroDesdeExterno('BLB-123-LP-ES')).toBe('MTG-BLB-123-LP-ES');
  });

  it('condiciones válidas: NM, LP, MP, HP, DMG', () => {
    expect(skuMaestroDesdeExterno('MOM-75-DMG-EN')).toBe('MTG-MOM-075-DMG-EN');
    expect(skuMaestroDesdeExterno('MOM-75-XX-EN')).toBeNull();
  });

  it('sin forma reconocible → null (el llamador reserva correlativo)', () => {
    expect(skuMaestroDesdeExterno('')).toBeNull();
    expect(skuMaestroDesdeExterno(null)).toBeNull();
    expect(skuMaestroDesdeExterno('cualquiera')).toBeNull();
  });
});

describe('formatearSkuCorrelativo (§7.1)', () => {
  it('correlativo a 6 dígitos por tipo', () => {
    expect(formatearSkuCorrelativo('sellado', 142)).toBe('SLD-000142');
    expect(formatearSkuCorrelativo('accesorio', 73)).toBe('ACC-000073');
    expect(formatearSkuCorrelativo('snack', 18)).toBe('SNK-000018');
    expect(formatearSkuCorrelativo('juego_mesa', 68)).toBe('JDM-000068');
  });

  it('eventos llevan el año y 4 dígitos', () => {
    expect(formatearSkuCorrelativo('evento', 93, 2026)).toBe('EVT-2026-0093');
  });
});
