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
    <div className="h-full flex flex-col p-4">
      <h3 className="panel-title mb-3">文件上传与分析</h3>

      {/* Drop Zone */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border border-dashed rounded-md p-6 text-center transition-colors duration-200 mb-3 ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/40'
        }`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground/40'}`} />
        <p className="text-[13px] text-foreground mb-1">
          {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击上传'}
        </p>
        <p className="text-xs text-muted-foreground mb-3">支持 PDF、DOCX、MD、TXT、CSV 格式</p>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.docx,.md,.txt,.csv,.json" onChange={handleFileInput} className="hidden" />
          <span className="inline-block px-4 h-9 leading-9 bg-primary text-primary-foreground text-[13px] rounded-md shadow-xs hover:bg-primary/90 transition-colors">
            选择文件
          </span>
        </label>
      </motion.div>

      {/* Upload Results */}
      {state.uploadResults.length > 0 && (
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <h4 className="eyebrow">解析结果</h4>
            <span className="text-[11px] text-muted-foreground">当前激活：{activeUpload?.fileName || '无'}</span>
          </div>
          <div className="divide-y divide-border">
            {state.uploadResults.map((result, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`px-2 py-3 rounded-md cursor-pointer transition-colors duration-150 ${
                  result.documentId && result.documentId === state.activeDocumentId
                    ? 'bg-accent/40'
                    : 'hover:bg-accent/40'
                }`}
                role="button"
                tabIndex={0}
                onClick={() => result.documentId && dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: result.documentId })}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className={`text-[13px] font-medium truncate ${
                    result.documentId && result.documentId === state.activeDocumentId
                      ? 'text-primary'
                      : 'text-foreground'
                  }`}>{result.fileName}</span>
                  <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--success))] ml-auto shrink-0" />
                </div>
                <div className="text-xs">
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-[11px] text-muted-foreground">总分</span>
                    <span className="text-xs tabular-nums text-foreground">{result.totalScore}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-[11px] text-muted-foreground">科类</span>
                    <span className="text-xs text-foreground">{result.subjectType}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-[11px] text-muted-foreground">全省排名</span>
                    <span className="text-xs tabular-nums text-foreground">{result.rank.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-[11px] text-muted-foreground">选科</span>
                    <span className="text-xs text-foreground">{result.subjects.join('+') || '—'}</span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] space-y-0.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>图谱绑定</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums text-muted-foreground">
                    <span>文档ID: {result.documentId || '—'}</span>
                    <span>图谱ID: {result.graphId || '—'}</span>
                    <span>模式: {result.graphMode || '—'}</span>
                    <span>节点: {result.graphNodeCount ?? 0}</span>
                    <span>边: {result.graphEdgeCount ?? 0}</span>
                  </div>
                </div>
                <div className="mt-2 rounded-r-sm bg-muted/60 border border-border border-l-[3px] border-l-primary p-2 text-[11px] space-y-1">
                  <div className="font-medium flex items-center gap-1.5 text-foreground">
                    <ArrowRight className="w-3 h-3 text-primary" />
                    报告上下文
                  </div>
                  <div className="text-muted-foreground">{recommendationSummary}</div>
                  {state.recommendMeta?.warnings?.length ? (
                    <div className="text-[hsl(var(--warning))] truncate" title={state.recommendMeta.warnings[0]}>
                      风险：{state.recommendMeta.warnings[0]}
                    </div>
                  ) : (
                    <div className="text-muted-foreground/70">建议先生成推荐结果，再上传文档以形成完整报告上下文。</div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">上传时间：{result.uploadedAt ? new Date(result.uploadedAt).toLocaleString() : new Date(result.parsedAt).toLocaleString()}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: result.documentId || null });
                      dispatch({ type: 'SET_LEFT_NAV', payload: 'graph' });
                    }}
                    className="text-[11px] text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    查看图谱 →
                  </button>
                </div>
                {result.totalScore > 0 && (
                  <div className="mt-2 text-xs text-[hsl(var(--success))] flex items-center gap-1">
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full"            />
            <span className="text-[13px]">正在解析 {recentFile}...</span>
          </div>
        </div>
      )}
    </div>
  );
}
