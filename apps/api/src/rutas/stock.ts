// Rutas de inventario — docs/03-SDD-etapa2-inventario.md §7.1 (Fase 2: C1, C2).
// Los movimientos manuales, traslados y recuentos llegan en la Fase 3 (§6.4, §6.5).
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ErrorStock, resumenStock, stockPorUbicacion } from '../stock/libro.js';
import { avisoWeb, type EstadoStock } from '@onplay/dominio';

const ESTADOS: EstadoStock[] = ['sin_control', 'negativo', 'quiebre', 'bajo', 'ok'];

/** Ids de una categoría y todas sus descendientes (árbol chico: se carga entero). */
async function idsSubarbol(categoriaId: string): Promise<string[]> {
  const todas = await prisma.categoria.findMany({ select: { id: true, padreId: true } });
  const hijos = new Map<string, string[]>();
  for (const c of todas) {
    if (c.padreId) hijos.set(c.padreId, [...(hijos.get(c.padreId) ?? []), c.id]);
  }
  const ids: string[] = [];
  const pila = [categoriaId];
  while (pila.length) {
    const id = pila.pop()!;
    ids.push(id);
    pila.push(...(hijos.get(id) ?? []));
  }
  return ids;
}

export default async function rutasStock(app: FastifyInstance) {
  const vendedor = { preHandler: app.requiereRol('vendedor') };
  const encargado = { preHandler: app.requiereRol('encargado') };
  const admin = { preHandler: app.requiereRol('admin') };

  // ---------- Ubicaciones (C1) ----------
  app.get('/ubicaciones', vendedor, async () => {
    const ubicaciones = await prisma.ubicacion.findMany({ where: { activa: true }, orderBy: { orden: 'asc' } });
    return { ubicaciones };
  });

  interface CuerpoUbicacion {
    codigo?: unknown;
    nombre?: unknown;
    publicable?: unknown;
    esVenta?: unknown;
    activa?: unknown;
    orden?: unknown;
  }

  app.post<{ Body: CuerpoUbicacion }>('/ubicaciones', encargado, async (req, reply) => {
    const b = req.body ?? {};
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
    if (!nombre) return reply.code(422).send({ error: 'NOMBRE_REQUERIDO' });
    const codigo = (typeof b.codigo === 'string' && b.codigo.trim() ? b.codigo : nombre)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!codigo) return reply.code(422).send({ error: 'CODIGO_INVALIDO' });
    if (await prisma.ubicacion.findUnique({ where: { codigo } })) {
      return reply.code(409).send({ error: 'CODIGO_DUPLICADO', detalle: codigo });
    }
    const esVenta = b.esVenta === true;
    const creada = await prisma.$transaction(async (tx) => {
      if (esVenta) await tx.ubicacion.updateMany({ where: { esVenta: true }, data: { esVenta: false } });
      const u = await tx.ubicacion.create({
        data: {
          codigo,
          nombre,
          publicable: b.publicable === true,
          esVenta,
          orden: Number.isInteger(b.orden) ? (b.orden as number) : 99,
        },
      });
      await tx.auditoria.create({
        data: { usuarioId: req.user.sub, entidad: 'ubicacion', entidadId: u.id, accion: 'crear', valorNuevo: u },
      });
      return u;
    });
    return reply.code(201).send(creada);
  });

  app.patch<{ Params: { id: string }; Body: CuerpoUbicacion }>('/ubicaciones/:id', encargado, async (req, reply) => {
    const actual = await prisma.ubicacion.findUnique({ where: { id: req.params.id } });
    if (!actual) return reply.code(404).send({ error: 'UBICACION_NO_ENCONTRADA' });
    const b = req.body ?? {};
    const data: { nombre?: string; publicable?: boolean; esVenta?: boolean; activa?: boolean; orden?: number } = {};
    if (typeof b.nombre === 'string' && b.nombre.trim()) data.nombre = b.nombre.trim();
    if (typeof b.publicable === 'boolean') data.publicable = b.publicable;
    if (typeof b.esVenta === 'boolean') data.esVenta = b.esVenta;
    if (typeof b.activa === 'boolean') data.activa = b.activa;
    if (Number.isInteger(b.orden)) data.orden = b.orden as number;
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'SIN_CAMBIOS' });

    // Desactivar exige stock 0 en ella (§7.1): nada se pierde de vista.
    if (data.activa === false) {
      const conStock = await prisma.stockActual.count({ where: { ubicacionId: actual.id, cantidad: { not: 0 } } });
      if (conStock > 0) return reply.code(409).send({ error: 'UBICACION_CON_STOCK', detalle: `${conStock} productos con cantidad distinta de 0` });
    }
    // La ubicación de venta es única (D-E2-2); quitársela a la única deja el mostrador sin descuento.
    if (data.esVenta === false && actual.esVenta) {
      return reply.code(409).send({ error: 'UBICACION_VENTA_REQUERIDA', detalle: 'Marca otra ubicación como de venta primero' });
    }
    const actualizada = await prisma.$transaction(async (tx) => {
      if (data.esVenta === true) await tx.ubicacion.updateMany({ where: { esVenta: true, id: { not: actual.id } }, data: { esVenta: false } });
      const u = await tx.ubicacion.update({ where: { id: actual.id }, data });
      await tx.auditoria.create({
        data: { usuarioId: req.user.sub, entidad: 'ubicacion', entidadId: u.id, accion: 'editar', valorAnterior: actual, valorNuevo: u },
      });
      return u;
    });
    return actualizada;
  });

  // ---------- Stock actual (C2) ----------
  app.get<{
    Querystring: { ubicacionId?: string; estado?: string; categoriaId?: string; q?: string; pagina?: string; limit?: string };
  }>('/stock', vendedor, async (req, reply) => {
    const estado = req.query.estado as EstadoStock | undefined;
    if (estado && !ESTADOS.includes(estado)) return reply.code(422).send({ error: 'ESTADO_INVALIDO', detalle: ESTADOS.join(', ') });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);

    const categoriaIds = req.query.categoriaId ? await idsSubarbol(req.query.categoriaId) : null;
    const productos = await prisma.producto.findMany({
      where: {
        activo: true,
        ...(estado === 'sin_control' ? { controlaStock: false } : estado ? { controlaStock: true } : {}),
        ...(categoriaIds ? { categoriaId: { in: categoriaIds } } : {}),
        ...(req.query.q && req.query.q.trim().length >= 2 ? { nombre: { contains: req.query.q.trim() } } : {}),
        // Sin filtro de estado: solo productos con control (los demás no tienen stock que mostrar).
        ...(!estado ? { controlaStock: true } : {}),
      },
      select: { id: true, sku: true, nombre: true, tipo: true, categoriaId: true, imagenUrl: true, controlaStock: true, stockMinimo: true, precioVenta: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    const resumen = await resumenStock(prisma, productos.map((p) => p.id));
    let filas = productos.map((p) => ({ ...p, ...resumen.get(p.id)! }));
    if (estado) filas = filas.filter((f) => f.estadoStock === estado);
    if (req.query.ubicacionId) {
      const porUbic = await prisma.stockActual.findMany({
        where: { ubicacionId: req.query.ubicacionId, productoId: { in: filas.map((f) => f.id) } },
        select: { productoId: true, cantidad: true },
      });
      const cant = new Map(porUbic.map((f) => [f.productoId, f.cantidad]));
      filas = filas.map((f) => ({ ...f, stockUbicacion: cant.get(f.id) ?? 0 }));
    }
    const total = filas.length;
    const desde = (pagina - 1) * limit;
    return { productos: filas.slice(desde, desde + limit), total, pagina, porPagina: limit };
  });

  // Desglose por ubicación + espejo del canal + aviso web (§6.2, §6.8, §6.9).
  app.get<{ Params: { id: string } }>('/productos/:id/stock', vendedor, async (req, reply) => {
    const producto = await prisma.producto.findUnique({
      where: { id: req.params.id },
      select: { id: true, controlaStock: true, stockMinimo: true },
    });
    if (!producto) return reply.code(404).send({ error: 'PRODUCTO_NO_ENCONTRADO' });
    const [ubicaciones, canales] = await Promise.all([
      stockPorUbicacion(prisma, producto.id),
      prisma.productoCanal.findMany({
        where: { productoId: producto.id },
        select: { canalId: true, publicado: true, stockCanal: true, manejaStockCanal: true, stockCanalEn: true },
      }),
    ]);
    const resumen = (await resumenStock(prisma, [producto.id])).get(producto.id)!;
    const stockPropioVenta = ubicaciones.find((u) => u.esVenta)?.cantidad ?? 0;
    return {
      productoId: producto.id,
      controlaStock: producto.controlaStock,
      stockMinimo: producto.stockMinimo,
      ...resumen,
      ubicaciones,
      canales,
      avisoWeb: avisoWeb({ controlaStock: producto.controlaStock, stockPropioVenta, canales: canales.filter((c) => c.publicado) }),
    };
  });

  // Kardex (C10): movimientos del producto, más nuevos primero.
  app.get<{ Params: { id: string }; Querystring: { pagina?: string; limit?: string } }>(
    '/productos/:id/movimientos',
    encargado,
    async (req, reply) => {
      const existe = await prisma.producto.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existe) return reply.code(404).send({ error: 'PRODUCTO_NO_ENCONTRADO' });
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
      const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
      const where = { productoId: existe.id };
      const [total, movimientos] = await Promise.all([
        prisma.movimientoStock.count({ where }),
        prisma.movimientoStock.findMany({
          where,
          orderBy: { creadoEn: 'desc' },
          skip: (pagina - 1) * limit,
          take: limit,
          include: {
            ubicacion: { select: { codigo: true, nombre: true } },
            usuario: { select: { nombre: true } },
          },
        }),
      ]);
      return { movimientos, total, pagina, porPagina: limit };
    },
  );

  // Verificación M1 (§6.2): compara el resumen con SUM(movimientos). Solo reporta.
  app.post('/stock/verificar', admin, async () => {
    const sumas = await prisma.movimientoStock.groupBy({ by: ['productoId', 'ubicacionId'], _sum: { cantidad: true } });
    const resumen = await prisma.stockActual.findMany();
    const clave = (p: string, u: string) => `${p}|${u}`;
    const esperado = new Map(sumas.map((s) => [clave(s.productoId, s.ubicacionId), s._sum.cantidad ?? 0]));
    const diferencias: { productoId: string; ubicacionId: string; resumen: number; suma: number }[] = [];
    for (const r of resumen) {
      const suma = esperado.get(clave(r.productoId, r.ubicacionId)) ?? 0;
      if (suma !== r.cantidad) diferencias.push({ productoId: r.productoId, ubicacionId: r.ubicacionId, resumen: r.cantidad, suma });
      esperado.delete(clave(r.productoId, r.ubicacionId));
    }
    for (const [k, suma] of esperado) {
      if (suma !== 0) {
        const [productoId, ubicacionId] = k.split('|') as [string, string];
        diferencias.push({ productoId, ubicacionId, resumen: 0, suma });
      }
    }
    return { filas: resumen.length, diferencias };
  });

  app.setErrorHandler((e, _req, reply) => {
    if (e instanceof ErrorStock) return reply.code(e.status).send(e.cuerpo);
    throw e;
  });
}
