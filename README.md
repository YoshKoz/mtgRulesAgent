# MTG Rules MCP Server

Local RAG MCP server for VS Code built from the Magic: The Gathering Comprehensive Rules DOCX already in this workspace.

## What it does

- Finds the rules DOCX automatically with `glob("**/*.docx")`
- Parses the DOCX into one chunk per rule number, including subrules such as `702.19a`
- Stores embeddings in a persistent local ChromaDB at `./chroma_db/`
- Exposes two FastMCP tools to VS Code:
  - `query_mtg_rules(question: str)`
  - `get_rule_by_number(rule_number: str)`
- Adds a strict `MTGJudge` custom agent that always cites exact rules and never invents them

## Files

- `ingest.py`: DOCX discovery, parsing, chunking, and Chroma indexing
- `server.py`: FastMCP server with query and exact-rule lookup tools
- `.vscode/mcp.json`: VS Code workspace MCP registration
- `.github/agents/MTGJudge.agent.md`: custom judge persona wired to the MCP tools
- `requirements.txt`: Python dependencies

## Setup

Use any Python 3.11+ interpreter on Windows.

```powershell
python -m pip install -r requirements.txt
```

## Build the index

```powershell
python ingest.py
```

Behavior:

- The script auto-discovers the `.docx` file in the workspace.
- If `./chroma_db/` already contains a usable index, it skips re-indexing.
- To rebuild from scratch after updating the DOCX:

```powershell
python ingest.py --force
```

## Run the MCP server

```powershell
python server.py
```

The server also auto-builds the index on first startup if `./chroma_db/` does not exist yet.

## Use it in VS Code

1. Open this workspace in VS Code.
2. Ensure the dependencies are installed into the interpreter that `python` resolves to from VS Code.
3. Open Chat or the MCP server list and trust the `mtg-rules` workspace server from `.vscode/mcp.json`.
4. Use the `MTGJudge` agent or call the two tools directly.

## Tool outputs

`query_mtg_rules` returns the top 5 semantic matches with:

- `rule_number`
- `section_heading`
- `text`
- `score`

`get_rule_by_number` returns the exact indexed rule text for a specific rule number.

## Notes

- Embeddings are generated locally with `sentence-transformers` using `all-MiniLM-L6-v2`.
- On the first run, `sentence-transformers` may download the model weights once; after that, lookups run locally.
- The current implementation indexes the Comprehensive Rules, not Oracle card text or tournament policy documents.
