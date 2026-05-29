const TIPO_LABEL = {
  INSTALACION_I:   'Instalación Internet',
  CAMBIO_EQUIPO_I: 'Cambio de Equipo Internet',
  AVERIA_I:        'Avería Internet',
  RECONEXION_I:    'Reconexión Internet',
  INSTALACION_C:   'Instalación Cable',
  AVERIA_C:        'Avería Cable',
  RECONEXION_C:    'Reconexión Cable',
};

const TIPOS_INTERNET = ['INSTALACION_I', 'CAMBIO_EQUIPO_I', 'AVERIA_I', 'RECONEXION_I'];
const TIPOS_CABLE    = ['INSTALACION_C', 'AVERIA_C', 'RECONEXION_C'];

// Solo estos tipos necesitan WAN del NOC
const REQUIERE_WAN = ['INSTALACION_I', 'CAMBIO_EQUIPO_I', 'AVERIA_I', 'RECONEXION_I'];

module.exports = { TIPO_LABEL, TIPOS_INTERNET, TIPOS_CABLE, REQUIERE_WAN };