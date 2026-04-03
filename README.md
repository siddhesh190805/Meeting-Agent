# Meeting-Agent

An AI-powered meeting assistant that analyzes meeting transcripts and automatically extracts structured insights — including participants, agenda, action items, decisions, and a comprehensive summary.

## Features

- **Participant Extraction** – Identifies all attendees mentioned in the transcript
- **Agenda Generation** – Builds a structured agenda from the discussion
- **Action Item Tracking** – Extracts tasks with owners, deadlines, and priorities
- **Decision Logging** – Captures key decisions made during the meeting
- **Meeting Summary** – Produces a professional executive-style summary
- **Custom Agenda Support** – Optionally provide your own agenda to skip AI extraction
- **Dark / Light Theme** – Persisted theme preference in the browser
- **Real-time Status** – Server-Sent Events keep the UI updated while the AI processes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Backend | FastAPI + Uvicorn |
| AI Orchestration | LangGraph + LangChain |
| LLM | `meta-llama/llama-3.1-8b-instruct` via [OpenRouter](https://openrouter.ai) |

## Project Structure

```
Meeting-Agent/
├── backend/
│   ├── main.py          # FastAPI app, REST endpoints, SSE stream
│   ├── graph.py         # LangGraph workflow (nodes & edges)
│   ├── requirements.txt # Python dependencies
│   └── .env             # Environment variables (not committed)
└── frontend/
    ├── src/
    │   ├── App.jsx      # Main React component
    │   └── index.css    # Global styles
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Prerequisites

- Python 3.9+
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/siddhesh190805/Meeting-Agent.git
cd Meeting-Agent
```

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file inside the `backend/` directory:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Start the backend server:

```bash
python main.py
```

The API will be available at `http://127.0.0.1:8001`.  
Interactive docs: `http://127.0.0.1:8001/docs`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## API Reference

### `POST /generate`

Processes a meeting transcript and returns structured insights.

**Request body:**

```json
{
  "transcript": "John: Hi everyone, welcome to our meeting...",
  "agenda": "1. Project update\n2. Budget discussion"  // optional
}
```

**Response:**

```json
{
  "agenda": "...",
  "summary": "...",
  "action_items": ["..."],
  "decisions": ["..."],
  "participants": ["John", "Mary"],
  "meeting_date": "March 15, 2024"
}
```

### `GET /health`

Returns `{ "status": "ok" }` when the server is running.

### `GET /stream`

Server-Sent Events endpoint that sends a keep-alive ping every 30 seconds.

## How It Works

The backend runs a **LangGraph** state-machine workflow with the following sequential nodes:

```
extract_participants → extract_meeting_date → extract_agenda
    → extract_action_items → extract_decisions → summarize_meeting
```

Each node calls the LLM with a structured prompt and parses the result. If JSON parsing fails, a regex-based fallback ensures the pipeline keeps running.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for OpenRouter (required) |

## License

This project is open source. Feel free to fork and adapt it for your own use.
