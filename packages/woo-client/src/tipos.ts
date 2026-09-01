// Tipos mínimos de la API WooCommerce REST v3 usados por el importador (02-SDD §6).

export interface CategoriaWoo {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

export interface CategoriaDeProductoWoo {
  id: number;
  name: string;
  slug: string;
}

export interface ImagenWoo {
  src: string;
}

export interface MetaDatoWoo {
  key: string;
  value: unknown;
}

export interface ProductoWoo {
  id: number;
  name: string;
  sku: string;
  type: string; // "simple" | "variable" | ...
  status: string;
  price: string;
  regular_price: string;
  images: ImagenWoo[];
  categories: CategoriaDeProductoWoo[];
  meta_data: MetaDatoWoo[];
  variations: number[];
}

/** Usuario de wc/v3/customers (E4 §7.3). El `id` ES el externoUserId de ClienteCanal. */
export interface UsuarioWoo {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  date_created: string;
  billing?: { phone?: string; email?: string };
}

export interface AtributoVariacionWoo {
  name: string;
  option: string;
}

export interface VariacionWoo {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  attributes: AtributoVariacionWoo[];
  image?: ImagenWoo | null;
}
