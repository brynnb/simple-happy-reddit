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
  pageTitle = "Simple Happy Reddit",
  readCount = 0
) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
          // Prevent browser scroll restoration
          if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
          }
        </script>
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
            padding: 6px 10px;
            background-color: #f8f9fa;
            border-radius: 4px;
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
          .post-tags-categories {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #f0f0f0;
            font-size: 12px;
            color: #888;
            line-height: 1.4;
          }
          .tags-container, .categories-container {
            margin-bottom: 4px;
          }
          .tag, .category {
            display: inline-block;
            background-color: #f8f9fa;
            color: #666;
            padding: 2px 6px;
            margin: 1px 2px 1px 0;
            border-radius: 3px;
            font-size: 11px;
            border: 1px solid #e9ecef;
          }
          .tag {
            background-color: #f0f8ff;
            border-color: #d6e9f7;
          }
          .category {
            background-color: #f8f0ff;
            border-color: #e9d6f7;
          }
          .debug-info {
            margin-top: 12px;
            padding: 10px;
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 4px;
            font-size: 12px;
            color: #856404;
            display: none;
          }
          .debug-info.visible {
            display: block;
          }
          .debug-label {
            font-weight: 600;
            margin-bottom: 5px;
          }
          .debug-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.4;
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
          let readPosts = new Set();
          let visibilityObserver;
          let postVisibilityTimers = new Map();
          let isAtTop = true;
          let readTrackingEnabled = false;
          
          // Batching variables for mark as read
          let pendingReadPostIds = new Set();
          let markAsReadTimer = null;
          const MARK_AS_READ_BATCH_DELAY = 5000; // 5 seconds
          
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

          function initializeReadTracking() {
            // Force scroll to top on page load (override browser scroll restoration)
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            
            // Monitor scroll position to enable/disable read tracking
            function checkScrollPosition() {
              const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
              const wasAtTop = isAtTop;
              isAtTop = scrollTop < 50; // Consider "at top" if within 50px of top
              
              // Enable read tracking when user starts scrolling down from the top
              if (wasAtTop && !isAtTop && !readTrackingEnabled) {
                readTrackingEnabled = true;
                console.log('Read tracking enabled - user started scrolling down');
              }
            }
            
            // Check initial position
            checkScrollPosition();
            
            // Monitor scroll events
            window.addEventListener('scroll', checkScrollPosition, { passive: true });
            
            if ('IntersectionObserver' in window) {
              visibilityObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                  const postElement = entry.target;
                  const postId = postElement.dataset.postId;
                  
                  if (entry.isIntersecting && readTrackingEnabled) {
                    // Post is visible and read tracking is enabled, start timer
                    if (!postVisibilityTimers.has(postId)) {
                      const timer = setTimeout(() => {
                        markPostAndAboveAsRead(postElement);
                      }, 1000);
                      postVisibilityTimers.set(postId, timer);
                    }
                  } else {
                    // Post is no longer visible or read tracking disabled, clear timer
                    const timer = postVisibilityTimers.get(postId);
                    if (timer) {
                      clearTimeout(timer);
                      postVisibilityTimers.delete(postId);
                    }
                  }
                });
              }, {
                threshold: 0.5,
                rootMargin: '0px'
              });

              // Observe all posts
              document.querySelectorAll('.post[data-post-id]').forEach(post => {
                visibilityObserver.observe(post);
              });
            }
          }

          function markPostAndAboveAsRead(postElement) {
            const allPosts = Array.from(document.querySelectorAll('.post[data-post-id]'));
            const currentPostIndex = allPosts.indexOf(postElement);
            
            if (currentPostIndex === -1) return;
            
            // Get all posts from the top up to and including the current post
            const postsToMarkRead = allPosts.slice(0, currentPostIndex + 1);
            const postIds = postsToMarkRead
              .map(post => post.dataset.postId)
              .filter(id => !readPosts.has(id) && !pendingReadPostIds.has(id));
            
            if (postIds.length === 0) return;
            
            // Mark posts as read locally and add to pending batch
            postIds.forEach(id => {
              readPosts.add(id);
              pendingReadPostIds.add(id);
            });
            
            // Clear existing timer and set a new one
            if (markAsReadTimer) {
              clearTimeout(markAsReadTimer);
            }
            
            markAsReadTimer = setTimeout(() => {
              sendBatchedReadRequests();
            }, MARK_AS_READ_BATCH_DELAY);
          }
          
          function sendBatchedReadRequests() {
            if (pendingReadPostIds.size === 0) return;
            
            const postIdsToSend = Array.from(pendingReadPostIds);
            const currentBatch = new Set(pendingReadPostIds);
            
            // Clear the pending set and timer
            pendingReadPostIds.clear();
            markAsReadTimer = null;
            
            // Send to server
            fetch('/api/posts/mark-read', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ postIds: postIdsToSend })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                console.log('Marked ' + postIdsToSend.length + ' posts as read (batched)');
              }
            })
            .catch(error => {
              console.error('Error marking posts as read:', error);
              // Remove from local set if server request failed
              currentBatch.forEach(id => readPosts.delete(id));
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
          
          function toggleDebugInfo() {
            const debugToggle = document.getElementById('debugToggle');
            const debugInfos = document.querySelectorAll('.debug-info');
            
            debugInfos.forEach(debugInfo => {
              if (debugToggle.checked) {
                debugInfo.classList.add('visible');
              } else {
                debugInfo.classList.remove('visible');
              }
            });
            
            // Save state to localStorage
            localStorage.setItem('debugInfoVisible', debugToggle.checked);
          }
          
          function loadDebugInfoState() {
            const debugToggle = document.getElementById('debugToggle');
            const savedState = localStorage.getItem('debugInfoVisible');
            
            if (savedState === 'true') {
              debugToggle.checked = true;
              toggleDebugInfo();
            }
          }
          
          function moderateAllContent() {
            const button = document.getElementById('moderateAllBtn');
            const originalText = button.textContent;
            button.textContent = 'Queuing...';
            button.disabled = true;
            button.style.backgroundColor = '#6c757d';
            
            fetch('/api/moderate-all', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const notification = document.createElement('div');
                notification.style.cssText = 
                  'position: fixed;' +
                  'top: 20px;' +
                  'right: 20px;' +
                  'background: #28a745;' +
                  'color: white;' +
                  'padding: 15px 20px;' +
                  'border-radius: 5px;' +
                  'z-index: 1000;' +
                  'font-size: 14px;' +
                  'box-shadow: 0 2px 10px rgba(0,0,0,0.2);' +
                  'max-width: 300px;' +
                  'line-height: 1.4;';
                notification.innerHTML = 
                  '<strong>AI Analysis Queued!</strong><br>' +
                  data.message;
                document.body.appendChild(notification);
                
                setTimeout(function() {
                  notification.remove();
                }, 5000);
              } else {
                alert('Failed to queue moderation: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to queue moderation');
            })
            .finally(() => {
              button.textContent = originalText;
              button.disabled = false;
              button.style.backgroundColor = '#007bff';
            });
          }

          function clearModerationData() {
            const confirmed = confirm(
              'Are you sure you want to delete ALL moderation data?\\n\\n' +
              'This will:\\n' +
              '• Clear all AI analysis results\\n' +
              '• Remove all post categories and tags\\n' +
              '• Reset all posts to visible\\n' +
              '• Re-apply subreddit and keyword filters\\n' +
              '• Preserve read status of posts\\n\\n' +
              'This action cannot be undone!'
            );
            
            if (!confirmed) {
              return;
            }
            
            const button = document.getElementById('clearModerationBtn');
            const originalText = button.textContent;
            button.textContent = 'Clearing...';
            button.disabled = true;
            button.style.backgroundColor = '#6c757d';
            
            fetch('/api/moderation/clear', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const notification = document.createElement('div');
                notification.style.cssText = 
                  'position: fixed;' +
                  'top: 20px;' +
                  'right: 20px;' +
                  'background: #28a745;' +
                  'color: white;' +
                  'padding: 15px 20px;' +
                  'border-radius: 5px;' +
                  'z-index: 1000;' +
                  'font-size: 14px;' +
                  'box-shadow: 0 2px 10px rgba(0,0,0,0.2);' +
                  'max-width: 300px;' +
                  'line-height: 1.4;';
                notification.innerHTML = 
                  '<strong>Moderation data cleared!</strong><br>' +
                  'Total posts: ' + data.stats.totalPosts + '<br>' +
                  'Visible: ' + data.stats.visiblePosts + '<br>' +
                  'Hidden: ' + data.stats.hiddenPosts + '<br>' +
                  'Read status preserved';
                document.body.appendChild(notification);
                
                setTimeout(function() {
                  notification.remove();
                  window.location.reload();
                }, 3000);
              } else {
                alert('Failed to clear moderation data: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to clear moderation data');
            })
            .finally(() => {
              button.textContent = originalText;
              button.disabled = false;
              button.style.backgroundColor = '#dc3545';
            });
          }

          function clearUnreadModerationData() {
            const confirmed = confirm(
              'Are you sure you want to delete moderation data for UNREAD posts only?\\n\\n' +
              'This will:\\n' +
              '• Clear AI analysis results for unread posts\\n' +
              '• Remove categories and tags from unread posts\\n' +
              '• Reset unread posts to visible\\n' +
              '• Re-apply subreddit and keyword filters\\n' +
              '• Preserve all data for read posts\\n\\n' +
              'This action cannot be undone!'
            );
            
            if (!confirmed) {
              return;
            }
            
            const button = document.getElementById('clearUnreadModerationBtn');
            const originalText = button.textContent;
            button.textContent = 'Clearing...';
            button.disabled = true;
            button.style.backgroundColor = '#6c757d';
            
            fetch('/api/moderation/clear-unread', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const notification = document.createElement('div');
                notification.style.cssText = 
                  'position: fixed;' +
                  'top: 20px;' +
                  'right: 20px;' +
                  'background: #28a745;' +
                  'color: white;' +
                  'padding: 15px 20px;' +
                  'border-radius: 5px;' +
                  'z-index: 1000;' +
                  'font-size: 14px;' +
                  'box-shadow: 0 2px 10px rgba(0,0,0,0.2);' +
                  'max-width: 300px;' +
                  'line-height: 1.4;';
                notification.innerHTML = 
                  '<strong>Unread moderation data cleared!</strong><br>' +
                  'Cleared: ' + data.stats.clearedPosts + ' posts<br>' +
                  'Preserved: ' + data.stats.preservedPosts + ' read posts<br>' +
                  'Visible: ' + data.stats.visiblePosts + '<br>' +
                  'Hidden: ' + data.stats.hiddenPosts;
                document.body.appendChild(notification);
                
                setTimeout(function() {
                  notification.remove();
                  window.location.reload();
                }, 3000);
              } else {
                alert('Failed to clear unread moderation data: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to clear unread moderation data');
            })
            .finally(() => {
              button.textContent = originalText;
              button.disabled = false;
              button.style.backgroundColor = '#fd7e14';
            });
          }

          function reinitializeTags() {
            const confirmed = confirm(
              'Are you sure you want to reinitialize all tags?\\n\\n' +
              'This will:\\n' +
              '• Delete all existing tags\\n' +
              '• Remove all post-tag relationships\\n' +
              '• Add the predefined tags from initializeTags()\\n' +
              '• Preserve read status, categories, and AI analysis\\n\\n' +
              'This action cannot be undone!'
            );
            
            if (!confirmed) {
              return;
            }
            
            const button = document.getElementById('reinitializeTagsBtn');
            const originalText = button.textContent;
            button.textContent = 'Reinitializing...';
            button.disabled = true;
            button.style.backgroundColor = '#6c757d';
            
            fetch('/api/tags/reinitialize', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const notification = document.createElement('div');
                notification.style.cssText = 
                  'position: fixed;' +
                  'top: 20px;' +
                  'right: 20px;' +
                  'background: #28a745;' +
                  'color: white;' +
                  'padding: 15px 20px;' +
                  'border-radius: 5px;' +
                  'z-index: 1000;' +
                  'font-size: 14px;' +
                  'box-shadow: 0 2px 10px rgba(0,0,0,0.2);' +
                  'max-width: 300px;' +
                  'line-height: 1.4;';
                notification.innerHTML = 
                  '<strong>Tags reinitialized!</strong><br>' +
                  'Added ' + data.tagCount + ' predefined tags';
                document.body.appendChild(notification);
                
                setTimeout(function() {
                  notification.remove();
                  window.location.reload();
                }, 3000);
              } else {
                alert('Failed to reinitialize tags: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to reinitialize tags');
            })
            .finally(() => {
              button.textContent = originalText;
              button.disabled = false;
              button.style.backgroundColor = '#ffc107';
            });
          }
          
          document.addEventListener('DOMContentLoaded', function() {
            loadBlockedSubreddits();
            loadDebugInfoState();
            
            // Small delay to ensure page is fully loaded before initializing read tracking
            setTimeout(function() {
              initializeReadTracking();
            }, 100);
          });
          
          // Handle any pending read requests when page is about to unload
          window.addEventListener('beforeunload', function() {
            if (pendingReadPostIds.size > 0) {
              // Clear the timer and send immediately
              if (markAsReadTimer) {
                clearTimeout(markAsReadTimer);
                markAsReadTimer = null;
              }
              
              // Use sendBeacon for reliable delivery during page unload
              const postIdsToSend = Array.from(pendingReadPostIds);
              pendingReadPostIds.clear();
              
              if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/posts/mark-read', JSON.stringify({ postIds: postIdsToSend }));
              } else {
                // Fallback to synchronous request
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/posts/mark-read', false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({ postIds: postIdsToSend }));
              }
            }
          });
        </script>
      </head>
      <body>
        <h1>${pageTitle === "Filtered Posts" ? "😢" : "🎉"} ${pageTitle}</h1>
        <div style="text-align: center; margin-bottom: 20px; display: flex; justify-content: center; align-items: center; gap: 20px; flex-wrap: wrap;">
          <label style="font-size: 14px; color: #666; cursor: pointer;">
            <input type="checkbox" id="debugToggle" onchange="toggleDebugInfo()" style="margin-right: 8px;">
            Show debug info
          </label>
          <button 
            id="moderateAllBtn" 
            onclick="moderateAllContent()" 
            style="
              background: #007bff; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              font-size: 12px; 
              cursor: pointer;
              transition: background-color 0.2s ease;
            "
            onmouseover="this.style.backgroundColor='#0056b3'"
            onmouseout="this.style.backgroundColor='#007bff'"
          >
            Moderate All Content
          </button>
          <button 
            id="reinitializeTagsBtn" 
            onclick="reinitializeTags()" 
            style="
              background: #ffc107; 
              color: #212529; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              font-size: 12px; 
              cursor: pointer;
              transition: background-color 0.2s ease;
            "
            onmouseover="this.style.backgroundColor='#e0a800'"
            onmouseout="this.style.backgroundColor='#ffc107'"
          >
            Reinitialize All Tags
          </button>
          <button 
            id="clearUnreadModerationBtn" 
            onclick="clearUnreadModerationData()" 
            style="
              background: #fd7e14; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              font-size: 12px; 
              cursor: pointer;
              transition: background-color 0.2s ease;
            "
            onmouseover="this.style.backgroundColor='#e8590c'"
            onmouseout="this.style.backgroundColor='#fd7e14'"
          >
            Delete Unread Moderation Data
          </button>
          <button 
            id="clearModerationBtn" 
            onclick="clearModerationData()" 
            style="
              background: #dc3545; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              font-size: 12px; 
              cursor: pointer;
              transition: background-color 0.2s ease;
            "
            onmouseover="this.style.backgroundColor='#c82333'"
            onmouseout="this.style.backgroundColor='#dc3545'"
          >
            Delete All Moderation Data
          </button>
        </div>
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
                  ? `<div style="text-align: center; margin-bottom: 20px;"><a href="/filtered" style="color: #0079d3; text-decoration: none;">View ${hiddenCount} filtered posts</a></div>`
                  : ""
              }
              ${
                readCount > 0 && pageTitle === "Simple Happy Reddit"
                  ? `<div style="text-align: center; margin-bottom: 20px;"><a href="/read" style="color: #0079d3; text-decoration: none;">View ${readCount} read posts</a></div>`
                  : ""
              }
              ${
                pageTitle === "Filtered Posts" || pageTitle === "Read Posts"
                  ? `<div style="text-align: center; margin-bottom: 20px;"><a href="/" style="color: #0079d3; text-decoration: none;">← Back to unread posts</a></div>`
                  : ""
              }
          ${posts
            .map(
              (post) => `
            <div class="post${
              post.selfText ? " self-post" : ""
            }" data-post-id="${post.id}">
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
              ${
                post.categories || post.tags
                  ? `<div class="post-tags-categories">
                      ${
                        post.categories && post.categories.length > 0
                          ? `<div class="categories-container">
                              <span style="font-weight: 500;">Categories:</span>
                              ${post.categories
                                .map(
                                  (category) =>
                                    `<span class="category">${category}</span>`
                                )
                                .join("")}
                            </div>`
                          : ""
                      }
                      ${
                        post.tags && post.tags.length > 0
                          ? `<div class="tags-container">
                              <span style="font-weight: 500;">Tags:</span>
                              ${post.tags
                                .map((tag) => `<span class="tag">${tag}</span>`)
                                .join("")}
                            </div>`
                          : ""
                      }
                    </div>`
                  : ""
              }
              <div class="debug-info">
                <div class="debug-label">Post ID: ${post.id || "N/A"}</div>
                ${
                  post.aiExplanation
                    ? `<div class="debug-label">AI Explanation:</div>
                <div class="debug-content">${post.aiExplanation.replace(
                  /"/g,
                  "&quot;"
                )}</div>`
                    : post.analyzedAt
                    ? '<div class="debug-content">No AI explanation available</div>'
                    : '<div class="debug-content">Not yet analyzed</div>'
                }
              </div>
            </div>
          `
            )
            .join("")}`
        }
      </body>
    </html>
  `;
}
