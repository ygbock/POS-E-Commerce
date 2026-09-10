import React, { useEffect, useRef, useId } from 'react';
import { modalManager } from '../services/modalManager';

export interface UseModalFocusTrapOptions {
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  modalId?: string;
}

export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  const focusableQuery =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const rawElements = Array.from(
    container.querySelectorAll(focusableQuery)
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
    } catch {
      // Fallback
    }

    // Exclude zero-dimension elements in rendered DOM (guard against simulated DOM where rects are 0x0)
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
}

/**
 * useModalFocusTrap
 * Provides accessible keyboard focus containment, Escape dismissal, stacked modal coordination,
 * and safe focus restoration on closing without crashing on detached DOM elements.
 */
export function useModalFocusTrap(
  isOpen: boolean,
  onClose: () => void,
  modalRef: React.RefObject<HTMLElement | null>,
  options: UseModalFocusTrapOptions = {}
) {
  const generatedId = useId();
  const id = options.modalId || generatedId;
  const { closeOnEscape = true, initialFocusRef } = options;

  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Capture active element before opening
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Register with modalManager
  useEffect(() => {
    if (isOpen) {
      modalManager.registerModal(id, {
        closeOnEscape,
        onEscape: onClose,
        titleId: id,
      });
    }

    return () => {
      if (isOpen) {
        modalManager.unregisterModal(id);
      }
    };
  }, [isOpen, closeOnEscape, onClose, id]);

  // Focus trap, initial focus, scroll lock, keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    // Body scroll lock
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Initial focus
    const timer = setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current && typeof initialFocusRef.current.focus === 'function') {
        initialFocusRef.current.focus();
        return;
      }

      if (modalRef.current) {
        const focusables = getFocusableElements(modalRef.current);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the top-most active modal handles keyboard trap and Escape
      if (!modalManager.isTopModal(id)) {
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
        const focusables = getFocusableElements(modalRef.current);

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

      // Safe Focus Restoration: verify element is still attached to document.body
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
  }, [isOpen, onClose, closeOnEscape, id, initialFocusRef, modalRef]);

  return {
    modalId: id,
    modalRef,
  };
}
