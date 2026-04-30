const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const HOLDED_API_KEY = process.env.HOLDED_API_KEY;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

app.get('/crear-documento', async (req, res) => {
  try {
    const { hs_object_id, servicio_id, tipo_documento, iva, retencion, descuento, forma_pago, notas } = req.query;

    let nombre = req.query.nombre || '';
    let email = req.query.email || '';
    let empresa = req.query.empresa || '';
    let telefono = req.query.telefono || '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      try {
        const hsRes = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/contacts/${hs_object_id}?properties=firstname,lastname,email,company,phone`,
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        const p = hsRes.data.properties;
        nombre = ((p.firstname || '') + ' ' + (p.lastname || '')).trim() || nombre;
        email = p.email || email;
        empresa = p.company || empresa;
        telefono = p.phone || telefono;
      } catch (e) {
        console.log('Error obteniendo contacto de HubSpot:', e.message);
      }
    }

    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';

    const body = {
      contactName: nombre,
      contactEmail: email,
      contactPhone: telefono,
      date: Math.floor(Date.now() / 1000),
      notes: notas || '',
      products: [{
        productId: servicio_id,
        units: 1,
        tax: parseFloat(iva) || 21,
        retention: parseFloat(retencion) || 0,
        discount: parseFloat(descuento) || 0,
      }],
      paymentMethod: forma_pago || 'transfer',
    };

    const response = await axios.post(
      'https://api.holded.com/api/invoicing/v1/documents/' + endpoint,
      body,
      { headers: { key: HOLDED_API_KEY, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
