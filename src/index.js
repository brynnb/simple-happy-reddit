import express from "express";
import dotenv from "dotenv";
import DatabaseManager from "./database.js";
import BlockingService from "./services/blocking-service.js";
import { scrapeReddit } from "./reddit-scraper.js";
import { generateHTML } from "./templates/html-template.js";
import { transformPostsForDisplay } from "./services/post-service.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const db = new DatabaseManager();
const blockingService = new BlockingService(db);

app.use(express.static("public"));
app.use(express.json());

await db.initialize();

app.get("/", async (req, res) => {
  try {
    const { postsToSave } = await scrapeReddit();

    if (postsToSave.length > 0) {
      await db.savePosts(postsToSave);
      const stats = blockingService.getPostStats(postsToSave);
      console.log(
        `Saved ${stats.total} posts to database (${stats.hiddenCount} hidden, ${stats.visibleCount} visible)`
      );
    }

    const storedPosts = db.getPosts(100);
    const postCount = db.getPostCount();
    const hiddenCount = db.getHiddenPostCount();
    const posts = transformPostsForDisplay(storedPosts);

    const html = generateHTML(posts, postCount, hiddenCount);
    res.send(html);
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

app.get("/hidden", async (req, res) => {
  try {
    const hiddenPosts = db.getPosts(100, 0, true).filter((post) => post.hidden);
    const posts = transformPostsForDisplay(hiddenPosts);
    const hiddenCount = db.getHiddenPostCount();

    const html = generateHTML(posts, hiddenCount, 0, "Hidden Posts");
    res.send(html);
  } catch (error) {
    console.error("Error getting hidden posts:", error);
    res.status(500).json({ error: "Failed to get hidden posts" });
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

app.get("/api/stats", (req, res) => {
  try {
    const totalPosts = db.getPostCount(true);
    const visiblePosts = db.getPostCount(false);
    const hiddenPosts = db.getHiddenPostCount();

    res.json({
      total: totalPosts,
      visible: visiblePosts,
      hidden: hiddenPosts,
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
