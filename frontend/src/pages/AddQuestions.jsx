import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import styles from "./AddQuestions.module.css";

export default function AddQuestions() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [topic, setTopic] = useState(null);
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [modules, setModules] = useState([]);

  useEffect(() => {
    fetchData();
  }, [quizId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch quiz details
      const quizRes = await api.get(`/quizzes/${quizId}/`);
      setQuiz(quizRes.data);

      // Fetch topic details (which includes question bank)
      const topicRes = await api.get(`/topics/${quizRes.data.topic}/`);
      setTopic(topicRes.data);

      // Extract questions already in quiz
      const inQuiz = quizRes.data.questions || [];
      setQuizQuestions(inQuiz);

      // Get all questions from question bank
      if (topicRes.data.question_bank) {
        const bankRes = await api.get(
          `/question-banks/${topicRes.data.question_bank.id}/`
        );
        const allQuestions = bankRes.data.questions || [];

        // Filter to show only questions not in quiz
        const available = allQuestions.filter(
          (q) => !inQuiz.some((qq) => qq.id === q.id)
        );
        setAvailableQuestions(available);

        // Extract unique modules
        const uniqueModules = Array.from(
          new Map(
            allQuestions.map((q) => [q.module, q.module_name])
          ).entries()
        ).map(([id, name]) => ({ id, name }));
        setModules(uniqueModules);
      }

      setError("");
    } catch (err) {
      setError("Failed to load quiz or questions.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = (question) => {
    const order = Math.max(...quizQuestions.map((q) => q.order || 0), 0) + 1;
    setQuizQuestions([
      ...quizQuestions,
      { ...question, order, quiz_question_id: null },
    ]);
    setAvailableQuestions(
      availableQuestions.filter((q) => q.id !== question.id)
    );
  };

  const handleRemoveQuestion = (questionId) => {
    const removed = quizQuestions.find((q) => q.id === questionId);
    setQuizQuestions(quizQuestions.filter((q) => q.id !== questionId));
    setAvailableQuestions([...availableQuestions, removed]);
  };

  const handleOrderChange = (questionId, newOrder) => {
    setQuizQuestions(
      quizQuestions.map((q) =>
        q.id === questionId ? { ...q, order: parseInt(newOrder) || 0 } : q
      )
    );
  };

  const handleSave = async () => {
    if (quizQuestions.length === 0) {
      setError("Please add at least one question to the quiz.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // First, remove all existing quiz questions
      const existingQuestions = quiz.questions || [];
      for (const qq of existingQuestions) {
        await api.post(`/quizzes/${quizId}/remove_question/`, {
          question_id: qq.id,
        }).catch(() => {
          // Ignore errors for individual deletions
        });
      }

      // Then add the new quiz questions in order
      const sorted = [...quizQuestions].sort((a, b) => a.order - b.order);
      for (const question of sorted) {
        await api.post(`/quizzes/${quizId}/add_question/`, {
          question_id: question.id,
          order: question.order,
        });
      }

      navigate(`/teacher/quiz/${quizId}`);
    } catch (err) {
      setError("Failed to save questions. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredAvailable = availableQuestions.filter((q) => {
    const matchesSearch = q.text
      .toLowerCase()
      .includes(searchFilter.toLowerCase());
    const matchesModule = !moduleFilter || q.module === parseInt(moduleFilter);
    return matchesSearch && matchesModule;
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading questions...</div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>{error || "Quiz not found"}</p>
        <Link to="/teacher" className={styles.backLink}>
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={`/teacher/quiz/${quizId}`} className={styles.backLink}>
          ← Back to Quiz
        </Link>
        <div className={styles.headerTitle}>
          <h1>Add Questions</h1>
          <p className={styles.subtitle}>{quiz.title}</p>
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.container}>
        {/* Left: Available Questions */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Available Questions</h2>

          <div className={styles.filters}>
            <input
              type="text"
              placeholder="Search questions..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className={styles.filterInput}
            />
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Modules</option>
              {modules.map((mod) => (
                <option key={mod.id} value={mod.id}>
                  {mod.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.questionsList}>
            {filteredAvailable.length === 0 ? (
              <p className={styles.emptyMessage}>
                {availableQuestions.length === 0
                  ? "No questions available. Create questions in the question bank first."
                  : "No questions match your filters."}
              </p>
            ) : (
              filteredAvailable.map((question) => (
                <QuestionItem
                  key={question.id}
                  question={question}
                  onAdd={() => handleAddQuestion(question)}
                  action="add"
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Quiz Questions */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Quiz Questions ({quizQuestions.length})
          </h2>

          <div className={styles.quizQuestionsList}>
            {quizQuestions.length === 0 ? (
              <p className={styles.emptyMessage}>
                No questions added yet. Select questions from the left.
              </p>
            ) : (
              quizQuestions
                .sort((a, b) => a.order - b.order)
                .map((question, idx) => (
                  <div key={question.id} className={styles.quizQuestionItem}>
                    <div className={styles.questionOrder}>
                      <label className={styles.orderLabel}>
                        Order:
                        <input
                          type="number"
                          min="1"
                          value={question.order}
                          onChange={(e) =>
                            handleOrderChange(question.id, e.target.value)
                          }
                          className={styles.orderInput}
                        />
                      </label>
                    </div>

                    <div className={styles.questionContent}>
                      <p className={styles.questionText}>{question.text}</p>
                      <p className={styles.questionMeta}>
                        <span className={styles.typeBadge}>
                          {question.question_type === "mc"
                            ? "Multiple Choice"
                            : "True/False"}
                        </span>
                        <span className={styles.moduleBadge}>
                          {question.module_name}
                        </span>
                      </p>
                    </div>

                    <button
                      className={styles.btnRemove}
                      onClick={() => handleRemoveQuestion(question.id)}
                      title="Remove from quiz"
                    >
                      ✕
                    </button>
                  </div>
                ))
            )}
          </div>

          <div className={styles.actions}>
            <Link to={`/teacher/quiz/${quizId}`} className={styles.btnCancel}>
              Cancel
            </Link>
            <button
              className={styles.btnSave}
              onClick={handleSave}
              disabled={saving || quizQuestions.length === 0}
            >
              {saving ? "Saving..." : "Save Questions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionItem({ question, onAdd, action }) {
  return (
    <div className={styles.questionCard}>
      <div className={styles.questionCardContent}>
        <p className={styles.questionText}>{question.text}</p>
        <p className={styles.questionMeta}>
          <span className={styles.typeBadge}>
            {question.question_type === "mc" ? "Multiple Choice" : "True/False"}
          </span>
          <span className={styles.moduleBadge}>{question.module_name}</span>
        </p>
      </div>
      <button
        className={
          action === "add" ? styles.btnAddSmall : styles.btnRemoveSmall
        }
        onClick={onAdd}
        title={action === "add" ? "Add to quiz" : "Remove from quiz"}
      >
        {action === "add" ? "+" : "✕"}
      </button>
    </div>
  );
}


