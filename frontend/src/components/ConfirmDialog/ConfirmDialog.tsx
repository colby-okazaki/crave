import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../Button/Button";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Small "Are you sure?" pop-up. Uses the browser's <dialog>, which handles
 * focus, the Escape key and blocking the page behind it for us.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      // Escape key.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // Tapping the dim area outside the card.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.card}>
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        {children && <p className={styles.body}>{children}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
