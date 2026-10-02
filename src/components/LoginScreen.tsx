import React, { useState } from 'react';
import { Lock } from 'lucide-react';

interface LoginScreenProps {
  onSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Сервер відповів кодом ${response.status}`);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8F9FA] text-[#1F1F1F]">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-sm w-full p-6"
      >
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white mb-4">
          <Lock className="w-5 h-5" />
        </div>
        <h1 className="text-base font-semibold text-gray-900">Praxis Студія</h1>
        <p className="text-xs text-gray-500 mt-1">Введіть пароль, щоб продовжити.</p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-4 w-full px-3 py-2 rounded-xl border border-gray-300 text-sm outline-none focus:border-blue-600"
          placeholder="Пароль"
        />

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting || !password}
          className="mt-4 w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-sm"
        >
          {isSubmitting ? 'Перевірка...' : 'Увійти'}
        </button>
      </form>
    </div>
  );
};
