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
  } catch (e) {}
  return { contactId: null, contactName: nombre };
}

async function obtenerDatosHubSpot(hs_object_id) {
  try {
    const hsRes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${hs_object_id}?properties=firstname,lastname,email,phone,address,city,zip,hs_language`,
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );
    return hsRes.data.properties;
  } catch (e) {
    console.log('Error HubSpot:', e.message);
    return {};
  }
}

app.get('/crear-documento', async (req, res) => {
  try {
    const { hs_object_id, servicio_id, tipo_documento, descuento, notas } = req.query;
    let nombre = '', email = '', telefono = '', direccion = '', ciudad = '', cp = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      const p = await obtenerDatosHubSpot(hs_object_id);
      nombre = ((p.firstname || '') + ' ' + (p.lastname || '')).trim();
      email = p.email || '';
      telefono = p.phone || '';
      direccion = p.address || '';
      ciudad = p.city || '';
      cp = p.zip || '';
    }

    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';
    const { contactId, contactName } = await buscarContactoHolded(email, nombre);

    const body = {
      date: Math.floor(Date.now() / 1000),
      notes: notas || '',
      items: [{ serviceId: servicio_id, units: 1, discount: parseFloat(descuento) || 0 }],
    };

    if (contactId) {
      body.contactId = contactId;
    } else {
      body.contactName = contactName;
      body.contactEmail = email;
      body.contactPhone = telefono;
      body.contactAddress = direccion;
      body.contactCity = ciudad;
      body.contactCp = cp;
    }

    const response = await axios.post(
      'https://api.holded.com/api/invoicing/v1/documents/' + endpoint,
      body,
      { headers: { key: HOLDED_API_KEY, 'Content-Type': 'application/json' } }
    );

    const docId = response.data.id;
    const tipoLabel = tipo_documento === 'invoice' ? 'Factura' : tipo_documento === 'estimate' ? 'Presupuesto' : 'Proforma';
    const holdedUrl = `https://app.holded.com/sales/revenue#open:${endpoint}-${docId}`;

    res.send(`<html><body style="font-family:sans-serif;padding:24px;background:#f0fdf4;text-align:center">
      <h2 style="color:#16a34a">✅ ${tipoLabel} creada con éxito</h2>
      <p style="color:#374151">Para: <b>${nombre}</b></p>
      <div style="margin-top:24px">
        <button onclick="window.top.open('${holdedUrl}', '_blank')" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:14px">
          🔗 Ver y descargar en Holded
        </button>
      </div>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">En Holded podrás descargar el PDF desde el documento</p>
    </body></html>`);
  } catch (error) {
    res.send(`<html><body style="font-family:sans-serif;padding:20px;background:#fef2f2;text-align:center">
      <h2 style="color:#dc2626">❌ Error</h2>
      <p>${error.response?.data?.info || error.message}</p>
    </body></html>`);
  }
});

app.get('/documentos-contacto', async (req, res) => {
  try {
    const { hs_object_id } = req.query;
    let email = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      const p = await obtenerDatosHubSpot(hs_object_id);
      email = p.email || '';
    }

    const { contactId } = await buscarContactoHolded(email, '');
    if (!contactId) {
      return res.send(`<html><body style="font-family:sans-serif;padding:20px;text-align:center">
        <p>No se encontró el contacto en Holded.</p>
      </body></html>`);
    }

    const [facturas, presupuestos] = await Promise.all([
      axios.get(`https://api.holded.com/api/invoicing/v1/documents/invoice?contactId=${contactId}`, { headers: { key: HOLDED_API_KEY } }),
      axios.get(`https://api.holded.com/api/invoicing/v1/documents/estimate?contactId=${contactId}`, { headers: { key: HOLDED_API_KEY } }),
    ]);

    const docs = [
      ...facturas.data.map(d => ({ ...d, tipo: 'invoice', tipoLabel: 'Factura' })),
      ...presupuestos.data.map(d => ({ ...d, tipo: 'estimate', tipoLabel: 'Presupuesto' })),
    ].sort((a, b) => b.date - a.date).slice(0, 20);

    const formatFecha = (ts) => new Date(ts * 1000).toLocaleDateString('es-ES');
    const formatEstado = (s, draft) => draft ? '📝 Borrador' : s === 1 ? '✅ Pagada' : '⏳ Pendiente';

    const filas = docs.map(d => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px">${d.tipoLabel}</td>
        <td style="padding:8px">${d.docNumber || '-'}</td>
        <td style="padding:8px">${formatFecha(d.date)}</td>
        <td style="padding:8px;text-align:right"><b>${d.total}€</b></td>
        <td style="padding:8px">${formatEstado(d.status, d.draft)}</td>
        <td style="padding:8px">
          <a href="https://app.holded.com/sales/revenue#open:${d.tipo}-${d.id}" target="_blank" style="color:#2563eb">Ver</a>
        </td>
      </tr>`).join('');

    res.send(`<html><body style="font-family:sans-serif;padding:16px;font-size:13px">
      <h3 style="margin-top:0">Documentos en Holded</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Tipo</th>
          <th style="padding:8px;text-align:left">Nº</th>
          <th style="padding:8px;text-align:left">Fecha</th>
          <th style="padding:8px;text-align:right">Total</th>
          <th style="padding:8px;text-align:left">Estado</th>
          <th style="padding:8px;text-align:left">Ver</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${docs.length === 0 ? '<p>No hay documentos</p>' : ''}
    </body></html>`);
  } catch (error) {
    res.send(`<html><body style="font-family:sans-serif;padding:20px">
      <p>Error: ${error.message}</p>
    </body></html>`);
  }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
