// ============================================================================
// DOCUMENTOS DE IDENTIDAD — tipos, formato y validación
// ============================================================================
// El cliente puede identificarse con cédula dominicana, pasaporte, DNI extranjero u otro
// documento. Solo la CÉDULA tiene estructura verificable y solo con ella se puede consultar
// la JCE; el resto son cadenas libres con límites razonables.
//
// El número se sigue guardando en `clients.dni` (renombrar la columna rompería medio sistema);
// el tipo va en `clients.document_type`.

export type DocumentType = 'cedula' | 'pasaporte' | 'dni' | 'id';

export interface DocumentTypeInfo {
  value: DocumentType;
  label: string;
  /** Ayuda bajo el campo del número */
  hint: string;
  placeholder: string;
  /** Solo la cédula se puede verificar contra la JCE */
  supportsJce: boolean;
}

export const DOCUMENT_TYPES: DocumentTypeInfo[] = [
  {
    value: 'cedula', label: 'Cédula',
    hint: '11 dígitos, sin guiones. Se verifica el dígito verificador de la JCE.',
    placeholder: '00000000000', supportsJce: true,
  },
  {
    value: 'pasaporte', label: 'Pasaporte',
    hint: 'Letras y números, entre 6 y 12 caracteres.',
    placeholder: 'A1234567', supportsJce: false,
  },
  {
    value: 'dni', label: 'DNI',
    hint: 'Documento de identidad extranjero.',
    placeholder: '12345678X', supportsJce: false,
  },
  {
    value: 'id', label: 'ID',
    hint: 'Cualquier otro documento de identificación.',
    placeholder: 'Número del documento', supportsJce: false,
  },
];

export const getDocumentTypeInfo = (type?: string | null): DocumentTypeInfo =>
  DOCUMENT_TYPES.find(t => t.value === type) ?? DOCUMENT_TYPES[0];

export const supportsJceLookup = (type?: string | null): boolean =>
  getDocumentTypeInfo(type).value === 'cedula';

const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');

/**
 * Dígito verificador de la cédula dominicana (Luhn con multiplicadores 1,2 alternos).
 *
 *   suma = Σ  d[i] × (i par ? 1 : 2), restando 9 cuando el producto pasa de 9
 *   check = (10 − suma mod 10) mod 10   →  debe coincidir con d[10]
 *
 * Detecta la mayoría de los errores de digitación (un dígito cambiado, dos adyacentes
 * transpuestos). NO garantiza que la cédula exista: para eso está la consulta a la JCE.
 */
export const isValidCedula = (value: string): boolean => {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let mult = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (mult > 9) mult -= 9;
    sum += mult;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[10]);
};

/**
 * Cédula: 11 dígitos seguidos, SIN guiones. La máscara 000-0000000-0 se quitó a propósito —
 * es como se guarda, como se consulta a la JCE y como la teclea el usuario, así que
 * mostrarla con guiones solo obligaba a limpiarla en cada uso.
 */
export const formatCedula = (value: string): string => onlyDigits(value).slice(0, 11);

/** Pasaporte / DNI / ID: mayúsculas, sin espacios ni símbolos raros. */
export const formatGenericDocument = (value: string): string =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);

export const formatDocument = (type: DocumentType, value: string): string =>
  type === 'cedula' ? formatCedula(value) : formatGenericDocument(value);

/** Valor que se guarda: la cédula sin guiones; el resto tal cual se muestra. */
export const documentToStored = (type: DocumentType, value: string): string =>
  type === 'cedula' ? onlyDigits(value) : formatGenericDocument(value);

/**
 * Valida el número según el tipo. Devuelve el mensaje de error o `null` si está bien.
 * Un documento vacío devuelve el mensaje de obligatorio.
 */
export const validateDocument = (type: DocumentType, value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return 'El número de documento es obligatorio';

  if (type === 'cedula') {
    const d = onlyDigits(raw);
    if (d.length !== 11) return `La cédula debe tener 11 dígitos (llevas ${d.length})`;
    if (!isValidCedula(d)) return 'Cédula inválida: el dígito verificador no coincide. Revisa el número.';
    return null;
  }

  const clean = formatGenericDocument(raw);
  if (type === 'pasaporte') {
    if (clean.length < 6 || clean.length > 12) return 'El pasaporte debe tener entre 6 y 12 caracteres';
    return null;
  }
  if (type === 'dni') {
    if (clean.length < 5 || clean.length > 20) return 'El DNI debe tener entre 5 y 20 caracteres';
    return null;
  }
  if (clean.length < 3) return 'El número del documento es muy corto';
  return null;
};

/**
 * Parte un nombre completo de la JCE en nombre(s) y apellido(s).
 *
 * La JCE devuelve una sola cadena ("JUAN PEREZ GOMEZ") sin separar. La convención dominicana
 * habitual son dos apellidos, así que con 3 palabras se asume 1 nombre + 2 apellidos. Es una
 * heurística: por eso los campos, aunque queden bloqueados tras la consulta, se pueden
 * desbloquear si el reparto sale mal.
 */
export const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const n = parts.length;
  if (n === 0) return { firstName: '', lastName: '' };
  if (n === 1) return { firstName: parts[0], lastName: '' };
  if (n === 2) return { firstName: parts[0], lastName: parts[1] };
  if (n === 3) return { firstName: parts[0], lastName: `${parts[1]} ${parts[2]}` };
  const mid = Math.ceil(n / 2);
  return {
    firstName: parts.slice(0, mid).join(' '),
    lastName: parts.slice(mid).join(' '),
  };
};

/** Estado civil de la JCE → la opción del formulario. `null` si no se reconoce. */
export const normalizeMaritalStatus = (value?: string | null): string | null => {
  const v = String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('solter')) return 'Soltero(a)';
  if (v.startsWith('casad')) return 'Casado(a)';
  if (v.startsWith('union') || v.startsWith('libre')) return 'Unión libre';
  if (v.startsWith('divorciad')) return 'Divorciado(a)';
  if (v.startsWith('viud')) return 'Viudo(a)';
  return null;
};

/** Sexo de la JCE ('M'/'F'/'MASCULINO'…) → el valor del formulario. */
export const normalizeGender = (value?: string | null): string | null => {
  const v = String(value || '').trim().toUpperCase();
  if (v.startsWith('M')) return 'MASCULINO';
  if (v.startsWith('F')) return 'FEMENINO';
  return null;
};
