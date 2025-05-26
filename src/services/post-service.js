import { formatScore, formatComments } from "../utils/formatters.js";

export function transformPostsForDisplay(storedPosts) {
  return storedPosts.map((post) => ({
    title: post.title,
    url: post.url,
    score: formatScore(post.score),
    commentsText: formatComments(post.num_comments),
    commentsUrl: `https://old.reddit.com${post.permalink}`,
    selfText: post.self_text,
    isSelf: post.is_self,
    media: post.media_data ? JSON.parse(post.media_data) : null,
    subreddit: post.subreddit,
  }));
}
