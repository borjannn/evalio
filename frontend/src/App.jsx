import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import PrivateRoute from "./auth/PrivateRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentHome from "./pages/StudentHome";
import TeacherHome from "./pages/TeacherHome";
import QuizDetails from "./pages/QuizDetails";
import CreateQuiz from "./pages/CreateQuiz";
import AddQuestions from "./pages/AddQuestions";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/student"
            element={
              <PrivateRoute role="student">
                <StudentHome />
              </PrivateRoute>
            }
          />

          <Route
            path="/teacher"
            element={
              <PrivateRoute role="teacher">
                <TeacherHome />
              </PrivateRoute>
            }
          />

          <Route
            path="/teacher/quiz/:quizId"
            element={
              <PrivateRoute role="teacher">
                <QuizDetails />
              </PrivateRoute>
            }
          />

          <Route
            path="/teacher/topic/:topicId/new-quiz"
            element={
              <PrivateRoute role="teacher">
                <CreateQuiz />
              </PrivateRoute>
            }
          />

          <Route
            path="/teacher/quiz/:quizId/add-questions"
            element={
              <PrivateRoute role="teacher">
                <AddQuestions />
              </PrivateRoute>
            }
          />

          {/* Catch-all: redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}