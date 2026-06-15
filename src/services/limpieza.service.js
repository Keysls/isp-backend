// src/services/limpieza.service.js
// Limpieza automática diaria de registros expirados

const prisma = require('../utils/prisma');

const ejecutarLimpieza = async () => {
  const ahora = new Date();
  console.log(`[LIMPIEZA] Iniciando limpieza — ${ahora.toISOString()}`);

  try {
    // 1. Tokens de sesión expirados o inactivos (más de 30 días)
    const hace30dias = new Date(ahora - 30 * 24 * 60 * 60 * 1000);
    const tokensBorrados = await prisma.tokenSesion.deleteMany({
      where: {
        OR: [
          { expiresAt:  { lt: ahora } },
          { activo: false, createdAt: { lt: hace30dias } },
        ],
      },
    });
    console.log(`[LIMPIEZA] Tokens expirados eliminados: ${tokensBorrados.count}`);

    // 2. Tokens de reset de contraseña usados o expirados
    const resetsBorrados = await prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: ahora } },
          { usado: true, createdAt: { lt: hace30dias } },
        ],
      },
    });
    console.log(`[LIMPIEZA] Tokens de reset eliminados: ${resetsBorrados.count}`);

    // 3. Logs de actividad con más de 1 año (opcional — ajustar según necesidad)
    const hace1año = new Date(ahora);
    hace1año.setFullYear(hace1año.getFullYear() - 1);
    const logsBorrados = await prisma.logActividad.deleteMany({
      where: {
        createdAt: { lt: hace1año },
        accion:    { notIn: ['LOGIN', 'LOGIN_FALLIDO', 'CREAR_USUARIO', 'ELIMINAR_ORDEN'] },
      },
    });
    console.log(`[LIMPIEZA] Logs antiguos eliminados: ${logsBorrados.count}`);

    console.log(`[LIMPIEZA] ✅ Completada`);
  } catch (err) {
    console.error(`[LIMPIEZA] ❌ Error:`, err.message);
  }
};

// Ejecutar cada 24 horas
const iniciarLimpieza = () => {
  // Primera ejecución al arrancar (después de 5 segundos)
  setTimeout(ejecutarLimpieza, 5000);

  // Luego cada 24 horas
  setInterval(ejecutarLimpieza, 24 * 60 * 60 * 1000);

  console.log('[LIMPIEZA] Servicio de limpieza automática iniciado (cada 24h)');
};

module.exports = { iniciarLimpieza, ejecutarLimpieza };