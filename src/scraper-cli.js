#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const { scrapeReddit } = require('./scrapers/reddit');
const { scrapeGitHub } = require('./scrapers/github');
const { scrapeTwitter, filterTweets } = require('./scrapers/twitter');
const { 
  initStorage, 
  loadFeed, 
  loadSeen, 
  saveFeed, 
  saveSeen,
  filterNewItems 
} = require('./storage');
const { upsertPosts, isConnected } = require('./lib/supabase');

/**
 * CLI scraper that runs once and outputs to public/data/feed.json
 * Used by GitHub Actions
 */
async function main() {
  try {
    console.log('[CLI] Starting feed scrape...');
    await initStorage();

    // Load from docs/data/feed.json (the committed file) instead of data/feed.json
    // This ensures continuity between GitHub Actions runs
    const docsDataDir = path.join(__dirname, '../docs/data');
    const docsFeedPath = path.join(docsDataDir, 'feed.json');
    
    let feed = [];
    try {
      await fs.mkdir(docsDataDir, { recursive: true });
      const data = await fs.readFile(docsFeedPath, 'utf-8');
      feed = JSON.parse(data);
      console.log('[CLI] Loaded existing feed from docs/data/feed.json:', feed.length, 'items');
    } catch (error) {
      console.log('[CLI] No existing feed found, starting fresh');
      feed = [];
    }

    // Load seen IDs from docs/data/seen.json (persists across runs)
    const docsSeenPath = path.join(docsDataDir, 'seen.json');
    let seenData = { ids: [], conversations: [] };
    try {
      const data = await fs.readFile(docsSeenPath, 'utf-8');
      seenData = JSON.parse(data);
      console.log('[CLI] Loaded', seenData.ids.length, 'seen IDs from docs/data/seen.json');
    } catch (error) {
      console.log('[CLI] No seen IDs found, starting fresh');
    }
    
    // Convert seen data to Set for efficient lookups
    const seen = new Set(seenData.ids || []);

    console.log('[CLI] Current feed size:', feed.length);
    console.log('[CLI] Seen items:', seen.size);

    const results = await Promise.allSettled([
      scrapeReddit(),
      scrapeGitHub(),
      scrapeTwitter()
    ]);

    let allItems = [];

    results.forEach((result, index) => {
      const source = ['Reddit', 'GitHub', 'Twitter'][index];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        console.log(`[CLI] ${source}: fetched ${result.value.length} items`);
        allItems = allItems.concat(result.value);
      } else if (result.status === 'rejected') {
        console.error(`[CLI] ${source}: failed -`, result.reason?.message || result.reason);
      }
    });

    // Filter tweets if we got any
    const twitterItems = allItems.filter(item => item.source === 'twitter');
    if (twitterItems.length > 0) {
      const filteredTwitter = filterTweets(twitterItems);
      const otherItems = allItems.filter(item => item.source !== 'twitter');
      allItems = [...otherItems, ...filteredTwitter];
      console.log(`[CLI] Twitter: filtered to ${filteredTwitter.length} items`);
    }

    const newItems = filterNewItems(allItems, seen);
    console.log(`[CLI] New items to add: ${newItems.length}`);

    if (newItems.length > 0) {
      newItems.forEach(item => seen.add(item.id));
      feed.push(...newItems);
      
      // Sort by timestamp (newest first)
      feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Keep only last 500 items
      const trimmedFeed = feed.slice(0, 500);
      
      await saveFeed(trimmedFeed);
      
      console.log(`[CLI] Feed updated: ${trimmedFeed.length} total items`);
    } else {
      console.log('[CLI] No new items');
    }

    // Write to docs/data/ for GitHub Pages (persist feed and seen IDs)
    await fs.mkdir(docsDataDir, { recursive: true });
    
    await fs.writeFile(docsFeedPath, JSON.stringify(feed, null, 2));
    
    // Persist seen IDs (trim to last 1000 to prevent file from growing too large)
    const trimmedSeen = {
      ids: Array.from(seen).slice(-1000),
      conversations: (seenData.conversations || []).slice(-1000)
    };
    await fs.writeFile(docsSeenPath, JSON.stringify(trimmedSeen, null, 2));
    
    console.log('[CLI] Wrote feed to:', docsFeedPath);

    // Sync to Supabase if configured
    const supabaseConnected = await isConnected();
    if (supabaseConnected) {
      console.log('[CLI] Syncing posts to Supabase...');
      const result = await upsertPosts(feed);
      if (result.success) {
        console.log(`[CLI] Supabase: synced ${result.count} posts`);
      } else {
        console.error('[CLI] Supabase sync failed:', result.error);
      }
    } else {
      console.log('[CLI] Supabase not configured, skipping sync');
    }

    console.log('[CLI] Scrape complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('[CLI] Fatal error:', error);
    process.exit(1);
  }
}

main();
