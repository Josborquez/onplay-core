-- CreateTable
CREATE TABLE `Canal` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `urlBase` VARCHAR(191) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Categoria` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `padreId` VARCHAR(191) NULL,

    UNIQUE INDEX `Categoria_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Producto` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` ENUM('single', 'sellado', 'accesorio', 'snack', 'juego_mesa', 'juguete', 'evento', 'indeterminado', 'servicio') NOT NULL DEFAULT 'indeterminado',
    `juego` VARCHAR(191) NULL,
    `categoriaId` VARCHAR(191) NULL,
    `precioVenta` INTEGER NOT NULL DEFAULT 0,
    `controlaStock` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `posibleDuplicado` BOOLEAN NOT NULL DEFAULT false,
    `imagenUrl` TEXT NULL,
    `codigoBarras` VARCHAR(191) NULL,
    `cardNumber` VARCHAR(191) NULL,
    `atributos` JSON NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Producto_sku_key`(`sku`),
    INDEX `Producto_tipo_activo_idx`(`tipo`, `activo`),
    INDEX `Producto_codigoBarras_idx`(`codigoBarras`),
    INDEX `Producto_cardNumber_idx`(`cardNumber`),
    FULLTEXT INDEX `Producto_nombre_idx`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductoCanal` (
    `id` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `canalId` VARCHAR(191) NOT NULL,
    `externoId` INTEGER NULL,
    `externoSku` VARCHAR(191) NULL,
    `publicado` BOOLEAN NOT NULL DEFAULT true,
    `precioCanal` INTEGER NULL,
    `sincronizadoEn` DATETIME(3) NULL,
    `hashUltimoSync` VARCHAR(191) NULL,

    INDEX `ProductoCanal_productoId_idx`(`productoId`),
    UNIQUE INDEX `ProductoCanal_canalId_externoId_key`(`canalId`, `externoId`),
    UNIQUE INDEX `ProductoCanal_canalId_externoSku_key`(`canalId`, `externoSku`),
    UNIQUE INDEX `ProductoCanal_productoId_canalId_key`(`productoId`, `canalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` ENUM('vendedor', 'encargado', 'admin') NOT NULL DEFAULT 'vendedor',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Usuario_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TurnoCaja` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `estado` ENUM('abierto', 'cerrado') NOT NULL DEFAULT 'abierto',
    `abiertoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `montoApertura` INTEGER NOT NULL,
    `cerradoEn` DATETIME(3) NULL,
    `montoDeclarado` INTEGER NULL,
    `montoEsperado` INTEGER NULL,
    `diferencia` INTEGER NULL,
    `notas` TEXT NULL,

    INDEX `TurnoCaja_usuarioId_estado_idx`(`usuarioId`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Venta` (
    `id` VARCHAR(191) NOT NULL,
    `folio` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `canalId` VARCHAR(191) NOT NULL DEFAULT 'tienda_fisica',
    `turnoCajaId` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `clienteNombre` VARCHAR(191) NULL,
    `subtotal` INTEGER NOT NULL,
    `descuento` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL,
    `estado` ENUM('completada', 'anulada') NOT NULL DEFAULT 'completada',
    `motivoAnulacion` TEXT NULL,
    `anuladaEn` DATETIME(3) NULL,
    `anuladaPorId` VARCHAR(191) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Venta_folio_key`(`folio`),
    UNIQUE INDEX `Venta_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Venta_creadoEn_idx`(`creadoEn`),
    INDEX `Venta_turnoCajaId_idx`(`turnoCajaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VentaLinea` (
    `id` VARCHAR(191) NOT NULL,
    `ventaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` INTEGER NOT NULL,
    `descuentoLinea` INTEGER NOT NULL DEFAULT 0,
    `totalLinea` INTEGER NOT NULL,

    INDEX `VentaLinea_ventaId_idx`(`ventaId`),
    INDEX `VentaLinea_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pago` (
    `id` VARCHAR(191) NOT NULL,
    `ventaId` VARCHAR(191) NOT NULL,
    `medio` ENUM('efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro') NOT NULL,
    `monto` INTEGER NOT NULL,
    `montoRecibido` INTEGER NULL,
    `referencia` VARCHAR(191) NULL,

    INDEX `Pago_ventaId_idx`(`ventaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Correlativo` (
    `clave` VARCHAR(191) NOT NULL,
    `anio` INTEGER NOT NULL,
    `ultimo` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `canalId` VARCHAR(191) NULL,
    `operacion` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NULL,
    `resultado` VARCHAR(191) NOT NULL,
    `resuelto` BOOLEAN NOT NULL DEFAULT false,
    `detalle` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SyncLog_canalId_creadoEn_idx`(`canalId`, `creadoEn`),
    INDEX `SyncLog_resultado_resuelto_idx`(`resultado`, `resuelto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Auditoria` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `entidad` VARCHAR(191) NOT NULL,
    `entidadId` VARCHAR(191) NOT NULL,
    `accion` ENUM('crear', 'editar', 'anular', 'cambiar_precio', 'abrir_turno', 'cerrar_turno') NOT NULL,
    `valorAnterior` JSON NULL,
    `valorNuevo` JSON NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Auditoria_entidad_entidadId_idx`(`entidad`, `entidadId`),
    INDEX `Auditoria_usuarioId_creadoEn_idx`(`usuarioId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Categoria` ADD CONSTRAINT `Categoria_padreId_fkey` FOREIGN KEY (`padreId`) REFERENCES `Categoria`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Producto` ADD CONSTRAINT `Producto_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `Categoria`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductoCanal` ADD CONSTRAINT `ProductoCanal_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductoCanal` ADD CONSTRAINT `ProductoCanal_canalId_fkey` FOREIGN KEY (`canalId`) REFERENCES `Canal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TurnoCaja` ADD CONSTRAINT `TurnoCaja_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_canalId_fkey` FOREIGN KEY (`canalId`) REFERENCES `Canal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_turnoCajaId_fkey` FOREIGN KEY (`turnoCajaId`) REFERENCES `TurnoCaja`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_anuladaPorId_fkey` FOREIGN KEY (`anuladaPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VentaLinea` ADD CONSTRAINT `VentaLinea_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `Venta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VentaLinea` ADD CONSTRAINT `VentaLinea_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pago` ADD CONSTRAINT `Pago_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `Venta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auditoria` ADD CONSTRAINT `Auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
