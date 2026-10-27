# Chrome Web Store listing (English)

Text for the Developer Dashboard (FR-043). It must match [`permissions.md`](permissions.md),
[`privacy-policy.md`](privacy-policy.md) and [`data-practices.md`](data-practices.md).

## Name

Nahual

## Summary (≤ 132 characters)

Intercept, modify and replay your app's HTTP traffic from DevTools. Rules, dev CORS, hooks and export to code.

## Category

Developer Tools

## Description

Nahual is a DevTools panel for frontend developers. Its single purpose is to help you inspect and
modify the HTTP traffic of the tab you are debugging, without leaving the browser.

**What it does**

- Shows the tab's traffic with the look of the Network panel.
- Per-site rules that pause, mock, fail or delay only the requests that match a condition (status,
  header, query, JSONPath, GraphQL).
- Development CORS: explains why a request was blocked and, if you ask, relaxes it for that tab
  only, for your origins only, with an expiry. Generates a report for the backend team.
- Repeater and diff: resend an edited request and compare responses.
- TypeScript hooks: change requests and responses with your own code, isolated and time-limited.
- Export to code: cURL, fetch, Vitest test, MSW handler, Zod schema and Postman collection, with
  sensitive values redacted by default.
- Per-tab rule profiles and a portable JSON configuration.

**Why each permission**

- **debugger**: Nahual uses the Chrome DevTools Protocol to see and modify the traffic of the tab
  you inspect. It only attaches while the Nahual panel is open in that tab, and detaches when you
  close it.
- **storage**: keeps your rules, profiles and settings in your browser. It does not store traffic.
- **Site access (optional)**: only if you use the repeater's "clean context", Nahual asks for
  access to the exact origin you want to send that request to. You can remove it any time in
  Settings.

**The yellow bar**

While Nahual is attached, Chrome shows a yellow bar saying "Nahual" started debugging this
browser. It is Chrome's guarantee that you know when an extension uses the debugger. It only
appears with the Nahual panel open and goes away when you detach: with the button on Chrome's
bar, with "Detach" in Nahual's session status, with `Alt+Shift+A`, or by closing the panel.

**What it does not do**

- No account and no servers of its own.
- It does not send your traffic, your rules or any data to anyone. No telemetry.
- It does not run remote code. Your hooks run in an isolated page with no network and no access to
  the extension.

Open source (Apache-2.0). Privacy policy: see the listing link.
