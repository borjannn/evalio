import {useState} from "react";
import {useNavigate, Link} from "react-router-dom";
import {useAuth} from "../auth/AuthContext";
import styles from "./Auth.module.css";

export default function Register() {
    const {register} = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // step 1: pick role, step 2: fill form
    const [role, setRole] = useState("");
    const [form, setForm] = useState({
        username: "",
        password: "",
        confirmPassword: "",
        first_name: "",
        last_name: "",
        email: "",
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

    const passwordValid = passwordRegex.test(form.password);
    const passwordsMatch =
        form.password === form.confirmPassword && form.confirmPassword !== "";

    const canSubmit = passwordValid && passwordsMatch && emailValid;

    const handleChange = (e) =>
        setForm((f) => ({...f, [e.target.name]: e.target.value}));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!passwordValid) {
            setError(
                "Password must contain an uppercase letter, lowercase letter, number, special character, and be at least 8 characters long."
            );
            return;
        }

        if (!passwordsMatch) {
            setError("Passwords do not match.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const user = await register({
                username: form.username,
                password: form.password,
                first_name: form.first_name,
                last_name: form.last_name,
                email: form.email,
                role,
            });

            navigate(user.role === "teacher" ? "/teacher" : "/student");
        } catch (err) {
            setError(
                err.response?.data
                    ? Object.values(err.response.data).flat().join(" ")
                    : "Something went wrong."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.logo}>✏️ Evalio</div>
                <h1 className={styles.title}>Create account</h1>

                {step === 1 && (
                    <>
                        <p className={styles.subtitle}>Who are you?</p>
                        <div className={styles.roleRow}>
                            <button
                                className={`${styles.roleBtn} ${role === "teacher" ? styles.roleActive : ""}`}
                                onClick={() => setRole("teacher")}
                                type="button"
                            >
                                👩‍🏫 Teacher
                            </button>
                            <button
                                className={`${styles.roleBtn} ${role === "student" ? styles.roleActive : ""}`}
                                onClick={() => setRole("student")}
                                type="button"
                            >
                                🎒 Student
                            </button>
                        </div>
                        <button
                            className={styles.btn}
                            disabled={!role}
                            onClick={() => setStep(2)}
                            type="button"
                        >
                            Next
                        </button>
                    </>
                )}

                {step === 2 && (
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.nameRow}>
                            <label className={styles.label}>
                                First name
                                <input
                                    className={styles.input}
                                    name="first_name"
                                    value={form.first_name}
                                    onChange={handleChange}
                                    required
                                />
                            </label>
                            <label className={styles.label}>
                                Last name
                                <input
                                    className={styles.input}
                                    name="last_name"
                                    value={form.last_name}
                                    onChange={handleChange}
                                    required
                                />
                            </label>
                        </div>

                        <label className={styles.label}>
                            Username
                            <input
                                className={styles.input}
                                name="username"
                                value={form.username}
                                onChange={handleChange}
                                required
                            />
                        </label>

                        <label className={styles.label}>
                            Email
                            <input
                                className={styles.input}
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                required={true}
                            />
                        </label>

                        {form.email && !emailValid && (
                            <p className={styles.error}>
                                Please enter a valid email address.
                            </p>
                        )}

                        <label className={styles.label}>
                            Password
                            <input
                                className={styles.input}
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                minLength={6}
                                required
                            />
                        </label>

                        {form.password && !passwordValid && (
                            <p className={styles.error}>
                                Password must be at least 8 characters and include:
                                <br/>
                                • One uppercase letter
                                <br/>
                                • One lowercase letter
                                <br/>
                                • One number
                                <br/>
                                • One special character
                            </p>
                        )}

                        <label className={styles.label}>
                            Confirm Password
                            <input
                                className={styles.input}
                                type="password"
                                name="confirmPassword"
                                value={form.confirmPassword}
                                onChange={handleChange}
                                required
                            />
                        </label>

                        {form.confirmPassword && !passwordsMatch && (
                            <p className={styles.error}>
                                Passwords do not match.
                            </p>
                        )}

                        {error && <p className={styles.error}>{error}</p>}

                        <div className={styles.btnRow}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setStep(1)}
                            >
                                Back
                            </button>
                            <button
                                className={styles.btn}
                                disabled={loading || !canSubmit}
                            >
                                {loading ? "Creating..." : "Create account"}
                            </button>
                        </div>
                    </form>
                )}

                <p className={styles.footer}>
                    Already have an account? <Link to="/login">Log in</Link>
                </p>
            </div>
        </div>
    );
}