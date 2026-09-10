import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { modalManager } from '../../services/modalManager';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  ariaDescribedBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnEscape = true,
  closeOnBackdropClick = true,
  ariaDescribedBy,
  initialFocusRef,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Capture active element before modal opens for safe restoration on close
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Coordinate modal stack registration with modalManager
  useEffect(() => {
    if (isOpen) {
      modalManager.registerModal(titleId, {
        closeOnEscape,
        onEscape: onClose,
        titleId,
      });
    }

    return () => {
      if (isOpen) {
        modalManager.unregisterModal(titleId);
      }
    };
  }, [isOpen, closeOnEscape, onClose, titleId]);

  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableQuery = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = (): HTMLElement[] => {
      if (!modalRef.current) return [];
      const rawElements = Array.from(
        modalRef.current.querySelectorAll(focusableQuery)
      ) as HTMLElement[];

      return rawElements.filter((el) => {
        // Exclude disabled elements
        if (el.hasAttribute('disabled') || (el as any).disabled) {
          return false;
        }

        // Exclude elements with tabindex="-1"
        if (el.getAttribute('tabindex') === '-1') {
          return false;
        }

        // Exclude elements hidden via inline style or classes (display: none, visibility: hidden)
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
          }
        } catch (e) {
          // Fallback if window or computed style is unavailable
        }

        // Exclude zero-dimension elements in rendered DOM (guard against JSDOM/simulated DOM where all rects are 0x0)
        const rect = el.getBoundingClientRect();
        if (typeof window !== 'undefined' && window.innerWidth > 0) {
          if (rect.width === 0 && rect.height === 0 && el.offsetWidth === 0 && el.offsetHeight === 0) {
            if (el.offsetParent === null && (el as HTMLElement).style?.position !== 'fixed') {
              return false;
            }
          }
        }

        return true;
      });
    };

    // Initial focus placement: preferred initialFocusRef, first focusable, or modal container
    const timer = setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current && typeof initialFocusRef.current.focus === 'function') {
        initialFocusRef.current.focus();
        return;
      }

      if (modalRef.current) {
        const focusables = getFocusableElements();
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    // Keyboard handlers: Escape to close and Tab focus trapping (strictly for topmost modal)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the top-most modal handles keyboard focus trap & Escape
      if (!modalManager.isTopModal(titleId)) {
        return;
      }

      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (closeOnEscape) {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = getFocusableElements();

        if (focusables.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: wrap from first to last or pull focus into modal if outside
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: wrap from last to first or pull focus into modal if outside
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Safe Focus Restoration: verify element is still attached to the DOM before restoring
      if (
        triggerElementRef.current &&
        document.body.contains(triggerElementRef.current) &&
        typeof triggerElementRef.current.focus === 'function'
      ) {
        try {
          triggerElementRef.current.focus();
        } catch {
          // Guard against any unforeseen focus restoration exception
        }
      }
    };
  }, [isOpen, onClose, closeOnEscape, titleId, initialFocusRef]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full m-0 h-full rounded-none',
  };

  const handleBackdropClick = () => {
    if (closeOnBackdropClick) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="none"
    >
      {/* Backdrop with transition */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs transition-opacity animate-[fadeIn_0.2s_ease-out]"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {})}
        tabIndex={-1}
        className={`w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl flex flex-col focus:outline-none overflow-hidden max-h-[90vh] z-10 transition-all animate-[slideUp_0.25s_ease-out] ${sizeClasses[size]}`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2
            id={titleId}
            className="text-base font-bold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-600 dark:text-slate-300">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
