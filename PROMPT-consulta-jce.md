# Prompt: Consulta/verificación de cédula dominicana contra la JCE (persona_segura)

Actúa como desarrollador backend senior con foco en privacidad y protección de datos.
Implementa la **verificación de una cédula dominicana** contra la base de la JCE a
través de la API externa `persona_segura` (PointSeller / CDE-Software), para
autocompletar un formulario (nombre, apellido, fecha de nacimiento, sexo, ciudad→provincia
y foto) tras el **consentimiento del titular (Ley 172-13 RD)**.

Toda la lógica de red y la API key viven **solo en el servidor**; el navegador nunca
las ve. La cédula en claro **nunca se persiste**.

## 1. Contrato de la API externa
- **Endpoint** (configurable): `POST https://psbi.me/persona.php`
- **Autenticación**: header `X-API-KEY: <clave>` (solo servidor).
- **Body**: `application/x-www-form-urlencoded` → `cedula=00112345678` (11 dígitos, sin guiones).
- **Respuesta** JSON, forma aproximada:
  ```json
  {
    "ok": true,
    "nombre_completo": "JUAN PEREZ GOMEZ",
    "fecha_nacimiento": "1985-02-27",
    "sexo": "M",
    "nacionalidad": "Dominicana",
    "EstadoCivil": "Soltero",
    "ciudad": "HIGUEY",
    "imagen_base64": "/9j/4AAQ...."
  }
  ```
  En error: `{ "ok": false, "error": "Cédula no encontrada." }`.
- Tolera variantes de nombres de campo (`estado_civil` vs `EstadoCivil`).

## 2. Flujo completo
1. **Front**: el usuario escribe la cédula (11 dígitos) y **marca el consentimiento**
   → se habilita el botón "Verificar". Al pulsar, `POST` JSON
   `{ cedula, consentimiento:true, incluir_imagen:true }` con header `X-CSRF-TOKEN`.
2. **Controlador** (endpoint público):
   - Verifica **CSRF** (header `X-CSRF-TOKEN` o body).
   - Valida longitud (8–20), **consentimiento obligatorio**, y el **dígito verificador**.
   - Llama al servicio, pasando también IP y User-Agent (para auditoría).
   - Devuelve `{ data, meta:{fuente, cached} }`; la foto va como **URL a otro endpoint**
     (`/persona-cache/{id}/imagen`), nunca embebida ni ligada a la cédula.
3. **Servicio** (cliente persona_segura), con **caché de 3 niveles**:
   - Limpia la cédula (solo dígitos), exige 11, calcula `sha256(cedula)`.
   - **Nivel 1 – BD**: busca por `cedula_hash` en `personas_cache`. Si existe → devuelve
     (incrementa contador).
   - **Nivel 2 – Filesystem**: JSON por hash con **TTL** (p.ej. 30 días). Si vigente →
     persiste en BD y devuelve.
   - **Nivel 3 – API real**: `curl POST` con `X-API-KEY` y timeout corto. Si falla el
     certificado SSL (errores cURL 35/51/58/60), **reintenta sin verificación** (CA bundle
     viejo). Parsea JSON, **normaliza**, guarda imagen, persiste (BD + FS), audita.
   - Siempre **audita** el intento (resultado, IP, UA, 16 chars del hash).
4. **Normalización** de la respuesta:
   - Divide `nombre_completo` en nombre/apellido (1→nombre; 2→n/a; 3→nombre + 2 apellidos;
     >3 → mitad/mitad).
   - `sexo` → 'M'/'F' según inicial. `fecha_nacimiento` → `Y-m-d`.
   - `ciudad` → **provincia** vía un mapa municipio→provincia (para el select de ubicación).
5. **Imagen**: `imagen_base64` → decodificar → guardar `.jpg` (nombre = hash). Opcional:
   **quitar marca de agua** con GD. Guardar solo el **nombre relativo** del archivo (portátil
   entre entornos), y resolverlo al servir. Servirla por `GET /persona-cache/{id}/imagen`
   con `Content-Type: image/jpeg` y cache privado; **jamás expone la cédula**.
6. **Front (respuesta)**: rellena nombre/apellido/fecha; fija la provincia y **dispara
   `change`** (para cascada de municipios); muestra la foto; **bloquea** (readonly) los
   campos verificados por la JCE.

## 3. Seguridad y privacidad (Ley 172-13) — reglas que NO se rompen
- **Consentimiento del titular obligatorio** en cada consulta (validado en servidor, no solo en el front).
- **La cédula en claro nunca se persiste**: en la caché se guarda `sha256`; en la auditoría, solo **16 chars** del hash.
- **API key solo server-side**; nunca llega al navegador ni a logs.
- **Auditoría** de cada consulta: resultado (`ok_cache_db`/`ok_cache_fs`/`ok_api`/`no_encontrado`/`error_red`), IP, User-Agent, hash corto, fecha.
- La **foto se sirve por id de caché**, no por cédula; con headers de caché privados.
- **CSRF** en el endpoint. Rate-limit recomendado por IP.
- Timeout corto a la API; degradar con mensaje claro si no responde.

## 4. Modelo de datos (2 tablas)
```sql
personas_cache(
  id, cedula_hash CHAR(64) UNIQUE, nombre, apellido, fecha_nacimiento DATE,
  sexo ENUM('M','F'), nacionalidad, estado_civil, ciudad, imagen_path,
  fuente, consultas_count, ultima_consulta_en, creado_en
)
persona_lookups( -- auditoría
  id, cedula_hash VARCHAR(16), resultado, fuente, ip, user_agent, created_at
)
```

## 5. Validación del dígito verificador (cédula RD)
```
digits = solo números; debe medir 11.
suma = 0
para i en 0..9:
   m = digit[i] * (i par ? 1 : 2)
   si m > 9: m -= 9
   suma += m
check = (10 - (suma % 10)) % 10
válida si check == digit[10]
```

## 6. Variables de entorno
```
PERSONA_SEGURA_URL=https://psbi.me/persona.php
PERSONA_SEGURA_KEY=<clave — solo servidor>
PERSONA_SEGURA_CACHE_DIAS=30
PERSONA_SEGURA_TIMEOUT=8
PERSONA_SEGURA_SSL_VERIFY=1
JCE_REMOVE_WATERMARK=1
```

## 7. Endpoints
- `POST /afiliacion/lookup-cedula` → verificación (JSON in/out, CSRF).
- `GET  /persona-cache/{id}/imagen` → foto cacheada (image/jpeg, sin cédula).

## 8. Archivos de referencia (implementación real en GenVerde, PHP MVC)
| Rol | Archivo |
|---|---|
| Endpoint HTTP (verificar + servir imagen) | `app/controllers/LookupController.php` |
| Cliente + caché 3 niveles + normalización + auditoría | `app/services/PersonaSeguraService.php` |
| Caché en BD (nunca cédula en claro) | `app/models/PersonaCache.php` |
| Auditoría de consultas | `app/models/PersonaLookup.php` |
| Dígito verificador | `app/helpers/Validator.php::validCedula()` |
| Ciudad → provincia | `app/helpers/Geo.php` |
| Quitar marca de agua (GD) | `app/helpers/WatermarkRemover.php` |
| Front (fetch, consentimiento, autollenado, bloqueo) | `assets/js/persona-lookup.js` |
| Rutas | `index.php` |
| Config | `.env` (claves `PERSONA_SEGURA_*`, `JCE_*`) |

## 9. Gotchas ya vividos
1. **Reintento SSL**: en hosting con CA bundle viejo, cURL falla (51/58/60); reintentar sin verificación evita quedarte sin servicio.
2. **Ruta de imagen portátil**: guardar solo el nombre del archivo (no ruta absoluta) para que funcione al mover dev→producción; resolver por `basename` contra la carpeta actual.
3. **Autollenado que no cascada**: al fijar el `<select>` de provincia por JS, **dispara `change`** o el municipio dependiente no se llena.
4. **No confíes solo en el front**: consentimiento y dígito verificador se revalidan en el servidor.
5. **Nunca** loguees la cédula completa ni la API key.

## Stack objetivo
[Indica tu stack: Laravel / Node / PHP MVC / etc. Adapta controlador, servicio y persistencia;
el contrato de la API, la caché de 3 niveles, la privacidad y la validación son iguales.]
