require('dotenv').config();
const snoowrap = require('snoowrap');
const knowledgeBase = require('./knowledge_base');

// Ensure required environment variables are set
const requiredEnvs = ['REDDIT_USER_AGENT', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD'];
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

// Initialize snoowrap client
const r = new snoowrap({
  userAgent: process.env.REDDIT_USER_AGENT,
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD,
});

// Configure bot
const SUBREDDITS = ['HarmReduction', 'MDMA', 'LSD', 'Drugs', 'aves'];
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set to true to test without posting

async function runBot() {
  console.log(`Starting RaveWellness bot... Dry run: ${DRY_RUN}`);
  const me = await r.getMe();
  const myUsername = me.name;
  console.log(`Logged in as u/${myUsername}`);

  for (const subredditName of SUBREDDITS) {
    try {
      console.log(`Checking r/${subredditName}...`);
      const subreddit = r.getSubreddit(subredditName);
      
      // Fetch new submissions
      const submissions = await subreddit.getNew({ limit: 25 });
      
      for (const submission of submissions) {
        await processSubmission(submission, myUsername);
      }
    } catch (error) {
      console.error(`Error processing r/${subredditName}:`, error.message);
    }
  }
  console.log("Bot finished checking subreddits.");
}

async function processSubmission(submission, myUsername) {
  // Check if we already commented on this post
  // We fetch the comments and see if our username is among the authors
  const comments = await submission.comments.fetchAll();
  const hasCommented = comments.some(c => c.author.name === myUsername);
  
  if (hasCommented) {
    return; // Already replied
  }

  const title = submission.title || "";
  const selftext = submission.selftext || "";
  const fullText = (title + " " + selftext).toLowerCase();

  for (const kb of knowledgeBase) {
    for (const keywordRegex of kb.keywords) {
      if (keywordRegex.test(fullText)) {
        console.log(`Match found in post "${title}" (ID: ${submission.id}) for topic: ${kb.topic}`);
        
        const replyText = `${kb.response}\n\n---\n*I am a bot for [Rave Wellness](https://www.ravewellness.org). We provide evidence-based harm reduction information. If this was helpful, let us know!*`;
        
        if (DRY_RUN) {
          console.log(`[DRY RUN] Would reply:\n${replyText}`);
        } else {
          try {
            await submission.reply(replyText);
            console.log(`Successfully replied to post ${submission.id}`);
          } catch (error) {
            console.error(`Failed to reply to ${submission.id}:`, error.message);
          }
        }
        
        // Return after one match to avoid multiple replies from our bot on the same post
        return;
      }
    }
  }
}

// Run the bot
runBot().catch(console.error);
