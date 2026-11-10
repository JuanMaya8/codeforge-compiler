import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'error';
}

/** Informative placeholder for a tab without data. */
export function EmptyState({ title, children, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state--${tone}`}>
      <p className="empty-state__title">{title}</p>
      {children && <div className="empty-state__body">{children}</div>}
    </div>
  );
}
