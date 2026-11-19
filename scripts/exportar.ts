/**
 * Saca el panel de recompras a un HTML que funciona solo.
 *
 *   npm run exportar                  deja los archivos en datos/
 *   npm run exportar -- --escritorio   además deja "Recompras.html" en el Escritorio
 *
 * Por qué existe: guardar la página del servidor con "guardar como" produce un
 * archivo que se **ve** pero no **hace**. Toda la interacción de Next depende de
 * 23 archivos JavaScript que solo existen mientras el servidor está encendido;
 * sin él, los filtros y los botones quedan muertos.
 *
 * Esto genera el HTML desde la base con su propio JavaScript dentro: filtros,
 * buscador, orden y botones de WhatsApp funcionan con el servidor apagado y sin
 * conexión. No toca la aplicación: solo lee.
 *
 * Lleva teléfonos de clientes reales. Se queda en disco; a quién se le manda lo
 * decides tú.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '@/lib/db';
import { aFechaCivil, diferenciaDias, formatearFecha, hoy as hoyEnBogota } from '@/lib/domain/fechas';
import { redactarMensaje, type PlantillaRedaccion } from '@/lib/services/notificaciones';
import { enlaceWhatsapp } from '@/lib/domain/whatsapp';

const pesos = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

/** Escapar siempre: los nombres traen comillas, `&` y emojis. */
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const csv = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * El número, tapado por el medio: `+573001234567` -> `+57300***67`.
 *
 * Se tapa **solo en el archivo exportado**, no en la aplicación. La pantalla la
 * usa quien tiene que llamar; el archivo se manda por ahí, y basta con que se
 * reenvíe una vez para que la lista de teléfonos de tus clientes esté en manos
 * de cualquiera. Quedan las puntas para poder reconocer a la persona de un
 * vistazo cuando ya tienes su número.
 */
const enmascarar = (tel: string): string =>
  tel.length < 8 ? tel : `${tel.slice(0, 6)}***${tel.slice(-2)}`;

/**
 * Con `--anonimo` no queda rastro del número: ni a la vista ni dentro de los
 * enlaces. Sin la bandera, el número sigue estando en el `href` del botón de
 * WhatsApp — tapado a la vista, pero recuperable por cualquiera que mire el
 * código. Para enseñarle el sistema a alguien de fuera, hace falta `--anonimo`.
 */
const ANONIMO = process.argv.includes('--anonimo');

/**
 * Tapa los números que van dentro del nombre.
 *
 * Hace falta porque los contactos que llegaron de Lucid Bot sin nombre se
 * guardaron como «Contacto 573001234567»: el teléfono **es** el nombre. Tapar
 * solo la columna del teléfono dejaba ocho números enteros a la vista, y eso se
 * descubrió mirando el archivo ya generado, no leyendo el código.
 */
const limpiarNombre = (nombre: string): string =>
  nombre.replace(/\d{7,}/g, (d) => `${d.slice(0, 3)}***${d.slice(-2)}`);

interface Fila {
  cliente: string;
  telefono: string;
  ciudad: string;
  producto: string;
  seAcaba: string;
  contactar: string;
  diasParaContactar: number;
  estado: string;
  intentos: number;
  enlace: string | null;
}

function grupoDe(f: Fila): string {
  if (f.estado === 'RECOMPRADO') return 'recomprado';
  if (f.diasParaContactar < 0) return 'vencido';
  if (f.diasParaContactar === 0) return 'hoy';
  if (f.diasParaContactar <= 7) return 'semana';
  return 'futuro';
}

function armarHtml(filas: Fila[], hoy: string): string {
  const n = (g: string) => filas.filter((f) => grupoDe(f) === g).length;

  const fila = (f: Fila) => `
      <tr data-g="${grupoDe(f)}" data-buscar="${esc((limpiarNombre(f.cliente) + ' ' + enmascarar(f.telefono) + ' ' + f.producto).toLowerCase())}">
        <td class="n">${esc(limpiarNombre(f.cliente))}${f.ciudad ? `<br><span class="mut">${esc(f.ciudad)}</span>` : ''}</td>
        <td class="t">${
          !f.telefono
            ? '—'
            : ANONIMO
              ? `<span class="mut">${esc(enmascarar(f.telefono))}</span>`
              : `<a href="tel:${esc(f.telefono)}">${esc(enmascarar(f.telefono))}</a>`
        }</td>
        <td>${esc(f.producto)}</td>
        <td>${esc(formatearFecha(f.seAcaba))}</td>
        <td class="${f.diasParaContactar < 0 ? 'urg' : ''}">${esc(formatearFecha(f.contactar))}<br><span class="mut">${
          f.diasParaContactar < 0
            ? `hace ${Math.abs(f.diasParaContactar)} d`
            : f.diasParaContactar === 0
              ? 'hoy'
              : `en ${f.diasParaContactar} d`
        }</span></td>
        <td><span class="chip">${esc(f.estado)}</span>${f.intentos > 0 ? `<br><span class="mut">${f.intentos} intento${f.intentos === 1 ? '' : 's'}</span>` : ''}</td>
        <td>${
          ANONIMO
            ? '<span class="mut">—</span>'
            : f.enlace
              ? `<a class="wa" href="${esc(f.enlace)}" target="_blank" rel="noreferrer">WhatsApp</a>`
              : '<span class="mut">sin número</span>'
        }</td>
      </tr>`;

  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recompras VicoVital — ${formatearFecha(hoy)}</title>
<style>
  :root {
    --plano:#f9f9f7; --sup:#fcfcfb; --tinta:#0b0b0b; --tinta2:#52514e; --tinta3:#898781;
    --linea:#e1e0d9; --serie:#2a78d6; --critico:#d03b3b; --bien:#006300; --alerta:#fab219;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --plano:#0d0d0d; --sup:#1a1a19; --tinta:#fff; --tinta2:#c3c2b7; --tinta3:#898781;
      --linea:#2c2c2a; --serie:#3987e5; --bien:#0ca30c;
      color-scheme: dark;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px; background:var(--plano); color:var(--tinta);
         font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .caja { max-width:1200px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--tinta2); font-size:14px; margin:0 0 20px; }
  .fichas { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:20px; }
  .ficha { background:var(--sup); border:1px solid var(--linea); border-radius:12px; padding:12px; }
  .ficha b { display:block; font-size:26px; font-weight:600; }
  .ficha span { color:var(--tinta3); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .barra { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center; }
  .barra button { cursor:pointer; border:1px solid var(--linea); background:var(--sup); color:var(--tinta2);
                  border-radius:8px; padding:6px 12px; font-size:14px; font-family:inherit; }
  .barra button[aria-pressed="true"] { background:var(--tinta); color:var(--sup); border-color:var(--tinta); }
  .barra input { flex:1; min-width:180px; border:1px solid var(--linea); background:var(--sup);
                 color:var(--tinta); border-radius:8px; padding:7px 12px; font-size:14px; font-family:inherit; }
  .envoltorio { overflow-x:auto; background:var(--sup); border:1px solid var(--linea); border-radius:12px; }
  table { border-collapse:collapse; width:100%; font-size:14px; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--tinta3);
       padding:10px 12px; border-bottom:1px solid var(--linea); white-space:nowrap; cursor:pointer; user-select:none; }
  th:hover { color:var(--tinta); }
  td { padding:10px 12px; border-bottom:1px solid var(--linea); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  .n { font-weight:500; }
  .t a { font-family:ui-monospace,monospace; color:var(--tinta); }
  .mut { color:var(--tinta3); font-size:12px; }
  .urg { color:var(--critico); font-weight:500; }
  .chip { display:inline-block; border:1px solid var(--linea); border-radius:6px; padding:1px 7px; font-size:12px; color:var(--tinta2); }
  .wa { display:inline-block; background:var(--bien); color:#fff; text-decoration:none;
        border-radius:8px; padding:5px 10px; font-size:13px; white-space:nowrap; }
  .vacio { padding:32px; text-align:center; color:var(--tinta3); }
  .pie { color:var(--tinta3); font-size:12px; margin-top:16px; }
  @media print { body{padding:0} .barra,.wa{display:none} .envoltorio{border:0} }
</style>
</head>
<body>
<div class="caja">
  <h1>Recompras — VicoVital</h1>
  <p class="sub">Quién se está quedando sin producto y cuándo escribirle · ${formatearFecha(hoy)} · ${filas.length} ciclos</p>

  <div class="fichas">
    <div class="ficha"><span>Vencidos</span><b>${n('vencido')}</b></div>
    <div class="ficha"><span>Para hoy</span><b>${n('hoy')}</b></div>
    <div class="ficha"><span>Esta semana</span><b>${n('semana')}</b></div>
    <div class="ficha"><span>Más adelante</span><b>${n('futuro')}</b></div>
    <div class="ficha"><span>Ya recompraron</span><b>${n('recomprado')}</b></div>
  </div>

  <div class="barra">
    <button aria-pressed="true" data-f="todos">Todos ${filas.length}</button>
    <button aria-pressed="false" data-f="vencido">Vencidos ${n('vencido')}</button>
    <button aria-pressed="false" data-f="hoy">Hoy ${n('hoy')}</button>
    <button aria-pressed="false" data-f="semana">Esta semana ${n('semana')}</button>
    <button aria-pressed="false" data-f="futuro">Más adelante ${n('futuro')}</button>
    <input id="q" type="search" placeholder="Buscar cliente, teléfono o producto">
  </div>

  <div class="envoltorio">
    <table id="tabla">
      <thead><tr>
        <th data-col="0">Cliente</th><th data-col="1">Teléfono</th><th data-col="2">Producto</th>
        <th data-col="3">Se le acaba</th><th data-col="4">Contactar</th><th data-col="5">Estado</th><th></th>
      </tr></thead>
      <tbody>${filas.map(fila).join('')}</tbody>
    </table>
    <div class="vacio" id="vacio" hidden>Nada coincide con ese filtro.</div>
  </div>

  <p class="pie">
    Generado desde la base de recompras el ${formatearFecha(hoy)}. Funciona sin servidor y sin conexión.
    ${
      ANONIMO
        ? 'Los teléfonos van tapados y sin enlaces: este archivo se puede compartir.'
        : 'Los teléfonos se ven tapados, pero el número completo sigue dentro de los enlaces de WhatsApp. Para mandárselo a alguien de fuera, exporta con --anonimo.'
    }
  </p>
</div>
<script>
(function () {
  var filas = Array.prototype.slice.call(document.querySelectorAll('#tabla tbody tr'));
  var grupo = 'todos', texto = '';

  function pintar() {
    var visibles = 0;
    filas.forEach(function (tr) {
      var okG = grupo === 'todos' || tr.dataset.g === grupo;
      var okT = !texto || tr.dataset.buscar.indexOf(texto) !== -1;
      var ok = okG && okT;
      tr.style.display = ok ? '' : 'none';
      if (ok) visibles++;
    });
    document.getElementById('vacio').hidden = visibles > 0;
  }

  document.querySelectorAll('.barra button').forEach(function (b) {
    b.addEventListener('click', function () {
      grupo = b.dataset.f;
      document.querySelectorAll('.barra button').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      pintar();
    });
  });

  document.getElementById('q').addEventListener('input', function (e) {
    texto = e.target.value.toLowerCase().trim();
    pintar();
  });

  // Ordenar por columna. Las fechas van en data-orden para no depender de cómo
  // se lean "22 ago 2026" y compañía.
  var asc = {};
  document.querySelectorAll('th[data-col]').forEach(function (th) {
    th.addEventListener('click', function () {
      var col = Number(th.dataset.col);
      asc[col] = !asc[col];
      var cuerpo = document.querySelector('#tabla tbody');
      filas.sort(function (a, b) {
        var x = a.cells[col].innerText.trim().toLowerCase();
        var y = b.cells[col].innerText.trim().toLowerCase();
        return (x < y ? -1 : x > y ? 1 : 0) * (asc[col] ? 1 : -1);
      });
      filas.forEach(function (tr) { cuerpo.appendChild(tr); });
    });
  });
})();
</script>
</body>
</html>`;
}

async function main() {
  const hoy = hoyEnBogota();

  const [ciclos, plantillasCrudas] = await Promise.all([
    prisma.repurchaseCycle.findMany({
      include: { customer: true, product: true },
      orderBy: { fechaRecompraSugerida: 'asc' },
    }),
    prisma.messageTemplate.findMany(),
  ]);

  const plantillas: PlantillaRedaccion[] = plantillasCrudas.map((p) => ({
    nombre: p.nombre,
    canal: p.canal,
    cuerpo: p.cuerpo,
  }));

  const filas: Fila[] = ciclos.map((c) => {
    const seAcaba = aFechaCivil(c.fechaAgotamientoEstimada);
    const contactar = aFechaCivil(c.fechaRecompraSugerida);

    // El mensaje se arma con la misma función que usa el panel, para que el
    // archivo exportado y la pantalla digan exactamente lo mismo.
    const redactado = redactarMensaje({
      plantillas,
      canal: c.customer.canalPreferido,
      estado: c.estado,
      nombreCompleto: c.customer.nombreCompleto,
      producto: c.product.nombre,
      fechaAgotamiento: seAcaba,
      linkRecompra: '',
      hoy,
    });

    return {
      cliente: c.customer.nombreCompleto,
      telefono: c.customer.telefono ?? '',
      ciudad: c.customer.ciudad ?? '',
      producto: c.product.nombre,
      seAcaba,
      contactar,
      diasParaContactar: diferenciaDias(hoy, contactar),
      estado: c.estado,
      intentos: c.intentosContacto,
      enlace: enlaceWhatsapp(c.customer.telefono, redactado?.cuerpo ?? null),
    };
  });

  const destino = path.join(process.cwd(), 'datos');
  await mkdir(destino, { recursive: true });

  const html = armarHtml(filas, hoy);
  const rutaHtml = path.join(destino, `recompras-${hoy}.html`);
  await writeFile(rutaHtml, html, 'utf8');

  // El BOM hace que Excel en Windows abra las tildes bien.
  const cabecera = ['Cliente', 'Telefono', 'Ciudad', 'Producto', 'SeLeAcaba', 'Contactar', 'DiasParaContactar', 'Estado', 'Intentos'];
  const cuerpo = filas.map((f) =>
    [
      limpiarNombre(f.cliente),
      ANONIMO ? enmascarar(f.telefono) : f.telefono,
      f.ciudad,
      f.producto,
      f.seAcaba,
      f.contactar,
      f.diasParaContactar,
      f.estado,
      f.intentos,
    ]
      .map(csv)
      .join(','),
  );
  const rutaCsv = path.join(destino, `recompras-${hoy}.csv`);
  await writeFile(rutaCsv, '﻿' + [cabecera.map(csv).join(','), ...cuerpo].join('\r\n'), 'utf8');

  console.log(`${filas.length} ciclos exportados.\n`);
  console.log(`  ${rutaHtml}`);
  console.log(`  ${rutaCsv}`);

  if (process.argv.includes('--escritorio')) {
    const enElEscritorio = path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? '.',
      'Desktop',
      'Recompras.html',
    );
    await writeFile(enElEscritorio, html, 'utf8');
    console.log(`  ${enElEscritorio}`);
  }

  console.log('\nSe abre con doble clic. Filtros, buscador, orden y WhatsApp funcionan sin servidor.');
}

main()
  .catch((error) => {
    console.error('Falló la exportación:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
