import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Pre-validation feedback
    if (!email.endsWith('@hsbi.de')) {
        setError('Email must end with @hsbi.de');
        return;
    }

    try {
      const response = await fetch('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Auto redirect to login or auto-login? Let's redirect to login for now.
      alert('Registration successful! Please log in.');
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px', color: 'white' }}>
      <h1>Register Curator</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <input 
          type="email" 
          placeholder="Email (@hsbi.de)" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '0.5rem' }}
          required
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '0.5rem' }}
          required
        />
        <button type="submit" style={{ padding: '0.5rem', cursor: 'pointer' }}>Register</button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        Already have an account? <a href="/login" style={{ color: '#aaa' }}>Login here</a>.
      </p>
    </div>
  );
};
