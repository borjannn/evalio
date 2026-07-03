import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) return null; // or a spinner

  if (!user) return <Navigate to="/login" replace />;

  if (role && user.role !== role) {
    // Wrong role — send them to their own home
    return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
  }

  return children;
}