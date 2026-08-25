// ============================================================
// Moirca 全局类型定义
// ============================================================

/** 左导航标签 */
export type LeftNavTab = 'chat' | 'resources' | 'graph' | 'agent' | 'volunteer' | 'history' | 'report' | 'compare' | 'upload';

/** 右窗功能标签 */
export type RightPanelTab = 'agentChat' | 'chart' | 'ahp' | 'upload' | 'research' | 'history' | 'guided' | 'report' | 'interview' | 'logs';

/** 应用阶段 */
export type AppPhase = 'login' | 'main';

/** Agent 角色 */
export interface AgentRole {
  id: string;
  name: string;
  color: string;
  avatar: string;
  tagline: string;
  quotes: string[];
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  isUser: boolean;
  agentColor?: string;
}

/** 知识图谱节点 */
export interface GraphNode {
  id: string;
  label: string;
  type: 'major' | 'school' | 'career' | 'agent' | 'system' | 'user' | 'role';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  icon: string;
  data?: Record<string, unknown>;
}

/** 知识图谱边 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'offer' | 'career' | 'related';
  label?: string;
}

/** 志愿表行数据 */
export interface VolunteerRow {
  id: string;
  schoolCode: string;
  schoolName: string;
  batch: string;
  subjectType: string;
  planType: string;
  groupCode: string;
  groupName: string;
  majorCode: string;
  majorName: string;
  planCount: number;
  fee: number;
  remark: string;
  admissionTrend: number[];
  isStarred: boolean;
  hasNote: boolean;
  noteContent: string;
}

/** AHP 候选对象 */
export interface AHPCandidate {
  id: string;
  name: string;
  scores: Record<string, number>;
}

/** AHP 维度 */
export interface AHPDimension {
  id: string;
  name: string;
  weight: number;
}

/** AHP 比较对 */
export interface AHPComparison {
  candidateA: string;
  candidateB: string;
  dimension: string;
  value: number; // -9 to +9
}

/** 筛选条件 */
export interface FilterCondition {
  schoolName: string;
  majorName: string;
  rankRange: [number, number];
  feeRange: [number, number];
  subjectType: string;
  subjectRequirements: string[];
  cities: string[];
}

/** 文件上传结果 */
export interface UploadResult {
  fileName: string;
  totalScore: number;
  subjectType: string;
  rank: number;
  subjects: string[];
  parsedAt: number;
  uploadedAt?: string;
  preview?: string;
  documentId?: string;
  graphId?: string;
  graphMode?: string;
  graphNodeCount?: number;
  graphEdgeCount?: number;
}

/** 深度研究数据 */
export interface ResearchData {
  schoolId: string;
  schoolName: string;
  scorePrediction: {
    range: [number, number];
    confidence: number;
    history: number[];
  };
  employment: {
    rate: number;
    avgSalary: number;
    topCompanies: string[];
  };
  stability: {
    score: number;
    revokedHistory: number;
    newHistory: number;
  };
  cityValue: {
    gdpGrowth: number;
    industryLayout: string[];
    score: number;
  };
}

/** 术语解释结果 */
export interface TermExplanation {
  term: string;
  simpleExplanation: string;
  subjectTree: { level: string; name: string }[];
  employmentMap: { destination: string; salaryRange: string }[];
  graphNodeId?: string;
  agentOpinions: string[];
}
