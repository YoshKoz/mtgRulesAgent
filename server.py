from __future__ import annotations

from functools import lru_cache
from typing import Any, TYPE_CHECKING

import chromadb
from fastmcp import FastMCP

from ingest import (
    CHROMA_DIR,
    COLLECTION_NAME,
    EMBEDDING_MODEL_NAME,
    ensure_index,
    normalize_rule_number,
)

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer


mcp = FastMCP("MTG Comprehensive Rules")


@lru_cache(maxsize=1)
def get_collection():
    ensure_index(verbose=False)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_collection(COLLECTION_NAME)


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL_NAME)


def _collection_count() -> int:
    return get_collection().count()


@mcp.tool()
def query_mtg_rules(question: str) -> dict[str, Any]:
    """Search the MTG Comprehensive Rules and return the top five matching rule chunks."""
    if not question.strip():
        raise ValueError("Question must not be empty.")

    collection = get_collection()
    total_rules = _collection_count()
    if total_rules == 0:
        raise RuntimeError("The MTG rules index is empty. Run ingest.py first.")

    embedding_model = get_embedding_model()
    query_embedding = embedding_model.encode(
        [question],
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )[0]
    result = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=min(5, total_rules),
        include=["documents", "metadatas", "distances"],
    )

    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    matches = []
    for document, metadata, distance in zip(documents, metadatas, distances):
        matches.append(
            {
                "rule_number": metadata["rule_number"],
                "section_heading": metadata.get("section_heading", ""),
                "text": document,
                "score": round(1.0 - float(distance), 4),
            }
        )

    return {"question": question, "matches": matches}


@mcp.tool()
def get_rule_by_number(rule_number: str) -> dict[str, Any]:
    """Return the exact text for a single MTG rule number such as 117.3b or 704.5."""
    canonical_rule_number = normalize_rule_number(rule_number)
    result = get_collection().get(
        ids=[canonical_rule_number],
        include=["documents", "metadatas"],
    )

    if not result.get("ids"):
        return {
            "found": False,
            "rule_number": canonical_rule_number,
            "message": f"No exact rule found for {canonical_rule_number}.",
        }

    metadata = result["metadatas"][0]
    document = result["documents"][0]
    return {
        "found": True,
        "rule_number": metadata["rule_number"],
        "section_heading": metadata.get("section_heading", ""),
        "text": document,
    }


def main() -> None:
    ensure_index(verbose=False)
    mcp.run()


if __name__ == "__main__":
    main()
