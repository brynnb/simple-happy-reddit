import { formatScore, formatComments } from "../utils/formatters.js";

export function transformPostsForDisplay(storedPosts, db = null) {
  const filteredPosts = storedPosts.filter((post) => {
    if (db && post.analyzed_at) {
      const categories = db.getPostCategories(post.id);
      const blockedCategories = ["Politics", "Violence", "Mean Stuff"];

      const hasBlockedCategory = categories.some((category) =>
        blockedCategories.includes(category)
      );

      if (hasBlockedCategory) {
        return false;
      }
    }
    return true;
  });

  return filteredPosts.map((post) => {
    const basePost = {
      id: post.id,
      title: post.title,
      url: post.url,
      score: formatScore(post.score),
      commentsText: formatComments(post.num_comments),
      commentsUrl: `https://old.reddit.com${post.permalink}`,
      selfText: post.self_text,
      isSelf: post.is_self,
      media: post.media_data ? JSON.parse(post.media_data) : null,
      subreddit: post.subreddit,
      aiExplanation: post.ai_explanation || null,
      analyzedAt: post.analyzed_at || null,
    };

    if (db && post.analyzed_at) {
      basePost.categories = db.getPostCategories(post.id);
      basePost.tags = db.getPostTags(post.id);
    }

    return basePost;
  });
}
