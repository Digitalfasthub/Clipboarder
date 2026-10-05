(function () {
  const DEFAULT_MAX_CHARS = 5000;

  let copyModeEnabled = false;
  let indicatorEl = null;

  chrome.storage.local.get('copyModeEnabled', (res) => {
    applyCopyMode(!!res.copyModeEnabled);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'COPY_MODE_CHANGED') {
      applyCopyMode(message.enabled);
    } else if (message.type === 'PASTE_TEXT') {
      insertItemAtCursor(normalizeItem(message.item));
    }
  });

  function normalizeItem(it) {
    if (!it) return null;
    if (typeof it === 'string') return { plain: it, html: null, truncated: false };
    return it;
  }

  function applyCopyMode(enabled) {
    if (enabled === copyModeEnabled) return;
    copyModeEnabled = enabled;
    if (enabled) {
      showIndicator();
      document.addEventListener('mouseup', handleSelection, true);
      document.addEventListener('mousemove', moveIndicator, true);
    } else {
      hideIndicator();
      document.removeEventListener('mouseup', handleSelection, true);
      document.removeEventListener('mousemove', moveIndicator, true);
    }
  }

  function showIndicator() {
    if (indicatorEl) return;
    indicatorEl = document.createElement('div');
    indicatorEl.id = '__clipboard_list_indicator__';
    indicatorEl.textContent = '➔ copy mode on';
    document.documentElement.appendChild(indicatorEl);
  }

  function hideIndicator() {
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
  }

  function moveIndicator(e) {
    if (!indicatorEl) return;
    indicatorEl.style.left = e.clientX + 14 + 'px';
    indicatorEl.style.top = e.clientY + 10 + 'px';
  }

  function handleSelection() {
    if (!copyModeEnabled) return;
    const sel = window.getSelection();
    const plainRaw = sel ? sel.toString() : '';
    if (!plainRaw || !plainRaw.trim()) return;

    // Capture a stable copy of the range now, before the async settings
    // lookup, since the live selection can change in the meantime.
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

    chrome.storage.local.get(['maxCharsPerItem', 'keepFormattingEnabled', 'keepLinksEnabled'], (res) => {
      const maxChars = res.maxCharsPerItem || DEFAULT_MAX_CHARS;
      const keepFormatting = !!res.keepFormattingEnabled;
      const keepLinks = !!res.keepLinksEnabled;

      const truncated = plainRaw.length > maxChars;
      const plain = truncated ? plainRaw.slice(0, maxChars) + '…' : plainRaw;

      let html = null;
      // Skip the expensive HTML clone/serialize entirely for anything that
      // had to be truncated - that is the costly part on huge selections.
      if (keepFormatting && !truncated && range) {
        try {
          const wrapper = document.createElement('div');
          wrapper.appendChild(range.cloneContents());
          const cleaned = sanitizeHtml(wrapper.innerHTML, keepLinks);
          // Safety valve: if markup bloated far past the plain-text cap
          // (deeply nested/styled source), drop it and keep plain text only.
          if (cleaned && cleaned.length <= maxChars * 6) html = cleaned;
        } catch (e) {
          html = null;
        }
      }

      chrome.runtime.sendMessage({ type: 'ADD_ITEM', item: { plain, html, truncated } });
    });

    flashIndicator();
  }

  function sanitizeHtml(html, keepLinks) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    wrapper.querySelectorAll('script, style, iframe, object, embed, link, meta, noscript, svg').forEach((n) => {
      n.remove();
    });

    wrapper.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
          node.removeAttribute(attr.name);
        }
      });
    });

    if (!keepLinks) {
      wrapper.querySelectorAll('a').forEach((a) => {
        a.replaceWith(document.createTextNode(a.textContent || ''));
      });
      wrapper.querySelectorAll('img').forEach((img) => img.remove());
    }

    return wrapper.innerHTML;
  }

  function flashIndicator() {
    if (!indicatorEl) return;
    indicatorEl.classList.add('__clipboard_list_flash__');
    setTimeout(() => {
      if (indicatorEl) indicatorEl.classList.remove('__clipboard_list_flash__');
    }, 200);
  }

  function insertItemAtCursor(item) {
    if (!item) return;
    const el = document.activeElement;
    if (!el) return;
    const plain = item.plain || '';

    const isTextInput =
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && /^(text|search|url|tel|email|password|number)$/i.test(el.type || 'text'));

    if (isTextInput) {
      // Plain inputs/textareas cannot hold formatting, so they always get
      // the plain-text version, even if a formatted one was captured.
      insertPlainTextIntoField(el, plain);
      return;
    }

    if (el.isContentEditable) {
      if (item.html) {
        let ok = false;
        try {
          ok = document.execCommand('insertHTML', false, item.html);
        } catch (e) {
          ok = false;
        }
        if (!ok) insertPlainTextIntoContentEditable(plain);
      } else {
        insertPlainTextIntoContentEditable(plain);
      }
      return;
    }

    // No normal editable target found at the cursor. This happens on
    // editors like Google Docs/Sheets/Slides, which render the document on
    // canvas and only expose a hidden, often cross-origin-iframe'd element
    // for keyboard capture - a content script has no DOM text box to insert
    // into there. Fall back to the real system clipboard so a manual
    // Ctrl+V still works - and carry the formatted HTML (links, bold, etc.)
    // along too, if it was captured, so it isn't lost on paste.
    copyItemToSystemClipboard(item);
    showToast('Copied — press Ctrl+V to paste here');
  }

  function copyItemToSystemClipboard(item) {
    const plain = item.plain || '';
    const html = item.html || null;

    if (html && navigator.clipboard && window.ClipboardItem) {
      try {
        const data = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        });
        navigator.clipboard.write([data]).catch(() => copyViaHiddenSelection(html, plain));
        return;
      } catch (e) {
        // fall through to the legacy method below
      }
    }

    if (html) {
      copyViaHiddenSelection(html, plain);
      return;
    }

    copyPlainTextToSystemClipboard(plain);
  }

  // Legacy fallback: build the HTML in a hidden editable element, select
  // it, and use execCommand('copy'). When copying an actual DOM selection
  // this way, the browser natively populates both text/html and text/plain
  // on the clipboard, so links/formatting survive even without the async
  // Clipboard API.
  function copyViaHiddenSelection(html, plain) {
    let ok = false;
    try {
      const holder = document.createElement('div');
      holder.setAttribute('contenteditable', 'true');
      holder.style.position = 'fixed';
      holder.style.top = '-2000px';
      holder.style.left = '-2000px';
      holder.style.opacity = '0';
      holder.innerHTML = html;
      document.body.appendChild(holder);

      const range = document.createRange();
      range.selectNodeContents(holder);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      ok = document.execCommand('copy');

      sel.removeAllRanges();
      document.body.removeChild(holder);
    } catch (e) {
      ok = false;
    }
    if (!ok) copyPlainTextToSystemClipboard(plain);
  }

  function copyPlainTextToSystemClipboard(text) {
    let ok = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      ok = false;
    }
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.id = '__clipboard_list_toast__';
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function insertPlainTextIntoField(el, text) {
    const start = el.selectionStart != null ? el.selectionStart : el.value.length;
    const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const newPos = start + text.length;
    el.selectionStart = el.selectionEnd = newPos;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertPlainTextIntoContentEditable(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
    const el = document.activeElement;
    if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
  }
})();
