const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let triggerElement: HTMLElement | null = null;

export function setFocusTrigger(element: HTMLElement | null): void {
  triggerElement = element;
}

export function returnFocusToTrigger(): void {
  if (triggerElement && document.contains(triggerElement)) {
    triggerElement.focus();
  }
  triggerElement = null;
}

export function focusTrap(node: HTMLElement): { destroy: () => void } {
  const focusable = () =>
    [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
    );

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") {
      return;
    }
    const items = focusable();
    if (items.length === 0) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  node.addEventListener("keydown", handleKeydown);
  const items = focusable();
  if (items.length > 0) {
    items[0].focus();
  }

  return {
    destroy() {
      node.removeEventListener("keydown", handleKeydown);
    },
  };
}
