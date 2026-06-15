import { AppProvider, useApp } from '@/contexts/AppContext';
import Login from '@/components/onboarding/Login';
import HomePage from '@/pages/HomePage';
import Layout from '@/components/layout/Layout';

function AppContent() {
  const { state } = useApp();

  if (state.phase === 'login') {
    return <Login />;
  }

  if (state.phase === 'home') {
    return <HomePage />;
  }

  return <Layout />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
