import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import styles from "./QuizDetails.module.css";

export default function QuizDetails() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [questionsByModule, setQuestionsByModule] = useState({});

  useEffect(() => {
    fetchQuizDetails();
  }, [quizId]);

  const fetchQuizDetails = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/quizzes/${quizId}/`);
      setQuiz(data);

      // Group questions by module
      const grouped = {};
      if (data.questions) {
        data.questions.forEach((question) => {
          const moduleId = question.module;
          const moduleName = question.module_name || `Module ${moduleId}`;
          if (!grouped[moduleId]) {
            grouped[moduleId] = {
              moduleName: moduleName,
              questions: [],
            };
          }
          grouped[moduleId].questions.push(question);
        });
      }
      setQuestionsByModule(grouped);
      setError("");
    } catch (err) {
      setError("Failed to load quiz details.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (
      !window.confirm("Are you sure you want to delete this quiz?")
    )
      return;

    try {
      await api.delete(`/quizzes/${quizId}/`);
      navigate("/teacher");
    } catch (err) {
      setError("Failed to delete quiz.");
      console.error(err);
    }
  };

  if (loading)
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading quiz details...</div>
      </div>
    );

  if (!quiz)
    return (
      <div className={styles.page}>
        <p className={styles.error}>{error || "Quiz not found"}</p>
        <Link to="/teacher" className={styles.backLink}>
          ← Back to Dashboard
        </Link>
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to="/teacher" className={styles.backLink}>
          ← Back to Dashboard
        </Link>
        <div className={styles.headerTitle}>
          <h1>{quiz.title}</h1>
          {quiz.description && (
            <p className={styles.description}>{quiz.description}</p>
          )}
        </div>
        <div className={styles.headerActions}>
          <Link
            to={`/teacher/quiz/${quizId}/edit`}
            className={styles.btnEdit}
          >
            ✏️ Edit Quiz
          </Link>
          <button className={styles.btnDelete} onClick={handleDeleteQuiz}>
            🗑 Delete
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.container}>
        {Object.entries(questionsByModule).length === 0 ? (
          <div className={styles.emptyState}>
            <p>No questions in this quiz yet.</p>
            <Link
              to={`/teacher/quiz/${quizId}/add-questions`}
              className={styles.btnAddQuestions}
            >
              + Add Questions
            </Link>
          </div>
        ) : (
          Object.entries(questionsByModule).map(([moduleId, moduleData]) => (
            <ModuleSection
              key={moduleId}
              moduleId={moduleId}
              moduleData={moduleData}
              quizId={quizId}
              onRefresh={fetchQuizDetails}
            />
          ))
        )}
      </div>

      <div className={styles.addSection}>
        <Link
          to={`/teacher/quiz/${quizId}/add-questions`}
          className={styles.btnAddMore}
        >
          + Add More Questions
        </Link>
      </div>
    </div>
  );
}

function ModuleSection({ moduleId, moduleData, quizId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.card}>
      <button
        className={styles.moduleHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.moduleName}>
          📦 {moduleData.moduleName}
        </span>
        <span className={styles.count}>
          {moduleData.questions.length} question
          {moduleData.questions.length !== 1 ? "s" : ""}
        </span>
        <span className={styles.expandIcon}>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className={styles.moduleContent}>
          <div className={styles.questionsGrid}>
            {moduleData.questions.map((question, idx) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={idx + 1}
                quizId={quizId}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, index, quizId, onRefresh }) {
  return (
    <div className={styles.questionCard}>
      <div className={styles.questionHeader}>
        <h4 className={styles.questionNumber}>Question {index}</h4>
        <span className={styles.questionType}>
          {question.question_type === "mc" ? "Multiple Choice" : "True/False"}
        </span>
      </div>

      <p className={styles.questionText}>{question.text}</p>

      <div className={styles.choices}>
        <p className={styles.choicesLabel}>Choices:</p>
        <ul className={styles.choicesList}>
          {question.choices?.map((choice) => (
            <li key={choice.id} className={styles.choiceItem}>
              <span className={styles.choiceText}>{choice.text}</span>
              {choice.is_correct && (
                <span className={styles.correctBadge}>✓ Correct</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.actions}>
        <button className={styles.btnSmall}>✏️ Edit</button>
        <button className={styles.btnSmall}>🗑 Remove</button>
      </div>
    </div>
  );
}


