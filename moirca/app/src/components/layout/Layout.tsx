import { useApp } from '@/contexts/AppContext';
import Sidebar from './Sidebar';
import LeftPanel from './LeftPanel';
import CustomPanel from '@/components/custom/CustomPanel';
import DraftPanel from '@/components/custom/DraftPanel';

export default function Layout() {
  const { state } = useApp();

  if (state.isChatFullScreen && state.leftNav === 'chat') {
    return (
      <div className="h-screen w-screen flex bg-amber-50/30">
        <Sidebar />
        <LeftPanel />
        <CustomPanel />
        <DraftPanel />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-amber-50/30 overflow-hidden">
      <Sidebar />
      <LeftPanel />
      <CustomPanel />
      <DraftPanel />
    </div>
  );
}
