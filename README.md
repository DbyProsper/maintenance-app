# UFH Residence Maintenance Reporting System

A seed-free, database-free academic functional prototype for CSC 527, It uses browser-native IndexedDB for profiles, requests, compressed images, notifications, activity history and settings. `localStorage` contains only the selected profile ID and theme; `sessionStorage` contains the current unfinished report draft.

This is not connected to UFH identity services. Local profiles are a transparent demonstration mechanism and are **not production-grade authentication or authorisation**.

## Start the application

Requirements: Python 3.11 or newer and a modern browser.

```powershell
cd "C:\Users\samth\Documents\CSC 527 - HCI Figma project\maintenance-app"
python server.py
```

Open <http://127.0.0.1:4173>. If the port is occupied:

```powershell
$env:UFH_PORT="4174"
python server.py
```

No npm install, API key, cloud account or external database is required.

## Create test profiles

1. Select **Create local profile**.
2. Enter a display name and optional contact detail.
3. Choose **Student** or **Maintenance staff**.
4. Create at least one profile of each role to demonstrate the complete workflow.
5. Use the profile button in the header to sign out and switch roles.

## Demonstration workflow

1. Create a student profile and submit an issue through the three-step form.
2. Keep the generated `UFH-YYYY-NNNN-XXX` reference number.
3. Create or select a maintenance profile and open **All requests**.
4. Review the labelled deterministic priority suggestion, set the final priority, assign the request, and add a student-visible update.
5. Use **Delayed / On Hold** with a required reason or **Completed** with a required completion summary.
6. Return to the student profile to view the notification and timeline, provide feedback, cancel a newly received report, or reopen a completed report.

## Export, import and reset

Open **Profile & data**:

- **Export JSON backup** downloads all profiles, requests, images, histories, settings and notifications in the prototype’s own format.
- **Import JSON backup** restores an exported file, including images.
- **Clear all prototype data** removes IndexedDB data after two confirmations. Export first if the records may be needed again.

Browser data belongs to the browser profile and device. Clearing site data or using another browser will not carry records across unless a JSON backup is imported.

## Implemented features

- Seed-free student and maintenance workspaces with meaningful empty states.
- Multi-step reporting, inline validation, autosaved text draft and unsaved-form warning.
- Required residence, floor, room, exact position, category, title and detailed description.
- Multi-image capture/upload, preview, removal, compression and IndexedDB Blob storage.
- Human-readable reference numbers, status history and in-app notifications.
- Staff priority override, assignment to locally created staff, internal/public notes, expected date, materials needs, delay reason, completion summary and optional completion image.
- Received, Assigned, In Progress, Delayed / On Hold, Completed, Reopened and Cancelled lifecycle states.
- Search, complete staff filtering, sorting, calculated dashboards and seven-day overdue logic configurable from five to seven days.
- Feedback/reopen and pre-work cancellation.
- Light/dark themes, mobile navigation drawer, PWA application shell, print summaries, reduced-motion support and keyboard-visible focus.

## Architecture

The application is dependency-free HTML, CSS and JavaScript served by a small Python static server. `app.js` contains explicit repository, notification, session/profile, priority recommendation, image-processing, validation and date/overdue services. This separation permits replacement with institutional authentication and a production database without redesigning the interface.

## Image attribution

- University of Fort Hare logo: user-supplied authentic asset, `public/ufh-logo.png` and `public/favicon.png`.
- Stewart Hall statue photograph: user-supplied asset, `public/stewart-hall.jpg`.

No external image hotlinks or generated campus images are used.

## Honest limitations

- Data does not synchronise between devices or browsers.
- Local profiles do not securely isolate data from someone with access to the same browser developer tools.
- Email, SMS, push notifications and UFH single sign-on are not implemented or claimed.
- Storage capacity depends on the browser and available device space.
- Formal screen-reader and real-participant usability studies remain future evaluation work.
