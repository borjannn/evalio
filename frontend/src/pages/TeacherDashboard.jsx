import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import api from "../api/axios";
import styles from "./TeacherDashboard.module.css";

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [newTopic, setNewTopic] = useState({ name: "", description: "" });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    fetchTopics();
  }, []);

  const fetchTopics = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/topics/");
      setTopics(data.results || data);
      setError("");
    } catch (err) {
      setError("Failed to load topics.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!newTopic.name.trim()) {
      setError("Topic name is required.");
      return;
    }

    try {
      const { data } = await api.post("/topics/", {
        name: newTopic.name,
        description: newTopic.description,
      });
      setTopics([data, ...topics]);
      setNewTopic({ name: "", description: "" });
      setShowNewTopicForm(false);
      setError("");
    } catch (err) {
      setError("Failed to create topic.");
      console.error(err);
    }
  };

  if (loading) return <div className={styles.page}>Loading...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>📚 Teacher Dashboard</h1>
          {user && <p className={styles.userGreeting}>Welcome, {user.first_name || user.username}!</p>}
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.btnCreate}
            onClick={() => setShowNewTopicForm(!showNewTopicForm)}
          >
            {showNewTopicForm ? "Cancel" : "+ New Topic"}
          </button>
          <button className={styles.btnLogout} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {showNewTopicForm && (
        <div className={styles.card}>
          <h2>Create New Topic</h2>
          <form onSubmit={handleCreateTopic}>
            <label className={styles.label}>
              Topic Name
              <input
                className={styles.input}
                type="text"
                value={newTopic.name}
                onChange={(e) =>
                  setNewTopic((t) => ({ ...t, name: e.target.value }))
                }
                placeholder="e.g., Mathematics 101"
                required
              />
            </label>

            <label className={styles.label}>
              Description
              <textarea
                className={styles.textarea}
                value={newTopic.description}
                onChange={(e) =>
                  setNewTopic((t) => ({ ...t, description: e.target.value }))
                }
                placeholder="Optional topic description"
                rows="4"
              />
            </label>

            <button type="submit" className={styles.btn}>
              Create Topic
            </button>
          </form>
        </div>
      )}

      <div className={styles.topicsContainer}>
        {topics.length === 0 ? (
          <p className={styles.emptyState}>
            No topics yet. Create one to get started!
          </p>
        ) : (
          topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} onRefresh={fetchTopics} />
          ))
        )}
      </div>
    </div>
  );
}

function TopicCard({ topic, onRefresh }) {
  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this topic?")) return;

    try {
      await api.delete(`/topics/${topic.id}/`);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete topic:", err);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <h3>{topic.name}</h3>
          {topic.description && <p className={styles.description}>{topic.description}</p>}
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.btnExpand}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "−" : "+"}
          </button>
          <button className={styles.btnDelete} onClick={handleDelete}>
            🗑
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.cardContent}>
          {/* Quizzes Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h4>📋 Quizzes ({topic.quizzes?.length || 0})</h4>
              <Link to={`/teacher/topic/${topic.id}/new-quiz`} className={styles.btnAdd}>
                + Add Quiz
              </Link>
            </div>
            {topic.quizzes && topic.quizzes.length > 0 ? (
              <ul className={styles.list}>
                {topic.quizzes.map((quiz) => (
                  <li key={quiz.id} className={styles.listItem}>
                    <Link to={`/teacher/quiz/${quiz.id}`} className={styles.link}>
                      {quiz.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>No quizzes yet</p>
            )}
          </div>

          {/* Question Bank Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h4>🏦 Question Bank</h4>
              <Link
                to={`/teacher/topic/${topic.id}/question-bank`}
                className={styles.btnAdd}
              >
                Manage
              </Link>
            </div>
            {topic.question_bank ? (
              <p className={styles.info}>
                {topic.question_bank.questions?.length || 0} questions
              </p>
            ) : (
              <p className={styles.empty}>Question bank not initialized</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}




