import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'btn',
  {
    variants: {
      variant: {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        destructive: 'btn-destructive',
        outline: 'btn-outline',
        ghost: 'btn-ghost',
        link: 'btn-link',
      },
      size: {
        sm: 'px-3 py-2 text-sm',
        lg: 'px-6 py-4 text-base',
        icon: 'h-10 w-10',
        default: 'px-6 py-3 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        aria-disabled={props.disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { buttonVariants, Button };
export type { ButtonProps };