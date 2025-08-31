
# Modular Tools (MV3, Plain JS, No CDN) — v1.1.0

## Install
1. Download & unzip.
2. Chrome/Edge → `chrome://extensions` → **Developer mode** → **Load unpacked** → select `modular-extension`.

## Google Login via Supabase
1. In the **Account** tab, fill **Supabase URL** and **anonKey**.
2. In Supabase Dashboard → **Authentication → URL Configuration**, add this Redirect URL:
   `https://<YOUR_EXTENSION_ID>.chromiumapp.org/`
   - Find your Extension ID in `chrome://extensions` → your extension → **ID**.
3. Back in the extension, click **Sign in with Google**.
   - We open OAuth using `chrome.identity.launchWebAuthFlow`, receive `access_token` and fetch the user.
   - Session is stored locally; **Logout** clears it.

## Modules
- **Account:** Supabase/Gemini config, Google Sign-In, Logout.
- **Domain Cleaner:** Dry-run and Clear cookies & site data for a domain.
- **Options:** Feature flags, Export/Import settings JSON.

No external libraries or URLs are loaded; only direct `fetch` to your Supabase & Gemini endpoints.

Enjoy!
