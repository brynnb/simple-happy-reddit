export function generateMediaHTML(media) {
  if (!media) return "";

  switch (media.type) {
    case "image":
      return `
        <div class="media-container">
          <img src="${media.url}" alt="Reddit image" class="media-image" onerror="handleMediaError(this)" loading="lazy">
          <div class="media-error" style="display: none;">Failed to load image</div>
        </div>
      `;

    case "reddit_video":
    case "video":
      return `
        <div class="media-container">
          <video controls class="media-video" preload="metadata" onerror="handleMediaError(this)">
            <source src="${media.url}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div class="media-error" style="display: none;">Failed to load video</div>
        </div>
      `;

    case "gallery":
      const galleryImages = media.images
        .map(
          (img) =>
            `<img src="${img.url}" alt="Gallery image" class="gallery-image" onerror="handleMediaError(this)" loading="lazy">`
        )
        .join("");
      return `
        <div class="media-container">
          <div class="media-gallery">
            ${galleryImages}
          </div>
          <div class="media-error" style="display: none;">Failed to load gallery</div>
        </div>
      `;

    default:
      return "";
  }
}

export function generateHTML(
  posts,
  postCount,
  hiddenCount = 0,
  pageTitle = "Simple Happy Reddit"
) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            background-color: #f8f9fa;
          }
          h1 {
            color: #ff4500;
            text-align: center;
            margin-bottom: 30px;
          }

          .post {
            background: white;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .post.self-post {
            
          }
          .post-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 15px;
            width: 100%;
          }
          .post-title {
            color: #0079d3;
            text-decoration: none;
            font-weight: 500;
            font-size: 16px;
            flex-grow: 1;
            min-width: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }
          .post-title:hover {
            text-decoration: underline;
          }
          .self-text {
            color: #333;
            font-size: 14px;
            line-height: 1.5;
            margin-top: 10px;
            padding: 10px;
            background-color: #f8f9fa;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .self-text.expandable {
            cursor: pointer;
            position: relative;
          }
          .self-text.expandable:hover {
            background-color: #e9ecef;
          }
          .expand-indicator {
            color: #0079d3;
            font-weight: 500;
            font-size: 12px;
            margin-top: 5px;
            user-select: none;
          }
          .post-meta {
            color: #666;
            font-size: 14px;
            flex-shrink: 0;
            text-align: right;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            min-width: 280px;
            justify-self: flex-end;
            margin-left: auto;
          }
          .comments-link {
            color: #0079d3;
            text-decoration: none;
          }
          .comments-link:hover {
            text-decoration: underline;
          }
          .loading {
            text-align: center;
            color: #666;
            font-style: italic;
          }
          .post-count {
            text-align: center;
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
          }
          .media-container {
            margin-top: 15px;
            border-radius: 8px;
            overflow: hidden;
            background-color: #000;
          }
          .media-image {
            width: 100%;
            height: auto;
            max-height: 600px;
            object-fit: contain;
            display: block;
          }
          .media-video {
            width: 100%;
            height: auto;
            max-height: 600px;
            display: block;
          }
          .media-gallery {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
          }
          .gallery-image {
            flex: 1;
            min-width: 200px;
            max-width: 100%;
            height: auto;
            object-fit: cover;
            border-radius: 4px;
          }
          .media-error {
            padding: 20px;
            text-align: center;
            color: #666;
            background-color: #f8f9fa;
            border-radius: 4px;
            margin-top: 10px;
          }
          .subreddit-container {
            display: flex;
            align-items: center;
            gap: 4px;
            justify-content: flex-end;
          }
          .block-icon {
            cursor: pointer;
            opacity: 0.3;
            transition: opacity 0.2s ease;
            font-size: 10px;
            color: #666;
            user-select: none;
            padding: 2px;
            border-radius: 2px;
          }
          .block-icon:hover {
            opacity: 0.8;
            background-color: #f0f0f0;
          }
          .block-icon:active {
            opacity: 1;
            background-color: #e0e0e0;
          }
        </style>
        <script>
          function toggleSelfText(element) {
            const textDiv = element.querySelector('.self-text-content');
            const indicator = element.querySelector('.expand-indicator');
            const isExpanded = element.dataset.expanded === 'true';
            
            if (isExpanded) {
              const fullText = element.dataset.full;
              const truncated = fullText.length > 500 ? fullText.substring(0, 500) + '...' : fullText;
              textDiv.textContent = truncated;
              indicator.textContent = 'Click to read more...';
              element.dataset.expanded = 'false';
            } else {
              textDiv.textContent = element.dataset.full;
              indicator.textContent = 'Click to show less...';
              element.dataset.expanded = 'true';
            }
          }
          
          function handleMediaError(element) {
            element.style.display = 'none';
            const errorDiv = element.parentNode.querySelector('.media-error');
            if (errorDiv) {
              errorDiv.style.display = 'block';
            }
          }

          let blockedSubreddits = new Set();
          
          function loadBlockedSubreddits() {
            fetch('/api/blocked/subreddits')
              .then(response => response.json())
              .then(data => {
                blockedSubreddits = new Set(data.subreddits.map(s => s.toLowerCase()));
                updateBlockIcons();
              })
              .catch(error => {
                console.error('Error loading blocked subreddits:', error);
              });
          }
          
          function updateBlockIcons() {
            document.querySelectorAll('.block-icon').forEach(icon => {
              const subreddit = icon.dataset.subreddit.toLowerCase();
              if (blockedSubreddits.has(subreddit)) {
                icon.style.opacity = '1';
                icon.style.color = '#ff4500';
                icon.title = 'Subreddit is blocked';
                icon.onclick = null;
              }
            });
          }

          function blockSubreddit(subreddit, iconElement) {
            fetch('/api/blocked/subreddits', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ subreddit: subreddit })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                iconElement.style.opacity = '1';
                iconElement.style.color = '#ff4500';
                iconElement.title = 'Subreddit blocked';
                iconElement.onclick = null;
                blockedSubreddits.add(subreddit.toLowerCase());
                hidePostsFromSubreddit(subreddit);
                
                if (data.hiddenCount > 0) {
                  console.log('Blocked subreddit ' + subreddit + ' and hid ' + data.hiddenCount + ' posts');
                  const notification = document.createElement('div');
                  notification.style.cssText = 
                    'position: fixed;' +
                    'top: 20px;' +
                    'right: 20px;' +
                    'background: #ff4500;' +
                    'color: white;' +
                    'padding: 10px 15px;' +
                    'border-radius: 5px;' +
                    'z-index: 1000;' +
                    'font-size: 14px;' +
                    'box-shadow: 0 2px 10px rgba(0,0,0,0.2);';
                  notification.textContent = 'Blocked r/' + subreddit + ' and hid ' + data.hiddenCount + ' posts';
                  document.body.appendChild(notification);
                  
                  setTimeout(function() {
                    notification.remove();
                  }, 3000);
                }
              } else {
                alert('Failed to block subreddit');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to block subreddit');
            });
          }
          
          function hidePostsFromSubreddit(subreddit) {
            document.querySelectorAll('.post').forEach(post => {
              const postSubreddit = post.querySelector('.block-icon').dataset.subreddit;
              if (postSubreddit.toLowerCase() === subreddit.toLowerCase()) {
                post.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                post.style.opacity = '0';
                post.style.transform = 'scale(0.95)';
                setTimeout(() => {
                  post.style.display = 'none';
                }, 300);
              }
            });
          }
          
          document.addEventListener('DOMContentLoaded', loadBlockedSubreddits);
        </script>
      </head>
      <body>
        <h1>${pageTitle === "Hidden Posts" ? "😢" : "🎉"} ${pageTitle}</h1>
        ${
          posts.length === 0
            ? '<div class="loading">Loading posts or no posts available...</div>'
            : `<div class="post-count">Showing ${
                posts.length
              } posts (${postCount} visible${
                hiddenCount > 0 ? `, ${hiddenCount} hidden` : ""
              })</div>
              ${
                hiddenCount > 0 && pageTitle === "Simple Happy Reddit"
                  ? `<div style="text-align: center; margin-bottom: 20px;"><a href="/hidden" style="color: #0079d3; text-decoration: none;">View ${hiddenCount} hidden posts</a></div>`
                  : ""
              }
              ${
                pageTitle === "Hidden Posts"
                  ? `<div style="text-align: center; margin-bottom: 20px;"><a href="/" style="color: #0079d3; text-decoration: none;">← Back to visible posts</a></div>`
                  : ""
              }
          ${posts
            .map(
              (post) => `
            <div class="post${post.selfText ? " self-post" : ""}">
              <div class="post-header">
                <a href="${
                  post.url
                }" class="post-title" target="_blank" rel="noopener noreferrer">
                  ${post.title}
                </a>
                <div class="post-meta">
                  (${post.score} points - <a href="${
                post.commentsUrl
              }" class="comments-link" target="_blank" rel="noopener noreferrer">${
                post.commentsText
              }</a>)<br>
                  <div class="subreddit-container">
                    <span style="font-size: 12px; color: #888;">r/${
                      post.subreddit
                    }</span>
                    <span class="block-icon" data-subreddit="${
                      post.subreddit
                    }" onclick="blockSubreddit('${
                post.subreddit
              }', this)" title="Block this subreddit">🚫</span>
                  </div>
                </div>
              </div>
              ${
                post.selfText
                  ? post.selfText.length > 500
                    ? `<div class="self-text expandable" onclick="toggleSelfText(this)" data-full="${post.selfText.replace(
                        /"/g,
                        "&quot;"
                      )}" data-expanded="false">
                        <div class="self-text-content">${post.selfText.substring(
                          0,
                          500
                        )}...</div>
                        <div class="expand-indicator">Click to read more...</div>
                      </div>`
                    : `<div class="self-text">
                        <div class="self-text-content">${post.selfText}</div>
                      </div>`
                  : ""
              }
              ${generateMediaHTML(post.media)}
            </div>
          `
            )
            .join("")}`
        }
      </body>
    </html>
  `;
}
