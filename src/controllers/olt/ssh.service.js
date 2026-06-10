// src/controllers/olt/ssh.service.js
// Conexión SSH con fallback Telnet para OLTs ZTE C300/C600

const { Client: SshClient } = require('ssh2');
const net = require('net');

// ── Algoritmos exactos confirmados por negociación con ZTE C300/C600 ──
const ZTE_ALGORITHMS = {
  kex:           ['diffie-hellman-group1-sha1'],
  serverHostKey: ['ssh-dss'],
  cipher:        ['aes128-cbc', '3des-cbc'],
  hmac:          ['hmac-sha1', 'hmac-md5'],
  compress:      ['none'],
};

// ─────────────────────────────────────────────────────────────
// SSH — shell interactivo para OLTs ZTE
// ─────────────────────────────────────────────────────────────
const runSsh = (host, port, usuario, password, comandos, timeoutMs = 60000) => {
  return new Promise((resolve, reject) => {
    const conn    = new SshClient();
    let   output  = '';
    const cmdList = ['terminal length 0', ...comandos, 'exit'];
    let   cmdIdx  = 0;
    let   timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH timeout en ${host}`));
      }, timeoutMs);
    };

    conn.on('ready', () => {
      conn.shell({ term: 'vt100' }, (err, stream) => {
        if (err) { conn.end(); return reject(err); }

        stream.on('data', (data) => {
          const txt = data.toString();
          output += txt;

          if (output.length > 500_000) {
            stream.close();
            conn.end();
            reject(new Error('Output excede límite máximo (500KB)'));
            return;
          }

          resetTimer();

          if (txt.includes('#') || txt.includes('>')) {
            if (cmdIdx < cmdList.length) {
              stream.write(cmdList[cmdIdx++] + '\n');
            }
          }
        });

        stream.stderr.on('data', (data) => { output += data.toString(); });

        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();
          resolve(output);
        });

        resetTimer();
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host,
      port:         port || 22,
      username:     usuario,
      password,
      readyTimeout: timeoutMs,
      hostVerifier: () => true,
      algorithms:   ZTE_ALGORITHMS,
    });
  });
};

// ─────────────────────────────────────────────────────────────
// TELNET — fallback cuando SSH falla
// ─────────────────────────────────────────────────────────────
const runTelnet = (host, port, usuario, password, comandos, timeoutMs = 60000) => {
  return new Promise((resolve, reject) => {
    const socket  = new net.Socket();
    let   output  = '';
    let   step    = 0;
    const cmdList = ['terminal length 0', ...comandos, 'exit'];
    let   cmdIdx  = 0;
    let   timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Telnet timeout (${timeoutMs}ms) en ${host}:${port}`));
      }, timeoutMs);
    };

    const sendCmd = (cmd) => {
      socket.write(cmd + '\r\n');
      resetTimer();
    };

    socket.connect(port || 23, host, () => { resetTimer(); });

    socket.on('data', (data) => {
      const txt   = data.toString();
      output     += txt;
      resetTimer();

      // Detectar bytes IAC (negociación Telnet nativa — 0xFF)
      const isIac = data[0] === 0xff;

      if (step === 0) {
        if (txt.toLowerCase().includes('username') || txt.toLowerCase().includes('login')) {
          sendCmd(usuario);
          step = 1;
        } else if (!isIac && txt.trim().length > 0) {
          // Estimular prompt solo si no es paquete IAC puro
          sendCmd('');
        }
      } else if (step === 1) {
        if (txt.toLowerCase().includes('password')) {
          sendCmd(password);
          step = 2;
        }
      }  else if (step === 2) {
          if (txt.includes('#') || txt.includes('>')) {
            if (cmdIdx < cmdList.length) {
              const cmd = cmdList[cmdIdx++];
              setTimeout(() => sendCmd(cmd), 800); // ✅ delay anti-chunk
            } else {
              clearTimeout(timer);
              socket.destroy();
              resolve(output);
            }
          }
        }
    });

    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
    socket.on('close', () => { clearTimeout(timer); resolve(output); });
  });
};

// ─────────────────────────────────────────────────────────────
// runComandos — SSH primero, fallback a Telnet
// ─────────────────────────────────────────────────────────────
const runComandos = async (olt, comandos) => {
  console.log(`[OLT] Conectando a ${olt.nombre} (${olt.direccionIp}) via SSH...`);
  try {
    const output = await runSsh(
      olt.direccionIp, olt.puertoSsh,
      olt.usuario, olt.password, comandos
    );
    console.log(`[OLT] SSH OK — ${olt.nombre}`);
    return output;
  } catch (errSsh) {
    console.log(`[OLT] SSH falló (${errSsh.message}), intentando Telnet...`);
    try {
      const output = await runTelnet(
        olt.direccionIp, olt.puertoTelnet,
        olt.usuario, olt.password, comandos
      );
      console.log(`[OLT] Telnet OK — ${olt.nombre}`);
      return output;
    } catch (errTelnet) {
      console.error(`[OLT] Telnet también falló: ${errTelnet.message}`);
      throw errTelnet;
    }
  }
};

// ─────────────────────────────────────────────────────────────
// testConexionOlt — autenticación SSH y Telnet real
// ─────────────────────────────────────────────────────────────
const testPuerto = (host, port, label, timeoutMs = 5000) => {
  return new Promise((resolve) => {
    const start  = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ success: true,  protocol: label, message: `Puerto ${port} accesible`, latency: Date.now() - start });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, protocol: label, message: `Timeout en puerto ${port}`, latency: timeoutMs });
    });
    socket.on('error', (err) => {
      resolve({ success: false, protocol: label, message: err.message, latency: Date.now() - start });
    });

    socket.connect(port, host);
  });
};

const testConexionOlt = async (olt) => {

  const esC600 = ['C600','C610','C620'].includes((olt.modelo?.nombre || '').toUpperCase());
  const cmdTest = esC600 ? 'show software' : 'show system-group';

  const [sshTcp, telnetTcp] = await Promise.all([
    testPuerto(olt.direccionIp, olt.puertoSsh,    'SSH'),
    testPuerto(olt.direccionIp, olt.puertoTelnet, 'Telnet'),
  ]);

  // Test autenticación SSH real
  let sshAuth = { success: false, protocol: 'SSH Auth', message: 'Puerto no accesible', latency: 0 };
  if (sshTcp.success) {
    const t0 = Date.now();
    try {
      await runSsh(olt.direccionIp, olt.puertoSsh, olt.usuario, olt.password, [cmdTest], 10000);      sshAuth = { success: true,  protocol: 'SSH Auth', message: 'Autenticación exitosa', latency: Date.now() - t0 };
    } catch (err) {
      sshAuth = { success: false, protocol: 'SSH Auth', message: err.message, latency: Date.now() - t0 };
    }
  }

  // Test autenticación Telnet real
  let telnetAuth = { success: false, protocol: 'Telnet Auth', message: 'Puerto no accesible', latency: 0 };
  if (telnetTcp.success) {
    const t0 = Date.now();
    try {
      await runTelnet(olt.direccionIp, olt.puertoTelnet, olt.usuario, olt.password, [cmdTest], 45000);
      telnetAuth = { success: true, protocol: 'Telnet Auth', message: 'Autenticación exitosa', latency: Date.now() - t0 }; // ✅ línea que faltaba
    } catch (err) {
      telnetAuth = { success: false, protocol: 'Telnet Auth', message: err.message, latency: Date.now() - t0 };
    }
  }

  // SNMP es UDP — no testeable con TCP probe
  const snmp = { success: null, protocol: 'SNMP', message: 'UDP — no testeable por TCP', latency: 0 };

  const conectado = sshAuth.success || telnetAuth.success;
  return {
    estado:     conectado ? 'Conectado' : 'Desconectado',
    resultados: [sshAuth, telnetAuth, snmp],
  };
};

module.exports = { runComandos, testConexionOlt };