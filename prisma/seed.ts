// Semillas obligatorias de la Etapa 1 — docs/02-SDD-etapa1-mostrador.md §4.3
// Idempotente: se puede ejecutar más de una vez sin duplicar.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CANALES = [
  { id: 'onplay_cl', nombre: 'onplay.cl', tipo: 'woocommerce', urlBase: 'https://onplay.cl' },
  { id: 'onplaygames_cl', nombre: 'onplaygames.cl', tipo: 'woocommerce', urlBase: 'https://onplaygames.cl' },
  { id: 'tienda_fisica', nombre: 'Tienda física', tipo: 'fisico', urlBase: null },
] as const;

// [nombre, slug, slugPadre]
const CATEGORIAS: Array<[string, string, string | null]> = [
  ['Cartas', 'cartas', null],
  ['Magic', 'cartas-magic', 'cartas'],
  ['One Piece', 'cartas-one-piece', 'cartas'],
  ['Pokémon', 'cartas-pokemon', 'cartas'],
  ['Riftbound', 'cartas-riftbound', 'cartas'],
  ['Star Wars', 'cartas-star-wars', 'cartas'],
  ['Flesh and Blood', 'cartas-flesh-and-blood', 'cartas'],
  ['Sellado', 'sellado', null],
  ['Accesorios', 'accesorios', null],
  ['Juegos de Mesa', 'juegos-de-mesa', null],
  ['Juegos de Rol', 'juegos-de-rol', null],
  ['Juguetes y Colección', 'juguetes-y-coleccion', null],
  ['Snacks', 'snacks', null],
  ['Bebidas', 'snacks-bebidas', 'snacks'],
  ['Aguas', 'snacks-aguas', 'snacks'],
  ['Energéticas', 'snacks-energeticas', 'snacks'],
  ['Confitería', 'snacks-confiteria', 'snacks'],
  ['Eventos', 'eventos', null], // destino de las categorías de evento del importador
  ['Sin clasificar', 'sin-clasificar', null], // destino por defecto sin coincidencia
];

async function main() {
  for (const c of CANALES) {
    await prisma.canal.upsert({
      where: { id: c.id },
      update: { nombre: c.nombre, tipo: c.tipo, urlBase: c.urlBase },
      create: { id: c.id, nombre: c.nombre, tipo: c.tipo, urlBase: c.urlBase },
    });
  }

  const idPorSlug = new Map<string, string>();
  for (const [nombre, slug, slugPadre] of CATEGORIAS) {
    const padreId = slugPadre ? idPorSlug.get(slugPadre) ?? null : null;
    const cat = await prisma.categoria.upsert({
      where: { slug },
      update: { nombre, padreId },
      create: { nombre, slug, padreId },
    });
    idPorSlug.set(slug, cat.id);
  }

  const anioActual = new Date().getUTCFullYear();
  await prisma.correlativo.upsert({
    where: { clave: 'venta' },
    update: {},
    create: { clave: 'venta', anio: anioActual, ultimo: 0 },
  });

  console.log(
    `Semillas listas: ${CANALES.length} canales, ${CATEGORIAS.length} categorías, correlativo venta/${anioActual}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
