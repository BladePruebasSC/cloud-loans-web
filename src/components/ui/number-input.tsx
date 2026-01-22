import * as React from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

type NumberInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Clase extra para el contenedor de flechas */
  stepperClassName?: string;
};

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, stepperClassName, onWheel, ...props }, ref) => {
    const isDisabled = Boolean(props.disabled);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const dispatchInputEvents = React.useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      // Disparar eventos para que react-hook-form detecte el cambio
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, []);

    const stepUp = React.useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      if (isDisabled) return;
      el.stepUp();
      dispatchInputEvents();
      el.focus();
    }, [dispatchInputEvents, isDisabled]);

    const stepDown = React.useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      if (isDisabled) return;
      el.stepDown();
      dispatchInputEvents();
      el.focus();
    }, [dispatchInputEvents, isDisabled]);

    const handleWheel: React.WheelEventHandler<HTMLInputElement> = (e) => {
      onWheel?.(e);
      // Evitar que la rueda cambie el número (comportamiento default del input number)
      // Se hace blur solo cuando está enfocado para no afectar el scroll normal de la página.
      if (document.activeElement === e.currentTarget) {
        e.currentTarget.blur();
      }
    };

    return (
      <div className="relative">
        <input
          type="number"
          ref={inputRef}
          onWheel={handleWheel}
          className={cn(
            // Base (mismo estilo que `Input`)
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            // Espacio para las flechas custom
            "pr-10",
            // Ocultar flechas nativas
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className
          )}
          {...props}
        />

        <div
          className={cn(
            "absolute right-0 top-0 h-full w-10 overflow-hidden rounded-r-md border-l border-input",
            "flex flex-col bg-background",
            isDisabled && "opacity-50 pointer-events-none",
            stepperClassName
          )}
        >
          <button
            type="button"
            aria-label="Incrementar"
            className={cn(
              "flex h-1/2 items-center justify-center",
              "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={stepUp}
            tabIndex={-1}
            disabled={isDisabled}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Disminuir"
            className={cn(
              "flex h-1/2 items-center justify-center border-t border-input",
              "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={stepDown}
            tabIndex={-1}
            disabled={isDisabled}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }
);

NumberInput.displayName = "NumberInput";

export { NumberInput };

