import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import styles from "./CreateQuiz.module.css";

export default function CreateQuiz() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(null);
  const [form, setForm] = useState({ title: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchingTopic, setFetchingTopic] = useState(true);

  useEffect(() => {
    fetchTopic();
  }, [topicId]);

  const fetchTopic = async () => {
    try {
      setFetchingTopic(true);
      const { data } = await api.get(`/topics/${topicId}/`);
      setTopic(data);
      setError("");
    } catch (err) {
      setError("Failed to load topic.");
      console.error(err);
    } finally {
      setFetchingTopic(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Quiz title is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await api.post("/quizzes/", {
        topic: topicId,
        title: form.title,
        description: form.description,
      });
      // Redirect to quiz details page
      navigate(`/teacher/quiz/${data.id}`);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.title?.[0] ||
          "Failed to create quiz."
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingTopic) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading topic...</div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>{error || "Topic not found"}</div>
        <Link to="/teacher" className={styles.backLink}>
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/teacher" className={styles.backLink}>
          ← Back to Dashboard
        </Link>
        <div className={styles.headerTitle}>
          <h1>Create New Quiz</h1>
          <p className={styles.subtitle}>Topic: {topic.name}</p>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.card}>
          <form onSubmit={handleSubmit}>
            <label className={styles.label}>
              Quiz Title
              <input
                className={styles.input}
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g., Math Fundamentals Quiz"
                required
                autoFocus
              />
            </label>

            <label className={styles.label}>
              Description (Optional)
              <textarea
                className={styles.textarea}
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Describe what this quiz covers..."
                rows="4"
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <Link to="/teacher" className={styles.btnCancel}>
                Cancel
              </Link>
              <button
                type="submit"
                className={styles.btnCreate}
                disabled={loading}
              >
                {loading ? "Creating..." : "Create Quiz"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

