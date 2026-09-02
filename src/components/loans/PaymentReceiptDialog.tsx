// ============================================================================
// DIÁLOGO DEL RECIBO DE PAGO
// ============================================================================
// Vive FUERA del panel de pago avanzado a propósito.
//
// Estaba dentro, y ahí depende de que el panel siga montado: basta con que un padre lo
// desmonte tras registrar el pago (`LoanDetailsView` cierra el formulario en
// `onPaymentSuccess`, y `PaymentForm` oculta el panel al salir del modo avanzado) para que el
// recibo desaparezca antes de poder imprimirlo, sin forma de recuperarlo.
//
// Al vivir un nivel más arriba, quien lo muestra decide cuándo cerrar el flujo: el recibo se
// ve siempre, y solo al cerrarlo se avisa de que el pago terminó.

import React from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  printAdvancedPaymentReceipt, type AdvancedReceiptData, type ReceiptFormat,
} from '@/utils/advancedPaymentReceipt';

const RECEIPT_FORMATS: { value: ReceiptFormat; label: string }[] = [
  { value: 'POS58', label: 'Ticket 58mm' },
  { value: 'POS80', label: 'Ticket 80mm' },
  { value: 'LETTER', label: 'Carta' },
];

interface Props {
  /** Mientras no sea null, el diálogo está abierto. */
  receipt: AdvancedReceiptData | null;
  /** Se llama al cerrar: es el momento de dar el pago por terminado. */
  onClose: () => void;
  /** Texto del encabezado. Cambia entre "pago recién hecho" y "reimpresión". */
  title?: string;
}

export const PaymentReceiptDialog = ({ receipt, onClose, title }: Props) => {
  const print = (format: ReceiptFormat) => {
    if (!receipt) return;
    const opened = printAdvancedPaymentReceipt(receipt, format);
    if (!opened) {
      toast.error(
        'El navegador bloqueó la ventana del recibo. Permite las ventanas emergentes de este sitio.'
      );
    }
  };

  return (
    <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            {title ?? 'Pago registrado'}
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              {receipt && (
                <>
                  Se aplicaron <strong>{formatCurrency(receipt.totalApplied)}</strong> a{' '}
                  {receipt.allocations.length}{' '}
                  {receipt.allocations.length === 1 ? 'cuota' : 'cuotas'}. Imprime el recibo con el
                  desglose de cuánto se abonó a cada una.
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {receipt && (
          <div className="max-h-48 overflow-y-auto rounded border text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Concepto</th>
                  <th className="px-2 py-1 text-right font-medium">Abonado</th>
                  <th className="px-2 py-1 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {receipt.allocations.map(a => (
                  <tr key={`${a.installmentNumber}-${a.dueDate}`} className="border-t">
                    <td className="px-2 py-1">
                      {a.isCharge ? 'Cargo' : 'Cuota'} #{a.installmentNumber}
                      <span className="ml-1 text-gray-400">
                        {formatDateStringForSantoDomingo(a.dueDate)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right font-semibold">{formatCurrency(a.applied)}</td>
                    <td className={`px-2 py-1 text-right ${a.settles ? 'text-green-700' : 'text-amber-700'}`}>
                      {a.settles ? 'Saldada' : `queda ${formatCurrency(a.pendingAfter)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Formato del recibo</p>
          <div className="grid grid-cols-3 gap-2">
            {RECEIPT_FORMATS.map(f => (
              <Button key={f.value} type="button" variant="outline" size="sm"
                onClick={() => print(f.value)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                {f.label}
              </Button>
            ))}
          </div>
          {/* Cerrar da el pago por terminado y sale del formulario, se haya impreso o no.
              Por eso el texto no dice "sin imprimir": tras imprimir sigue siendo el botón
              correcto y decirlo así hacía dudar de si el recibo se perdía. */}
          <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
            Terminar y volver
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentReceiptDialog;
