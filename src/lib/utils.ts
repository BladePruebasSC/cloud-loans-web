import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Función global para formatear moneda con redondeo a números enteros y .00
export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `RD$${safe.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Función para formatear moneda sin el prefijo RD$ (solo el número con .00)
export function formatCurrencyNumber(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
