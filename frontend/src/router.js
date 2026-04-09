import React from 'react';

export const ROUTES = {
  dashboard: '/',
  locations: '/locations',
  access: '/access',
};

function normalizePath(pathname, isAdmin) {
  if (pathname === ROUTES.locations) return ROUTES.locations;
  if (pathname === ROUTES.access && isAdmin) return ROUTES.access;
  return ROUTES.dashboard;
}

export function useRoute(isAdmin) {
  const [route, setRoute] = React.useState(() => normalizePath(window.location.pathname, isAdmin));

  React.useEffect(() => {
    const nextRoute = normalizePath(window.location.pathname, isAdmin);
    setRoute(current => {
      if (current === nextRoute) return current;
      return nextRoute;
    });

    if (window.location.pathname !== nextRoute) {
      window.history.replaceState({}, '', nextRoute);
    }

    function handlePopState() {
      setRoute(normalizePath(window.location.pathname, isAdmin));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAdmin]);

  function navigate(nextRoute) {
    const normalized = normalizePath(nextRoute, isAdmin);
    if (window.location.pathname !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setRoute(normalized);
  }

  return { route, navigate };
}
