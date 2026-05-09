# TwitterFetcher 🐦→📱

> Receive tweets from any Twitter/X account directly in Telegram — no app, no excessive data usage, no censorship.

![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Automated-2088FF?logo=github-actions&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Built_With-339933?logo=node.js&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-Delivery-26A5E4?logo=telegram&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Cost](https://img.shields.io/badge/Cost-Free-brightgreen)

---

## What Is This?

TwitterFetcher is a zero-cost, serverless Twitter monitoring bot that runs entirely on GitHub Actions. It scrapes tweets from accounts you choose and delivers them as formatted messages to your Telegram — every 30 minutes, automatically, with no server required.

All the heavy lifting (logging into Twitter, fetching tweets, processing data) happens on GitHub's servers. Your device only receives small text messages via Telegram.

---

## Features

- ✅ Monitors multiple Twitter/X accounts simultaneously
- ✅ Sends only new tweets (no duplicates, ever)
- ✅ Delivers tweets in chronological order
- ✅ Expands `t.co` shortened links to real URLs
- ✅ Sends direct image and video URLs (e.g. `pbs.twimg.com/...`)
- ✅ Displays quote tweets in a nested format
- ✅ Shows engagement stats (likes, retweets, replies)
- ✅ Persists state between runs via a committed JSON file
- ✅ Runs every 30 minutes on GitHub's free tier
- ✅ No VPN required after initial setup
- ✅ No npm packages — uses only Node.js built-in modules
- ✅ No paid Twitter API required

---

## How It Works

```
GitHub Actions (runs every 30 minutes)
        ↓
Authenticates with Twitter using your session cookies
        ↓
Fetches new tweets from accounts you specify
        ↓
Expands t.co links → real URLs
Extracts direct media URLs
Detects quote tweets
        ↓
Sends formatted messages to your Telegram bot
        ↓
Saves state to repository (prevents duplicates)
```

---

## Example Output

Each tweet arrives in your Telegram like this:

```
@TrueCrypto28 • 08 May 2026, 14:30 UTC
━━━━━━━━━━━━━━━
Bitcoin just hit $100k! Full breakdown here:
https://coindesk.com/markets/bitcoin-hits-100k

📷 https://pbs.twimg.com/media/ABC123xyz.jpg

💬 125  🔁 340  ❤️ 890

🔗 https://twitter.com/TrueCrypto28/status/123456789
```

Quote tweets appear as:

```
@IncomeSharks • 08 May 2026, 15:00 UTC
━━━━━━━━━━━━━━━
This is exactly what I predicted last month.

┌─ Quoted tweet ─────────
│ @elonmusk
│ Bitcoin is the future of money.
└────────────────────────

💬 50  🔁 120  ❤️ 450

🔗 https://twitter.com/IncomeSharks/status/987654321
```

---

## Data Usage

| Method | Monthly Data Usage |
|---|---|
| Twitter/X App | 50–100 MB |
| TwitterFetcher (Telegram) | ~500 KB |

TwitterFetcher uses approximately **99% less data** than the native app.

---

## Prerequisites

Before setting up, you need:

| Requirement | Where to Get It |
|---|---|
| GitHub account | [github.com](https://github.com) |
| Twitter/X account | [twitter.com](https://twitter.com) |
| Telegram bot token | [@BotFather](https://t.me/BotFather) on Telegram |
| Telegram chat ID | Via `getUpdates` API (explained below) |
| Twitter session cookies | From your browser (explained below) |

---

## Setup Guide

### Step 1 — Fork This Repository

Click the **Fork** button at the top of this page.

This creates a personal copy of the project in your own GitHub account. All files and workflows are already included — you do not need to create anything from scratch.

---

### Step 2 — Get Your Telegram Bot Token

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow the prompts to choose a name and username
4. Copy the **Bot Token** BotFather gives you

It looks like:
```
7620681975:AAFlUXSpOcmQ3vgHN2HzEycZKGTFApCkklc
```

> ⚠️ Keep this token private. Anyone with it can control your bot.

---

### Step 3 — Get Your Telegram Chat ID

1. Send any message to your new bot (e.g. `/start`)
2. Open this URL in your browser (replace with your actual token):
```
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```
3. Find `"chat":{"id":` in the JSON response
4. The number after it is your **Chat ID**

It looks like:
```
636804231
```

---

### Step 4 — Get Your Twitter Session Cookies

You need two cookies from your logged-in Twitter session:
- `auth_token`
- `ct0`

**Method A — Kiwi Browser (Android, easiest):**
1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) from Play Store
2. Go to `twitter.com` and log in
3. Enable Desktop site from the menu
4. Open Developer Tools from the menu
5. Go to `Application → Cookies → https://twitter.com`
6. Copy the values of `auth_token` and `ct0`

**Method B — Chrome on Desktop:**
1. Go to `twitter.com` and log in
2. Press `F12` to open DevTools
3. Go to `Application → Cookies → https://twitter.com`
4. Copy the values of `auth_token` and `ct0`

**Method C — Termux with Root (Android):**
```bash
su
cp /data/data/com.android.chrome/app_chrome/Default/Cookies /sdcard/cookies.db
exit
sqlite3 /sdcard/cookies.db "SELECT name, value FROM cookies WHERE host_key LIKE '%twitter%' AND (name='auth_token' OR name='ct0');"
```

> ⚠️ Treat `auth_token` like a password. Never share it publicly.

> ℹ️ Cookies expire after a few weeks or when you log out of Twitter. If the bot stops working, refresh your cookies and update the secrets.

---

### Step 5 — Add GitHub Secrets

In your forked repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret** for each of the following:

| Secret Name | Value |
|---|---|
| `TWITTER_AUTH_TOKEN` | Your `auth_token` cookie value |
| `TWITTER_CT0` | Your `ct0` cookie value |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |

Secrets are encrypted. Nobody — including you — can read them back after saving.

---

### Step 6 — Configure Accounts to Monitor

Open `scripts/scrape-tweets.js` and edit the `ACCOUNTS` array:

```javascript
ACCOUNTS: [
  'TrueCrypto28',
  'IncomeSharks',
  'RafaelH117',
  'barcauniversal',
],
```

Replace with the Twitter usernames you want to monitor (without `@`). Then commit the change.

---

### Step 7 — Enable and Run the Workflow

1. Go to the **Actions** tab in your forked repository
2. If prompted, click **"I understand my workflows, go ahead and enable them"**
3. Click **"Scrape and Send to Telegram"** in the left sidebar
4. Click **Run workflow → Run workflow**
5. Wait 1–3 minutes
6. Check your Telegram — tweets should start arriving 🎉

From this point on, the workflow runs automatically every 30 minutes.

---

## Configuration

All configuration lives in `scripts/scrape-tweets.js`:

```javascript
const CONFIG = {
  // Twitter accounts to monitor (without @)
  ACCOUNTS: [
    'TrueCrypto28',
    'IncomeSharks',
    'RafaelH117',
    'barcauniversal',
  ],

  // How many recent tweets to fetch per account per run
  TWEETS_PER_ACCOUNT: 11,

  // Delay between API requests in milliseconds
  REQUEST_DELAY: 2000,
};
```

**To change the schedule**, edit `.github/workflows/scrape.yml`:

```yaml
- cron: '*/30 * * * *'   # Every 30 minutes (default)
- cron: '*/15 * * * *'   # Every 15 minutes
- cron: '0 * * * *'      # Every hour
- cron: '0 */2 * * *'    # Every 2 hours
```

Use [crontab.guru](https://crontab.guru) to build custom cron expressions.

---

## Project Structure

```
TwitterFetcher/
├── .github/
│   └── workflows/
│       └── scrape.yml          # Scheduler and runner
├── scripts/
│   └── scrape-tweets.js        # Core scraping and Telegram logic
├── data/
│   └── state.json              # Persisted state (auto-updated by bot)
├── .gitignore
└── README.md
```

**How state persistence works:**
After each run, the bot commits an updated `data/state.json` file containing the last seen tweet ID for each account. On the next run, only tweets newer than those IDs are fetched and sent. This is what prevents duplicate messages.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| No tweets arriving | Workflow failed silently | Check the Actions tab logs |
| `Unauthorized` error | Cookies expired or wrong | Get fresh cookies, update secrets |
| Some accounts return errors | GraphQL query IDs changed | Open an issue — IDs need updating |
| Workflow stopped running | GitHub paused inactive cron | Make any commit to reactivate |
| Duplicate tweets | State file not committing | Check workflow permissions |

---

## Security

- All credentials are stored as **GitHub Secrets** (encrypted at rest)
- No credentials are ever written to files or logs
- The bot only **reads** from Twitter — it never posts, likes, or follows
- The repository can be public without exposing any sensitive data
- You have full visibility into every line of code running on your behalf

---

## Limitations

- Twitter may rotate internal GraphQL query IDs periodically, which can break fetching for some accounts. If this happens, open an issue and updated IDs will be provided.
- Session cookies expire after a few weeks or upon logout. Update them in GitHub Secrets when the bot starts returning `Unauthorized` errors.
- GitHub may pause scheduled workflows after 60 days of repository inactivity. A new commit reactivates them.

---

## Cost

| Resource | Cost |
|---|---|
| GitHub Actions (public repo) | Free (unlimited minutes) |
| Telegram Bot API | Free |
| Twitter session (your account) | Free |
| Server or VPS | Not required |
| **Total** | **$0.00** |

This bot uses approximately 2 minutes of GitHub Actions time per day — well within any free tier limit.

---

## Tech Stack

- **Runtime:** Node.js 22
- **Automation:** GitHub Actions
- **Data source:** Twitter internal GraphQL API (web session)
- **Delivery:** Telegram Bot API
- **Dependencies:** None — built entirely with Node.js built-in modules (`https`, `fs`, `path`, `crypto`)

---

## License

MIT — do whatever you want with it. A star ⭐ is appreciated if this saved you time or data.

---

## Contributing

Pull requests are welcome. If Twitter breaks something (which it will), open an issue with the error log from your Actions run and the fix will be pushed as soon as possible.

---

*Built out of necessity. Maintained with care.*
```
