-- AlterTable
ALTER TABLE "devolucion_detalles" ADD COLUMN     "cantidad_buena" DECIMAL(10,2),
ADD COLUMN     "cantidad_mala" DECIMAL(10,2),
ADD COLUMN     "comentario" TEXT,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'pendiente',
ADD COLUMN     "fecha_revision" TIMESTAMP(3),
ADD COLUMN     "revisado_por" TEXT;
