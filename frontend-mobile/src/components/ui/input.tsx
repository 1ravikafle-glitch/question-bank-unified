import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'input',
  {
    variants: {
      variant: {
        default: '',
        outline: 'border border-input',
        filled: 'bg-muted/50',
        flushed: 'border-b border-b-input',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={inputVariants({ variant, className })}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { inputVariants, Input };
export type { InputProps };
