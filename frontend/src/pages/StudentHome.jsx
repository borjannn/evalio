import { useAuth } from "../auth/AuthContext";

export default function StudentHome() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: "2rem", fontFamily: "Nunito, sans-serif" }}>
      <h1>👋 Hi, {user?.first_name || user?.username}!</h1>
      <p>Your quizzes will appear here.</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}