// ============================================================================
// IMPORTAR DATOS desde CSV o Excel
// ============================================================================
// REGLA: nada entra en la base sin revisarse. El archivo se lee, se mapean sus columnas, se
// valida fila por fila, se avisa de los duplicados y SOLO ENTONCES se pregunta si se importa.
//
// QUÉ SE PUEDE IMPORTAR (y por qué no todo): clientes, gastos y productos son registros planos,
// con reglas simples y sin cálculos detrás. Los PRÉSTAMOS y los PAGOS no se importan desde aquí
// a propósito: crear un préstamo genera su tabla de cuotas, su balance, su mora y su historial,
// y meterlos por la puerta de atrás dejaría la cartera descuadrada. Para mover un sistema
// completo está el respaldo (Utilidades → Respaldo), que exporta e importa todo junto y
// coherente.

import { isValidCedula } from '../dominicanId';

export type ImportEntityId = 'clients' | 'expenses' | 'products';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  type: 'text' | 'number' | 'date' | 'cedula' | 'phone' | 'email';
  /** Nombres de columna que se reconocen solos al cargar el archivo */
  aliases: string[];
  help?: string;
}

export interface ImportEntity {
  id: ImportEntityId;
  label: string;
  description: string;
  table: string;
  /** Permiso necesario para importar */
  permission: string;
  fields: ImportField[];
  /** Campo por el que se detectan duplicados contra lo que ya existe */
  dedupeKey: string;
  /** Texto del aviso de duplicados */
  dedupeLabel: string;
}

export const IMPORT_ENTITIES: ImportEntity[] = [
  {
    id: 'clients',
    label: 'Clientes',
    description: 'Alta masiva de clientes. No crea préstamos ni toca los que ya existen.',
    table: 'clients',
    permission: 'clients.create',
    dedupeKey: 'dni',
    dedupeLabel: 'cédula',
    fields: [
      { key: 'full_name', label: 'Nombre completo', required: true, type: 'text', aliases: ['nombre', 'nombre completo', 'cliente', 'full_name'] },
      { key: 'dni', label: 'Cédula', required: true, type: 'cedula', aliases: ['cedula', 'cédula', 'dni', 'documento', 'identificacion'] },
      { key: 'phone', label: 'Teléfono', required: true, type: 'phone', aliases: ['telefono', 'teléfono', 'celular', 'phone', 'movil'] },
      { key: 'email', label: 'Correo', type: 'email', aliases: ['correo', 'email', 'e-mail'] },
      { key: 'address', label: 'Dirección', type: 'text', aliases: ['direccion', 'dirección', 'address'] },
      { key: 'city', label: 'Ciudad', type: 'text', aliases: ['ciudad', 'city', 'municipio'] },
      { key: 'neighborhood', label: 'Sector', type: 'text', aliases: ['sector', 'barrio', 'neighborhood'] },
      { key: 'occupation', label: 'Ocupación', type: 'text', aliases: ['ocupacion', 'ocupación', 'trabajo', 'occupation'] },
      { key: 'monthly_income', label: 'Ingreso mensual', type: 'number', aliases: ['ingreso', 'ingresos', 'salario', 'monthly_income'] },
    ],
  },
  {
    id: 'expenses',
    label: 'Gastos',
    description: 'Carga de gastos ya ocurridos, con su categoría y su fecha.',
    table: 'expenses',
    permission: 'expenses.create',
    dedupeKey: 'description',
    dedupeLabel: 'descripción y fecha',
    fields: [
      { key: 'category', label: 'Categoría', required: true, type: 'text', aliases: ['categoria', 'categoría', 'tipo', 'category'] },
      { key: 'description', label: 'Descripción', required: true, type: 'text', aliases: ['descripcion', 'descripción', 'detalle', 'concepto', 'description'] },
      { key: 'amount', label: 'Monto', required: true, type: 'number', aliases: ['monto', 'importe', 'valor', 'amount', 'total'] },
      { key: 'expense_date', label: 'Fecha', required: true, type: 'date', aliases: ['fecha', 'date', 'expense_date', 'fecha_gasto'] },
    ],
  },
  {
    id: 'products',
    label: 'Productos',
    description: 'Alta de productos del inventario. Los precios se cargan SIN ITBIS, como los guarda el sistema.',
    table: 'products',
    permission: 'inventory.create',
    dedupeKey: 'sku',
    dedupeLabel: 'SKU',
    fields: [
      { key: 'name', label: 'Nombre', required: true, type: 'text', aliases: ['nombre', 'producto', 'articulo', 'name'] },
      { key: 'sku', label: 'SKU / código', type: 'text', aliases: ['sku', 'codigo', 'código', 'referencia'] },
      { key: 'category', label: 'Categoría', type: 'text', aliases: ['categoria', 'categoría', 'category'] },
      { key: 'brand', label: 'Marca', type: 'text', aliases: ['marca', 'brand'] },
      { key: 'purchase_price', label: 'Precio de compra (sin ITBIS)', type: 'number', aliases: ['costo', 'precio compra', 'purchase_price'] },
      { key: 'selling_price', label: 'Precio de venta (sin ITBIS)', type: 'number', aliases: ['precio', 'precio venta', 'selling_price'] },
      { key: 'current_stock', label: 'Existencia', type: 'number', aliases: ['stock', 'existencia', 'cantidad', 'current_stock'] },
      { key: 'min_stock', label: 'Stock mínimo', type: 'number', aliases: ['minimo', 'mínimo', 'min_stock'] },
      { key: 'itbis_rate', label: 'ITBIS %', type: 'number', aliases: ['itbis', 'impuesto', 'itbis_rate'] },
    ],
  },
];

export const importEntityById = (id: ImportEntityId): ImportEntity =>
  IMPORT_ENTITIES.find(e => e.id === id) || IMPORT_ENTITIES[0];

const norm = (v: unknown) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Empareja las columnas del archivo con los campos de la entidad. */
export const autoMapColumns = (entity: ImportEntity, headers: string[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const usados = new Set<string>();
  for (const field of entity.fields) {
    const candidatos = [field.key, field.label, ...field.aliases].map(norm);
    const encontrado = headers.find(h => !usados.has(h) && candidatos.includes(norm(h)));
    if (encontrado) {
      mapping[field.key] = encontrado;
      usados.add(encontrado);
    }
  }
  return mapping;
};

// ---------------------------------------------------------------------------
// Conversión y validación
// ---------------------------------------------------------------------------

/** Número tolerante: acepta "1,250.50", "RD$1250", "1.250,50". */
export const parseNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').replace(/[^\d,.\-]/g, '').trim();
  if (!s) return null;
  const comas = (s.match(/,/g) || []).length;
  const puntos = (s.match(/\./g) || []).length;
  if (comas && puntos) {
    // El último separador que aparece es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (comas === 1 && /,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Fecha tolerante: ISO, dd/mm/aaaa, dd-mm-aaaa y el número de serie de Excel. */
export const parseDate = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Serie de Excel: días desde el 30/12/1899.
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().split('T')[0];
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]); const m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
};

export type RowStatus = 'valid' | 'warning' | 'invalid';

export interface ValidatedRow {
  /** Número de fila en el archivo (1 = la primera después del encabezado) */
  line: number;
  status: RowStatus;
  /** Valores ya convertidos, listos para insertar */
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  /** Ya existe en la base según la clave de duplicados */
  duplicate?: boolean;
}

export interface ValidationSummary {
  rows: ValidatedRow[];
  valid: number;
  warnings: number;
  invalid: number;
  duplicates: number;
}

/**
 * Valida el archivo entero contra la entidad.
 * `existingKeys` son las claves que YA están en la base (cédulas, SKUs…), para no duplicar.
 */
export const validateImport = (
  entity: ImportEntity,
  rawRows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
  existingKeys: Set<string> = new Set(),
): ValidationSummary => {
  const rows: ValidatedRow[] = [];
  const vistosEnArchivo = new Set<string>();

  rawRows.forEach((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const values: Record<string, unknown> = {};

    for (const field of entity.fields) {
      const columna = mapping[field.key];
      const valorCrudo = columna ? raw[columna] : undefined;
      const texto = String(valorCrudo ?? '').trim();

      if (!texto) {
        if (field.required) errors.push(`Falta ${field.label.toLowerCase()}`);
        continue;
      }

      switch (field.type) {
        case 'number': {
          const n = parseNumber(valorCrudo);
          if (n === null) { errors.push(`${field.label}: "${texto}" no es un número`); break; }
          if (n < 0) { errors.push(`${field.label} no puede ser negativo`); break; }
          values[field.key] = n;
          break;
        }
        case 'date': {
          const d = parseDate(valorCrudo);
          if (!d) { errors.push(`${field.label}: "${texto}" no es una fecha válida`); break; }
          if (d > new Date().toISOString().split('T')[0]) warnings.push(`${field.label} está en el futuro`);
          values[field.key] = d;
          break;
        }
        case 'cedula': {
          const digitos = texto.replace(/\D/g, '');
          if (!digitos) { errors.push('La cédula no tiene dígitos'); break; }
          if (digitos.length === 11 && !isValidCedula(digitos)) {
            warnings.push('La cédula no pasa la verificación de la JCE');
          } else if (digitos.length !== 11) {
            warnings.push('La cédula no tiene 11 dígitos');
          }
          values[field.key] = digitos;
          break;
        }
        case 'phone': {
          const digitos = texto.replace(/\D/g, '');
          if (digitos.length < 10) warnings.push('El teléfono parece incompleto');
          values[field.key] = digitos || texto;
          break;
        }
        case 'email': {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) warnings.push('El correo no tiene buena pinta');
          values[field.key] = texto;
          break;
        }
        default:
          values[field.key] = texto;
      }
    }

    // Duplicados: contra la base y dentro del propio archivo.
    const clave = norm(values[entity.dedupeKey]);
    let duplicate = false;
    if (clave) {
      if (existingKeys.has(clave)) {
        duplicate = true;
        warnings.push(`Ya existe un registro con esa ${entity.dedupeLabel}: no se volverá a crear`);
      } else if (vistosEnArchivo.has(clave)) {
        duplicate = true;
        warnings.push(`Repetido dentro del archivo (misma ${entity.dedupeLabel})`);
      } else {
        vistosEnArchivo.add(clave);
      }
    }

    rows.push({
      line: index + 1,
      status: errors.length > 0 ? 'invalid' : (warnings.length > 0 ? 'warning' : 'valid'),
      values,
      errors,
      warnings,
      duplicate,
    });
  });

  return {
    rows,
    valid: rows.filter(r => r.status === 'valid').length,
    warnings: rows.filter(r => r.status === 'warning').length,
    invalid: rows.filter(r => r.status === 'invalid').length,
    duplicates: rows.filter(r => r.duplicate).length,
  };
};

/** Las filas que de verdad se van a insertar. */
export const rowsToInsert = (
  summary: ValidationSummary,
  { includeDuplicates }: { includeDuplicates: boolean },
): ValidatedRow[] => summary.rows.filter(r =>
  r.status !== 'invalid' && (includeDuplicates || !r.duplicate));

/** El archivo de errores que se puede descargar para corregir y reintentar. */
export const errorReportRows = (summary: ValidationSummary): Array<Record<string, string>> =>
  summary.rows
    .filter(r => r.errors.length > 0 || r.warnings.length > 0)
    .map(r => ({
      Fila: String(r.line),
      Estado: r.status === 'invalid' ? 'Rechazada' : 'Con advertencia',
      Problemas: [...r.errors, ...r.warnings].join(' · '),
      Datos: Object.entries(r.values).map(([k, v]) => `${k}=${String(v)}`).join(' | '),
    }));
