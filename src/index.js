import express from "express";
import dotenv from "dotenv";
import DatabaseManager from "./database.js";
import BlockingService from "./services/blocking-service.js";
import AIAnalysisService from "./services/ai-analysis-service.js";
import { scrapeReddit } from "./reddit-scraper.js";
import { generateHTML } from "./templates/html-template.js";
import { transformPostsForDisplay } from "./services/post-service.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const db = new DatabaseManager();
const blockingService = new BlockingService(db);
const aiAnalysisService = new AIAnalysisService(db);

app.use(express.static("public"));
app.use(express.json());

await db.initialize();

app.get("/", async (req, res) => {
  try {
    let attempts = 0;
    const maxAttempts = 5;
    let after = null;

    // Keep fetching until we have at least 100 visible unread posts or hit max attempts
    while (attempts < maxAttempts) {
      const visibleUnreadCount = db.getPostCount(false, false);

      if (visibleUnreadCount >= 100) {
        console.log(
          `Have ${visibleUnreadCount} visible unread posts, no need to fetch more`
        );
        break;
      }

      console.log(
        `Only ${visibleUnreadCount} visible unread posts, fetching more from Reddit (attempt ${
          attempts + 1
        }/${maxAttempts})`
      );

      const { postsToSave, after: nextAfter } = await scrapeReddit(after);

      if (postsToSave.length > 0) {
        await db.savePosts(postsToSave);
        const stats = blockingService.getPostStats(postsToSave);
        console.log(
          `Saved ${stats.total} posts to database (${stats.hiddenCount} hidden, ${stats.visibleCount} visible)`
        );
        after = nextAfter;
      } else {
        console.log("No new posts fetched, stopping attempts");
        break;
      }

      if (!nextAfter) {
        console.log("No more pages available, stopping attempts");
        break;
      }

      attempts++;
    }

    const storedPosts = db.getPosts(100, 0, false, false);
    const postCount = db.getPostCount(false, false);
    const hiddenCount = db.getHiddenPostCount();
    const readCount = db.getReadPostCount();
    const posts = transformPostsForDisplay(storedPosts, db);

    const html = generateHTML(
      posts,
      postCount,
      hiddenCount,
      "Simple Happy Reddit",
      readCount
    );
    res.send(html);

    if (process.env.OPENAI_API_KEY) {
      setImmediate(async () => {
        try {
          await aiAnalysisService.processAnalysisQueue(100);
        } catch (error) {
          console.error("AI analysis error:", error);
        }
      });
    }
  } catch (error) {
    console.error("Error in route handler:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error loading Reddit posts</h1>
          <p>Please try again later.</p>
        </body>
      </html>
    `);
  }
});

app.get("/filtered", async (req, res) => {
  try {
    const hiddenPosts = db.getPosts(100, 0, true).filter((post) => post.hidden);
    const posts = transformPostsForDisplay(hiddenPosts, db);
    const hiddenCount = db.getHiddenPostCount();

    const html = generateHTML(posts, hiddenCount, 0, "Filtered Posts");
    res.send(html);
  } catch (error) {
    console.error("Error getting hidden posts:", error);
    res.status(500).json({ error: "Failed to get hidden posts" });
  }
});

app.get("/read", async (req, res) => {
  try {
    const readPosts = db.db
      .prepare(
        `
      SELECT * FROM posts 
      WHERE read_at IS NOT NULL 
      ORDER BY read_at DESC, score DESC 
      LIMIT 100
    `
      )
      .all();

    const posts = transformPostsForDisplay(readPosts, db);
    const readCount = db.getReadPostCount();

    const html = generateHTML(posts, readCount, 0, "Read Posts");
    res.send(html);
  } catch (error) {
    console.error("Error getting read posts:", error);
    res.status(500).json({ error: "Failed to get read posts" });
  }
});

app.get("/analyzed", async (req, res) => {
  try {
    const analyzedPosts = db.db
      .prepare(
        `
      SELECT * FROM posts 
      WHERE analyzed_at IS NOT NULL 
      ORDER BY analyzed_at DESC, score DESC 
      LIMIT 100
    `
      )
      .all();

    const posts = transformPostsForDisplay(analyzedPosts, db);
    const analyzedCount = db.db
      .prepare(
        "SELECT COUNT(*) as count FROM posts WHERE analyzed_at IS NOT NULL"
      )
      .get().count;

    const html = generateHTML(posts, analyzedCount, 0, "AI Analyzed Posts");
    res.send(html);
  } catch (error) {
    console.error("Error getting analyzed posts:", error);
    res.status(500).json({ error: "Failed to get analyzed posts" });
  }
});

app.post("/api/posts/:id/toggle", (req, res) => {
  try {
    const { id } = req.params;
    db.togglePostVisibility(id);
    res.json({ success: true, message: `Toggled visibility for post ${id}` });
  } catch (error) {
    console.error("Error toggling post visibility:", error);
    res.status(500).json({ error: "Failed to toggle post visibility" });
  }
});

app.post("/api/posts/mark-read", async (req, res) => {
  try {
    const { postIds } = req.body;
    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ error: "postIds array is required" });
    }

    db.markPostsAsRead(postIds);
    await db.uploadDatabaseToCloud();

    res.json({
      success: true,
      message: `Marked ${postIds.length} posts as read`,
      markedCount: postIds.length,
    });
  } catch (error) {
    console.error("Error marking posts as read:", error);
    res.status(500).json({ error: "Failed to mark posts as read" });
  }
});

app.get("/api/stats", (req, res) => {
  try {
    const totalPosts = db.getPostCount(true, true);
    const visiblePosts = db.getPostCount(false, false);
    const hiddenPosts = db.getHiddenPostCount();
    const readPosts = db.getReadPostCount();

    res.json({
      total: totalPosts,
      visible: visiblePosts,
      hidden: hiddenPosts,
      read: readPosts,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

app.get("/api/blocked/subreddits", (req, res) => {
  try {
    const subreddits = blockingService.getBlockedSubreddits();
    res.json({ subreddits });
  } catch (error) {
    console.error("Error getting blocked subreddits:", error);
    res.status(500).json({ error: "Failed to get blocked subreddits" });
  }
});

app.post("/api/blocked/subreddits", async (req, res) => {
  try {
    const { subreddit } = req.body;
    if (!subreddit) {
      return res.status(400).json({ error: "Subreddit is required" });
    }
    const result = blockingService.addBlockedSubreddit(subreddit);
    await db.uploadDatabaseToCloud();
    res.json({
      success: true,
      message: `Blocked subreddit: ${subreddit}`,
      hiddenCount: result.hideResult.changes || 0,
    });
  } catch (error) {
    console.error("Error adding blocked subreddit:", error);
    res.status(500).json({ error: "Failed to add blocked subreddit" });
  }
});

app.delete("/api/blocked/subreddits/:subreddit", (req, res) => {
  try {
    const { subreddit } = req.params;
    blockingService.removeBlockedSubreddit(subreddit);
    res.json({ success: true, message: `Unblocked subreddit: ${subreddit}` });
  } catch (error) {
    console.error("Error removing blocked subreddit:", error);
    res.status(500).json({ error: "Failed to remove blocked subreddit" });
  }
});

app.get("/api/blocked/keywords", (req, res) => {
  try {
    const keywords = blockingService.getBlockedKeywords();
    res.json({ keywords });
  } catch (error) {
    console.error("Error getting blocked keywords:", error);
    res.status(500).json({ error: "Failed to get blocked keywords" });
  }
});

app.post("/api/blocked/keywords", async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "Keyword is required" });
    }
    const result = blockingService.addBlockedKeyword(keyword);
    await db.uploadDatabaseToCloud();
    res.json({
      success: true,
      message: `Blocked keyword: ${keyword}`,
      hiddenCount: result.hideResult.changes || 0,
    });
  } catch (error) {
    console.error("Error adding blocked keyword:", error);
    res.status(500).json({ error: "Failed to add blocked keyword" });
  }
});

app.delete("/api/blocked/keywords/:keyword", (req, res) => {
  try {
    const { keyword } = req.params;
    blockingService.removeBlockedKeyword(keyword);
    res.json({ success: true, message: `Unblocked keyword: ${keyword}` });
  } catch (error) {
    console.error("Error removing blocked keyword:", error);
    res.status(500).json({ error: "Failed to remove blocked keyword" });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: "OpenAI API key not configured" });
    }

    const { limit } = req.body;
    const analysisLimit = Math.min(limit || 100, 200);

    const result = await aiAnalysisService.processAnalysisQueue(analysisLimit);

    res.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      message: `Analyzed ${result.processed} posts with ${result.errors} errors`,
    });
  } catch (error) {
    console.error("Error running AI analysis:", error);
    res.status(500).json({ error: "Failed to run AI analysis" });
  }
});

app.post("/api/moderate-all", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: "OpenAI API key not configured" });
    }

    const unanalyzedCount = db.db
      .prepare(
        "SELECT COUNT(*) as count FROM posts WHERE analyzed_at IS NULL AND hidden = 0 AND read_at IS NULL"
      )
      .get().count;

    if (unanalyzedCount === 0) {
      return res.json({
        success: true,
        message: "No unanalyzed posts to moderate",
        queued: 0,
      });
    }

    setImmediate(async () => {
      try {
        await aiAnalysisService.processAnalysisQueue(unanalyzedCount);
        await db.uploadDatabaseToCloud();
      } catch (error) {
        console.error("Background moderation error:", error);
      }
    });

    res.json({
      success: true,
      message: `Queued ${unanalyzedCount} posts for AI analysis`,
      queued: unanalyzedCount,
    });
  } catch (error) {
    console.error("Error queuing posts for moderation:", error);
    res.status(500).json({ error: "Failed to queue posts for moderation" });
  }
});

app.get("/api/analysis/stats", (req, res) => {
  try {
    const totalPosts = db.getPostCount(true);
    const analyzedStmt = db.db.prepare(
      "SELECT COUNT(*) as count FROM posts WHERE analyzed_at IS NOT NULL"
    );
    const analyzedCount = analyzedStmt.get().count;
    const unanalyzedCount = totalPosts - analyzedCount;

    res.json({
      total: totalPosts,
      analyzed: analyzedCount,
      unanalyzed: unanalyzedCount,
    });
  } catch (error) {
    console.error("Error getting analysis stats:", error);
    res.status(500).json({ error: "Failed to get analysis stats" });
  }
});

app.post("/api/moderation/clear", async (req, res) => {
  try {
    const result = db.clearAllModerationData();
    await db.uploadDatabaseToCloud();

    res.json({
      success: true,
      message: "All moderation data cleared successfully",
      stats: result,
    });
  } catch (error) {
    console.error("Error clearing moderation data:", error);
    res.status(500).json({ error: "Failed to clear moderation data" });
  }
});

app.post("/api/tags/reinitialize", async (req, res) => {
  try {
    const tagCount = db.clearAndReseedTags();
    await db.uploadDatabaseToCloud();

    res.json({
      success: true,
      message: `Tags reinitialized successfully with ${tagCount} tags`,
      tagCount: tagCount,
    });
  } catch (error) {
    console.error("Error reinitializing tags:", error);
    res.status(500).json({ error: "Failed to reinitialize tags" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
