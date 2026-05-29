// src/controllers/olt/encryption.js
// Replica exactamente EncryptionService.cs del OLTManager .NET
// AES-256-CBC con clave derivada de SHA-256

const crypto = require('crypto');

const SECRET = process.env.OLT_ENCRYPTION_KEY;
if (!SECRET) {
  throw new Error('OLT_ENCRYPTION_KEY no está definida en el .env — abortando arranque');
}

const getKeyIv = () => {
  const key = crypto.createHash('sha256').update(SECRET, 'utf8').digest(); // 32 bytes
  const iv  = key.slice(0, 16);                                            // 16 bytes
  return { key, iv };
};

const encrypt = (plain) => {
  const { key, iv } = getKeyIv();
  const cipher      = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted   = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
};

const decrypt = (hash) => {
  const { key, iv } = getKeyIv();
  const decipher    = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted   = Buffer.concat([decipher.update(Buffer.from(hash, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };