// ============================================================================
// COBRANZA LEGAL — helpers puros (etiquetas, semáforos, próxima acción, errores)
// ============================================================================
// Sin acceso a datos. La autoridad del workflow es SQL (legal_* en la migración
// 20260829000001); estas funciones solo interpretan lo que la BD devuelve para
// mostrarlo, y traducen los códigos de error LEGAL_* a mensajes para el usuario.

import { daysBetweenIso, parseIsoDateLocal } from './frequencyUtils';

export type CollectionStage =
  | 'al_dia' | 'cuota_vencida' | 'mora' | 'cobranza_preventiva' | 'cobranza_administrativa'
  | 'cobranza_intensiva' | 'pre_legal' | 'legal';

export type LegalCaseStatus =
  | 'pre_legal' | 'pending_legal_approval' | 'intimation_preparing' | 'intimation_issued'
  | 'intimation_notified' | 'in_deadline_period' | 'payment_promise' | 'payment_agreement'
  | 'partial_payment' | 'paid' | 'resolved' | 'escalated' | 'judicial' | 'suspended' | 'closed';

export type IntimationStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'issued' | 'notified' | 'not_notified' | 'expired' | 'responded' | 'closed';

export const CASE_OPEN_STATUSES: LegalCaseStatus[] = [
  'pre_legal', 'pending_legal_approval', 'intimation_preparing', 'intimation_issued', 'intimation_notified',
  'in_deadline_period', 'payment_promise', 'payment_agreement', 'partial_payment', 'paid', 'escalated', 'judicial', 'suspended',
];
export const isCaseOpen = (s: string) => s !== 'resolved' && s !== 'closed';

export const STAGE_META: Record<CollectionStage, { label: string; className: string; order: number }> = {
  al_dia:                  { label: 'Al día',                 className: 'bg-green-100 text-green-800',   order: 0 },
  cuota_vencida:           { label: 'Cuota vencida',          className: 'bg-yellow-100 text-yellow-800', order: 1 },
  mora:                    { label: 'Mora',                   className: 'bg-amber-100 text-amber-800',   order: 2 },
  cobranza_preventiva:     { label: 'Cobranza preventiva',    className: 'bg-orange-100 text-orange-800', order: 3 },
  cobranza_administrativa: { label: 'Cobranza administrativa', className: 'bg-orange-200 text-orange-900', order: 4 },
  cobranza_intensiva:      { label: 'Cobranza intensiva',     className: 'bg-red-100 text-red-800',       order: 5 },
  pre_legal:               { label: 'Pre-legal',              className: 'bg-red-200 text-red-900',       order: 6 },
  legal:                   { label: 'En proceso legal',       className: 'bg-purple-100 text-purple-800', order: 7 },
};

export const CASE_STATUS_META: Record<LegalCaseStatus, { label: string; className: string; group: 'prelegal' | 'intimation' | 'notification' | 'deadline' | 'payment' | 'escalated' | 'resolved' | 'other' }> = {
  pre_legal:              { label: 'Pre-legal',                  className: 'bg-red-100 text-red-800',       group: 'prelegal' },
  pending_legal_approval: { label: 'Pendiente de aprobación',    className: 'bg-amber-100 text-amber-800',   group: 'intimation' },
  intimation_preparing:   { label: 'Intimación en preparación',  className: 'bg-amber-100 text-amber-800',   group: 'intimation' },
  intimation_issued:      { label: 'Intimación emitida',         className: 'bg-orange-100 text-orange-800', group: 'intimation' },
  intimation_notified:    { label: 'Intimación notificada',      className: 'bg-orange-200 text-orange-900', group: 'notification' },
  in_deadline_period:     { label: 'En período de plazo',        className: 'bg-blue-100 text-blue-800',     group: 'deadline' },
  payment_promise:        { label: 'Promesa de pago',            className: 'bg-sky-100 text-sky-800',       group: 'payment' },
  payment_agreement:      { label: 'Acuerdo de pago',            className: 'bg-teal-100 text-teal-800',     group: 'payment' },
  partial_payment:        { label: 'Pago parcial',               className: 'bg-lime-100 text-lime-800',     group: 'payment' },
  paid:                   { label: 'Pagado',                     className: 'bg-green-100 text-green-800',   group: 'payment' },
  resolved:               { label: 'Resuelto',                   className: 'bg-green-200 text-green-900',   group: 'resolved' },
  escalated:              { label: 'Escalado a legal',           className: 'bg-purple-100 text-purple-800', group: 'escalated' },
  judicial:               { label: 'Proceso judicial',           className: 'bg-purple-200 text-purple-900', group: 'escalated' },
  suspended:              { label: 'Suspendido',                 className: 'bg-gray-100 text-gray-700',     group: 'other' },
  closed:                 { label: 'Cerrado',                    className: 'bg-gray-200 text-gray-800',     group: 'resolved' },
};

export const INTIMATION_STATUS_META: Record<IntimationStatus, { label: string; className: string }> = {
  draft:            { label: 'Borrador',              className: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: 'Pendiente de aprobación', className: 'bg-amber-100 text-amber-800' },
  approved:         { label: 'Aprobada',              className: 'bg-blue-100 text-blue-800' },
  issued:           { label: 'Emitida',               className: 'bg-orange-100 text-orange-800' },
  notified:         { label: 'Notificada',            className: 'bg-sky-100 text-sky-800' },
  not_notified:     { label: 'No notificada',         className: 'bg-yellow-100 text-yellow-800' },
  expired:          { label: 'Plazo vencido',         className: 'bg-red-100 text-red-800' },
  responded:        { label: 'Respondida',            className: 'bg-teal-100 text-teal-800' },
  closed:           { label: 'Cerrada',               className: 'bg-gray-200 text-gray-800' },
};

export const PRIORITY_META: Record<string, { label: string; className: string; order: number }> = {
  low:      { label: 'Baja',    className: 'bg-gray-100 text-gray-700',   order: 0 },
  medium:   { label: 'Media',   className: 'bg-blue-100 text-blue-800',   order: 1 },
  high:     { label: 'Alta',    className: 'bg-orange-100 text-orange-800', order: 2 },
  critical: { label: 'Crítica', className: 'bg-red-100 text-red-800',     order: 3 },
};

export const CONTACT_RESULT_LABEL: Record<string, string> = {
  contacted: 'Contactado', no_answer: 'No contestó', wrong_number: 'Número incorrecto', not_located: 'Cliente no localizado',
  payment_promise: 'Promesa de pago', refuses: 'Rechaza pagar', requests_negotiation: 'Solicita negociación',
  payment_made: 'Pago realizado', agreement: 'Acuerdo realizado', escalate: 'Escalar a legal', other: 'Otro',
};

export const CONTACT_TYPE_LABEL: Record<string, string> = {
  phone: 'Llamada', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Correo', visit: 'Visita', notification: 'Notificación',
  letter: 'Carta', meeting: 'Reunión', other: 'Otro',
};

export const NOTIFICATION_METHOD_LABEL: Record<string, string> = {
  physical: 'Entrega física', courier: 'Mensajería', certified_mail: 'Correo certificado', notary: 'Notario', email: 'Email', whatsapp: 'WhatsApp', other: 'Otro',
};
export const NOTIFICATION_RESULT_LABEL: Record<string, string> = {
  delivered: 'Entregada', refused: 'Rechazada por el receptor', absent: 'Ausente', wrong_address: 'Dirección incorrecta', other: 'Otro',
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  call: 'Llamar al cliente', send_document: 'Enviar documento', verify_payment: 'Verificar pago', request_document: 'Solicitar documento',
  review_file: 'Revisar expediente', send_to_lawyer: 'Enviar a abogado', verify_notification: 'Verificar notificación',
  follow_up: 'Dar seguimiento', escalate: 'Escalar caso', other: 'Otro',
};
export const TASK_STATUS_META: Record<string, { label: string; className: string }> = {
  pending:     { label: 'Pendiente',   className: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'En progreso', className: 'bg-blue-100 text-blue-800' },
  completed:   { label: 'Completada',  className: 'bg-green-100 text-green-800' },
  cancelled:   { label: 'Cancelada',   className: 'bg-gray-200 text-gray-600' },
  overdue:     { label: 'Vencida',     className: 'bg-red-100 text-red-800' },
};

export const PROMISE_STATUS_META: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pendiente',  className: 'bg-amber-100 text-amber-800' },
  fulfilled: { label: 'Cumplida',   className: 'bg-green-100 text-green-800' },
  broken:    { label: 'Incumplida', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada',  className: 'bg-gray-100 text-gray-600' },
};

export const CHECKLIST_LABEL: Record<string, string> = {
  contract: 'Contrato disponible', identification: 'Identificación del cliente', contact_data: 'Datos de contacto',
  address: 'Dirección registrada', payment_history: 'Historial de pagos', statement: 'Estado de cuenta',
  collection_evidence: 'Evidencia de gestiones de cobro', broken_promises: 'Promesas incumplidas', other: 'Documentos adicionales',
};

export const CLOSE_REASON_LABEL: Record<string, string> = {
  full_payment: 'Pago total', payment_agreement: 'Acuerdo de pago', restructuring: 'Reestructuración', cancellation: 'Cancelación',
  administrative_error: 'Error administrativo', judicial_escalation: 'Escalamiento judicial', other: 'Otro',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  case_opened: 'Caso abierto', status_changed: 'Cambio de estado', case_assigned: 'Asignación', case_updated: 'Actualización',
  checklist_updated: 'Expediente', collection_contact: 'Gestión de cobro', promise_created: 'Promesa creada', promise_fulfilled: 'Promesa cumplida',
  promise_broken: 'Promesa incumplida', promise_cancelled: 'Promesa cancelada', intimation_requested: 'Intimación solicitada',
  approval_reviewed: 'Revisión', intimation_approved: 'Intimación aprobada', intimation_rejected: 'Intimación rechazada',
  intimation_issued: 'Intimación emitida', intimation_notified: 'Intimación notificada', intimation_notification_attempt: 'Intento de notificación',
  intimation_expired: 'Plazo vencido', intimation_responded: 'Respuesta del cliente', payment_received: 'Pago recibido',
  task_created: 'Tarea creada', task_updated: 'Tarea actualizada', document_added: 'Documento agregado', case_escalated: 'Escalado', case_closed: 'Caso cerrado',
};

// ---------------------------------------------------------------------------
// Fechas y semáforos
// ---------------------------------------------------------------------------

// `daysBetweenIso` se movió a frequencyUtils (la usan mora, CRM, legal y métricas de
// cartera). Se reexporta aquí para no cambiar los imports existentes del módulo legal.
export { daysBetweenIso };

export type DeadlineLevel = 'green' | 'yellow' | 'red' | 'none';

/**
 * Semáforo de plazo. `warningDays` = configuración `legal_followup_days`.
 *   red    → vencido
 *   yellow → vence dentro de `warningDays` (incluido hoy)
 *   green  → plazo normal
 */
export const deadlineLevel = (deadlineIso: string | null | undefined, todayIso: string, warningDays = 3): { level: DeadlineLevel; daysLeft: number | null } => {
  const d = daysBetweenIso(todayIso, deadlineIso);
  if (d === null) return { level: 'none', daysLeft: null };
  if (d < 0) return { level: 'red', daysLeft: d };
  if (d <= warningDays) return { level: 'yellow', daysLeft: d };
  return { level: 'green', daysLeft: d };
};

export const DEADLINE_CLASS: Record<DeadlineLevel, string> = {
  green: 'bg-green-100 text-green-800 border-green-200',
  yellow: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  none: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const deadlineText = (deadlineIso: string | null | undefined, todayIso: string, warningDays = 3): string => {
  const { level, daysLeft } = deadlineLevel(deadlineIso, todayIso, warningDays);
  if (level === 'none' || daysLeft === null) return 'Sin fecha';
  if (daysLeft < 0) return `Vencido hace ${-daysLeft} día${-daysLeft === 1 ? '' : 's'}`;
  if (daysLeft === 0) return 'Vence hoy';
  return `${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`;
};

// ---------------------------------------------------------------------------
// Próxima acción sugerida (solo lectura del estado; la BD manda)
// ---------------------------------------------------------------------------

export interface NextActionInput {
  status: LegalCaseStatus;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  checklistComplete?: boolean | null;
  hasPendingApproval?: boolean;
  intimationStatus?: IntimationStatus | null;
  intimationDeadline?: string | null;
  pendingPromiseDate?: string | null;
  lastActionAt?: string | null; // ISO date
  todayIso: string;
  followupDays: number;
}

export const suggestNextAction = (i: NextActionInput): { text: string; level: DeadlineLevel } => {
  const overdueSched = i.nextActionAt ? deadlineLevel(i.nextActionAt, i.todayIso, i.followupDays) : null;
  const staleDays = i.lastActionAt ? daysBetweenIso(i.lastActionAt, i.todayIso) : null;

  switch (i.status) {
    case 'pre_legal':
      if (i.checklistComplete === false) return { text: 'Completar el expediente (checklist) antes de solicitar la intimación', level: 'yellow' };
      if (i.checklistComplete) return { text: 'Expediente completo: solicitar intimación o continuar gestiones', level: 'green' };
      break;
    case 'pending_legal_approval':
      return { text: 'Esperando revisión/aprobación de la intimación', level: 'yellow' };
    case 'intimation_preparing':
      return { text: 'Redactar y emitir la carta de intimación', level: 'yellow' };
    case 'intimation_issued':
      return { text: 'Notificar la intimación al cliente y registrar la evidencia', level: 'yellow' };
    case 'intimation_notified':
    case 'in_deadline_period': {
      const dl = deadlineLevel(i.intimationDeadline, i.todayIso, i.followupDays);
      if (dl.level === 'red') return { text: 'Plazo de intimación vencido: verificar pago o escalar a proceso legal', level: 'red' };
      if (dl.level === 'yellow') return { text: `El plazo vence ${dl.daysLeft === 0 ? 'hoy' : `en ${dl.daysLeft} días`}: contactar al cliente`, level: 'yellow' };
      return { text: 'En plazo. Dar seguimiento y verificar pagos', level: 'green' };
    }
    case 'payment_promise': {
      const pl = deadlineLevel(i.pendingPromiseDate, i.todayIso, 0);
      if (pl.level === 'red') return { text: 'Promesa de pago vencida: verificar y registrar incumplimiento', level: 'red' };
      if (pl.level === 'yellow') return { text: 'Hoy vence la promesa de pago: verificar el pago', level: 'yellow' };
      return { text: 'Esperar la fecha prometida y verificar el pago', level: 'green' };
    }
    case 'payment_agreement':
      return { text: 'Acuerdo de pago vigente: monitorear cumplimiento', level: 'green' };
    case 'partial_payment':
      return { text: 'Pago parcial recibido: negociar el resto o continuar el proceso', level: 'yellow' };
    case 'paid':
      return { text: 'Préstamo pagado: cerrar el caso como resuelto', level: 'green' };
    case 'escalated':
      return { text: 'Remitir expediente al abogado / iniciar proceso judicial', level: 'yellow' };
    case 'judicial':
      return { text: 'Proceso judicial: seguimiento con el abogado', level: 'green' };
    case 'suspended':
      return { text: 'Caso suspendido: reanudar o cerrar con motivo', level: 'none' };
    case 'resolved':
    case 'closed':
      return { text: 'Caso cerrado (histórico)', level: 'none' };
  }

  if (i.nextActionNote && overdueSched) {
    return { text: i.nextActionNote, level: overdueSched.level };
  }
  if (staleDays !== null && staleDays > i.followupDays) {
    return { text: `Sin gestión hace ${staleDays} días: contactar al cliente`, level: 'red' };
  }
  return { text: i.nextActionNote || 'Continuar gestiones de cobro', level: 'green' };
};

// ---------------------------------------------------------------------------
// Errores LEGAL_* → mensaje para el usuario
// ---------------------------------------------------------------------------

const ERROR_TITLES: Record<string, string> = {
  LEGAL_PERMISSION_DENIED: 'No tienes permiso para esta acción',
  LEGAL_LOAN_NOT_FOUND: 'Préstamo no encontrado',
  LEGAL_CLIENT_NOT_FOUND: 'Cliente no encontrado',
  LEGAL_CASE_NOT_FOUND: 'Caso no encontrado',
  LEGAL_CASE_CLOSED: 'El caso está cerrado',
  LEGAL_DUPLICATE_CASE: 'Ya existe un caso legal activo',
  LEGAL_FILE_INCOMPLETE: 'Expediente incompleto',
  LEGAL_NOT_APPROVED: 'Intimación sin aprobación',
  LEGAL_EVIDENCE_REQUIRED: 'Falta la evidencia de notificación',
  LEGAL_REASON_REQUIRED: 'Debes indicar un motivo',
  LEGAL_TRANSITION_NOT_ALLOWED: 'Transición no permitida',
  LEGAL_ALREADY_REQUESTED: 'Ya hay una solicitud pendiente',
  LEGAL_INVALID_STATE: 'Estado no válido para esta acción',
  LEGAL_INVALID_AMOUNT: 'Monto no válido',
  LEGAL_INVALID_DATE: 'Fecha no válida',
  LEGAL_INVALID_REASON: 'Motivo no válido',
  LEGAL_CONTENT_REQUIRED: 'Contenido vacío',
  LEGAL_TITLE_REQUIRED: 'Título requerido',
  LEGAL_NOT_FOUND: 'Registro no encontrado',
  LEGAL_SETTINGS_NOT_FOUND: 'Configuración de empresa no encontrada',
  LEGAL_AUDIT_IMMUTABLE: 'La auditoría no se puede modificar',
  LEGAL_INTIMATION_FROZEN: 'La intimación emitida no se puede modificar',
};

/** Traduce un error de Supabase/Postgres con prefijo LEGAL_ a { title, detail }. */
export const translateLegalError = (err: any): { title: string; detail: string } => {
  const raw: string = String(err?.message || err?.details || err || '');
  const m = raw.match(/(LEGAL_[A-Z_]+):\s*(.*)$/s);
  if (m) {
    const code = m[1];
    // Postgres añade contexto tras un salto de línea; nos quedamos con la primera línea
    const detail = m[2].split('\n')[0].trim();
    return { title: ERROR_TITLES[code] || code, detail };
  }
  if (/duplicate key value.*uq_legal_cases_open_per_loan/i.test(raw)) {
    return { title: ERROR_TITLES.LEGAL_DUPLICATE_CASE, detail: 'Este préstamo ya tiene un caso legal abierto.' };
  }
  return { title: 'Error', detail: raw || 'Error desconocido' };
};

// ---------------------------------------------------------------------------
// Plantilla de intimación
// ---------------------------------------------------------------------------

/** Plantilla inicial NEUTRA. No contiene lenguaje jurídico: debe revisarla el asesor legal. */
export const DEFAULT_INTIMATION_TEMPLATE = `{empresa_nombre}
{fecha_actual}

Señor(a): {cliente_nombre}
Cédula: {cliente_dni}
Dirección: {cliente_direccion}

Ref.: Préstamo No. {numero_prestamo} — Expediente {numero_expediente}

[PLANTILLA PENDIENTE DE REVISIÓN POR EL ASESOR LEGAL DE LA EMPRESA]

Por medio de la presente le informamos que, a la fecha, el préstamo de referencia presenta el siguiente estado:

  • Monto original:        {monto_original}
  • Saldo pendiente:       {saldo_pendiente}
  • Mora acumulada:        {mora_pendiente}
  • Cuotas vencidas:       {cuotas_vencidas}
  • Días de atraso:        {dias_atraso}
  • Total reclamado:       {total_reclamado}

Se le concede un plazo hasta el {fecha_limite_intimacion} para regularizar su situación o comunicarse con nosotros.

Atentamente,

{representante_nombre}
{empresa_nombre}
{empresa_telefono}`;

export const INTIMATION_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: '{empresa_nombre}', description: 'Nombre de la empresa' },
  { key: '{empresa_telefono}', description: 'Teléfono de la empresa' },
  { key: '{empresa_direccion}', description: 'Dirección de la empresa' },
  { key: '{representante_nombre}', description: 'Quien firma (usuario actual)' },
  { key: '{fecha_actual}', description: 'Fecha de emisión' },
  { key: '{cliente_nombre}', description: 'Nombre del cliente' },
  { key: '{cliente_dni}', description: 'Cédula del cliente' },
  { key: '{cliente_direccion}', description: 'Dirección del cliente' },
  { key: '{cliente_telefono}', description: 'Teléfono del cliente' },
  { key: '{numero_prestamo}', description: 'Número del préstamo' },
  { key: '{numero_expediente}', description: 'Número de expediente' },
  { key: '{monto_original}', description: 'Monto prestado' },
  { key: '{saldo_pendiente}', description: 'Saldo pendiente (capital + interés)' },
  { key: '{mora_pendiente}', description: 'Mora acumulada' },
  { key: '{cuotas_vencidas}', description: 'Cantidad de cuotas vencidas' },
  { key: '{detalle_cuotas}', description: 'Detalle de cuotas vencidas (lista)' },
  { key: '{dias_atraso}', description: 'Días de atraso' },
  { key: '{total_reclamado}', description: 'Total reclamado' },
  { key: '{fecha_limite_intimacion}', description: 'Fecha límite del plazo' },
  { key: '{dias_plazo}', description: 'Días de plazo' },
];

/** Reemplazo simple de placeholders (misma sintaxis que las plantillas de préstamo). */
export const renderTemplate = (template: string, values: Record<string, string>): string => {
  let out = template || '';
  for (const [key, val] of Object.entries(values)) {
    out = out.split(key).join(val ?? '');
  }
  return out;
};

/** Placeholders que quedaron sin reemplazar (para avisar antes de emitir). */
export const findUnresolvedPlaceholders = (text: string): string[] => {
  const found = text.match(/\{[a-z_]+\}/g) || [];
  return Array.from(new Set(found));
};
