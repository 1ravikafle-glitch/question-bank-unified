import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const selectVariants = cva(
  'select',
  {
    variants: {
      variant: {
        default: '',
        outline: 'border border-input',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface SelectProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div ref={ref} className={selectVariants({ variant, className })} {...props} />
  )
);
Select.displayName = 'Select';

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={`select-trigger flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3.5 py-2.5 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
    aria-haspopup="listbox"
    {...props}
  />
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectValue: React.FC<{ placeholder?: string; className?: string }> = ({
  className,
  placeholder,
}) => (
  <div className={`select-value flex h-full items-center truncate ${className ?? ''}`} aria-hidden="true">
    {placeholder}
  </div>
);
SelectValue.displayName = 'SelectValue';

export const SelectIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={`select-icon h-5 w-5 flex-shrink-0 ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
);
SelectIcon.displayName = 'SelectIcon';

export const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={`select-content z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-2 text-base shadow-lg ${className ?? ''}`}
      {...props}
    />
  )
);
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(({ className, disabled = false, ...props }, ref) => (
  <div
    ref={ref}
    className={`select-item relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-9 pr-3 text-base outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className ?? ''}`}
    aria-disabled={disabled}
    {...props}
  />
));
SelectItem.displayName = 'SelectItem';

export const SelectItemIndicator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={`select-item-indicator absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none ${className ?? ''}`}
      {...props}
    />
  )
);
SelectItemIndicator.displayName = 'SelectItemIndicator';

export const SelectItemText = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={`select-item-text flex w-full flex-none items-center justify-between ${className ?? ''}`} {...props} />
  )
);
SelectItemText.displayName = 'SelectItemText';

export { selectVariants, Select };
export type { SelectProps };
