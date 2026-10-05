const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_CHARS = 5000;
const TOTAL_CHAR_BUDGET = 300000; // mirrors the hard backstop in background.js

function normalizeItem(it) {
  if (!it) return { plain: '', html: null, truncated: false };
  if (typeof it === 'string') return { plain: it, html: null, truncated: false };
  return { plain: it.plain || '', html: it.html || null, truncated: !!it.truncated };
}

function itemCharCount(it) {
  const n = normalizeItem(it);
  return n.plain.length + (n.html ? n.html.length : 0);
}

function totalCharCount(items) {
  return items.reduce((sum, it) => sum + itemCharCount(it), 0);
}

// Clamp items/maxChars to sane bounds, scale maxChars down if the combo
// would exceed the total budget, then retroactively trim existing items so
// lowering a limit frees memory immediately instead of only going forward.
function applyLimits(limitValRaw, maxCharsValRaw, items) {
  let limitVal = parseInt(limitValRaw, 10);
  let maxCharsVal = parseInt(maxCharsValRaw, 10);
  if (!limitVal || limitVal < 1) limitVal = 1;
  if (limitVal > 200) limitVal = 200;
  if (!maxCharsVal || maxCharsVal < 200) maxCharsVal = 200;
  if (maxCharsVal > 50000) maxCharsVal = 50000;

  if (limitVal * maxCharsVal > TOTAL_CHAR_BUDGET) {
    maxCharsVal = Math.max(200, Math.floor(TOTAL_CHAR_BUDGET / limitVal));
  }

  let trimmedItems = items.slice(-limitVal).map((raw) => {
    const n = normalizeItem(raw);
    let plain = n.plain;
    let html = n.html;
    let truncated = n.truncated;
    if (plain.length > maxCharsVal) {
      plain = plain.slice(0, maxCharsVal) + '…';
      truncated = true;
      html = null; // stale/mismatched formatting after a hard trim - drop it
    }
    if (html && html.length > maxCharsVal * 4) html = null;
    return { plain, html, truncated };
  });

  while (trimmedItems.length > 1 && totalCharCount(trimmedItems) > TOTAL_CHAR_BUDGET) {
    trimmedItems.shift();
  }

  return { limitVal, maxCharsVal, items: trimmedItems };
}

function render() {
  chrome.storage.local.get(
    [
      'items',
      'limit',
      'maxCharsPerItem',
      'copyModeEnabled',
      'pasteIndex',
      'pasteOnClickEnabled',
      'pasteOnHotkeyEnabled',
      'keepFormattingEnabled',
      'keepLinksEnabled',
    ],
    (res) => {
      const items = Array.isArray(res.items) ? res.items : [];
      const limit = res.limit || DEFAULT_LIMIT;
      const maxChars = res.maxCharsPerItem || DEFAULT_MAX_CHARS;
      const pasteIndex = items.length ? (res.pasteIndex || 0) % items.length : 0;
      const pasteOnClickEnabled = res.pasteOnClickEnabled !== false;
      const pasteOnHotkeyEnabled = res.pasteOnHotkeyEnabled !== false;
      const keepFormattingEnabled = !!res.keepFormattingEnabled;
      const keepLinksEnabled = !!res.keepLinksEnabled;

      document.getElementById('limitInput').value = limit;
      document.getElementById('maxCharsInput').value = maxChars;
      document.getElementById('pasteOnClick').checked = pasteOnClickEnabled;
      document.getElementById('pasteOnHotkey').checked = pasteOnHotkeyEnabled;
      document.getElementById('keepFormatting').checked = keepFormattingEnabled;

      const keepLinksCheckbox = document.getElementById('keepLinks');
      keepLinksCheckbox.checked = keepLinksEnabled;
      keepLinksCheckbox.disabled = !keepFormattingEnabled;
      document.getElementById('keepLinksRow').classList.toggle('disabled', !keepFormattingEnabled);

      document.getElementById('status').textContent =
        'Copy mode: ' + (res.copyModeEnabled ? 'ON' : 'OFF');
      document.getElementById('sizeLineCompact').textContent = items.length + ' / ' + limit + ' items';

      const usedChars = totalCharCount(items);
      document.getElementById('sizeLine').textContent =
        'Estimated list size: ' + usedChars.toLocaleString() + ' / ' + TOTAL_CHAR_BUDGET.toLocaleString() + ' characters';

      const list = document.getElementById('itemsList');
      list.innerHTML = '';

      if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No items collected yet';
        list.appendChild(li);
        return;
      }

      items.forEach((raw, i) => {
        const item = normalizeItem(raw);
        const li = document.createElement('li');
        li.className = 'item';

        const charCount = itemCharCount(item);
        const charLabel = charCount.toLocaleString() + (charCount === 1 ? ' character' : ' characters');

        const textSpan = document.createElement('span');
        const prefix = i === pasteIndex ? '➔ ' : '';
        const preview = item.plain.length > 70 ? item.plain.slice(0, 70) + '…' : item.plain;
        textSpan.textContent = prefix + preview;
        textSpan.className = 'item-text';
        textSpan.title =
          charLabel +
          ' — ' +
          (pasteOnClickEnabled
            ? 'click to select and paste this item'
            : 'click to select this item (paste-on-click is off; use the paste hotkey)');
        // Clicking always selects the item (moves the ➜ marker / sets what
        // the paste hotkey repeats); whether it ALSO pastes immediately
        // depends on the "paste when I click" setting, enforced in the
        // background script.
        textSpan.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'ITEM_CLICKED', index: i });
        });

        if (item.html) {
          const richTag = document.createElement('span');
          richTag.className = 'tag rich';
          richTag.textContent = 'rich';
          textSpan.prepend(richTag);
        }
        if (item.truncated) {
          const cutTag = document.createElement('span');
          cutTag.className = 'tag truncated';
          cutTag.textContent = 'cut';
          textSpan.prepend(cutTag);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '\u{1F5D1}'; // bin icon
        deleteBtn.title = 'Delete this item (' + charLabel + ')';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'DELETE_ITEM_AT', index: i });
        });

        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        list.appendChild(li);
      });
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  render();

  const infoBtn = document.getElementById('infoBtn');
  const infoPopover = document.getElementById('infoPopover');
  const settingsBtn = document.getElementById('settingsBtn');
  const backBtn = document.getElementById('backBtn');
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');

  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    infoPopover.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!infoPopover.classList.contains('hidden') && !infoPopover.contains(e.target) && e.target !== infoBtn) {
      infoPopover.classList.add('hidden');
    }
  });

  settingsBtn.addEventListener('click', () => {
    infoPopover.classList.add('hidden');
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  document.getElementById('saveLimits').addEventListener('click', () => {
    const limitInputVal = document.getElementById('limitInput').value;
    const maxCharsInputVal = document.getElementById('maxCharsInput').value;

    chrome.storage.local.get('items', (res) => {
      const items = Array.isArray(res.items) ? res.items : [];
      const result = applyLimits(limitInputVal, maxCharsInputVal, items);
      chrome.storage.local.set(
        { limit: result.limitVal, maxCharsPerItem: result.maxCharsVal, items: result.items, pasteIndex: 0 },
        render
      );
    });
  });

  document.getElementById('lowMemoryBtn').addEventListener('click', () => {
    chrome.storage.local.get('items', (res) => {
      const items = Array.isArray(res.items) ? res.items : [];
      const result = applyLimits(5, 1000, items);
      chrome.storage.local.set(
        {
          limit: result.limitVal,
          maxCharsPerItem: result.maxCharsVal,
          items: result.items,
          pasteIndex: 0,
          keepFormattingEnabled: false,
          keepLinksEnabled: false,
        },
        render
      );
    });
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    chrome.storage.local.set({ items: [], pasteIndex: 0 }, render);
  });

  document.getElementById('shortcutsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  document.getElementById('pasteOnClick').addEventListener('change', (e) => {
    chrome.storage.local.set({ pasteOnClickEnabled: e.target.checked });
  });

  document.getElementById('pasteOnHotkey').addEventListener('change', (e) => {
    chrome.storage.local.set({ pasteOnHotkeyEnabled: e.target.checked });
  });

  document.getElementById('keepFormatting').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const updates = { keepFormattingEnabled: checked };
    if (!checked) updates.keepLinksEnabled = false; // link-stripping only makes sense with formatting on
    chrome.storage.local.set(updates);
  });

  document.getElementById('keepLinks').addEventListener('change', (e) => {
    chrome.storage.local.set({ keepLinksEnabled: e.target.checked });
  });
});

chrome.storage.onChanged.addListener(render);
