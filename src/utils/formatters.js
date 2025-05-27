export function formatScore(score) {
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}k`;
  }
  return score.toString();
}

export function formatComments(numComments) {
  if (numComments >= 1000) {
    return `${(numComments / 1000).toFixed(1)}k comments`;
  }
  return `${numComments} comment${numComments !== 1 ? "s" : ""}`;
}

export function formatSelfText(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}

export function formatTimeAgo(createdUtc) {
  const now = Date.now() / 1000;
  const diffSeconds = now - createdUtc;
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  } else {
    return "just now";
  }
}

export function detectMediaType(url, post) {
  // Check for Reddit video first (can exist on self posts too)
  if (post.is_video && post.media && post.media.reddit_video) {
    return {
      type: "reddit_video",
      url: post.media.reddit_video.fallback_url,
      width: post.media.reddit_video.width,
      height: post.media.reddit_video.height,
    };
  }

  // Check for embedded media in self posts
  if (
    post.is_self &&
    post.media &&
    post.media.oembed &&
    post.media.oembed.thumbnail_url
  ) {
    return {
      type: "image",
      url: post.media.oembed.thumbnail_url,
    };
  }

  // Check for preview images on self posts
  if (
    post.is_self &&
    post.preview &&
    post.preview.images &&
    post.preview.images.length > 0
  ) {
    const previewImage = post.preview.images[0];
    if (previewImage.source && previewImage.source.url) {
      return {
        type: "image",
        url: previewImage.source.url.replace(/&amp;/g, "&"),
        width: previewImage.source.width,
        height: previewImage.source.height,
      };
    }
  }

  if (!url) return null;

  // Check for galleries (can exist on self posts too)
  if (post.is_gallery && post.media_metadata) {
    const images = [];
    if (post.gallery_data && post.gallery_data.items) {
      post.gallery_data.items.forEach((item) => {
        const mediaId = item.media_id;
        const metadata = post.media_metadata[mediaId];
        if (metadata && metadata.s && metadata.s.u) {
          images.push({
            url: metadata.s.u.replace(/&amp;/g, "&"),
            width: metadata.s.x,
            height: metadata.s.y,
          });
        }
      });
    }
    if (images.length > 0) {
      return {
        type: "gallery",
        images: images,
      };
    }
  }

  const imageExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
  if (imageExtensions.test(url)) {
    return {
      type: "image",
      url: url,
    };
  }

  if (url.includes("imgur.com")) {
    if (url.includes("/a/") || url.includes("/gallery/")) {
      return null;
    }

    let imgurUrl = url;
    if (!imageExtensions.test(url)) {
      const imgurId = url.split("/").pop().split(".")[0];
      imgurUrl = `https://i.imgur.com/${imgurId}.jpg`;
    }

    return {
      type: "image",
      url: imgurUrl,
    };
  }

  if (url.includes("i.redd.it")) {
    return {
      type: "image",
      url: url,
    };
  }

  if (url.includes("gfycat.com")) {
    const gfyId = url.split("/").pop();
    return {
      type: "video",
      url: `https://thumbs.gfycat.com/${gfyId}-mobile.mp4`,
    };
  }

  if (url.includes("v.redd.it")) {
    return {
      type: "reddit_video",
      url: url,
    };
  }

  return null;
}
