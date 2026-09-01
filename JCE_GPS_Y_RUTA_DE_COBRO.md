# Documento de identidad + JCE, ubicación GPS y ruta de cobro

Fecha: 2026-09-02

Tres cosas nuevas: el alta de clientes empieza por el **tipo de documento** y puede **verificar
la cédula contra la JCE**; cada cliente puede tener una **ubicación GPS**; y hay un módulo de
**ruta de cobro** para los cobradores.

---

## 1. Tipo de documento primero

El paso 1 del alta abre con **Tipo de documento** → **Número**. De ahí depende todo lo demás:

| Tipo | Validación | ¿JCE? |
|---|---|---|
| **Cédula** | 11 dígitos **+ dígito verificador** | ✅ |
| **Pasaporte** | 6–12 caracteres alfanuméricos | ❌ |
| **DNI** | 5–20 caracteres | ❌ |
| **ID** | mínimo 3 caracteres | ❌ |

El **número sigue guardándose en `clients.dni`** —renombrar esa columna rompería medio
sistema— y el tipo va en la columna nueva `clients.document_type`.

Cambiar el tipo reformatea el número (la cédula lleva máscara `000-0000000-0`, el resto van en
mayúsculas) y anula cualquier verificación previa.

### El dígito verificador

```
suma = Σ  d[i] × (i par ? 1 : 2)      restando 9 cuando el producto pasa de 9
check = (10 − suma mod 10) mod 10     debe coincidir con d[10]
```

Es bloqueante, como pediste: una cédula que no cuadra no deja continuar. Las pruebas confirman
que detecta el **100 % de los errores de un solo dígito** y **todas las transposiciones de
dígitos adyacentes** — los dos errores de digitación habituales.

Ojo con lo que significa: el dígito verificador dice que el número está *bien formado*, no que
esa persona *exista*. Eso solo lo confirma la consulta a la JCE.

---

## 2. Verificación contra la JCE

### Dónde vive cada cosa

El diseño de referencia era PHP MVC con servidor propio. Aquí no hay servidor de aplicación,
así que el controlador y el servicio se convierten en una **Edge Function** de Supabase:

| Referencia PHP | Aquí |
|---|---|
| `LookupController.php` + `PersonaSeguraService.php` | `supabase/functions/jce-lookup/index.ts` |
| `PersonaCache.php` (tabla) | `personas_cache` (Postgres) |
| `PersonaLookup.php` (auditoría) | `persona_lookups` |
| `Validator::validCedula()` | `src/utils/dominicanId.ts` (front) **y** dentro de la función (servidor) |
| `Geo.php` (ciudad → provincia) | `resolveJceCity` en `src/data/dominicanRepublic.ts` |
| `persona-lookup.js` (front) | `src/hooks/useJceLookup.tsx` |
| Foto por `/persona-cache/{id}/imagen` | Bucket privado `jce-photos` + URL firmada de 10 min |

### Privacidad (Ley 172-13) — lo que el código hace cumplir

- **Consentimiento obligatorio**, con casilla explícita en el formulario y **revalidado en el
  servidor**. Que el front tenga la casilla marcada no demuestra nada: cualquiera puede llamar
  al endpoint directamente.
- **El dígito verificador también se revalida en el servidor**, por lo mismo.
- **La cédula en claro nunca se persiste**: en la caché se guarda `sha256(cedula)`; en la
  auditoría, solo los **16 primeros caracteres** de ese hash.
- **La API key vive solo en la Edge Function.** Nunca llega al navegador ni a los logs.
- **RLS sin políticas** en `personas_cache` y `persona_lookups`: en Postgres eso significa que
  *nadie* entra desde el navegador. Solo la Edge Function, que corre como `service_role`.
- **Auditoría de cada intento** con empresa, usuario, resultado, IP y user-agent. Resultados:
  `ok_cache_db` · `ok_api` · `no_encontrado` · `error_red` · `sin_configurar` · `error_cache`.
- La **foto** va a un bucket privado con el **id de la fila de caché** como nombre —no el hash—
  y se entrega como URL firmada de 10 minutos. El path no deriva de la cédula ni de refilón.

### Qué bloquea y qué no

Cuando la consulta sale bien:

- **Bloqueados**: nombre, apellido, **sexo** y **fecha de nacimiento**. Los confirma el registro
  civil.
- **Autoseleccionado**: el **estado civil**, si la JCE devuelve uno reconocible.
- **Precargados pero editables**: provincia y municipio.

Hay un botón **"Corregir a mano"** que desbloquea todo y marca al cliente como no verificado.
No es un capricho: la JCE devuelve el nombre completo en una sola cadena y hay que partirlo en
nombre y apellido con una heurística (con 3 palabras se asume 1 nombre + 2 apellidos). Con
nombres compuestos puede fallar, y entonces hace falta poder corregirlo.

Cambiar el número de documento anula la verificación automáticamente.

### La ciudad de la JCE no es donde vive

**La JCE devuelve la ciudad del REGISTRO, no el domicilio actual.** Como pediste, provincia,
municipio y distrito municipal son **donde vive hoy**. Por eso la ciudad de la JCE solo se usa
para *precargar* la cascada, y solo si el empleado no había puesto ya otra cosa. Siempre se
puede cambiar.

`resolveJceCity` traduce lo que devuelve la JCE (en mayúsculas y sin acentos) al catálogo, con
una tabla de alias para lo que no coincide: `NEYBA`→Neiba, `EL SEYBO`→El Seibo,
`GUERRA`→San Antonio de Guerra, `NAVARRETE`→Bisonó, `SANTO DOMINGO`→Distrito Nacional. Cuando
no reconoce el nombre **no adivina**: deja los campos vacíos.

### Instalación

```bash
# 1. Migración
supabase db push        # 20260902000000_jce_lookup_and_client_gps.sql

# 2. Secretos (NO van al repositorio ni al navegador)
supabase secrets set PERSONA_SEGURA_URL=https://psbi.me/persona.php
supabase secrets set PERSONA_SEGURA_KEY=<clave del proveedor>
supabase secrets set PERSONA_SEGURA_CACHE_DIAS=30
supabase secrets set PERSONA_SEGURA_TIMEOUT=8

# 3. Desplegar la función
supabase functions deploy jce-lookup
```

**Sin la clave el botón no falla en silencio**: devuelve un 503 con el mensaje de que falta
configurar `PERSONA_SEGURA_URL` y `PERSONA_SEGURA_KEY`. **Yo no tengo esa clave — hay que
pedirla al proveedor (PointSeller / CDE-Software).**

### Tres diferencias deliberadas con el diseño original

1. **CSRF → JWT de Supabase.** No hay cookies de sesión; el token de sesión cumple la misma
   función y además identifica al usuario para la auditoría.
2. **Caché de 2 niveles, no 3.** El nivel «filesystem» no aplica: una Edge Function no tiene
   disco persistente. Postgres cubre lo que hacían los niveles 1 y 2.
3. **Sin el reintento «ignorando SSL».** El original reintentaba sin verificar el certificado
   cuando el hosting tenía un CA bundle viejo. Deno no permite desactivar la verificación por
   petición, y hacerlo abriría la puerta a un intermediario que vería cédulas en claro. Si el
   certificado falla, se devuelve un error de red claro.

También se omite el **quitado de marca de agua** de la foto: era GD de PHP y no hay equivalente
en Deno.

---

## 3. Ubicación GPS de la vivienda

En el paso *Ubicación* del alta, tres formas de fijarla:

1. **Mapa** — pinchar o arrastrar el marcador *(requiere clave de Google Maps)*.
2. **GPS del dispositivo** — el botón *Usar mi ubicación*, lo natural estando frente a la casa.
3. **A mano** — pegar coordenadas, o directamente **una URL de Google Maps copiada** (se
   extraen las coordenadas del `@lat,lng` o del `?q=`).

Más un campo de **referencia** ("casa amarilla, portón negro") y un enlace para abrir el punto.

Se guarda en `clients.latitude` / `longitude` / `location_note` / `location_updated_at`, con
una restricción que rechaza coordenadas fuera del planeta.

---

## 4. Módulo de ruta de cobro

**Menú → Ruta de Cobro** (`/ruta-cobro`, permiso `loans.view`).

- **Una parada por CLIENTE, no por préstamo**: si alguien tiene tres préstamos, el cobrador va
  una vez y cobra los tres. Los importes se suman y se listan los préstamos.
- Por parada: **lo que vence ese día**, **el balance atrasado**, días de atraso, cuántas cuotas
  vencidas, mora, dirección y referencia.
- **Totales arriba**: paradas, vence hoy, atrasado, total a cobrar y kilómetros del recorrido.
- **Filtros**: día, ruta asignada al cliente, e incluir o no a los que solo tienen atraso.
- **Orden**: por defecto los más atrasados primero; con *Ordenar desde donde estoy* pasa a
  **vecino más próximo** desde el GPS del cobrador.
- **Mapa** con las paradas numeradas y el cobrador marcado, más **Abrir ruta en Google Maps**
  para navegar.
- Por parada: **Llamar**, **WhatsApp** (con mensaje redactado), **Cómo llegar**, **Cobrar**
  (lleva al formulario de pago del préstamo) y **Ficha**.

Los importes salen de `computeInstallmentDues`, **la misma función que usa el pago avanzado**:
si discreparan, el cobrador pediría un importe que el formulario de pago no aceptaría.

### Dos límites que conviene conocer

- **Google Maps admite 10 paradas por ruta** (9 escalas + destino). Con más, el enlace se
  recorta y se avisa con cuántas se abrió; al terminarlas se vuelve a abrir la ruta.
- El orden por cercanía es **vecino más próximo**, una heurística: no es la ruta óptima (eso es
  el problema del viajante), pero para 10–40 paradas da un recorrido razonable al instante.
  Las paradas **sin coordenadas van al final** — no se pueden situar, pero tampoco perder.

---

## 5. Google Maps

`VITE_GOOGLE_MAPS_API_KEY`, opcional. **Sin ella todo sigue funcionando**: el selector cae en
GPS del dispositivo + coordenadas a mano, la ruta se ordena igual y la navegación se abre por
enlace en la app de Google Maps (que no requiere clave — es lo que ya hacía `MapModule`). Con
clave aparecen los mapas incrustados y la búsqueda de direcciones.

Es una clave de **navegador**: acaba en el bundle y no hay forma de ocultarla en una SPA.
Protégela restringiéndola por dominio y a las APIs *Maps JavaScript* y *Geocoding*.

---

## 6. Archivos

**Nuevos**
```
src/utils/dominicanId.ts                     tipos de documento, dígito verificador, normalización
src/utils/googleMaps.ts                      carga del SDK, enlaces, distancias, coordenadas
src/utils/collectionRoute.ts                 armado y ordenación de las paradas
src/hooks/useJceLookup.tsx                   llamada a la Edge Function
src/components/clients/LocationPicker.tsx    selector de ubicación
src/components/collections/CollectionRouteModule.tsx
supabase/functions/jce-lookup/index.ts       API key, caché, auditoría, normalización
supabase/migrations/20260902000000_jce_lookup_and_client_gps.sql
.env.example
```

**Modificados**: `ClientForm.tsx`, `dominicanRepublic.ts` (alias de la JCE), `App.tsx`,
`pages/Index.tsx`, `Sidebar.tsx`.

---

## 7. Verificación

```
 76 pruebas de dominicanId + resolveJceCity   ✓
 70 pruebas de collectionRoute + googleMaps   ✓
 74 · 61 · 78 · 64 pruebas previas            ✓ sin regresiones
npx tsc --noEmit                              ✓ 0 errores
npx eslint (archivos nuevos)                  ✓ 0 avisos
npm run build                                 ✓
```

Cubren el dígito verificador por sus **propiedades** (no con cédulas reales de nadie: se
fabrican con el propio algoritmo y se comprueba que detecta errores de un dígito y
transposiciones), el reparto del nombre completo, los alias de ciudades de la JCE, el armado de
paradas con pagos parciales y préstamos cerrados, el orden por cercanía, el recorte de la ruta
a 10 paradas y la lectura de coordenadas pegadas desde una URL.

**Lo que no cubre una prueba automática y hay que mirar en pantalla**: la consulta real a la JCE
(hace falta la clave del proveedor), el mapa incrustado (hace falta la clave de Google), y el
recorrido completo del alta con el bloqueo de campos.
