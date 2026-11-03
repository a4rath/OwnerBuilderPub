# SynergeticX Builder PWA

An offline-first, phone-sized progressive web app for up to three owner-builder projects. The interface uses Ionic Framework 9 Web Components with a semantic token theme and a light/dark appearance toggle. Each browser stores its own project files in IndexedDB. There is no cloud account, server API, or automatic synchronization: export a project's JSON and send it to the next person, who imports that updated file on their device.

## Projects and starter data

- `projects/jingella-ashwood.json` contains the 74 activities and workbook planned dates, cost estimates, recorded actual amounts, and contacts for Jingella St, Ashwood.
- `projects/collins-close.json` starts Collins Close, Scoresby with an empty activity list. Add its schedule in the app or import its own project JSON file.
- Keep `projects/*.json` private. The `.gitignore` excludes these data files from commits. The PWA shell does not fetch or cache them; each device loads project JSON through its file picker.
- Tasks start at 0% with actual work dates blank because the source workbook does not verify task progress or actual dates. One malformed date in the workbook was left blank instead of guessed.

## Run locally on this Windows computer

Double-click `start-local.bat` (or run `start-local.ps1` from PowerShell). Open `http://localhost:8000` in a browser. This is suitable for a local desktop preview. The service worker and install prompt require a secure origin.

## Install on Android and iPhone

To add a PWA icon, the browser must open the app from **HTTPS** (or `localhost` on that same device). A page opened from `file://`, or an `http://` address served from another computer on Wi-Fi, is not a reliable installable/offline PWA. Apple documents adding a Safari web page to Home Screen; service workers and PWA installation require a secure origin. There is no way for this folder by itself to create a Home Screen PWA on an iPhone.

There are two practical choices:

1. **Easiest phone setup:** publish only the PWA app shell (HTML, CSS, JavaScript, manifest, service worker and icons) to an HTTPS static site. Do not publish `projects/*.json`, the attached workbook, or the Android app assets. GitHub Pages sites are public, including sites backed by private repositories on eligible plans.
2. **Keep it on your Windows PC:** serve the folder over HTTPS on your local Wi-Fi and install/trust a certificate on each phone. Keep the PC and server running for first visits and app updates. The included `start-local.ps1` is HTTP on `localhost` for PC preview only; it does not set up HTTPS or phone access.

Once the app is open in a secure browser page:

Opening the URL does not create a Home Screen icon by itself. Tap **Install** in the app header. If the browser provides a native install prompt, the app opens it; otherwise it shows the steps for that phone. You can also use the browser menu directly:

- **Android:** open the link in Chrome, tap **Install app** if offered, or browser menu → **Add to Home screen**.
- **iPhone:** open the link in Safari → Share → **Add to Home Screen** → turn on **Open as Web App** → Add.

The app caches its shell for offline use after the first successful secure load. IndexedDB is local to a browser profile and device. `navigator.storage.persist()` is requested where supported, but it cannot prevent a user from clearing browser data or guarantee permanent storage on every iOS version. Export JSON backups regularly.

Ionic's version-pinned CSS and JavaScript are loaded from jsDelivr and cached by the service worker. The first visit needs an internet connection so the browser can fetch and cache Ionic; reopen the app once online before relying on offline use.

## Import and export

Tap **Load Project JSON File** and choose one or more `.json` files. Same-ID imports replace that project's local copy after confirmation. Export each project separately from **Data**. Send the resulting JSON file by AirDrop, text, email, or another file-sharing method, then import it on the receiving device. Imports are manual snapshots; simultaneous editing is not merged.

The chart orders activities by sequence number and fills each task bar to its entered completion percent. Whole-project progress is the simple average of task completion values (not cost-weighted). A planned finish change previews incomplete later tasks that start on/after the old finish; applying the cascade shifts those downstream planned dates by the same calendar-day amount and marks them for review. This is a sequence-based forecast, not a dependency network.

## Files

- `index.html`, `styles.css`, `app.js`: application UI and behavior.
- `manifest.webmanifest`, `icons/`, `sw.js`: install identity, icons, and offline shell cache.
- `projects/`: portable starter JSON files and source-workbook importer.
