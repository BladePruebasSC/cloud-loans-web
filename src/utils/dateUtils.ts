import { formatInTimeZone } from 'date-fns-tz';
import { addHours } from 'date-fns';

// Utilidades para manejo de fechas con zona horaria de República Dominicana
// Zona horaria: America/Santo_Domingo (UTC-4)
/**
 * Obtiene la fecha actual en la zona horaria de Santo Domingo
 */
export const getCurrentDateInSantoDomingo = (): Date => {
  const now = new Date();
  
  // Convertir a la zona horaria de Santo Domingo
  const santoDomingoDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
  
  // DEBUG: Verificar la fecha actual
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG getCurrentDateInSantoDomingo - Fecha actual:', {
      now: now.toISOString(),
      nowLocal: now.toLocaleString(),
      nowSantoDomingo: now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}),
      santoDomingoDate: santoDomingoDate.toISOString(),
      currentDateString: santoDomingoDate.toISOString().split('T')[0]
    });
  }
  
  return santoDomingoDate;
};

/**
 * Convierte una fecha a la zona horaria de Santo Domingo
 */
export const toSantoDomingoTime = (date: Date): Date => {
  return new Date(date.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
};

/**
 * Crea una fecha en formato YYYY-MM-DD para la zona horaria de Santo Domingo
 */
export const createDateInSantoDomingo = (year: number, month: number, day: number): Date => {
  // Crear fecha en zona horaria local y luego convertir a Santo Domingo
  const localDate = new Date(year, month - 1, day); // month es 0-indexado
  return toSantoDomingoTime(localDate);
};

/**
 * Calcula la diferencia en días entre dos fechas, considerando la zona horaria de Santo Domingo
 */
export const calculateDaysDifference = (date1: Date, date2: Date): number => {
  // CORREGIR: Usar fechas directamente sin conversión de zona horaria
  // para evitar problemas de cálculo
  
  // Calcular diferencia en milisegundos y convertir a días
  const diffInMs = date2.getTime() - date1.getTime();
  const daysDiff = diffInMs / (1000 * 60 * 60 * 24);
  const finalDays = Math.floor(daysDiff);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 DEBUG calculateDaysDifference (CORREGIDO):', {
      date1: date1.toISOString().split('T')[0],
      date2: date2.toISOString().split('T')[0],
      date1Time: date1.getTime(),
      date2Time: date2.getTime(),
      diffInMs,
      daysDiff,
      finalDays,
      currentDate: new Date().toISOString().split('T')[0]
    });
  }
  
  // Usar Math.floor para obtener días completos
  return finalDays;
};

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para Santo Domingo
 */
export const getCurrentDateString = (): string => {
  const now = new Date();
  // Obtener la fecha en zona horaria de Santo Domingo
  const santoDomingoDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
  
  // Formatear como YYYY-MM-DD
  const year = santoDomingoDate.getFullYear();
  const month = String(santoDomingoDate.getMonth() + 1).padStart(2, '0');
  const day = String(santoDomingoDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Formatea una fecha para mostrar en la zona horaria de Santo Domingo
 */
export const formatDateForSantoDomingo = (date: Date): string => {
  return date.toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Formatea una fecha string (YYYY-MM-DD) para mostrar en la zona horaria de Santo Domingo
 */
export const formatDateStringForSantoDomingo = (dateString: string): string => {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para Santo Domingo
 */
export const getCurrentDateStringForSantoDomingo = (): string => {
  const now = getCurrentDateInSantoDomingo();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Formatea fecha y hora sumando +2 horas y usando la zona horaria de Santo Domingo
export const formatDateTimeWithOffset = (
  dateInput: string | Date,
  format: string = 'dd MMM yyyy, hh:mm a'
): string => {
  const baseDate = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const adjusted = addHours(baseDate, 2);
  try {
    return formatInTimeZone(adjusted, 'America/Santo_Domingo', format);
  } catch {
    // Fallback básico si falla date-fns-tz
    return adjusted.toLocaleString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};
