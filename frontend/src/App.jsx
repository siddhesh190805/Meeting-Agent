import React, { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [transcript, setTranscript] = useState('');
  const [userAgenda, setUserAgenda] = useState('');  // User's own agenda
  const [agenda, setAgenda] = useState('');
  const [summary, setSummary] = useState('');
  const [actionItems, setActionItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [meetingDate, setMeetingDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [stats, setStats] = useState({ words: 0, characters: 0, duration: '0 min' });
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('meetagent-theme');
    return savedTheme || 'dark';
  });
  const eventSource = useRef(null);
  const connectionAttempts = useRef(0);
  const maxConnectionAttempts = 3;

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('meetagent-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Real-time updates using Server-Sent Events
  useEffect(() => {
    // Only connect when not loading to avoid interference
    if (!loading) {
      try {
        console.log('Connecting to EventSource...');
        const version = '1.0.1';
        const timestamp = new Date().getTime();
        const es = new EventSource(`http://127.0.0.1:8001/stream?v=${version}&t=${timestamp}`);
        
        es.onopen = () => {
          console.log('EventSource connected successfully');
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'status') {
              setLoadingStatus(data.message);
              setLoadingProgress(data.progress);
              setLoadingStep(data.step);
              console.log('Status update:', data);
            } else if (data.type === 'ping') {
              console.log('Received ping from server');
            }
          } catch (error) {
            console.error('Error parsing EventSource message:', error);
          }
        };

        es.onerror = (error) => {
          console.error('EventSource error:', error);
        };

        es.onclose = () => {
          console.log('EventSource disconnected');
        };
        
        eventSource.current = es;
      } catch (error) {
        console.error('Failed to connect EventSource:', error);
      }
    }

    return () => {
      if (eventSource.current) {
        eventSource.current.close();
        eventSource.current = null;
      }
    };
  }, [loading]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type - only allow text files
      const allowedTypes = ['.txt', '.md', '.csv'];
      const allowedMimes = ['text/plain', 'text/markdown', 'text/csv'];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!allowedTypes.includes(fileExtension) || !allowedMimes.includes(file.type)) {
        setError('Invalid file type. Please upload a text file (.txt, .md, .csv) or paste your transcript directly.');
        setFileName('');
        setTranscript('');
        return;
      }
      
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setTranscript(e.target.result);
        setError('');
        updateStats(e.target.result);
      };
      reader.onerror = () => {
        setError('Failed to read the file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  const updateStats = (text) => {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const characters = text.length;
    const estimatedDuration = Math.max(1, Math.ceil(words / 150)); // Assuming 150 words per minute
    setStats({ words, characters, duration: `${estimatedDuration} min` });
  };

  const handleTranscriptChange = (e) => {
    const text = e.target.value;
    setTranscript(text);
    setError('');
    updateStats(text);
  };

  const handleGenerate = async () => {
    console.log('Generate button clicked');
    if (!transcript.trim()) {
      setError('Please enter a meeting transcript first.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Initializing AI analysis...');
    setLoadingProgress(0);
    setLoadingStep('init');
    setError('');
    setAgenda('');
    setSummary('');
    setActionItems([]);
    setDecisions([]);
    setParticipants([]);
    setMeetingDate('');
    setFileName('');
    setActiveTab('results');

    try {
      console.log('Making API request to http://127.0.0.1:8001/generate');
      setLoadingStatus('Connecting to AI server...');
      setLoadingProgress(5);
      setLoadingStep('connecting');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      setLoadingStatus('Processing transcript with AI...');
      setLoadingProgress(10);
      setLoadingStep('processing');
      
      const response = await fetch('http://127.0.0.1:8001/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript,
          agenda: userAgenda.trim() || undefined  // Send undefined instead of null
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('Response received:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Data received:', data);
      
      setLoadingStatus('Processing results...');
      setLoadingProgress(90);
      setLoadingStep('finalizing');
      
      setAgenda(data.agenda);
      setSummary(data.summary);
      setActionItems(data.action_items || []);
      setDecisions(data.decisions || []);
      setParticipants(data.participants || []);
      setMeetingDate(data.meeting_date || '');
      
      console.log('State updated - Agenda:', data.agenda ? 'Set' : 'Empty');
      console.log('State updated - Summary:', data.summary ? 'Set' : 'Empty');
      console.log('State updated - Action Items:', data.action_items?.length || 0);
      console.log('State updated - Decisions:', data.decisions?.length || 0);
      console.log('State updated - Participants:', data.participants?.length || 0);
      
      setLoadingStatus('Analysis complete!');
      setLoadingProgress(100);
      setLoadingStep('complete');
    } catch (err) {
      console.error('Error:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out. The AI is taking too long. Please try again with a shorter transcript.');
      } else {
        setError(err.message || 'Failed to connect to backend. Make sure the server is running on port 8001.');
      }
    } finally {
      // Small delay to ensure state updates are processed
      setTimeout(() => {
        setLoading(false);
        setLoadingStatus('');
        setLoadingProgress(0);
        setLoadingStep('');
      }, 500);
    }
  };

  const handleExport = (format) => {
    if (!agenda && !summary && actionItems.length === 0 && decisions.length === 0) {
      setError('No content available to export.');
      return;
    }

    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'txt') {
      content = `MEETING ANALYSIS REPORT
=====================

Meeting Date: ${meetingDate || 'Not specified'}
Participants: ${participants.join(', ') || 'Not specified'}

MEETING AGENDA
--------------
${agenda || 'No agenda extracted'}

ACTION ITEMS
------------
${actionItems.length > 0 ? actionItems.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No action items identified'}

DECISIONS MADE
--------------
${decisions.length > 0 ? decisions.map((decision, index) => `${index + 1}. ${decision}`).join('\n') : 'No decisions recorded'}

MEETING SUMMARY
---------------
${summary || 'No summary available'}

---
Generated by MeetAgent AI on ${new Date().toLocaleDateString()}`;
      
      filename = `meeting-analysis-${new Date().toISOString().split('T')[0]}.txt`;
      mimeType = 'text/plain';
    } else if (format === 'json') {
      const exportData = {
        meeting_date: meetingDate,
        participants: participants,
        agenda: agenda,
        action_items: actionItems,
        decisions: decisions,
        summary: summary,
        generated_at: new Date().toISOString()
      };
      
      content = JSON.stringify(exportData, null, 2);
      filename = `meeting-analysis-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setTranscript('');
    setUserAgenda('');
    setAgenda('');
    setSummary('');
    setActionItems([]);
    setDecisions([]);
    setParticipants([]);
    setMeetingDate('');
    setFileName('');
    setError('');
    setStats({ words: 0, characters: 0, duration: '0 min' });
    setActiveTab('input');
  };

  return (
    <div className="container">
      <nav className="navbar glass">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ marginRight: '8px' }}>
            <path d="M16 2L8 10L16 18L24 10M16 2V18M8 10H24" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6"/>
                <stop offset="100%" stopColor="#2563eb"/>
              </linearGradient>
            </defs>
          </svg>
          MEETAGENT.AI
        </div>
        <div className="nav-links">
          <button 
            className={`nav-tab ${activeTab === 'input' ? 'active' : ''}`}
            onClick={() => setActiveTab('input')}
          >
            Input
          </button>
          <button 
            className={`nav-tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!agenda && !summary && actionItems.length === 0}
          >
            Results
          </button>
          <button 
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
      </nav>

      <main>
        {activeTab === 'input' && (
          <div className="input-panel">
            <section className="hero">
              <h1>AI-Powered Meeting Analysis</h1>
              <p>
                Transform your meeting transcripts into actionable insights with advanced AI technology
              </p>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-number">{stats.words}</div>
                  <div className="stat-label">Words</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{stats.characters}</div>
                  <div className="stat-label">Characters</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{stats.duration}</div>
                  <div className="stat-label">Est. Duration</div>
                </div>
              </div>
            </section>

            <section className="input-section">
              <div className="input-methods glass">
                {/* File Upload */}
                <div className="file-upload-section">
                  <input
                    id="file-upload"
                    type="file"
                    accept=".txt,.md,.csv"
                    onChange={handleFileUpload}
                    disabled={loading}
                    className="file-upload-input"
                  />
                  <label htmlFor="file-upload" className="file-upload-label">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17,8 12,3 7,8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span>{fileName ? 'Change File' : 'Upload Transcript'}</span>
                  </label>
                  {fileName && (
                    <div className="file-info">
                      <span className="file-name">{fileName}</span>
                      <button 
                        onClick={() => {setFileName(''); setTranscript(''); setStats({ words: 0, characters: 0, duration: '0 min' });}}
                        className="clear-file-btn"
                        disabled={loading}
                        type="button"
                      >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )}
                  <p className="file-hint">Supports: .txt, .md, .csv</p>
                </div>

                <div className="divider">
                  <span>OR</span>
                </div>

                {/* Text Input */}
                <div className="text-input-section">
                  <label className="input-label">Paste Transcript Directly:</label>
                  <textarea 
                    placeholder="Paste your meeting transcript here... (e.g., John: Hi everyone...)"
                    value={transcript}
                    onChange={handleTranscriptChange}
                    disabled={loading}
                    className="glass transcript-textarea"
                  />
                  
                  <label className="input-label" style={{ marginTop: '20px' }}>Optional: Set Your Own Meeting Agenda:</label>
                  <textarea 
                    placeholder="Enter your meeting agenda here... (Leave blank to auto-extract from transcript)"
                    value={userAgenda}
                    onChange={(e) => setUserAgenda(e.target.value)}
                    disabled={loading}
                    className="glass agenda-textarea"
                    rows={4}
                  />
                  <p className="file-hint">💡 If you provide an agenda, it will be used instead of auto-extraction</p>
                  
                  <div className="input-actions">
                    <button 
                      className="btn btn-secondary"
                      onClick={clearAll}
                      disabled={loading}
                      type="button"
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      Clear All
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => {
                        console.log('Button clicked! Transcript:', transcript);
                        if (!transcript.trim()) {
                          alert('Please enter a transcript first!');
                          return;
                        }
                        handleGenerate();
                      }}
                      disabled={loading}
                      type="button"
                    >
                      {loading ? (
                        <>
                          <div className="loader"></div>
                          <span>Analyzing...</span>
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
                          </svg>
                          <span>Generate Analysis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="results-panel">
            {loading && (
              <div className="loading-overlay">
                <div className="loading-content">
                  <div className="progress-container">
                    <div className="circular-progress">
                      <div 
                        className="progress-ring"
                        style={{
                          background: `conic-gradient(${
                            loadingProgress === 100 ? '#10b981' : 
                            loadingProgress > 75 ? '#3b82f6' : 
                            loadingProgress > 50 ? '#8b5cf6' : 
                            loadingProgress > 25 ? '#ec4899' : '#f59e0b'
                          } ${loadingProgress * 3.6}deg, var(--border-color) 0deg)`
                        }}
                      >
                        <div className="progress-ring-inner"></div>
                      </div>
                      <div className="progress-percentage">{loadingProgress}%</div>
                    </div>
                    <h3>{loadingStatus}</h3>
                    <div className="step-indicator">
                      <span className={`step ${loadingStep === 'init' ? 'active' : ''}`}>🚀 Start</span>
                      <span className={`step ${loadingStep === 'connecting' ? 'active' : ''}`}>🔗 Connect</span>
                      <span className={`step ${loadingStep === 'processing' ? 'active' : ''}`}>🧠 Process</span>
                      <span className={`step ${loadingStep === 'finalizing' ? 'active' : ''}`}>⚡ Finalize</span>
                      <span className={`step ${loadingStep === 'complete' ? 'active' : ''}`}>✅ Done</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <section className="results-header">
              <div className="results-title">
                <h2>Meeting Analysis Results</h2>
                <div className="results-meta">
                  {meetingDate && <span className="meta-item">📅 {meetingDate}</span>}
                  {participants.length > 0 && <span className="meta-item">👥 {participants.length} participants</span>}
                  <span className="meta-item">⚡ AI Generated</span>
                </div>
              </div>
              <div className="results-actions">
                <button 
                  onClick={() => handleExport('txt')}
                  className="btn btn-export"
                  disabled={loading || (!agenda && !summary && actionItems.length === 0 && decisions.length === 0)}
                  type="button"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  Export TXT
                </button>
                <button 
                  onClick={() => handleExport('json')}
                  className="btn btn-export btn-export-json"
                  disabled={loading || (!agenda && !summary && actionItems.length === 0 && decisions.length === 0)}
                  type="button"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  Export JSON
                </button>
                <button 
                  onClick={clearAll}
                  className="btn btn-secondary"
                  type="button"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 6h18v6H3zM3 13h18v6H3z"/>
                    <path d="M8 9h8v6H8zM3 18h18v6H3z"/>
                  </svg>
                  New Analysis
                </button>
              </div>
            </section>

            <div className="results-grid">
              {/* Meeting Agenda */}
              {agenda && (
                <div className="result-card glass agenda-card">
                  <div className="card-header">
                    <h3>
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M10 16h.01" />
                      </svg>
                      Meeting Agenda
                    </h3>
                    <span className="card-badge">Structured</span>
                  </div>
                  <div className="result-content">{agenda}</div>
                </div>
              )}

              {/* Meeting Summary */}
              {summary && (
                <div className="result-card glass summary-card">
                  <div className="card-header">
                    <h3>
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Meeting Summary
                    </h3>
                    <span className="card-badge">Comprehensive</span>
                  </div>
                  <div className="result-content">{summary}</div>
                </div>
              )}

              {/* Action Items */}
              {actionItems.length > 0 && (
                <div className="result-card glass action-items-card">
                  <div className="card-header">
                    <h3>
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Action Items
                    </h3>
                    <span className="card-badge">{actionItems.length} items</span>
                  </div>
                  <ul className="action-items-list">
                    {actionItems.map((item, index) => (
                      <li key={index}>
                        <span className="item-number">{index + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Decisions */}
              {decisions.length > 0 && (
                <div className="result-card glass decisions-card">
                  <div className="card-header">
                    <h3>
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 11H7a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-2H7a2 2 0 00-2-2h-2M9 11a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-7-4h7l-2-2 2" />
                      </svg>
                      Decisions
                    </h3>
                    <span className="card-badge">{decisions.length} decisions</span>
                  </div>
                  <ul className="decisions-list">
                    {decisions.map((decision, index) => (
                      <li key={index}>
                        <span className="item-number">{index + 1}</span>
                        {decision}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Participants */}
              {participants.length > 0 && (
                <div className="result-card glass participants-card">
                  <div className="card-header">
                    <h3>
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17 21v-2a2 2 0 00-2-2H5a2 2 0 00-2-2v-2h2a2 2 0 002-2M5 12H3a2 2 0 00-2-2v-2h2a2 2 0 002-2M12 5a2 2 0 012-2h2a2 2 0 012 2z" />
                      </svg>
                      Participants
                    </h3>
                    <span className="card-badge">{participants.length} participants</span>
                  </div>
                  <ul className="participants-list">
                    {participants.map((participant, index) => (
                      <li key={index}>
                        <span className="item-number">{index + 1}</span>
                        {participant}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
