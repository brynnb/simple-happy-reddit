import fetch from "node-fetch";
import { formatSelfText, detectMediaType } from "./utils/formatters.js";

export async function scrapeReddit(after = null) {
  try {
    let url = "https://www.reddit.com/r/all.json?limit=100";
    if (after) {
      url += `&after=${after}`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const posts = [];
    const postsToSave = [];

    data.data.children.forEach((item) => {
      const post = item.data;

      if (
        post.title &&
        !post.title.includes("[removed]") &&
        !post.title.includes("[deleted]")
      ) {
        let finalUrl = post.url;
        if (post.is_self) {
          finalUrl = `https://old.reddit.com${post.permalink}`;
        }

        const commentsUrl = `https://old.reddit.com${post.permalink}`;

        let selfText = null;
        if (post.selftext && post.selftext.trim()) {
          selfText = formatSelfText(post.selftext);
        }

        // Check for media regardless of whether it's a self post
        // Self posts can now have embedded images/videos
        const media = detectMediaType(post.url, post);

        const postData = {
          id: post.id,
          title: post.title,
          url: finalUrl,
          score: post.score,
          num_comments: post.num_comments,
          subreddit: post.subreddit,
          created_utc: post.created_utc,
          is_self: post.is_self,
          self_text: selfText,
          media_type: media ? media.type : null,
          media_data: media ? JSON.stringify(media) : null,
          permalink: post.permalink,
        };

        postsToSave.push(postData);

        posts.push({
          title: post.title,
          url: finalUrl,
          score: post.score,
          commentsText: post.num_comments,
          commentsUrl: commentsUrl,
          selfText: selfText,
          isSelf: post.is_self,
          media: media,
          subreddit: post.subreddit,
        });
      }
    });

    return { posts, postsToSave, after: data.data.after };
  } catch (error) {
    console.error("Error scraping Reddit:", error);
    return { posts: [], postsToSave: [], after: null };
  }
}
