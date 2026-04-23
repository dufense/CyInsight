import { Component, type ReactNode } from "react";
import { DataSourceBadge, type DataSourceBadgeProps } from "./data-source-badge";

interface SafeState {
  hasError: boolean;
}

/**
 * SafeDataSourceBadge wraps DataSourceBadge in a tiny error boundary.
 * If DataSourceBadge throws for any reason (localStorage edge cases,
 * hook violations, etc.), this catches it and renders null so the
 * entire Dashboard module is not taken down.
 */
class SafeDataSourceBadgeInner extends Component<
  DataSourceBadgeProps,
  SafeState
> {
  constructor(props: DataSourceBadgeProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SafeState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log silently so operators can still see it in dev-tools / Sentry
    console.error(
      "[SafeDataSourceBadge] Suppressed DataSourceBadge crash:",
      error?.message,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) return null;
    return <DataSourceBadge {...this.props} />;
  }
}

export function SafeDataSourceBadge(props: DataSourceBadgeProps) {
  return <SafeDataSourceBadgeInner {...props} />;
}
