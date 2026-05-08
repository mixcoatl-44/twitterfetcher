/**
 * Twitter Web Scraper
 * Uses your session cookies to fetch tweets via Twitter's internal GraphQL API
 * Same endpoints the web interface uses - no official API needed
 */

const https = require('https');
const fs = require('fs');

// ════════════════════════════════════════════════════════════════════
// CONFIGURATION - Edit the accounts you want to monitor
// ════════════════════════════════════════════════════════════════════

const CONFIG = {
  ACCOUNTS: [
    'TrueCrypto28',
    'IncomeSharks', 
    'RafaelH117',
    'barcauniversal',
  ],
  TWEETS_PER_ACCOUNT: 5,  // How many recent tweets to fetch per account
};

// ════════════════════════════════════════════════════════════════════
// Twitter's GraphQL Bearer Token (public, used by web interface)
// This is NOT a secret - it's the same for everyone
// ════════════════════════════════════════════════════════════════════

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
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse JSON'));
        }
      });
    }).on('error', reject);
  });
}

function buildHeaders() {
  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.TWITTER_CT0;
  
  if (!authToken || !ct0) {
    throw new Error('Missing TWITTER_AUTH_TOKEN or TWITTER_CT0 environment variables');
  }
  
  return {
    'authorization': `Bearer ${TWITTER_BEARER}`,
    'cookie': `auth_token=${authToken}; ct0=${ct0}`,
    'x-csrf-token': ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
}

// ════════════════════════════════════════════════════════════════════
// Twitter GraphQL API Functions
// ════════════════════════════════════════════════════════════════════

async function getUserId(username) {
  const variables = { screen_name: username, withSafetyModeUserFields: true };
  const features = { hidden_profile_likes_enabled: false, responsive_web_graphql_exclude_directive_enabled: true };
  
  const url = `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(features))}`;
  
  const data = await httpsRequest(url, buildHeaders());
  
  if (!data.data?.user?.result?.rest_id) {
    throw new Error(`User not found: ${username}`);
  }
  
  return data.data.user.result.rest_id;
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
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_media_download_video_enabled: false,
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
        retweet_count: legacy.retweet_count,
        favorite_count: legacy.favorite_count,
        is_retweet: !!legacy.retweeted_status_result,
      };
    })
    .filter(Boolean);
}

async function fetchAllTweets() {
  const results = [];
  
  for (const username of CONFIG.ACCOUNTS) {
    console.log(`\nFetching @${username}...`);
    
    try {
      const userId = await getUserId(username);
      console.log(`  User ID: ${userId}`);
      
      await new Promise(r => setTimeout(r, 1000)); // Rate limiting
      
      const tweets = await getUserTweets(userId);
      console.log(`  Found ${tweets.length} tweets`);
      
      results.push({ username, tweets });
      
      await new Promise(r => setTimeout(r, 2000)); // Be polite
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      results.push({ username, tweets: [], error: error.message });
    }
  }
  
  return results;
}

// ════════════════════════════════════════════════════════════════════
// HTML Generation
// ════════════════════════════════════════════════════════════════════

function generateHTML(accountData) {
  const now = new Date();
  const lastUpdate = now.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  }) + ' UTC';
  
  // Flatten and sort all tweets chronologically
  const allTweets = [];
  accountData.forEach(({ username, tweets }) => {
    tweets.forEach(tweet => {
      allTweets.push({ ...tweet, username });
    });
  });
  
  allTweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const tweetHTML = allTweets.map(tweet => {
    const date = new Date(tweet.created_at);
    const formatted = date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';
    
    const icon = tweet.is_retweet ? '🔁' : '🐦';
    const tweetUrl = `https://twitter.com/${tweet.username}/status/${tweet.id}`;
    
    return `
    <div class="tweet">
      <div class="meta">
        <span class="icon">${icon}</span>
        <span class="username">@${tweet.username}</span>
        <span class="date">${formatted}</span>
      </div>
      <div class="text">${escapeHtml(tweet.text)}</div>
      <a href="${tweetUrl}" class="link" target="_blank" rel="noopener">View on Twitter →</a>
    </div>`;
  }).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="description" content="Lightweight Twitter feed - text only, minimal data">
  <meta name="theme-color" content="#000000">
  <title>Twitter Feed</title>
  <link rel="manifest" href="manifest.json">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #000;
      color: #fff;
      line-height: 1.5;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 16px;
    }
    
    header {
      position: sticky;
      top: 0;
      background: #000;
      border-bottom: 1px solid #333;
      padding: 16px 0;
      margin-bottom: 16px;
      z-index: 10;
    }
    
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .subtitle {
      font-size: 13px;
      color: #71767b;
    }
    
    .tweet {
      border-bottom: 1px solid #2f3336;
      padding: 16px 0;
      animation: fadeIn 0.3s ease-in;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 14px;
    }
    
    .icon {
      font-size: 16px;
    }
    
    .username {
      color: #1d9bf0;
      font-weight: 600;
    }
    
    .date {
      color: #71767b;
      font-size: 13px;
    }
    
    .text {
      font-size: 15px;
      line-height: 1.5;
      margin-bottom: 8px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    
    .link {
      color: #1d9bf0;
      text-decoration: none;
      font-size: 13px;
      display: inline-block;
      margin-top: 8px;
    }
    
    .link:hover {
      text-decoration: underline;
    }
    
    footer {
      text-align: center;
      padding: 32px 0;
      color: #71767b;
      font-size: 13px;
    }
    
    .refresh-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1d9bf0;
      color: #fff;
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
      z-index: 100;
    }
    
    .refresh-btn:active {
      transform: scale(0.95);
    }
    
    @media (max-width: 600px) {
      .container {
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📱 Twitter Feed</h1>
      <div class="subtitle">Last updated: ${lastUpdate}</div>
    </header>
    
    <main>
      ${tweetHTML || '<div class="tweet"><div class="text">No tweets found</div></div>'}
    </main>
    
    <footer>
      Updates every 30 minutes<br>
      Monitoring: ${CONFIG.ACCOUNTS.map(u => '@' + u).join(', ')}
    </footer>
  </div>
  
  <button class="refresh-btn" onclick="location.reload()" title="Refresh">↻</button>
  
  <script>
    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service worker registered'))
        .catch(err => console.log('Service worker registration failed:', err));
    }
    
    // Auto-refresh every 30 minutes
    setTimeout(() => location.reload(), 30 * 60 * 1000);
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

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(60));
  console.log('Twitter Scraper Starting');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Accounts: ${CONFIG.ACCOUNTS.join(', ')}`);
  console.log('═'.repeat(60));
  
  const accountData = await fetchAllTweets();
  
  const html = generateHTML(accountData);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('\n✅ Generated index.html');
  
  const totalTweets = accountData.reduce((sum, a) => sum + a.tweets.length, 0);
  console.log(`📊 Total tweets: ${totalTweets}`);
  
  console.log('\n' + '═'.repeat(60));
  console.log('Complete');
  console.log('═'.repeat(60));
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
