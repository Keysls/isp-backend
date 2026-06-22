-- CreateTable
CREATE TABLE "equipos_cabecera" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "direccionIp" VARCHAR(45),
    "usuario" VARCHAR(100),
    "passwordHash" VARCHAR(256),
    "notas" TEXT,
    "sedeId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipos_cabecera_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "equipos_cabecera" ADD CONSTRAINT "equipos_cabecera_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
