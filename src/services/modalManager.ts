/**
 * Centralized Modal Stack & Accessibility Manager
 * Coordinates focus trapping, stacked modals, and global Escape dispatch.
 * Ensures top-most modal owns keyboard focus and Escape handling without competition.
 */

export interface ModalRegistrationOptions {
  closeOnEscape?: boolean;
  onEscape?: () => void;
  titleId?: string;
}

interface ModalEntry {
  id: string;
  closeOnEscape: boolean;
  onEscape?: () => void;
  titleId?: string;
}

class ModalManager {
  private modalStack: ModalEntry[] = [];
  private listeners: Set<() => void> = new Set();

  /**
   * Register an open modal instance in the stack.
   * Newest modal becomes top-most and gains exclusive keyboard trap/escape ownership.
   */
  public registerModal(id: string, options: ModalRegistrationOptions = {}): void {
    // Remove if already present (re-registration / update)
    this.modalStack = this.modalStack.filter((m) => m.id !== id);

    this.modalStack.push({
      id,
      closeOnEscape: options.closeOnEscape !== false,
      onEscape: options.onEscape,
      titleId: options.titleId,
    });

    this.notifyListeners();
  }

  /**
   * Unregister a closed modal from the stack.
   * Focus ownership naturally reverts to the next top-most modal in the stack.
   */
  public unregisterModal(id: string): void {
    const prevLength = this.modalStack.length;
    this.modalStack = this.modalStack.filter((m) => m.id !== id);

    if (this.modalStack.length !== prevLength) {
      this.notifyListeners();
    }
  }

  /**
   * Checks if the given modal ID is the top-most active modal in the stack.
   */
  public isTopModal(id: string): boolean {
    if (this.modalStack.length === 0) return false;
    return this.modalStack[this.modalStack.length - 1].id === id;
  }

  /**
   * Checks if any modal is currently open in the application.
   */
  public isAnyModalOpen(): boolean {
    return this.modalStack.length > 0;
  }

  /**
   * Returns the count of currently open modals.
   */
  public getOpenModalCount(): number {
    return this.modalStack.length;
  }

  /**
   * Returns the top-most modal entry if any exists.
   */
  public getTopModal(): ModalEntry | undefined {
    if (this.modalStack.length === 0) return undefined;
    return this.modalStack[this.modalStack.length - 1];
  }

  /**
   * Global Escape key coordinator.
   * If a top modal is active:
   * - If dismissible (closeOnEscape !== false): invokes onEscape, stops propagation, returns true.
   * - If non-dismissible: stops propagation, prevents global actions from firing, returns true.
   * Returns false if no modal was open (allowing underlying handlers to respond).
   */
  public handleGlobalEscape(e: KeyboardEvent): boolean {
    if (this.modalStack.length === 0) return false;

    const topModal = this.modalStack[this.modalStack.length - 1];

    // Modal is open, so Escape must not leak to underlying POS handlers
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    if (topModal.closeOnEscape && topModal.onEscape) {
      topModal.onEscape();
    }

    return true;
  }

  /**
   * Subscribe to stack changes (e.g. for components or hooks that need reactive modal count).
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Reset stack (primarily for testing and clean teardowns).
   */
  public reset(): void {
    this.modalStack = [];
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in modalManager listener:', err);
      }
    });
  }
}

export const modalManager = new ModalManager();
