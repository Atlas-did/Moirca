// ============================================================
// Moirca 全局类型定义
// ============================================================

/** 左导航标签 */
export type LeftNavTab = 'chat' | 'graph' | 'volunteer' | 'agent' | 'recommend' | 'compare' | 'history' | 'upload' | 'settings' | 'portal' | 'contribute';

/** 右窗功能标签 */
export type RightPanelTab = 'agentChat' | 'chart' | 'ahp' | 'upload' | 'research' | 'guided' | 'report' | 'history' | 'interview' | 'logs';

/** 应用阶段 */
export type AppPhase = 'login' | 'home' | 'main';

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

// ============================================================
// 填报入口导航 (Portal Sites)
// ============================================================

/** 入口链接 */
export interface PortalLink {
  label: string;
  url: string;
  description: string;
}

/** 省级考试院 */
export interface AuthorityInfo {
  name: string;
  url: string;
}

/** 省份入口集合 */
export interface ProvincePortals {
  application: PortalLink | null;
  score_query: PortalLink | null;
  admission_query: PortalLink | null;
}

/** 单个省份的填报入口数据 */
export interface ProvinceSite {
  code: string;
  name: string;
  authority: AuthorityInfo;
  portals: ProvincePortals;
  notes: string;
  script_available?: boolean;
  script_label?: string;
}

/** 区域分组 */
export interface RegionGroup {
  id: string;
  name: string;
  provinces: ProvinceSite[];
}

/** 国家平台 */
export interface NationalPlatform {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
}

/** 全量填报入口数据 */
export interface PortalSitesData {
  version: string;
  updated_at: string;
  description: string;
  regions: RegionGroup[];
  national_platforms: NationalPlatform[];
  tips: string[];
}

// ============================================================
// 数据贡献 (Contribute) — P2
// ============================================================

/** 贡献数据提交 */
export interface ContributePayload {
  province: string;
  volunteers: Array<{
    school_code: string;
    school_name?: string;
    group_code: string;
    major_codes: string[];
    major_names?: string[];
    adjustment?: boolean;
    tier_label?: string;
    row?: number;
  }>;
  user_profile?: {
    score?: number;
    subject_type?: string;
    rank?: number;
  };
  exported_at?: string;
  anonymous_id?: string;
}

/** 贡献提交响应 */
export interface ContributeResponse {
  accepted: number;
  rejected: number;
  verified: number;
  contribution_ids: number[];
  anonymous_id: string;
  message: string;
  cross_check_summary?: string;
}

/** 贡献统计 */
export interface ContributeStats {
  total: number;
  verified: number;
  verification_rate: number;
  by_province: Record<string, number>;
}

/** 贡献历史条目 */
export interface ContributeHistoryItem {
  id: number;
  province: string;
  year: number;
  school: string;
  first_major?: string;
  verified: boolean;
  score?: number;
  created_at: string;
}
