// src/controllers/olt/encryption.js
// AES-256-CBC con IV aleatorio por cada cifrado
// Formato almacenado: hex(iv):base64(encrypted)
// Retrocompatible: si el hash no contiene ":" es formato legacy (IV fijo)

const crypto = require('crypto');

const SECRET = process.env.OLT_ENCRYPTION_KEY;
if (!SECRET) {
  throw new Error('OLT_ENCRYPTION_KEY no está definida en el .env — abortando arranque');
}

const getKey = () =>
  crypto.createHash('sha256').update(SECRET, 'utf8').digest(); // 32 bytes

// ── Nuevo formato: iv aleatorio embebido ──────────────────────
const encrypt = (plain) => {
  const key       = getKey();
  const iv        = crypto.randomBytes(16);               // IV aleatorio
  const cipher    = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('base64');
};

// ── Decrypt: soporta formato nuevo (iv:base64) y legacy (solo base64) ──
const decrypt = (hash) => {
  const key = getKey();

  if (hash.includes(':')) {
    // Nuevo formato — IV embebido
    const [ivHex, encryptedB64] = hash.split(':');
    const iv       = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } else {
    // Formato legacy — IV fijo derivado de la clave
    const iv       = key.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(hash, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
};

// ── Migración: re-cifra hashes legacy al nuevo formato ───────
const migrarSiLegacy = (hash) => {
  if (!hash || hash.includes(':')) return hash; // ya es nuevo formato
  const plain = decrypt(hash);     // descifra con IV fijo
  return encrypt(plain);           // re-cifra con IV aleatorio
};

module.exports = { encrypt, decrypt, migrarSiLegacy };