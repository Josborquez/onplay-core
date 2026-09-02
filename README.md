# onplay-core

Sistema POS/ERP de Comercializadora y Distribuidora BM: fuente de verdad única de productos, precios, ventas y caja, por encima de las dos tiendas WooCommerce existentes (onplay.cl y onplaygames.cl), que no se reemplazan.

- Documento rector: `docs/01-SDD-general.md`
- Spec ejecutable de la Etapa 1 (mostrador): `docs/02-SDD-etapa1-mostrador.md`
- Diseño de interfaz vinculante: `docs/05-SDD-diseno-interfaz-etapa1_1.md`
- Guía para agentes de código: `CLAUDE.md`

**En Etapa 1 el sistema es de solo lectura hacia WooCommerce**: el candado `SYNC_SOLO_LECTURA=true` hace que `packages/woo-client` lance una excepción ante cualquier `POST`/`PUT`/`DELETE` a las tiendas. Cambiarlo es una decisión de la Etapa 3.

## Requisitos

- Node.js ≥ 20 (probado con 22)
- MySQL 8 (en desarrollo sirve MariaDB de XAMPP)
- npm (workspaces; no se usa pnpm/yarn)

## Instalación (desarrollo)

```bash
git clone <repo> onplay-core && cd onplay-core
npm install
cp apps/api/.env.example apps/api/.env   # o crear el .env a mano (ver abajo)
cd apps/api
npx prisma migrate dev                    # crea la base y aplica migraciones
cd ../..
npm run seed                              # canales, categorías, correlativo (idempotente)
npm run crear-admin -- admin@onplay.cl "Admin" <password>
npm run dev                               # API en :3010
npm run dev -w @onplay/web                # Vite en :5183 con proxy /api → :3010
```

La web en desarrollo se usa desde `http://localhost:5183` (mismo origen que la API vía proxy: la cookie de sesión es `SameSite=Strict`).

## Variables de entorno (`apps/api/.env`)

```env
NODE_ENV=production
PORT=3010
DATABASE_URL="mysql://usuario:clave@localhost:3306/onplay_core"
TZ=UTC

JWT_SECRET=<cadena aleatoria de 64+ caracteres>
JWT_EXPIRA=8h
REFRESH_EXPIRA=30d

# WooCommerce — SOLO LECTURA en Etapa 1
WOO_ONPLAY_URL=https://onplay.cl
WOO_ONPLAY_CK=ck_xxxxxxxx
WOO_ONPLAY_CS=cs_xxxxxxxx
WOO_ONPLAYGAMES_URL=https://onplaygames.cl
WOO_ONPLAYGAMES_CK=ck_xxxxxxxx
WOO_ONPLAYGAMES_CS=cs_xxxxxxxx

SYNC_HABILITADO=true
SYNC_CRON="*/30 * * * *"
SYNC_SOLO_LECTURA=true      # candado de la Etapa 1; cambiarlo es decisión de E3

CORS_ORIGINS=               # vacío en producción same-origin; lista separada por comas si aplica
```

Reglas:

- **Ningún secreto va en variables `VITE_*`** (regla S3): Vite las incrusta en texto plano en el bundle. La web no necesita ninguna variable — usa rutas relativas `/api/v1`.
- Los canales sin credenciales (`WOO_*` vacías) simplemente se saltan en la sincronización.

## Despliegue (producción)

Un solo proceso Node sirve la API **y** la web compilada (mismo origen, requisito de la cookie de sesión). Procedimiento:

```bash
git pull
npm ci
npm run build                             # typecheck de la API + build de la web (apps/web/dist)
cd apps/api && npx prisma migrate deploy && cd ../..
pm2 reload onplay-core
# primera vez (desde apps/api/): pm2 start npm --name onplay-core -- run start
```

El proceso corre con `tsx` (los packages del monorepo se consumen desde su fuente TypeScript, sin builds intermedios); `npm run build` queda como puerta de typecheck y para generar `apps/web/dist`.

Con `NODE_ENV=production` la API sirve `apps/web/dist` en `/` (con fallback SPA a `index.html`) y el cron de sincronización incremental corre cada 30 minutos dentro del mismo proceso.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | API en `:3010` con recarga (tsx watch) |
| `npm run dev -w @onplay/web` | Web en `:5183` (Vite + proxy) |
| `npm run build` | Compila API y web |
| `npm test` | Tests de reglas de negocio (vitest) |
| `npm run seed` | Semillas idempotentes |
| `npm run crear-admin -- <email> <nombre> [password]` | Primer usuario admin |

## Etapa 2 — Inventario (2026-09-02)

Spec: `docs/03-SDD-etapa2-inventario.md`. Guía para el encargado: `docs/09-guia-inventario-encargado.md`.

- **Libro de stock** append-only (`MovimientoStock`) con resumen `StockActual` por producto y ubicación; el resumen solo lo escribe `apps/api/src/stock/libro.ts` (candado `FOR UPDATE`).
- **Ubicaciones** semilla: `mostrador` (de venta), `carpetas`, `vitrina`, `bodega` (publicable para E3). `npm run seed` las crea.
- **La venta descuenta** de la ubicación de venta los productos con `controlaStock`; nunca bloquea por stock propio (advierte `STOCK_NEGATIVO`). Regla de prioridad entre canales (03 §6.9): si la web ya vendió y cobró la última unidad, el cobro responde `409 RESERVADO_WEB`; un encargado puede seguir con `forzarReservado.nota`.
- **Recuentos** (`/admin/recuentos`): por ubicación y categoría, escáner que suma 1, cerrar enciende el control solo en lo contado.
- **Movimientos manuales** (`/admin/stock`): ajuste, merma, ingreso y traslado con nota obligatoria. **Alertas** (`/admin/stock/alertas`) y **CSV**.
- **Espejo del stock de la web** (`ProductoCanal.stockCanal`) lo llena el mismo sync de E1; es solo lectura y nunca se suma al stock propio.
- **Devoluciones** con folio `D-año-#####` desde `/admin/ventas` (salen de la caja abierta del encargado) y **movimientos de caja** (`Caja ±` en el Mostrador); ambos entran al arqueo.

Rutas nuevas bajo `/api/v1`: `ubicaciones`, `stock`, `stock/alertas`, `stock/export.csv`, `stock/movimientos`, `stock/traslados`, `stock/verificar`, `productos/:id/stock`, `productos/:id/movimientos`, `recuentos*`, `ventas/:id/devoluciones`, `devoluciones`, `turnos/:id/movimientos-caja`.

## Estructura

```
apps/api          Fastify + Prisma (rutas /api/v1, sync, cron incremental)
apps/web          PWA React (mostrador + backoffice, un solo bundle)
packages/dominio  Reglas de negocio puras (venta, arqueo, SKU, duplicados) + tests
packages/woo-client  Cliente tipado wc/v3 con el candado de solo lectura
prisma/           Esquema y migraciones (apuntado desde apps/api)
docs/             SDDs vinculantes
```
