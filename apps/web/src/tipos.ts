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

export type MedioPago =
  | 'efectivo'
  | 'debito'
  | 'credito'
  | 'transferencia'
  | 'mercadopago'
  | 'otro'
  // E4 §6.2: exige cliente asociado; la API valida el tope.
  | 'monedero';

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
  monedero: 'Monedero',
};

export const MEDIOS_ORDEN: MedioPago[] = [
  'efectivo',
  'debito',
  'credito',
  'transferencia',
  'mercadopago',
  'otro',
  'monedero',
];

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

/* ---------- Clientes (E4 Fase 2, 07-SDD §7) ---------- */

/** Fila de GET /clientes/buscar y de la ficha; saldo SIEMPRE calculado (M1). */
export interface ClienteResumen {
  id: string;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  activo: boolean;
  permiteCredito: boolean;
  limiteCredito: number;
  saldo: number;
}

export interface CanalVinculado {
  id: string;
  canalId: string;
  externoUserId: number;
  externoEmail: string | null;
  vinculadoEn: string;
  desvinculadoEn: string | null;
}

export interface FichaCliente extends ClienteResumen {
  creadoEn: string;
  canales: CanalVinculado[];
}

/** Compra del historial (§7.2). folio/usuario solo llegan al encargado (criterio 18). */
export interface CompraCliente {
  creadoEn: string;
  total: number;
  estado: 'completada' | 'anulada';
  origen: string;
  id?: string;
  folio?: string;
  usuario?: { id: string; nombre: string };
}

export interface RespuestaCompras {
  total: number;
  pagina: number;
  porPagina: number;
  compras: CompraCliente[];
  pedidosDisponibles: boolean;
}

export const ETIQUETA_ORIGEN: Record<string, string> = {
  tienda_fisica: 'Tienda',
  onplay_cl: 'onplay.cl',
  onplaygames_cl: 'onplaygames.cl',
};

/* ---------- Monedero (E4 Fase 3, 07-SDD §7.2) ---------- */

export type MotivoMonedero = 'carga' | 'consumo' | 'devolucion' | 'premio_evento' | 'ajuste' | 'reverso_carga';

export const ETIQUETA_MOTIVO: Record<MotivoMonedero, string> = {
  carga: 'Carga',
  consumo: 'Consumo',
  devolucion: 'Devolución',
  premio_evento: 'Premio de evento',
  ajuste: 'Ajuste',
  reverso_carga: 'Reverso de carga',
};

/* ---------- Vinculación de canales (E4 Fase 4, 07-SDD §7.3) ---------- */

/** Fila del listado del encargado (V18): resumen + última compra completada. */
export interface ClienteAdmin extends ClienteResumen {
  ultimaCompra: string | null;
}

export interface RespuestaClientes {
  clientes: ClienteAdmin[];
  siguienteCursor: string | null;
}

/** Coincidencia por correo de la última importación: se PROPONE, el encargado confirma. */
export interface PropuestaVinculo {
  externoUserId: number;
  email: string;
  nombreCanal: string;
  clienteId: string;
  clienteNombre: string;
}

/** Cuenta del canal sin coincidencia: crearla es decisión humana (§7.3), nunca automática. */
export interface PropuestaCreacion {
  externoUserId: number;
  email: string;
  nombreCanal: string;
  telefono: string | null;
}

export interface CandidatosCanal {
  canalId: string;
  corridaEn: string;
  dryRun: boolean;
  vinculos: PropuestaVinculo[];
  sinCoincidencia: PropuestaCreacion[];
  conflictos: { externoUserId: number; email: string; detalle: string }[];
}

/** Movimiento del libro (§7.2). usuario/referencia solo llegan al encargado (criterio 18). */
export interface MovimientoCliente {
  id: string;
  creadoEn: string;
  motivo: MotivoMonedero;
  monto: number;
  nota: string | null;
  saldoDespues: number;
  usuario?: { id: string; nombre: string };
  referenciaTipo?: string | null;
  referenciaId?: string | null;
}

export interface RespuestaMovimientos {
  saldo: number;
  movimientos: MovimientoCliente[];
}
