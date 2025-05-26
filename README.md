# Simple Happy Reddit

![Screenshot](screenshot.png)

A curated Reddit reader that fetches posts from r/all, filters out unwanted content, and provides AI-powered analysis. Features include keyword/subreddit blocking, read/unread tracking, and OpenAI integration for content analysis and moderation.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables Setup

Create a `.env` file in the root directory:

```
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Local Development

```bash
# Start development server with hot reload
npm run dev

# The server will run on http://localhost:8080
```

### 4. Google Cloud Setup

#### Prerequisites

- Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
- Have a Google Cloud project created

#### Setup Commands

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### 5. Deploy to Google Cloud Run

```bash
# Deploy with single command
npm run deploy
```

### 6. Set Environment Variables in Google Cloud

```bash
# Set environment variables in Cloud Run
gcloud run services update simple-happy-reddit \
  --set-env-vars="OPENAI_API_KEY=your_actual_key_here" \
  --region=us-central1
```

## Project Structure

```
├── src/
│   └── index.js          # Main Express server
├── public/               # Static files
├── package.json          # Dependencies and scripts
├── Dockerfile           # Container configuration
├── .gcloudignore        # Files ignored by Google Cloud Build
├── .gitignore           # Files ignored by Git
└── README.md            # This file
```

## Key Features

- Uses ES modules (`"type": "module"`)
- Deploys to Google Cloud Run with single command
- Includes OpenAI integration ready
- Static file serving from `public/` directory
- Environment variable support
- Nodemon for local development

## TODO

- [ ] Post top comments inline
- [ ] Provide AI summary of top comments
- [ ] Implement OpenAI's free moderation API endpoint as an extra free layer of filtering
- [ ] Provide AI summary of websites that are linked to as the content of a Reddit post
- [ ] Provide AI fact checking of post titles and content and articles

## Deployment Flow

1. `npm run deploy` builds Docker image and pushes to Google Container Registry
2. Deploys to Cloud Run with public access
3. Automatically scales based on traffic
4. Zero-downtime deployments

The deploy script handles everything: building the container, pushing to registry, and deploying to Cloud Run in one command.
