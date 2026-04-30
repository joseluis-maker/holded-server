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
      'dni','nie','pasaporte','cedula','date_of_birth','pais_de_nacimiento','nombre_del_padre','nombre_de_la_madre','sexo','marital_status','lugar_de_nacimiento','nacionalidad'
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

// ============================================================
// AUTORELLENADO DE FORMULARIOS EX
// ============================================================
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const FORMULARIOS = {
  'EX00': 'EX00. Formulario autorización de estancia de larga duración. Editable.pdf',
  'EX01': 'EX01. Formulario autorización de residencia temporal no lucrativa. Editable.pdf',
  'EX02': 'EX02. Formulario autorización de residencia temporal por reagrupación familiar editable.pdf',
  'EX03': 'EX03. Formulario autorización de residencia temporal y trabajo por cuenta ajena o autorización de trabajo por cuenta ajena. Editable.pdf',
  'EX04': 'EX04. Formulario autorización de residencia para pácticas. Editable.pdf',
  'EX06': 'EX06. Formulario autorización de residencia y trabajo para actividades temporada. Editable.pdf',
  'EX07': 'EX07. Formulario  autorización de residencia temporal y trabajo por cuenta propia. Editable.pdf',
  'EX09': 'EX09. Formulario autorización de residencia temporal con excepción de la autorización de trabajo. Editable.pdf',
  'EX10': 'EX10. Formulario autorización de residencia por circunstancias excepcionales - editable.pdf',
  'EX11': 'EX11. Formulario autorización de residencia de larga duración o de larga duración-UE. Editable.pdf',
  'EX13': 'EX13. Formulario autorización de regreso. Editable.pdf',
  'EX16': 'EX16. Formulario solicitud cédula de inscripción o título de viaje. Editable.pdf',
  'EX17': 'EX17. Formulario solicitud Tarjeta de Identidad de Extranjero. Editable.pdf',
  'EX18': 'EX18. Formulario inscripción en el RCE, residencia ciudadano de la UE. Editable.pdf',
  'EX19': 'EX19. Formulario tarjeta de residencia de familiar de ciudadano de la UE. Editable.pdf',
  'EX20': 'EX20. Formulario residencia artículo 50 TUE para nacionales del Reino Unido. Editable.pdf',
  'EX21': 'EX21. Formulario residencia artículo 50 TUE para 3ºs países familiares nacionales Reino Unido. Editable.pdf',
  'EX22': 'EX22. Formulario permiso artículo 50 TUE para trabajador fronterizo del Reino Unido. Editable.pdf',
  'EX23': 'EX23. Formulario solicitud tarjeta (art 18.4 del Acuerdo de Retirada). Editable.pdf',
  'EX24': 'EX24. Formulario autorización de residencia temporal de familiares de personas con nacionalidad española. Editable.pdf',
  'EX25': 'EX25. Formulario autorización de residencia temporal y desplazamiento temporal de menores extranjeros - editable.pdf',
  'EX26': 'EX26. Formulario de solicitud modificación de autorización de residencia o estancia. Editable.pdf',
  'EX28': 'EX28. Formulario solicitud de aplicación de la DT 2º RD 1155-2024. Editable.pdf',
  'EX29': 'EX29. Formulario solicitud de prórroga de estancia de corta duración. Editable.pdf',
  'EX31': 'EX31. Formulario autorización de residencia por circunstancias excepcionales por razón de arraigo. Solicitantes PI (DA20º). Editable_.pdf',
  'EX32': 'EX32. Formulario autorización de residencia por circunstancias excepcionales por razón de arraigo extraordinario (DA21º). Editable.pdf',
};

// Mapeo EX13: campo -> nombre HubSpot
const MAPA_EX13 = {
  'Texto1':  'pasaporte',
  'Texto2':  'nie_letra',
  'Texto3':  'nie_numero',
  'Texto4':  'nie_control',
  'Texto5':  'apellido1',
  'Texto6':  'apellido2',
  'Texto7':  'firstname',
  'Texto8':  'fecha_dia',
  'Texto9':  'fecha_mes',
  'Texto10': 'fecha_anio',
  'Texto11': 'lugar_de_nacimiento',
  'Texto12': 'pais_de_nacimiento',
  'Texto13': 'nacionalidad',
  'Texto14': 'nombre_padre',
  'Texto15': 'nombre_madre',
  'Texto16': 'address',
  'Texto17': 'numero_calle',
  'Texto18': 'piso_puerta',
  'Texto19': 'city',
  'Texto20': 'zip',
  'Texto21': 'state',
  'Texto22': 'phone',
  'Texto23': 'email',
};

// Mapeo EX18: misma estructura que EX13 en página 1
const MAPA_EX18 = {
  'Texto1':  'pasaporte',
  'Texto2':  'nie_letra',
  'Texto3':  'nie_numero',
  'Texto4':  'nie_control',
  'Texto5':  'apellido1',
  'Texto6':  'apellido2',
  'Texto7':  'firstname',
  'Texto8':  'fecha_dia',
  'Texto9':  'fecha_mes',
  'Texto10': 'fecha_anio',
  'Texto11': 'lugar_de_nacimiento',
  'Texto12': 'pais_de_nacimiento',
  'Texto13': 'nacionalidad',
  'Texto14': 'nombre_padre',
  'Texto15': 'nombre_madre',
  'Texto16': 'address',
  'Texto17': 'numero_calle',
  'Texto18': 'piso_puerta',
  'Texto19': 'city',
  'Texto20': 'zip',
  'Texto21': 'state',
  'Texto22': 'phone',
  'Texto23': 'email',
};

function prepararDatos(p) {
  const nie = p.nie || '';
  const fecha = p.date_of_birth || p.fecha_de_nacimiento || '';
  let fecha_dia = '', fecha_mes = '', fecha_anio = '';
  const mesesTexto = { enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12' };
  if (/[a-zA-Z]/.test(fecha)) {
    const partes = fecha.trim().split(/\s+/);
    fecha_dia  = (partes[0] || '').padStart(2,'0');
    fecha_mes  = mesesTexto[partes[1]?.toLowerCase()] || '';
    fecha_anio = partes[2] || '';
  } else {
    const partesFecha = fecha.split(/[-\/]/);
    if (partesFecha[0].length === 4) {
      fecha_anio = partesFecha[0]; fecha_mes = partesFecha[1]; fecha_dia = partesFecha[2];
    } else {
      fecha_dia = partesFecha[0]; fecha_mes = partesFecha[1]; fecha_anio = partesFecha[2] || '';
    }
  }
  const nombre = (p.firstname || '').toUpperCase();
  const apellidos = (p.lastname || '').trim().split(' ');
  const apellido1 = apellidos[0] || '';
  const apellido2 = apellidos.slice(1).join(' ') || '';
  return {
    pasaporte:         (p.pasaporte || '').toUpperCase(),
    nie_letra:         nie.charAt(0) || '',
    nie_numero:        nie.slice(1, -1) || '',
    nie_control:       nie.slice(-1) || '',
    apellido1:         apellido1.toUpperCase(),
    apellido2:         apellido2.toUpperCase(),
    firstname:         nombre,
    fecha_dia,
    fecha_mes,
    fecha_anio,
    lugar_de_nacimiento: (p.lugar_de_nacimiento || '').toUpperCase(),
    pais_de_nacimiento:  (p.pais_de_nacimiento || '').toUpperCase(),
    nacionalidad:      (p.nacionalidad || '').toUpperCase(),
    nacionalidad2:     (p.nacionalidad || '').toUpperCase(),
    nombre_padre:      (p.nombre_del_padre || '').toUpperCase(),
    nombre_madre:      (p.nombre_de_la_madre || '').toUpperCase(),
    address:           (p.calle_via || p.address || '').toUpperCase(),
    numero_calle:      (p.numero_calle || '').toUpperCase(),
    piso_puerta:       (p.piso_puerta || '').toUpperCase(),
    city:              (p.city || '').toUpperCase(),
    zip:               p.zip || '',
    state:             (p.state || '').toUpperCase(),
    phone:             p.phone || p.mobilephone || '',
    email:             p.email || '',
    sexo:              p.sexo || '',
    estado_civil:      p.marital_status || '',
    dni:               (p.dni || '').toUpperCase(),
  };
}


  // Representante fijo - Jose Luis Robles Criado
  const REP = {
    nombre: 'JOSE LUIS ROBLES CRIADO',
    dni: '5326459K',
    direccion: 'CALLE VELAZQUEZ',
    numero: '126',
    piso: '6D',
    ciudad: 'MADRID',
    cp: '28006',
    provincia: 'MADRID',
    telefono: '619934302',
    email: 'INFO@ROBLESEXTRANJERIA.COM',
  };

async function rellenarEditable(rutaPdf, mapa, datos, conRepresentante = false, formulario = '') {
  const pdfBytes = fs.readFileSync(rutaPdf);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const [campo, clave] of Object.entries(mapa)) {
    try {
      const field = form.getTextField(campo);
      if (field && datos[clave]) {
        field.setText(datos[clave]);
      }
    } catch (e) { /* campo no encontrado, continuar */ }
  }

  // Sexo y estado civil - detectar checkboxes automáticamente
  try {
    const fields = form.getFields();
    const checkboxes = fields.filter(f => f.constructor.name === 'PDFCheckBox')
      .map(f => f.getName()).sort((a,b) => {
        const na = parseInt(a.replace(/D/g,''));
        const nb = parseInt(b.replace(/D/g,''));
        return na - nb;
      });
    
    // Los primeros 3 checkboxes son sexo (X, H, M)
    // Los siguientes 5 son estado civil (S, C, V, D, Sp)
    const sexoCBs = checkboxes.slice(0, 3); // [X*, H, M]
    const ecCBs = checkboxes.slice(3, 8);   // [S, C, V, D, Sp]

    const sexo = datos.sexo?.toLowerCase();
    if (sexo === 'h' || sexo === 'hombre' || sexo === 'male' || sexo === 'man') {
      try { form.getCheckBox(sexoCBs[1])?.check(); } catch(e) {}
    } else if (sexo === 'm' || sexo === 'mujer' || sexo === 'female' || sexo === 'woman') {
      try { form.getCheckBox(sexoCBs[2])?.check(); } catch(e) {}
    }

    const ec = datos.estado_civil?.toLowerCase();
    const mapaEC = { 's': 0, 'soltero': 0, 'single': 0, 'c': 1, 'casado': 1, 'married': 1, 'v': 2, 'viudo': 2, 'widowed': 2, 'd': 3, 'divorciado': 3, 'divorced': 3, 'sp': 4, 'separado': 4, 'separated': 4 };
    const idx = mapaEC[ec];
    if (idx !== undefined && ecCBs[idx]) {
      try { form.getCheckBox(ecCBs[idx])?.check(); } catch(e) {}
    }
  } catch (e) {}

  // Representante (opcional) - usando mapa por formulario
  if (conRepresentante) {
    const MAPA_REP = {
      'EX00': ['Texto65','Texto66','Texto67','Texto68','Texto69','Texto70','Texto71','Texto72','Texto73','Texto74'],
      'EX01': ['Texto42','Texto43','Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50','Texto51'],
      'EX02': ['Texto55','Texto56','Texto57','Texto58','Texto59','Texto60','Texto61','Texto62','Texto63','Texto64'],
      'EX03': ['Texto79','Texto80','Texto81','Texto82','Texto83','Texto84','Texto85','Texto86','Texto87','Texto88'],
      'EX04': ['Texto47','Texto48','Texto49','Texto50','Texto51','Texto52','Texto53','Texto54','Texto55','Texto56'],
      'EX06': ['Texto60','Texto61','Texto62','Texto63','Texto64','Texto65','Texto66','Texto67','Texto68','Texto69'],
      'EX07': ['Texto64','Texto65','Texto66','Texto67','Texto68','Texto69','Texto70','Texto71','Texto72','Texto73'],
      'EX09': ['Texto43','Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50','Texto51','Texto52'],
      'EX10': ['Texto99','Texto100','Texto101','Texto102','Texto103','Texto104','Texto105','Texto106','Texto107','Texto108'],
      'EX11': ['Texto55','Texto56','Texto57','Texto58','Texto59','Texto60','Texto61','Texto62','Texto63','Texto64'],
      'EX13': ['Texto42','Texto43','Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50','Texto51'],
      'EX16': ['Texto27','Texto28','Texto29','Texto30','Texto31','Texto32','Texto33','Texto34','Texto35','Texto36'],
      'EX17': ['Texto27','Texto28','Texto29','Texto30','Texto31','Texto32','Texto33','Texto34','Texto35','Texto36'],
      'EX18': ['Texto27','Texto28','Texto29','Texto30','Texto31','Texto32','Texto33','Texto34','Texto35','Texto36'],
      'EX19': ['Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50','Texto51','Texto52','Texto53'],
      'EX20': ['Texto46','Texto47','Texto48','Texto49','Texto50','Texto51','Texto52','Texto53','Texto54','Texto55'],
      'EX21': ['Texto51','Texto52','Texto53','Texto54','Texto55','Texto56','Texto57','Texto58','Texto59','Texto60'],
      'EX22': ['Texto41','Texto42','Texto43','Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50'],
      'EX23': ['Texto27','Texto28','Texto29','Texto30','Texto31','Texto32','Texto33','Texto34','Texto35','Texto36'],
      'EX24': ['Texto79','Texto80','Texto81','Texto82','Texto83','Texto84','Texto85','Texto86','Texto87','Texto88'],
      'EX25': ['Texto100','Texto101','Texto102','Texto103','Texto104','Texto105','Texto106','Texto107','Texto108','Texto109'],
      'EX26': ['Texto43','Texto44','Texto45','Texto46','Texto47','Texto48','Texto49','Texto50','Texto51','Texto52'],
      'EX28': ['Texto57','Texto58','Texto59','Texto60','Texto61','Texto62','Texto63','Texto64','Texto65','Texto66'],
      'EX29': ['Texto30','Texto31','Texto32','Texto33','Texto34','Texto35','Texto36','Texto37','Texto38','Texto39'],
      'EX31': ['Texto110','Texto111','Texto112','Texto113','Texto114','Texto115','Texto116','Texto117','Texto118','Texto119'],
      'EX32': ['Texto130','Texto131','Texto132','Texto133','Texto134','Texto135','Texto136','Texto137','Texto138','Texto139'],
    };
    const campos = MAPA_REP[formulario] || MAPA_REP['EX13'];
    const vals = [REP.nombre, REP.dni, REP.direccion, REP.numero, REP.piso, REP.ciudad, REP.cp, REP.provincia, REP.telefono, REP.email];
    campos.forEach((c, i) => { try { form.getTextField(c).setText(vals[i]); } catch(e) {} });
  }

  // Fecha de firma: se completa a mano

  form.flatten();
  return await pdfDoc.save();
}

async function rellenarEX01(rutaPdf, datos) {
  const pdfBytes = fs.readFileSync(rutaPdf);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const page = pages[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const size = 8;
  const color = rgb(0, 0, 0);

  const escribir = (texto, x, y) => {
    if (!texto) return;
    page.drawText(String(texto), { x, y, size, font, color });
  };

  // Coordenadas calibradas sobre EX01 (y invertida: alto pagina - y_visual)
  const alto = page.getHeight();
  const inv = (y) => alto - y - 2;

  // Fila PASAPORTE y NIE (y=169)
  escribir(datos.pasaporte,          120,  inv(169));
  escribir(datos.nie_letra,          360,  inv(169));
  escribir(datos.nie_numero,         385,  inv(169));
  escribir(datos.nie_control,        510,  inv(169));
  // Fila apellidos (y=187)
  escribir(datos.apellido1,          120,  inv(187));
  escribir(datos.apellido2,          390,  inv(187));
  // Fila nombre y sexo (y=205)
  escribir(datos.firstname,          100,  inv(205));
  // Fila fecha nacimiento (y=226)
  escribir(datos.fecha_dia,          130,  inv(226));
  escribir(datos.fecha_mes,          158,  inv(226));
  escribir(datos.fecha_anio,         186,  inv(226));
  escribir(datos.lugar_de_nacimiento,260,  inv(226));
  escribir(datos.pais_de_nacimiento, 440,  inv(226));
  // Fila nacionalidad y estado civil (y=242)
  escribir(datos.nacionalidad,       120,  inv(242));
  // Fila padre y madre (y=260)
  escribir(datos.nombre_padre,       120,  inv(260));
  escribir(datos.nombre_madre,       370,  inv(260));
  // Fila domicilio (y=279)
  escribir(datos.address,            120,  inv(279));
  escribir(datos.numero_calle,       480,  inv(279));
  escribir(datos.piso_puerta,        530,  inv(279));
  // Fila localidad (y=297)
  escribir(datos.city,               110,  inv(297));
  escribir(datos.zip,                340,  inv(297));
  escribir(datos.state,              430,  inv(297));
  // Fila telefono y email (y=315)
  escribir(datos.phone,              120,  inv(315));
  escribir(datos.email,              300,  inv(315));

  return await pdfDoc.save();
}

app.get('/rellenar-formulario', async (req, res) => {
  try {
    const { hs_object_id, formulario, representante } = req.query;
    const conRepresentante = representante === 'si';

    if (!formulario || !FORMULARIOS[formulario]) {
      return res.send(`<html><body style="font-family:sans-serif;padding:20px">
        <p>Formulario no válido. Opciones: EX01, EX13, EX18</p>
      </body></html>`);
    }

    if (!hs_object_id || !HUBSPOT_TOKEN) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const p = await obtenerDatosHubSpot(hs_object_id);
    const datos = prepararDatos(p);
    const rutaPdf = path.join(__dirname, 'formularios', FORMULARIOS[formulario]);

    let pdfBytes;
    pdfBytes = await rellenarEditable(rutaPdf, MAPA_EX13, datos, conRepresentante, formulario);

    const nombre = `${formulario}_${datos.apellido1}_${datos.firstname}.pdf`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Error rellenando formulario:', error);
    res.status(500).json({ error: error.message });
  }
});
