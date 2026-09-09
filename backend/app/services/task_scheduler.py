"""
DAG 任务调度器

核心理念（继承自 SemaClaw DAG Teams + MiroFish IPC）：
  1. 将 Moirca 管线编译为有向无环图（DAG）
  2. 按拓扑序执行：无依赖的 Agent 并行，有依赖的串行等待
  3. 文件级 IPC（继承 MiroFish 模式）：Agent 间通过 Session JSON 通信
  4. 断点续跑：每步完成后持久化，恢复时跳过已完成步骤

管线 DAG:
                        ┌─────────────────┐
                        │  decision_tree   │ (已完成，P0)
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │           │           │           │
              ▼           ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │Agent1    │ │Agent2    │ │Agent3    │ │Agent5    │  并行层
    │官方猎手   │ │口碑矿工   │ │时效警犬   │ │趋势先知   │
    └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
         │           │           │           │
         └───────────┼───────────┼───────────┘
                     │           │
                     ▼           ▼
              ┌──────────┐ ┌──────────┐
              │Agent4    │ │Agent6    │  Agent4可独立；Agent6必须等1/2/3/5全部完成
              │矛盾侦探   │ │融合炼金   │
              └────┬─────┘ └────┬─────┘
                   │           │
                   └─────┬─────┘
                         ▼
                  ┌──────────┐
                  │Agent7    │  报告生成器
                  │报告生成   │
                  └──────────┘

调度策略:
  - 并行层: Agent 1/2/3/5 同时启动（无相互依赖）
  - 等待层: Agent 4 可提前启（只需部分Agent完成），Agent 6 必须等 1/2/3/5 全完成
  - 串行层: Agent 7 必须等 Agent 6 完成
"""
from __future__ import annotations

import os
import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from ..utils.logger import get_logger
from .session_manager import Session, SessionManager, SessionStatus, StepStatus

logger = get_logger('moirca.scheduler')


# ============================================
# 枚举
# ============================================

class NodeType(str, Enum):
    PARALLEL = "parallel"    # 与该层其他节点并行执行
    SEQUENTIAL = "sequential"  # 等待上游全部完成后执行
    CONDITIONAL = "conditional"  # 等待部分上游完成即可


class SchedulerStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================
# 数据类
# ============================================

@dataclass
class TaskNode:
    """DAG 中的一个任务节点"""
    name: str                          # 任务名（如 "Agent1_官方猎手"）
    node_type: NodeType                # 执行策略
    handler: Callable                  # 执行函数 handler(session: Session) -> Session
    depends_on: List[str] = field(default_factory=list)  # 依赖的上游节点
    max_retries: int = 2
    timeout_seconds: int = 300
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __hash__(self):
        return hash(self.name)


@dataclass
class PipelineState:
    """调度器状态（可持久化，断点续跑）"""
    nodes: Dict[str, str] = field(default_factory=dict)  # {name: StepStatus}
    started_at: str = ""
    updated_at: str = ""
    errors: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "nodes": self.nodes,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "errors": self.errors,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PipelineState":
        return cls(
            nodes=data.get("nodes", {}),
            started_at=data.get("started_at", ""),
            updated_at=data.get("updated_at", ""),
            errors=data.get("errors", {}),
        )


# ============================================
# DAG 编译器
# ============================================

class PipelineDAG:
    """
    Moirca 管线的 DAG 定义

    编译为拓扑排序的执行计划:
      Layer 0: decision_tree (已完成)
      Layer 1: [Agent1, Agent2, Agent3, Agent5] 并行
      Layer 2: [Agent4] (等1/2完成即可) + [Agent6] (等1/2/3/5全完成)
      Layer 3: [Agent7] (等6完成)
    """

    @classmethod
    def build_default(cls, handlers: Dict[str, Callable]) -> "PipelineDAG":
        """
        构建默认 Moirca 管线

        Args:
            handlers: {"Agent1_官方猎手": callable, "Agent2_口碑矿工": callable, ...}
        """
        nodes = [
            TaskNode(
                name="Agent1_官方猎手",
                node_type=NodeType.PARALLEL,
                handler=handlers.get("Agent1_官方猎手"),
                depends_on=["decision_tree"],
                metadata={"agent": "官方猎手", "description": "爬取官方数据（阳光高考+省考试院）"},
            ),
            TaskNode(
                name="Agent2_口碑矿工",
                node_type=NodeType.PARALLEL,
                handler=handlers.get("Agent2_口碑矿工"),
                depends_on=["decision_tree"],
                metadata={"agent": "口碑矿工", "description": "采集知乎/B站口碑+情感分析"},
            ),
            TaskNode(
                name="Agent3_时效警犬",
                node_type=NodeType.PARALLEL,
                handler=handlers.get("Agent3_时效警犬"),
                depends_on=["decision_tree"],
                metadata={"agent": "时效警犬", "description": "专业撤销/新增/改名时效监控"},
            ),
            TaskNode(
                name="Agent5_趋势先知",
                node_type=NodeType.PARALLEL,
                handler=handlers.get("Agent5_趋势先知"),
                depends_on=["decision_tree"],
                metadata={"agent": "趋势先知", "description": "就业倒推+政策趋势预测"},
            ),
            TaskNode(
                name="Agent4_矛盾侦探",
                node_type=NodeType.CONDITIONAL,
                handler=handlers.get("Agent4_矛盾侦探"),
                depends_on=["Agent1_官方猎手", "Agent2_口碑矿工"],
                max_retries=1,
                metadata={"agent": "矛盾侦探", "description": "官方vs口碑数据交叉验证"},
            ),
            TaskNode(
                name="Agent6_融合炼金术士",
                node_type=NodeType.SEQUENTIAL,
                handler=handlers.get("Agent6_融合炼金术士"),
                depends_on=["Agent1_官方猎手", "Agent2_口碑矿工",
                           "Agent3_时效警犬", "Agent5_趋势先知"],
                metadata={"agent": "融合炼金术士", "description": "五路融合+四大修正因子"},
            ),
            TaskNode(
                name="Agent7_报告生成器",
                node_type=NodeType.SEQUENTIAL,
                handler=handlers.get("Agent7_报告生成器"),
                depends_on=["Agent6_融合炼金术士"],
                max_retries=1,
                timeout_seconds=600,
                metadata={"agent": "报告生成器", "description": "Markdown报告+图表+灵魂拷问+风险提示"},
            ),
        ]
        return cls(nodes)

    def __init__(self, nodes: List[TaskNode]):
        self.nodes: Dict[str, TaskNode] = {n.name: n for n in nodes}
        self._validate()

    def _validate(self):
        """验证DAG无环、无缺失依赖"""
        all_names = set(self.nodes.keys())
        all_names.add("decision_tree")  # 隐式入口
        for node in self.nodes.values():
            for dep in node.depends_on:
                if dep not in all_names:
                    raise ValueError(f"节点 '{node.name}' 依赖不存在的节点 '{dep}'")
        # 简单环检测：拓扑排序
        self._topo_sort()

    def _topo_sort(self) -> List[List[str]]:
        """拓扑排序，返回分层列表 [[layer0_nodes], [layer1_nodes], ...]"""
        in_degree = {name: 0 for name in self.nodes}
        for node in self.nodes.values():
            for dep in node.depends_on:
                if dep in in_degree:  # 跳过隐式入口
                    in_degree[node.name] += 1

        layers = []
        remaining = set(self.nodes.keys())

        while remaining:
            current_layer = [name for name in remaining if in_degree[name] == 0]
            if not current_layer:
                # 剩余节点都有入度 → 存在环
                raise ValueError(f"DAG存在环: {remaining}")
            layers.append(current_layer)
            for name in current_layer:
                remaining.remove(name)
                # 减少下游节点的入度
                for other in remaining:
                    if name in self.nodes[other].depends_on:
                        in_degree[other] -= 1

        return layers

    def get_execution_plan(self) -> List[List[str]]:
        """获取执行计划：每层可并行的节点列表"""
        return self._topo_sort()

    def get_node(self, name: str) -> Optional[TaskNode]:
        return self.nodes.get(name)


# ============================================
# 任务调度器
# ============================================

class TaskScheduler:
    """
    DAG 任务调度器

    用法:
      scheduler = TaskScheduler(session_manager, dag)
      scheduler.run(session_id)
    """

    def __init__(
        self,
        session_manager: SessionManager,
        dag: PipelineDAG,
        max_workers: int = 5,
        storage_dir: str = None,
    ):
        self.session_manager = session_manager
        self.dag = dag
        self.max_workers = max_workers
        self.status = SchedulerStatus.IDLE

        if storage_dir is None:
            storage_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "data", "pipelines"
            )
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 线程安全
        self._lock = threading.Lock()
        self._progress_queue = queue.Queue()

    # -------------------------------------------------------
    # 公共接口
    # -------------------------------------------------------

    def run(self, session_id: str) -> Session:
        """
        启动完整管线

        流程:
        1. 加载 Session
        2. 为每个未完成的节点创建 TaskNode
        3. 按拓扑序分层执行
        4. 每步完成后保存 Session（断点续跑）
        """
        session = self.session_manager.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} 不存在")

        self.status = SchedulerStatus.RUNNING
        execution_plan = self.dag.get_execution_plan()

        # 收集已完成的步骤
        completed_steps = {
            r.step_name for r in session.steps
            if r.status == StepStatus.COMPLETED
        }

        logger.info(f"调度器启动 | session={session_id} | "
                     f"已完成={completed_steps} | 计划={execution_plan}")

        for layer_idx, layer_nodes in enumerate(execution_plan):
            if self.status == SchedulerStatus.PAUSED:
                break

            # 过滤已完成的节点
            pending = [n for n in layer_nodes if n not in completed_steps]
            if not pending:
                logger.info(f"Layer {layer_idx}: 全部已完成，跳过")
                continue

            logger.info(f"Layer {layer_idx}: 执行 {len(pending)} 个节点")

            # 并行层: ThreadPoolExecutor
            if all(
                self.dag.get_node(n).node_type == NodeType.PARALLEL
                for n in pending if self.dag.get_node(n)
            ):
                session = self._execute_parallel(session, pending)
            else:
                # 串行/条件层: 逐个执行
                session = self._execute_sequential(session, pending)

            if session.status == SessionStatus.FAILED:
                self.status = SchedulerStatus.FAILED
                break

        if session.status != SessionStatus.FAILED:
            self.status = SchedulerStatus.COMPLETED
        self.session_manager.save(session)
        logger.info(f"调度器完成 | session={session_id} | status={session.status.value}")
        return session

    def pause(self):
        """暂停调度"""
        self.status = SchedulerStatus.PAUSED
        logger.info("调度器已暂停")

    def resume(self, session_id: str) -> Session:
        """恢复调度（跳已完成步骤）"""
        return self.run(session_id)

    def get_progress(self) -> List[dict]:
        """获取进度（非阻塞）"""
        items = []
        while not self._progress_queue.empty():
            try:
                items.append(self._progress_queue.get_nowait())
            except queue.Empty:
                break
        return items

    # -------------------------------------------------------
    # 执行引擎
    # -------------------------------------------------------

    def _execute_parallel(self, session: Session, node_names: List[str]) -> Session:
        """并行执行一组节点"""
        futures = {}
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(node_names))) as executor:
            for name in node_names:
                node = self.dag.get_node(name)
                if not node or not node.handler:
                    session = self._skip_node(session, name, "无handler")
                    continue
                # 捕获当前 session 的快照传给线程
                futures[executor.submit(
                    self._execute_node, node, deep_copy_session(session)
                )] = name

            for future in as_completed(futures):
                name = futures[future]
                try:
                    result_session = future.result(timeout=300)
                    # 合并结果到主 session
                    with self._lock:
                        session = self._merge_results(session, result_session, name)
                    self._progress_queue.put({"node": name, "status": "completed"})
                except Exception as e:
                    logger.error(f"节点 {name} 执行失败: {e}")
                    session.fail_step(name, str(e))
                    self._progress_queue.put({"node": name, "status": "failed", "error": str(e)})

        return session

    def _execute_sequential(self, session: Session, node_names: List[str]) -> Session:
        """串行执行节点列表"""
        for name in node_names:
            node = self.dag.get_node(name)
            if not node or not node.handler:
                session = self._skip_node(session, name, "无handler")
                continue
            try:
                result = self._execute_node(node, deep_copy_session(session))
                session = self._merge_results(session, result, name)
                self._progress_queue.put({"node": name, "status": "completed"})
            except Exception as e:
                logger.error(f"节点 {name} 执行失败: {e}")
                session.fail_step(name, str(e))
                self._progress_queue.put({"node": name, "status": "failed", "error": str(e)})
        return session

    def _execute_node(self, node: TaskNode, session: Session) -> Session:
        """执行单个节点，带重试"""
        for attempt in range(node.max_retries + 1):
            try:
                session.start_step(node.name)
                result = node.handler(session)
                result.complete_step(
                    node.name,
                    output_summary=f"{node.name} 完成",
                    metadata=node.metadata,
                )
                self.session_manager.save(result)
                return result
            except Exception as e:
                if attempt == node.max_retries:
                    raise
                logger.warning(f"{node.name} 第{attempt+1}次重试: {e}")
                time.sleep(2 ** attempt)

    def _skip_node(self, session: Session, name: str, reason: str) -> Session:
        session.start_step(name)
        session.steps[-1].status = StepStatus.SKIPPED
        session.steps[-1].output_summary = reason
        return session

    def _merge_results(self, main: Session, result: Session, node_name: str) -> Session:
        """合并子线程的 session 结果到主 session"""
        # 合并 agent_outputs
        for key, value in result.agent_outputs.items():
            if key not in main.agent_outputs:
                main.agent_outputs[key] = value

        # 合并 fusion_results
        if result.fusion_results:
            main.fusion_results = result.fusion_results

        # 合并 report
        if result.report:
            main.report = result.report
            main.report_metadata = result.report_metadata

        # 合并步骤记录
        for step in result.steps:
            if step.step_name not in {s.step_name for s in main.steps}:
                main.steps.append(step)

        main.status = main._derive_status()
        return main


def deep_copy_session(session: Session) -> Session:
    """深拷贝 Session（线程安全）"""
    return SessionManager()._from_dict(session.to_dict())
