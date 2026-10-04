'use client'

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  /** Disable the confirm button, e.g. when the action is blocked. */
  confirmDisabled?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  confirmDisabled = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-6">
        <div className="flex gap-4 items-start text-gray-600">
          <div
            className={`p-2 rounded-full shrink-0 ${
              variant === 'danger' ? 'bg-red-50 text-red-500' : 'bg-[#E8F0EA] text-[#5A7A60]'
            }`}
          >
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <div className="text-sm leading-relaxed">{message}</div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
export { ConfirmDialog };
