const textInputTypes = new Set(["", "text", "search", "email", "url", "tel", "number", "password"]);

function isTypingField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false;
  if (element.tagName === "TEXTAREA") return true;
  return element.tagName === "INPUT" && textInputTypes.has(((element as HTMLInputElement).type || "").toLowerCase());
}

// Puts the cursor back in the box you were typing in after switching tabs or apps.
export function keepTypingFocus(doc: Document = document, win: Window = window) {
  let saved: { field: HTMLInputElement | HTMLTextAreaElement; id: string; start: number | null; end: number | null } | null = null;

  function remember() {
    const field = doc.activeElement;
    if (!isTypingField(field)) {
      saved = null;
      return;
    }
    let start: number | null = null;
    let end: number | null = null;
    try {
      start = field.selectionStart;
      end = field.selectionEnd;
    } catch {}
    saved = { field, id: field.id, start, end };
  }

  function restore() {
    if (!saved || doc.visibilityState === "hidden") return;
    const active = doc.activeElement;
    // Something else got the cursor (like a popup), so leave it there.
    if (active && active !== doc.body && active !== doc.documentElement) return;
    const field = saved.field.isConnected
      ? saved.field
      : saved.id ? doc.getElementById(saved.id) : null;
    if (!isTypingField(field) || field.disabled || field.readOnly) return;
    if (field.closest("[hidden], dialog:not([open])") || !field.getClientRects().length) return;
    const openDialog = doc.querySelector("dialog[open]");
    if (openDialog && !openDialog.contains(field)) return;
    field.focus({ preventScroll: true });
    if (saved.start !== null && saved.end !== null) {
      try {
        field.setSelectionRange(saved.start, saved.end);
      } catch {}
    }
  }

  function restoreSoon() {
    restore();
    // Syncing after you come back can redraw parts of the page, so try again a moment later.
    win.setTimeout(restore, 150);
    win.setTimeout(restore, 1000);
  }

  win.addEventListener("blur", remember);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") {
      if (isTypingField(doc.activeElement)) remember();
    } else {
      restoreSoon();
    }
  });
  win.addEventListener("focus", restoreSoon);
  // A click or key press back in the page means you've moved on; stop restoring.
  doc.addEventListener("pointerdown", () => { saved = null; }, true);
  doc.addEventListener("focusin", (event) => {
    if (saved && event.target !== saved.field) saved = null;
  });
}
