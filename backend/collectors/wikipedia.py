import requests

def get_wiki_edit_velocity(page_title):
    """
    Get edit/revert frequency for a brand's Wikipedia page.
    Ref: https://www.mediawiki.org/wiki/API:Main_page
    """
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=revisions&titles={page_title}&rvlimit=50&format=json"
    try:
        response = requests.get(url)
        data = response.json()
        pages = data.get('query', {}).get('pages', {})
        for page_id in pages:
            revisions = pages[page_id].get('revisions', [])
            return calculate_revert_rate(revisions)
        return 0.0
    except Exception as e:
        print(f"Error fetching Wiki data for {page_title}: {e}")
        return 0.0

def calculate_revert_rate(revisions):
    """
    Logic to identify 'reverts' in revision comments.
    Keywords: 'revert', 'undid', 'rvv'
    """
    revert_count = sum(1 for rv in revisions if 'revert' in rv.get('comment', '').lower())
    return revert_count / 50.0  # Normalized

if __name__ == "__main__":
    print(get_wiki_edit_velocity("Unilever"))
