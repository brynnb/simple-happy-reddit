# Database Setup Guide

This app uses SQLite with optional Google Cloud Storage backup for persistence across deployments.

## Local Development

The app works out of the box locally - just run:

```bash
npm start
```

A local SQLite database file (`reddit_posts.db`) will be created automatically.

## Production Deployment (Google Cloud)

For production deployment where you want data to persist across deployments:

### 1. Create a Google Cloud Storage Bucket

```bash
# Create a bucket (replace with your preferred name)
gsutil mb gs://simple-happy-reddit-db
```

### 2. Set Environment Variables

Add these to your `.env` file or deployment environment:

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=simple-happy-reddit-db
```

### 3. Authentication

For local development with Cloud Storage:

```bash
gcloud auth application-default login
```

For production deployment, Google Cloud Run automatically provides authentication.

## How It Works

- **Startup**: Downloads the latest database file from Cloud Storage (if it exists)
- **Runtime**: Uses local SQLite for fast read/write operations
- **After writes**: Automatically uploads the updated database back to Cloud Storage
- **Fallback**: If Cloud Storage is unavailable, works as local-only SQLite

## Database Schema

The `posts` table stores:

- `id` - Reddit post ID (primary key)
- `title` - Post title
- `url` - Post URL
- `score` - Upvote score
- `num_comments` - Comment count
- `subreddit` - Subreddit name
- `created_utc` - When post was created
- `is_self` - Whether it's a text post
- `self_text` - Text content (JSON)
- `media_type` - Type of media (image, video, etc.)
- `media_data` - Media metadata (JSON)
- `permalink` - Reddit permalink
- `fetched_at` - When we saved it

## Routes

- `/` - Fresh posts from Reddit (also saves to database)
- `/stored` - View posts from database

## Cost

Using Google Cloud Storage Free Tier:

- **5 GB storage** (way more than needed)
- **5,000 write operations/month** (plenty for this use case)
- **50,000 read operations/month** (more than enough)

This should cost $0 for typical usage.
