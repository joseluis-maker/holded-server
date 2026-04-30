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

const SERVICIOS = {
  '68dbf5608cc00cebfe01a3ba': { name: 'Renovacion No Lucrativa', price: 1200 },
  '68dc0bced2093e573b062e6f': { name: 'TFC TFE', price: 1500 },
  '68dc0dabe4b67f865c05c29f': { name: 'DNI', price: 300 },
  '68dc0dc4d588ac48a20e1648': { name: 'Seguridad Social', price: 300 },
  '68dc0dd5561608fd9a09a05f': { name: 'Certificado Digital', price: 150 },
  '68dc12528673e193c609da46': { name: 'Recurso Contencioso', price: 1200 },
  '68dc12e79b4ace6a1009d263': { name: 'Nacionalidad Espanola', price: 1200 },
  '68ea038816165e77f204f405': { name: 'Modificacion Cuenta Ajena', price: 1500 },
  '68ea06cdeb63dc7e16076fed': { name: 'Cita Huella y Recogida TIE', price: 300 },
  '68ef8124a4ee10ea590a85b4': { name: 'Certificado Union Europea', price: 600 },
  '68fa50f0867a97506f00fbdd': { name: 'Consulta Robles', price: 100 },
  '68fa52da4d569f6ed903576a': { name: 'Nomada Digital', price: 1500 },
  '68fa540cf10cc0e018092989': { name: 'Traduccion', price: 0 },
  '68fa555f9d0a12956106e959': { name: 'Consulta Asesor', price: 50 },
  '69024779c4fe7f10f10a4724': { name: 'Autorizacion de regreso', price: 300 },
  '69024d52332e7d11150fd620': { name: 'Residencia No Lucrativa RD', price: 3800 },
  '69025a9d5dc10bcb57067f76': { name: 'Canje carnet conducir', price: 300 },
  '69025dda7d5e3d1f750c35d5': { name: 'Ley Memoria Democratica', price: 1500 },
  '69025e01971de84d5e073fe0': { name: 'Busqueda Documentacion', price: 250 },
  '6903624330044c09830e9247': { name: 'Cita', price: 150 },
  '69245080835f488e450e8bca': { name: 'Tasa Carnet Conducir', price: 28.87 },
  '69667353696370060f041622': { name: 'Asistencia NL', price: 900 },
  '697a0145828fee254a01bf59': { name: 'Arraigo', price: 1500 },
  '6980d99fe022e22fa000047e': { name: 'Asesoria', price: 0 },
  '698da42144d04406a6045c16': { name: 'Analisis Documentacion', price: 400 },
  '698dac2046b07517da058bf1': { name: 'Regularizacion', price: 400 },
  '69c2a218cd837bdeef0acbe7': { name: 'Asesoria y Revision Compra Vivienda', price: 1000 },
  '69de2bbe66b80f551e0bf576': { name: 'Tramite Extranjeria', price: 0 },
};

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

    const servicio = SERVICIOS[servicio_id] || { name: 'Servicio', price: 0 };
    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';

    const body = {
      contactName: nombre,
      contactEmail: email,
      date: Math.floor(Date.now() / 1000),
      notes: notas || '',
      products: [{
        serviceId: servicio_id,
        name: servicio.name,
        price: servicio.price,
        units: 1,
        tax: parseFloat(iva) || 21,
        retention: parseFloat(retencion) || 0,
        discount: parseFloat(descuento) || 0,
      }],
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
