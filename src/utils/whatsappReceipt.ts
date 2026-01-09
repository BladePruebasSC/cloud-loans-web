import { formatCurrency } from '@/lib/utils';

interface CompanySettings {
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface Client {
  full_name: string;
  dni?: string;
  phone?: string;
}

interface LoanPaymentReceipt {
  companyName: string;
  clientName: string;
  clientDni?: string;
  paymentDate: string;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  lateFeeAmount?: number;
  paymentMethod: string;
  loanAmount?: number;
  remainingBalance?: number;
  interestRate?: number;
  nextPaymentDate?: string;
  referenceNumber?: string;
}

interface PawnPaymentReceipt {
  companyName: string;
  clientName: string;
  clientDni?: string;
  paymentDate: string;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  remainingBalance: number;
  paymentMethod: string;
  transactionId?: string;
  productName?: string;
  loanAmount?: number;
  interestRate?: number;
  referenceNumber?: string;
}

interface SaleReceipt {
  companyName: string;
  clientName: string;
  clientDni?: string;
  saleDate: string;
  totalAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  paymentMethods: Array<{
    method: string;
    amount: number;
  }>;
  discount?: number;
  tax?: number;
  saleId?: string;
}

interface CapitalPaymentReceipt {
  companyName: string;
  clientName: string;
  clientDni?: string;
  paymentDate: string;
  capitalPaymentAmount: number;
  penaltyAmount?: number;
  capitalBefore: number;
  capitalAfter: number;
  loanAmount?: number;
  remainingBalance?: number;
  interestRate?: number;
  nextPaymentDate?: string;
  keepInstallments?: boolean;
  adjustmentReason?: string;
}

/**
 * Formatea un número de teléfono para WhatsApp
 */
export const formatPhoneForWhatsApp = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  
  // Remover todos los caracteres no numéricos
  let cleaned = phone.replace(/\D/g, '');
  
  // Si empieza con 1 (código de país), removerlo
  if (cleaned.startsWith('1')) {
    cleaned = cleaned.substring(1);
  }
  
  // Si no empieza con código de país, agregar 1 (República Dominicana)
  if (!cleaned.startsWith('1')) {
    cleaned = '1' + cleaned;
  }
  
  return cleaned;
};

/**
 * Abre WhatsApp con un mensaje predefinido
 */
export const openWhatsApp = (phone: string, message: string) => {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    throw new Error('Número de teléfono inválido');
  }
  
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
};

/**
 * Genera el mensaje de recibo para pago de préstamo
 */
export const generateLoanPaymentReceipt = (receipt: LoanPaymentReceipt): string => {
  const paymentMethodLabels: { [key: string]: string } = {
    'cash': 'Efectivo',
    'bank_transfer': 'Transferencia Bancaria',
    'check': 'Cheque',
    'card': 'Tarjeta',
    'online': 'Pago en Línea'
  };

  const paymentMethod = paymentMethodLabels[receipt.paymentMethod] || receipt.paymentMethod;
  
  // Verificar si el préstamo fue saldado (remainingBalance === 0)
  const isSettled = receipt.remainingBalance !== undefined && receipt.remainingBalance === 0;
  
  let message = `*Notificación de ${receipt.companyName}*\n\n`;
  
  if (isSettled) {
    // Mensaje para préstamo saldado
    message += `${receipt.clientName}${receipt.clientDni ? ` (${receipt.clientDni})` : ''} le informamos que su préstamo ha sido saldado exitosamente.\n\n`;
  } else {
    // Mensaje para pago regular
    message += `${receipt.clientName}${receipt.clientDni ? ` (${receipt.clientDni})` : ''} le informamos que su pago fue registrado exitosamente.\n\n`;
  }
  
  message += `*Información del Préstamo*\n`;
  if (receipt.loanAmount) {
    message += `Monto del préstamo: ${formatCurrency(receipt.loanAmount)}\n`;
  }
  if (receipt.interestRate) {
    message += `Tasa de interés: ${receipt.interestRate}% mensual\n`;
  }
  if (receipt.nextPaymentDate && !isSettled) {
    message += `Próxima fecha de pago: ${receipt.nextPaymentDate}\n`;
  }
  message += `\n`;
  
  message += `*Información de Pago*\n`;
  message += `Fecha de pago: ${receipt.paymentDate}\n`;
  message += `Monto total pagado: ${formatCurrency(receipt.paymentAmount)}\n`;
  message += `Desglose:\n`;
  message += `  - Capital: ${formatCurrency(receipt.principalAmount)}\n`;
  message += `  - Interés: ${formatCurrency(receipt.interestAmount)}\n`;
  if (receipt.lateFeeAmount && receipt.lateFeeAmount > 0) {
    message += `  - Mora: ${formatCurrency(receipt.lateFeeAmount)}\n`;
  }
  message += `Método de pago: ${paymentMethod}\n`;
  if (receipt.referenceNumber) {
    message += `Número de referencia: ${receipt.referenceNumber}\n`;
  }
  if (receipt.remainingBalance !== undefined) {
    if (isSettled) {
      message += `Balance restante: ${formatCurrency(receipt.remainingBalance)}\n`;
      message += `\n*¡Préstamo saldado completamente!*\n`;
    } else {
      message += `Balance restante: ${formatCurrency(receipt.remainingBalance)}\n`;
    }
  }
  
  return message;
};

/**
 * Genera el mensaje de recibo para pago de compra/venta (empeño)
 */
export const generatePawnPaymentReceipt = (receipt: PawnPaymentReceipt): string => {
  const paymentMethodLabels: { [key: string]: string } = {
    'cash': 'Efectivo',
    'transfer': 'Transferencia Bancaria',
    'check': 'Cheque',
    'card': 'Tarjeta',
    'other': 'Otro'
  };

  const paymentMethod = paymentMethodLabels[receipt.paymentMethod] || receipt.paymentMethod;
  
  let message = `*Notificación de ${receipt.companyName}*\n\n`;
  message += `${receipt.clientName}${receipt.clientDni ? ` (${receipt.clientDni})` : ''} le informamos que su pago fue registrado exitosamente.\n\n`;
  
  message += `*Información de la Transacción*\n`;
  if (receipt.productName) {
    message += `Artículo: ${receipt.productName}\n`;
  }
  if (receipt.loanAmount) {
    message += `Monto del préstamo: ${formatCurrency(receipt.loanAmount)}\n`;
  }
  if (receipt.interestRate) {
    message += `Tasa de interés: ${receipt.interestRate}% mensual\n`;
  }
  if (receipt.transactionId) {
    message += `Número de transacción: ${receipt.transactionId}\n`;
  }
  message += `\n`;
  
  message += `*Información de Pago*\n`;
  message += `Fecha de pago: ${receipt.paymentDate}\n`;
  message += `Monto total pagado: ${formatCurrency(receipt.paymentAmount)}\n`;
  message += `Desglose:\n`;
  message += `  - Capital: ${formatCurrency(receipt.principalAmount)}\n`;
  message += `  - Interés: ${formatCurrency(receipt.interestAmount)}\n`;
  message += `Método de pago: ${paymentMethod}\n`;
  if (receipt.referenceNumber) {
    message += `Número de referencia: ${receipt.referenceNumber}\n`;
  }
  message += `Balance restante: ${formatCurrency(receipt.remainingBalance)}\n`;
  
  return message;
};

/**
 * Genera el mensaje de recibo para venta
 */
export const generateSaleReceipt = (receipt: SaleReceipt): string => {
  const paymentMethodLabels: { [key: string]: string } = {
    'cash': 'Efectivo',
    'transfer': 'Transferencia Bancaria',
    'check': 'Cheque',
    'card': 'Tarjeta de Crédito',
    'card_debit': 'Tarjeta de Débito',
    'other': 'Otro'
  };

  let message = `*Notificación de ${receipt.companyName}*\n\n`;
  message += `${receipt.clientName}${receipt.clientDni ? ` (${receipt.clientDni})` : ''} le informamos que su compra fue exitosa.\n\n`;
  
  message += `*Vendedor*\n`;
  message += `Fecha de venta: ${receipt.saleDate}\n`;
  if (receipt.saleId) {
    message += `Número de venta: ${receipt.saleId}\n`;
  }
  message += `\n`;
  
  message += `*Productos*\n`;
  receipt.items.forEach((item, index) => {
    message += `${index + 1}. ${item.name}\n`;
    message += `   Cantidad: ${item.quantity}\n`;
    message += `   Precio unitario: ${formatCurrency(item.unitPrice)}\n`;
    message += `   Subtotal: ${formatCurrency(item.subtotal)}\n`;
    message += `\n`;
  });
  
  message += `*Información de Pago*\n`;
  message += `Subtotal: ${formatCurrency(receipt.totalAmount - (receipt.tax || 0))}\n`;
  if (receipt.discount && receipt.discount > 0) {
    message += `Descuento: ${formatCurrency(receipt.discount)}\n`;
  }
  if (receipt.tax && receipt.tax > 0) {
    message += `ITBIS: ${formatCurrency(receipt.tax)}\n`;
  }
  message += `Total: ${formatCurrency(receipt.totalAmount)}\n`;
  message += `\n`;
  message += `Pagos realizados:\n`;
  receipt.paymentMethods.forEach(payment => {
    const methodLabel = paymentMethodLabels[payment.method] || payment.method;
    message += `${formatCurrency(payment.amount)} (${methodLabel})\n`;
  });
  
  return message;
};

/**
 * Genera el mensaje de recibo para abono a capital
 */
export const generateCapitalPaymentReceipt = (receipt: CapitalPaymentReceipt): string => {
  let message = `*Notificación de ${receipt.companyName}*\n\n`;
  message += `${receipt.clientName}${receipt.clientDni ? ` (${receipt.clientDni})` : ''} le informamos que su abono a capital fue registrado exitosamente.\n\n`;
  
  message += `*Información del Préstamo*\n`;
  if (receipt.loanAmount) {
    message += `Monto del préstamo: ${formatCurrency(receipt.loanAmount)}\n`;
  }
  if (receipt.interestRate) {
    message += `Tasa de interés: ${receipt.interestRate}% mensual\n`;
  }
  if (receipt.nextPaymentDate) {
    message += `Próxima fecha de pago: ${receipt.nextPaymentDate}\n`;
  }
  message += `\n`;
  
  message += `*Información del Abono a Capital*\n`;
  message += `Fecha: ${receipt.paymentDate}\n`;
  message += `Capital pendiente antes: ${formatCurrency(receipt.capitalBefore)}\n`;
  message += `Monto del abono: ${formatCurrency(receipt.capitalPaymentAmount)}\n`;
  if (receipt.penaltyAmount && receipt.penaltyAmount > 0) {
    message += `Penalidad aplicada: ${formatCurrency(receipt.penaltyAmount)}\n`;
  }
  message += `Capital pendiente después: ${formatCurrency(receipt.capitalAfter)}\n`;
  if (receipt.keepInstallments !== undefined) {
    message += `Cuotas: ${receipt.keepInstallments ? 'Mantener número de cuotas (reducir monto)' : 'Reducir número de cuotas (mantener monto)'}\n`;
  }
  if (receipt.adjustmentReason) {
    message += `Razón: ${receipt.adjustmentReason}\n`;
  }
  if (receipt.remainingBalance !== undefined) {
    message += `Balance restante del préstamo: ${formatCurrency(receipt.remainingBalance)}\n`;
  }
  
  return message;
};
