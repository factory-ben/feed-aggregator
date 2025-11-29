const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY - database sync disabled');
}

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Upsert posts to Supabase
 * @param {Array} posts - Array of post objects
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
async function upsertPosts(posts) {
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  if (!posts || posts.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    // Deduplicate posts by ID (keep the first occurrence)
    const seenIds = new Set();
    const uniquePosts = posts.filter(post => {
      if (seenIds.has(post.id)) return false;
      seenIds.add(post.id);
      return true;
    });

    const formattedPosts = uniquePosts.map(post => ({
      id: post.id,
      source: post.source,
      author: post.author,
      content: post.content || null,
      url: post.url || null,
      timestamp: post.timestamp,
      category: post.category || post.classification?.label || null,
      metadata: post.metadata || null,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('posts')
      .upsert(formattedPosts, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error('[Supabase] Error upserting posts:', error.message);
      return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: formattedPosts.length };
  } catch (err) {
    console.error('[Supabase] Exception upserting posts:', err.message);
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Get all posts from Supabase
 * @param {Object} options - Query options
 * @param {number} options.limit - Max posts to return (default 500)
 * @param {string} options.source - Filter by source
 * @returns {Promise<Array>}
 */
async function getPosts({ limit = 500, source = null } = {}) {
  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from('posts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Supabase] Error fetching posts:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] Exception fetching posts:', err.message);
    return [];
  }
}

/**
 * Check if Supabase is configured and connected
 * @returns {Promise<boolean>}
 */
async function isConnected() {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase.from('posts').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

module.exports = {
  supabase,
  upsertPosts,
  getPosts,
  isConnected
};
