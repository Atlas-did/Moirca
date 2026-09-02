import { AppProvider, useApp } from '@/contexts/AppContext';
import Login from '@/components/onboarding/Login';
import Layout from '@/components/layout/Layout';
import TextSelectionTooltip from '@/components/shared/TextSelectionTooltip';

function AppContent() {
  const { state } = useApp();

  if (state.phase === 'login') {
    return <Login />;
  }

  return (
    <>
      <Layout />
      <TextSelectionTooltip />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
