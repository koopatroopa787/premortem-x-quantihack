"""
Offline check for the page-discovery filter. Run: python backend/collectors/test_wikipedia.py

Guards the regression where prop=links' ALPHABETICAL ordering was mistaken for
centrality, letting unrelated pages into a signal worth 25% of the composite.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.collectors import wikipedia


def _fake_links(*titles):
    return {"query": {"pages": {"1": {"links": [{"title": t} for t in titles]}}}}


def test_alphabetical_links_are_not_treated_as_related():
    # Exactly what the live API returns for General Mills: alphabetical, and the
    # first entries have nothing to do with the company.
    wikipedia.wiki_request = lambda params: _fake_links(
        "1998 Winter Olympics", "3M", "A. O. Smith", "ADC Telecommunications",
        "Adobe Inc.", "General Mills Foundation", "Cheerios",
    )
    pages = wikipedia.discover_related_pages(
        "General_Mills", "General Mills", ["Cheerios"]
    )
    assert "General_Mills" in pages, pages
    assert "General_Mills_Foundation" in pages, pages
    assert "Cheerios" in pages, pages
    for junk in ("3M", "Adobe_Inc.", "1998_Winter_Olympics", "A._O._Smith"):
        assert junk not in pages, f"{junk} leaked back into the page set: {pages}"


def test_request_failure_still_returns_the_seed_page():
    def boom(params):
        raise RuntimeError("throttled")

    wikipedia.wiki_request = boom
    assert wikipedia.discover_related_pages("Kellanova", "Kellanova", []) == ["Kellanova"]


if __name__ == "__main__":
    test_alphabetical_links_are_not_treated_as_related()
    test_request_failure_still_returns_the_seed_page()
    print("wikipedia page-discovery checks passed")
