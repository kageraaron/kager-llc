# Local-Convert Growth Scripts

This directory contains scripts to drive organic traffic and monitor brand mentions.

## 🤖 Reddit Bot (`reddit_bot.py`)

An MVP crawler that monitors subreddits for high-intent keywords (e.g., "convert heic to jpg", "pdf converter no upload") and suggests Local-Convert as a privacy-first solution.

### Prerequisites

- Python 3.8+
- `praw` library: `pip install praw`

### Configuration

The bot requires Reddit API credentials. Create a "script" application at [https://www.reddit.com/prefs/apps/](https://www.reddit.com/prefs/apps/) and set the following environment variables:

```bash
export REDDIT_CLIENT_ID='your_client_id'
export REDDIT_CLIENT_SECRET='your_client_secret'
export REDDIT_USERNAME='your_reddit_username'
export REDDIT_PASSWORD='your_reddit_password'
```

### Usage

```bash
python reddit_bot.py
```

**Note:** The bot is currently in "dry run" mode (it prints what it would do but doesn't post replies). To enable actual replies, uncomment the `comment.reply(reply_text)` line in the script.

### Strategy

- **Targeting:** Monitors subreddits like `r/webdev`, `r/privacy`, `r/photography`, and `r/tech`.
- **Transparency:** Clearly states that the tool is local-first and browser-based to avoid being flagged as spam.
- **Utility:** Provides direct links to specific conversion tools (e.g., `/convert/heic-to-jpg`) based on the user's query.
