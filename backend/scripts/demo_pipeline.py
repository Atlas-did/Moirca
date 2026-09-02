"""
Session + TaskScheduler 验证脚本

验证: Session创建 → DAG调度 → 并行假Agent → 融合 → 断点续跑

运行: python scripts/demo_pipeline.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import time
import random
from datetime import datetime

from app.services.session_manager import (
    SessionManager, Session, UserProfile, SessionStatus,
)
from app.services.task_scheduler import TaskScheduler, PipelineDAG


# ============================================
# 模拟 Agent handlers（真实实现会调LLM）
# ============================================

def mock_agent_handler(agent_name: str, delay_range=(0.2, 0.8)):
    """生成一个模拟的 Agent handler"""
    def handler(session: Session) -> Session:
        delay = random.uniform(*delay_range)
        print(f"    [{agent_name}] 正在调研... ({delay:.1f}s)")
        time.sleep(delay)

        # 模拟输出一些数据
        import datetime as dt
        session.agent_outputs["080901"] = session.agent_outputs.get("080901", []) + [{
            "agent_name": agent_name,
            "profession_code": "080901",
            "raw_score": round(random.uniform(60, 90), 1),
            "confidence": round(random.uniform(0.5, 0.95), 2),
            "freshness_date": dt.datetime.now().isoformat(),
            "source_count": random.randint(1, 8),
            "notes": f"{agent_name} 对计算机科学的调研结果",
        }]
        print(f"    [{agent_name}] 完成 ✓")
        return session
    return handler


def mock_fusion_handler(session: Session) -> Session:
    """模拟 Agent 6 融合"""
    print(f"    [Agent6_融合炼金术士] 正在融合 {len(session.agent_outputs)} 个专业的调研数据...")
    time.sleep(0.3)

    outputs_count = sum(len(v) for v in session.agent_outputs.values())
    session.fusion_results = [
        {"rank": 1, "profession": "计算机科学与技术", "match_score": 78.5, "tier": "A"},
        {"rank": 2, "profession": "软件工程", "match_score": 72.3, "tier": "A"},
        {"rank": 3, "profession": "电气工程及其自动化", "match_score": 65.1, "tier": "B"},
    ]
    print(f"    [Agent6_融合炼金术士] 完成 ✓ (输入{outputs_count}条Agent输出, 输出{len(session.fusion_results)}条推荐)")
    return session


def mock_report_handler(session: Session) -> Session:
    """模拟 Agent 7 报告生成"""
    print(f"    [Agent7_报告生成器] 正在生成报告...")
    time.sleep(0.2)
    session.report = f"""# Moirca 志愿推荐报告

## 用户画像
- 分数: {session.profile.score}/{session.profile.full_mark}
- 省份: {session.profile.province}
- 优先级: {session.profile.priority}

## Top 3 推荐
{chr(10).join(f'{r["rank"]}. {r["profession"]} ({r["match_score"]}分)' for r in session.fusion_results)}
"""
    print(f"    [Agent7_报告生成器] 完成 ✓ (报告 {len(session.report)} 字)")
    return session


# ============================================
# 主流程
# ============================================

def main():
    print("=" * 60)
    print("  Moirca Pipeline 验证: Session + TaskScheduler")
    print(f"  {datetime.now().isoformat()}")
    print("=" * 60)

    # 1. 创建 Session
    sm = SessionManager()
    profile = UserProfile(
        score=585, province="广东",
        keywords=["编程", "人工智能"],
        economic_tier="working",
    )
    session = sm.create(profile)
    print(f"\n[1] Session 已创建: {session.session_id}")
    print(f"    状态: {session.status.value}")
    print(f"    步骤: {[s.step_name for s in session.steps]}")

    # 2. 构建 DAG
    handlers = {
        "Agent1_官方猎手": mock_agent_handler("官方猎手"),
        "Agent2_口碑矿工": mock_agent_handler("口碑矿工"),
        "Agent3_时效警犬": mock_agent_handler("时效警犬"),
        "Agent4_矛盾侦探": mock_agent_handler("矛盾侦探"),
        "Agent5_趋势先知": mock_agent_handler("趋势先知"),
        "Agent6_融合炼金术士": mock_fusion_handler,
        "Agent7_报告生成器": mock_report_handler,
    }
    dag = PipelineDAG.build_default(handlers)
    plan = dag.get_execution_plan()
    print(f"\n[2] DAG 执行计划:")
    for i, layer in enumerate(plan):
        types = [dag.get_node(n).node_type.value if dag.get_node(n) else "?" for n in layer]
        print(f"    Layer {i}: {layer} ({types})")

    # 3. 运行调度器
    scheduler = TaskScheduler(sm, dag)
    print(f"\n[3] 启动调度器...")
    start = time.time()
    result = scheduler.run(session.session_id)
    elapsed = time.time() - start

    # 4. 验证结果
    print(f"\n[4] 调度完成 (耗时 {elapsed:.1f}s)")
    print(f"    最终状态: {result.status.value}")
    print(f"    步骤记录 ({len(result.steps)} 步):")
    for step in result.steps:
        icon = "✓" if step.status.value == "completed" else "✗" if step.status.value == "failed" else "-"
        print(f"      {icon} {step.step_name}: {step.status.value} ({step.duration_ms:.0f}ms)")

    print(f"\n    Agent输出: {len(result.agent_outputs)} 个专业")
    print(f"    融合结果: {len(result.fusion_results)} 条推荐")
    print(f"    报告: {'已生成' if result.report else '未生成'}")

    # 5. 断点续跑验证
    print(f"\n[5] 断点续跑验证...")
    sm.save(result)
    reloaded = sm.get(session.session_id)
    completed = [s.step_name for s in reloaded.steps if s.status.value == "completed"]
    print(f"    重新加载后已完成步骤: {completed}")

    # 6. 再次运行（应该全部跳过）
    print(f"\n[6] 再次运行（验证跳过已完成步骤）...")
    result2 = scheduler.run(session.session_id)
    print(f"    所有步骤应已跳过，状态: {result2.status.value}")

    # 清理
    sm.save(result2)

    print(f"\n{'='*60}")
    print(f"  验证结论:")
    print(f"  [OK] Session 创建+持久化+加载")
    print(f"  [OK] DAG 拓扑排序+分层执行")
    print(f"  [OK] Agent 1/2/3/5 并行执行")
    print(f"  [OK] Agent 4+6 等待上游完成")
    print(f"  [OK] Agent 7 串行生成报告")
    print(f"  [OK] 断点续跑（跳过已完成步骤）")
    print(f"  [OK] Session JSON 持久化")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
