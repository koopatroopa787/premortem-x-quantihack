import spacy

# Load lightweight model for keyword extraction
# Need to run: python -m spacy download en_core_web_sm
nlp = spacy.load("en_core_web_sm", disable=["ner", "parser"])

def analyze_sec_8k(document_text):
    """
    NLP pipeline for SEC 8-K supply chain disruption keywords.
    Keywords: 'force majeure', 'shortage', 'material disruption'
    """
    doc = nlp(document_text.lower())
    keywords = ["force majeure", "shortage", "disruption", "delay"]
    count = sum(1 for token in doc if any(k in token.text for k in keywords))
    return min(count / 5.0, 1.0) # Normalized score

if __name__ == "__main__":
    print(analyze_sec_8k("Company reported a force majeure event causing shortage."))
