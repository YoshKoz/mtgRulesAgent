from __future__ import annotations

import argparse
import shutil
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable, TYPE_CHECKING

import chromadb
from docx import Document

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer


WORKSPACE_ROOT = Path(__file__).resolve().parent
CHROMA_DIR = WORKSPACE_ROOT / "chroma_db"
COLLECTION_NAME = "mtg_comprehensive_rules"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
IGNORED_PATH_PARTS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "chroma_db",
    "__pycache__",
}

SECTION_PATTERN = re.compile(r"^(?P<section_number>\d{3})\.\s+(?P<section_heading>.+)$")
RULE_PATTERN = re.compile(
    r"^(?P<rule_number>\d{3}\.\d+[a-z]?)(?:\.)?\s+(?P<text>.+)$",
    re.IGNORECASE,
)
RULE_LOOKUP_PATTERN = re.compile(r"(?P<rule_number>\d{3}\.\d+[a-z]?)(?:\.)?", re.IGNORECASE)


@dataclass
class RuleChunk:
    rule_number: str
    section_heading: str
    text: str


def normalize_rule_number(raw_value: str) -> str:
    match = RULE_LOOKUP_PATTERN.search(raw_value.strip())
    if match is None:
        raise ValueError(
            "Rule numbers must look like 117.3, 702.19a, or 704.5m."
        )
    return match.group("rule_number").lower()


def is_ignored_path(path: Path) -> bool:
    return any(part in IGNORED_PATH_PARTS for part in path.parts)


def find_rules_docx(workspace_root: Path = WORKSPACE_ROOT) -> Path:
    candidates = [
        path
        for path in workspace_root.glob("**/*.docx")
        if path.is_file() and not is_ignored_path(path.relative_to(workspace_root))
    ]
    if not candidates:
        raise FileNotFoundError(
            f"No .docx files were found under {workspace_root}."
        )

    candidates.sort(key=lambda path: (-path.stat().st_size, str(path).lower()))
    return candidates[0]


def load_docx_paragraphs(docx_path: Path) -> list[str]:
    document = Document(docx_path)
    return [
        paragraph.text.strip()
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    ]


def parse_rule_chunks(paragraphs: list[str]) -> list[RuleChunk]:
    if "Credits" in paragraphs:
        paragraphs = paragraphs[paragraphs.index("Credits") + 1 :]

    chunks: list[RuleChunk] = []
    current_section_heading = ""
    current_chunk: RuleChunk | None = None

    for paragraph in paragraphs:
        if paragraph == "Glossary":
            break

        section_match = SECTION_PATTERN.match(paragraph)
        if section_match is not None:
            current_section_heading = section_match.group("section_heading").strip()
            continue

        rule_match = RULE_PATTERN.match(paragraph)
        if rule_match is not None:
            if current_chunk is not None:
                chunks.append(current_chunk)

            current_chunk = RuleChunk(
                rule_number=normalize_rule_number(rule_match.group("rule_number")),
                section_heading=current_section_heading,
                text=rule_match.group("text").strip(),
            )
            continue

        if current_chunk is not None:
            current_chunk.text = f"{current_chunk.text}\n{paragraph}"

    if current_chunk is not None:
        chunks.append(current_chunk)

    if not chunks:
        raise ValueError("No MTG rules were parsed from the DOCX file.")

    return chunks


def batched(values: list[RuleChunk], batch_size: int) -> Iterable[list[RuleChunk]]:
    for index in range(0, len(values), batch_size):
        yield values[index : index + batch_size]


def get_chroma_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def get_or_create_collection(
    client: chromadb.PersistentClient | None = None,
):
    chroma_client = client or get_chroma_client()
    return chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def existing_index_count() -> int:
    if not CHROMA_DIR.exists() or not any(CHROMA_DIR.iterdir()):
        return 0

    try:
        return get_or_create_collection().count()
    except Exception:
        return 0


def build_index(verbose: bool = True) -> dict[str, object]:
    from sentence_transformers import SentenceTransformer

    docx_path = find_rules_docx()
    paragraphs = load_docx_paragraphs(docx_path)
    chunks = parse_rule_chunks(paragraphs)

    model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    embedding_inputs = [
        f"{chunk.rule_number} {chunk.section_heading}\n{chunk.text}" for chunk in chunks
    ]
    embeddings = model.encode(
        embedding_inputs,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=verbose,
    )

    client = get_chroma_client()
    collection = get_or_create_collection(client)

    batch_size = 256
    for batch_index, chunk_batch in enumerate(
        batched(chunks, batch_size=batch_size),
        start=1,
    ):
        batch_start = (batch_index - 1) * batch_size
        batch_end = batch_start + len(chunk_batch)
        batch_embeddings = embeddings[batch_start:batch_end]
        collection.add(
            ids=[chunk.rule_number for chunk in chunk_batch],
            documents=[chunk.text for chunk in chunk_batch],
            metadatas=[
                {
                    "rule_number": chunk.rule_number,
                    "section_heading": chunk.section_heading,
                    "source_docx": docx_path.name,
                }
                for chunk in chunk_batch
            ],
            embeddings=batch_embeddings.tolist(),
        )

    return {
        "docx_path": docx_path,
        "chunk_count": len(chunks),
        "collection_count": collection.count(),
    }


def ensure_index(force_reindex: bool = False, verbose: bool = False) -> dict[str, object]:
    if force_reindex and CHROMA_DIR.exists():
        shutil.rmtree(CHROMA_DIR)

    if not force_reindex:
        indexed_count = existing_index_count()
        if indexed_count > 0:
            return {
                "status": "skipped",
                "docx_path": find_rules_docx(),
                "chunk_count": indexed_count,
                "collection_count": indexed_count,
            }

    result = build_index(verbose=verbose)
    result["status"] = "indexed"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the local ChromaDB index for the MTG Comprehensive Rules."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete any existing ./chroma_db/ folder and rebuild the index.",
    )
    args = parser.parse_args()

    result = ensure_index(force_reindex=args.force, verbose=True)
    print(f"Status: {result['status']}")
    print(f"DOCX: {result['docx_path']}")
    print(f"Chunks: {result['chunk_count']}")
    print(f"Collection count: {result['collection_count']}")


if __name__ == "__main__":
    main()
