// Caché local del catálogo (02-SDD §7.4): IndexedDB + índice en memoria.
// La búsqueda es SIEMPRE contra el caché primero; el servidor solo si no hay
// resultados locales y hay conexión (05-SDD V2). Delta cada 30 minutos con ?desde.
import { api } from './api.js';

export interface ProductoCache {
  id: string;
  sku: string;
  nombre: string;
  precioVenta: number;
  categoriaId: string | null;
  codigoBarras: string | null;
  cardNumber: string | null;
  activo: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  hijos: Categoria[];
}

const DB = 'onplay-mostrador';
const ALMACEN = 'productos';
const META = 'meta';
/** Cola offline de ventas F10 (§7.4): la clave ES la idempotencyKey persistida. */
export const VENTAS_PENDIENTES = 'ventasPendientes';

export function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(DB, 2);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(VENTAS_PENDIENTES)) {
        db.createObjectStore(VENTAS_PENDIENTES, { keyPath: 'idempotencyKey' });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

export function tx<T>(db: IDBDatabase, almacen: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const pedido = fn(db.transaction(almacen, modo).objectStore(almacen));
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

// Índice en memoria: con ~2.400 productos cabe holgado y busca en <100 ms.
let indice: ProductoCache[] = [];
let porBarras = new Map<string, ProductoCache>();
const suscriptores = new Set<() => void>();

function reindexar(productos: ProductoCache[]) {
  indice = productos.filter((p) => p.activo);
  porBarras = new Map(indice.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras!, p]));
  suscriptores.forEach((fn) => fn());
}

export function alCambiarCatalogo(fn: () => void): () => void {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

export function catalogoListo(): boolean {
  return indice.length > 0;
}

/** Hidrata desde IndexedDB y luego baja el delta (o todo, la primera vez). */
export async function hidratarCatalogo(): Promise<void> {
  const db = await abrirDb();
  const guardados = await tx<ProductoCache[]>(db, ALMACEN, 'readonly', (s) => s.getAll() as IDBRequest<ProductoCache[]>);
  if (guardados.length > 0) reindexar(guardados);
  await refrescarCatalogo();
}

export async function refrescarCatalogo(): Promise<void> {
  const db = await abrirDb();
  const desde = await tx<string | undefined>(db, META, 'readonly', (s) => s.get('desde') as IDBRequest<string | undefined>);
  try {
    const q = desde ? `?desde=${encodeURIComponent(desde)}` : '';
    const r = await api<{ generadoEn: string; productos: ProductoCache[] }>(`/productos/catalogo-offline${q}`);
    if (r.productos.length > 0) {
      const escritura = db.transaction([ALMACEN, META], 'readwrite');
      const almacen = escritura.objectStore(ALMACEN);
      for (const p of r.productos) almacen.put(p);
      escritura.objectStore(META).put(r.generadoEn, 'desde');
      await new Promise((res, rej) => {
        escritura.oncomplete = res;
        escritura.onerror = () => rej(escritura.error);
      });
      const todos = await tx<ProductoCache[]>(db, ALMACEN, 'readonly', (s) => s.getAll() as IDBRequest<ProductoCache[]>);
      reindexar(todos);
    } else {
      const escritura = db.transaction(META, 'readwrite');
      escritura.objectStore(META).put(r.generadoEn, 'desde');
    }
  } catch {
    // Sin conexión: se sigue con lo que haya en el caché.
  }
}

export function iniciarRefrescoPeriodico(): () => void {
  const id = setInterval(() => void refrescarCatalogo(), 30 * 60 * 1000);
  return () => clearInterval(id);
}

const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Coincidencia exacta de código de barras: se agrega sin mostrar la lista (05-SDD V2). */
export function porCodigoBarras(texto: string): ProductoCache | undefined {
  return porBarras.get(texto.trim());
}

/** Nombre, código, número de carta y código de barras — los cuatro de F4. Tope 20. */
export function buscarLocal(consulta: string): ProductoCache[] {
  const q = normalizar(consulta.trim());
  if (q.length < 2) return [];
  const exactos = indice.filter(
    (p) => p.sku.toLowerCase() === q || p.cardNumber?.toLowerCase() === q || p.codigoBarras === consulta.trim(),
  );
  const terminos = q.split(/\s+/);
  const parciales = indice.filter((p) => {
    if (exactos.includes(p)) return false;
    const pajar = normalizar(`${p.nombre} ${p.sku} ${p.cardNumber ?? ''} ${p.codigoBarras ?? ''}`);
    return terminos.every((t) => pajar.includes(t));
  });
  return [...exactos, ...parciales].slice(0, 20);
}

export function productosDeCategorias(ids: Set<string>, tope = 60): ProductoCache[] {
  return indice
    .filter((p) => p.categoriaId && ids.has(p.categoriaId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, tope);
}

let arbolCategorias: Categoria[] | null = null;

export async function categorias(): Promise<Categoria[]> {
  if (arbolCategorias) return arbolCategorias;
  const r = await api<{ categorias: Categoria[] }>('/categorias');
  arbolCategorias = r.categorias;
  return arbolCategorias;
}

/** Ids de una categoría raíz (por slug) y todas sus descendientes. */
export function idsDelSubarbol(raiz: Categoria): Set<string> {
  const ids = new Set<string>();
  const visitar = (c: Categoria) => {
    ids.add(c.id);
    c.hijos.forEach(visitar);
  };
  visitar(raiz);
  return ids;
}
