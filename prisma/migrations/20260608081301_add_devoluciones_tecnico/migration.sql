-- CreateTable
CREATE TABLE "devoluciones_tecnico" (
    "id" SERIAL NOT NULL,
    "tecnico_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "comentario" TEXT,
    "registrado_por" TEXT,
    "revisado_por" TEXT,
    "fecha_revision" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_detalles" (
    "id" SERIAL NOT NULL,
    "devolucion_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "devolucion_detalles_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "devoluciones_tecnico" ADD CONSTRAINT "devoluciones_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_tecnico" ADD CONSTRAINT "devoluciones_tecnico_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_detalles" ADD CONSTRAINT "devolucion_detalles_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones_tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_detalles" ADD CONSTRAINT "devolucion_detalles_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
