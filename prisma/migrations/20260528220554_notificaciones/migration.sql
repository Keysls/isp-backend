-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('ORDEN_PENDIENTE_WAN', 'ONU_ERROR_OLT');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "link" TEXT,
    "sedeId" TEXT,
    "ordenId" TEXT,
    "configOnuId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMP(3),
    "leidaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_leida_createdAt_idx" ON "notificaciones"("leida", "createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_sedeId_idx" ON "notificaciones"("sedeId");

-- CreateIndex
CREATE INDEX "notificaciones_ordenId_idx" ON "notificaciones"("ordenId");

-- CreateIndex
CREATE INDEX "notificaciones_configOnuId_idx" ON "notificaciones"("configOnuId");
