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

    this.db.exec(createPostsTable);
    this.db.exec(createBlockedSubredditsTable);
    this.db.exec(createBlockedKeywordsTable);
    this.db.exec(createCategoriesTable);
    this.db.exec(createTagsTable);

    this.addHiddenColumnIfNotExists();

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts(subreddit);
      CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_utc DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_fetched ON posts(fetched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden);
      CREATE INDEX IF NOT EXISTS idx_blocked_subreddits ON blocked_subreddits(subreddit);
      CREATE INDEX IF NOT EXISTS idx_blocked_keywords ON blocked_keywords(keyword);
      CREATE INDEX IF NOT EXISTS idx_categories ON categories(name);
      CREATE INDEX IF NOT EXISTS idx_tags ON tags(name);
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

  async savePost(postData) {
    const isHidden = this.isPostBlocked(postData);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO posts (
        id, title, url, score, num_comments, subreddit, 
        created_utc, is_self, self_text, media_type, 
        media_data, permalink, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      postData.id,
      postData.title,
      postData.url,
      postData.score,
      postData.num_comments,
      postData.subreddit,
      postData.created_utc,
      postData.is_self ? 1 : 0,
      postData.self_text,
      postData.media_type,
      postData.media_data,
      postData.permalink,
      isHidden ? 1 : 0
    );

    await this.uploadDatabaseToCloud();
    return result;
  }

  async savePosts(postsArray) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO posts (
        id, title, url, score, num_comments, subreddit, 
        created_utc, is_self, self_text, media_type, 
        media_data, permalink, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  getPosts(limit = 100, offset = 0, includeHidden = false) {
    const whereClause = includeHidden ? "" : "WHERE hidden = 0";
    const stmt = this.db.prepare(`
      SELECT * FROM posts 
      ${whereClause}
      ORDER BY score DESC, created_utc DESC 
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

  getPostCount(includeHidden = false) {
    const whereClause = includeHidden ? "" : "WHERE hidden = 0";
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
    const stmt = this.db.prepare(`
      UPDATE posts SET hidden = 1 
      WHERE LOWER(title) LIKE LOWER(?) OR LOWER(self_text) LIKE LOWER(?)
    `);
    const keywordPattern = `%${keyword}%`;
    const result = stmt.run(keywordPattern, keywordPattern);
    console.log(
      `Hidden ${result.changes} posts containing keyword: ${keyword}`
    );
    return result;
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
      " daca ",
      "democrats",
      "prosecutors",
      "climate change",
      "global warming",
      "capitol riot",
      "probation officer",
      " bail ",
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
      "stock market",
      "housing market",
      "federal reserve",
      "supreme court",
      "congress",
      "abortion",
      "gun control",
      "immigration",
      "healthcare",
      "social security",
      "student loans",
      "debt ceiling",
      "government shutdown",
      "criminal justice",
      "police",
      "crime",
      "violence",
      "protest",
      "racism",
      "discrimination",
      "lgbtq",
      "gender issues",
      "natural disaster",
      "celebrity",
      "scandal",
      "controversy",
      "cancel culture",
      "social media",
      "misinformation",
      "conspiracy",
      "extremism",
      "terrorism",
      "cybersecurity",
      "privacy",
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

  isPostBlocked(post) {
    const blockedSubreddits = this.getBlockedSubreddits();
    const blockedKeywords = this.getBlockedKeywords();

    if (blockedSubreddits.includes(post.subreddit.toLowerCase())) {
      return true;
    }

    const titleLower = post.title.toLowerCase();
    const selfTextLower = post.self_text ? post.self_text.toLowerCase() : "";

    for (const keyword of blockedKeywords) {
      if (titleLower.includes(keyword) || selfTextLower.includes(keyword)) {
        return true;
      }
    }

    return false;
  }
}

export default DatabaseManager;
