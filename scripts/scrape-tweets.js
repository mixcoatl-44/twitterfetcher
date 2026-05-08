/**
 * Twitter Scraper - Continuous Timeline
 * Keeps last 4 days of tweets with expanded URLs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════

const CONFIG = {
  ACCOUNTS: [
    'TrueCrypto28',
    'IncomeSharks',
    'RafaelH117',
    'barcauniversal',
  ],
  
  TWEETS_PER_ACCOUNT: 11,  // Fetch last 11 tweets per account
  DAYS_TO_KEEP: 4,         // Show tweets from last 4 days
  REQUEST_DELAY: 2000,     // Delay between API calls (ms)
  
  DATABASE_FILE: path.join(__dirname, '../data/tweets.json'),
};

const TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// ════════════════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════════════════

function httpsRequest(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

function buildHeaders() {
  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.TWITTER_CT0;
  
  if (!authToken || !ct0) {
    throw new Error('Missing TWITTER_AUTH_TOKEN or TWITTER_CT0');
  }
  
  return {
    'authorization': `Bearer ${TWITTER_BEARER}`,
    'cookie': `auth_token=${authToken}; ct0=${ct0}`,
    'x-csrf-token': ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadDatabase() {
  try {
    if (fs.existsSync(CONFIG.DATABASE_FILE)) {
      const data = fs.readFileSync(CONFIG.DATABASE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to load database:', error.message);
  }
  return { tweets: [], lastUpdate: null };
}

function saveDatabase(db) {
  const dir = path.dirname(CONFIG.DATABASE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  db.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CONFIG.DATABASE_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function isWithinDays(dateString, days) {
  const tweetDate = new Date(dateString);
  const now = new Date();
  const diffMs = now - tweetDate;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

// ════════════════════════════════════════════════════════════════════
// URL Expansion
// ════════════════════════════════════════════════════════════════════

function expandUrls(text, entities) {
  if (!entities || !entities.urls || entities.urls.length === 0) {
    return text;
  }
  
  let expanded = text;
  
  // Sort URLs by indices in reverse order to avoid offset issues
  const sortedUrls = [...entities.urls].sort((a, b) => b.indices[0] - a.indices[0]);
  
  for (const urlEntity of sortedUrls) {
    const shortUrl = urlEntity.url;
    const expandedUrl = urlEntity.expanded_url || urlEntity.display_url || shortUrl;
    const displayUrl = urlEntity.display_url || expandedUrl;
    
    // Replace t.co URL with clickable link
    expanded = expanded.replace(
      shortUrl,
      `<a href="${expandedUrl}" target="_blank" rel="noopener" class="tweet-link">${displayUrl}</a>`
    );
  }
  
  return expanded;
}

// ════════════════════════════════════════════════════════════════════
// Twitter API
// ════════════════════════════════════════════════════════════════════

async function getUserId(username) {
  const variables = { screen_name: username, withSafetyModeUserFields: true };
  const features = { hidden_profile_likes_enabled: false };
  
  const url = `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(features))}`;
  
  const data = await httpsRequest(url, buildHeaders());
  return data.data?.user?.result?.rest_id;
}

async function getUserTweets(userId) {
  const variables = {
    userId: userId,
    count: CONFIG.TWEETS_PER_ACCOUNT,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: false,
    withV2Timeline: true,
  };
  
  const features = {
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_enhance_cards_enabled: false
  };
  
  const url = `https://twitter.com/i/api/graphql/V7H0Ap3_Hh2FyS75OCDO3Q/UserTweets` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(features))}`;
  
  const data = await httpsRequest(url, buildHeaders());
  
  const instructions = data.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
  const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries || [];
  
  return entries
    .filter(e => e.content?.entryType === 'TimelineTimelineItem')
    .map(e => {
      const result = e.content?.itemContent?.tweet_results?.result;
      const legacy = result?.legacy || result?.tweet?.legacy;
      
      if (!legacy) return null;
      
      return {
        id: legacy.id_str,
        text: legacy.full_text,
        created_at: legacy.created_at,
        retweet_count: legacy.retweet_count || 0,
        favorite_count: legacy.favorite_count || 0,
        reply_count: legacy.reply_count || 0,
        is_retweet: !!legacy.retweeted_status_result,
        entities: legacy.entities,  // Contains URL expansion data
      };
    })
    .filter(Boolean);
}

async function fetchAllTweets() {
  const newTweets = [];
  
  for (const username of CONFIG.ACCOUNTS) {
    console.log(`\nFetching @${username}...`);
    
    try {
      const userId = await getUserId(username);
      console.log(`  User ID: ${userId}`);
      await sleep(CONFIG.REQUEST_DELAY);
      
      const tweets = await getUserTweets(userId);
      console.log(`  Found ${tweets.length} tweets`);
      
      for (const tweet of tweets) {
        newTweets.push({ ...tweet, username });
      }
      
      await sleep(CONFIG.REQUEST_DELAY);
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }
  
  return newTweets;
}

// ════════════════════════════════════════════════════════════════════
// Database Management
// ════════════════════════════════════════════════════════════════════

function mergeTweets(existingDb, newTweets) {
  const tweetMap = new Map();
  
  // Add existing tweets
  for (const tweet of existingDb.tweets) {
    tweetMap.set(tweet.id, tweet);
  }
  
  // Add/update new tweets
  for (const tweet of newTweets) {
    tweetMap.set(tweet.id, tweet);
  }
  
  // Convert back to array
  const allTweets = Array.from(tweetMap.values());
  
  // Filter to last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DAYS_TO_KEEP);
  
  const recentTweets = allTweets.filter(tweet => {
    return isWithinDays(tweet.created_at, CONFIG.DAYS_TO_KEEP);
  });
  
  console.log(`\nTotal unique tweets: ${allTweets.length}`);
  console.log(`Tweets in last ${CONFIG.DAYS_TO_KEEP} days: ${recentTweets.length}`);
  console.log(`Removed ${allTweets.length - recentTweets.length} old tweets`);
  
  return recentTweets;
}

// ════════════════════════════════════════════════════════════════════
// HTML Generation
// ════════════════════════════════════════════════════════════════════

function generateHTML(tweets) {
  const now = new Date();
  const lastUpdate = now.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  }) + ' UTC';
  
  // Sort newest first
  tweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const tweetHTML = tweets.map(tweet => {
    const date = new Date(tweet.created_at);
    const formatted = date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';
    
    const icon = tweet.is_retweet ? '🔁' : '';
    const tweetUrl = `https://twitter.com/${tweet.username}/status/${tweet.id}`;
    
    // Expand t.co URLs in tweet text
    const expandedText = expandUrls(tweet.text, tweet.entities);
    
    return `
    <div class="tweet" data-tweet-id="${tweet.id}">
      <div class="tweet-header">
        <div class="tweet-author">
          ${icon ? `<span class="retweet-icon">${icon}</span>` : ''}
          <span class="username">@${escapeHtml(tweet.username)}</span>
        </div>
        <div class="tweet-date">${formatted}</div>
      </div>
      <div class="tweet-text">${expandedText}</div>
      <div class="tweet-stats">
        ${tweet.reply_count > 0 ? `<span>💬 ${formatNumber(tweet.reply_count)}</span>` : ''}
        ${tweet.retweet_count > 0 ? `<span>🔁 ${formatNumber(tweet.retweet_count)}</span>` : ''}
        ${tweet.favorite_count > 0 ? `<span>❤️ ${formatNumber(tweet.favorite_count)}</span>` : ''}
      </div>
      <a href="${tweetUrl}" class="view-link" target="_blank" rel="noopener">View on Twitter →</a>
    </div>`;
  }).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="description" content="Lightweight Twitter timeline - last ${CONFIG.DAYS_TO_KEEP} days">
  <meta name="theme-color" content="#15202b">
  <title>Twitter Feed</title>
  <link rel="manifest" href="manifest.json">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --bg-primary: #15202b;
      --bg-secondary: #192734;
      --bg-hover: #1e2732;
      --border-color: #38444d;
      --text-primary: #ffffff;
      --text-secondary: #8899a6;
      --text-link: #1d9bf0;
      --accent: #1d9bf0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      min-height: 100vh;
    }
    
    header {
      position: sticky;
      top: 0;
      background: rgba(21, 32, 43, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 16px;
      z-index: 100;
    }
    
    h1 {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 2px;
    }
    
    .subtitle {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .timeline {
      background: var(--bg-primary);
    }
    
    .tweet {
      border-bottom: 1px solid var(--border-color);
      padding: 12px 16px;
      transition: background-color 0.2s;
      animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .tweet:hover {
      background: var(--bg-hover);
    }
    
    .tweet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .tweet-author {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .retweet-icon {
      font-size: 14px;
    }
    
    .username {
      color: var(--text-primary);
      font-weight: 700;
      font-size: 15px;
    }
    
    .tweet-date {
      color: var(--text-secondary);
      font-size: 13px;
    }
    
    .tweet-text {
      font-size: 15px;
      line-height: 20px;
      margin-bottom: 12px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    
    .tweet-link {
      color: var(--text-link);
      text-decoration: none;
      word-break: break-all;
    }
    
    .tweet-link:hover {
      text-decoration: underline;
    }
    
    .tweet-stats {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .tweet-stats span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .view-link {
      color: var(--text-link);
      text-decoration: none;
      font-size: 13px;
      display: inline-block;
      margin-top: 8px;
      font-weight: 400;
    }
    
    .view-link:hover {
      text-decoration: underline;
    }
    
    footer {
      text-align: center;
      padding: 24px 16px;
      color: var(--text-secondary);
      font-size: 13px;
      border-top: 1px solid var(--border-color);
    }
    
    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 50%;
      width: 56px;
      height: 56px;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(29, 155, 240, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .refresh-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(29, 155, 240, 0.6);
    }
    
    .refresh-btn:active {
      transform: scale(0.95);
    }
    
    .refresh-btn.spinning {
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }
    
    @media (max-width: 600px) {
      .container {
        padding: 0;
      }
      
      header {
        padding: 10px 12px;
      }
      
      .tweet {
        padding: 10px 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Home</h1>
      <div class="subtitle">Last ${CONFIG.DAYS_TO_KEEP} days • Updated ${lastUpdate}</div>
    </header>
    
    <main class="timeline">
      ${tweetHTML || '<div class="empty-state"><p>No tweets found</p></div>'}
    </main>
    
    <footer>
      Auto-updates every 30 minutes<br>
      Monitoring: ${CONFIG.ACCOUNTS.map(u => '@' + u).join(', ')}<br>
      Showing ${tweets.length} tweets from last ${CONFIG.DAYS_TO_KEEP} days
    </footer>
  </div>
  
  <button class="refresh-btn" onclick="refreshPage()" title="Refresh" aria-label="Refresh">
    ↻
  </button>
  
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    
    function refreshPage() {
      const btn = document.querySelector('.refresh-btn');
      btn.classList.add('spinning');
      location.reload();
    }
    
    setTimeout(() => location.reload(), 30 * 60 * 1000);
    
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(60));
  console.log('Twitter Scraper - Continuous Timeline');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Accounts: ${CONFIG.ACCOUNTS.join(', ')}`);
  console.log(`Fetching last ${CONFIG.TWEETS_PER_ACCOUNT} tweets per account`);
  console.log(`Keeping tweets from last ${CONFIG.DAYS_TO_KEEP} days`);
  console.log('═'.repeat(60));
  
  // Load existing database
  const db = loadDatabase();
  console.log(`\nLoaded ${db.tweets.length} tweets from database`);
  
  // Fetch new tweets
  const newTweets = await fetchAllTweets();
  console.log(`\nFetched ${newTweets.length} new tweets`);
  
  // Merge and filter
  const mergedTweets = mergeTweets(db, newTweets);
  
  // Save updated database
  saveDatabase({ tweets: mergedTweets });
  console.log(`\nSaved ${mergedTweets.length} tweets to database`);
  
  // Generate HTML
  const html = generateHTML(mergedTweets);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('✅ Generated index.html');
  
  console.log('\n' + '═'.repeat(60));
  console.log('Complete');
  console.log('═'.repeat(60));
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
