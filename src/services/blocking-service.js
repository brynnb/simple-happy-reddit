class BlockingService {
  constructor(db) {
    this.db = db;
    this.blockedSubreddits = new Set();
    this.blockedKeywords = [];
    this.lastCacheUpdate = 0;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  updateCache() {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.cacheTimeout) {
      this.blockedSubreddits = new Set(
        this.db.getBlockedSubreddits().map((s) => s.toLowerCase())
      );
      this.blockedKeywords = this.db
        .getBlockedKeywords()
        .map((k) => k.toLowerCase());
      this.lastCacheUpdate = now;
    }
  }

  isPostBlocked(post) {
    this.updateCache();

    if (this.blockedSubreddits.has(post.subreddit.toLowerCase())) {
      return true;
    }

    const titleLower = post.title.toLowerCase();
    const selfTextLower = post.self_text ? post.self_text.toLowerCase() : "";

    for (const keyword of this.blockedKeywords) {
      if (titleLower.includes(keyword) || selfTextLower.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  getPostStats(posts) {
    let hiddenCount = 0;
    let visibleCount = 0;

    for (const post of posts) {
      if (this.isPostBlocked(post)) {
        hiddenCount++;
      } else {
        visibleCount++;
      }
    }

    return { hiddenCount, visibleCount, total: posts.length };
  }

  getBlockedSubreddits() {
    this.updateCache();
    return Array.from(this.blockedSubreddits);
  }

  getBlockedKeywords() {
    this.updateCache();
    return [...this.blockedKeywords];
  }

  addBlockedSubreddit(subreddit) {
    const addResult = this.db.addBlockedSubreddit(subreddit);
    const hideResult = this.db.hidePostsBySubreddit(subreddit);
    this.lastCacheUpdate = 0; // Force cache refresh
    return { addResult, hideResult };
  }

  removeBlockedSubreddit(subreddit) {
    const result = this.db.removeBlockedSubreddit(subreddit);
    this.lastCacheUpdate = 0; // Force cache refresh
    return result;
  }

  addBlockedKeyword(keyword) {
    const addResult = this.db.addBlockedKeyword(keyword);
    const hideResult = this.db.hidePostsByKeyword(keyword);
    this.lastCacheUpdate = 0; // Force cache refresh
    return { addResult, hideResult };
  }

  removeBlockedKeyword(keyword) {
    const result = this.db.removeBlockedKeyword(keyword);
    this.lastCacheUpdate = 0; // Force cache refresh
    return result;
  }
}

export default BlockingService;
