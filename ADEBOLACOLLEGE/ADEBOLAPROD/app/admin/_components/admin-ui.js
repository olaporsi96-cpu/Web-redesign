'use client';

export function PageHeading({ eyebrow = 'Learning administration', title, description, action }) {
  return (
    <div className="admin-page-heading">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="admin-heading-action">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="admin-empty-state">
      <span className="empty-state-icon" aria-hidden="true">▤</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function RetryState({ message, onRetry, loading = false }) {
  return (
    <div className="admin-empty-state" role="alert">
      <h3>Unable to load records</h3>
      <p>{message}</p>
      <button type="button" className="admin-button button-secondary" onClick={onRetry} disabled={loading}>
        {loading ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <span className="dialog-warning-icon" aria-hidden="true">!</span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="dialog-actions">
          <button type="button" className="admin-button button-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="admin-button button-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

export function FormDialog({ title, children, onClose }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="form-dialog-title">
        <div className="dialog-header">
          <h2 id="form-dialog-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Toast({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="admin-toast" role="status">
      <span aria-hidden="true">✓</span>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
    </div>
  );
}
