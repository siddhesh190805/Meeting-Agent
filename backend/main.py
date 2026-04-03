from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from graph import app_graph
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import logging
import time
from datetime import datetime
import json
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="Meeting Agenda and Summary Agent API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranscriptRequest(BaseModel):
    transcript: str
    agenda: str = None  # Optional: User can provide their own agenda
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "transcript": "John: Hi everyone, welcome to our meeting...",
                "agenda": "1. Project update\n2. Budget discussion\n3. Next steps"
            }
        }
    )

@app.post("/generate")
async def generate_response(request: TranscriptRequest):
    request_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    logger.info(f"[Request {request_id}] Received generate request")
    logger.info(f"[Request {request_id}] Request body: {request}")
    logger.info(f"[Request {request_id}] Transcript length: {len(request.transcript)} characters")
    logger.info(f"[Request {request_id}] Agenda provided: {request.agenda is not None}")
    logger.info(f"[Request {request_id}] Transcript preview: {request.transcript[:200]}...")
    
    start_time = time.time()
    
    try:
        # Run LangGraph workflow
        logger.info(f"[Request {request_id}] Starting LangGraph workflow...")
        initial_state = {"transcript": request.transcript}
        
        # Send initial status
        # Note: SSE doesn't support two-way communication like WebSockets
        # Clients will poll the /stream endpoint for updates
        pass
        
        # If user provided their own agenda, skip agenda extraction
        if request.agenda and request.agenda.strip():
            logger.info(f"[Request {request_id}] Using user-provided agenda: {len(request.agenda)} characters")
            initial_state["agenda"] = request.agenda
            
            # Run workflow without agenda extraction
            result = await app_graph.ainvoke(initial_state)
            # Replace extracted agenda with user's agenda
            result["agenda"] = request.agenda
        else:
            # Run full workflow including agenda extraction
            result = await app_graph.ainvoke(initial_state)
        
        processing_time = time.time() - start_time
        logger.info(f"[Request {request_id}] Workflow completed in {processing_time:.2f} seconds")
        
        # Log extracted information
        logger.info(f"[Request {request_id}] Extracted {len(result.get('participants', []))} participants: {result.get('participants', [])}")
        logger.info(f"[Request {request_id}] Meeting date: {result.get('meeting_date', 'Not found')}")
        logger.info(f"[Request {request_id}] Extracted {len(result.get('action_items', []))} action items")
        logger.info(f"[Request {request_id}] Extracted {len(result.get('decisions', []))} decisions")
        logger.info(f"[Request {request_id}] Agenda length: {len(result.get('agenda', ''))} characters")
        logger.info(f"[Request {request_id}] Summary length: {len(result.get('summary', ''))} characters")
        
        # Send completion status
        # Note: SSE doesn't support two-way communication
        pass
        
        logger.info(f"[Request {request_id}] Successfully returning response")
        
        return {
            "agenda": result["agenda"],
            "summary": result["summary"],
            "action_items": result["action_items"],
            "decisions": result["decisions"],
            "participants": result["participants"],
            "meeting_date": result["meeting_date"]
        }
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"[Request {request_id}] Error after {processing_time:.2f} seconds: {str(e)}")
        logger.error(f"[Request {request_id}] Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"[Request {request_id}] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream")
async def stream_updates():
    """Server-Sent Events endpoint for real-time updates"""
    async def event_generator():
        while True:
            # Send a ping every 30 seconds to keep connection alive
            yield f"data: {json.dumps({'type': 'ping', 'timestamp': time.time()})}\n\n"
            await asyncio.sleep(30)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.get("/health")
def health_check():
    logger.info("Health check requested - API is healthy")
    return {"status": "ok"}

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("MeetAgent AI Backend Server Starting...")
    logger.info(f"API Documentation: http://127.0.0.1:8001/docs")
    logger.info(f"Health Check: http://127.0.0.1:8001/health")
    logger.info(f"Real-time Updates: http://127.0.0.1:8001/stream")
    logger.info("=" * 60)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
