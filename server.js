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

async function buscarContactoHolded(email, nombre) {
  try {
    const res = await axios.get(
      `https://api.holded.com/api/invoicing/v1/contacts?email=${encodeURIComponent(email)}`,
      { headers: { key: HOLDED_API_KEY } }
    );
    if (res.data && res.data.length > 0) {
      return { contactId: res.data[0].id, contactName: null };
    }
  } catch (e) {
    console.log('Error buscando contacto en Holded:', e.message);
  }
  return { contactId: null, contactName: nombre };
}

app.get('/crear-documento', async (req, res) => {
  try {
    const { hs_object_id, servicio_id, tipo_documento, descuento, notas } = req.query;

    let nombre = '';
    let email = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      try {
        const hsRes = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/contacts/${hs_object_id}?properties=firstname,lastname,email,company,phone`,
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        const p = hsRes.data.properties;
        nombre = ((p.firstname || '') + ' ' + (p.lastname || '')).trim();
        email = p.email || '';
      } catch (e) {
        console.log('Error obteniendo contacto de HubSpot:', e.message);
      }
    }

    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';

    const { contactId, contactName } = await buscarContactoHolded(email, nombre);

    const body = {
      date: Math.floor(Date.now() / 1000),
      notes: notas || '',
      items: [{
        serviceId: servicio_id,
        units: 1,
        discount: parseFloat(descuento) || 0,
      }],
    };

    if (contactId) {
      body.contactId = contactId;
    } else {
      body.contactName = contactName;
      body.contactEmail = email;
    }

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

app.get('/documentos-contacto', async (req, res) => {
  try {
    const { hs_object_id } = req.query;
    let email = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      try {
        const hsRes = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/contacts/${hs_object_id}?properties=email`,
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        email = hsRes.data.properties.email || '';
      } catch (e) {
        console.log('Error obteniendo email de HubSpot:', e.message);
      }
    }

    const { contactId } = await buscarContactoHolded(email, '');
    if (!contactId) return res.json({ success: true, documentos: [] });

    const [facturas, presupuestos] = await Promise.all([
      axios.get(`https://api.holded.com/api/invoicing/v1/documents/invoice?contactId=${contactId}`, { headers: { key: HOLDED_API_KEY } }),
      axios.get(`https://api.holded.com/api/invoicing/v1/documents/estimate?contactId=${contactId}`, { headers: { key: HOLDED_API_KEY } }),
    ]);

    const docs = [
      ...facturas.data.map(d => ({ ...d, tipo: 'Factura' })),
      ...presupuestos.data.map(d => ({ ...d, tipo: 'Presupuesto' })),
    ].sort((a, b) => b.date - a.date);

    res.json({ success: true, documentos: docs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
