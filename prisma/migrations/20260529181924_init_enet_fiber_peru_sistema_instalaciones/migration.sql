-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'TECNICO');

-- CreateEnum
CREATE TYPE "TipoOrden" AS ENUM ('INSTALACION_I', 'ALTA_SERVICIO_I', 'ATENCION_NOC_I', 'AVERIA_I', 'BAJA_SERVICIO_I', 'CAMBIO_CONTRASENA_I', 'CAMBIO_DOMICILIO_I', 'CAMBIO_EQUIPO_I', 'CAMBIO_PLAN_I', 'CAMBIO_TITULAR_I', 'CORTE_SOLICITUD_I', 'CORTE_DEUDA_I', 'RECONEXION_I', 'RETIRO_EQUIPO_I', 'TRASLADO_I', 'INSTALACION_C', 'ALTA_SERVICIO_C', 'AVERIA_C', 'CAMBIO_DOMICILIO_C', 'CAMBIO_PLAN_C', 'CAMBIO_TITULAR_C', 'CORTE_SOLICITUD_C', 'CORTE_DEUDA_C', 'INSTALACION_ANEXO_C', 'MIGRACION_FTTH_C', 'RECONEXION_C', 'RETIRO_EQUIPO_C', 'SUPERVISION_C', 'TRASLADO_C', 'INSTALACION_D', 'ALTA_SERVICIO_D', 'AVERIA_D', 'BAJA_SERVICIO_D', 'CAMBIO_DOMICILIO_D', 'CAMBIO_EQUIPO_D', 'CAMBIO_PLAN_D', 'CAMBIO_TITULAR_D', 'CORTE_SOLICITUD_D', 'CORTE_DEUDA_D', 'RECONEXION_D', 'RETIRO_EQUIPO_D', 'TRASLADO_D');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('PENDIENTE_NOC', 'PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'REPROGRAMADA');

-- CreateEnum
CREATE TYPE "TipoFoto" AS ENUM ('FOTO_1', 'FOTO_2', 'FOTO_3', 'CAJA_NAP', 'POTENCIA', 'INSTALACION_FINAL', 'OTROS');

-- CreateEnum
CREATE TYPE "TipoPuntoRed" AS ENUM ('NAP', 'CTO');

-- CreateEnum
CREATE TYPE "EstadoPuntoRed" AS ENUM ('ACTIVA', 'SATURADA', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "TipoServicio" AS ENUM ('INTERNET', 'CABLE', 'DUO');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('ORDEN_PENDIENTE_WAN', 'ONU_ERROR_OLT');

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'TECNICO',
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sedeId" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnicos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "zonaAsignada" TEXT,
    "vehiculo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_sesion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "dispositivo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),

    CONSTRAINT "tokens_sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "numero" TEXT NOT NULL,
    "abonado" TEXT NOT NULL,
    "dni" TEXT,
    "celular" TEXT,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "sector" TEXT,
    "sedeId" TEXT NOT NULL,
    "tipoServicio" "TipoServicio",
    "ipWan" TEXT,
    "mascara" TEXT,
    "gateway" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "ordenes_servicio" (
    "id" TEXT NOT NULL,
    "nServicio" TEXT NOT NULL,
    "tipoOrden" "TipoOrden" NOT NULL,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'PENDIENTE_NOC',
    "fechaServicio" TIMESTAMP(3) NOT NULL,
    "contrato" TEXT,
    "pdfOriginalUrl" TEXT,
    "sedeId" TEXT,
    "abonado" TEXT NOT NULL,
    "dni" TEXT,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "sector" TEXT,
    "celular" TEXT NOT NULL,
    "observacion" TEXT,
    "tecnicoId" TEXT,
    "fechaAsignacion" TIMESTAMP(3),
    "ipWan" TEXT,
    "mascara" TEXT,
    "gateway" TEXT,
    "fechaWan" TIMESTAMP(3),
    "nocUsuarioId" TEXT,
    "fechaAceptacion" TIMESTAMP(3),
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "tiempoInstalacion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalaciones" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "direccionGps" TEXT,
    "fechaLlegada" TIMESTAMP(3),
    "modeloOnu" TEXT,
    "marcaOnu" TEXT,
    "serieOnu" TEXT,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "fechaFin" TIMESTAMP(3),
    "observaciones" TEXT,
    "pendienteSincronizar" BOOLEAN NOT NULL DEFAULT false,
    "datosOffline" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instalaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_onu" (
    "id" TEXT NOT NULL,
    "instalacionId" TEXT NOT NULL,
    "ipWan" TEXT,
    "mascara" TEXT,
    "gateway" TEXT,
    "dns1" TEXT,
    "dns2" TEXT,
    "ssid" TEXT,
    "ssidPassword" TEXT,
    "ssid5ghz" TEXT,
    "ssidPassword5ghz" TEXT,
    "mac" TEXT,
    "serialNumber" TEXT,
    "ponMode" TEXT,
    "potenciaRx" DOUBLE PRECISION,
    "potenciaTx" DOUBLE PRECISION,
    "temperatura" DOUBLE PRECISION,
    "voltaje" DOUBLE PRECISION,
    "estado" TEXT,
    "pppoeUser" TEXT,
    "pppoePassword" TEXT,
    "rawConfig" JSONB,
    "wanPrecargada" BOOLEAN NOT NULL DEFAULT false,
    "configApp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estadoOlt" VARCHAR(20) DEFAULT 'PENDIENTE_OLT',
    "oltId" TEXT,
    "puertoOlt" VARCHAR(20),
    "onuIdOlt" VARCHAR(10),
    "fechaAutorizacion" TIMESTAMP(6),
    "errorOlt" TEXT,
    "vlan" VARCHAR(10),

    CONSTRAINT "config_onu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_instalacion" (
    "id" TEXT NOT NULL,
    "instalacionId" TEXT NOT NULL,
    "tipo" "TipoFoto" NOT NULL,
    "url" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tamanio" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_instalacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_onu" (
    "id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "descripcion" TEXT,
    "ipDefault" TEXT NOT NULL DEFAULT '192.168.1.1',
    "userDefault" TEXT NOT NULL DEFAULT 'admin',
    "passDefault" TEXT NOT NULL DEFAULT 'admin',
    "protocolo" TEXT NOT NULL DEFAULT 'HTTP',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_onu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "olt_fabricantes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "olt_fabricantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "olt_modelos" (
    "id" SERIAL NOT NULL,
    "fabricanteId" INTEGER NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "olt_modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "olts" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "nombre" VARCHAR(150) NOT NULL,
    "direccionIp" VARCHAR(45) NOT NULL,
    "fabricanteId" INTEGER NOT NULL,
    "modeloId" INTEGER NOT NULL,
    "usuario" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(256) NOT NULL,
    "puertoSnmp" INTEGER NOT NULL DEFAULT 161,
    "puertoSsh" INTEGER NOT NULL DEFAULT 22,
    "puertoTelnet" INTEGER NOT NULL DEFAULT 23,
    "snmpCommunity" VARCHAR(64) NOT NULL DEFAULT 'public',
    "estado" VARCHAR(20) NOT NULL DEFAULT 'Desconectado',
    "ultimaRevision" TIMESTAMP(6),
    "sedeId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vlanDefecto" VARCHAR(10) NOT NULL DEFAULT '100',
    "tContDefecto" VARCHAR(100) NOT NULL DEFAULT 'ENET-FIBER-1GB',
    "formatoOnuDefecto" VARCHAR(50) NOT NULL DEFAULT 'ZTE-F625',

    CONSTRAINT "olts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_actividad" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "tabla" TEXT,
    "registroId" TEXT,
    "detalles" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puntos_red" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPuntoRed" NOT NULL,
    "codigo" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "capacidad" INTEGER,
    "ocupados" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoPuntoRed" NOT NULL DEFAULT 'ACTIVA',
    "sedeId" TEXT NOT NULL,
    "direccion" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puntos_red_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_usuarioId_key" ON "tecnicos"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_dni_key" ON "tecnicos"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_sesion_token_key" ON "tokens_sesion"("token");

-- CreateIndex
CREATE INDEX "contratos_sedeId_idx" ON "contratos"("sedeId");

-- CreateIndex
CREATE INDEX "contratos_dni_idx" ON "contratos"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_servicio_nServicio_key" ON "ordenes_servicio"("nServicio");

-- CreateIndex
CREATE INDEX "ordenes_servicio_contrato_idx" ON "ordenes_servicio"("contrato");

-- CreateIndex
CREATE UNIQUE INDEX "instalaciones_ordenId_key" ON "instalaciones"("ordenId");

-- CreateIndex
CREATE UNIQUE INDEX "config_onu_instalacionId_key" ON "config_onu"("instalacionId");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_onu_marca_modelo_key" ON "modelos_onu"("marca", "modelo");

-- CreateIndex
CREATE UNIQUE INDEX "olt_fabricantes_nombre_key" ON "olt_fabricantes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "olt_modelos_fabricanteId_nombre_key" ON "olt_modelos"("fabricanteId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "olts_nombre_key" ON "olts"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "olts_direccionIp_puertoSsh_key" ON "olts"("direccionIp", "puertoSsh");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_red_codigo_key" ON "puntos_red"("codigo");

-- CreateIndex
CREATE INDEX "puntos_red_sedeId_idx" ON "puntos_red"("sedeId");

-- CreateIndex
CREATE INDEX "notificaciones_leida_createdAt_idx" ON "notificaciones"("leida", "createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_sedeId_idx" ON "notificaciones"("sedeId");

-- CreateIndex
CREATE INDEX "notificaciones_ordenId_idx" ON "notificaciones"("ordenId");

-- CreateIndex
CREATE INDEX "notificaciones_configOnuId_idx" ON "notificaciones"("configOnuId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_sesion" ADD CONSTRAINT "tokens_sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_contrato_fkey" FOREIGN KEY ("contrato") REFERENCES "contratos"("numero") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "tecnicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_onu" ADD CONSTRAINT "config_onu_instalacionId_fkey" FOREIGN KEY ("instalacionId") REFERENCES "instalaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_onu" ADD CONSTRAINT "config_onu_oltId_fkey" FOREIGN KEY ("oltId") REFERENCES "olts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fotos_instalacion" ADD CONSTRAINT "fotos_instalacion_instalacionId_fkey" FOREIGN KEY ("instalacionId") REFERENCES "instalaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "olt_modelos" ADD CONSTRAINT "olt_modelos_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "olt_fabricantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "olts" ADD CONSTRAINT "olts_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "olt_fabricantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "olts" ADD CONSTRAINT "olts_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "olt_modelos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "olts" ADD CONSTRAINT "olts_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "puntos_red" ADD CONSTRAINT "puntos_red_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
