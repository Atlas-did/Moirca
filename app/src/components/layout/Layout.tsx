import { useApp } from '@/contexts/AppContext';
import Sidebar from './Sidebar';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';

export default function Layout() {
  const { state } = useApp();

  // Full-screen chat mode
  if (state.isChatFullScreen && state.leftNav === 'chat') {
    return (
      <div className="h-screen w-screen flex bg-slate-50">
        <Sidebar />
        <LeftPanel />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-slate-50 overflow-hidden">
      {/* Left Nav Bar */}
      <Sidebar />

      {/* Left Main Window */}
      <LeftPanel />

      {/* Right Sub-Window */}
      <RightPanel />
    </div>
  );
}
