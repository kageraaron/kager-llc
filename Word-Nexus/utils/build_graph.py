import gzip
import json
import os
import urllib.request
import re

# --- Configuration ---
RAW_FILE = "conceptnet-assertions-5.7.0.csv.gz"
OUTPUT_FILE = "semantic_graph_expanded.json"
MIN_WEIGHT = 1.5  

def load_vocabulary():
    """Combines various word lists to create an expanded vocabulary."""
    vocab = set()
    
    # 1. Existing Noun List
    noun_file = "nounlist.txt"
    if os.path.exists(noun_file):
        with open(noun_file, 'r', encoding='utf-8') as f:
            vocab.update({line.strip().lower() for line in f if line.strip()})
    
    # 2. Top 10,000 English words (includes verbs, adjectives, etc.)
    google_10k_url = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
    google_10k_file = "google-10k.txt"
    
    if not os.path.exists(google_10k_file):
        print(f"Downloading expanded vocabulary from {google_10k_url}...")
        try:
            req = urllib.request.Request(google_10k_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(google_10k_file, 'wb') as out_file:
                out_file.write(response.read())
        except Exception as e:
            print(f"Warning: Could not download Google 10k list: {e}")
    
    if os.path.exists(google_10k_file):
        with open(google_10k_file, 'r', encoding='utf-8') as f:
            vocab.update({line.strip().lower() for line in f if line.strip()})

    # Filter: 3+ letters, only a-z
    cleaned_vocab = {w for w in vocab if len(w) >= 3 and w.isalpha()}
    
    print(f"Total vocabulary size: {len(cleaned_vocab)} words.")
    return cleaned_vocab

def extract_word(concept_uri: str) -> str:
    """Extracts the base word from a ConceptNet URI (e.g., /c/en/dog/n/ -> dog)"""
    parts = concept_uri.split('/')
    if len(parts) >= 4 and parts[2] == 'en':
        # ConceptNet URIs sometimes have underscores for spaces, replace them
        return parts[3].replace('_', ' ')
    return ""

def build_graph():
    TARGET_VOCAB = load_vocabulary()
    
    print(f"Parsing {RAW_FILE}... This may take a few minutes.")
    
    graph = {word: {} for word in TARGET_VOCAB}
    edges_added = 0
    
    # Stream the compressed file
    try:
        with gzip.open(RAW_FILE, 'rt', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i % 1000000 == 0 and i > 0:
                    print(f"  Processed {i} lines...")
                    
                parts = line.split('\t')
                if len(parts) < 5:
                    continue
                    
                start_uri = parts[2]
                end_uri = parts[3]
                
                # Fast filter
                if not (start_uri.startswith('/c/en/') and end_uri.startswith('/c/en/')):
                    continue
                    
                start_word = extract_word(start_uri)
                end_word = extract_word(end_uri)
                
                if start_word in TARGET_VOCAB and end_word in TARGET_VOCAB and start_word != end_word:
                    try:
                        metadata = json.loads(parts[4])
                        weight = float(metadata.get("weight", 0.0))
                        
                        if weight >= MIN_WEIGHT:
                            # Bidirectional
                            if end_word not in graph[start_word] or weight > graph[start_word][end_word]:
                                graph[start_word][end_word] = weight
                            if start_word not in graph[end_word] or weight > graph[end_word][start_word]:
                                graph[end_word][start_word] = weight
                            edges_added += 1
                    except:
                        continue
    except FileNotFoundError:
        print(f"Error: {RAW_FILE} not found.")
        return

    print(f"Extracted {edges_added} relationships.")
    
    # Clean up words with no connections
    cleaned_graph = {k: v for k, v in graph.items() if v}
    print(f"Kept {len(cleaned_graph)} words with valid connections.")
    
    print(f"Saving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out_f:
        json.dump(cleaned_graph, out_f, indent=2)
    print("Done!")

if __name__ == "__main__":
    build_graph()
