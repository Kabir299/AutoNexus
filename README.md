# AutoNexus

Smart vehicle assistance web app — vehicles, documents, reminders, nearby mechanics map, emergency SOS, AI assistant, and a personal dashboard.

## Tech
Plain HTML, CSS and JavaScript (no build step). Maps use Leaflet + OpenStreetMap. All data is currently stored in the browser's `localStorage` (per-user, via `app_backend/autonexus-sync.js`).

## Run locally
1. Clone the repo and open the folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `app_backend/index.html` → **Open with Live Server** (configured on port 5501).

## Structure
```
app_backend/
  index.html, login.html, signup.html, dashboard.html   # entry pages
  autonexus-sync.js       # shared per-user data layer (localStorage)
  autonexus-location.js   # shared location helpers
  autonexus-theme.css     # shared light/dark theme
  my-vehicle-page/  documents-page/  reminders-page/
  mechanics-map-page/  emergency-sos-fixed-map/
  ai-assistant-page/  profile-page/
  assets/                 # images
```

## Working together
- Create a branch for each change: `git checkout -b feature/short-name`
- Commit, push, and open a Pull Request into `main` for review.
