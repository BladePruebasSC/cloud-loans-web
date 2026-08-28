# Módulo de Cobranza Legal e Intimación — Análisis, diseño e implementación

> **Estado: IMPLEMENTADO** (Fases 1–5). Este documento conserva la auditoría y el diseño; la
> sección *Implementación* al final resume qué se construyó, cómo instalarlo y cómo probarlo.

## Implementación (resumen ejecutivo)

**Ruta:** menú *Cobranza Legal* → `/cobranza` (Dashboard · Bandeja de cobranza · Casos legales ·
Intimaciones), `/cobranza/casos/:id` (CRM del caso). Configuración en *Mi Empresa → Cobranza legal*.

**Instalación (en este orden):**
1. `supabase/migrations/20260829000000_legal_collection_schema.sql` — columnas nuevas
   (`loans.collection_stage`, campos de cobranza en `collection_tracking`, `documents.legal_case_id`,
   configuración en `company_settings`), 9 tablas nuevas, índices, RLS, bucket privado
   `legal-evidence`, trigger de auditoría inmutable, flujo base de transiciones.
2. `supabase/migrations/20260829000001_legal_collection_functions.sql` — 25 funciones `legal_*`
   (elegibilidad, apertura, transiciones, promesas, aprobación, emisión, notificación, tareas,
   documentos, cierre, escalamiento, configuración, barrido) y 3 triggers de integración
   (pagos, gestiones). Recalcula la etapa de todos los préstamos activos al aplicarse.
3. Otorgar permisos `legal.*` a los empleados en *Mi Empresa → Empleados* (los dueños y el rol
   `admin` entran siempre).
4. Revisar con el asesor legal *Mi Empresa → Cobranza legal*: umbrales, plazos, checklist y la
   **plantilla de la carta** (la inicial es neutra y está marcada como pendiente de revisión).

**Pruebas:**
- `supabase/tests/legal_workflow_test.sql` — 40 comprobaciones del backend (elegibilidad, apertura,
  duplicados, transiciones, promesa → incumplimiento por barrido, solicitud → revisión → aprobación
  → emisión → notificación → plazo → vencimiento, pago parcial, auditoría inmutable, cierre,
  aislamiento entre empresas, permisos). Se ejecuta en un proyecto de prueba y hace `ROLLBACK`.
- 31 pruebas TypeScript de los helpers puros (semáforos, próxima acción, errores, plantilla).
- `tsc` 0 errores · `npm run build` OK.

**Archivos:** `src/utils/legalWorkflow.ts`, `src/utils/intimationDocument.ts`,
`src/hooks/useLegalCases.tsx`, `src/components/legal/{LegalModule,LegalCaseView,IntimationPanel,
OpenCaseDialog,LegalSettingsTab,LoanCollectionCard,LegalBadges}.tsx`. Modificados: `App.tsx`,
`pages/Index.tsx` (+ alineación del rol `admin`), `Sidebar.tsx`, `EmployeesModule.tsx`
(permisos), `LoanDetailsView.tsx` (tarjeta *Cobranza / Legal*), `Notifications.tsx` (6 tipos
nuevos), `CompanySettings.tsx` (pestaña), `CollectionTracking.tsx` (resultado, persona
contactada, promesa; tipos WhatsApp/reunión/notificación), `LoanForm.tsx` (exporta el motor PDF).

**Lo que NO se hizo (y por qué):** búsqueda global (no existe en el sistema; el buscador de
Casos cubre cliente, cédula, expediente, intimación y préstamo); notificaciones persistentes
(la tabla `notifications` está huérfana; se siguió el patrón calculado existente); Edge
Functions (innecesarias: la validación vive en funciones SQL `SECURITY DEFINER`).

---

---

# FASE 1 — AUDITORÍA DEL SISTEMA EXISTENTE

## 1. Stack

| Capa | Tecnología | Observación |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite, React Router 6, shadcn/ui (Radix), Tailwind, Recharts, react-hook-form + zod, jsPDF | SPA. Todo el código de negocio vive en `src/components/**` y `src/utils/**` |
| Backend | **Supabase**: PostgreSQL + RLS, funciones `plpgsql SECURITY DEFINER`, triggers, Realtime, Storage, 4 Edge Functions (Deno) | **No existe un servidor de aplicación.** "Validar en backend" = RLS + funciones SQL (RPC) |
| Auth | Supabase Auth. `useAuth` resuelve `companyId` (= `auth.uid()` del dueño; para empleados `employees.company_owner_id`) | Multi-empresa por dueño |
| Despliegue | Netlify (SPA redirect), Supabase hosted | — |

## 2. Arquitectura

- **Rutas**: `App.tsx` registra cada ruta apuntando a `pages/Index.tsx`, que hace un `switch(pathname)` y decide el módulo + permiso. Rutas con parámetro se resuelven con regex (`/clientes/editar/:id`).
- **Módulos**: un componente grande por módulo en `src/components/<modulo>/`, con su propio fetch a Supabase (no hay capa de servicios; `src/services/` tiene un solo archivo mínimo).
- **Menú**: `Sidebar.tsx` con `permission` por ítem.
- **Alcance de datos**: siempre por empresa → `clients.user_id = companyId`, `loans.loan_officer_id = companyId`, `documents.user_id = companyId`, `payments.company_id`. En SQL: helper `get_user_company_id()`.
- **Utilidades transversales** (creadas en la auditoría anterior): `frequencyUtils.ts` (fechas/períodos), `dateUtils.ts` (zona Santo Domingo), `clientScoring.ts` (CRM), `installmentLateFeeCalculator.ts` (mora).

## 3. Tablas existentes relacionadas

| Tabla | Rol en este módulo | Reutilizable |
|---|---|---|
| `clients` | Cliente (nombre, dni, phone, email, address, city, credit_score, references_json, workplace…) | ✅ tal cual |
| `loans` | Préstamo. `status ∈ {pending, active, overdue, paid, deleted}` (CHECK). `next_payment_date`, `remaining_balance`, `current_late_fee`, `grace_period_days`, `guarantor_*`, `collateral` | ✅ tal cual + **1 columna nueva** (ver diseño) |
| `installments` | Cuotas: `due_date`, `is_paid`, `paid_date`, montos | ✅ para "cuotas vencidas" y "monto vencido" |
| `payments` | Pagos: `due_date`, `payment_date`, montos | ✅ para historial y último pago |
| `collection_tracking` | **Gestiones de cobro** ya existentes: `contact_type (phone/email/sms/visit/letter/other)`, `contact_date/time`, `client_response`, `next_contact_date`, `created_by`. RLS por empresa. Lo usan LoansModule, Notifications, CRM | ✅ **extender** (faltan resultado, contactado, persona, promesa) |
| `payment_agreements` | **Acuerdos de pago formales** con aprobación (`pending/approved/active/rejected/completed/cancelled`, `approved_by`) | ✅ reutilizar como salida "Acuerdo de pago" del caso |
| `documents` + bucket `documents` | Archivos: `document_type` libre (`contract`, `receipt`, `identification`, `loan_document`, `general`), `file_url` = ruta en Storage, `tags[]`, `loan_id`, `client_id` | ✅ **extender** con `legal_case_id` y tipos nuevos. ⚠️ ver seguridad |
| `guarantees` | Garantías (vehículo/inmueble/otro) por préstamo | ✅ para elegibilidad |
| `loan_history` | Historial de cambios del préstamo (`change_type` con CHECK cerrado; políticas UPDATE/DELETE abiertas; `PaymentActions` lo borra) | ⚠️ **No sirve como auditoría legal** (es mutable). Se escribirá en él solo el `status_change` del préstamo para que el historial del préstamo lo refleje |
| `late_fee_history` | Historial de mora | ✅ lectura |
| `client_crm_profiles` | Score/categoría CRM | ✅ el score alimenta la elegibilidad ("historial de pagos") |
| `company_settings` | Config por empresa (`default_*`, `notify_*`, **`document_templates JSONB`**) | ✅ patrón para configuración y plantillas |
| `employees` | `role ∈ {admin, manager, collector, accountant, employee}` + `permissions JSONB` | ✅ base de permisos |
| `notifications` | Existe en `types.ts` (user_id, title, message, type, category, read, action_url, metadata) pero **no está en migraciones y ningún código la usa** | ⚠️ opcional |

No existen: tareas, promesas de pago informales, casos legales, intimaciones, aprobaciones genéricas, plantillas versionadas, búsqueda global.

## 4. Componentes reutilizables

- `CollectionTracking` (diálogo completo de gestiones) — se reutiliza tal cual desde el caso, como ya hace el CRM.
- `PasswordVerificationDialog` — confirmación con contraseña para acciones sensibles (borrar, cerrar caso, emitir).
- `LoanDetailsView` / `AccountStatement` — para el resumen financiero del caso (no reimplementar el cálculo de mora/saldo: usar `getLateFeeBreakdownFromInstallments` y `getLoanBalanceBreakdown`).
- Generación de PDF: `LoanForm.tsx` tiene `generateDocumentPDF` con **placeholders** (`{cliente_nombre}`, `{cliente_dni}`, `{monto}`, `{saldo_pendiente}`, `{mora_pendiente}`, `{fecha_limite}`, `{empresa_nombre}`, …) y toma la plantilla de `company_settings.document_templates[tipo]`. Se **extrae a `src/utils/documentTemplates.ts`** para compartirla (hoy está atrapada dentro del formulario de préstamos).
- `whatsappReceipt.ts` / `whatsappUtils.ts` — envío por WhatsApp (para registrar gestión + enviar aviso).
- UI: `Card`, `Badge`, `Tabs`, `Dialog`, `Select`, `Textarea`; tablas HTML planas (no hay `ui/table`); KPIs y `ScoreMeter` del CRM.

## 5. Autenticación

Supabase Auth + `useAuth` (perfil, `is_employee`, `role`, `permissions`, `companyId`). Sin cambios.

## 6. Roles y permisos

- **Dueño** (no está en `employees`): todo. `Index.hasPermission` devuelve `true` si `!is_employee`.
- **Empleado**: `permissions[key] === true`. Claves con patrón `modulo.accion` (`loans.view`, `agreements.edit`, `requests.approve`…), definidas en `PERMISSIONS_CONFIG` de `EmployeesModule.tsx`.
- ⚠️ **Inconsistencia existente**: `Sidebar.hasPermission` da acceso total a `role === 'admin'`, pero `Index.hasPermission` no. Un admin ve el ítem del menú y luego "Acceso restringido" si no tiene la clave. El módulo nuevo usará claves explícitas y, además, recomiendo alinear `Index` con `Sidebar` (cambio de una línea, lo dejo como opcional).
- ⚠️ **Los permisos hoy solo se validan en frontend**: RLS limita por empresa, no por permiso. Para este módulo, las acciones sensibles se validarán **en SQL** (ver diseño §Seguridad).

## 7. Auditoría

Solo `loan_history` (mutable, ámbito préstamo) y `late_fee_history`. **No hay auditoría inmutable.** El módulo necesita una propia (`legal_case_events`, append-only).

## 8. Archivos / documentos

- Bucket `documents` **público para lectura** (`public = true`, política "Public read access"). Ruta `user-{companyId}/loans/{loanId}/…`.
- ⚠️ Las políticas de Storage solo autorizan la carpeta `user-{auth.uid()}`, pero la app sube a `user-{companyId}`: **los empleados no pueden subir archivos** hoy (solo el dueño). Limitación existente, no la introduce este módulo, pero afecta a "evidencias": hay que resolverla para el bucket nuevo.
- Para **evidencia legal** (fotos de entrega, acuses, PDFs firmados) un bucket público es inaceptable → bucket privado + URLs firmadas (ver diseño).

## 9. Notificaciones

`Notifications.tsx` **calcula en memoria** al abrir la campana: préstamos vencidos, próximos a vencer, `follow_up_due` (desde `collection_tracking.next_contact_date`), mora crítica. No persiste, no hay push. Navega con `?action=payment|tracking&loanId=`. Patrón a seguir: **añadir tipos calculados** (`legal_*`). La tabla `notifications` existe pero está huérfana; formalizarla es opcional para eventos "de asignación" (fase posterior).

## 10. Qué hace falta realmente crear

| Necesidad | ¿Existe? | Decisión |
|---|---|---|
| Etapa de cobranza del préstamo | No (solo `active/overdue`) | **Columna nueva `loans.collection_stage`**; NO tocar `loans.status` (lo usan triggers SQL, mora, listados, ordenamientos) |
| Caso legal, intimación, notificación de intimación, aprobación, tareas, promesas, eventos | No | **Tablas nuevas** |
| Gestiones | Sí (`collection_tracking`) | **Extender columnas** |
| Documentos del caso | Sí (`documents`) | **Extender** (`legal_case_id`, tipos) + bucket privado para evidencia |
| Acuerdo formal | Sí (`payment_agreements`) | Reutilizar; el caso enlaza al acuerdo |
| Plantilla de intimación | Sí (`document_templates` + placeholders) | Reutilizar; nueva clave `intimacion`; extraer util compartida |
| Configuración de umbrales | Patrón sí (`company_settings`) | Columnas nuevas + tabla de transiciones |
| Auditoría inmutable | No | `legal_case_events` sin políticas UPDATE/DELETE |
| Notificaciones | Calculadas | Extender `Notifications.tsx` |
| Validación backend | Solo RLS por empresa | Funciones SQL `SECURITY DEFINER` con chequeo de permiso |

---

# FASE 2 — DISEÑO TÉCNICO

## Principios

1. **`loans.status` no cambia de significado.** La etapa de cobranza vive en `loans.collection_stage` (etapas previas al caso) y en `legal_cases.status` (desde pre-legal en adelante). Así ningún cálculo financiero existente se ve afectado.
2. **Toda transición de estado pasa por una función SQL** (`legal_case_transition`) que valida permiso, transición permitida y precondiciones, y escribe el evento. El frontend nunca hace `UPDATE legal_cases SET status`.
3. **Workflow configurable en datos**: umbrales en `company_settings`, transiciones permitidas en `legal_stage_transitions` (editable por admin).
4. **Nada legal hardcodeado**: plazos, textos y checklist documental son configuración por empresa con valores iniciales editables.
5. **Auditoría append-only**: `legal_case_events` no tiene políticas de UPDATE/DELETE; solo inserta el sistema.

## Entidades

### Cambios en tablas existentes (aditivos, seguros)

```sql
-- loans: etapa de cobranza (nullable → compatible con datos actuales)
ALTER TABLE loans ADD COLUMN collection_stage TEXT
  CHECK (collection_stage IN ('al_dia','cuota_vencida','mora','cobranza_preventiva',
         'cobranza_administrativa','cobranza_intensiva','pre_legal','legal'));
ALTER TABLE loans ADD COLUMN collection_stage_since DATE;

-- collection_tracking: campos de gestión de cobranza
ALTER TABLE collection_tracking
  ADD COLUMN legal_case_id UUID REFERENCES legal_cases(id),
  ADD COLUMN result TEXT CHECK (result IN ('contacted','no_answer','wrong_number','not_located',
        'payment_promise','refuses','requests_negotiation','payment_made','agreement','escalate','other')),
  ADD COLUMN contacted BOOLEAN,
  ADD COLUMN contacted_person TEXT,
  ADD COLUMN promise_amount NUMERIC(14,2),
  ADD COLUMN promise_date DATE;
-- contact_type: ampliar CHECK con 'whatsapp', 'meeting', 'notification'

-- documents: vínculo al caso
ALTER TABLE documents ADD COLUMN legal_case_id UUID REFERENCES legal_cases(id);
-- document_type nuevos (texto libre, sin CHECK): 'legal_contract','legal_evidence',
-- 'legal_intimation','legal_notification_proof','legal_statement'

-- company_settings: configuración de cobranza
ADD COLUMN collection_days_preventive INT DEFAULT 1,
ADD COLUMN collection_days_administrative INT DEFAULT 8,
ADD COLUMN collection_days_intensive INT DEFAULT 30,
ADD COLUMN collection_days_prelegal INT DEFAULT 60,
ADD COLUMN legal_min_days_overdue INT DEFAULT 60,
ADD COLUMN legal_min_amount NUMERIC(14,2) DEFAULT 0,
ADD COLUMN legal_min_broken_promises INT DEFAULT 1,
ADD COLUMN legal_min_contacts INT DEFAULT 3,
ADD COLUMN legal_intimation_deadline_days INT DEFAULT 10,
ADD COLUMN legal_followup_days INT DEFAULT 3,
ADD COLUMN legal_escalation_days INT DEFAULT 5,
ADD COLUMN legal_required_documents JSONB DEFAULT
  '["contract","identification","statement","collection_evidence"]',
ADD COLUMN legal_require_notification_evidence BOOLEAN DEFAULT true
```
> Los valores por defecto son **operativos, no jurídicos**; el administrador los ajusta. La UI lo dirá explícitamente.

### Tablas nuevas

**`legal_cases`** — el expediente
```
id, company_id, client_id, loan_id, case_number ('EXP-2026-0001', único por empresa),
case_type ('collection' | 'legal'), status (ver estados), priority ('low'|'medium'|'high'|'critical'),
claimed_amount, paid_amount, pending_amount  -- snapshot al abrir; pending se recalcula
entered_stage_at, last_action_at, next_action_at, next_action_note,
assigned_to (uuid), lawyer_id (uuid, opcional), reason, notes,
agreement_id (→ payment_agreements, opcional), opened_by, opened_at,
closed_at, closed_by, close_reason ('full_payment'|'payment_agreement'|'restructuring'|
  'cancellation'|'administrative_error'|'judicial_escalation'|'other'), close_notes,
duplicate_justification (texto obligatorio si ya existía caso activo), created_at, updated_at
```
Restricción anti-duplicados: **índice único parcial** `(loan_id) WHERE status NOT IN ('closed','resolved')`; la función de apertura permite saltarlo solo con permiso `legal.override_duplicate` + justificación (cierra el anterior como `administrative_error`… o lo deja y registra vínculo `superseded_case_id`; propongo lo segundo).

**`legal_case_events`** — timeline + auditoría (append-only)
```
id, case_id, company_id, event_type, occurred_at, actor_id, description, result,
old_status, new_status, data JSONB (ids relacionados: tracking_id, promise_id, intimation_id,
document_id, task_id, approval_id), created_at
```
Sin políticas UPDATE/DELETE. Se inserta solo desde funciones SQL (`SECURITY DEFINER`) → el cliente no puede escribir eventos arbitrarios.

**`collection_promises`** — promesas de pago
```
id, case_id (nullable: puede existir antes del caso), loan_id, client_id, company_id,
tracking_id (gestión que la originó), amount, promised_date, actual_payment_date,
status ('pending'|'fulfilled'|'broken'|'cancelled'), notes, created_by, created_at, resolved_at
```
Se cumple automáticamente cuando entra un pago ≥ monto en/antes de la fecha (trigger en `payments`); se incumple por el barrido diario (`legal_sweep`) pasado el día → evento `promise_broken`.

**`legal_approvals`** — flujo solicitud → revisión → aprobación
```
id, case_id, intimation_id (nullable), company_id, approval_type ('intimation'|'escalation'|'closure'),
status ('requested'|'reviewed'|'approved'|'rejected'|'cancelled'),
requested_by, requested_at, request_notes,
reviewed_by, reviewed_at, review_notes,
decided_by, decided_at, decision_notes (motivo de rechazo obligatorio si rejected)
```

**`legal_intimations`**
```
id, case_id, company_id, intimation_number ('INT-2026-0001'), approval_id,
status ('draft'|'pending_approval'|'approved'|'issued'|'notified'|'not_notified'|
        'expired'|'responded'|'closed'),
claimed_amount, breakdown JSONB (capital, interés, mora, cargos, cuotas vencidas — snapshot),
template_key, content TEXT (texto final renderizado — snapshot inmutable tras emisión),
created_at, issued_at, issued_by, notified_at, deadline_date, responded_at, response_notes,
document_id (PDF generado en `documents`), responsible_id, notes
```

**`legal_intimation_notifications`** — cada intento de notificación
```
id, intimation_id, company_id, notified_at (timestamptz), method ('physical'|'courier'|
'certified_mail'|'notary'|'email'|'whatsapp'|'other'), notified_by (texto: persona que notifica),
received_by (texto), result ('delivered'|'refused'|'absent'|'wrong_address'|'other'),
evidence_document_id (→ documents), notes, created_by, created_at
```
Si `legal_require_notification_evidence` está activo, la función rechaza `result='delivered'` sin `evidence_document_id`.

**`legal_case_tasks`**
```
id, case_id, company_id, title, description, task_type (catálogo sugerido), assigned_to,
due_date, priority, status ('pending'|'in_progress'|'completed'|'cancelled'|'overdue'),
completed_at, completed_by, created_by, created_at, updated_at
```

**`legal_stage_transitions`** — workflow configurable
```
id, company_id (NULL = plantilla global por defecto), from_status, to_status,
required_permission TEXT, requires_approval BOOLEAN, requires_complete_file BOOLEAN,
requires_reason BOOLEAN, enabled BOOLEAN
```
Se siembra con el flujo base; el admin puede deshabilitar/añadir transiciones sin código.

**`legal_case_checklist`** — estado del expediente pre-legal (una fila por ítem)
```
id, case_id, item_key ('contract'|'identification'|'contact_data'|'address'|'payment_history'|
'statement'|'collection_evidence'|'broken_promises'|'other'), satisfied BOOLEAN,
auto_detected BOOLEAN, document_id (nullable), verified_by, verified_at, notes
```
Los ítems "auto" se calculan (hay contrato en `documents`, cliente tiene dirección/teléfono, hay ≥N gestiones, hay promesa incumplida); el usuario puede marcar/verificar manualmente los demás.

### Relación con `payment_agreements`
Al cerrar con `payment_agreement`, el caso guarda `agreement_id`. La creación del acuerdo se hace con el módulo de Acuerdos existente (se abre desde el caso con el préstamo preseleccionado).

## Estados

### `loans.collection_stage` (automático, calculado por barrido)
`al_dia → cuota_vencida (1 d) → mora (> gracia) → cobranza_preventiva (≥ días_prev) → cobranza_administrativa → cobranza_intensiva → pre_legal (manual o ≥ días_prelegal) → legal (caso abierto)`
Cuando se paga y queda al día, vuelve a `al_dia` (salvo que haya caso abierto: el caso decide).

### `legal_cases.status` (mapeo 1:1 con los estados solicitados)

| Solicitado | Valor | Quién lo provoca |
|---|---|---|
| PRE_LEGAL | `pre_legal` | apertura del caso |
| PENDIENTE_APROBACION_LEGAL | `pending_legal_approval` | solicitud de intimación |
| INTIMACION_EN_PREPARACION | `intimation_preparing` | aprobación |
| INTIMACION_EMITIDA | `intimation_issued` | emisión |
| INTIMACION_NOTIFICADA | `intimation_notified` | notificación con resultado entregado |
| EN_PERIODO_DE_PLAZO | `in_deadline_period` | automático tras notificar |
| PROMESA_DE_PAGO | `payment_promise` | promesa activa registrada |
| ACUERDO_DE_PAGO | `payment_agreement` | acuerdo formal creado |
| PAGO_PARCIAL | `partial_payment` | trigger de pagos |
| PAGADO | `paid` | trigger de pagos (saldo 0) |
| CASO_RESUELTO | `resolved` | cierre positivo |
| ESCALADO_A_LEGAL | `escalated` | aprobación de escalamiento |
| PROCESO_JUDICIAL | `judicial` | manual (legal) |
| SUSPENDIDO | `suspended` | manual con motivo |
| CERRADO | `closed` | cierre con motivo |

`ACTIVO`, `AL_DIA`, `CUOTA_VENCIDA`, `MORA`, `COBRANZA_*` son etapas del **préstamo** (`collection_stage`), no del caso: no se duplican.

### Estados de intimación, promesa, tarea, aprobación: ver tablas.

## Workflow (funciones SQL — el "backend")

| Función | Hace | Valida |
|---|---|---|
| `legal_has_permission(key)` | dueño → true; empleado → `permissions->>key = 'true'` | — |
| `legal_evaluate_eligibility(loan_id) → jsonb` | `{status: 'eligible'\|'not_eligible'\|'pending_review', reasons[], blockers[], metrics{}}` con días de mora, cuotas vencidas, monto vencido, promesas incumplidas, gestiones, acuerdos previos, garantías, documentos, contacto/dirección, score CRM | umbrales de `company_settings`. **No inicia nada** |
| `legal_open_case(loan_id, reason, priority, assigned_to, duplicate_justification)` | crea caso `pre_legal`, número de expediente, checklist inicial auto-detectado, snapshot financiero, evento; pone `loans.collection_stage='legal'`; escribe `loan_history(status_change)` | permiso `legal.open`; duplicado → requiere `legal.override_duplicate` + justificación |
| `legal_case_transition(case_id, new_status, reason, data)` | única vía de cambio de estado | transición existe y habilitada en `legal_stage_transitions`; permiso requerido; expediente completo si aplica; motivo si aplica; caso no cerrado |
| `legal_request_intimation(case_id, notes)` | crea `legal_approvals(requested)` + intimación `draft`; caso → `pending_legal_approval` | `legal.request_intimation`; checklist completo |
| `legal_review_approval(approval_id, notes)` / `legal_decide_approval(approval_id, approve, notes)` | revisión y decisión; aprobado → intimación `approved`, caso → `intimation_preparing`; rechazado → motivo obligatorio, caso vuelve a `pre_legal` | `legal.review` / `legal.approve` |
| `legal_issue_intimation(intimation_id, content, breakdown, document_id)` | congela contenido/desglose, número, `issued_at`; caso → `intimation_issued` | `legal.issue`; estado `approved` |
| `legal_register_notification(intimation_id, …)` | inserta intento; si entregado → intimación `notified`, `deadline_date = notified_at + días`, caso → `in_deadline_period` | evidencia obligatoria si configurado |
| `legal_register_promise(...)`, `legal_add_task(...)`, `legal_complete_task(...)`, `legal_assign_case(...)` | CRUD controlado con evento | permisos `legal.manage`, `legal.assign` |
| `legal_close_case(case_id, close_reason, notes)` | cierre; `loans.collection_stage` recalculado | `legal.close`; motivo obligatorio |
| `legal_sweep(company_id)` | idempotente, se llama al abrir el módulo (mismo patrón que `updateAllLateFees`): recalcula `collection_stage` de préstamos activos, marca promesas incumplidas, tareas vencidas, intimaciones vencidas, sugiere escalamiento (evento + alerta), y detecta pagos que resuelven el caso | — |
| Trigger `payments AFTER INSERT` | si el préstamo tiene caso abierto: actualiza `paid_amount/pending_amount`, cumple promesa si aplica, evento `payment_received`, caso → `partial_payment`/`paid` | — |

Las gestiones (`collection_tracking`) siguen insertándose desde el componente existente; un **trigger** añade el evento al caso cuando `legal_case_id` está presente o el préstamo tiene caso abierto, y crea la promesa si `result='payment_promise'`.

## Permisos (claves nuevas en `PERMISSIONS_CONFIG`, categoría "Cobranza Legal")

| Clave | Cobranza | Supervisor | Legal | Admin/Dueño |
|---|---|---|---|---|
| `legal.view` | ✅ | ✅ | ✅ | ✅ |
| `legal.manage` (gestiones, promesas, tareas, documentos) | ✅ | ✅ | ✅ | ✅ |
| `legal.open` | ✅ | ✅ | ✅ | ✅ |
| `legal.request_intimation` | ✅ | ✅ | ✅ | ✅ |
| `legal.assign` | | ✅ | ✅ | ✅ |
| `legal.review` | | ✅ | ✅ | ✅ |
| `legal.approve` | | | ✅ | ✅ |
| `legal.issue` | | | ✅ | ✅ |
| `legal.escalate` | | | ✅ | ✅ |
| `legal.close` | | ✅ | ✅ | ✅ |
| `legal.override_duplicate` | | | ✅ | ✅ |
| `legal.config` | | | | ✅ |

Los roles existentes (`collector`, `manager`, `admin`) no tienen permisos automáticos: el dueño los asigna (como hoy). Propongo un botón "Aplicar preset" en Empleados con estas tres columnas para no marcar 12 casillas a mano.

## Rutas (adaptadas a `Index.tsx`)

| Ruta pedida | Ruta propuesta | Contenido |
|---|---|---|
| `/gestion-cobranza` | `/cobranza` | Dashboard + **Bandeja de trabajo** (pestañas) |
| `/cobranza-prelegal` | `/cobranza?etapa=pre_legal` | Misma bandeja filtrada (evita otro módulo) |
| `/casos-legales` | `/cobranza/casos` | Listado de expedientes |
| `/casos-legales/:id` | `/cobranza/casos/:id` | **CRM del caso** |
| `/intimaciones` | `/cobranza/intimaciones` | Listado de intimaciones + plazos |
| `/intimaciones/:id` | `/cobranza/casos/:id?tab=intimacion` | La intimación vive dentro del caso |
| Configuración | `/mi-empresa` → nueva pestaña "Cobranza legal" | Umbrales, transiciones, plantilla, checklist |

Menú: ítem **"Cobranza Legal"** (icono `Gavel`) con permiso `legal.view`.

## Pantallas

1. **Dashboard** — KPIs (total casos, nuevos, pre-legal, intimaciones pendientes/emitidas/notificadas/vencidas, con promesa, escalados, resueltos, monto en proceso, monto recuperado), distribución por estado (Recharts, mismo estilo que el CRM), alertas (vencen pronto, vencidas, tareas vencidas, sin seguimiento N días, sin responsable).
2. **Bandeja de trabajo** — préstamos en etapas de cobranza + casos. Filtros: estado, etapa, responsable, abogado, prioridad, rango de mora, monto, próxima gestión, fecha límite. Orden: monto, mora, prioridad, fecha límite, antigüedad. Acciones rápidas: gestión, promesa, ver caso, abrir caso (si elegible).
3. **Caso (CRM)** — estructura exacta pedida: cabecera (cliente/préstamo, estado, prioridad, responsable, días de mora), resumen financiero (saldo, vencido, cuotas vencidas, último pago, próxima cuota, interés, mora, cargos — con los motores existentes), **timeline**, pestañas **Gestiones | Promesas | Intimación | Documentos | Tareas | Aprobaciones**, panel **Próxima acción** (calculada: p. ej. "Contactar", "Solicitar intimación (expediente completo)", "Registrar notificación", "Vence en 3 días", "Escalar"). Semáforo de plazo verde/amarillo/rojo (umbral amarillo = `legal_followup_days`).
4. **Pre-legal (dentro del caso)** — checklist con auto-detección + marcado manual, "EXPEDIENTE COMPLETO / INCOMPLETO" con faltantes; botón "Solicitar intimación" habilitado solo si completo.
5. **Intimación** — solicitud, estado de aprobación (quién/cuándo/motivo), editor del contenido a partir de la plantilla con placeholders, vista previa, **emitir** (genera PDF con jsPDF, lo guarda en `documents` como `legal_intimation`, congela contenido), registro de notificaciones con evidencia, plazo y días restantes.
6. **Integración en el préstamo** — nueva tarjeta "Cobranza / Legal" en `LoanDetailsView`: etapa, días de mora, caso activo (enlace), última gestión, promesa vigente, próxima acción, botones "Registrar gestión" / "Abrir caso" (si elegible, con las razones). Badge de etapa en el listado de préstamos.
7. **Configuración** — pestaña en Mi Empresa: umbrales de días/montos, plazo de intimación, seguimiento, escalamiento, checklist requerido, evidencia obligatoria, transiciones habilitadas, **plantilla de intimación** (editor de texto con lista de placeholders disponibles; texto inicial neutro: "Plantilla pendiente de revisión por asesor legal", sin lenguaje jurídico).
8. **Notificaciones** — nuevos tipos calculados en `Notifications.tsx`: `legal_approval_pending`, `legal_deadline_soon`, `legal_deadline_overdue`, `legal_task_overdue`, `legal_promise_broken`, `legal_escalation_suggested`, `legal_case_assigned` (este último requiere leer `legal_case_events` del usuario, sin tabla nueva).

## Seguridad

- RLS por empresa en todas las tablas nuevas (`company_id = get_user_company_id()`), **solo SELECT** para el cliente en `legal_cases`, `legal_intimations`, `legal_approvals`, `legal_case_events`; INSERT/UPDATE exclusivamente vía funciones `SECURITY DEFINER` que verifican `legal_has_permission`. Tareas, promesas y checklist: INSERT/UPDATE por RLS + permiso `legal.manage` chequeado en SQL con `legal_has_permission` en `WITH CHECK`.
- IDs validados en SQL (préstamo/cliente/caso existen y pertenecen a la empresa; caso no cerrado).
- **Evidencia**: bucket nuevo `legal-evidence` **privado**, ruta `company-{companyId}/case-{id}/…`, política de Storage por empresa (`get_user_company_id()`) — esto además corrige la limitación de que hoy solo el dueño puede subir. Lectura por **URL firmada** (60 min). Los PDFs de intimación también van ahí.
- Auditoría: `legal_case_events` sin UPDATE/DELETE; `legal_intimations.content` no editable tras `issued` (trigger).
- Acciones destructivas/sensibles con `PasswordVerificationDialog` (cerrar, emitir, override de duplicado).
- Frontend: rutas por permiso en `Index.tsx`; los botones se ocultan por permiso pero **la autoridad es SQL**.

## Manejo de errores (mensajes claros, desde `RAISE EXCEPTION` con códigos)

`LEGAL_LOAN_NOT_FOUND`, `LEGAL_CLIENT_NOT_FOUND`, `LEGAL_DUPLICATE_CASE`, `LEGAL_FILE_INCOMPLETE` (con lista de faltantes), `LEGAL_NOT_APPROVED`, `LEGAL_EVIDENCE_REQUIRED`, `LEGAL_REASON_REQUIRED`, `LEGAL_PERMISSION_DENIED`, `LEGAL_CASE_CLOSED`, `LEGAL_TRANSITION_NOT_ALLOWED` (de → a). Un helper en frontend traduce el código a texto.

## Pruebas

- **TypeScript (unitarias, como las 44 existentes)**: semáforo de plazos, cálculo de "próxima acción", traducción de errores, render de plantilla con placeholders, agrupación del timeline.
- **SQL (`supabase/tests/legal_workflow.sql`, ejecutable con `psql`/SQL editor)**: crear caso, duplicado bloqueado, override con justificación, transición no permitida, gestión→promesa, promesa incumplida por barrido, solicitud→revisión→aprobación/rechazo, emisión sin aprobación bloqueada, notificación sin evidencia bloqueada, cierre sin motivo bloqueado, permisos por usuario simulado (`set role` + `request.jwt.claims`), acceso a otra empresa devuelve 0 filas, vencimiento de plazo.
  > No hay base de datos local en este equipo: el script queda listo pero **se ejecuta en un proyecto de prueba**.

## Orden de implementación (Fase 3)

1. Migración 1: columnas nuevas + tablas + índices + RLS + bucket privado.
2. Migración 2: funciones SQL (`legal_*`), triggers, semilla de transiciones y valores de configuración.
3. `src/utils/documentTemplates.ts` (extraer de LoanForm) y `src/utils/legalWorkflow.ts` (helpers puros + tests).
4. `src/hooks/useLegalCases.tsx` (datos + RPC) y `src/components/legal/` (Dashboard, Bandeja, Caso, Intimación, Checklist, Tareas, Promesas, Documentos, Config).
5. Integración: `App.tsx`, `Index.tsx`, `Sidebar.tsx`, `PERMISSIONS_CONFIG`, `LoanDetailsView` (tarjeta), `LoansModule` (badge), `Notifications.tsx`, `CompanySettings` (pestaña), `CollectionTracking` (campos nuevos, retrocompatibles).
6. Fase 4 pruebas, Fase 5 revisión (tsc, lint, build, migraciones, regresión de préstamos/pagos/CRM).

## Riesgos y decisiones pendientes de confirmación

1. **No extender `loans.status`** (usar `collection_stage` + `legal_cases.status`). Alternativa: ampliar el CHECK de `loans.status` — la desaconsejo: `calculate_loan_next_payment_date`, `updateAllLateFees`, `useLoans`, listados y reportes dependen de esos 5 valores.
2. **Extender `collection_tracking`** en vez de crear `gestiones_cobranza`. Mantiene una sola bitácora (CRM, Notificaciones y Préstamos ya la leen).
3. **Bucket privado `legal-evidence`** con URLs firmadas, en lugar del bucket público `documents`.
4. **Notificaciones calculadas** (extender `Notifications.tsx`); tabla `notifications` persistente queda para una fase posterior.
5. **Configuración en `company_settings`** (columnas) + tabla `legal_stage_transitions`; alternativa: una tabla `legal_settings` aparte (más limpia si la configuración crece).
6. **Alinear `Index.hasPermission` con `Sidebar`** para el rol `admin` (bug existente, cambio de una línea, opcional).
