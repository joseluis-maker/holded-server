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
const BANCO_SANTANDER = '68dbf9908bdfe70bf00ddc20';
const BANCO_BBVA = '68f0dd9e1ba2fe44dd0b5be0';
const EFECTIVO = '69f2c569999ef9f00500a934';

async function buscarContactoHolded(nombre) {
  if (!nombre || nombre.trim() === '') return { contactId: null };
  try {
    const res = await axios.get(
      `https://api.holded.com/api/invoicing/v1/contacts?name=${encodeURIComponent(nombre)}`,
      { headers: { key: HOLDED_API_KEY } }
    );
    if (res.data && res.data.length > 0) {
      const encontrado = res.data.find(c =>
        c.name && c.name.toLowerCase().trim() === nombre.toLowerCase().trim()
      );
      if (encontrado) return { contactId: encontrado.id };
    }
  } catch (e) {
    console.log('Error buscando contacto:', e.message);
  }
  return { contactId: null };
}

async function obtenerDatosHubSpot(hs_object_id) {
  try {
    const props = [
      'firstname','lastname','email','phone','mobilephone',
      'calle_via','numero_calle','piso_puerta','city','state','zip',
      'dni','nie','pasaporte','cedula'
    ].join(',');
    const hsRes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${hs_object_id}?properties=${props}`,
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );
    return hsRes.data.properties;
  } catch (e) {
    return {};
  }
}

app.get('/crear-documento', async (req, res) => {
  try {
    const { hs_object_id, tipo_documento, notas, items: itemsRaw } = req.query;
    let nombre = '', email = '', telefono = '', direccion = '', ciudad = '', cp = '', provincia = '', docIdentidad = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      const p = await obtenerDatosHubSpot(hs_object_id);
      nombre = ((p.firstname || '') + ' ' + (p.lastname || '')).trim();
      email = p.email || '';
      telefono = p.phone || p.mobilephone || '';
      const calle = p.calle_via || '';
      const numero = p.numero_calle || '';
      const piso = p.piso_puerta || '';
      direccion = [calle, numero, piso].filter(Boolean).join(', ');
      ciudad = p.city || '';
      cp = p.zip || '';
      provincia = p.state || '';
      docIdentidad = p.dni || p.nie || p.pasaporte || p.cedula || '';
    }

    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';
    const { contactId } = await buscarContactoHolded(nombre);

    let lineas = [];
    try { lineas = JSON.parse(itemsRaw || '[]'); } catch (e) {}

    const items = lineas.map(l => ({
      serviceId: l.servicio,
      units: parseInt(l.cantidad) || 1,
      discount: parseFloat(l.descuento) || 0,
    }));

    const body = {
      date: Math.floor(Date.now() / 1000),
      notes: notas || '',
      items,
    };

    if (contactId) {
      body.contactId = contactId;
    } else {
      body.contactName = nombre;
      if (email) body.contactEmail = email;
      if (telefono) body.contactPhone = telefono;
      if (direccion) body.contactAddress = direccion;
      if (ciudad) body.contactCity = ciudad;
      if (cp) body.contactCp = cp;
      if (provincia) body.contactProvince = provincia;
      if (docIdentidad) body.contactCode = docIdentidad;
    }

    const response = await axios.post(
      'https://api.holded.com/api/invoicing/v1/documents/' + endpoint,
      body,
      { headers: { key: HOLDED_API_KEY, 'Content-Type': 'application/json' } }
    );

    const docId = response.data.id;
    const tipoLabel = tipo_documento === 'invoice' ? 'Factura' : tipo_documento === 'estimate' ? 'Presupuesto' : 'Proforma';
    const holdedUrl = 'https://app.holded.com/sales/revenue#open:' + endpoint + '-' + docId;
    const pagoUrl = 'https://holded-server.onrender.com/registrar-pago?docId=' + docId + '&tipo=' + endpoint;

    res.send(`<html><body style="font-family:sans-serif;padding:24px;background:#f0fdf4;text-align:center">
      <h2 style="color:#16a34a">&#10003; ${tipoLabel} creada con exito</h2>
      <p style="color:#374151">Para: <b>${nombre}</b></p>
      <div style="background:white;border-radius:8px;padding:16px;margin-top:16px;text-align:left">
        <p style="font-weight:bold;margin-bottom:12px">Registrar pago</p>
        <label style="display:block;margin-bottom:4px;font-size:13px">Importe pagado (€)</label>
        <input id="importe" type="number" step="0.01" min="0" placeholder="0.00" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:12px;box-sizing:border-box;font-size:14px">
        <label style="display:block;margin-bottom:4px;font-size:13px">Cuenta</label>
        <select id="cuenta" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:12px;font-size:14px">
          <option value="${BANCO_SANTANDER}">Cuenta Negocios Santander</option>
          <option value="${BANCO_BBVA}">G Robles Asesores BBVA</option>
          <option value="${EFECTIVO}">Efectivo (Caja)</option>
        </select>
        <button onclick="registrarPago('${pagoUrl}')" style="width:100%;background:#16a34a;color:white;padding:10px;border-radius:6px;border:none;cursor:pointer;font-weight:bold;font-size:14px">
          Registrar pago
        </button>
        <div id="msg" style="margin-top:8px;font-size:13px"></div>
      </div>
      <div style="margin-top:16px">
        <button onclick="window.open('${holdedUrl}', '_blank')" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:14px">
          Ver en Holded
        </button>
      </div>
      <script>
        function registrarPago(url) {
          var importe = document.getElementById('importe').value;
          var cuenta = document.getElementById('cuenta').value;
          var msg = document.getElementById('msg');
          if (!importe || importe <= 0) { msg.innerHTML = '<span style="color:red">Introduce un importe valido</span>'; return; }
          msg.innerHTML = 'Registrando...';
          fetch(url + '&importe=' + importe + '&bankId=' + cuenta)
            .then(r => r.json())
            .then(d => {
              if (d.success) msg.innerHTML = '<span style="color:green">&#10003; Pago registrado correctamente</span>';
              else msg.innerHTML = '<span style="color:red">Error: ' + (d.error || 'Error desconocido') + '</span>';
            })
            .catch(() => msg.innerHTML = '<span style="color:red">Error de conexion</span>');
        }
      </script>
    </body></html>`);
  } catch (error) {
    res.send(`<html><body style="font-family:sans-serif;padding:20px;background:#fef2f2;text-align:center">
      <h2 style="color:#dc2626">Error</h2>
      <p>${error.response?.data?.info || error.message}</p>
    </body></html>`);
  }
});

app.get('/registrar-pago', async (req, res) => {
  try {
    const { docId, tipo, importe, bankId } = req.query;
    const response = await axios.post(
      `https://api.holded.com/api/invoicing/v1/documents/${tipo}/${docId}/pay`,
      { date: Math.floor(Date.now() / 1000), amount: parseFloat(importe), treasury: bankId },
      { headers: { key: HOLDED_API_KEY, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.json({ success: false, error: error.response?.data?.info || error.message });
  }
});

app.get('/documentos-contacto', async (req, res) => {
  try {
    const { hs_object_id } = req.query;
    let nombre = '';

    if (hs_object_id && HUBSPOT_TOKEN) {
      const p = await obtenerDatosHubSpot(hs_object_id);
      nombre = ((p.firstname || '') + ' ' + (p.lastname || '')).trim();
    }

    const { contactId } = await buscarContactoHolded(nombre);
    if (!contactId) {
      return res.send(`<html><body style="font-family:sans-serif;padding:20px;text-align:center">
        <p>No se encontro el contacto en Holded.</p>
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
    const formatEstado = (s, draft) => draft ? 'Borrador' : s === 1 ? 'Pagada' : 'Pendiente';

    const filas = docs.map(d => {
      const url = 'https://app.holded.com/sales/revenue#open:' + d.tipo + '-' + d.id;
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px">${d.tipoLabel}</td>
        <td style="padding:8px">${d.docNumber || '-'}</td>
        <td style="padding:8px">${formatFecha(d.date)}</td>
        <td style="padding:8px;text-align:right"><b>${d.total}€</b></td>
        <td style="padding:8px">${formatEstado(d.status, d.draft)}</td>
        <td style="padding:8px"><button onclick="window.open('${url}', '_blank')" style="background:#2563eb;color:white;padding:4px 10px;border-radius:4px;border:none;cursor:pointer;font-size:12px">Ver</button></td>
      </tr>`;
    }).join('');

    res.send(`<html><body style="font-family:sans-serif;padding:16px;font-size:13px">
      <h3 style="margin-top:0">Documentos en Holded</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Tipo</th>
          <th style="padding:8px;text-align:left">N</th>
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
    res.send(`<html><body style="font-family:sans-serif;padding:20px"><p>Error: ${error.message}</p></body></html>`);
  }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
