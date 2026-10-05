# Clipboarder

A small, local-only Chrome extension that lets you collect several text
selections into a list (instead of your clipboard only ever holding one
thing), then paste them back one at a time - all driven by two keyboard
shortcuts you choose yourself.

No servers, no accounts, no analytics. Everything lives in your browser's
local extension storage and never leaves your machine.

![Clipboarder icon](icons/icon128.png)

## Features

- **Two configurable hotkeys** - one toggles "copy mode" on/off, the other
  pastes the currently selected item. Set them (or change them) any time at
  `chrome://extensions/shortcuts`, or via the **Settings** screen's
  "Set / change the 2 hotkeys" button.
- **Copy mode** - while it's on, a small green arrow badge follows your
  cursor on the page. Just select text normally and it's added to the list.
- **A real list, not a single slot** - items stay in the list even after
  you paste them, so you can reuse any of them later. Click any item in the
  popup to select and (optionally) paste it; the paste hotkey always
  repeats whichever item is currently selected (marked with ➜) until you
  click a different one.
- **Per-item delete** - a 🗑 button on every item, plus a one-click
  "Clear list" to wipe everything.
- **Independent paste triggers** - choose whether clicking an item pastes
  it immediately, whether the paste hotkey works, or both, from
  **Settings**.
- **Formatting controls** - optionally keep rich formatting (bold, colors,
  fonts) when copying, and independently choose whether hyperlinks / HTML
  tags are kept or stripped out of that formatted text. Plain inputs and
  text areas always just get plain text, since they can't hold formatting
  anyway.
- **Built-in memory guardrails** - a configurable max item count and max
  characters per item, plus a **hard 300,000-character budget across the
  whole list** that's enforced no matter what you set those to, so the
  extension can never quietly bloat your browser's memory. A one-click
  **"Low memory mode"** button is included for squeezing it down fast, and
  the popup shows a live estimate of how much of that budget is in use.
- **Google Docs / Sheets / Slides fallback** - these editors render on
  canvas and don't expose a normal editable text box, so direct insertion
  isn't possible there. When that's detected, Clipboarder copies the item
  (including formatting, if captured) to your real system clipboard instead
  and shows a brief on-page notice asking you to press Ctrl+V.
- **Clean, minimal popup** - the item list is front and center. An ⓘ icon
  opens a short "how to use" popover; a ⚙ icon opens a separate Settings
  screen for everything else, so the main view never gets cluttered.

## Installation (unpacked, for local/personal use)

This extension isn't published on the Chrome Web Store - it's loaded
locally as an "unpacked" extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked** and select this folder.
4. Pin it to the toolbar if you'd like (puzzle-piece icon → pin).

## Setting up the two hotkeys

Chrome owns the keyboard-shortcut picker for extensions (for security,
extensions can't capture arbitrary key combinations themselves), so:

1. Open the extension's popup and click **⚙ Settings**.
2. Click **"Set / change the 2 hotkeys"** - this opens
   `chrome://extensions/shortcuts` directly.
3. Set your preferred combinations for:
   - **Turn copy-selection mode on/off**
   - **Paste the next item from the collected list**

Defaults are `Ctrl+Shift+C` (copy mode) and `Ctrl+Shift+V` (paste).

## How to use it

1. Press the **copy hotkey**. A small green "➔ copy mode on" badge appears
   near your cursor.
2. Select any text on the page as you normally would - it's added to the
   list automatically.
3. Press the copy hotkey again to turn copy mode off.
4. Open the popup to see your list. Click an item to select it (and paste
   it, if that setting is on); the paste hotkey always repeats whichever
   item is currently selected.
5. Click 🗑 next to an item to delete just that one, or **"Clear list"** to
   empty it entirely.

## Settings reference

Opened via the ⚙ icon in the popup.

| Setting | What it does |
|---|---|
| Max items kept | Oldest item is dropped once you're over this count. |
| Max characters per item | Longer selections are trimmed and marked **cut**. |
| Low memory mode | One click: 5 items × 1,000 characters, formatting off. |
| Paste when I click an item | If off, clicking only selects an item - it won't paste until you use the hotkey. |
| Paste when I use the paste hotkey | Turn the hotkey-paste behavior off entirely if you only want click-to-paste. |
| Keep text formatting | Captures a rich (HTML) version alongside plain text, for pasting into rich-text boxes. |
| Keep links / HTML tags | Only matters if formatting is kept - controls whether `<a>` links (and similar tags) survive, or get flattened to plain text. |

The whole list is also hard-capped at 300,000 total characters regardless
of the settings above - see "Built-in memory guardrails" below.

## Known limitations

- **Google Docs, Sheets and Slides**: these render the document on canvas
  rather than as normal editable DOM text, so:
  - *Pasting into them* works via an automatic system-clipboard fallback
    (you'll see a "press Ctrl+V" notice) - see Features above.
  - *Copying from them* is not reliable, since there's no normal text
    selection for the extension to read. This is a limitation of how those
    apps are built, not a bug in the extension.
- Only tested on Chrome (Manifest V3). Not published to the Chrome Web
  Store; must be loaded as "unpacked" per the instructions above.

## Project structure

```
clipboard-list-extension/
├── manifest.json          Extension manifest (Manifest V3)
├── background.js          Service worker: storage, hotkey handling, limits
├── content.js              Runs on every page: selection capture, paste/insert, clipboard fallback
├── content.css             Styling for the on-page copy-mode badge and toast
├── popup.html / popup.js   The toolbar popup UI (list + settings)
├── icons/                  Toolbar icon PNGs (16/32/48/128px)
└── tools/generate-icons.ps1  PowerShell script that (re)generates the icons
```

## Regenerating the icons

Icons are generated with a small PowerShell script (no external image
tools needed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\generate-icons.ps1"
```

Edit the character code in that script (`[char]0x2714` for the checkmark)
to use a different glyph, or the `$green` color to change the icon color.

## Versioning

Version numbers in `manifest.json` increase by `0.02` on each change
(e.g. `1.2.0` → `1.2.2` → `1.2.4` ...), per project convention.

## Privacy

Clipboarder only stores data in Chrome's local `chrome.storage.local` for
this extension. Nothing is sent anywhere - there are no network requests,
no remote servers, and no analytics.
