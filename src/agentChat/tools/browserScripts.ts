export function buildScrollScript(options: {
  deltaX?: number;
  deltaY?: number;
  scrollX?: number;
  scrollY?: number;
  selector?: string;
}): string {
  return `(() => {
    const opts = ${JSON.stringify(options)};

    if (opts.selector) {
      const element = document.querySelector(opts.selector);
      if (!element) {
        return { success: false, reason: "selector not found" };
      }
      element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      return {
        success: true,
        mode: "selector",
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }

    if (typeof opts.scrollY === "number" || typeof opts.scrollX === "number") {
      window.scrollTo({
        left: typeof opts.scrollX === "number" ? opts.scrollX : window.scrollX,
        top: typeof opts.scrollY === "number" ? opts.scrollY : window.scrollY,
        behavior: "instant",
      });
      return {
        success: true,
        mode: "position",
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }

    const deltaX = typeof opts.deltaX === "number" ? opts.deltaX : 0;
    const deltaY = typeof opts.deltaY === "number" ? opts.deltaY : 0;
    if (deltaX === 0 && deltaY === 0) {
      return { success: false, reason: "no scroll parameters provided" };
    }

    window.scrollBy({ left: deltaX, top: deltaY, behavior: "instant" });
    return {
      success: true,
      mode: "delta",
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  })()`;
}

export function buildClickScript(options: {
  x?: number;
  y?: number;
  selector?: string;
  shiftKey?: boolean;
}): string {
  return `(() => {
    const opts = ${JSON.stringify(options)};
    let target = null;

    if (opts.selector) {
      target = document.querySelector(opts.selector);
    } else if (typeof opts.x === "number" && typeof opts.y === "number") {
      target = document.elementFromPoint(opts.x, opts.y);
    }

    if (!target || !(target instanceof Element)) {
      return { success: false, reason: "no clickable target found" };
    }

    target.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });

    const rect = target.getBoundingClientRect();
    const clientX =
      typeof opts.x === "number" ? opts.x : rect.left + rect.width / 2;
    const clientY =
      typeof opts.y === "number" ? opts.y : rect.top + rect.height / 2;
    const shiftKey = Boolean(opts.shiftKey);

    if (
      shiftKey &&
      target instanceof HTMLAnchorElement &&
      target.href &&
      target.href !== "#"
    ) {
      window.open(target.href, "_blank", "noopener,noreferrer");
      return {
        success: true,
        action: "opened in new tab",
        href: target.href,
        tag: target.tagName,
      };
    }

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      shiftKey,
      button: 0,
    };

    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...eventInit,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(new MouseEvent("mousedown", eventInit));
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        ...eventInit,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(new MouseEvent("mouseup", eventInit));
    target.dispatchEvent(new MouseEvent("click", eventInit));

    return {
      success: true,
      action: "clicked",
      tag: target.tagName,
      text: (target.textContent || "").trim().slice(0, 120),
      x: clientX,
      y: clientY,
      shiftKey,
    };
  })()`;
}

export function buildTypeScript(options: {
  text: string;
  selector?: string;
  clearFirst?: boolean;
}): string {
  return `(() => {
    const opts = ${JSON.stringify(options)};
    const text = String(opts.text ?? "");
    if (!text) {
      return { success: false, reason: "text is required" };
    }

    let element = opts.selector
      ? document.querySelector(opts.selector)
      : document.activeElement;

    if (!element || !(element instanceof HTMLElement)) {
      return { success: false, reason: "no editable element found" };
    }

    const isEditable =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.isContentEditable;

    if (!isEditable) {
      return { success: false, reason: "element is not editable" };
    }

    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (opts.clearFirst) {
        element.value = "";
      }
      element.value = opts.clearFirst ? text : element.value + text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        success: true,
        tag: element.tagName,
        value: element.value.slice(0, 200),
      };
    }

    if (element.isContentEditable) {
      if (opts.clearFirst) {
        element.textContent = "";
      }
      element.textContent = opts.clearFirst
        ? text
        : (element.textContent || "") + text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        success: true,
        tag: element.tagName,
        value: (element.textContent || "").slice(0, 200),
      };
    }

    return { success: false, reason: "unsupported editable element" };
  })()`;
}
