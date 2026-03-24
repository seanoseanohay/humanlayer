import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions, createSession, type Session } from "../api";

export function SessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const data = await listSessions();
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    // Poll every 5s for status updates
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await createSession(prompt.trim());
      setPrompt("");
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Sessions</h1>

      <form onSubmit={handleCreate} className="create-form">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a coding task for the agent..."
          rows={3}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !prompt.trim()}>
          {loading ? "Creating..." : "Create Session"}
        </button>
      </form>

      {error && (
        <div className="error">
          {error}
          <button className="error-dismiss" onClick={() => { setError(null); fetchSessions(); }}>
            Retry
          </button>
        </div>
      )}

      <div className="session-list">
        {initialLoading ? (
          <p className="empty">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="empty">No sessions yet. Create one above.</p>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              to={`/sessions/${session.id}`}
              className="session-card"
            >
              <div className="session-header">
                <span className={`status status-${session.status}`}>
                  {session.status}
                </span>
                <span className="session-time">
                  {new Date(session.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="session-prompt">{session.prompt}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
