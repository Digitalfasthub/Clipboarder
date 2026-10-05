// Service worker: holds no in-memory state (it can be unloaded any time),
// everything persists in chrome.storage.local instead.

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_CHARS = 5000; // per-item character cap, keeps storage + messaging fast

// Hard backstop on TOTAL characters held across the whole list (plain text
// plus any rich-formatted version combined). Enforced here regardless of
// whatever "max items" / "max characters per item" the user configures, so
// the list's memory/storage footprint can never silently balloon.
const HARD_TOTAL_CHAR_BUDGET = 300000; // ~300-600KB depending on content, trivial for Chrome

function itemCharCount(it) {
  const n = normalizeItem(it);
  return n.plain.length + (n.html ? n.html.length : 0);
}

function totalCharCount(items) {
  return items.reduce((sum, it) => sum + itemCharCount(it), 0);
}

chrome.runtime.onInstalled.addListener(() => {
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
      const updates = {};
      if (!Array.isArray(res.items)) updates.items = [];
      if (!res.limit) updates.limit = DEFAULT_LIMIT;
      if (!res.maxCharsPerItem) updates.maxCharsPerItem = DEFAULT_MAX_CHARS;
      if (res.copyModeEnabled === undefined) updates.copyModeEnabled = false;
      if (res.pasteIndex === undefined) updates.pasteIndex = 0;
      if (res.pasteOnClickEnabled === undefined) updates.pasteOnClickEnabled = true;
      if (res.pasteOnHotkeyEnabled === undefined) updates.pasteOnHotkeyEnabled = true;
      if (res.keepFormattingEnabled === undefined) updates.keepFormattingEnabled = false;
      if (res.keepLinksEnabled === undefined) updates.keepLinksEnabled = false;
      if (Object.keys(updates).length) chrome.storage.local.set(updates);
    }
  );
});

// Older stored items (or anything arriving malformed) may just be plain
// strings instead of {plain, html, truncated} objects. Normalize on read.
function normalizeItem(it) {
  if (!it) return { plain: '', html: null, truncated: false };
  if (typeof it === 'string') return { plain: it, html: null, truncated: false };
  return { plain: it.plain || '', html: it.html || null, truncated: !!it.truncated };
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-copy-mode') {
    const { copyModeEnabled } = await chrome.storage.local.get('copyModeEnabled');
    const newState = !copyModeEnabled;
    await chrome.storage.local.set({ copyModeEnabled: newState });
    notifyActiveTab({ type: 'COPY_MODE_CHANGED', enabled: newState });
  } else if (command === 'paste-next-item') {
    pasteNextInRotation();
  }
});

// The extension no longer holds standing access to every page. Instead it
// relies on the "activeTab" permission, which grants temporary access to
// whichever tab is active at the moment the user presses one of our
// keyboard shortcuts or interacts with the popup - that's exactly when
// these functions are called, so the grant is always valid right here.
// content.js is injected on demand into that tab (if it isn't already
// there) rather than being auto-loaded into every page up front.
async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true; // already injected on this page
  } catch (e) {
    // not injected yet - fall through and inject now
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    // e.g. chrome:// pages, the Chrome Web Store, or other pages the
    // extension simply isn't allowed to touch - nothing we can do there.
    return false;
  }
}

// Hotkey paste: always pastes the currently SELECTED item (pasteIndex).
// It never advances on its own - pressing the hotkey repeatedly keeps
// pasting the same item until you click a different one in the popup.
async function pasteNextInRotation() {
  const { items = [], pasteIndex = 0, pasteOnHotkeyEnabled = true } = await chrome.storage.local.get([
    'items',
    'pasteIndex',
    'pasteOnHotkeyEnabled',
  ]);
  if (!pasteOnHotkeyEnabled) return;
  if (items.length === 0) return;
  const index = pasteIndex % items.length;
  const item = normalizeItem(items[index]);
  notifyActiveTab({ type: 'PASTE_TEXT', item });
}

async function notifyActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0] && tabs[0].id;
  if (!tabId) return;
  const ready = await ensureContentScriptInjected(tabId);
  if (!ready) return;
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_ITEM') {
    addItem(message.item).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'ITEM_CLICKED') {
    itemClicked(message.index).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'DELETE_ITEM_AT') {
    deleteItemAt(message.index).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function addItem(rawItem) {
  const normalized = normalizeItem(rawItem);
  const trimmed = normalized.plain.trim();
  if (!trimmed) return;
  const { items = [], limit = DEFAULT_LIMIT, pasteIndex = 0 } = await chrome.storage.local.get([
    'items',
    'limit',
    'pasteIndex',
  ]);
  items.push({ plain: trimmed, html: normalized.html, truncated: normalized.truncated });
  let removedCount = 0;
  while (items.length > limit) {
    items.shift(); // oldest item is dropped so the newest selection always has room
    removedCount += 1;
  }
  // Hard backstop: even if "max items" and "max chars" individually allow
  // it, never let the combined list exceed the total character budget.
  while (items.length > 1 && totalCharCount(items) > HARD_TOTAL_CHAR_BUDGET) {
    items.shift();
    removedCount += 1;
  }
  const adjustedIndex = items.length ? Math.max(0, Math.min(pasteIndex - removedCount, items.length - 1)) : 0;
  await chrome.storage.local.set({ items, pasteIndex: adjustedIndex });
}

// Clicking an item in the popup ALWAYS selects it (pins it as the item the
// paste hotkey will repeat) - whether or not that click also pastes it
// immediately depends separately on the "paste when I click" setting.
async function itemClicked(index) {
  const { items = [], pasteOnClickEnabled = true } = await chrome.storage.local.get([
    'items',
    'pasteOnClickEnabled',
  ]);
  if (index < 0 || index >= items.length) return;
  await chrome.storage.local.set({ pasteIndex: index });
  if (pasteOnClickEnabled) {
    const item = normalizeItem(items[index]);
    notifyActiveTab({ type: 'PASTE_TEXT', item });
  }
}

// Delete a single item from the list (bin icon in the popup) and keep the
// hotkey rotation pointer pointing at a sensible item afterwards.
async function deleteItemAt(index) {
  const { items = [], pasteIndex = 0 } = await chrome.storage.local.get(['items', 'pasteIndex']);
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  let newPasteIndex = pasteIndex;
  if (index < pasteIndex) {
    newPasteIndex -= 1;
  }
  newPasteIndex = items.length ? Math.max(0, Math.min(newPasteIndex, items.length - 1)) : 0;
  await chrome.storage.local.set({ items, pasteIndex: newPasteIndex });
}
