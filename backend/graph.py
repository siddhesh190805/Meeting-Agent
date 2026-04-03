from typing import TypedDict, List
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv
import os
import json
import re
import logging
import time

# Configure logging for graph module
logger = logging.getLogger(__name__)

load_dotenv()

# Initialize OpenRouter client
llm = ChatOpenAI(
    model="meta-llama/llama-3.1-8b-instruct",
    openai_api_key=os.getenv("OPENROUTER_API_KEY"),
    openai_api_base="https://openrouter.ai/api/v1",
    temperature=0.7,
    max_tokens=2000
)

# Define state schema
class MeetingState(TypedDict):
    transcript: str
    agenda: str
    summary: str
    action_items: List[str]
    decisions: List[str]
    participants: List[str]
    meeting_date: str

# Nodes
def extract_participants(state: MeetingState):
    """Extract meeting participants from transcript"""
    logger.info("[NODE] Starting extract_participants...")
    start_time = time.time()
    
    prompt = f"""Extract all participant names from the following meeting transcript. 
    Return ONLY a JSON array of strings. Example format: ["John Doe", "Jane Smith"]
    If no clear names are found, return: []
    
    Transcript:
    {state['transcript']}
    
    Response:"""
    
    logger.info("[NODE] Calling LLM for participant extraction...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Extract participant names accurately."),
        HumanMessage(content=prompt)
    ])
    
    logger.info(f"[NODE] LLM response received: {len(response.content)} characters")
    
    try:
        # Clean up the response to ensure it's valid JSON
        response_content = response.content.strip()
        if response_content.startswith('```json'):
            response_content = response_content.replace('```json', '').replace('```', '').strip()
        elif response_content.startswith('```'):
            response_content = response_content.replace('```', '').strip()
        
        # Try to extract JSON from the response
        import re
        json_match = re.search(r'\[.*?\]', response_content, re.DOTALL)
        if json_match:
            response_content = json_match.group(0)
        
        participants = json.loads(response_content)
        if not isinstance(participants, list):
            participants = []
        logger.info(f"[NODE] Successfully parsed {len(participants)} participants from JSON")
    except json.JSONDecodeError as e:
        logger.warning(f"[NODE] JSON parsing failed: {e}. Using regex fallback...")
        # Fallback: extract names using regex patterns
        lines = state['transcript'].split('\n')
        participants = []
        for line in lines:
            match = re.match(r'^([A-Za-z\s]+):', line.strip())
            if match:
                name = match.group(1).strip()
                if name not in participants:
                    participants.append(name)
        logger.info(f"[NODE] Fallback extracted {len(participants)} participants using regex")
    
    # Convert any objects to strings
    participants = [str(p) if isinstance(p, dict) else p for p in participants]
    participants = [p for p in participants if p and p != 'None']
    
    elapsed = time.time() - start_time
    logger.info(f"[NODE] extract_participants completed in {elapsed:.2f}s - Found: {participants}")
    
    return {"participants": participants}

def extract_meeting_date(state: MeetingState):
    """Extract or infer meeting date from transcript"""
    logger.info("[NODE] Starting extract_meeting_date...")
    start_time = time.time()
    
    transcript = state['transcript'].lower()
    
    prompt = f"""Extract the meeting date from the following transcript. 
    If no specific date is mentioned, return "Not specified".
    
    Transcript:
    {state['transcript']}"""
    
    logger.info("[NODE] Calling LLM for date extraction...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Extract dates accurately."),
        HumanMessage(content=prompt)
    ])
    
    meeting_date = response.content.strip()
    elapsed = time.time() - start_time
    logger.info(f"[NODE] extract_meeting_date completed in {elapsed:.2f}s - Found: {meeting_date}")
    
    return {"meeting_date": meeting_date}

def extract_agenda(state: MeetingState):
    """Extract structured meeting agenda"""
    logger.info("[NODE] Starting extract_agenda...")
    start_time = time.time()
    
    prompt = f"""Extract a comprehensive meeting agenda from the following transcript. 
    Format the agenda with clear sections and subsections using markdown formatting:
    
    # MEETING AGENDA
    
    ## 1. Meeting Purpose
    [Brief description of why the meeting was called]
    
    ## 2. Main Discussion Topics
    - [Topic 1]: [Brief description]
    - [Topic 2]: [Brief description]
    - [Topic 3]: [Brief description]
    
    ## 3. Time Allocations (if mentioned)
    - [Topic]: [Time allocated]
    
    ## 4. Expected Outcomes
    - [Outcome 1]
    - [Outcome 2]
    
    Transcript:
    {state['transcript']}
    
    Response:"""
    
    logger.info("[NODE] Calling LLM for agenda extraction...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Create well-structured, actionable meeting agendas."),
        HumanMessage(content=prompt)
    ])
    
    agenda = response.content
    elapsed = time.time() - start_time
    logger.info(f"[NODE] extract_agenda completed in {elapsed:.2f}s - Generated {len(agenda)} characters")
    
    return {"agenda": agenda}

def extract_action_items(state: MeetingState):
    """Extract action items and tasks from the meeting"""
    logger.info("[NODE] Starting extract_action_items...")
    start_time = time.time()
    
    prompt = f"""Extract all action items, tasks, and follow-up items from the following meeting transcript.
    Format as a structured list with sections using markdown:
    
    # ACTION ITEMS
    
    ## High Priority Tasks
    1. **[Task]** - Assigned to: [Person] - Deadline: [Date]
    
    ## Medium Priority Tasks
    1. **[Task]** - Assigned to: [Person] - Deadline: [Date]
    
    ## Follow-up Items
    1. **[Item]** - Responsible: [Person] - Timeline: [Timeline]
    
    Return ONLY a JSON array of strings, where each string is a complete action item with details.
    
    Transcript:
    {state['transcript']}
    
    Response:"""
    
    logger.info("[NODE] Calling LLM for action items extraction...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Identify concrete action items and responsibilities."),
        HumanMessage(content=prompt)
    ])
    
    logger.info(f"[NODE] LLM response received: {len(response.content)} characters")
    
    try:
        # Clean up the response to ensure it's valid JSON
        response_content = response.content.strip()
        if response_content.startswith('```json'):
            response_content = response_content.replace('```json', '').replace('```', '').strip()
        elif response_content.startswith('```'):
            response_content = response_content.replace('```', '').strip()
        
        # Try to extract JSON from the response
        json_match = re.search(r'\[.*?\]', response_content, re.DOTALL)
        if json_match:
            response_content = json_match.group(0)
        
        action_items = json.loads(response_content)
        if not isinstance(action_items, list):
            action_items = []
        logger.info(f"[NODE] Successfully parsed {len(action_items)} action items from JSON")
    except json.JSONDecodeError as e:
        logger.warning(f"[NODE] JSON parsing failed: {e}. Using keyword fallback...")
        # Fallback: extract lines with action keywords
        action_keywords = ['action', 'task', 'follow up', 'will', 'need to', 'should', 'responsible', 'deadline']
        lines = state['transcript'].split('\n')
        action_items = []
        for line in lines:
            if any(keyword in line.lower() for keyword in action_keywords):
                action_items.append(line.strip())
        logger.info(f"[NODE] Fallback extracted {len(action_items)} action items using keywords")
    
    # Convert any objects to strings
    action_items = [str(item) if isinstance(item, dict) else item for item in action_items]
    action_items = [item for item in action_items if item and item != 'None']
    
    elapsed = time.time() - start_time
    logger.info(f"[NODE] extract_action_items completed in {elapsed:.2f}s - Found {len(action_items)} items")
    
    return {"action_items": action_items}

def extract_decisions(state: MeetingState):
    """Extract decisions made during the meeting"""
    logger.info("[NODE] Starting extract_decisions...")
    start_time = time.time()
    
    prompt = f"""Extract all decisions made during the meeting from the following transcript.
    Format decisions with clear sections and details using markdown:
    
    # DECISIONS MADE
    
    ## Strategic Decisions
    1. **[Decision]** - Rationale: [Reason] - Impact: [High/Medium/Low]
    
    ## Technical Decisions
    1. **[Decision]** - Rationale: [Reason] - Impact: [High/Medium/Low]
    
    ## Operational Decisions
    1. **[Decision]** - Rationale: [Reason] - Impact: [High/Medium/Low]
    
    Return ONLY a JSON array of strings, where each string is a complete decision with details.
    
    Transcript:
    {state['transcript']}
    
    Response:"""
    
    logger.info("[NODE] Calling LLM for decisions extraction...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Identify clear decisions and outcomes."),
        HumanMessage(content=prompt)
    ])
    
    logger.info(f"[NODE] LLM response received: {len(response.content)} characters")
    
    try:
        # Clean up the response to ensure it's valid JSON
        response_content = response.content.strip()
        if response_content.startswith('```json'):
            response_content = response_content.replace('```json', '').replace('```', '').strip()
        elif response_content.startswith('```'):
            response_content = response_content.replace('```', '').strip()
        
        # Try to extract JSON from the response
        json_match = re.search(r'\[.*?\]', response_content, re.DOTALL)
        if json_match:
            response_content = json_match.group(0)
        
        decisions = json.loads(response_content)
        if not isinstance(decisions, list):
            decisions = []
        logger.info(f"[NODE] Successfully parsed {len(decisions)} decisions from JSON")
    except json.JSONDecodeError as e:
        logger.warning(f"[NODE] JSON parsing failed: {e}. Using keyword fallback...")
        # Fallback: extract lines with decision keywords
        decision_keywords = ['decided', 'agreed', 'concluded', 'chosen', 'determined', 'finalized']
        lines = state['transcript'].split('\n')
        decisions = []
        for line in lines:
            if any(keyword in line.lower() for keyword in decision_keywords):
                decisions.append(line.strip())
        logger.info(f"[NODE] Fallback extracted {len(decisions)} decisions using keywords")
    
    # Convert any objects to strings
    decisions = [str(item) if isinstance(item, dict) else item for item in decisions]
    decisions = [item for item in decisions if item and item != 'None']
    
    elapsed = time.time() - start_time
    logger.info(f"[NODE] extract_decisions completed in {elapsed:.2f}s - Found {len(decisions)} decisions")
    
    return {"decisions": decisions}

def summarize_meeting(state: MeetingState):
    """Create comprehensive meeting summary"""
    logger.info("[NODE] Starting summarize_meeting...")
    start_time = time.time()
    
    # Create context summary
    context = f"""
    Meeting Date: {state.get('meeting_date', 'Not specified')}
    Participants: {', '.join(state.get('participants', []))}
    Agenda: {state.get('agenda', 'No agenda extracted')}
    Action Items: {len(state.get('action_items', []))} items identified
    Decisions: {len(state.get('decisions', []))} decisions made
    """
    
    logger.info(f"[NODE] Summary context prepared with {len(state.get('participants', []))} participants and {len(state.get('action_items', []))} action items")
    
    prompt = f"""Create a comprehensive meeting summary based on the transcript and extracted information.
    Format the summary with clear sections using markdown:
    
    # MEETING SUMMARY
    
    ## Executive Summary
    [Brief 2-3 sentence overview of the meeting]
    
    ## Meeting Context
    - **Date**: {state.get('meeting_date', 'Not specified')}
    - **Participants**: {', '.join(state.get('participants', []))}
    - **Duration**: [Estimated duration if mentioned]
    
    ## Key Discussion Points
    1. **[Topic]**: [Summary of discussion]
    2. **[Topic]**: [Summary of discussion]
    3. **[Topic]**: [Summary of discussion]
    
    ## Major Outcomes and Decisions
    1. **[Decision/Outcome]**: [Details and implications]
    2. **[Decision/Outcome]**: [Details and implications]
    
    ## Next Steps and Action Items
    1. **[Action Item]**: [Owner] - [Deadline] - [Priority]
    2. **[Action Item]**: [Owner] - [Deadline] - [Priority]
    
    ## Follow-up Requirements
    - [Any additional follow-up needed]
    - [Next meeting date if mentioned]
    
    Original Transcript:
    {state['transcript']}
    
    Format as a professional, well-organized summary with these sections."""
    
    logger.info("[NODE] Calling LLM for meeting summary...")
    response = llm.invoke([
        SystemMessage(content="You are a professional meeting assistant. Create clear, comprehensive meeting summaries."),
        HumanMessage(content=prompt)
    ])
    
    summary = response.content
    elapsed = time.time() - start_time
    logger.info(f"[NODE] summarize_meeting completed in {elapsed:.2f}s - Generated {len(summary)} characters")
    
    return {"summary": summary}

# Build graph
workflow = StateGraph(MeetingState)

# Add nodes
workflow.add_node("extract_participants", extract_participants)
workflow.add_node("extract_meeting_date", extract_meeting_date)
workflow.add_node("extract_agenda", extract_agenda)
workflow.add_node("extract_action_items", extract_action_items)
workflow.add_node("extract_decisions", extract_decisions)
workflow.add_node("summarize_meeting", summarize_meeting)

# Define the workflow
workflow.add_edge(START, "extract_participants")
workflow.add_edge("extract_participants", "extract_meeting_date")
workflow.add_edge("extract_meeting_date", "extract_agenda")
workflow.add_edge("extract_agenda", "extract_action_items")
workflow.add_edge("extract_action_items", "extract_decisions")
workflow.add_edge("extract_decisions", "summarize_meeting")
workflow.add_edge("summarize_meeting", END)

# Compile
app_graph = workflow.compile()

if __name__ == "__main__":
    test_transcript = """John: Hi everyone, welcome to our project planning meeting on March 15, 2024. 
    Mary: Great to be here. I'm excited to discuss the new initiative.
    David: Let's start with the main agenda item - the tech stack selection.
    John: I agree. We need to decide between React and Angular for the frontend.
    Mary: I think React would be better because of our team's experience.
    David: Agreed. Let's go with React. For the backend, I suggest FastAPI.
    John: That sounds good. Mary, you'll be responsible for the frontend development.
    Mary: Perfect. I'll have the initial designs ready by next Friday.
    David: I'll handle the backend API development.
    John: Great. Let's meet again on March 22 to review progress."""
    
    print("Testing enhanced meeting agent...")
    for output in app_graph.stream({"transcript": test_transcript}):
        print(output)
