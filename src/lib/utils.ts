import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Función global para formatear moneda con redondeo a números enteros y .00
export function formatCurrency(amount: number): string {
  // Redondear a número entero para evitar decimales
  const roundedAmount = Math.round(amount);
  return `RD$${roundedAmount.toLocaleString()}.00`;
}

// Función para formatear moneda sin el prefijo RD$ (solo el número con .00)
export function formatCurrencyNumber(amount: number): string {
  // Redondear a número entero para evitar decimales
  const roundedAmount = Math.round(amount);
  return `${roundedAmount.toLocaleString()}.00`;
}
