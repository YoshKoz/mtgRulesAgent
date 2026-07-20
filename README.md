# MTG Rules Agent

A local RAG (retrieval-augmented generation) MCP server that answers Magic: The Gathering rules questions by semantically searching the official Comprehensive Rules — with exact rule-number citations, no hallucinated rulings.

## Why

LLMs are unreliable Magic judges on their own: they'll confidently cite rules that don't exist. This project grounds every answer in the actual Comprehensive Rules text, indexed locally, and exposes it as MCP tools so an agent has to retrieve a real rule before it's allowed to answer.

## How it works

- `ingest.py` finds a Comprehensive Rules `.docx` in the project, parses it into one chunk per rule number (including subrules like `702.19a`), embeds each chunk locally with `sentence-transformers` (`all-MiniLM-L6-v2`), and stores them in a persistent local ChromaDB collection.
- `server.py` exposes that index as two [FastMCP](https://github.com/jlowin/fastmcp) tools:
  - `query_mtg_rules(question)` — semantic top-5 search over the indexed rules
  - `get_rule_by_number(rule_number)` — exact lookup for a specific rule, e.g. `117.3` or `702.19a`
- `.github/agents/MTGJudge.agent.md` defines a strict "Level 3 judge" agent persona that is required to call both tools and cite exact rule numbers before answering — it's not allowed to invent rulings.
- `index.html` / `script.js` / `styles.css` are a standalone browser chatbox UI. It ships with a small hardcoded local knowledge base as a fallback and can optionally POST to an external endpoint (`window.MTG_RULES_AGENT_ENDPOINT`) — it is **not** wired to the MCP server out of the box; that integration is left as an exercise (e.g. a small HTTP shim in front of `query_mtg_rules`).

## Tech stack

Python, [ChromaDB](https://www.trychroma.com/) (local persistent vector store), [FastMCP](https://github.com/jlowin/fastmcp), `sentence-transformers`, `python-docx`.

## Setup

Requires Python 3.11+.

```bash
pip install -r requirements.txt
```

You'll need your own copy of the Magic: The Gathering **Comprehensive Rules** as a `.docx` file, placed anywhere in the project root — it's gitignored here since it's Wizards of the Coast's document, not this repo's to redistribute. Get the current version from the [official rules page](https://magic.wizards.com/en/rules).

## Build the index

```bash
python ingest.py
```

- Auto-discovers the `.docx` in the workspace.
- Skips re-indexing if `./chroma_db/` already has a usable index.
- Force a full rebuild after updating the rules document:

```bash
python ingest.py --force
```

## Run the MCP server

```bash
python server.py
```

Auto-builds the index on first startup if `./chroma_db/` doesn't exist yet.

## Use it as an MCP server

Register `server.py` as an MCP server with any MCP-compatible client (VS Code, Claude Desktop/Code, etc.) — for example in VS Code, add it under `.vscode/mcp.json` (gitignored, workspace-specific) and trust the server. Then either talk to it through the bundled `MTGJudge` agent definition or call `query_mtg_rules` / `get_rule_by_number` directly.

### Example

```
query_mtg_rules("How does priority work after a spell resolves?")
```

```json
{
  "question": "How does priority work after a spell resolves?",
  "matches": [
    {
      "rule_number": "117.3",
      "section_heading": "Priority",
      "text": "...",
      "score": 0.83
    }
  ]
}
```

## Notes

- Everything runs locally — embeddings and vector search happen on-device; only the model weights are fetched once on first run.
- The index covers the Comprehensive Rules only, not Oracle card text or tournament policy documents.
- The browser chatbox prototype is a separate UI experiment, not a required part of the MCP workflow.
