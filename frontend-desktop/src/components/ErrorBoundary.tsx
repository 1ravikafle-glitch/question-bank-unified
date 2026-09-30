import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Route-level safety net: a render crash in one screen shows a recovery
 * card instead of blanking the whole app. Remounted on every route change
 * (parent passes key={pathname}), so navigating away always recovers.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      console.error('[Route error]', error);
    } catch {
      /* logging must never throw */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="card"
          role="alert"
          style={{ padding: '2.5rem 2rem', textAlign: 'center', maxWidth: 560, margin: '3rem auto' }}
        >
          <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(var(--foreground))', margin: '0 0 0.5rem' }}>
            Something went wrong here
          </p>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            This section hit an error. Your data and progress are safe.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = '/';
            }}
          >
            Back to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
