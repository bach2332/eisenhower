# Priority Matrix

A static web app (plain HTML/JS, no build step) that you can install as a PWA on Android. Tasks are stored on the device and synced through a private GitHub Gist.

## Features

- **Backlog**: where unsorted tasks live. New tasks land here first.
- **Four quadrants**: **Now** (urgent + important), **Next** (important, not urgent), **Hand off** (urgent, less important), **Maybe** (not urgent, less important).
- **Quick add**: tap `+`, type a title, press Enter. Optionally add a detail, pick the target quadrant and set a deadline (Today / Tomorrow / +1 week) right away.
- **Deadline + timeline**: each task shows `start date → deadline`, a time-elapsed bar and a plain label (Due today, 3 days left, 2 days overdue, ...). Orange when the deadline is close, red when overdue. The start date defaults to the creation date and can be changed in the Edit sheet.
- **Detail**: optional description (up to 2000 characters); the card shows an icon and a one-line preview.
- **Move and reorder**: hold the ⠿ handle for half a second, then drag. Drop into another quadrant, or between cards to put a task exactly where you want it. You can also tap a task and choose a quadrant in the Edit sheet.
- **Order inside a quadrant** (and Backlog): tasks with a deadline come first, nearest deadline on top. Tasks without a deadline sit below them and can be sorted by hand.
- **Complete**: tap the circle on the left (with Undo). The completion date and the quadrant the task was in are kept ("Done 09/11 · from Now").
- **Two views**: Matrix and Table (filter, sort, search, Deadline and Done columns).
- **Tags**: create coloured tags with the tag button in the header (rename, recolour, delete), pick any number per task when adding or editing. Cards show the tag pills (a coloured left edge on phones); Table adds a Tags column, a tag filter, search by tag name, and **Group by tag**. Tags sync through the Gist with the tasks.
- **Quick search**: tap the magnifier (or press `/`) and type — Matrix and Table filter instantly by title, detail or tag name, with matches highlighted. Esc or ✕ clears it.
- **Phone in landscape**: Backlog on the left and the 2x2 matrix filling the screen, so everything is visible at once.
- **Offline-first** with Gist sync (merged per task by `updatedAt`).
- **Version footer**: shows the build date as `yyyymmdd`; it is updated with every change.

## Deploy to GitHub Pages

1. Push all files to the `main` branch of your repository.
2. Open **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. Open `https://<user>.github.io/<repo>/`. Later pushes to `main` are deployed automatically (about a minute).

If the app still shows an old version, fully close it and open it again so the service worker can load the new files.

## Connect a Gist

1. GitHub → Settings → Developer settings → **Personal access tokens → Tokens (classic)** → generate a token with only the **`gist`** scope.
2. Open the app → ⚙ → paste the token → **Create new Gist** (or paste an existing Gist ID) → **Save & sync**.
3. On another device, paste the same token and Gist ID.

The token is stored only in that browser, never in the code.

## Install on Android

Chrome → menu ⋮ → **Install app** (or ⚙ → Install app). Long-press the app icon for the **Add task** shortcut. Turn on auto-rotate to use the landscape layout.

## Data notes

- Data from older versions is migrated automatically: `Inbox` becomes `Backlog`, and new fields (`detail`, `order`, `doneFrom`, `start`) start empty.
- Deleted tasks are kept as tombstones for 30 days so that deletions sync correctly between devices.
- Device clocks should be correct: sync conflicts are resolved by the most recent edit time.
