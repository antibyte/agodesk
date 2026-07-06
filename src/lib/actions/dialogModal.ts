/** Opens/closes a native `<dialog>` via `showModal()` so it lands in the top layer. */
export function dialogModal(
  node: HTMLDialogElement,
  params: { open: boolean; onClose?: () => void },
): { update: (next: { open: boolean; onClose?: () => void }) => void; destroy: () => void } {
  let current = params;

  function sync(open: boolean): void {
    if (open) {
      if (!node.open) {
        node.showModal();
      }
      return;
    }
    if (node.open) {
      node.close();
    }
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    current.onClose?.();
  }

  function handleClick(event: MouseEvent): void {
    if (event.target === node) {
      current.onClose?.();
    }
  }

  node.addEventListener("cancel", handleCancel);
  node.addEventListener("click", handleClick);
  sync(current.open);

  return {
    update(next) {
      current = next;
      sync(current.open);
    },
    destroy() {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("click", handleClick);
      if (node.open) {
        node.close();
      }
    },
  };
}
