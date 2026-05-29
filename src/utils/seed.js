// src/utils/seed.js
// Ejecutar con: node src/utils/seed.js

const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

async function main() {
  console.log('🌱 Ejecutando seed...');

  // 1. Crear SUPERADMIN (global, sin sede)
  const superadminPass = await bcrypt.hash('Admin123!', 12);
  const superadmin = await prisma.usuario.upsert({
    where:  { email: 'superadmin@enetfiber.com' },
    update: {},
    create: {
      nombre:   'Super',
      apellido: 'Admin',
      email:    'superadmin@enetfiber.com',
      password: superadminPass,
      rol:      'SUPERADMIN',
      sedeId:   null,
    },
  });
  console.log('✅ SUPERADMIN:', superadmin.email);

  // 2. Crear OPERADOR NOC (global, sin sede)
  const nocPass = await bcrypt.hash('Admin123!', 12);
  const operadorNoc = await prisma.usuario.upsert({
    where:  { email: 'noc@enetfiber.com' },
    update: {},
    create: {
      nombre:   'Operador',
      apellido: 'NOC',
      email:    'noc@enetfiber.com',
      password: nocPass,
      rol:      'OPERADOR_NOC',
      sedeId:   null,
    },
  });
  console.log('✅ OPERADOR_NOC:', operadorNoc.email);

  // 3. Crear sede Trujillo
  const sedeTrujillo = await prisma.sede.upsert({
    where:  { id: 'sede-trujillo-001' },
    update: {},
    create: {
      id:     'sede-trujillo-001',
      nombre: 'Sede Trujillo',
      ciudad: 'Trujillo',
    },
  });
  console.log('✅ Sede:', sedeTrujillo.nombre);

  // 4. Crear ADMIN de Trujillo (con sede)
  const adminPass = await bcrypt.hash('Admin123!', 12);
  const adminTrujillo = await prisma.usuario.upsert({
    where:  { email: 'admin.trujillo@enetfiber.com' },
    update: {},
    create: {
      nombre:   'Admin',
      apellido: 'Trujillo',
      email:    'admin.trujillo@enetfiber.com',
      password: adminPass,
      rol:      'ADMIN',
      sedeId:   sedeTrujillo.id,
    },
  });
  console.log('✅ ADMIN Trujillo:', adminTrujillo.email);

   // 5. Fabricantes OLT
  const zte = await prisma.oltFabricante.upsert({
    where:  { nombre: 'ZTE' },
    update: {},
    create: { nombre: 'ZTE' },
  });
  
  console.log('✅ Fabricantes OLT: ZTE');

  // 6. Modelos ZTE
  const modelosZTE = ['C300', 'C320', 'C600', 'C610', 'C620'];
  for (const nombre of modelosZTE) {
    await prisma.oltModelo.upsert({
      where:  { fabricanteId_nombre: { fabricanteId: zte.id, nombre } },
      update: {},
      create: { fabricanteId: zte.id, nombre },
    });
  }
  console.log('✅ Modelos ZTE:', modelosZTE.join(', '));


  console.log('\n📋 Credenciales de acceso:');
  console.log('  SUPERADMIN  → superadmin@enetfiber.com  / Admin123!');
  console.log('  OPERADOR NOC → noc@enetfiber.com        / Admin123!');
  console.log('  ADMIN Trujillo  → admin.trujillo@enetfiber.com  / Admin123!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });