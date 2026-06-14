module.exports = {
  apps: [{
    name:      'isp-backend',
    script:    'src/app.js',
    instances: 'max',         // usa todos los cores del servidor
    exec_mode: 'cluster',
    node_args: '--openssl-legacy-provider',

    env_production: {
      NODE_ENV: 'production',
    },
    env_development: {
      NODE_ENV: 'development',
    },

    // Reiniciar si usa más de 500MB RAM
    max_memory_restart: '500M',

    // Logs
    error_file:      'logs/err.log',
    out_file:        'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs:      true,

    // Reinicio automático si falla
    autorestart:  true,
    max_restarts: 10,
    min_uptime:   '5s',

    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready:   true,
  }]
};