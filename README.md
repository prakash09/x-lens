<div align="center">

# X Lens

**See the context behind the account.**

Country names and flags beside X accounts. A quieter feed, on your terms.

[Install from GitHub](#install-from-github) · [How it works](#how-it-works) · [Privacy](#privacy) · [Development](#development)

![X Lens preview](docs/preview.svg)

*Illustrative preview. Names and post content are fictional.*

</div>

## A little more context

X Lens puts the country from X’s **About this account** page beside the author’s name. It also adds two optional filters. Country labels are on by default. Both filters are off.

| Feature | What you get |
| --- | --- |
| **Country + flag** | X’s “Account based in” field beside names in posts, replies, and quotes. |
| **Account age** | Hide posts from accounts younger than **6 months, 1 year, 2 years, or 5 years**. |
| **Android filter** | Hide posts from accounts whose “Connected via” field includes Android. |
| **Show post** | Reveal any filtered post. Quotes can be filtered separately. |
| **Optional early lookups** | Prefetch before posts render when enabled. Background requests are off by default. |
| **Local cache** | Reuse saved details for 24 hours without repeated lookups. |

## Install from GitHub

**Chrome desktop 111 or later. No Node.js, terminal, or build step required.**

1. **[Download X Lens](https://github.com/prakash09/x-lens/archive/refs/heads/main.zip)** as a ZIP. You can also use **Code → Download ZIP** on this repository.
2. Extract the ZIP to a folder you will keep. The extracted folder is usually named `x-lens-main`.
3. Open a new Chrome tab and enter `chrome://extensions` in the address bar.
4. Turn on **Developer mode** in the top right.
5. Click **Load unpacked**. Select the extracted folder that contains `manifest.json`. Do not select the ZIP or its parent folder.
6. Open [X](https://x.com/home), sign in, and refresh the page. Use **Account filters** at the bottom left, or pin **X Lens** from Chrome’s Extensions menu.

GitHub distributes the files. Chrome loads them as an unpacked extension. This project is not currently published in the Chrome Web Store. These steps follow [Chrome’s official unpacked-extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

<details>
<summary><strong>Prefer Git?</strong></summary>

```sh
git clone https://github.com/prakash09/x-lens.git
```

Load the `x-lens` folder in Chrome with the same steps above. The generated page bundle is committed, so a build is not needed to install.

</details>

### Update or remove

**Update:** Download the latest ZIP, extract it, and replace the files in your existing extension folder. Keep `manifest.json` at its root. In `chrome://extensions`, click the reload icon on X Lens, then refresh open X tabs. Git users can run `git pull --ff-only` instead of replacing files.

**Remove:** Open `chrome://extensions` and click **Remove** on X Lens.

## Use it your way

- **Hover a country badge** to see the reported country, connection source, and join date. Click the badge to open that account’s About page.
- **Leave Load new countries off** for zero background About requests. Turn it on only when needed; all tabs share a small hourly budget.
- **Choose an account age** to hide younger accounts. Choose **Off** to restore them. An account exactly at the cutoff stays visible. Unknown, invalid, or future join dates stay visible.
- **Enable Connected via Android** to match that specific field from X. This does not prove the account was created on Android or that the current post came from Android.
- **Click Show post** to reveal a filtered post. Changes apply to open X tabs. These filters do not block or mute accounts.

The country is X’s reported account base. It is not citizenship, the profile’s written location, or a flag in the display name. Broad regions use a neutral globe. A globe alone means a country is not available yet.

## How it works

X Lens reads account metadata from X’s own responses without adding requests by default. Cached countries and join dates still work. Opening an account’s About page lets X load its details; X Lens saves the result.

Enable **Load new countries** only if you want background requests. It can queue accounts from feed responses before post elements render. Page changes coalesce into one scan per frame. Settings and cached details begin loading at document start.

Optional lookups run one at a time, at least 15 seconds apart, with a shared maximum of 10 per hour across all tabs. The budget persists through refreshes and worker restarts. A page session also stops at 10 requests. This conservative limit is an extension setting, not a promise about X’s allowance. The cache holds up to 1,000 accounts for 24 hours. Cached labels can appear as rows render. First-time labels still depend on X’s response time and request limits.

X Lens uses X’s internal `AboutAccountQuery`, with a fallback query path and discovery from X’s own requests. It reads the session headers from those requests in page memory. No authentication token is included in this repository. X can change or restrict this endpoint.

### If a country does not load

| What you see | What to do |
| --- | --- |
| Waiting for X session headers | Sign in, open an account’s About page, then refresh X. |
| Lookups paused or a rate-limit message | Wait for the pause to expire. Rate limits pause requests for at least 15 minutes; cached details still work. |
| X returned 401, 403, or 404 | Open an account’s About page and refresh X. These errors pause lookups for 5 minutes. |
| Old saved details | Click **Refresh saved account details** in the popup, then refresh X to clear its in-memory cache. |
| Lookup budget reached | Wait for the hourly window. Refreshing does not reset the shared budget. |

A failed lookup never makes an account match a filter.

## Privacy

**No external server. No analytics. No account required beyond your X session.**

- Runs only on `x.com` and `twitter.com`.
- Requests only the `storage` extension permission. Its content scripts read and change X pages.
- Sends account lookups only to X through your existing session.
- Keeps settings and projected account details in this browser’s local storage.
- Keeps session headers in X’s page context, in memory. They are not stored in the account cache or sent to another service.
- Does not follow, block, mute, like, repost, or publish anything.

X itself can observe page-context code and messages. The extension does not create a security boundary against X.

## Development

Runtime files have no package dependencies. `jsdom` is used only for tests. Validation used Node.js 24.

```sh
npm ci
npm run build
npm run check
npm test
```

| File | Purpose |
| --- | --- |
| `model.js` | Account parsing, country flags, calendar cutoffs, and settings migration. |
| `page.js` | Read X responses, capture request headers, and pace optional lookups. |
| `page.bundle.js` | Generated main-world bundle. Keep it committed. |
| `background.js` | Serialize lookup reservations and persist a shared request budget. |
| `content.js`, `content.css` | Country badges, local filters, and page controls. |
| `popup.html`, `popup.css`, `popup.js` | Toolbar popup and settings. |
| `manifest.json` | Scope, execution worlds, permissions, and runtime files. |
| `tests/` | Model, DOM, request, and manifest checks. |

The main and isolated execution worlds use distinct script paths. Run `npm run build` after changing `model.js` or `page.js`.

### Validation

23 automated checks cover calendar boundaries, leap days, missing data, Android matching, account identity, safe text rendering, independent quote filtering, restoring posts, request deduplication, rate-limit pauses, prefetch before DOM requests, cache reuse, and manifest/bundle consistency.

Live Chrome checks confirmed country badges, both filter types, restoring posts, and the age selector. Mobile widths and X’s light theme have not been visually verified. There is no claim that X’s internal endpoint will remain stable. Background lookups are now off by default after a live rate-limit report.

Manual checks:

1. Compare the badge on [Elon Musk’s profile](https://x.com/elonmusk) with his [About page](https://x.com/elonmusk/about).
2. Choose **1 year** for a recent account. Confirm its post collapses. Choose **Off** and confirm it returns.
3. Enable Android filtering for a matching account. Click **Show post**, then disable the filter.
4. Check a post with a quote from another author. Each author must have its own label and filter result.
5. Open two X tabs and change settings in the popup. Both tabs must update. An account exactly at the age cutoff must remain visible.

## Licence and credits

[MIT](LICENSE). This is an independent project, not affiliated with X Corp.

Protocol references: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Chrome manifest](https://developer.chrome.com/docs/extensions/reference/manifest), and the account-field projection in [X-Posed’s source](https://github.com/xaitax/x-account-location-device/blob/main/extension/src/shared/account-response.js). X Lens has an independent implementation.
