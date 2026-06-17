export interface GrepNavigationRequest {
  tabId: string;
  sourceType: "browser-tab" | "agent-chat";
  pattern: string;
  caseInsensitive: boolean;
  lineText: string;
  lineNumber: number;
}

export function buildGrepHighlightScript(options: {
  pattern: string;
  caseInsensitive: boolean;
  lineText: string;
}): string {
  return `(() => {
    const opts = ${JSON.stringify(options)};
    const HIGHLIGHT_CLASS = "blueberry-grep-highlight";
    const STYLE_ID = "blueberry-grep-style";

    const clearHighlights = () => {
      document.querySelectorAll("mark." + HIGHLIGHT_CLASS).forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      });
    };

    const ensureStyles = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent =
        "mark." + HIGHLIGHT_CLASS + " { background: #fef08a; color: inherit; border-radius: 2px; box-shadow: 0 0 0 2px #eab308; }";
      document.head.appendChild(style);
    };

    const textNodeFilter = {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest("script, style, noscript, textarea, mark." + HIGHLIGHT_CLASS)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    };

    const highlightRange = (node, start, length) => {
      const text = node.textContent || "";
      const end = Math.min(start + length, text.length);
      if (start < 0 || end <= start) return null;

      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);

      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      range.surroundContents(mark);
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      return mark;
    };

    const findInTextNodes = (searchValue, useRegex) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        textNodeFilter,
      );

      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent || "";
        let matchIndex = -1;
        let matchLength = 0;

        if (useRegex) {
          try {
            const flags = opts.caseInsensitive ? "i" : "";
            const regex = new RegExp(searchValue, flags);
            const match = regex.exec(text);
            if (match && typeof match.index === "number") {
              matchIndex = match.index;
              matchLength = match[0].length;
            }
          } catch {
            return null;
          }
        } else {
          const haystack = opts.caseInsensitive ? text.toLowerCase() : text;
          const needle = opts.caseInsensitive
            ? searchValue.toLowerCase()
            : searchValue;
          const idx = haystack.indexOf(needle);
          if (idx !== -1) {
            matchIndex = idx;
            matchLength = searchValue.length;
          }
        }

        if (matchIndex === -1) continue;
        return highlightRange(node, matchIndex, matchLength);
      }

      return null;
    };

    clearHighlights();
    ensureStyles();

    const trimmedLine = (opts.lineText || "").trim();
    const searchCandidates = [];

    if (trimmedLine.length >= 4) {
      searchCandidates.push({ value: trimmedLine, regex: false });
      if (trimmedLine.length > 80) {
        searchCandidates.push({ value: trimmedLine.slice(0, 80), regex: false });
      }
    }

    if (opts.pattern) {
      searchCandidates.push({ value: opts.pattern, regex: true });
    }

    for (const candidate of searchCandidates) {
      if (findInTextNodes(candidate.value, candidate.regex)) {
        return { success: true };
      }
    }

    return { success: false };
  })()`;
}
