-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'SECRETARIA';

-- AlterTable
ALTER TABLE "sedes" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "es_principal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puede_enviar_stock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "stock_total" INTEGER NOT NULL DEFAULT 0,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT,
    "categoria" TEXT,
    "unidad" TEXT,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "es_medible" BOOLEAN NOT NULL DEFAULT false,
    "metros_por_unidad" INTEGER,
    "metros_disponibles" INTEGER,
    "tiene_variantes" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_variantes" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "talla" TEXT,
    "genero" TEXT,
    "stock_total" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "producto_variantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sede" (
    "id" SERIAL NOT NULL,
    "sede_id" TEXT NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sede_variante" (
    "id" SERIAL NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "sede_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_sede_variante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_stock" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" TEXT,
    "guia" TEXT,
    "sede_id" TEXT,
    "comentario" TEXT,

    CONSTRAINT "entradas_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios" (
    "id" SERIAL NOT NULL,
    "sede_id" TEXT NOT NULL,
    "usuario_id" VARCHAR(36) NOT NULL,
    "guia" TEXT NOT NULL,
    "comentario" TEXT,
    "fecha_envio" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "sede_origen_id" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fecha_confirmacion" TIMESTAMP(3),
    "motivo_cancelacion" TEXT,

    CONSTRAINT "envios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio_detalles" (
    "id" SERIAL NOT NULL,
    "envio_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "variante_id" INTEGER,

    CONSTRAINT "envio_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_tecnicos" (
    "id" SERIAL NOT NULL,
    "tecnico_id" TEXT NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "sede_id" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_tecnico" (
    "id" SERIAL NOT NULL,
    "tecnico_id" TEXT NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_tecnicos" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "tecnico_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" TEXT,
    "sede_id" TEXT,

    CONSTRAINT "entregas_tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onus" (
    "id" SERIAL NOT NULL,
    "codigo_pon" TEXT,
    "producto_id" INTEGER NOT NULL,
    "sede_id" TEXT NOT NULL,
    "tecnico_id" TEXT,
    "cliente" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "salida_directa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "onus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recojos" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT,
    "tecnico_id" TEXT NOT NULL,
    "cliente" TEXT,
    "direccion" TEXT,
    "serie" TEXT,
    "tipo_equipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "registrado_por" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "comentario" TEXT,
    "grupo_orden" TEXT,
    "codigo_pon" TEXT,
    "producto_id" INTEGER,

    CONSTRAINT "recojos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onus_recicladas" (
    "id" SERIAL NOT NULL,
    "recojo_id" INTEGER NOT NULL,
    "tipo_equipo" TEXT NOT NULL DEFAULT 'ONU',
    "onu_id" INTEGER,
    "codigo_pon" TEXT,
    "producto_id" INTEGER,
    "sede_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'revision',
    "comentario" TEXT,
    "revisado_por" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "estado_tecnico" TEXT NOT NULL DEFAULT 'en_mano',

    CONSTRAINT "onus_recicladas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salidas_directas" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "sede_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "comentario" TEXT,
    "registrado_por" TEXT,
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salidas_directas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activos" (
    "id" SERIAL NOT NULL,
    "sede_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "nro_serie" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'operativo',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_sede_sede_id_producto_id_key" ON "stock_sede"("sede_id", "producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_sede_variante_variante_id_sede_id_key" ON "stock_sede_variante"("variante_id", "sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_tecnicos_tecnico_id_producto_id_sede_id_key" ON "asignaciones_tecnicos"("tecnico_id", "producto_id", "sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "onus_codigo_pon_key" ON "onus"("codigo_pon");

-- CreateIndex
CREATE UNIQUE INDEX "recojos_codigo_key" ON "recojos"("codigo");

-- AddForeignKey
ALTER TABLE "producto_variantes" ADD CONSTRAINT "producto_variantes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sede" ADD CONSTRAINT "stock_sede_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sede" ADD CONSTRAINT "stock_sede_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sede_variante" ADD CONSTRAINT "stock_sede_variante_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sede_variante" ADD CONSTRAINT "stock_sede_variante_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_stock" ADD CONSTRAINT "entradas_stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_sede_origen_id_fkey" FOREIGN KEY ("sede_origen_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_detalles" ADD CONSTRAINT "envio_detalles_envio_id_fkey" FOREIGN KEY ("envio_id") REFERENCES "envios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_detalles" ADD CONSTRAINT "envio_detalles_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_detalles" ADD CONSTRAINT "envio_detalles_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_tecnico" ADD CONSTRAINT "consumo_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_tecnico" ADD CONSTRAINT "consumo_tecnico_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tecnicos" ADD CONSTRAINT "entregas_tecnicos_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tecnicos" ADD CONSTRAINT "entregas_tecnicos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus" ADD CONSTRAINT "onus_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus_recicladas" ADD CONSTRAINT "onus_recicladas_recojo_id_fkey" FOREIGN KEY ("recojo_id") REFERENCES "recojos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onus_recicladas" ADD CONSTRAINT "onus_recicladas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salidas_directas" ADD CONSTRAINT "salidas_directas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salidas_directas" ADD CONSTRAINT "salidas_directas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activos" ADD CONSTRAINT "activos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
