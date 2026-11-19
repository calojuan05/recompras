# Cómo funciona el software de recompra y fidelización

Guía para explicar el proyecto. Todo lo que dice acá está verificado contra el
código, no es una descripción de lo que debería hacer.

---

## 1. El problema que resuelve

VicoVital vende suplementos por WhatsApp con pago contraentrega. Un frasco de
colágeno dura unos 50 días. Cuando se le acaba al cliente, nadie se entera: ni
él se acuerda de volver a pedir, ni el negocio sabe que llegó el momento.

La venta se pierde en silencio. Y recuperar a alguien que ya compró es mucho más
barato que conseguir uno nuevo.

**Lo que hace el sistema:** calcula para cada cliente y cada producto el día en
que se va a quedar sin nada, y avisa unos días antes para escribirle.

---

## 2. La arquitectura: cuatro capas

El código está separado en capas donde cada una solo puede hablar con la de
abajo. No es decoración: es lo que permite probar el cálculo sin base de datos.

```
  Pantallas (src/app, src/components)      lo que ve el usuario
        │
  Rutas HTTP (src/app/api)                 19 endpoints
        │
  Servicios (src/lib/services)             orquestan y guardan
        │
  Dominio (src/lib/domain)                 las reglas puras
```

Y a un lado:

```
  Adaptadores (src/lib/adapters)           de dónde vienen los pedidos
```

### Lo importante de esta separación

**El dominio no sabe que existe una base de datos.** Lo comprobamos: cero
archivos de `src/lib/domain` importan Prisma. Son funciones que reciben datos y
devuelven datos.

Eso significa que la fórmula del ciclo se puede probar con números inventados,
sin levantar nada. Por eso hay **94 pruebas automáticas** que corren en dos
segundos.

**Los servicios sí tocan la base** (8 de ellos). Son los que leen, calculan
usando el dominio, y guardan.

---

## 3. El núcleo: cómo se calcula un ciclo

Está en `src/lib/domain/ciclos.ts`. Es el corazón del sistema.

```
diasTotales           = duración × cantidadFrascos × factorAjuste
fechaAgotamiento      = fechaInicio + diasTotales
fechaRecompraSugerida = fechaAgotamiento − diasDeAnticipación
```

Simple a primera vista. Pero tiene **dos reglas que no son obvias** y que son
las que hacen que el sistema sirva:

### Regla 1: los frascos se suman, no se reparten

Si alguien compra tres frascos, no se los toma en paralelo. Se toma uno, después
otro, después otro. Entonces tres frascos de 50 días son **150 días**, no 50.

Parece evidente dicho así, pero es el error más fácil de cometer: si se tomara
la fecha de la compra y se le sumaran 50 días, al cliente se le escribiría
cuando todavía le quedan dos frascos sin abrir.

### Regla 2: el encadenamiento

Si un cliente vuelve a comprar **antes** de acabarse lo que tiene, el frasco
nuevo no empieza a consumirse el día de la compra: empieza cuando se acabe el
anterior.

```ts
const encadenado = fechaAgotamientoCicloPrevio > fechaCompra;
const fechaInicio = encadenado ? fechaAgotamientoCicloPrevio : fechaCompra;
```

Sin esto, cada compra adelantada corre todas las fechas siguientes hacia
adelante y el sistema termina hostigando al cliente con recordatorios cuando
todavía tiene producto. Es la diferencia entre un sistema que ayuda y uno que
molesta.

---

## 4. El factor de ajuste: aprender de cada cliente

Está en `src/lib/domain/factor-ajuste.ts`.

La etiqueta del frasco dice 50 días, pero hay quien se salta días y quien dobla
la dosis. Cuando un cliente ya compró **dos o más veces** el mismo producto, sus
propios intervalos entre compras dicen la verdad mejor que la etiqueta.

```
factor = mediana( intervalo_real / duración_teórica )
```

### Por qué mediana y no promedio

Un solo pedido raro —una recompra a los tres días porque fue un regalo, o un
cliente que desapareció medio año— desplaza el promedio lo suficiente para
arruinar todas las fechas siguientes. La mediana ignora los extremos.

### Por qué está acotado entre 0,6 y 1,6

```ts
export const FACTOR_MINIMO = 0.6;
export const FACTOR_MAXIMO = 1.6;
```

Son topes de seguridad. Aunque los datos de un cliente digan algo absurdo, el
sistema no puede predecir que un frasco le dure tres días ni tres años. Un
cálculo sin límites produce fechas imposibles y nadie vuelve a creerle.

Con menos de dos compras no hay intervalo que medir, así que se usa el factor
neutro (1,0): la duración de la etiqueta tal cual.

---

## 5. Las fechas: por qué son texto y no objetos Date

Está en `src/lib/domain/fechas.ts`, y es la decisión técnica más importante del
proyecto.

**El problema:** un objeto `Date` en JavaScript es un instante exacto con zona
horaria. Si se guarda "3 de octubre" y se lee desde otra zona, puede volverse el
2 o el 4 de octubre. En un sistema cuyo producto entero son fechas, eso es fatal.

**La solución:** todo el dominio usa cadenas `'AAAA-MM-DD'`. Sin hora, sin zona.

> Un frasco no se acaba "el 3 de octubre a las 14:32 UTC": se acaba el 3 de
> octubre.

Sumar días es manipular esa cadena. La zona horaria interviene en **un solo
punto** de todo el sistema: saber qué día es hoy en Colombia.

Esto elimina el problema de raíz en vez de parchearlo con conversiones en cada
operación —que es como se suele hacer, y por donde se cuelan los errores de un
día que nadie detecta hasta que un cliente reclama.

---

## 6. Los estados de un ciclo

Siete estados, en `src/lib/domain/estados.ts`, divididos en dos grupos:

**Automáticos** — los pone el sistema según la fecha:
`PROGRAMADO` → `POR_VENCER` → `VENCIDO`

**Manuales** — los pone una persona:
`CONTACTADO` · `RECOMPRADO` · `PAUSADO` · `CANCELADO`

La regla clave: **el sistema nunca pisa un estado manual.** Si un asesor marcó
"CONTACTADO" o "PAUSADO", el recálculo diario respeta esa decisión. La máquina
no sobrescribe lo que decidió una persona.

---

## 7. El motor: lo que corre solo

Está en `src/lib/services/motor.ts`. Cada día a las 8:00 de Bogotá:

1. Recalcula todos los ciclos y reclasifica sus estados
2. Prepara los mensajes de quienes entraron en ventana de contacto
3. Deja constancia de todo en la auditoría

**Lo que NO hace: enviar.** Los mensajes quedan en una bandeja esperando
aprobación humana.

> Un sistema que escribe solo a los clientes mientras nadie mira es un accidente
> esperando a ocurrir.

Hay además un **modo simulado** activo por defecto: los mensajes se guardan pero
no salen a ningún proveedor. Es la protección más barata contra escribirle por
error a 900 clientes reales.

---

## 8. Los adaptadores: de dónde vienen los pedidos

En `src/lib/adapters/` hay cuatro, intercambiables:

| Adaptador | Para qué |
|---|---|
| `lucidbot` | La fuente real: la API del CRM de WhatsApp |
| `local-db` | Datos ya cargados, sin red |
| `rest` | Cualquier API genérica |
| `csv` | Un archivo exportado a mano |

Todos cumplen la misma interfaz. El resto del sistema no sabe de dónde vienen
los datos. Si mañana se cambia de CRM, se escribe un adaptador nuevo y nada más
se toca.

### Lo que se aprendió de la API real

Tres cosas que no están en ninguna documentación y están anotadas en el código:

- Los pedidos no viven en un endpoint de órdenes: son **"oportunidades" dentro
  de un pipeline**, y la etapa del pipeline es el estado de entrega.
- **No hay listado de contactos** (`/contacts` responde 405). Hay que pedirlos
  uno por uno.
- La paginación es de **100 como máximo**; pedir más devuelve vacío, no error.

---

## 9. La pestaña de envíos a las islas

Es la parte más nueva, en `src/lib/services/envios.ts`. Resuelve otro problema:
el **13 % de los pedidos se devuelve**, y en San Andrés el transporte tarda
tanto que el cliente se cansa, no reclama el paquete y vuelve.

El sistema vigila los envíos a las islas y avisa cuando uno lleva más de 7 días
sin entregarse.

Dos detalles que valen la pena contar:

**El contador es propio, no de la API.** Lucid Bot solo guarda cuándo cambió el
pedido por última vez. Si pasa de "Guía generada" a "En reparto", esa fecha se
pisa y se pierde el origen. El sistema anota la fecha una vez y no la toca más.

**El filtro mira el departamento, nunca la ciudad.** Existe un municipio "San
Andrés" en Santander y un "San Andrés de Sotavento" en Córdoba. Filtrar por
ciudad metería pedidos del continente en una lista que vigila envíos a una isla.
Hay una prueba que lo fija.

---

## 10. Los números del proyecto

| | |
|---|---|
| Archivos escritos a mano | 86 |
| Líneas de código | 9.374 |
| Pruebas automáticas | 94, en 9 archivos |
| Modelos de datos | 12 |
| Rutas de API | 19 |
| Pantallas | 7 |

Tecnologías: **Next.js 16** (React 19), **TypeScript** en modo estricto,
**Prisma 7** sobre **SQLite**, **Tailwind CSS v4**, **node-cron** para el trabajo
diario, **Vitest** para las pruebas.

Datos reales en operación: **917 clientes**, **426 ciclos** de recompra.

---

## Si te preguntan "¿qué fue lo difícil?"

No fue la fórmula. Fue todo lo que la rodea:

1. **Las fechas.** Un error de un día en un sistema de fechas lo vuelve inútil, y
   JavaScript hace muy fácil cometerlo. La decisión de usar texto en vez de
   objetos `Date` es lo que lo evita.

2. **El encadenamiento.** La diferencia entre un sistema que acompaña al cliente
   y uno que lo persigue está en una sola línea de código.

3. **Los supuestos.** La duración de cada producto es una estimación, no un dato.
   Por eso existe el factor de ajuste: el sistema corrige su propio supuesto con
   el comportamiento real de cada persona.

4. **Decidir qué NO automatizar.** El sistema prepara los mensajes pero no los
   manda. Esa restricción es deliberada y es lo que lo hace seguro de usar.
