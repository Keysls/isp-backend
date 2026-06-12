# ISP Backend — Sistema de Gestión de Instalaciones

Backend REST API para gestionar órdenes de servicio, técnicos instaladores e instalaciones de internet/dúo.

---

## 🛠️ Stack

- **Runtime:** Node.js 18+
- **Framework:** Express
- **ORM:** Prisma
- **Base de datos:** PostgreSQL
- **Auth:** JWT
- **Archivos:** Multer (local) / S3-compatible

---

## 🚀 Instalación paso a paso

### 1. Requisitos previos
```bash
# Instalar Node.js 18+
# Instalar PostgreSQL 14+
```

### 2. Clonar e instalar dependencias
```bash
cd isp-backend
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus datos de PostgreSQL y JWT secret
```

Ejemplo de `.env`:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" regenerá ambas variables con openssl rand -hex 48 o similar.
DATABASE_URL="postgresql://postgres:tu_password@localhost:5432/isp_instalaciones"
JWT_SECRET="un_secreto_largo_y_aleatorio_aqui"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
```

### 4. Crear la base de datos en PostgreSQL
```sql
-- En psql o pgAdmin:
CREATE DATABASE EnetFiberPeru_SistemaInstalaciones;
```

### 5. Ejecutar migraciones
```bash
npm run db:migrate
# Te pedirá un nombre para la migración, escribe: init EnetFiberPeru_SistemaInstalaciones
```

### 6. Generar cliente Prisma
```bash
npm run db:generate
```

### 7. Ejecutar el seed (datos iniciales)
```bash
npm run seed
node src/utils/seedTiposOrden.js
npm run db:studio 
```
Esto crea:
- Usuario admin: `admin@isp.com` / `Admin123!`
- 7 modelos de ONU predefinidos (ZTE, Huawei, Nokia, etc.)

### 8. Iniciar el servidor
```bash
npm run dev        # Desarrollo (auto-reload)
npm start          # Producción
```

---

## 📡 Endpoints API

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Datos del usuario actual |

### Técnicos (requiere rol ADMIN)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tecnicos` | Listar todos los técnicos |
| GET | `/api/tecnicos/:id` | Ver técnico con sus órdenes activas |
| POST | `/api/tecnicos` | Registrar nuevo técnico |
| PUT | `/api/tecnicos/:id` | Actualizar datos del técnico |

### Órdenes de Servicio
| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/api/ordenes/subir-pdf` | ADMIN | Sube PDF y extrae datos automáticamente |
| POST | `/api/ordenes` | ADMIN | Confirma y guarda la orden |
| GET | `/api/ordenes` | TODOS | Lista órdenes (técnico solo ve las suyas) |
| GET | `/api/ordenes/:id` | TODOS | Ver detalle completo |
| PATCH | `/api/ordenes/:id/asignar` | ADMIN/SUPERVISOR | Asignar técnico |
| PATCH | `/api/ordenes/:id/estado` | ADMIN/SUPERVISOR | Cambiar estado |

### Instalaciones (flujo del técnico)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/instalaciones/iniciar/:ordenId` | Llegar al lugar (guarda GPS) |
| POST | `/api/instalaciones/:id/fotos` | Subir fotos (caja, potencia, final) |
| PUT | `/api/instalaciones/:id/equipo` | Registrar modelo de ONU instalado |
| POST | `/api/instalaciones/:id/config-onu` | Guardar config leída de la ONU |
| POST | `/api/instalaciones/:id/sincronizar-offline` | Sync datos guardados sin internet |
| POST | `/api/instalaciones/:id/completar` | Finalizar instalación |
| GET | `/api/instalaciones/:id` | Ver detalle con fotos y config |

### ONU
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/onu/modelos` | Catálogo de modelos disponibles |
| POST | `/api/onu/modelos` | Agregar nuevo modelo (ADMIN) |
| GET | `/api/onu/modelos/:id/instrucciones` | Cómo conectarse a ese modelo |

---

## 📱 Flujo completo del técnico

```
1. POST /api/auth/login
        ↓
2. GET  /api/ordenes   (filtra las suyas automáticamente)
        ↓
3. GET  /api/ordenes/:id   (ver datos del cliente)
        ↓
4. POST /api/instalaciones/iniciar/:ordenId   { latitud, longitud }
        ↓
5. POST /api/instalaciones/:id/fotos   (CAJA_NAP, POTENCIA, INSTALACION_FINAL)
        ↓
6. PUT  /api/instalaciones/:id/equipo   { modeloOnu, marcaOnu, serieOnu }
        ↓
7. [Técnico se conecta al WiFi del equipo — SIN INTERNET]
   App guarda los datos de config en SQLite local
        ↓
8. [Técnico se desconecta del WiFi — RECUPERA INTERNET]
   POST /api/instalaciones/:id/config-onu  (sincroniza automáticamente)
        ↓
9. POST /api/instalaciones/:id/completar   { observaciones }
```

---

## 🗄️ Estructura del proyecto

```
isp-backend/
├── prisma/
│   └── schema.prisma          # Esquema completo de BD
├── src/
│   ├── app.js                 # Entry point
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── tecnicos.controller.js
│   │   ├── ordenes.controller.js
│   │   ├── instalaciones.controller.js
│   │   └── onu.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── usuarios.routes.js
│   │   ├── tecnicos.routes.js
│   │   ├── ordenes.routes.js
│   │   ├── instalaciones.routes.js
│   │   └── onu.routes.js
│   ├── middleware/
│   │   └── auth.middleware.js
│   ├── services/
│   │   └── pdf.service.js     # Extracción de datos del PDF
│   └── utils/
│       ├── prisma.js           # Singleton Prisma Client
│       └── seed.js             # Datos iniciales
├── uploads/                   # Fotos y PDFs (en producción usar S3)
├── .env.example
└── README.md
```

---

## 🗃️ Modelos de Base de Datos

| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Todos los usuarios del sistema |
| `tecnicos` | Perfil extendido de técnicos (DNI, zona, vehículo) |
| `tokens_sesion` | Control de sesiones JWT activas |
| `ordenes_servicio` | Órdenes extraídas de los PDFs |
| `instalaciones` | Registro de cada instalación realizada |
| `config_onu` | Configuración técnica leída del equipo |
| `fotos_instalacion` | Fotos tomadas durante la instalación |
| `modelos_onu` | Catálogo de equipos con datos de conexión |
| `log_actividad` | Auditoría de acciones del sistema |

---

## 🔒 Roles y permisos

| Acción | ADMIN | SUPERVISOR | TECNICO |
|--------|-------|-----------|---------|
| Crear técnicos | ✅ | ❌ | ❌ |
| Ver todos los técnicos | ✅ | ✅ | ❌ |
| Subir PDF / crear orden | ✅ | ❌ | ❌ |
| Asignar técnico | ✅ | ✅ | ❌ |
| Ver órdenes | ✅ todas | ✅ todas | ✅ solo las propias |
| Ejecutar instalación | ❌ | ❌ | ✅ |

---

## 🌐 Para producción

1. Usar un servidor como **Railway**, **Render** o **VPS propio**
2. Cambiar almacenamiento de fotos a **Cloudflare R2** o **AWS S3**
3. Poner el backend detrás de **nginx** con HTTPS
4. Usar `npm run db:migrate:prod` en lugar de `db:migrate`
5. Configurar `NODE_ENV=production`


---
netstat -ano | findstr :3000  
taskkill /PID 18012  /F