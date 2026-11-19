/**
 * Congela la aplicación entera en un solo HTML, tal como se ve en el navegador.
 *
 *   npm run dev                       (en otra terminal, tiene que estar encendido)
 *   npm run exportar:pagina           deja el archivo en datos/
 *   npm run exportar:pagina -- --escritorio
 *   npm run exportar:pagina -- --numeros    deja los teléfonos completos
 *
 * Es distinto de `npm run exportar`: aquel genera una tabla propia desde la base;
 * este toma las páginas **como las pinta la aplicación** y las mete en un archivo
 * que se abre sin servidor. Sirve para enseñar el proyecto tal cual es.
 *
 * Cómo funciona: pide cada ruta al servidor de desarrollo, se queda con el
 * contenido del `<body>` —que en esta app viene ya renderizado desde el
 * servidor—, tira los scripts de Next (que sin servidor no hacen nada más que
 * dar errores), mete el CSS dentro y cose todas las páginas en un documento con
 * su propia navegación.
 *
 * No toca la aplicación: solo le hace peticiones, como el navegador.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_EXPORT ?? 'http://localhost:3000';
const AL_ESCRITORIO = process.argv.includes('--escritorio');

/**
 * Los teléfonos se tapan salvo que se pidan enteros. Un archivo pensado para
 * enseñar el proyecto no necesita los números de 600 clientes reales.
 */
const CON_NUMEROS = process.argv.includes('--numeros');

const PAGINAS = [
  { ruta: '/', id: 'panel', nombre: 'Panel' },
  { ruta: '/clientes', id: 'clientes', nombre: 'Clientes' },
  { ruta: '/productos', id: 'productos', nombre: 'Productos' },
  { ruta: '/ciclos', id: 'ciclos', nombre: 'Ciclos' },
  { ruta: '/mensajeria', id: 'mensajeria', nombre: 'Mensajería' },
  { ruta: '/configuracion', id: 'configuracion', nombre: 'Configuración' },
];

async function pedir(ruta: string): Promise<string> {
  const r = await fetch(BASE + ruta);
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.text();
}

/** Todo lo que hay dentro del `<body>`, que es lo que se ve. */
function cuerpoDe(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
}

/**
 * Fuera los scripts de Next.
 *
 * Sin servidor no hidratan nada; lo único que consiguen es llenar la consola de
 * errores y, con el arranque fallido, a veces borrar lo que ya estaba pintado.
 * El marcado se queda intacto, que es lo que se quiere enseñar.
 */
function sinScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<template[^>]*id="[^"]*next[^"]*"[\s\S]*?<\/template>/gi, '')
    .replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/gi, '')
    .replace(/<nextjs-portal[\s\S]*?<\/nextjs-portal>/gi, '');
}

/**
 * Los enlaces internos pasan a moverse dentro del propio archivo. Un `href="/"`
 * en un fichero local abre la raíz del disco, que es lo peor que puede pasarle a
 * quien abre esto por primera vez.
 */
function enlazarDentro(html: string): string {
  let salida = html;
  for (const p of PAGINAS) {
    salida = salida
      .replace(new RegExp(`href="${p.ruta}"`, 'g'), `href="#${p.id}" data-ir="${p.id}"`)
      .replace(new RegExp(`href="${p.ruta}\\?[^"]*"`, 'g'), `href="#${p.id}" data-ir="${p.id}"`);
  }
  // Lo que quede apuntando a una ruta que no exportamos (fichas de cliente,
  // por ejemplo) deja de ser un enlace: mejor texto muerto que un enlace roto.
  return salida.replace(/href="\/[^"#]*"/g, 'href="#" data-muerto="1"');
}

/** `+573001234567` -> `+57300***67`. También dentro de los nombres. */
function taparNumeros(html: string): string {
  if (CON_NUMEROS) return html;
  return html
    .replace(/\+?57\d{10}/g, (t) => `${t.slice(0, t.startsWith('+') ? 6 : 5)}***${t.slice(-2)}`)
    .replace(/(?<![\d>])\d{10}(?![\d<])/g, (d) => `${d.slice(0, 3)}***${d.slice(-2)}`)
    .replace(/href="tel:[^"]*"/g, 'href="#" data-muerto="1"')
    .replace(/href="https:\/\/wa\.me\/[^"]*"/g, 'href="#" data-muerto="1"');
}

async function main() {
  console.log(`Leyendo la aplicación desde ${BASE}\n`);

  const primera = await pedir(PAGINAS[0].ruta);

  // El CSS sale de las mismas hojas que enlaza la página, así que el archivo se
  // ve exactamente igual que la aplicación, sin recrear ni un estilo.
  const hojas = [...primera.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const css = (
    await Promise.all(
      hojas.map(async (h) => {
        const r = await fetch(h.startsWith('http') ? h : BASE + h);
        return r.ok ? r.text() : '';
      }),
    )
  ).join('\n');
  console.log(`  ${hojas.length} hoja(s) de estilo, ${css.length} caracteres`);

  const secciones: string[] = [];
  for (const p of PAGINAS) {
    try {
      const html = await pedir(p.ruta);
      const cuerpo = taparNumeros(enlazarDentro(sinScripts(cuerpoDe(html))));
      secciones.push(
        `<section class="pagina" id="${p.id}"${p.id === 'panel' ? '' : ' hidden'}>${cuerpo}</section>`,
      );
      console.log(`  ✓ ${p.nombre.padEnd(14)} ${cuerpo.length} caracteres`);
    } catch (error) {
      console.log(`  · ${p.nombre.padEnd(14)} no se pudo leer (${(error as Error).message})`);
    }
  }

  if (secciones.length === 0) throw new Error('No se pudo leer ninguna página. ¿Está corriendo npm run dev?');

  const documento = `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recompras VicoVital</title>
<style>
${css}
</style>
<style>
  /* Lo único que se añade encima de los estilos de la aplicación. */
  .pagina[hidden] { display: none !important; }
  [data-muerto] { cursor: default; }
  .aviso-export {
    max-width: 1100px; margin: 0 auto 8px; padding: 8px 16px;
    font: 12px/1.5 system-ui, sans-serif; opacity: .6;
  }
</style>
</head>
<body>
${secciones.join('\n')}
<p class="aviso-export">
  Copia estática del proyecto Recompras de VicoVital.
  ${CON_NUMEROS ? 'Contiene teléfonos reales.' : 'Los teléfonos van tapados.'}
  La navegación entre secciones funciona; los formularios y botones de la aplicación, no.
</p>
<script>
(function () {
  var paginas = Array.prototype.slice.call(document.querySelectorAll('.pagina'));

  function mostrar(id) {
    var hay = paginas.some(function (s) { return s.id === id; });
    if (!hay) return;
    paginas.forEach(function (s) { s.hidden = s.id !== id; });
    window.scrollTo(0, 0);
  }

  // Se captura en toda la página: los enlaces del menú están repetidos dentro
  // de cada sección, así que engancharlos uno a uno se rompería al cambiar.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    if (a.dataset.ir) { e.preventDefault(); mostrar(a.dataset.ir); return; }
    if (a.dataset.muerto) { e.preventDefault(); }
  });

  if (location.hash) mostrar(location.hash.slice(1));
})();
</script>
</body>
</html>`;

  const destino = path.join(process.cwd(), 'datos');
  await mkdir(destino, { recursive: true });
  const ruta = path.join(destino, 'proyecto-recompras.html');
  await writeFile(ruta, documento, 'utf8');

  console.log(`\n${(documento.length / 1024).toFixed(0)} KB escritos.`);
  console.log(`  ${ruta}`);

  if (AL_ESCRITORIO) {
    const enElEscritorio = path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? '.',
      'Desktop',
      'Proyecto Recompras.html',
    );
    await writeFile(enElEscritorio, documento, 'utf8');
    console.log(`  ${enElEscritorio}`);
  }

  console.log('\nSe abre con doble clic, sin servidor. El menú cambia de sección.');
}

main().catch((error) => {
  console.error('Falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
