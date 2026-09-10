import * as React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`label flex items-center text-base font-medium text-muted-foreground ${className ?? ''}`}
        htmlFor={htmlFor}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';

export { Label };
export type { LabelProps };
