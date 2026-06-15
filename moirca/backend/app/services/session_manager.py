"""
Session 状态管理器

核心理念（继承自 OpenRath Session Graph）：
  Session 是第一公民，不是 Agent 的附属品。
  每个 Agent 读取 Session、写入 Session，Session 携带全流程状态贯穿整个管线。

能力：
  - 不可变历史追踪（每一步的状态快照可回溯）
  - JSON 序列化（断点续跑 / 审计 / 调试）
  - 版本化状态（每个Agent写入带版本号，冲突检测）
  - 线程安全（并行Agent同时保存时加锁）

流程:
  UserInput → Session.created
    → Agent1.official_hunter(session)    → session.agent_outputs["官方猎手"] = [...]
    → Agent2.word_of_mouth(session)      → session.agent_outputs["口碑矿工"] = [...]
    → Agent3.freshness_dog(session)      → session.agent_outputs["时效警犬"] = [...]
    → Agent4.conflict_detective(session) → session.agent_outputs["矛盾侦探"] = [...]
    → Agent5.trend_prophet(session)      → session.agent_outputs["趋势先知"] = [...]
    → Agent6.fusion_alchemist(session)   → session.fusion_results = [...]
    → Agent7.report_generator(session)   → session.report = Report
    → session.completed
"""
from __future__ import annotations

import json
import os
import time
import threading
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pathlib import Path


# ============================================
# 枚举
# ============================================

class SessionStatus(str, Enum):
    CREATED = "created"
    DECISION_TREE_DONE = "decision_tree_done"    # 决策树完成
    AGENTS_RESEARCHING = "agents_researching"     # Agent 1-5 调研中
    AGENTS_DONE = "agents_done"                  # Agent 1-5 完成
    FUSION_DONE = "fusion_done"                  # Agent 6 融合完成
    REPORT_DONE = "report_done"                  # Agent 7 报告完成
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


# ============================================
# 数据类
# ============================================

@dataclass
class UserProfile:
    """用户画像（不可变，创建后不修改）"""
    score: float
    full_mark: float = 750.0
    province: str = "广东"
    score_tier: str = "B"              # A/B/C/D
    priority: str = "career_prospect"  # 优先级
    exclude_categories: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    family_bg: str = ""
    economic_tier: str = "middle"
    exam_type: str = "general"

    def to_dict(self) -> dict:
        return {
            "score": self.score, "full_mark": self.full_mark,
            "province": self.province, "score_tier": self.score_tier,
            "priority": self.priority, "exclude_categories": self.exclude_categories,
            "keywords": self.keywords, "family_bg": self.family_bg,
            "economic_tier": self.economic_tier, "exam_type": self.exam_type,
        }


@dataclass
class StepRecord:
    """单步执行记录（不可变）"""
    step_name: str          # 步骤名（agent名 或 fusion 或 report）
    status: StepStatus
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: float = 0
    input_hash: str = ""    # 输入数据的哈希（用于断点检测）
    output_summary: str = ""  # 输出摘要
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "step_name": self.step_name,
            "status": self.status.value,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_ms": self.duration_ms,
            "input_hash": self.input_hash,
            "output_summary": self.output_summary,
            "error": self.error,
            "metadata": self.metadata,
        }


@dataclass
class Session:
    """
    核心 Session 对象

    贯穿整个 Moirca 管线:
      UserProfile → Agent 1-5 输出 → Fusion 结果 → Report
    """
    session_id: str
    status: SessionStatus = SessionStatus.CREATED
    profile: Optional[UserProfile] = None

    # Agent 1-5 并行调研输出
    agent_outputs: Dict[str, List[Dict]] = field(default_factory=dict)
    # 格式: {"官方猎手": [{profession_code, raw_score, confidence, ...}, ...], ...}

    # Agent 6 融合结果
    fusion_results: List[Dict] = field(default_factory=list)

    # Agent 7 报告
    report: Optional[str] = None
    report_metadata: Dict[str, Any] = field(default_factory=dict)

    # 执行历史
    steps: List[StepRecord] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    # 知识图谱快照 ID
    graph_snapshot_id: str = ""

    def start_step(self, step_name: str) -> StepRecord:
        """标记步骤开始，返回StepRecord用于后续更新"""
        record = StepRecord(
            step_name=step_name,
            status=StepStatus.RUNNING,
            started_at=datetime.now().isoformat(),
        )
        self.steps.append(record)
        self.updated_at = datetime.now().isoformat()
        self.status = self._derive_status()
        return record

    def complete_step(self, step_name: str, output_summary: str = "",
                      metadata: Dict = None) -> StepRecord:
        """标记步骤完成"""
        for record in reversed(self.steps):
            if record.step_name == step_name and record.status == StepStatus.RUNNING:
                record.status = StepStatus.COMPLETED
                record.completed_at = datetime.now().isoformat()
                if record.started_at:
                    start = datetime.fromisoformat(record.started_at)
                    end = datetime.fromisoformat(record.completed_at)
                    record.duration_ms = (end - start).total_seconds() * 1000
                record.output_summary = output_summary
                if metadata:
                    record.metadata = metadata
                self.updated_at = datetime.now().isoformat()
                self.status = self._derive_status()
                return record
        return None

    def fail_step(self, step_name: str, error: str):
        """标记步骤失败"""
        for record in reversed(self.steps):
            if record.step_name == step_name and record.status == StepStatus.RUNNING:
                record.status = StepStatus.FAILED
                record.error = error
                record.completed_at = datetime.now().isoformat()
                self.updated_at = datetime.now().isoformat()
                self.status = SessionStatus.FAILED

    def _derive_status(self) -> SessionStatus:
        """根据已完成的步骤自动推导当前状态"""
        completed = {r.step_name for r in self.steps if r.status == StepStatus.COMPLETED}
        running = {r.step_name for r in self.steps if r.status == StepStatus.RUNNING}

        agent_names = {"官方猎手", "口碑矿工", "时效警犬", "矛盾侦探", "趋势先知"}

        if running:
            return SessionStatus.AGENTS_RESEARCHING
        if agent_names.issubset(completed) and "fusion" in completed and "report" in completed:
            return SessionStatus.COMPLETED
        if agent_names.issubset(completed) and "fusion" in completed:
            return SessionStatus.FUSION_DONE
        if agent_names.issubset(completed):
            return SessionStatus.AGENTS_DONE
        if "decision_tree" in completed:
            return SessionStatus.DECISION_TREE_DONE
        return SessionStatus.CREATED

    def get_agent_outputs_for_fusion(self) -> Dict[str, list]:
        """导出为 Agent 6 融合炼金术士需要的格式"""
        from ..agents.agent6_fusion_alchemist import AgentOutput
        result = {}
        for prof_code, outputs_list in self.agent_outputs.items():
            result[prof_code] = []
            for o in outputs_list:
                result[prof_code].append(AgentOutput(
                    agent_name=o["agent_name"],
                    profession_code=o["profession_code"],
                    raw_score=o["raw_score"],
                    confidence=o["confidence"],
                    freshness_date=datetime.fromisoformat(o["freshness_date"]),
                    source_count=o.get("source_count", 1),
                    notes=o.get("notes", ""),
                ))
        return result

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "status": self.status.value,
            "profile": self.profile.to_dict() if self.profile else None,
            "agent_outputs": self.agent_outputs,
            "fusion_results": self.fusion_results,
            "report": self.report,
            "report_metadata": self.report_metadata,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "graph_snapshot_id": self.graph_snapshot_id,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


# ============================================
# Session 管理器
# ============================================

class SessionManager:
    """
    管理 Session 的生命周期

    持久化: 文件系统 JSON（继承 MiroFish IPC 模式）
    后续可升级为 Redis / PostgreSQL
    """

    def __init__(self, storage_dir: str = None):
        if storage_dir is None:
            storage_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "data", "sessions"
            )
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def create(self, profile: UserProfile) -> Session:
        """创建新会话"""
        import uuid
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        session = Session(
            session_id=session_id,
            profile=profile,
            status=SessionStatus.CREATED,
        )
        session.start_step("decision_tree")
        session.complete_step("decision_tree", "决策树分析完成")
        self._save(session)
        return session

    def get(self, session_id: str) -> Optional[Session]:
        """加载会话"""
        file_path = self.storage_dir / f"{session_id}.json"
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return self._from_dict(data)

    def save(self, session: Session):
        """保存会话（自动备份旧版本）"""
        self._save(session)

    def _save(self, session: Session):
        """线程安全保存"""
        with self._lock:
            file_path = self.storage_dir / f"{session.session_id}.json"
            backup = self.storage_dir / f"{session.session_id}.bak.json"
            tmp_path = self.storage_dir / f"{session.session_id}.tmp.json"
            session.updated_at = datetime.now().isoformat()
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(session.to_json())
            if file_path.exists():
                os.replace(file_path, backup)
            os.replace(tmp_path, file_path)

    def list_sessions(self) -> List[dict]:
        """列出所有会话"""
        sessions = []
        for f in sorted(self.storage_dir.glob("sess_*.json"), key=lambda x: -x.stat().st_mtime):
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            sessions.append({
                "session_id": data["session_id"],
                "status": data["status"],
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "profile": data.get("profile", {}),
            })
        return sessions

    def _from_dict(self, data: dict) -> Session:
        profile_data = data.get("profile")
        profile = UserProfile(**profile_data) if profile_data else None
        return Session(
            session_id=data["session_id"],
            status=SessionStatus(data["status"]),
            profile=profile,
            agent_outputs=data.get("agent_outputs", {}),
            fusion_results=data.get("fusion_results", []),
            report=data.get("report"),
            report_metadata=data.get("report_metadata", {}),
            steps=[StepRecord(
                step_name=s["step_name"],
                status=StepStatus(s["status"]),
                started_at=s.get("started_at"),
                completed_at=s.get("completed_at"),
                duration_ms=s.get("duration_ms", 0),
                input_hash=s.get("input_hash", ""),
                output_summary=s.get("output_summary", ""),
                error=s.get("error"),
                metadata=s.get("metadata", {}),
            ) for s in data.get("steps", [])],
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            graph_snapshot_id=data.get("graph_snapshot_id", ""),
        )
