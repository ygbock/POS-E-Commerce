import { useEffect, useCallback } from 'react';
import { modalManager } from '../services/modalManager';

export interface PosShortcutHandlers {
  /** F2: Focus product catalog search input */
  onFocusSearch?: () => void;
  /** F3: Focus customer selector or quick-add customer dialog */
  onFocusCustomer?: () => void;
  /** F4: Toggle cart view / quick sale */
  onToggleCart?: () => void;
  /** F7: Open Customer Returns dialog */
  onOpenReturns?: () => void;
  /** F8: Hold / Suspend current cart */
  onHoldCart?: () => void;
  /** F9: Open Payment Tender modal (STRICTLY opens dialog; NEVER triggers payment mutation) */
  onOpenTender?: () => void;
  /** F10: Open Register Shift / Reconciliation modal */
  onOpenShift?: () => void;
  /** Escape: Clear active search or blur current control (when NO modal is open) */
  onEscape?: () => void;
}

export interface UsePosKeyboardShortcutsOptions {
  enabled?: boolean;
}

/**
 * Checks whether an element is an interactive input where keystrokes
 * must be preserved for text entry rather than intercepted as hotkeys.
 */
export function isInteractiveInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();

  // Guard all standard form entry fields
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  // Guard contenteditable elements
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}

/**
 * Centralized POS Global Keyboard Shortcuts Hook
 * Provides safe, context-aware keyboard shortcuts for POS operations.
 * - Suppresses shortcuts when typing inside form inputs (except Escape to blur/clear)
 * - Suppresses all POS shortcuts when any modal dialog is currently open
 * - Preserves all native browser shortcuts (Ctrl+C, Ctrl+V, F5, Alt+Tab, etc.)
 * - Invariant: Zero shortcuts directly execute financial mutations or finalize checkout.
 */
export function usePosKeyboardShortcuts(
  handlers: PosShortcutHandlers,
  options: UsePosKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // 1. Never intercept standard browser modifier shortcuts (Ctrl+C, Ctrl+V, Ctrl+A, Meta+*, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Exception: Alt alone is not intercepted, but combinations are left to browser/OS
        return;
      }

      // 2. Never hijack native refresh / developer tools
      if (e.key === 'F5' || e.key === 'F12') {
        return;
      }

      // 3. Modal open guard: if any modal is currently active, all POS hotkeys are suppressed
      if (modalManager.isAnyModalOpen()) {
        return;
      }

      const isInput = isInteractiveInputElement(e.target);

      // 4. Handle Escape:
      // If typing in an input, Escape blurs the input or clears search without triggering page actions
      if (e.key === 'Escape') {
        if (isInput && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        if (handlers.onEscape) {
          e.preventDefault();
          handlers.onEscape();
        }
        return;
      }

      // 5. Input protection: if focused inside an interactive text input, do NOT execute functional hotkeys
      // (e.g. typing 'F' or numbers into customer search/quantity must not trigger shortcuts)
      // Note: Function keys (F1-F12) can still be safely triggered even when focused in an input
      // because they do not produce printable text characters.
      const isFunctionKey = /^F[1-9]|F1[0-2]$/.test(e.key);
      if (isInput && !isFunctionKey) {
        return;
      }

      // 6. Safe POS Command Dispatch
      switch (e.key) {
        case 'F2':
          if (handlers.onFocusSearch) {
            e.preventDefault();
            handlers.onFocusSearch();
          }
          break;

        case 'F3':
          if (handlers.onFocusCustomer) {
            e.preventDefault();
            handlers.onFocusCustomer();
          }
          break;

        case 'F4':
          if (handlers.onToggleCart) {
            e.preventDefault();
            handlers.onToggleCart();
          }
          break;

        case 'F7':
          if (handlers.onOpenReturns) {
            e.preventDefault();
            handlers.onOpenReturns();
          }
          break;

        case 'F8':
          if (handlers.onHoldCart) {
            e.preventDefault();
            handlers.onHoldCart();
          }
          break;

        case 'F9':
          // FINANCIAL SAFETY: Strictly opens the tender dialogue.
          // NEVER authorizes or finalizes checkout.
          if (handlers.onOpenTender) {
            e.preventDefault();
            handlers.onOpenTender();
          }
          break;

        case 'F10':
          if (handlers.onOpenShift) {
            e.preventDefault();
            handlers.onOpenShift();
          }
          break;

        default:
          break;
      }
    },
    [enabled, handlers]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
