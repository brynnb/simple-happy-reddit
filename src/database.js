import Database from "better-sqlite3";
import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";

const DB_FILE = "reddit_posts.db";
const BUCKET_NAME =
  process.env.GOOGLE_CLOUD_STORAGE_BUCKET || "simple-happy-reddit-db";

class DatabaseManager {
  constructor() {
    this.db = null;
    this.storage = null;
    this.isCloudEnabled = false;
  }

  async initialize() {
    try {
      if (
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT
      ) {
        this.storage = new Storage();
        this.isCloudEnabled = true;
        console.log("Cloud Storage enabled");

        await this.downloadDatabaseFromCloud();
      } else {
        console.log("Running locally without Cloud Storage");
      }
    } catch (error) {
      console.log(
        "Cloud Storage not available, running locally:",
        error.message
      );
      this.isCloudEnabled = false;
    }

    this.db = new Database(DB_FILE);
    this.createTables();

    console.log("Database initialized");
  }

  async downloadDatabaseFromCloud() {
    if (!this.isCloudEnabled) return;

    try {
      const bucket = this.storage.bucket(BUCKET_NAME);
      const file = bucket.file(DB_FILE);

      const [exists] = await file.exists();
      if (exists) {
        console.log("Downloading database from Cloud Storage...");
        await file.download({ destination: DB_FILE });
        console.log("Database downloaded successfully");
      } else {
        console.log("No existing database found in Cloud Storage");
      }
    } catch (error) {
      console.log("Could not download database from cloud:", error.message);
    }
  }

  async uploadDatabaseToCloud() {
    if (!this.isCloudEnabled) return;

    try {
      const bucket = this.storage.bucket(BUCKET_NAME);
      await bucket.upload(DB_FILE, {
        destination: DB_FILE,
        metadata: {
          cacheControl: "no-cache",
        },
      });
      console.log("Database uploaded to Cloud Storage");
    } catch (error) {
      console.error("Failed to upload database to cloud:", error.message);
    }
  }

  createTables() {
    const createPostsTable = `
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        score INTEGER,
        num_comments INTEGER,
        subreddit TEXT,
        created_utc INTEGER,
        is_self BOOLEAN,
        self_text TEXT,
        media_type TEXT,
        media_data TEXT,
        permalink TEXT,
        fetched_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(id)
      )
    `;

    const createBlockedSubredditsTable = `
      CREATE TABLE IF NOT EXISTS blocked_subreddits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subreddit TEXT UNIQUE NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createBlockedKeywordsTable = `
      CREATE TABLE IF NOT EXISTS blocked_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createCategoriesTable = `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createTagsTable = `
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createPostCategoriesTable = `
      CREATE TABLE IF NOT EXISTS post_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (category_id) REFERENCES categories(id),
        UNIQUE(post_id, category_id)
      )
    `;

    const createPostTagsTable = `
      CREATE TABLE IF NOT EXISTS post_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id),
        UNIQUE(post_id, tag_id)
      )
    `;

    this.db.exec(createPostsTable);
    this.db.exec(createBlockedSubredditsTable);
    this.db.exec(createBlockedKeywordsTable);
    this.db.exec(createCategoriesTable);
    this.db.exec(createTagsTable);
    this.db.exec(createPostCategoriesTable);
    this.db.exec(createPostTagsTable);

    this.addHiddenColumnIfNotExists();
    this.addAnalysisColumnsIfNotExists();

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts(subreddit);
      CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_utc DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_fetched ON posts(fetched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden);
      CREATE INDEX IF NOT EXISTS idx_posts_analyzed_at ON posts(analyzed_at);
      CREATE INDEX IF NOT EXISTS idx_posts_read_at ON posts(read_at);
      CREATE INDEX IF NOT EXISTS idx_blocked_subreddits ON blocked_subreddits(subreddit);
      CREATE INDEX IF NOT EXISTS idx_blocked_keywords ON blocked_keywords(keyword);
      CREATE INDEX IF NOT EXISTS idx_categories ON categories(name);
      CREATE INDEX IF NOT EXISTS idx_tags ON tags(name);
      CREATE INDEX IF NOT EXISTS idx_post_categories ON post_categories(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_tags ON post_tags(post_id);
    `;

    this.db.exec(createIndexes);
    this.initializeBlockedItems();
    this.initializeCategories();
    this.initializeTags();
    this.updateExistingPostsHiddenStatus();
  }

  addHiddenColumnIfNotExists() {
    try {
      const stmt = this.db.prepare(`
        ALTER TABLE posts ADD COLUMN hidden BOOLEAN DEFAULT 0
      `);
      stmt.run();
      console.log("Added hidden column to posts table");
    } catch (error) {
      if (!error.message.includes("duplicate column name")) {
        console.error("Error adding hidden column:", error.message);
      }
    }
  }

  addAnalysisColumnsIfNotExists() {
    const columns = [
      { name: "ai_explanation", type: "TEXT" },
      { name: "analyzed_at", type: "INTEGER" },
      { name: "read_at", type: "INTEGER" },
    ];

    for (const column of columns) {
      try {
        const stmt = this.db.prepare(`
          ALTER TABLE posts ADD COLUMN ${column.name} ${column.type}
        `);
        stmt.run();
        console.log(`Added ${column.name} column to posts table`);
      } catch (error) {
        if (!error.message.includes("duplicate column name")) {
          console.error(`Error adding ${column.name} column:`, error.message);
        }
      }
    }
  }

  async savePost(postData) {
    return await this.savePosts([postData]);
  }

  async savePosts(postsArray) {
    const stmt = this.db.prepare(`
      INSERT INTO posts (
        id, title, url, score, num_comments, subreddit, 
        created_utc, is_self, self_text, media_type, 
        media_data, permalink, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        score = excluded.score,
        num_comments = excluded.num_comments,
        subreddit = excluded.subreddit,
        created_utc = excluded.created_utc,
        is_self = excluded.is_self,
        self_text = excluded.self_text,
        media_type = excluded.media_type,
        media_data = excluded.media_data,
        permalink = excluded.permalink,
        hidden = excluded.hidden
    `);

    const transaction = this.db.transaction((posts) => {
      for (const post of posts) {
        const isHidden = this.isPostBlocked(post);
        stmt.run(
          post.id,
          post.title,
          post.url,
          post.score,
          post.num_comments,
          post.subreddit,
          post.created_utc,
          post.is_self ? 1 : 0,
          post.self_text,
          post.media_type,
          post.media_data,
          post.permalink,
          isHidden ? 1 : 0
        );
      }
    });

    const result = transaction(postsArray);
    await this.uploadDatabaseToCloud();
    return result;
  }

  getPosts(
    limit = 100,
    offset = 0,
    includeHidden = false,
    includeRead = true,
    prioritizeAnalyzed = false
  ) {
    let whereConditions = [];

    if (!includeHidden) {
      whereConditions.push("hidden = 0");
    }

    if (!includeRead) {
      whereConditions.push("read_at IS NULL");
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    let orderClause;
    if (prioritizeAnalyzed) {
      // Show analyzed posts first (sorted by score), then unanalyzed posts (sorted by score)
      orderClause =
        "ORDER BY (analyzed_at IS NOT NULL) DESC, score DESC, created_utc DESC";
    } else {
      orderClause = "ORDER BY score DESC, created_utc DESC";
    }

    const stmt = this.db.prepare(`
      SELECT * FROM posts 
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  getPostsBySubreddit(subreddit, limit = 100, includeHidden = false) {
    const hiddenClause = includeHidden ? "" : "AND hidden = 0";
    const stmt = this.db.prepare(`
      SELECT * FROM posts 
      WHERE LOWER(subreddit) = LOWER(?) ${hiddenClause}
      ORDER BY score DESC 
      LIMIT ?
    `);
    return stmt.all(subreddit, limit);
  }

  getPostCount(includeHidden = false, includeRead = true) {
    let whereConditions = [];

    if (!includeHidden) {
      whereConditions.push("hidden = 0");
    }

    if (!includeRead) {
      whereConditions.push("read_at IS NULL");
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM posts ${whereClause}`
    );
    return stmt.get().count;
  }

  getHiddenPostCount() {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM posts WHERE hidden = 1"
    );
    return stmt.get().count;
  }

  togglePostVisibility(postId) {
    const stmt = this.db.prepare(`
      UPDATE posts SET hidden = NOT hidden WHERE id = ?
    `);
    return stmt.run(postId);
  }

  hidePostsBySubreddit(subreddit) {
    const stmt = this.db.prepare(`
      UPDATE posts SET hidden = 1 WHERE LOWER(subreddit) = LOWER(?)
    `);
    const result = stmt.run(subreddit);
    console.log(`Hidden ${result.changes} posts from subreddit: ${subreddit}`);
    return result;
  }

  hidePostsByKeyword(keyword) {
    // Get all posts and check them with the same word boundary logic
    const allPosts = this.db
      .prepare("SELECT id, title, self_text FROM posts")
      .all();
    const postsToHide = [];

    // Use word boundary regex to match whole words only
    const regex = new RegExp(
      `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );

    for (const post of allPosts) {
      const titleLower = post.title.toLowerCase();
      const selfTextLower = post.self_text ? post.self_text.toLowerCase() : "";

      if (regex.test(titleLower) || regex.test(selfTextLower)) {
        postsToHide.push(post.id);
      }
    }

    if (postsToHide.length > 0) {
      const placeholders = postsToHide.map(() => "?").join(",");
      const stmt = this.db.prepare(`
        UPDATE posts SET hidden = 1 WHERE id IN (${placeholders})
      `);
      const result = stmt.run(...postsToHide);
      console.log(
        `Hidden ${result.changes} posts containing keyword: ${keyword}`
      );
      return result;
    } else {
      console.log(`No posts found containing keyword: ${keyword}`);
      return { changes: 0 };
    }
  }

  updateExistingPostsHiddenStatus() {
    const allPosts = this.db.prepare("SELECT * FROM posts").all();
    let updatedCount = 0;

    const updateStmt = this.db.prepare(`
      UPDATE posts SET hidden = ? WHERE id = ?
    `);

    for (const post of allPosts) {
      const shouldBeHidden = this.isPostBlocked(post);
      if (shouldBeHidden !== Boolean(post.hidden)) {
        updateStmt.run(shouldBeHidden ? 1 : 0, post.id);
        updatedCount++;
      }
    }

    console.log(`Updated hidden status for ${updatedCount} existing posts`);
    return updatedCount;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  initializeBlockedItems() {
    const blockedSubreddits = [
      "meme",
      "wtf",
      "antimlm",
      "crappydesign",
      "tooktoomuch",
      "rareinsults",
      "Iamactuallyverybadass",
      "oddlyterrifying",
      "justiceserved",
      "im14andthisisdeep",
      "IdiotsNearlyDying",
      "thathappened",
      "pettyrevenge",
      "wellthatsucks",
      "byebyejob",
      "assholedesign",
      "niceguys",
      "MaliciousCompliance",
      "Botchedsurgeries",
      "tumblr",
      "kidsarefuckingstupid",
      "unpopularopinion",
      "awfuleverything",
      "justneckbeardthings",
      "quityourbullshit",
      "ProRevenge",
      "aboringdystopia",
      "winstupidprizes",
      "instantkarma",
      "instant_regret",
      "trueoffmychest",
      "elusionalcraigslist",
      "politics",
      "notliketheothergirls",
      "FragileWhiteRedditor",
      "creepy",
      "iamatotalpieceofshit",
      "woooosh",
      "Fuckthealtright",
      "DemocraticSocialism",
      "MarchAgainstNazis",
      "popping",
      "teenagers",
      "LeopardsAteMyFace",
      "watchpeopledieinside",
      "fuckyoukaren",
      "confidentlyincorrect",
      "trashtaste",
      "nothowgirlswork",
      "medizzy",
      "mildlyinfuriating",
      "antiwork",
      "religiousfruitcake",
      "amitheasshole",
      "makemesuffer",
      "murderedbywords",
      "pussypassdenied",
      "cringe",
      "beggars",
      "circlejerk",
      "trashy",
      "fuckyouinparticular",
      "rareinsults",
      "capitolconsequences",
      "ImTheMainCharacter",
      "toiletpaperusa",
      "twoxchromosomes",
      "selfawarewolves",
      "politicalhumor",
      "blackpeopletwitter",
      "whitepeopletwitter",
      "tinder",
      "idiotsfightingthings",
      "idiotsincars",
      "facepalm",
      "lifeprotips",
      "whatcouldgowrong",
      "latestagecapitalism",
      "tihi",
      "holup",
      "tiktokcringe",
      "WitchesVsPatriarchy",
      "corona",
      "therewasanattempt",
      "politicalcompassmemes",
      "fail",
      "porn",
      "poverty",
      "natureismetal",
      "publicfreakout",
      "fightporn",
      "murderedbyaoc",
      "atetheonion",
      "clevercomebacks",
      "PeterExplainsTheJoke",
      "formuladank",
      "sipstea",
      "UkraineWarVideoReport",
      "agedlikemilk",
      "AITAH",
      "blueskySocial",
      "realtesla",
      "cyberstuck",
      "fednews",
      "wallstreetbets",
      "comics",
      "technology",
      "pics",
      "news",
      "50501",
      "shitposting",
      "Fauxmoi",
      "RealTwitterAccounts",
      "letgirlshavefun",
      "nbatalk",
      "adviceanimals",
      "ukraine",
      "entitledpeople",
      "explainthejoke",
    ];

    const blockedKeywords = [
      "trump",
      "covid",
      "911 call",
      "hillary clinton",
      "bill clinton",
      "Alexandria Ocasio-Cortez",
      "AOC",
      "candace owens",
      "obama",
      "under investigation",
      "white supremacy",
      "vaccine",
      "daca",
      "democrats",
      "prosecutors",
      "climate change",
      "global warming",
      "capitol riot",
      "probation officer",
      "bail",
      "leaked documents",
      "pandemic",
      "lab leak",
      "bill cosby",
      "ben shapiro",
      "wikileaks",
      "assange",
      "poisoned",
      "killed",
      "go on strike",
      "monopolize",
      "entitled",
      "millenials",
      "millennials",
      "protests",
      "gun violence",
      "virus",
      "far left",
      "far-left",
      "far-right",
      "far right",
      "vaccine",
      "pfizer",
      "domestic violence",
      "abuse",
      "abusive",
      "covid-19",
      "corona",
      "biden",
      " dies ",
      " died ",
      " passed away ",
      " dead ",
      " bombed ",
      " explosion ",
      " unsafe ",
      " nazi",
      "outraged",
      "us congress",
      "senate",
      "congress",
      "assault",
      "Marjorie Taylor Greene",
      "prison",
      "police",
      "cops",
      "racist",
      "homeless",
      "fauci",
      "gee i wonder",
      "fox news",
      "sentenced",
      "republicans",
      " gop ",
      "death",
      "election",
      "christian right",
      "confederate",
      "abortion",
      " MAGA ",
      "hate crime",
      "mcconnell",
      "filibuster",
      "elon",
      "doge",
      "walz",
      "vance",
      "petah",
      "killing",
      "shooter",
      "fbi",
      "ukrain",
      "Zelenskyy",
      "Zelensky",
      "putin",
      "russia",
      "tesla",
      "cyberstuck",
      "cybertruck",
      "plane crash",
      "fascist",
      "fascism",
      "yellowstone",
      "canada",
      "canadian",
      "tariff",
      "tariffs",
      "impeachment",
      "arrested",
      "tourist",
      "immigrant",
      "visa",
      "immigration",
      "trade",
      "war",
      "maga",
      "politics",
      "gender",
      "bigot",
      "bigotry",
      "ukraine",
      "government",
      "rape",
    ];

    const existingSubreddits = this.getBlockedSubreddits();
    const existingKeywords = this.getBlockedKeywords();

    if (existingSubreddits.length === 0) {
      this.addBlockedSubreddits(blockedSubreddits);
    }

    if (existingKeywords.length === 0) {
      this.addBlockedKeywords(blockedKeywords);
    }
  }

  initializeCategories() {
    const categories = [
      "Politics",
      "Violence",
      "Social Issues",
      "Mean Stuff",
      "Unpleasant",
    ];

    const existingCategories = this.getCategories();

    if (existingCategories.length === 0) {
      this.addCategories(categories);
    }
  }

  initializeTags() {
    const tags = [
      "elon",
      "trump",
      "biden",
      "politics",
      "war",
      "international affairs",
      "election",
      "covid",
      "health pandemic",
      "climate change",
      "tesla",
      "spacex",
      "twitter",
      "tech companies",
      "artificial intelligence",
      "cryptocurrency",
      "economy",
      "hate speech",
      "government",
      "criminal justice",
      "police",
      "crime",
      "violence",

      "racism",
      "discrimination",
      "lgbtq",
      "gender issues",
      "natural disaster",

      "controversy",
      "gossip",
      "misinformation",
      "tv shows",
      "movies",
      "music",
      "books",
      "art",
      "food",
      "travel",
      "video games",
      "sports",
      "human abuse",
      "animal abuse",
    ];

    const existingTags = this.getTags();

    if (existingTags.length === 0) {
      this.addTags(tags);
    }
  }

  addBlockedSubreddit(subreddit) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO blocked_subreddits (subreddit) VALUES (?)
    `);
    return stmt.run(subreddit.toLowerCase());
  }

  addBlockedSubreddits(subreddits) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO blocked_subreddits (subreddit) VALUES (?)
    `);
    const transaction = this.db.transaction((subreddits) => {
      for (const subreddit of subreddits) {
        stmt.run(subreddit.toLowerCase());
      }
    });
    return transaction(subreddits);
  }

  removeBlockedSubreddit(subreddit) {
    const stmt = this.db.prepare(`
      DELETE FROM blocked_subreddits WHERE subreddit = ?
    `);
    return stmt.run(subreddit.toLowerCase());
  }

  getBlockedSubreddits() {
    const stmt = this.db.prepare(`
      SELECT subreddit FROM blocked_subreddits ORDER BY subreddit
    `);
    return stmt.all().map((row) => row.subreddit);
  }

  addBlockedKeyword(keyword) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO blocked_keywords (keyword) VALUES (?)
    `);
    return stmt.run(keyword.toLowerCase());
  }

  addBlockedKeywords(keywords) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO blocked_keywords (keyword) VALUES (?)
    `);
    const transaction = this.db.transaction((keywords) => {
      for (const keyword of keywords) {
        stmt.run(keyword.toLowerCase());
      }
    });
    return transaction(keywords);
  }

  removeBlockedKeyword(keyword) {
    const stmt = this.db.prepare(`
      DELETE FROM blocked_keywords WHERE keyword = ?
    `);
    return stmt.run(keyword.toLowerCase());
  }

  getBlockedKeywords() {
    const stmt = this.db.prepare(`
      SELECT keyword FROM blocked_keywords ORDER BY keyword
    `);
    return stmt.all().map((row) => row.keyword);
  }

  addCategory(name) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO categories (name) VALUES (?)
    `);
    return stmt.run(name);
  }

  addCategories(categories) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO categories (name) VALUES (?)
    `);
    const transaction = this.db.transaction((categories) => {
      for (const category of categories) {
        stmt.run(category);
      }
    });
    return transaction(categories);
  }

  removeCategory(name) {
    const stmt = this.db.prepare(`
      DELETE FROM categories WHERE name = ?
    `);
    return stmt.run(name);
  }

  getCategories() {
    const stmt = this.db.prepare(`
      SELECT name FROM categories ORDER BY name
    `);
    return stmt.all().map((row) => row.name);
  }

  addTag(name) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO tags (name) VALUES (?)
    `);
    return stmt.run(name);
  }

  addTags(tags) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO tags (name) VALUES (?)
    `);
    const transaction = this.db.transaction((tags) => {
      for (const tag of tags) {
        stmt.run(tag);
      }
    });
    return transaction(tags);
  }

  removeTag(name) {
    const stmt = this.db.prepare(`
      DELETE FROM tags WHERE name = ?
    `);
    return stmt.run(name);
  }

  getTags() {
    const stmt = this.db.prepare(`
      SELECT name FROM tags ORDER BY name
    `);
    return stmt.all().map((row) => row.name);
  }

  clearAndReseedTags() {
    const transaction = this.db.transaction(() => {
      // First, delete all existing post_tags relationships
      this.db.prepare("DELETE FROM post_tags").run();

      // Then delete all tags
      this.db.prepare("DELETE FROM tags").run();

      // Reset the auto-increment counter
      this.db.prepare("DELETE FROM sqlite_sequence WHERE name = 'tags'").run();

      // Now reseed with the same tags as initializeTags()
      const tags = [
        "elon",
        "trump",
        "biden",
        "politics",
        "war",
        "international affairs",
        "election",
        "covid",
        "health pandemic",
        "climate change",
        "tesla",
        "spacex",
        "twitter",
        "tech companies",
        "artificial intelligence",
        "cryptocurrency",
        "economy",
        "hate speech",
        "government policy",
        "criminal justice",
        "police",
        "crime",
        "violence",
        "racism",
        "discrimination",
        "lgbtq",
        "gender issues",
        "natural disaster",
        "controversy",
        "misinformation",
        "human abuse",
        "animal abuse",
        "medical issues",
        "activism",
      ];

      this.addTags(tags);
    });

    transaction();
    console.log("Tags table cleared and reseeded with predefined tags");
    return this.getTags().length;
  }

  clearAllModerationData() {
    const transaction = this.db.transaction(() => {
      // Clear all post_categories relationships
      this.db.prepare("DELETE FROM post_categories").run();

      // Clear all post_tags relationships
      this.db.prepare("DELETE FROM post_tags").run();

      // Reset all posts to unhidden and clear moderation fields (preserve read_at)
      this.db
        .prepare(
          `
        UPDATE posts SET 
          hidden = 0,
          ai_explanation = NULL,
          analyzed_at = NULL
      `
        )
        .run();

      // Re-apply blocking rules based on current subreddit and keyword filters
      this.updateExistingPostsHiddenStatus();
    });

    transaction();
    console.log("All moderation data cleared and posts re-filtered");

    // Get stats for the response
    const totalPosts = this.getPostCount(true);
    const hiddenPosts = this.getHiddenPostCount();
    const visiblePosts = totalPosts - hiddenPosts;

    return {
      totalPosts,
      hiddenPosts,
      visiblePosts,
      clearedCategories: true,
      clearedTags: true,
      reappliedFilters: true,
    };
  }

  clearUnreadModerationData() {
    const transaction = this.db.transaction(() => {
      // Get unread post IDs first
      const unreadPostIds = this.db
        .prepare("SELECT id FROM posts WHERE read_at IS NULL")
        .all()
        .map((row) => row.id);

      if (unreadPostIds.length === 0) {
        return;
      }

      const placeholders = unreadPostIds.map(() => "?").join(",");

      // Clear post_categories relationships for unread posts only
      this.db
        .prepare(
          `DELETE FROM post_categories WHERE post_id IN (${placeholders})`
        )
        .run(...unreadPostIds);

      // Clear post_tags relationships for unread posts only
      this.db
        .prepare(`DELETE FROM post_tags WHERE post_id IN (${placeholders})`)
        .run(...unreadPostIds);

      // Reset unread posts to unhidden and clear moderation fields
      this.db
        .prepare(
          `UPDATE posts SET 
            hidden = 0,
            ai_explanation = NULL,
            analyzed_at = NULL
          WHERE read_at IS NULL`
        )
        .run();

      // Re-apply blocking rules based on current subreddit and keyword filters
      this.updateExistingPostsHiddenStatus();
    });

    transaction();
    console.log("Unread moderation data cleared and posts re-filtered");

    // Get stats for the response
    const totalPosts = this.getPostCount(true, true);
    const clearedPosts = this.db
      .prepare("SELECT COUNT(*) as count FROM posts WHERE read_at IS NULL")
      .get().count;
    const preservedPosts = this.db
      .prepare("SELECT COUNT(*) as count FROM posts WHERE read_at IS NOT NULL")
      .get().count;
    const hiddenPosts = this.getHiddenPostCount();
    const visiblePosts = totalPosts - hiddenPosts;

    return {
      totalPosts,
      clearedPosts,
      preservedPosts,
      hiddenPosts,
      visiblePosts,
      clearedCategories: true,
      clearedTags: true,
      reappliedFilters: true,
    };
  }

  isPostBlocked(post) {
    const blockedSubreddits = this.getBlockedSubreddits();
    const blockedKeywords = this.getBlockedKeywords();

    if (blockedSubreddits.includes(post.subreddit.toLowerCase())) {
      return true;
    }

    const titleLower = post.title.toLowerCase();
    const selfTextLower = post.self_text ? post.self_text.toLowerCase() : "";

    for (const keyword of blockedKeywords) {
      // Use word boundary regex to match whole words only
      // This prevents "rape" from matching "grape" but allows "gang-rape"
      const regex = new RegExp(
        `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );

      if (regex.test(titleLower) || regex.test(selfTextLower)) {
        return true;
      }
    }

    return false;
  }

  getUnanalyzedPosts(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM posts 
      WHERE analyzed_at IS NULL 
        AND hidden = 0 
        AND read_at IS NULL
      ORDER BY score DESC, created_utc DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  saveAnalysisResult(postId, matchesBlocked, categories, tags, explanation) {
    const transaction = this.db.transaction(() => {
      const updatePost = this.db.prepare(`
        UPDATE posts 
        SET ai_explanation = ?, 
            analyzed_at = strftime('%s', 'now')
        WHERE id = ?
      `);
      updatePost.run(explanation, postId);

      const deleteExistingCategories = this.db.prepare(`
        DELETE FROM post_categories WHERE post_id = ?
      `);
      deleteExistingCategories.run(postId);

      const deleteExistingTags = this.db.prepare(`
        DELETE FROM post_tags WHERE post_id = ?
      `);
      deleteExistingTags.run(postId);

      if (categories && categories.length > 0) {
        const insertCategory = this.db.prepare(`
          INSERT INTO post_categories (post_id, category_id)
          SELECT ?, id FROM categories WHERE name = ?
        `);
        for (const category of categories) {
          try {
            insertCategory.run(postId, category);
          } catch (error) {
            console.warn(`Category not found: ${category}`);
          }
        }
      }

      if (tags && tags.length > 0) {
        const insertTag = this.db.prepare(`
          INSERT INTO post_tags (post_id, tag_id)
          SELECT ?, id FROM tags WHERE name = ?
        `);
        for (const tag of tags) {
          try {
            insertTag.run(postId, tag);
          } catch (error) {
            console.warn(`Tag not found: ${tag}`);
          }
        }
      }
    });

    transaction();
  }

  getPostCategories(postId) {
    const stmt = this.db.prepare(`
      SELECT c.name FROM categories c
      JOIN post_categories pc ON c.id = pc.category_id
      WHERE pc.post_id = ?
    `);
    return stmt.all(postId).map((row) => row.name);
  }

  getPostTags(postId) {
    const stmt = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `);
    return stmt.all(postId).map((row) => row.name);
  }

  markPostAsRead(postId) {
    const stmt = this.db.prepare(`
      UPDATE posts SET read_at = strftime('%s', 'now') WHERE id = ?
    `);
    return stmt.run(postId);
  }

  markPostsAsRead(postIds) {
    if (!postIds || postIds.length === 0) return;

    const placeholders = postIds.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      UPDATE posts SET read_at = strftime('%s', 'now') WHERE id IN (${placeholders})
    `);
    return stmt.run(...postIds);
  }

  getReadPostCount() {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM posts WHERE read_at IS NOT NULL"
    );
    return stmt.get().count;
  }
}

export default DatabaseManager;
