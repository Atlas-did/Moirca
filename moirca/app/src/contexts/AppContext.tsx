import React, { createContext, useContext, useReducer } from 'react';
import type {
  LeftNavTab,
  RightPanelTab,
  AppPhase,
  ChatMessage,
  GraphNode,
  GraphEdge,
  VolunteerRow,
  AHPCandidate,
  AHPComparison,
  UploadResult,
  FilterCondition,
  AgentRole,
} from '@/types';

// ============================================================
// 初始数据
// ============================================================

const INITIAL_AGENTS: AgentRole[] = [
  { id: 'master', name: '主控 Agent', color: '#3b82f6', avatar: '🧠', tagline: '协调全局', quotes: ['你好！我是 Moirca。随便聊聊你的困惑，或者上传成绩单让我看看？'] },
  { id: 'zhang', name: '张雪峰 Agent', color: '#60a5fa', avatar: '👨‍🏫', tagline: '务实派导师', quotes: ['普通家庭选计算机，性价比最高', '城市>学校>专业'] },
  { id: 'parents', name: '爸妈 Agent', color: '#f472b6', avatar: '👨‍👩‍👧', tagline: '传统视角', quotes: ['医生越老越吃香', '公务员铁饭碗'] },
  { id: 'senior', name: '学长 Agent', color: '#34d399', avatar: '🎓', tagline: '一线经验', quotes: ['大厂 996 但钱多', '深大软件工程就业好'] },
  { id: 'workplace', name: '职场 Agent', color: '#fb923c', avatar: '💼', tagline: '职场洞察', quotes: ['35岁危机真实存在', '算法岗门槛高'] },
  { id: 'data', name: '数据 Agent', color: '#818cf8', avatar: '📊', tagline: '数据驱动', quotes: ['2024分数线上涨6分', '位次变化12000→10800'] },
  { id: 'risk', name: '风险 Agent', color: '#f87171', avatar: '⚠️', tagline: '风险预警', quotes: ['该专业3所高校撤销', '官方就业率95% 社区反馈50%'] },
];

const INITIAL_NODES: GraphNode[] = [
  { id: 'cloud', label: '云端数据', type: 'system', x: 400, y: 300, vx: 0, vy: 0, radius: 35, color: '#6b7280', icon: '☁️' },
  { id: 'analyst', label: '大学规划分析师', type: 'role', x: 250, y: 180, vx: 0, vy: 0, radius: 28, color: '#8b5cf6', icon: '👨‍💼' },
  { id: 'bilibili', label: 'B站高考阿婆主', type: 'role', x: 550, y: 180, vx: 0, vy: 0, radius: 28, color: '#8b5cf6', icon: '📺' },
  { id: 'zhangxy', label: '张雪峰老师', type: 'role', x: 400, y: 120, vx: 0, vy: 0, radius: 28, color: '#8b5cf6', icon: '🎤' },
  { id: 'score', label: '你的成绩档案', type: 'user', x: 400, y: 420, vx: 0, vy: 0, radius: 30, color: '#f59e0b', icon: '⭐' },
  { id: 'cs', label: '计算机科学与技术', type: 'major', x: 200, y: 350, vx: 0, vy: 0, radius: 24, color: '#3b82f6', icon: '💻' },
  { id: 'se', label: '软件工程', type: 'major', x: 600, y: 350, vx: 0, vy: 0, radius: 24, color: '#3b82f6', icon: '💻' },
  { id: 'ncu', label: '南昌大学', type: 'school', x: 150, y: 250, vx: 0, vy: 0, radius: 26, color: '#10b981', icon: '🏫' },
  { id: 'szu', label: '深圳大学', type: 'school', x: 650, y: 250, vx: 0, vy: 0, radius: 26, color: '#10b981', icon: '🏫' },
  { id: 'scut', label: '华南理工大学', type: 'school', x: 400, y: 200, vx: 0, vy: 0, radius: 26, color: '#10b981', icon: '🏫' },
  { id: 'ai', label: '人工智能', type: 'major', x: 300, y: 400, vx: 0, vy: 0, radius: 24, color: '#3b82f6', icon: '🤖' },
  { id: 'doctor', label: '临床医学', type: 'major', x: 500, y: 400, vx: 0, vy: 0, radius: 24, color: '#3b82f6', icon: '🩺' },
  { id: 'swe', label: '软件工程师', type: 'career', x: 200, y: 480, vx: 0, vy: 0, radius: 22, color: '#f97316', icon: '💻' },
  { id: 'doctor_career', label: '医生', type: 'career', x: 600, y: 480, vx: 0, vy: 0, radius: 22, color: '#f97316', icon: '👨‍⚕️' },
];

const INITIAL_EDGES: GraphEdge[] = [
  { id: 'e1', source: 'cloud', target: 'analyst', type: 'related' },
  { id: 'e2', source: 'cloud', target: 'bilibili', type: 'related' },
  { id: 'e3', source: 'cloud', target: 'zhangxy', type: 'related' },
  { id: 'e4', source: 'cloud', target: 'score', type: 'related' },
  { id: 'e5', source: 'analyst', target: 'ncu', type: 'related' },
  { id: 'e6', source: 'zhangxy', target: 'cs', type: 'related' },
  { id: 'e7', source: 'score', target: 'cs', type: 'related' },
  { id: 'e8', source: 'score', target: 'ai', type: 'related' },
  { id: 'e9', source: 'ncu', target: 'cs', type: 'offer' },
  { id: 'e10', source: 'szu', target: 'se', type: 'offer' },
  { id: 'e11', source: 'scut', target: 'cs', type: 'offer' },
  { id: 'e12', source: 'scut', target: 'ai', type: 'offer' },
  { id: 'e13', source: 'cs', target: 'swe', type: 'career' },
  { id: 'e14', source: 'se', target: 'swe', type: 'career' },
  { id: 'e15', source: 'doctor', target: 'doctor_career', type: 'career' },
  { id: 'e16', source: 'bilibili', target: 'szu', type: 'related' },
  { id: 'e17', source: 'analyst', target: 'doctor', type: 'related' },
];

const INITIAL_VOLUNTEER_DATA: VolunteerRow[] = [
  { id: 'v1', schoolCode: '8102', schoolName: '南昌大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '508', groupName: '第508组', majorCode: '052', majorName: '计算机科学与技术', planCount: 45, fee: 5550, remark: '不招单色识别不全', admissionTrend: [580, 585, 590], isStarred: false, hasNote: false, noteContent: '' },
  { id: 'v2', schoolCode: '8102', schoolName: '南昌大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '508', groupName: '第508组', majorCode: '053', majorName: '软件工程', planCount: 60, fee: 10000, remark: '高收费', admissionTrend: [575, 580, 588], isStarred: true, hasNote: true, noteContent: '学费较高，注意' },
  { id: 'v3', schoolCode: '8102', schoolName: '南昌大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '509', groupName: '第509组', majorCode: '061', majorName: '人工智能', planCount: 30, fee: 5550, remark: '', admissionTrend: [578, 583, 589], isStarred: false, hasNote: false, noteContent: '' },
  { id: 'v4', schoolCode: '1059', schoolName: '深圳大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '201', groupName: '第201组', majorCode: '001', majorName: '计算机科学与技术', planCount: 50, fee: 6850, remark: '腾班', admissionTrend: [600, 608, 615], isStarred: false, hasNote: false, noteContent: '' },
  { id: 'v5', schoolCode: '1059', schoolName: '深圳大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '201', groupName: '第201组', majorCode: '002', majorName: '软件工程', planCount: 55, fee: 6850, remark: '', admissionTrend: [595, 602, 610], isStarred: true, hasNote: false, noteContent: '' },
  { id: 'v6', schoolCode: '1059', schoolName: '深圳大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '202', groupName: '第202组', majorCode: '015', majorName: '电子信息工程', planCount: 40, fee: 6850, remark: '', admissionTrend: [592, 598, 605], isStarred: false, hasNote: false, noteContent: '' },
  { id: 'v7', schoolCode: '2010', schoolName: '华南理工大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '101', groupName: '第101组', majorCode: '001', majorName: '计算机科学与技术', planCount: 35, fee: 6850, remark: '全英班', admissionTrend: [620, 628, 635], isStarred: false, hasNote: false, noteContent: '' },
  { id: 'v8', schoolCode: '2010', schoolName: '华南理工大学', batch: '本科批', subjectType: '物理类', planType: '普通类', groupCode: '101', groupName: '第101组', majorCode: '002', majorName: '软件工程', planCount: 40, fee: 6850, remark: '', admissionTrend: [615, 622, 630], isStarred: false, hasNote: true, noteContent: '985院校，竞争激烈' },
];

// ============================================================
// State 定义
// ============================================================

export interface DraftPlanEntry {
  type: 'direction' | 'school' | 'major' | 'warning' | 'decision';
  source: string;
  content: string;
}

export interface DraftPlanSummary {
  direction: string;
  schools: string[];
  majors: string[];
  warnings: string[];
  decision_path: string[];
  generated: boolean;
}

export interface SchoolRecoItem {
  school: string;
  avg_score: number;
  min_score: number;
  max_score: number;
  majors: { name: string; min_score: number; min_rank: number | null }[];
  match_count: number;
}

export interface DraftPlan {
  profile: { score: string; province: string; subject: string; rank: string };
  answers: { question: string; answer: string }[];
  entries: DraftPlanEntry[];
  summary: DraftPlanSummary | null;
  schoolRecos: { reach: SchoolRecoItem[]; steady: SchoolRecoItem[]; safety: SchoolRecoItem[] } | null;
}

export interface AppState {
  phase: AppPhase;
  username: string;
  isGuest: boolean;
  leftNav: LeftNavTab;
  rightPanel: RightPanelTab;
  rightPanelCollapsed: boolean;
  rightPanelWidth: number;
  agents: AgentRole[];
  currentAgentId: string;
  messages: ChatMessage[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  selectedNodeId: string | null;
  volunteerData: VolunteerRow[];
  filterCondition: FilterCondition;
  ahpCandidates: AHPCandidate[];
  ahpComparisons: AHPComparison[];
  uploadResults: UploadResult[];
  activeDocumentId: string | null;
  activeReportId: string | null;
  selectedSchoolId: string | null;
  isAgentDebating: boolean;
  versionUpdateProgress: number;
  isUpdating: boolean;
  isChatFullScreen: boolean;
  recommendMeta: {
    profile: Record<string, unknown>;
    tierSummary: Record<string, { count: number; schools: string[] }>;
    warnings: string[];
  } | null;
  customPhase: 'idle' | 'asking' | 'thinking' | 'debating' | 'filtering' | 'confirm';
  matchedSchoolIds: string[];
  homeInput: { score: string; province: string; subject: string; rank?: string } | null;
  userProfile: Record<string, unknown> | null;
  draftPlan: DraftPlan;
}


const initialState: AppState = {
  phase: 'home',
  username: '',
  isGuest: false,
  leftNav: 'recommend',
  rightPanel: 'agentChat',
  rightPanelCollapsed: false,
  rightPanelWidth: 400,
  agents: INITIAL_AGENTS,
  currentAgentId: 'master',
  messages: [
    { id: 'm1', senderId: 'master', senderName: '主控 Agent', content: '你好！我是 Moirca。随便聊聊你的困惑，或者上传成绩单让我看看？', timestamp: Date.now(), isUser: false, agentColor: '#3b82f6' },
  ],
  graphNodes: INITIAL_NODES,
  graphEdges: INITIAL_EDGES,
  selectedNodeId: null,
  volunteerData: INITIAL_VOLUNTEER_DATA,
  filterCondition: {
    schoolName: '',
    majorName: '',
    rankRange: [0, 99999],
    feeRange: [0, 99999],
    subjectType: '全部',
    subjectRequirements: [],
    cities: [],
  },
  ahpCandidates: [
    { id: 'c1', name: '深圳大学', scores: { employment: 85, school: 75, city: 95, interest: 80, family: 70 } },
    { id: 'c2', name: '华南理工大学', scores: { employment: 90, school: 92, city: 80, interest: 75, family: 65 } },
  ],
  ahpComparisons: [],
  uploadResults: [],
  activeDocumentId: null,
  activeReportId: null,
  selectedSchoolId: null,
  isAgentDebating: false,
  versionUpdateProgress: 0,
  isUpdating: false,
  isChatFullScreen: false,
  recommendMeta: null,
  customPhase: 'idle',
  matchedSchoolIds: [],
  homeInput: null,
  userProfile: null,
  draftPlan: {
    profile: { score: '', province: '', subject: '', rank: '' },
    answers: [],
    entries: [],
    summary: null,
    schoolRecos: null,
  },
};

// ============================================================
// Actions
// ============================================================

export type AppAction =
  | { type: 'LOGIN'; payload: { username: string; isGuest: boolean } }
  | { type: 'LOGOUT' }
  | { type: 'GO_HOME' }
  | { type: 'SET_LEFT_NAV'; payload: LeftNavTab }
  | { type: 'SET_RIGHT_PANEL'; payload: RightPanelTab }
  | { type: 'TOGGLE_RIGHT_COLLAPSE' }
  | { type: 'SET_RIGHT_WIDTH'; payload: number }
  | { type: 'SET_CURRENT_AGENT'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE_CONTENT'; payload: { id: string; content: string } }
  | { type: 'SET_SELECTED_NODE'; payload: string | null }
  | { type: 'UPDATE_GRAPH_NODES'; payload: GraphNode[] }
  | { type: 'SET_FILTER'; payload: Partial<FilterCondition> }
  | { type: 'TOGGLE_STAR'; payload: string }
  | { type: 'UPDATE_NOTE'; payload: { id: string; note: string } }
  | { type: 'ADD_AHP_COMPARISON'; payload: AHPComparison }
  | { type: 'ADD_UPLOAD_RESULT'; payload: UploadResult }
  | { type: 'SET_ACTIVE_DOCUMENT'; payload: string | null }
  | { type: 'SET_ACTIVE_REPORT'; payload: string | null }
  | { type: 'SET_SELECTED_SCHOOL'; payload: string | null }
  | { type: 'SET_AGENT_DEBATING'; payload: boolean }
  | { type: 'SET_VERSION_UPDATING'; payload: boolean }
  | { type: 'SET_UPDATE_PROGRESS'; payload: number }
  | { type: 'TOGGLE_CHAT_FULLSCREEN' }
  | { type: 'TOGGLE_RIGHT_COLLAPSED'; payload: boolean }
  | { type: 'LOAD_VOLUNTEER_DATA'; payload: VolunteerRow[] }
  | { type: 'SET_RECOMMEND_META'; payload: { profile: Record<string, unknown>; tierSummary: Record<string, { count: number; schools: string[] }>; warnings: string[] } }
  | { type: 'LOAD_GRAPH_DATA'; payload: { nodes: GraphNode[]; edges: GraphEdge[] } }
  | { type: 'START_CUSTOMIZE' }
  | { type: 'SET_CUSTOM_PHASE'; payload: AppState['customPhase'] }
  | { type: 'SET_MATCHED_SCHOOLS'; payload: string[] }
  | { type: 'START_ANALYSIS'; payload: { score: string; province: string; subject: string; rank?: string } }
  | { type: 'SET_USER_PROFILE'; payload: Record<string, unknown> }
  | { type: 'UPDATE_DRAFT_PLAN'; payload: Partial<DraftPlan> & { appendEntry?: DraftPlanEntry } };

// ============================================================
// Reducer
// ============================================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, phase: 'main', username: action.payload.username, isGuest: action.payload.isGuest };
    case 'LOGOUT':
      return { ...initialState };
    case 'GO_HOME':
      return { ...state, phase: 'home' };
    case 'SET_LEFT_NAV':
      return { ...state, leftNav: action.payload };
    case 'SET_RIGHT_PANEL':
      return { ...state, rightPanel: action.payload, rightPanelCollapsed: false };
    case 'TOGGLE_RIGHT_COLLAPSE':
      return { ...state, rightPanelCollapsed: !state.rightPanelCollapsed };
    case 'TOGGLE_RIGHT_COLLAPSED':
      return { ...state, rightPanelCollapsed: action.payload };
    case 'SET_RIGHT_WIDTH':
      return { ...state, rightPanelWidth: Math.max(250, Math.min(600, action.payload)) };
    case 'SET_CURRENT_AGENT':
      return { ...state, currentAgentId: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE_CONTENT':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, content: action.payload.content } : m
        ),
      };
    case 'SET_SELECTED_NODE':
      return { ...state, selectedNodeId: action.payload };
    case 'UPDATE_GRAPH_NODES':
      return { ...state, graphNodes: action.payload };
    case 'SET_FILTER':
      return { ...state, filterCondition: { ...state.filterCondition, ...action.payload } };
    case 'TOGGLE_STAR': {
      const newData = state.volunteerData.map(row =>
        row.id === action.payload ? { ...row, isStarred: !row.isStarred } : row
      );
      return { ...state, volunteerData: newData };
    }
    case 'UPDATE_NOTE': {
      const newData = state.volunteerData.map(row =>
        row.id === action.payload.id
          ? { ...row, noteContent: action.payload.note, hasNote: !!action.payload.note }
          : row
      );
      return { ...state, volunteerData: newData };
    }
    case 'ADD_AHP_COMPARISON':
      return { ...state, ahpComparisons: [...state.ahpComparisons, action.payload] };
    case 'ADD_UPLOAD_RESULT':
      return { ...state, uploadResults: [...state.uploadResults, action.payload] };
    case 'SET_ACTIVE_DOCUMENT':
      return { ...state, activeDocumentId: action.payload };
    case 'SET_ACTIVE_REPORT':
      return { ...state, activeReportId: action.payload };
    case 'SET_SELECTED_SCHOOL':
      return { ...state, selectedSchoolId: action.payload };
    case 'SET_AGENT_DEBATING':
      return { ...state, isAgentDebating: action.payload };
    case 'SET_VERSION_UPDATING':
      return { ...state, isUpdating: action.payload };
    case 'SET_UPDATE_PROGRESS':
      return { ...state, versionUpdateProgress: action.payload };
    case 'TOGGLE_CHAT_FULLSCREEN':
      return { ...state, isChatFullScreen: !state.isChatFullScreen };
    case 'LOAD_VOLUNTEER_DATA':
      return { ...state, volunteerData: action.payload };
    case 'SET_RECOMMEND_META':
      return { ...state, recommendMeta: action.payload as AppState['recommendMeta'] };
    case 'LOAD_GRAPH_DATA':
      return { ...state, graphNodes: action.payload.nodes, graphEdges: action.payload.edges };
    case 'START_CUSTOMIZE':
      return { ...state, customPhase: 'asking', rightPanel: 'agentChat', rightPanelCollapsed: false };
    case 'SET_CUSTOM_PHASE':
      return { ...state, customPhase: action.payload };
    case 'SET_MATCHED_SCHOOLS':
      return { ...state, matchedSchoolIds: action.payload };
    case 'START_ANALYSIS':
      return { ...state, phase: 'main', username: '用户', isGuest: true, homeInput: action.payload, customPhase: 'asking', rightPanel: 'agentChat', rightPanelCollapsed: false };
    case 'SET_USER_PROFILE':
      return { ...state, userProfile: action.payload };
    case 'UPDATE_DRAFT_PLAN': {
      const { appendEntry, ...rest } = action.payload;
      const next = { ...state.draftPlan, ...rest };
      if (appendEntry) {
        next.entries = [...state.draftPlan.entries, appendEntry];
      }
      return { ...state, draftPlan: next };
    }
    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
