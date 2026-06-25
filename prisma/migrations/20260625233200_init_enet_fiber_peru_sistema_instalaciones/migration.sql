-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN', 'OPERADOR_NOC', 'ADMIN', 'TECNICO', 'SECRETARIA');

-- CreateEnum
CREATE TYPE "TipoOrden" AS ENUM ('INSTALACION_I', 'ALTA_SERVICIO_I', 'ATENCION_NOC_I', 'AVERIA_I', 'BAJA_SERVICIO_I', 'CAMBIO_CONTRASENA_I', 'CAMBIO_DOMICILIO_I', 'CAMBIO_EQUIPO_I', 'CAMBIO_PLAN_I', 'CAMBIO_TITULAR_I', 'CORTE_SOLICITUD_I', 'CORTE_DEUDA_I', 'RECONEXION_I', 'RETIRO_EQUIPO_I', 'TRASLADO_I', 'INSTALACION_C', 'ALTA_SERVICIO_C', 'AVERIA_C', 'CAMBIO_DOMICILIO_C', 'CAMBIO_PLAN_C', 'CAMBIO_TITULAR_C', 'CORTE_SOLICITUD_C', 'CORTE_DEUDA_C', 'INSTALACION_ANEXO_C', 'MIGRACION_FTTH_C', 'RECONEXION_C', 'RETIRO_EQUIPO_C', 'SUPERVISION_C', 'TRASLADO_C', 'INSTALACION_D', 'ALTA_SERVICIO_D', 'AVERIA_D', 'BAJA_SERVICIO_D', 'CAMBIO_DOMICILIO_D', 'CAMBIO_EQUIPO_D', 'CAMBIO_PLAN_D', 'CAMBIO_TITULAR_D', 'CORTE_SOLICITUD_D', 'CORTE_DEUDA_D', 'RECONEXION_D', 'RETIRO_EQUIPO_D', 'TRASLADO_D');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('PENDIENTE_NOC', 'PENDIENTE_TECNICO', 'ACEPTADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'REPROGRAMADA');

-- CreateEnum
CREATE TYPE "TipoPuntoRed" AS ENUM ('NAP', 'CTO');

-- CreateEnum
CREATE TYPE "EstadoPuntoRed" AS ENUM ('ACTIVA', 'SATURADA', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "TipoServicio" AS ENUM ('INTERNET', 'CABLE', 'DUO');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('ORDEN_PENDIENTE_WAN', 'ONU_ERROR_OLT', 'ENVIO_PENDIENTE_RECEPCION', 'STOCK_BAJO', 'STOCK_CRITICO');

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "direccion" TEXT,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "puede_enviar_stock" BOOLEAN NOT NULL DEFAULT false,
    "correo_receptor" TEXT,
    "correo_emisor" TEXT,
    "correo_emisor_pass" TEXT,

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
    "totpSecret" TEXT,
    "totpActivo" BOOLEAN NOT NULL DEFAULT false,

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
    "sedeId" VARCHAR(36),

    CONSTRAINT "tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_sesion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "dispositivo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),

    CONSTRAINT "tokens_sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
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
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "precinto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mbps" INTEGER,
    "plan_id" TEXT,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
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
    "mensualidad" DECIMAL(10,2),
    "mbps" INTEGER,
    "plan_id" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

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
    "url" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tamanio" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" VARCHAR(50) NOT NULL,

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
    "sedeId" TEXT,
    "codigo_pon" VARCHAR(100),
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
    "codigo_pon" TEXT,

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

-- CreateTable
CREATE TABLE "planes_internet" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "sede_id" TEXT NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "mbps" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tipo_servicio" VARCHAR(10) NOT NULL DEFAULT 'INTERNET',

    CONSTRAINT "planes_internet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_tipos_orden" (
    "codigo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "flujo" TEXT NOT NULL,
    "requiere_wan" BOOLEAN NOT NULL DEFAULT false,
    "autoriza_olt" BOOLEAN NOT NULL DEFAULT false,
    "es_retiro" BOOLEAN NOT NULL DEFAULT false,
    "es_baja" BOOLEAN NOT NULL DEFAULT false,
    "es_instalacion" BOOLEAN NOT NULL DEFAULT false,
    "es_corte" BOOLEAN NOT NULL DEFAULT false,
    "es_cambio_equipo" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "config_tipos_orden_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_usuarioId_key" ON "tecnicos"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_dni_sedeId_key" ON "tecnicos"("dni", "sedeId");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_sesion_token_key" ON "tokens_sesion"("token");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_sesion_refreshToken_key" ON "tokens_sesion"("refreshToken");

-- CreateIndex
CREATE INDEX "contratos_sedeId_idx" ON "contratos"("sedeId");

-- CreateIndex
CREATE INDEX "contratos_dni_idx" ON "contratos"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_numero_sedeId_key" ON "contratos"("numero", "sedeId");

-- CreateIndex
CREATE INDEX "ordenes_servicio_contrato_idx" ON "ordenes_servicio"("contrato");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_servicio_nServicio_sedeId_key" ON "ordenes_servicio"("nServicio", "sedeId");

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
CREATE UNIQUE INDEX "olts_nombre_sedeId_key" ON "olts"("nombre", "sedeId");

-- CreateIndex
CREATE UNIQUE INDEX "olts_direccionIp_puertoSsh_sedeId_key" ON "olts"("direccionIp", "puertoSsh", "sedeId");

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

-- CreateIndex
CREATE INDEX "planes_internet_sede_id_idx" ON "planes_internet"("sede_id");

-- CreateIndex
CREATE INDEX "idx_planes_internet_sede" ON "planes_internet"("sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_sesion" ADD CONSTRAINT "tokens_sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_internet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_contrato_sedeId_fkey" FOREIGN KEY ("contrato", "sedeId") REFERENCES "contratos"("numero", "sedeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_internet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "equipos_cabecera" ADD CONSTRAINT "equipos_cabecera_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "puntos_red" ADD CONSTRAINT "puntos_red_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_tecnico" ADD CONSTRAINT "consumo_tecnico_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_tecnico" ADD CONSTRAINT "consumo_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tecnicos" ADD CONSTRAINT "entregas_tecnicos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_tecnicos" ADD CONSTRAINT "entregas_tecnicos_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "log_actividad" ADD CONSTRAINT "log_actividad_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_tecnico" ADD CONSTRAINT "devoluciones_tecnico_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_tecnico" ADD CONSTRAINT "devoluciones_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_detalles" ADD CONSTRAINT "devolucion_detalles_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones_tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_detalles" ADD CONSTRAINT "devolucion_detalles_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_internet" ADD CONSTRAINT "planes_internet_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
