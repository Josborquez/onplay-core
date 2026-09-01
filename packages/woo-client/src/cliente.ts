import type { CategoriaWoo, ProductoWoo, VariacionWoo } from './tipos.js';

export interface ConfigClienteWoo {
  url: string; // p.ej. https://onplaygames.cl
  ck: string;
  cs: string;
  /**
   * Candado de la Etapa 1 (02-SDD §11): mientras esté activo, cualquier
   * intento de POST/PUT/DELETE lanza una excepción ANTES de tocar la red.
   * Desactivarlo es una decisión de E3.
   */
  soloLectura: boolean;
  timeoutMs?: number;
}

export class ErrorEscrituraBloqueada extends Error {
  constructor(metodo: string, ruta: string) {
    super(
      `SYNC_SOLO_LECTURA: intento de ${metodo} ${ruta} bloqueado. ` +
        `La Etapa 1 es estrictamente de lectura (02-SDD §2, regla S1/S2).`,
    );
    this.name = 'ErrorEscrituraBloqueada';
  }
}

/**
 * Describe un error de la API de forma útil. Hostinger responde con HTML de un
 * WAF de LiteSpeed cuando algo va mal; eso no es JSON y hay que decirlo
 * (convención heredada del Binder OP, SDD general §5.2).
 */
export function describeError(status: number, cuerpo: string): string {
  const recorte = cuerpo.slice(0, 200).trim();
  if (recorte.startsWith('<')) {
    return `HTTP ${status}: respuesta HTML (posible WAF/LiteSpeed), no JSON`;
  }
  return `HTTP ${status}: ${recorte}`;
}

export class ClienteWoo {
  constructor(private readonly config: ConfigClienteWoo) {}

  /** Única puerta a la red. El candado de solo lectura se verifica aquí, primero. */
  async solicitar<T>(
    metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
    ruta: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    if (this.config.soloLectura && metodo !== 'GET') {
      throw new ErrorEscrituraBloqueada(metodo, ruta);
    }
    const url = new URL(`/wp-json/wc/v3/${ruta}`, this.config.url);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    url.searchParams.set('consumer_key', this.config.ck);
    url.searchParams.set('consumer_secret', this.config.cs);

    const res = await fetch(url, {
      method: metodo,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(describeError(res.status, texto));
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new Error(describeError(res.status, texto));
    }
  }

  /** Productos publicados, paginados de 100 en 100 (02-SDD §6.1). */
  async *paginarProductos(porPagina = 100): AsyncGenerator<ProductoWoo[]> {
    let pagina = 1;
    for (;;) {
      const lote = await this.solicitar<ProductoWoo[]>('GET', 'products', {
        status: 'publish',
        per_page: String(porPagina),
        page: String(pagina),
        orderby: 'id',
        order: 'asc',
      });
      if (lote.length === 0) return;
      yield lote;
      if (lote.length < porPagina) return;
      pagina += 1;
    }
  }

  /**
   * Productos modificados desde una fecha (02-SDD §6.5). `dates_are_gmt=true` es
   * OBLIGATORIO: sin él WooCommerce interpreta la fecha en la zona del sitio y,
   * con Chile en UTC−4/−3, cada corrida perdería o reprocesaría 3–4 horas.
   * Sin filtro de status: un producto pasado a borrador también "se modificó"
   * y hay que despublicarlo acá (ProductoCanal.publicado = false).
   */
  async *paginarProductosModificados(desdeIsoUtc: string, porPagina = 100): AsyncGenerator<ProductoWoo[]> {
    let pagina = 1;
    for (;;) {
      const lote = await this.solicitar<ProductoWoo[]>('GET', 'products', {
        status: 'any',
        modified_after: desdeIsoUtc,
        dates_are_gmt: 'true',
        per_page: String(porPagina),
        page: String(pagina),
        orderby: 'id',
        order: 'asc',
      });
      if (lote.length === 0) return;
      yield lote;
      if (lote.length < porPagina) return;
      pagina += 1;
    }
  }

  async listarVariaciones(productoId: number): Promise<VariacionWoo[]> {
    return this.solicitar<VariacionWoo[]>('GET', `products/${productoId}/variations`, {
      per_page: '100',
    });
  }

  /** Árbol completo de categorías del canal (para resolver ascendencia en el mapeo). */
  async listarCategorias(): Promise<CategoriaWoo[]> {
    const todas: CategoriaWoo[] = [];
    let pagina = 1;
    for (;;) {
      const lote = await this.solicitar<CategoriaWoo[]>('GET', 'products/categories', {
        per_page: '100',
        page: String(pagina),
      });
      todas.push(...lote);
      if (lote.length < 100) return todas;
      pagina += 1;
    }
  }
}
