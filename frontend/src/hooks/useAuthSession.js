import { useCallback, useEffect, useState } from 'react';
import { getAdminAccess, getMe, login, logout } from '../api';

export function useAuthSession() {
  const [authState, setAuthState] = useState('loading');
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [currentUserContext, setCurrentUserContext] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [accessData, setAccessData] = useState({ groups: [], users: [] });

  const applyAuthenticatedContext = useCallback(async context => {
    setCurrentUserContext(context);
    setAuthState('authenticated');
    setAuthError('');

    if (context.user.role === 'admin') {
      try {
        setAccessData(await getAdminAccess());
        setAccessError('');
      } catch (error) {
        console.error('Failed to load admin access UI:', error);
        setAccessError(error.error || error.message || 'Failed to load access management');
      }
    } else {
      setAccessData({ groups: [], users: [] });
      setAccessError('');
    }

    return context;
  }, []);

  const refreshUserContext = useCallback(async () => {
    try {
      const context = await getMe();
      await applyAuthenticatedContext(context);
      return true;
    } catch (error) {
      if (error?.code === 'AUTH_REQUIRED' || error?.code === 'USER_NOT_FOUND') return false;
      throw new Error(error.error || error.message || 'Failed to load user context');
    }
  }, [applyAuthenticatedContext]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const loaded = await refreshUserContext();
        if (cancelled) return;
        if (!loaded) setAuthState('logged-out');
      } catch (error) {
        if (cancelled) return;
        setAuthState('logged-out');
        setAuthError(error.message || 'Failed to initialize dashboard');
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refreshUserContext]);

  const handleLogin = useCallback(async event => {
    event.preventDefault();
    try {
      const context = await login(authForm);
      setAuthForm(form => ({ ...form, password: '' }));
      await applyAuthenticatedContext(context);
    } catch (error) {
      console.error('Login flow failed:', error);
      setAuthError(error.error || error.message || 'Login failed');
    }
  }, [applyAuthenticatedContext, authForm]);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthState('logged-out');
    setAuthError('');
    setCurrentUserContext(null);
    setAccessData({ groups: [], users: [] });
    setAccessError('');
  }, []);

  return {
    authState,
    authError,
    authForm,
    setAuthForm,
    currentUserContext,
    accessData,
    accessError,
    setAccessError,
    refreshUserContext,
    handleLogin,
    handleLogout,
  };
}
