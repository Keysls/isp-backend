/**
 * test-correo.js — Prueba de alertas de correo sin tocar el stock real.
 * Ejecutar desde la raíz del backend:
 *   node test-correo.js
 */

require('dotenv').config();
const { alertaStockBajo, notificacionIngresoStock } = require('./src/utils/mailer');

async function main() {
  console.log('\n📧 Probando alertas de correo...\n');
  console.log('Destino:', process.env.MAIL_ALERT_TO);
  console.log('Servidor:', process.env.MAIL_HOST);
  console.log('Usuario:', process.env.MAIL_USER);
  console.log('Umbral configurado:', process.env.STOCK_ALERTA_MAXIMO || 150, '\n');

  // ── Prueba 1: Alerta de stock bajo ───────────────────────────
  console.log('1️⃣  Enviando alerta de STOCK BAJO...');
  await alertaStockBajo([
    { nombre: 'ONU GPON ZTE F660',   stock: 0,   stockMinimo: 10 },
    { nombre: 'Triplexor 1GHz',      stock: 45,  stockMinimo: 20 },
    { nombre: 'Cable FO Monomodo',   stock: 120, stockMinimo: 50 },
  ], 'Trujillo (Sede Principal)');
  console.log('   ✅ Enviado\n');

  // ── Prueba 2: Notificación de ingreso ────────────────────────
  console.log('2️⃣  Enviando notificación de INGRESO DE STOCK...');
  await notificacionIngresoStock([
    { nombre: 'ONU GPON ZTE F660',  cantidadIngresada: 50,  stockNuevo: 50  },
    { nombre: 'Triplexor 1GHz',     cantidadIngresada: 100, stockNuevo: 145 },
    { nombre: 'Splitter 1x8',       cantidadIngresada: 200, stockNuevo: 350 },
  ], 'Trujillo (Sede Principal)', 'Luis Administrador', 'Compra mensual proveedor');
  console.log('   ✅ Enviado\n');

  console.log('🎉 Pruebas completadas. Revisa tu correo en:', process.env.MAIL_ALERT_TO);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error('\nVerifica:');
  console.error('  - MAIL_USER y MAIL_PASS en .env');
  console.error('  - Para Gmail: usa App Password (no tu contraseña normal)');
  console.error('  - Para Gmail: activa verificación en 2 pasos primero');
  process.exit(1);
});