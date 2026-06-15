import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, GraduationCap, TrendingUp, MessageSquare, ThumbsUp, ThumbsDown, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface SchoolInfo {
  name: string;
  level: string;
  province: string;
  city: string;
  tags: string;
  majors: { name: string; avg: number; min: number; max: number }[];
  review_count: number;
  positive_rate: number;
  sample_reviews: { content: string; major: string; sentiment: string }[];
}

interface Props {
  schoolName: string | null;
  onClose: () => void;
}

function ReviewItem({ review }: { review: { content: string; major: string; sentiment: string } }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.content.length > 100;
  const display = expanded || !long ? review.content : review.content.slice(0, 100) + '...';

  return (
    <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed border-l-[3px] ${
      review.sentiment === 'positive' ? 'border-l-emerald-400 bg-emerald-50/50' :
      review.sentiment === 'negative' ? 'border-l-red-400 bg-red-50/50' :
      'border-l-stone-300 bg-stone-50'
    }`}>
      <div className="text-[10px] text-stone-400 mb-0.5">{review.major || '在校生'}</div>
      <div className="text-stone-700 whitespace-pre-wrap">{display}</div>
      {long && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-indigo-500 hover:text-indigo-700 mt-1 flex items-center gap-0.5">
          {expanded ? <><ChevronUp className="w-3 h-3" />收起</> : <><ChevronDown className="w-3 h-3" />展开全文</>}
        </button>
      )}
    </div>
  );
}

const TIER_BADGE: Record<string, string> = {
  '985': 'bg-amber-100 text-amber-800',
  '211': 'bg-blue-100 text-blue-800',
  '双一流': 'bg-purple-100 text-purple-800',
};

export default function SchoolInfoCard({ schoolName, onClose }: Props) {
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolName) { setInfo(null); return; }
    setLoading(true);
    fetch(`/api/graph-viz/school-info?name=${encodeURIComponent(schoolName)}`)
      .then(r => r.json())
      .then(data => { setInfo(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [schoolName]);

  return (
    <AnimatePresence>
      {schoolName && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="absolute top-4 left-4 z-50 w-96 max-h-[75vh] overflow-y-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-stone-200"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-stone-100 flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-stone-800 truncate">{schoolName}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {info?.level && TIER_BADGE[info.level] && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${TIER_BADGE[info.level]}`}>{info.level}</span>
                )}
                {(info?.province || info?.city) && (
                  <span className="flex items-center gap-1 text-[11px] text-stone-400">
                    <MapPin className="w-3 h-3" />
                    {[info?.province, info?.city].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="px-5 py-8 text-center text-stone-400 text-sm">加载中...</div>
          )}

          {info && !loading && (
            <div className="px-5 py-4 space-y-4">
              {/* Majors */}
              {info.majors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[11px] font-bold text-stone-500 uppercase">优势专业</span>
                  </div>
                  <div className="space-y-1.5">
                    {info.majors.slice(0, 6).map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-stone-50 rounded-lg px-3 py-2">
                        <span className="text-stone-700 font-medium truncate max-w-[160px]">{m.name}</span>
                        <span className="text-stone-400 font-mono text-[10px]">{m.avg}分</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews */}
              {info.review_count > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px] font-bold text-stone-500 uppercase">
                      在校生评价 · {info.review_count}条
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold ml-auto">
                      👍 {info.positive_rate}%好评
                    </span>
                  </div>
                  <div className="space-y-2">
                    {info.sample_reviews.map((r, i) => (
                      <ReviewItem key={i} review={r} />
                    ))}
                  </div>
                </div>
              )}

              {/* No reviews */}
              {info.review_count === 0 && (
                <div className="text-center py-4 text-stone-300 text-xs">
                  <MessageSquare className="w-5 h-5 mx-auto mb-1 opacity-50" />
                  暂无在校生评价数据
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
