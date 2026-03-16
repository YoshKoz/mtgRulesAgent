# mtg-rules-agent

First runnable prototype for an MTG Rules Agent chatbox.

## What it is

- A static, dependency-free chat UI
- A local in-browser rules helper for common MTG topics
- An optional API hook for a real MTG rules backend
- Browser-persisted chat history and endpoint selection

## Files

- `index.html` renders the chatbox and layout
- `styles.css` provides the MTG-themed visual design
- `script.js` handles chat state, local answers, and optional API calls

## Run it

Open `index.html` in a browser.

You can either paste an endpoint URL into the built-in connection panel or define `window.MTG_RULES_AGENT_ENDPOINT` before `script.js` runs. The endpoint should accept a JSON `POST` body like this:

```json
{
 "message": "How does priority work after a spell resolves?",
 "conversation": [
  { "role": "assistant", "content": "..." },
  { "role": "user", "content": "..." }
 ]
}
```

And it should return:

```json
{
 "answer": "Priority passes after the spell resolves..."
}
```

## Current limitations

- The local helper is keyword-based, not a full rules engine
- No Oracle card database is included yet
- Tournament policy and judge-level edge cases still need a real backend or rules corpus
- Rule references are curated hints, not an authoritative rules search result

## Next sensible step

Connect the chatbox to a backend that indexes the Comprehensive Rules and Oracle card text.
