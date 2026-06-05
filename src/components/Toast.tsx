import React from 'react'
import type { ToastMessage } from '../hooks/useAppState'

interface ToastProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

const iconMap: Record<ToastMessage['type'], string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}

const colorMap: Record<ToastMessage['type'], string> = {
  success: 'alert-success',
  error: 'alert-error',
  warning: 'alert-warning',
  info: 'alert-info'
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast ${colorMap[toast.type]}`}
          onClick={() => onDismiss(toast.id)}
        >
          <span>{iconMap[toast.type]}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
