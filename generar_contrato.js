const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, BorderStyle, WidthType, ShadingType, PageNumber,
        Header, Footer, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');

async function generarContrato(datos, lineas, conIva = false, notas = '', cuentas = ['espana']) {
  const logoPath = path.join(__dirname, 'logo.png');
  const logoData = fs.readFileSync(logoPath);
  const azul = "1F3864";
  const azulMedio = "2E75B6";
  const gris = "F5F5F5";
  const negro = "000000";

  const borde = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const bordes = { top: borde, bottom: borde, left: borde, right: borde };
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const sinBordes = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde };

  const hoy = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaTexto = `Madrid, a ${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;

  const nombreCliente = `${datos.firstname || ''} ${datos.apellido1 || ''} ${datos.apellido2 || ''}`.trim();
  const docTipo = datos.nie_letra ? 'NIE' : datos.pasaporte ? 'Pasaporte Nº' : 'DNI';
  const docNum = datos.nie_letra ? `${datos.nie_letra}${datos.nie_numero}${datos.nie_control}` : datos.pasaporte || datos.dni || '';
  const domicilio = `${datos.address || ''}, ${datos.city || ''}, ${datos.state || ''}`.trim().replace(/^,\s*|,\s*$/g, '');
  const email = datos.email || '';

  const lineasValidas = lineas.filter(l => l.servicio);
  const precioBase = lineasValidas.reduce((sum, l) => sum + (parseFloat(l.precio) || 0) * (parseInt(l.cantidad) || 1), 0);
  const iva = conIva ? precioBase * 0.21 : 0;
  const precioTotal = precioBase + iva;
  const precio50 = (precioBase / 2).toFixed(2);
  const precio50iva = conIva ? ((precioBase / 2) * 1.21).toFixed(2) : precio50;
  const servicio = lineasValidas.map(l => l.cantidad > 1 ? l.cantidad + 'x ' + l.servicio : l.servicio).join(' + ');

  function t(text, opts = {}) {
    return new TextRun({ text: String(text || ''), size: 18, font: "Arial", color: negro, ...opts });
  }
  function negrita(text) { return t(text, { bold: true }); }
  function cursiva(text) { return t(text, { italics: true }); }

  function parrafo(children, opts = {}) {
    return new Paragraph({ spacing: { before: 80, after: 80 }, alignment: AlignmentType.JUSTIFIED, ...opts, children });
  }
  function seccion(text) {
    return new Paragraph({
      spacing: { before: 240, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: azulMedio } },
      children: [new TextRun({ text, bold: true, size: 20, font: "Arial", color: azulMedio, allCaps: true })]
    });
  }
  function normal(runs, opts = {}) {
    return new Paragraph({ spacing: { before: 60, after: 60 }, ...opts, children: Array.isArray(runs) ? runs : [t(runs)] });
  }
  function espacio() {
    return new Paragraph({ spacing: { before: 60, after: 60 }, children: [t(" ")] });
  }
  function fila(col1, col2, header = false, shade = false) {
    const fill = header ? azul : shade ? "F0F4FA" : "FFFFFF";
    const color = header ? "FFFFFF" : negro;
    return new TableRow({ children: [
      new TableCell({ borders: bordes, shading: { fill, type: ShadingType.CLEAR },
        width: { size: 5000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 200, right: 200 },
        children: [new Paragraph({ children: [new TextRun({ text: col1, bold: header, size: 18, font: "Arial", color })] })] }),
      new TableCell({ borders: bordes, shading: { fill, type: ShadingType.CLEAR },
        width: { size: 4026, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 200, right: 200 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: col2, bold: header || shade, size: 18, font: "Arial", color })] })] }),
    ]});
  }

  // Tabla de cuentas bancarias
  function filaCuenta(banco, titular, concepto, numero) {
    return new TableRow({ children: [
      new TableCell({ borders: bordes, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
        children: [new Paragraph({ children: [negrita(banco)] })] }),
      new TableCell({ borders: bordes, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
        children: [new Paragraph({ children: [t(titular)] })] }),
      new TableCell({ borders: bordes, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
        children: [new Paragraph({ children: [t(concepto)] })] }),
      new TableCell({ borders: bordes, width: { size: 3526, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
        children: [new Paragraph({ children: [t(numero)] })] }),
    ]});
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
      },
      headers: {
        default: new Header({ children: [
          new Table({
            width: { size: 9026, type: WidthType.DXA }, columnWidths: [5000, 4026],
            rows: [new TableRow({ children: [
              new TableCell({ borders: sinBordes, width: { size: 5000, type: WidthType.DXA },
                children: [new Paragraph({ children: [
                  new TextRun({ text: "G ROBLES ASESORES 2025 SL", bold: true, size: 18, font: "Arial", color: azul }),
                  new TextRun({ text: "  |  CIF: B22645543", size: 16, font: "Arial", color: "666666" }),
                ]})] }),
              new TableCell({ borders: sinBordes, width: { size: 4026, type: WidthType.DXA },
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
                  new TextRun({ text: "Calle Velázquez 126, 6D — Madrid, España", size: 16, font: "Arial", color: "666666" }),
                ]})] }),
            ]})]
          }),
          new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: azulMedio } }, children: [] }),
        ]})
      },
      footers: {
        default: new Footer({ children: [
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: azulMedio } },
            alignment: AlignmentType.CENTER, children: [
              new TextRun({ text: "roblesextranjeria.com  |  919 999 952  |  Página ", size: 14, font: "Arial", color: "666666" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, font: "Arial", color: "666666" }),
              new TextRun({ text: " de ", size: 14, font: "Arial", color: "666666" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: "Arial", color: "666666" }),
            ]
          })
        ]})
      },
      children: [
        espacio(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: "HOJA DE ENCARGO PROFESIONAL", bold: true, size: 26, font: "Arial", color: azul, allCaps: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
          children: [cursiva("Contrato de arrendamiento de servicios profesionales regulado por el artículo 1.544 del Código Civil español")] }),
        espacio(),

        seccion("I. CONDICIONES PARTICULARES — PARTES"),
        parrafo([negrita("EL CLIENTE: "), t(nombreCliente), t(", con "), t(docTipo), t(" "), negrita(docNum), t(", con domicilio en "), t(domicilio), t(".")]),
        parrafo([negrita("EL DESPACHO: "), negrita("G ROBLES ASESORES 2025 SL"), t(", CIF B22645543, Calle Velázquez 126, 6D, Madrid, representado por "), negrita("José Luis Robles Criado"), t(", Colegiado n.º 111304 ICAM, DNI 5326459-K.")]),
        parrafo([t("Ambas partes se reconocen recíprocamente la capacidad legal necesaria para contratar conforme a los artículos 1.255, 1.258 y 1.261 del Código Civil.")]),

        seccion("II. OBJETO DEL ENCARGO"),
        parrafo([t("Al amparo del artículo 1.544 del Código Civil, "), negrita("EL CLIENTE"), t(" encomienda a "), negrita("EL DESPACHO"), t(" la realización de:")]),
        espacio(),
        new Table({
          width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
          rows: [new TableRow({ children: [new TableCell({
            borders: bordes, width: { size: 9026, type: WidthType.DXA },
            shading: { fill: "EFF3FB", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [negrita("SERVICIO CONTRATADO")] }),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 },
                children: [new TextRun({ text: servicio, size: 22, font: "Arial", color: azulMedio, bold: true })] }),
            ]
          })]})],
        }),
        espacio(),
        parrafo([negrita("EL CLIENTE"), t(" se compromete a: a) respetar la exclusividad del encargo; b) proporcionar diligentemente toda documentación relevante conforme al artículo 1.258 CC; c) comunicar cualquier cambio de domicilio o datos de contacto.")]),

        seccion("III. HONORARIOS Y FORMA DE PAGO"),
        parrafo([t("La ejecución del encargo se efectuará en régimen de arrendamiento de servicios conforme al artículo 1.544 CC. Los honorarios pactados son:")]),
        espacio(),
        new Table({
          width: { size: 9026, type: WidthType.DXA }, columnWidths: [5000, 4026],
          rows: [
            fila("Concepto", "Importe", true),
            ...lineasValidas.map(l => fila(
              (parseInt(l.cantidad) > 1 ? l.cantidad + ' × ' : '') + l.servicio,
              ((parseFloat(l.precio) || 0) * (parseInt(l.cantidad) || 1)).toFixed(2) + " €"
            )),
            ...(conIva ? [fila("IVA (21%)", iva.toFixed(2) + " €")] : []),
            fila("TOTAL", precioTotal.toFixed(2) + " €", false, true),
            fila("1.er pago — a la firma (50%)", precio50iva + " €", false, true),
            fila("2.º pago — antes de la presentación (50%)", precio50iva + " €", false, true),
          ]
        }),
        espacio(),
        parrafo([t("Conforme al artículo 35.2 LEC, el presente documento tiene carácter de presupuesto previo. El 50% se abonará a la firma y el 50% restante un día antes de la presentación ante el organismo competente.")]),
        parrafo([t("De conformidad con el artículo 7 de la Ley 7/2012, queda prohibido el pago en efectivo por importe igual o superior a 1.000 euros cuando alguna de las partes sea empresario o profesional.")]),

        seccion("IV. CUENTAS BANCARIAS PARA EL PAGO"),
        parrafo([t("El pago de honorarios podrá efectuarse en cualquiera de las siguientes cuentas, según la moneda y país de origen del pago:")]),
        espacio(),
(() => {
          const todasCuentas = {
            espana: filaCuenta("Santander (España)", "G Robles Asesores 2025 SL", "EUR", "ES12 0049 0880 8826 1016 7239"),
            rd_eur: filaCuenta("Banreservas (RD)", "José Luis Robles Criado — Céd. 402-4956972-0", "EUR", "9604398663"),
            rd_usd: filaCuenta("Banreservas (RD)", "José Luis Robles Criado — Céd. 402-4956972-0", "USD", "9604398647"),
            rd_dop: filaCuenta("Banreservas (RD)", "José Luis Robles Criado — Céd. 402-4956972-0", "DOP", "9604398622"),
            usa: filaCuenta("Citibank (USA)", "José Luis Robles Criado — 4886 NW 97th Pl, Doral FL 33178", "USD", "Checking: 33071929906 | Routing: 266086554 | SWIFT: CITIUS33XXX"),
          };
          const filasCuentas = cuentas.filter(c => todasCuentas[c]).map(c => todasCuentas[c]);
          return new Table({
            width: { size: 9026, type: WidthType.DXA }, columnWidths: [2000, 2000, 1500, 3526],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders: bordes, shading: { fill: azul, type: ShadingType.CLEAR }, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Banco", bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })] }),
                new TableCell({ borders: bordes, shading: { fill: azul, type: ShadingType.CLEAR }, width: { size: 2000, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Titular", bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })] }),
                new TableCell({ borders: bordes, shading: { fill: azul, type: ShadingType.CLEAR }, width: { size: 1500, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Moneda", bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })] }),
                new TableCell({ borders: bordes, shading: { fill: azul, type: ShadingType.CLEAR }, width: { size: 3526, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 150, right: 150 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Número de cuenta", bold: true, size: 18, font: "Arial", color: "FFFFFF" })] })] }),
              ]}),
              ...filasCuentas,
            ]
          });
        })(),
        espacio(),

        seccion("V. IRREVOCABILIDAD DE LOS HONORARIOS"),
        parrafo([t("Conforme a los artículos 1.124 y 1.101 del Código Civil, una vez abonada cualquier cantidad, "), negrita("EL DESPACHO"), t(" no procederá a su devolución, dado que la fase de información y asesoramiento ya se habrá ejecutado. La solicitud unilateral de resolución por "), negrita("EL CLIENTE"), t(" no genera derecho a reembolso.")]),

        seccion("VI. OBLIGACIONES DE EL DESPACHO"),
        parrafo([t("Conforme a los artículos 13, 14 y 22 del Estatuto General de la Abogacía (RD 135/2021), "), negrita("EL DESPACHO"), t(" se obliga a actuar con diligencia debida, guardar secreto profesional e informar periódicamente del estado del asunto.")]),
        parrafo([negrita("EL DESPACHO"), t(" no garantiza el resultado del procedimiento. Las resoluciones administrativas y consulares son competencia exclusiva de las autoridades públicas, conforme al artículo 27 del Estatuto General de la Abogacía.")]),

        seccion("VII. DECLARACIONES DE EL CLIENTE"),
        parrafo([negrita("EL CLIENTE"), t(" declara bajo su responsabilidad personal:")]),
        normal([t("—  No haber sido condenado por delito penal en ningún país.    SÍ  ☐     NO  ☐")]),
        normal([t("—  No tener relación con actividades de blanqueo de capitales.    SÍ  ☐     NO  ☐")]),
        normal([t("—  No tener prohibida la entrada en ningún país.    SÍ  ☐     NO  ☐")]),
        normal([t("—  No haber tenido problemas con las fuerzas de seguridad españolas.    SÍ  ☐     NO  ☐")]),
        normal([t("—  No haber estado en situación irregular en España.    SÍ  ☐     NO  ☐")]),
        espacio(),
        parrafo([t("La falsedad de estas declaraciones facultará a "), negrita("EL DESPACHO"), t(" para resolver el contrato con pérdida de honorarios y podrá generar responsabilidades penales conforme a los artículos 390 y ss. de la LO 10/1995.")]),

        seccion("VIII. POLÍTICA DE CITAS EN ESPAÑA"),
        parrafo([t("Incluye: (1) cita de empadronamiento; (2) cita de toma de huella; (3) cita de recogida de TIE. Cada cita adicional por cancelación ajena a "), negrita("EL DESPACHO"), t(" tendrá un coste de 150 €. EL CLIENTE deberá notificar su llegada con 15 días de antelación y mantener disponibilidad de 7 días naturales.")]),

        seccion("IX. PREVENCIÓN DEL BLANQUEO DE CAPITALES"),
        parrafo([t("Conforme a la Ley 10/2010 y el RD 304/2014, "), negrita("EL DESPACHO"), t(" aplicará medidas de diligencia debida y comunicará al SEPBLAC cualquier operación sospechosa. "), negrita("EL CLIENTE"), t(" se compromete a aportar la documentación requerida al efecto.")]),

        seccion("X. LIMITACIÓN DE RESPONSABILIDAD"),
        parrafo([t("Conforme al artículo 1.101 CC, "), negrita("EL DESPACHO"), t(" únicamente responderá de daños causados por dolo o negligencia grave. Quedan excluidas las decisiones de organismos públicos y consulados. Los recursos de cualquier índole no están incluidos en el presente encargo y generarán honorarios adicionales.")]),

        seccion("XI. RESOLUCIÓN Y DESISTIMIENTO"),
        parrafo([t("Conforme al artículo 1.124 CC, cualquier parte podrá resolver el contrato por incumplimiento de la contraria con derecho a indemnización. "), negrita("EL DESPACHO"), t(" podrá renunciar conforme a los artículos 28 y 29 del Estatuto General de la Abogacía (RD 135/2021), sin causar indefensión.")]),

        seccion("XII. LEY APLICABLE Y JURISDICCIÓN"),
        parrafo([t("El presente contrato se rige por el Derecho español en virtud del artículo 3.1 del Reglamento (CE) n.º 593/2008 (Roma I). Las partes se someten expresamente a la jurisdicción de los Juzgados y Tribunales de Madrid, conforme al artículo 25.1 del Reglamento (UE) n.º 1215/2012 (Bruselas I bis). Frente a partes domiciliadas en terceros países —incluyendo República Dominicana, Colombia y Estados Unidos—, la competencia se fundamenta en el artículo 22 bis LOPJ, al ejecutarse el contrato en España.")]),

        seccion("XIII. PROTECCIÓN DE DATOS"),
        parrafo([t("Conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018: Responsable: G ROBLES ASESORES 2025 SL. Finalidad: gestión del encargo y obligaciones legales. Base jurídica: art. 6.1.b) y c) RGPD. Conservación: 6 años (art. 30 Cód. Comercio). Derechos: acceso, rectificación, supresión y oposición dirigiéndose a info@roblesextranjeria.com o ante la AEPD.")]),
        parrafo([t("Comunicaciones a EL DESPACHO exclusivamente a: "), negrita("info@roblesextranjeria.com"), t(". Dirección electrónica de EL CLIENTE: "), negrita(email), t(".")]),

        seccion("XIV. DOCUMENTACIÓN Y VERACIDAD"),
        parrafo([negrita("EL CLIENTE"), t(" se obliga a proporcionar información veraz conforme al artículo 1.258 CC y la Ley 10/2010. La aportación de documentación falsa facultará a "), negrita("EL DESPACHO"), t(" a resolver el contrato sin devolución de honorarios, con posible responsabilidad penal conforme a los artículos 390 y ss. LO 10/1995.")]),

        // NOTAS si las hay
        ...(notas && notas.trim() ? [
          seccion("XV. NOTAS Y OBSERVACIONES"),
          new Table({
            width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
            rows: [new TableRow({ children: [new TableCell({
              borders: bordes, width: { size: 9026, type: WidthType.DXA },
              shading: { fill: "FFFBF0", type: ShadingType.CLEAR },
              margins: { top: 150, bottom: 150, left: 200, right: 200 },
              children: [new Paragraph({ children: [t(notas)] })]
            })]})],
          }),
        ] : []),

        seccion(notas && notas.trim() ? "XVI. ACEPTACIÓN" : "XV. ACEPTACIÓN"),
        parrafo([t("Las partes declaran haber leído y comprendido el presente contrato y lo suscriben en prueba de conformidad.")]),
        espacio(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [t(fechaTexto, { bold: true })] }),
        espacio(),
        new Table({
          width: { size: 9026, type: WidthType.DXA }, columnWidths: [4200, 4826],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders: sinBordes, width: { size: 4200, type: WidthType.DXA },
                children: [new Paragraph({ children: [negrita("EL CLIENTE")] })] }),
              new TableCell({ borders: sinBordes, width: { size: 4826, type: WidthType.DXA },
                children: [new Paragraph({ children: [negrita("EL DESPACHO / EL LETRADO")] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: sinBordes, width: { size: 4200, type: WidthType.DXA },
                children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } }, spacing: { before: 500 }, children: [t("")] })] }),
              new TableCell({ borders: sinBordes, width: { size: 4826, type: WidthType.DXA },
                children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } }, spacing: { before: 500 }, children: [t("")] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: sinBordes, width: { size: 4200, type: WidthType.DXA },
                children: [new Paragraph({ spacing: { before: 40 }, children: [cursiva("Firma y fecha")] })] }),
              new TableCell({ borders: sinBordes, width: { size: 4826, type: WidthType.DXA },
                children: [new Paragraph({ spacing: { before: 40 }, children: [cursiva("Fdo.: José Luis Robles Criado, Col. 111304 ICAM")] })] }),
            ]}),
          ]
        }),
        espacio(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 },
          children: [cursiva("Fdo.: " + nombreCliente)] }),
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { generarContrato };
