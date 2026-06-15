import { useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle, MapPin, ArrowRight } from 'lucide-react';
import { uploadFile } from '@/api';

export default function FileUploadPanel() {
  const { state, dispatch } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [recentFile, setRecentFile] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const processFile = (file: File) => {
    setRecentFile(file.name);

    uploadFile<{
      document_id: string;
      filename: string;
      saved_path: string;
      sha256: string;
      text_length: number;
      text_preview: string;
      uploaded_at: string;
      graph_id?: string;
      graph_mode?: string;
      graph_node_count?: number;
      graph_edge_count?: number;
    }>('/documents/upload', file)
      .then((data) => {
        const parsedAt = Date.now();
        const previewHas物理 = /物理|理科|物理类/.test(data.text_preview);
        const previewHas历史 = /历史|文科|历史类/.test(data.text_preview);
        const mockResult = {
          fileName: data.filename,
          totalScore: 0,
          subjectType: previewHas物理 ? '物理类' : (previewHas历史 ? '历史类' : '未知'),
          rank: Math.max(1, 99999 - Math.min(99999, data.text_length * 10)),
          subjects: ['语文', '数学', '英语'],
          parsedAt,
          uploadedAt: data.uploaded_at,
          preview: data.text_preview,
          documentId: data.document_id,
          graphId: data.graph_id,
          graphMode: data.graph_mode,
          graphNodeCount: data.graph_node_count,
          graphEdgeCount: data.graph_edge_count,
        };
        dispatch({ type: 'ADD_UPLOAD_RESULT', payload: mockResult });
        dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: data.document_id });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '上传失败';
        dispatch({
          type: 'ADD_UPLOAD_RESULT',
          payload: {
            fileName: file.name,
            totalScore: 0,
            subjectType: '未知',
            rank: 0,
            subjects: [],
            parsedAt: Date.now(),
            preview: message,
            documentId: '',
            uploadedAt: new Date().toISOString(),
          },
        });
      });
  };

  const activeUpload = state.activeDocumentId
    ? state.uploadResults.find(item => item.documentId === state.activeDocumentId)
    : state.uploadResults[state.uploadResults.length - 1];

  const recommendationSummary = state.recommendMeta
    ? [
        `省份 ${state.recommendMeta.profile.province ?? '未知'}`,
        `分数 ${state.recommendMeta.profile.score ?? '未知'}`,
        `档位 ${state.recommendMeta.profile.auto_tier ?? '未知'}`,
      ].join(' · ')
    : '尚未生成推荐结果';

  return (
    <div className="h-full flex flex-col p-3">
      <h3 className="text-sm font-medium text-white mb-3">文件上传与分析</h3>

      {/* Drop Zone */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{ borderColor: isDragging ? '#3b82f6' : '#475569' }}
        className="border-2 border-dashed rounded-xl p-6 text-center transition-colors mb-3"
        style={{ backgroundColor: isDragging ? 'rgba(59,130,246,0.1)' : 'rgba(51,65,85,0.5)' }}
      >
        <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-blue-400' : 'text-slate-400'}`} />
        <p className="text-sm text-slate-300 mb-1">
          {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击上传'}
        </p>
        <p className="text-xs text-slate-500 mb-3">支持 PDF、DOCX、MD、TXT、CSV 格式</p>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.docx,.md,.txt,.csv,.json" onChange={handleFileInput} className="hidden" />
          <span className="inline-block px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors">
            选择文件
          </span>
        </label>
      </motion.div>

      {/* Upload Results */}
      {state.uploadResults.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-400">解析结果</h4>
            <span className="text-[10px] text-slate-500">当前激活：{activeUpload?.fileName || '无'}</span>
          </div>
          <div className="space-y-2">
            {state.uploadResults.map((result, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-slate-700/50 rounded-lg p-3 border transition-colors ${
                  result.documentId && result.documentId === state.activeDocumentId
                    ? 'border-blue-400/70 bg-slate-700/70'
                    : 'border-transparent'
                }`}
                role="button"
                tabIndex={0}
                onClick={() => result.documentId && dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: result.documentId })}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white truncate">{result.fileName}</span>
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 ml-auto shrink-0" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-400">总分</div>
                    <div className="text-lg font-bold text-blue-400">{result.totalScore}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-400">科类</div>
                    <div className="text-lg font-bold text-cyan-400">{result.subjectType}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-400">全省排名</div>
                    <div className="text-lg font-bold text-orange-400">{result.rank.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-400">选科</div>
                    <div className="text-xs text-slate-300 mt-1">{result.subjects.join('+') || '—'}</div>
                  </div>
                </div>
                <div className="mt-2 rounded-lg bg-slate-800/40 border border-slate-700 p-2 text-[11px] text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <MapPin className="w-3 h-3" />
                    <span>图谱绑定</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-300">
                    <span>文档ID: {result.documentId || '—'}</span>
                    <span>图谱ID: {result.graphId || '—'}</span>
                    <span>模式: {result.graphMode || '—'}</span>
                    <span>节点: {result.graphNodeCount ?? 0}</span>
                    <span>边: {result.graphEdgeCount ?? 0}</span>
                  </div>
                </div>
                <div className="mt-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2 text-[11px] text-cyan-100 space-y-1">
                  <div className="font-medium flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3" />
                    报告上下文
                  </div>
                  <div className="text-cyan-100/80">{recommendationSummary}</div>
                  {state.recommendMeta?.warnings?.length ? (
                    <div className="text-amber-200 truncate" title={state.recommendMeta.warnings[0]}>
                      风险：{state.recommendMeta.warnings[0]}
                    </div>
                  ) : (
                    <div className="text-cyan-100/60">建议先生成推荐结果，再上传文档以形成完整报告上下文。</div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">上传时间：{result.uploadedAt ? new Date(result.uploadedAt).toLocaleString() : new Date(result.parsedAt).toLocaleString()}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: result.documentId || null });
                      dispatch({ type: 'SET_LEFT_NAV', payload: 'graph' });
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                  >
                    查看图谱 →
                  </button>
                </div>
                {result.totalScore > 0 && (
                  <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    已自动生成"你的成绩档案"节点
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {recentFile && state.uploadResults.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-yellow-400">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full"
            />
            <span className="text-sm">正在解析 {recentFile}...</span>
          </div>
        </div>
      )}
    </div>
  );
}
