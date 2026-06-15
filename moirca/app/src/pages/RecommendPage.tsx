import ScoreInputBar from '@/components/volunteer/ScoreInputBar';
import VolunteerTable from '@/components/volunteer/VolunteerTable';

export default function RecommendPage() {
  return (
    <div className="h-full flex flex-col">
      <ScoreInputBar />
      <div className="flex-1 overflow-auto">
        <VolunteerTable />
      </div>
    </div>
  );
}
