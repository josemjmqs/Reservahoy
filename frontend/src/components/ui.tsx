import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { extendTailwindMerge } from 'tailwind-merge';

// twMerge resuelve los choques: la clase que pasa quien usa el componente
// (ej. `w-48`) reemplaza a la del componente (`w-full`) en vez de competir con
// ella. Conoce los nombres propios del sistema visual (globals.css) para que
// `rounded-full` reemplace a `rounded-control` y `text-ink` no se tome por un tamaño
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['ink', 'muted', 'line', 'paper', 'accent', 'accent-hover', 'accent-soft'],
      radius: ['control', 'card', 'sheet'],
      shadow: ['float'],
    },
  },
});

const cx = (...c: (string | false | undefined)[]) => twMerge(c.filter(Boolean).join(' '));

type ButtonVariant = 'primary' | 'secondary' | 'danger';

// Estilo de botón, también para un <Link> que debe verse como botón
// (nunca un <button> dentro de un <Link>: son dos controles anidados). En un
// enlace agregar `inline-flex items-center` para que el alto fijo centre el texto
export const buttonClass = (variant: ButtonVariant = 'primary', className?: string) =>
  cx(
    'rounded-control px-4 py-2 text-sm font-medium transition-colors',
    // Al presionar baja un pixel: responde al toque sin animar nada más
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    // Solo la acción principal va en seminegrita: las secundarias no compiten con ella
    variant === 'primary' && 'bg-accent font-semibold text-white hover:bg-accent-hover',
    variant === 'secondary' &&
      'border border-gray-300 bg-white text-ink hover:border-gray-400 hover:bg-paper',
    variant === 'danger' &&
      'border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50',
    className,
  );

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

// Campos de texto: mismo borde y foco en Input y Textarea. En el celular, 16 px
// (text-base): con menos, Safari en iPhone agranda la página al tocar el campo
// y no la vuelve a achicar (el panel quedaba "con zoom" tras registrarse). Lo
// revisa e2e/mobile-viewports.spec.ts
const fieldClass =
  'w-full rounded-control border border-gray-300 bg-white px-3 py-2 text-base text-ink sm:text-sm ' +
  'placeholder:text-gray-400 hover:border-gray-400 ' +
  'focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft';

export function Input({
  className,
  ...props
}: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={cx(
        fieldClass,
        // Deshabilitado (ej. el horario del profesional, en solo lectura) se
        // ve gris para no parecer editable
        'disabled:cursor-default disabled:border-line disabled:bg-paper disabled:text-muted',
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClass, className)} />;
}

// Campo con etiqueta visible: el placeholder desaparece al escribir, la etiqueta no
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-gray-800">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

// Agrupa contenido sobre el fondo: borde, sin sombra (la sombra queda para lo
// que flota, como los diálogos)
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx('rounded-card border border-line bg-white p-4', className)}
    />
  );
}
