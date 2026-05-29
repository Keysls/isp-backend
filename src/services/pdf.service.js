/**
 * pdf.service.js — reemplaza el anterior
 * Ahora delega la extracción al microservicio Python (pdfplumber)
 */
const fs   = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios    = require('axios');

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:5001';

const parsearPdfOrden = async (rutaPdf) => {
  const form = new FormData();
  form.append('pdf', fs.createReadStream(rutaPdf), {
    filename: path.basename(rutaPdf),
    contentType: 'application/pdf',
  });

  const { data } = await axios.post(`${PDF_SERVICE_URL}/parsear-pdf`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });

  if (!data.ok) throw new Error(data.error || 'Error en el servicio PDF');

  // Convertir fecha string a objeto Date
  const d = data.datos;
  if (d.fechaServicio) {
    // Formato DD/MM/YYYY
    const [dia, mes, anio] = d.fechaServicio.split('/');
    if (dia && mes && anio) {
      d.fechaServicio = new Date(`${anio}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`);
    }
  }

  return {
    ...d,
    textoPdf: '',
    camposFaltantes:       data.camposFaltantes,
    parseadoCorrectamente: data.parseadoCorrectamente,
  };
};

module.exports = { parsearPdfOrden };
