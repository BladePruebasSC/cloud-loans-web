# CRM de Clientes — ProPréstamos

Módulo nuevo en **`/crm`** (menú lateral → *CRM*). Califica a cada cliente con un **score de 0 a
1000 puntos** a partir de su comportamiento real de pago, lo clasifica en **Frío / Tibio / Caliente**,
detecta a quién hay que contactar hoy y muestra estadísticas de venta por cliente. Se integra con el
módulo de **Seguimiento de Cobro** existente (no lo duplica).

---

## Cómo se calcula el score

Fuente única: [`src/utils/clientScoring.ts`](src/utils/clientScoring.ts). Es una función pura (sin
base de datos) cubierta por 32 pruebas.

| Componente | Máx. | Qué mide |
|---|---|---|
| **Puntualidad** | 400 | % de cuotas pagadas en fecha. Se analiza **cuota por cuota** (pagos agrupados por fecha de vencimiento). Los pagos parciales se ponderan por monto. Pagar dentro del período de gracia cuenta medio punto. Se penalta además la *magnitud* del atraso (2 días tarde ≠ 45 días tarde). Con pocas cuotas el resultado se comprime hacia el centro (menos confianza). |
| **Estado actual** | 250 | ¿Está atrasado **hoy**? Al día = 250 · 1–7 d = 200 · 8–15 d = 150 · 16–30 d = 90 · 31–60 d = 40 · >60 d = 0. Sin deuda activa pero con préstamos completados = 200. |
| **Historial** | 200 | Préstamos completados (35 c/u, máx. 100), antigüedad como cliente (2,5/mes, máx. 60), cantidad de préstamos (10 c/u, máx. 40). |
| **Volumen** | 150 | Negocio total generado (préstamos + ventas POS + empeños) en escala logarítmica: RD$10k ≈ 90, RD$100k ≈ 115, RD$1M = 150. |

### Categorías

| | Score | Significado / acción sugerida |
|---|---|---|
| 🔥 **Caliente** | ≥ 700 | Cliente ejemplar. Renovar, ofrecer más, retener. |
| 🌤️ **Tibio** | 450–699 | Cumple con altibajos. Seguimiento preventivo. |
| 🧊 **Frío** | < 450 | Riesgo alto o desinterés. Cobranza activa o no renovar. |
| ✨ **Nuevo** | — | Sin historial. Se califica tras sus primeros pagos. |

La categoría puede **anularse a mano** desde la ficha (se muestra la manual, marcada como *(manual)*;
el score se sigue calculando).

### Comportamiento de pago y riesgo

- **Puntual** (≥ 90 % en fecha) · **Ocasionalmente tarde** (≥ 70 %) · **Frecuentemente tarde** (≥ 40 %) · **Moroso** (< 40 % o > 60 días de atraso hoy) · **Sin historial**.
- **Riesgo bajo / medio / alto** según atraso actual y comportamiento.

### Banderas de atención (accionables)

| Bandera | Cuándo |
|---|---|
| Atrasado sin contacto reciente | Atrasado hoy y sin seguimiento registrado en 7 días |
| Contacto programado | Un seguimiento tiene `próximo contacto` hoy o vencido |
| Mora alta | La mora acumulada supera una cuota completa |
| Oportunidad de renovación | Cliente Caliente/Tibio al día con préstamo ≥ 80 % pagado |
| Reactivación | Buen historial, sin préstamo activo, sin actividad ≥ 90 días |
| Sin primer pago | Préstamo activo y aún no registra ningún pago |

---

## Pantallas

**Clientes** — buscador (nombre, cédula, teléfono, etiqueta), filtros por categoría, orden por score /
atraso / negocio / tiempo sin pagar. Cada fila: categoría, barra de score, comportamiento, préstamos
activos, saldo, atraso hoy, negocio total, y acciones rápidas: **llamar**, **registrar seguimiento**,
**registrar pago**, **ficha**.

**Seguimiento** — tres listas de trabajo diario:
1. *Requieren contacto* — atrasados sin seguimiento en 7 días.
2. *Contactos programados* — próximos contactos vencidos u hoy (salen de `collection_tracking`).
3. *Oportunidades comerciales* — renovación y reactivación.

**Estadísticas** — distribución por categoría, valor por categoría (negocio, intereses, saldo), top 10
por negocio generado, top 10 por intereses pagados, ranking completo ordenable y **exportación CSV**.

**Ficha del cliente** — desglose del score por componente, 16 métricas de comportamiento de pago
(puntualidad, atraso promedio y máximo, mora, último pago, antigüedad…), préstamos con atraso y mora,
últimos 15 pagos con días de atraso de cada uno, línea de tiempo de seguimientos de **todos** sus
préstamos, y gestión CRM (categoría manual, etiquetas, notas).

---

## Integración con el resto del sistema

- **Seguimiento de Cobro**: el CRM lee `collection_tracking` para calcular contactos pendientes y
  reutiliza el componente `CollectionTracking` tal cual para registrar nuevos seguimientos desde la
  ficha o desde la lista. Bitácora única, sin duplicar datos.
- **Préstamos**: los botones "Registrar pago" abren `/prestamos?action=payment&loanId=…` (el mismo
  enlace que usan las notificaciones).
- **Clientes**: el score se guarda en `clients.credit_score` (campo que existía pero nadie llenaba),
  así que la pantalla de Clientes ya lo muestra. Se añadió un botón **CRM** en cada tarjeta que abre
  la ficha (`/crm?client=<id>`), y los umbrales de color se alinearon con el CRM (700 / 450).
- **Ventas POS y empeños** cuentan para el volumen de negocio (`sales.client_id`, `pawn_transactions.client_id`).

---

## Instalación

1. **Aplicar la migración** [`supabase/migrations/20260828100000_create_client_crm_profiles.sql`](supabase/migrations/20260828100000_create_client_crm_profiles.sql).
   Crea `client_crm_profiles` (snapshot del score + categoría manual, etiquetas, notas) con RLS
   multi-empresa usando `get_user_company_id()`.
   *Sin la migración el CRM funciona igual en memoria, pero no guarda categorías manuales, etiquetas ni notas; muestra un aviso.*
2. **Permisos de empleados**: nuevos `crm.view` y `crm.edit` en *Mi Empresa → Empleados*. Los
   **dueños** entran siempre; los **empleados** no ven el módulo hasta que se les otorgue `crm.view`
   (decisión deliberada: el score es información sensible).

---

## Notas técnicas

- Datos cargados en 6 consultas por lotes de 150 IDs ([`src/hooks/useClientCRM.tsx`](src/hooks/useClientCRM.tsx)); el cálculo es en cliente. Para carteras de miles de préstamos sigue siendo razonable; si crece mucho, el siguiente paso sería una función SQL que devuelva agregados por cliente.
- La persistencia es en segundo plano y solo escribe los perfiles cuyo score/categoría cambió.
- `sales` tiene RLS por usuario (no por empresa): si las ventas las registró otro usuario de la empresa, pueden no verse en el volumen. Se tolera el error y el CRM sigue funcionando.
- Las fechas se comparan siempre como `YYYY-MM-DD` en zona de Santo Domingo, igual que el resto de la aplicación tras la auditoría.

## Archivos

Nuevos: `src/utils/clientScoring.ts`, `src/hooks/useClientCRM.tsx`, `src/components/crm/{CRMModule,ClientCRMDetail,CRMStatistics,ScoreBadge}.tsx`, migración `20260828100000`.
Modificados: `App.tsx`, `pages/Index.tsx`, `components/Sidebar.tsx`, `components/company/EmployeesModule.tsx`, `components/clients/ClientsModule.tsx`.
