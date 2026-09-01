export { rolAlcanza, type Rol } from './roles.js';
export {
  skuMaestroDesdeExterno,
  formatearSkuCorrelativo,
  PREFIJO_POR_TIPO,
  type TipoProducto,
} from './sku.js';
export { normalizarNombre, preciosSimilares } from './duplicados.js';
export {
  validarYCalcularVenta,
  calcularArqueo,
  type MedioPago,
  type LineaEntrada,
  type PagoEntrada,
  type CalculoVenta,
  type ErrorVenta,
  type Arqueo,
} from './venta.js';
export { normalizarRut, calcularDvRut } from './rut.js';
export {
  calcularSaldo,
  validarPagoMonedero,
  validarMovimientoManual,
  type MotivoMonedero,
  type ErrorPagoMonedero,
  type ErrorMovimientoManual,
} from './monedero.js';
export {
  nombreBusquedaCliente,
  detectarDuplicadosCliente,
  type ConfianzaDuplicado,
  type ClienteComparable,
  type DuplicadoCliente,
} from './cliente.js';
