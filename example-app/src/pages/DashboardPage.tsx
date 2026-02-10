import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  email: string;
  name: string;
}

export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      navigate('/');
      return;
    }
    setUser(JSON.parse(stored));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="page">
      <div className="card">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
          <button className="btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="welcome-message">
          Welcome back, <strong>{user.name}</strong>!
        </div>
        <p>You are logged in as {user.email}</p>
      </div>
    </div>
  );
}
