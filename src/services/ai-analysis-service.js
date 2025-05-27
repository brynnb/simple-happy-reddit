import OpenAI from "openai";
import fetch from "node-fetch";

class AIAnalysisService {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzePost(post) {
    try {
      const categories = this.db.getCategories();
      const tags = this.db.getTags();

      const prompt = this.buildAnalysisPrompt(post, categories, tags);

      const isImagePost = this.isImagePost(post);
      const imageUrl = this.getImageUrl(post);

      let messages;

      if (isImagePost && imageUrl) {
        try {
          const base64Image = await this.downloadAndEncodeImage(imageUrl);
          messages = [
            {
              role: "system",
              content:
                "You are an AI content moderator analyzing Reddit posts including images. Respond only with valid JSON.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: base64Image,
                    detail: "low",
                  },
                },
              ],
            },
          ];
        } catch (imageError) {
          console.warn(
            `Failed to download image for post ${post.id}, analyzing text only:`,
            imageError.message
          );
          messages = [
            {
              role: "system",
              content:
                "You are an AI content moderator analyzing Reddit posts. Respond only with valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ];
        }
      } else {
        messages = [
          {
            role: "system",
            content:
              "You are an AI content moderator analyzing Reddit posts. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ];
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: messages,
        temperature: 0.1,
        max_tokens: 1000,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error(`Error analyzing post ${post.id}:`, error);
      throw error;
    }
  }

  buildAnalysisPrompt(post, categories, tags) {
    const postContent = `
Title: ${post.title}
Subreddit: r/${post.subreddit}
Self Text: ${post.self_text || "N/A"}
    `.trim();

    return `
Analyze this Reddit post and categorize it:

POST CONTENT:
${postContent}

AVAILABLE CATEGORIES: ${categories.join(", ")}
AVAILABLE TAGS: ${tags.join(", ")}

Note: If an image is included with this post, analyze both the text content and the visual content of the image.

SPECIFIC CATEGORIZATION RULES:
- "Mean Stuff": Mean stuff includes content that is mocking, ridiculing, harassing, disparaging, or teasing - unless it's entirely humorous and done playfully and doesn't involve any public or political figures
- "Unpleasant": Unpleasant includes mentions of real humans or real animals having suffered or died. Unpleasant also includes mentions of death, divorce, war, health issues, health conditions, malformations, amputation, loss, sorrow, and grief.
- "Violence": Violence includes criminal justice, prison, policing content, people fighting, people damaging property
- "Politics": Politics includes content about criminal justice/prison/policing. Also includes any mention or reference to any political figure or political event. 

If a post is clearly done in humor, then it may not be appropriate to categorize it as violence or unpleasant. Any political content should be tagged as politicalregardless of humor. 

ONLY CATEGORIZE AND TAG STUFF SPARINGLING AND WHEN YOU'RE VERY CONFIDENT ABOUT IT.

Please respond with ONLY a JSON object in this exact format:
{
  "categories": ["category1", "category2"],
  "tags": ["tag1", "tag2", "tag3"],
  "explanation": "Brief explanation of how the tags and categories are associated to the post's text and/or image"
}

Rules:
1. Only include categories from the available list that apply
2. Only include tags from the available list that apply
3. Keep explanation under 200 characters
4. Categories and tags arrays can be empty if none apply
5. Consider both the posts's title and the image's textual and visual content when analyzing image posts
6. Follow the specific categorization rules above for content classification
    `.trim();
  }

  async processAnalysisQueue(limit = 100) {
    const unanalyzedPosts = this.db.getUnanalyzedPosts(limit);

    if (unanalyzedPosts.length === 0) {
      console.log("No posts to analyze");
      return { processed: 0, errors: 0 };
    }

    console.log(`Analyzing ${unanalyzedPosts.length} posts...`);

    let processed = 0;
    let errors = 0;

    for (const post of unanalyzedPosts) {
      try {
        const analysis = await this.analyzePost(post);

        this.db.saveAnalysisResult(
          post.id,
          false,
          analysis.categories || [],
          analysis.tags || [],
          analysis.explanation || ""
        );

        processed++;
        console.log(
          `Analyzed post ${post.id}: Categories: ${
            analysis.categories?.join(", ") || "none"
          }, Tags: ${analysis.tags?.join(", ") || "none"}`
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to analyze post ${post.id}:`, error);
        errors++;
      }
    }

    console.log(`Analysis complete: ${processed} processed, ${errors} errors`);
    return { processed, errors };
  }

  isImagePost(post) {
    if (post.media_type && post.media_type === "image") {
      return true;
    }

    if (post.url) {
      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const url = post.url.toLowerCase();
      return imageExtensions.some((ext) => url.includes(ext));
    }

    return false;
  }

  getImageUrl(post) {
    if (post.media_data) {
      try {
        const mediaData =
          typeof post.media_data === "string"
            ? JSON.parse(post.media_data)
            : post.media_data;

        if (mediaData.url) {
          return mediaData.url;
        }
      } catch (error) {
        console.warn(`Failed to parse media data for post ${post.id}`);
      }
    }

    if (post.url && this.isImagePost(post)) {
      return post.url;
    }

    return null;
  }

  async downloadAndEncodeImage(imageUrl) {
    try {
      console.log(`Downloading image: ${imageUrl}`);

      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          DNT: "1",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const mimeType = contentType.split(";")[0];

      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error(`Failed to download image ${imageUrl}:`, error.message);
      throw error;
    }
  }
}

export default AIAnalysisService;
