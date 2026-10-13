# X Lens

An extension for Chrome and Safari that shows the country of each X account beside its name, and hides the posts and page sections you do not want to see.

<img src="docs/country-badge.png" alt="A post on X with a Canada badge beside the author name" width="600">

## What it does

- **Shows the country.** A flag and country name appear beside names in posts, replies, and quotes. The data comes from X's **About this account** page.
- **Hides accounts by connection.** Hide accounts that X reports as connected via Android, iOS / App Store, or Web.
- **Hides accounts by bio keyword.** Enter words or phrases with commas between them, for example `venture, co-founder, investor`.
- **Hides accounts by country.** Enter countries or regions with commas between them, for example `United States, South Asia`. The match ignores case, spaces, and hyphens.
- **Shows only the countries you select.** Enter a second list to hide accounts based in all other countries or regions.
- **Hides accounts by follower count.** Enter ranges with commas between them, for example `<10, 500-2k, >1m`.
- **Hides accounts by following count.** The same format applies to the number of accounts that an account follows, for example `>2000`.
- **Shows only the counts you select.** Enter a second range list to hide accounts with any other follower or following count.
- **Hides new accounts.** Hide accounts younger than 6 months, 1 year, 2 years, or 5 years.
- **Hides distractions.** Remove the **For you** tab, **Today's News**, and **What's happening**.

Each hidden post has a **Show post** button. Accounts with unknown details stay visible. Settings are saved in your browser.

### Range format

Use this format in the four follower and following fields.

| You enter | Accounts that match |
|---|---|
| `<10` | Fewer than 10 |
| `>2000` | More than 2,000 |
| `500-2k` | From 500 to 2,000 |
| `<=100`, `>=100` | 100 is included |
| `0` | Exactly 0 |

- `k`, `m`, and `b` mean thousand, million, and billion. `1.5m` is 1,500,000.
- `10,000` is one number. Put a space after each comma that separates two ranges.
- X Lens reads the counts from the data that X sends with each post. It sends no extra requests and does not save the counts.
- A range that X Lens cannot read has no effect.

<img src="docs/settings-panel.png" alt="X Lens settings panel on X" width="320">

## Add it to Chrome

X Lens is not in the Chrome Web Store. Load it as an unpacked extension. You need Chrome 111 or later on a desktop computer.

1. [Download the ZIP](https://github.com/prakash09/x-lens/archive/refs/heads/main.zip) and extract it to a folder that you will keep.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the extracted folder. This is the folder that contains `manifest.json`.
5. Open [x.com](https://x.com/home) and refresh the page. Click **Account filters** at the bottom left to change the settings.

To update, replace the files in the folder with a new download. Then click the reload icon on X Lens in `chrome://extensions`.

## Add it to Safari on Mac and iPhone

X Lens is not in the App Store. Build it with Xcode on a Mac. You need Safari 18 or later on a Mac, or iOS 18 or later on an iPhone or iPad.

1. Download and extract the ZIP as shown above. Open `safari/X Lens/X Lens.xcodeproj` in Xcode.
2. Select each of the four targets, open **Signing & Capabilities**, and select your team.
3. **Mac:** select the **X Lens (macOS)** scheme and click **Run**. Then open **Safari > Settings > Extensions** and turn on **X Lens**.
4. **iPhone:** connect the iPhone, select the **X Lens (iOS)** scheme and your iPhone, and click **Run**. Then open **Settings > Apps > Safari > Extensions > X Lens** and turn on **Allow Extension**.
5. Open [x.com](https://x.com/home) in Safari. When Safari asks, select **Always Allow on This Website**. Tap or click **Account filters** at the bottom left to change the settings.

If Xcode reports that the bundle identifier is not available, change `com.prakash09.xlens` to your own identifier in each target. With a free Apple account, the iPhone app stops after 7 days. Run it from Xcode again to renew it.

## License

[MIT](LICENSE). X Lens is an independent project. It has no affiliation with X Corp.
