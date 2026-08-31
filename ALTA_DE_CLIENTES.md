# Rework del alta de clientes

Fecha: 2026-09-01

## Lo que había

Una sola página con **7 tarjetas y ~50 campos seguidos**, sin distinguir lo obligatorio de lo
opcional. Para saber qué faltaba había que bajar por todo el formulario, y los errores llegaban
de golpe como un *toast* al final. Además:

- **"Municipio" y "Sector" eran texto libre**, con los marcadores `SELECCIONAR PROVINCIA` y
  `SELECCIONAR MUNICIPIO`: la cascada estaba prevista pero nunca se construyó. Cada empleado
  escribía el municipio a su manera ("Sto. Dgo. Este", "santo domingo este", "SDE") y las
  agrupaciones por zona del mapa y los informes no cuadraban.
- **El teléfono no era obligatorio**: bastaba con teléfono *o* WhatsApp.
- **Ciudad y Barrio/Sector estaban duplicados** en otra tarjeta ("Información adicional"), con
  los mismos datos que Municipio y Sector, y se llenaban por separado.
- La cédula solo se comprobaba como "no vacía": **nada impedía dar de alta dos veces al mismo
  cliente**.

---

## 1. Ubicación en cascada

**Provincia → Municipio → Distrito Municipal → Sector**

- **Provincia** y **Municipio** son selectores cerrados y obligatorios. Elegir provincia limpia
  municipio y distrito; elegir municipio limpia el distrito. No se puede dejar una combinación
  imposible.
- **Distrito municipal** es opcional y ofrece *Cabecera / zona urbana*, los distritos conocidos
  del municipio, y **"Otro (escribirlo)"** para los que no estén en el catálogo.
- **Sector / Barrio** sigue siendo texto libre: no existe un catálogo oficial manejable.
- Al pie aparece la ubicación armada (`Sector · Distrito · Municipio · Provincia`) para revisarla
  de un vistazo.

### Alcance del catálogo — importante

`src/data/dominicanRepublic.ts`:

| Nivel | Cargados | Situación |
|---|---|---|
| Provincias | **32** | Completo |
| Municipios | **156** | La cifra oficial ronda 158: **pueden faltar uno o dos** |
| Distritos municipales | **213** | **Parcial** (de unos 235) |

No se inventaron nombres para cuadrar los totales: es preferible una lista corta y correcta a
una completa e inventada. Conviene contrastarla con la ONE. Completarla es solo añadir cadenas
al array del municipio correspondiente; nada más depende de su tamaño.

Por eso el distrito **nunca** obliga a elegir de la lista. Provincia y municipio sí son
selectores cerrados: ahí la lista es fiable, y la escritura libre era justamente el problema.

### Datos antiguos

Al abrir un cliente ya existente, `normalizeStoredTerritory`:

- ajusta la grafía a la del catálogo (`"santo domingo este"` → `"Santo Domingo Este"`);
- **deduce la provincia** cuando solo se guardó el municipio — muchos clientes viejos solo tienen
  `city` — y solo si el nombre es inequívoco (hay varios "El Limón": ahí prefiere dejarlo vacío
  antes que adivinar);
- descarta un municipio que no pertenezca a la provincia guardada, en vez de mostrar una
  combinación imposible;
- **conserva un distrito escrito a mano**: el catálogo es parcial y no puede desmentir al usuario;
- respeta tal cual una provincia fuera del catálogo, y la añade como opción del selector para no
  perderla al guardar.

---

## 2. Teléfono obligatorio

- En el formulario: **teléfono principal obligatorio** y validado a 10 dígitos.
- En la base de datos: `CHECK (btrim(phone) <> '')`. `phone` ya era `NOT NULL`, pero nada impedía
  guardar una cadena vacía.
- Los registros existentes sin teléfono se marcan como `SIN TELEFONO` para que se vean en la
  aplicación **en vez de bloquear la migración**. No se inventan números: queda una marca
  explícita y buscable.
- Casilla **"Es el mismo que el teléfono principal"** para el WhatsApp, que lo mantiene
  sincronizado mientras esté marcada.
- Las otras vías de alta (Punto de Venta) ya exigían teléfono, así que la restricción no las
  rompe.

---

## 3. El rework

Asistente de **5 pasos**, cada uno con una pregunta concreta:

| Paso | Pregunta | Obligatorio |
|---|---|---|
| 1 · Identidad | ¿Quién es? | Nombres, apellidos, cédula |
| 2 · Contacto | ¿Cómo localizarlo? | **Teléfono principal** |
| 3 · Ubicación | ¿Dónde vive? | **Provincia, municipio** |
| 4 · Trabajo e ingresos | ¿De qué vive? | — |
| 5 · Otros datos | Opcional | — |

- **Barra de pasos** con estado: verde = completo, rojo = le faltan datos, azul = actual. Se puede
  saltar a cualquier paso; no es un carril forzado.
- **Errores junto al campo**, no en un *toast* al final. Y solo tras intentar avanzar: no regaña
  antes de que el empleado escriba nada.
- **Barra fija abajo** con Atrás / Siguiente / Guardar, y el contador de datos que faltan.
  **Guardar funciona desde cualquier paso**: quien ya sabe lo que hace no tiene que recorrer los
  cinco. Si falta algo, salta al primer paso incompleto y lo marca.
- **Aviso de cédula duplicada**: al salir del campo se busca esa cédula en la empresa y, si ya
  existe, se muestra el nombre con un enlace para abrir esa ficha. No bloquea — avisa.
- **Validaciones nuevas**: cédula de 11 dígitos, teléfonos de 10, correo con formato, y fecha de
  nacimiento coherente (no futura, mayor de edad, edad plausible). La fecha sigue siendo opcional.
- Campos que eran texto libre y ahora son selectores: **estado civil** y **situación laboral**.
- **Se eliminan los campos duplicados "Ciudad" y "Barrio / Sector"**. `city` y `neighborhood` se
  siguen guardando —los usan el mapa, los informes y las cartas de intimación— pero **derivados**
  de la cascada (`city` = municipio, `neighborhood` = sector) en lugar de pedirse dos veces.
- **Ningún campo se perdió**: banco, campos personalizados, adjunto, color, score, visibilidad y
  "creado por" siguen ahí, agrupados en el paso 5.

Una nota sobre el **score crediticio**: se mantiene editable, pero ahora dice que el CRM lo
recalcula a partir del comportamiento de pago, para que nadie espere que su valor manual perdure.

---

## 4. Archivos

**Nuevos**
```
src/data/dominicanRepublic.ts                                  catálogo + consultas de la cascada
supabase/migrations/20260901000000_add_municipal_district_to_clients.sql
```

**Reescrito**
```
src/components/clients/ClientForm.tsx
```

La migración añade `clients.municipal_district`, un índice por `(user_id, province, municipality)`
para las agrupaciones por zona, y la restricción de teléfono no vacío.

> `integrations/supabase/types.ts` está generado desde un esquema anterior y no incluye las
> columnas de cliente añadidas después (`province`, `municipality`, `sector`, `first_name`…). Era
> así desde antes; el formulario declara localmente los tipos que lee y escribe en vez de
> apoyarse en `any`.

---

## 5. Verificación

```
74 pruebas de dominicanRepublic  ✓
npx tsc --noEmit                 ✓ 0 errores
npx eslint (archivos nuevos)     ✓ 0 avisos
npm run build                    ✓
78 + 61 + 64 pruebas previas     ✓ sin regresiones
```

Las pruebas del catálogo comprueban **integridad** (32 provincias, sin duplicados, ningún
municipio repetido dentro de su provincia, ningún distrito con el nombre de su municipio, sin
nombres vacíos ni con espacios sobrantes) y el **comportamiento de la cascada**: que los
municipios de una provincia no se filtren en otra, que un distrito no cruce de municipio, que la
comparación tolere acentos y mayúsculas, y los seis casos de recuperación de datos antiguos.

**Falta probar en pantalla** lo que no cubre una prueba automática: recorrer los pasos, ver que
los selectores se limpian en cascada y que un cliente existente carga con su ubicación bien
resuelta.
