import praw
import time
import re
import os
from datetime import datetime

# --- CONFIGURATION ---
# Use environment variables for secrets!
CLIENT_ID = os.getenv('REDDIT_CLIENT_ID')
CLIENT_SECRET = os.getenv('REDDIT_CLIENT_SECRET')
USERNAME = os.getenv('REDDIT_USERNAME')
PASSWORD = os.getenv('REDDIT_PASSWORD')
USER_AGENT = 'LocalConvertBot/0.1 by /u/' + (USERNAME if USERNAME else 'unknown')

# Subreddits to monitor
SUBREDDITS = 'webdev+software+privacy+tech+productivity+editors+photography'

# Keywords and their corresponding Local-Convert routes
KEYWORD_MAPPING = {
    r'convert (heic|heif) to (jpg|png|jpeg)': 'heic-to-jpg',
    r'convert (webp) to (jpg|png|jpeg)': 'webp-to-png',
    r'convert (pdf) to (jpg|png|jpeg)': 'pdf-to-jpg',
    r'convert (mp4) to (mp3|wav)': 'mp4-to-mp3',
    r'convert (mov) to (mp4)': 'mov-to-mp4',
    r'remove metadata from (image|photo)': 'exif-stripper',
    r'shrink (image|png|jpg) size': 'image-compressor',
    r'privacy focused converter': '',
    r'convert files locally': '',
    r'converter no upload': '',
}

BASE_URL = 'https://local-convert.com/convert/'

def main():
    if not all([CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD]):
        print("Error: Reddit credentials not found in environment variables.")
        return

    reddit = praw.Reddit(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        user_agent=USER_AGENT,
        username=USERNAME,
        password=PASSWORD
    )

    print(f"[{datetime.now()}] Bot started. Monitoring: {SUBREDDITS}")

    subreddit = reddit.subreddit(SUBREDDITS)

    # Monitor new comments
    for comment in subreddit.stream.comments(skip_existing=True):
        try:
            body = comment.body.lower()
            author = comment.author.name if comment.author else "[deleted]"

            if author == USERNAME:
                continue

            for pattern, slug in KEYWORD_MAPPING.items():
                if re.search(pattern, body):
                    target_url = BASE_URL + slug if slug else 'https://local-convert.com'
                    
                    print(f"[{datetime.now()}] Match found in r/{comment.subreddit.display_name} by {author}")
                    print(f"Query: {body[:50]}...")
                    
                    # Construct a helpful, non-spammy reply
                    reply_text = (
                        f"Hey! If you're looking to do this privacy-first, I built a tool called "
                        f"[Local-Convert]({target_url}) that does this 100% in your browser. "
                        f"Nothing gets uploaded to a server, so it's super fast and safe for sensitive files. "
                        f"Hope it helps!"
                    )
                    
                    # In a real MVP, you might want to manually approve or use a 'dry run' mode first.
                    # comment.reply(reply_text)
                    print(f"Action: Would reply with link to {target_url}")
                    print("-" * 30)
                    break # Only reply once per comment

        except Exception as e:
            print(f"Error processing comment: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main()
