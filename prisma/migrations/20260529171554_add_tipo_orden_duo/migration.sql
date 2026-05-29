-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoOrden" ADD VALUE 'INSTALACION_D';
ALTER TYPE "TipoOrden" ADD VALUE 'ALTA_SERVICIO_D';
ALTER TYPE "TipoOrden" ADD VALUE 'AVERIA_D';
ALTER TYPE "TipoOrden" ADD VALUE 'BAJA_SERVICIO_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CAMBIO_DOMICILIO_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CAMBIO_EQUIPO_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CAMBIO_PLAN_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CAMBIO_TITULAR_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CORTE_SOLICITUD_D';
ALTER TYPE "TipoOrden" ADD VALUE 'CORTE_DEUDA_D';
ALTER TYPE "TipoOrden" ADD VALUE 'RECONEXION_D';
ALTER TYPE "TipoOrden" ADD VALUE 'RETIRO_EQUIPO_D';
ALTER TYPE "TipoOrden" ADD VALUE 'TRASLADO_D';
