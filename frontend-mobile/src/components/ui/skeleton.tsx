import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={clsx('rounded-md animate-pulse', className)}
      style={{
        background: 'hsl(var(--muted))',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export { Skeleton };
