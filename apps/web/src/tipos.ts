// Tipos del contrato de la API que consume el mostrador (02-SDD §5).

export interface Turno {
  id: string;
  estado: 'abierto' | 'cerrado';
  abiertoEn: string;
  montoApertura: number;
  cerradoEn: string | null;
  montoDeclarado: number | null;
  montoEsperado: number | null;
  diferencia: number | null;
  notas: string | null;
}

export interface ResumenTurno {
  turnoCajaId: string;
  estado: string;
  montoApertura: number;
  totalesPorMedio: { medio: MedioPago; total: number }[];
  cantidadVentas: number;
  totalVendido: number;
  ticketPromedio: number;
}

export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mercadopago' | 'otro';

export interface PagoNuevo {
  medio: MedioPago;
  monto: number;
  montoRecibido?: number;
  referencia?: string;
}

export interface VentaCreada {
  id: string;
  folio: string;
  turnoCajaId: string;
  subtotal: number;
  descuento: number;
  total: number;
  estado: 'completada' | 'anulada';
  motivoAnulacion?: string | null;
  creadoEn: string;
  lineas: {
    id: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    totalLinea: number;
  }[];
  pagos: { id: string; medio: MedioPago; monto: number; montoRecibido: number | null; referencia: string | null }[];
}

export interface RespuestaVenta {
  venta: VentaCreada;
  advertencias: { lineaIndex: number; precioActual: number; precioEnviado: number }[];
  repetida?: boolean;
}

/** Línea del carrito en pantalla. `precioCatalogo` permite la insignia "precio editado". */
export interface LineaCarrito {
  clave: string;
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  precioCatalogo: number | null;
}

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
};

export const MEDIOS_ORDEN: MedioPago[] = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro'];

/* ---------- Backoffice (Fase 6) ---------- */

export type RolUsuario = 'vendedor' | 'encargado' | 'admin';

const NIVEL_ROL: Record<RolUsuario, number> = { vendedor: 0, encargado: 1, admin: 2 };

/** Jerarquía de roles del contrato (02-SDD §5.1): admin > encargado > vendedor. */
export function rolAlcanza(rol: RolUsuario, requerido: RolUsuario): boolean {
  return NIVEL_ROL[rol] >= NIVEL_ROL[requerido];
}

export type TipoProducto =
  | 'single' | 'sellado' | 'accesorio' | 'snack' | 'juego_mesa'
  | 'juguete' | 'evento' | 'indeterminado' | 'servicio';

export const ETIQUETA_TIPO: Record<TipoProducto, string> = {
  single: 'Single',
  sellado: 'Sellado',
  accesorio: 'Accesorio',
  snack: 'Snack',
  juego_mesa: 'Juego de mesa',
  juguete: 'Juguete',
  evento: 'Evento',
  indeterminado: 'Indeterminado',
  servicio: 'Servicio',
};

/** Fila de GET /productos (listado del backoffice, V5). */
export interface ProductoAdmin {
  id: string;
  sku: string;
  nombre: string;
  tipo: TipoProducto;
  juego: string | null;
  categoriaId: string | null;
  precioVenta: number;
  controlaStock: boolean;
  activo: boolean;
  posibleDuplicado: boolean;
  imagenUrl: string | null;
  codigoBarras: string | null;
  cardNumber: string | null;
  actualizadoEn: string;
}

export interface TurnoConUsuario extends Turno {
  usuario: { id: string; nombre: string; email: string };
}
