const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const HOLDED_API_KEY = process.env.HOLDED_API_KEY;

app.get('/crear-documento', async (req, res) => {
  try {
    const { nombre, servicio_id, tipo_documento, iva, notas } = req.query;
    const endpoint = tipo_documento === 'invoice' ? 'invoice' : tipo_documento === 'estimate' ? 'estimate' : 'proforma';
    const response = await axios.post(
      'https://api.holded.com/api/invoicing/v1/documents/' + endpoint,
      {
        contactName: nombre,
        date: Math.floor(Date.now() / 1000),
        notes: notas || '',
        products: [{ productId: servicio_id, units: 1 }]
      },
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
