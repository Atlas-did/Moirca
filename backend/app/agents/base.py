"""
Agent 基类

每个 Agent 继承此类，实现 research() 方法。
统一 LLM 调用模式、输出格式、降级策略。

设计原则（继承自 MiroFish oasis_profile_generator）:
  - 并行友好：每个 Agent 独立调用 LLM，无共享状态
  - 降级兜底：LLM 不可用时自动降级为规则评分
  - 输出标准化：统一返回 AgentOutput
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger
from .agent6_fusion_alchemist import AgentOutput, ProfessionFeatures, UserConfig


@dataclass
class AgentContext:
    """Agent 执行上下文"""
    profession: ProfessionFeatures
    user_config: UserConfig
    # 额外数据源
    kkdaxue_posts: List[str] = None    # 框框大学相关帖子
    official_data: Dict = None          # 官方分数线等
    knowledge_graph: any = None         # NetworkX 图引用
    post_times: List[datetime] = None   # 帖子真实发布时间（驱动时效衰减 freshness_date）
    # 证据链(CONTRACT §c,AGENT_05 接入):本任务采集到的证据记录(完整 row 字典),
    # Agent 输出只引用其 evidence_id(evidence_refs 外键),不复制 quote。
    evidence_records: List[Dict[str, Any]] = None

    def __post_init__(self):
        if self.kkdaxue_posts is None:
            self.kkdaxue_posts = []
        if self.official_data is None:
            self.official_data = {}
        if self.post_times is None:
            self.post_times = []
        if self.evidence_records is None:
            self.evidence_records = []

    @property
    def evidence_refs(self) -> List[str]:
        """本上下文全部证据的 evidence_id(保序去重)。"""
        seen, out = set(), []
        for ev in self.evidence_records or []:
            eid = ev.get("evidence_id") if isinstance(ev, dict) else None
            if eid and eid not in seen:
                seen.add(eid)
                out.append(eid)
        return out


def _to_datetime(value: Any) -> Optional[datetime]:
    """宽容解析时间戳(datetime 直通 / ISO8601 字符串),失败返回 None。"""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def latest_real_timestamp(ctx: "AgentContext") -> Optional[datetime]:
    """取上下文中真实数据时间戳的最新值;没有则返回 None(「时间未知」)。

    来源优先级:official_data.fetched_at / official_data.data_times(官方数据采集时刻)
    > post_times(社区帖子真实发布时间)。
    返回值统一转为 naive 本地时间,便于与 datetime.now() 计算衰减。
    绝不返回 datetime.now() 兜底——伪造新鲜是 freshness 修复要消灭的债务。
    """
    candidates: List[datetime] = []
    official = ctx.official_data or {}
    for raw in ([official.get("fetched_at")] if official.get("fetched_at") else []) \
            + list(official.get("data_times") or []):
        dt = _to_datetime(raw)
        if dt is not None:
            candidates.append(dt)
    for t in (ctx.post_times or []):
        dt = _to_datetime(t)
        if dt is not None:
            candidates.append(dt)
    if not candidates:
        return None
    newest = max(candidates)
    if newest.tzinfo is not None:
        newest = newest.astimezone().replace(tzinfo=None)
    return newest


UNKNOWN_TIME_MARK = "【时间未知】"


def freshness_with_marker(ctx: "AgentContext") -> Tuple[Optional[datetime], str]:
    """返回 (真实时间戳或None, notes后缀)。无真实时间戳时显式标注「时间未知」。"""
    ts = latest_real_timestamp(ctx)
    if ts is not None:
        return ts, ""
    return None, f"{UNKNOWN_TIME_MARK}上下文无真实数据时间戳,不伪装新鲜(时效衰减按中性0.5处理)"


class BaseAgent(ABC):
    """
    Agent 基类

    用法:
      agent = Agent1OfficialHunter(llm_client)
      output = agent.research(AgentContext(profession, user_config))

    每个 Agent 子类只需实现:
      - _system_prompt() → str
      - _build_user_prompt(ctx) → str
      - _parse_response(response_json: dict) → AgentOutput
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm = llm_client
        self.logger = get_logger(f'moirca.agent.{self.agent_name}')

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Agent 名称（中文）"""
        ...

    @abstractmethod
    def _system_prompt(self) -> str:
        """系统提示词，定义 Agent 的角色和分析视角"""
        ...

    @abstractmethod
    def _build_user_prompt(self, ctx: AgentContext) -> str:
        """构建用户提示词，注入专业数据和用户上下文"""
        ...

    def research(self, ctx: AgentContext) -> AgentOutput:
        """
        执行调研

        流程:
        1. 尝试 LLM 调用
        2. 失败时降级为规则评分
        3. 返回标准化的 AgentOutput
        """
        if self.llm:
            try:
                output = self._research_with_llm(ctx)
            except Exception as e:
                self.logger.warning(f"LLM调用失败，降级为规则评分: {e}")
                output = self._research_fallback(ctx)
        else:
            output = self._research_fallback(ctx)
        # 证据链传播(CONTRACT §c.2,AGENT_05):输出结构统一携带 evidence_refs 外键。
        # LLM/降级两条路径都不改各自实现,在此处统一注入,保证传播不因降级丢失。
        if not output.evidence_refs:
            output.evidence_refs = list(ctx.evidence_refs)
        return output

    def research_batch(self, contexts: List[AgentContext]) -> List[AgentOutput]:
        """批量调研（串行，后续可改为并行）"""
        return [self.research(ctx) for ctx in contexts]

    def _research_with_llm(self, ctx: AgentContext) -> AgentOutput:
        """LLM 驱动的调研"""
        messages = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": self._build_user_prompt(ctx)},
        ]
        response = self.llm.chat_json(messages, temperature=0.5)
        return self._parse_response(response, ctx)

    @abstractmethod
    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        """解析 LLM 返回的 JSON → AgentOutput"""
        ...

    @abstractmethod
    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        """LLM 不可用时的降级策略（规则评分）"""
        ...

    @staticmethod
    def _category_keywords(category: str) -> List[str]:
        """根据学科门类返回相关关键词"""
        mapping = {
            "工学": ["技术", "工程", "实践", "数理基础"],
            "理学": ["理论", "研究", "实验", "数学"],
            "医学": ["临床", "诊断", "人体", "药理"],
            "管理学": ["组织", "财务", "市场", "决策"],
            "经济学": ["投资", "市场", "金融", "贸易"],
            "法学": ["法律", "诉讼", "合规", "权益"],
            "文学": ["表达", "文化", "创作", "传播"],
            "教育学": ["教学", "心理", "课程", "评估"],
        }
        return mapping.get(category, ["专业", "就业", "发展"])

    @staticmethod
    def _employment_certainty(prof_name: str, category: str) -> float:
        """估算就业确定性 (0-1)"""
        high = ["师范", "临床", "护理", "电气", "会计", "计算机", "软件", "通信"]
        medium = ["机械", "土木", "化工", "金融", "法学", "自动化"]
        if any(kw in prof_name for kw in high):
            return 0.85
        if any(kw in prof_name for kw in medium):
            return 0.70
        if category in ["工学", "医学"]:
            return 0.75
        return 0.55
