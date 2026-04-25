import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' as 'employee' | 'manager' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokens = await authApi.register(form);
      login(tokens.accessToken, tokens.refreshToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.1)', width: '100%', maxWidth: 400 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Create account</h1>
        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>Expense Tracker</p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Name</label>
            <input required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Email</label>
            <input type="email" required style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Password</label>
            <input type="password" required minLength={12} style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>Min 12 chars, uppercase, number, and special character</p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Role</label>
            <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'employee' | 'manager' })}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button
            type="submit" disabled={loading}
            style={{ background: loading ? '#93c5fd' : '#2563eb', color: '#fff', padding: '10px', border: 'none', borderRadius: 6, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15 }}
          >
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          Already have an account? <Link to="/login" style={{ color: '#2563eb' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
