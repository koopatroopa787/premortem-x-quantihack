import praw
import os

def fetch_reddit_mentions(keywords):
    """
    Search Reddit for brand-specific supply chain complaints.
    Ref: https://www.reddit.com/prefs/apps
    """
    REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
    REDDIT_SECRET = os.getenv("REDDIT_SECRET")
    
    if not REDDIT_CLIENT_ID:
        return 0
        
    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_SECRET,
        user_agent="PreMortemMachine/0.1"
    )
    
    query = " OR ".join([f'"{k}" "out of stock"' for k in keywords])
    mentions = 0
    # Search across key subs like r/supplychain, r/groceries, r/Shortages
    for submission in reddit.subreddit("all").search(query, limit=100, time_filter="week"):
        mentions += 1
    return mentions

if __name__ == "__main__":
    print(fetch_reddit_mentions(["Unilever", "Dove"]))
