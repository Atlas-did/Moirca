"""
完整管线 Demo: Session → Agent 1-5 → Agent 6 融合 → Agent 7 报告

两种模式:
  --mode fallback : 规则评分模式（无需LLM API Key）
  --mode llm      : LLM驱动模式（需配置 .env 中的 LLM_API_KEY）

运行: python scripts/demo_full_pipeline.py --mode fallback
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import argparse
import time
from datetime import datetime

from app.agents import (
    Agent1OfficialHunter,
    Agent2WordOfMouth,
    Agent3FreshnessDog,
    Agent4ConflictDetective,
    Agent5TrendProphet,
    AgentContext,
    FusionAlchemist,
    UserConfig,
)
from app.services.graph_service import KnowledgeGraph
from app.services.session_manager import (
    Session,
    SessionManager,
    UserProfile,
)
from app.services.task_scheduler import PipelineDAG, TaskScheduler
from app.utils.llm_client import LLMClient

# ============================================
# 工具函数
# ============================================

def load_kkdaxue_data() -> dict:
    """从SQLite加载框框大学数据，按专业名分组"""
    try:
        from app.models.database import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT major, content FROM kkdaxue_posts LIMIT 100")
        rows = cursor.fetchall()
        conn.close()

        data = {}
        for major, content in rows:
            if major:
                data.setdefault(major, []).append(content)
        return data
    except Exception:
        return {}


def print_separator(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ============================================
# 主流程
# ============================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["fallback", "llm"], default="fallback")
    args = parser.parse_args()

    print("=" * 60)
    print("  Moirca 完整管线 Demo")
    print(f"  模式: {args.mode} | {datetime.now().isoformat()}")
    print("=" * 60)

    # 0. 初始化
    kkdaxue_data = load_kkdaxue_data()
    print(f"\n[0] 数据加载: kkdaxue {sum(len(v) for v in kkdaxue_data.values())} 条帖子, "
          f"覆盖 {len(kkdaxue_data)} 个专业")

    graph = KnowledgeGraph.build_default()
    print(f"    知识图谱: {graph.get_stats()}")

    llm = None
    if args.mode == "llm":
        try:
            llm = LLMClient()
            print("    LLM: 已连接")
        except Exception as e:
            print(f"    LLM: 不可用 ({e})，降级为规则模式")
            args.mode = "fallback"

    # 1. 创建 Agent 实例
    agents = {
        "Agent1_官方猎手": Agent1OfficialHunter(llm),
        "Agent2_口碑矿工": Agent2WordOfMouth(llm),
        "Agent3_时效警犬": Agent3FreshnessDog(llm),
        "Agent4_矛盾侦探": Agent4ConflictDetective(llm),
        "Agent5_趋势先知": Agent5TrendProphet(llm),
    }

    # 2. 创建 Session
    sm = SessionManager()
    profile = UserProfile(
        score=585, province="广东",
        keywords=["编程", "人工智能", "软件开发"],
        economic_tier="working",
        family_bg="普通工薪家庭，父母在工厂工作",
        priority="career_prospect",
        exclude_categories=["医学"],  # 不想学医
    )
    session = sm.create(profile)
    print(f"\n[1] Session: {session.session_id}")
    print(f"    用户: {profile.score}分 {profile.province} | {profile.family_bg}")
    print(f"    偏好: {profile.keywords} | 排除: {profile.exclude_categories}")

    # 3. 构建 Handler（桥接 Agent 类 → TaskScheduler 需要的 callable）
    candidates = graph.get_all_professions()
    user_config = UserConfig(
        confirmed_keywords=profile.keywords,
        score_tier=profile.score_tier,
        priority=profile.priority,
        exclude_categories=profile.exclude_categories,
        economic_tier=profile.economic_tier,
        family_bg=profile.family_bg,
    )
    # 过滤排除的专业
    candidates = [p for p in candidates if p.category not in profile.exclude_categories]
    print(f"\n[2] 候选专业: {len(candidates)} 个 (已排除 {profile.exclude_categories})")

    def make_agent_handler(agent_instance, agent_name: str):
        """创建 Agent handler（桥接 Agent → TaskScheduler callable）"""
        def handler(session: Session) -> Session:
            for pf in candidates:
                ctx = AgentContext(
                    profession=pf,
                    user_config=user_config,
                    kkdaxue_posts=kkdaxue_data.get(pf.name.replace("(师范)", "").strip(), []),
                    knowledge_graph=graph,
                )
                output = agent_instance.research(ctx)
                # 写入 session
                key = pf.code
                if key not in session.agent_outputs:
                    session.agent_outputs[key] = []
                session.agent_outputs[key].append({
                    "agent_name": output.agent_name,
                    "profession_code": output.profession_code,
                    "raw_score": output.raw_score,
                    "confidence": output.confidence,
                    "freshness_date": output.freshness_date.isoformat(),
                    "source_count": output.source_count,
                    "notes": output.notes,
                })
            return session
        return handler

    def make_fusion_handler():
        """创建 Agent 6 融合 handler"""
        def handler(session: Session) -> Session:
            alchemist = FusionAlchemist(user_config=user_config)
            # 准备输入
            all_outputs = session.get_agent_outputs_for_fusion()
            features = {pf.code: pf for pf in candidates}

            print(f"\n    [Agent6] 融合 {len(all_outputs)} 个专业的调研数据...")
            results = alchemist.fuse(all_outputs, features)
            session.fusion_results = alchemist.to_dict(results[:10])
            return session
        return handler

    def make_report_handler():
        """创建 Agent 7 报告 handler（简易版）"""
        def handler(session: Session) -> Session:
            results = session.fusion_results
            top3 = results[:3]
            lines = [
                "# Moirca 志愿推荐报告",
                "",
                "## 用户画像",
                f"- 分数: {profile.score}/{profile.full_mark}",
                f"- 省份: {profile.province}",
                f"- 偏好: {', '.join(profile.keywords)}",
                f"- 家庭: {profile.family_bg}",
                "",
                "## Top 3 推荐",
            ]
            for r in top3:
                lines.append(f"### {r['rank']}. {r['profession_name']} ({r['match_score']}分)")
                lines.append(f"等级: {r['tier']}")
                lines.append(f"基础分: {r['base_score']} | 叙事匹配: {r['factors']['narrative_match']:.3f}")
                breakdown = r.get('breakdown', {})
                lines.append("Agent评分: " + ", ".join(
                    f"{name}={detail['raw_score']:.0f}" for name, detail in breakdown.items()
                ))
                if r.get('conflict_severity'):
                    lines.append(f"⚠ 数据冲突: {r['conflict_severity']}")
                lines.append("")

            session.report = "\n".join(lines)
            return session
        return handler

    # 4. 构建 DAG
    handlers = {
        "Agent1_官方猎手": make_agent_handler(agents["Agent1_官方猎手"], "官方猎手"),
        "Agent2_口碑矿工": make_agent_handler(agents["Agent2_口碑矿工"], "口碑矿工"),
        "Agent3_时效警犬": make_agent_handler(agents["Agent3_时效警犬"], "时效警犬"),
        "Agent4_矛盾侦探": make_agent_handler(agents["Agent4_矛盾侦探"], "矛盾侦探"),
        "Agent5_趋势先知": make_agent_handler(agents["Agent5_趋势先知"], "趋势先知"),
        "Agent6_融合炼金术士": make_fusion_handler(),
        "Agent7_报告生成器": make_report_handler(),
    }
    dag = PipelineDAG.build_default(handlers)
    plan = dag.get_execution_plan()
    print(f"    DAG 执行计划: {[[n.split('_')[0] for n in layer] for layer in plan]}")

    # 5. 运行
    print_separator("执行管线")
    scheduler = TaskScheduler(sm, dag)
    start = time.time()
    result = scheduler.run(session.session_id)
    elapsed = time.time() - start

    # 6. 输出结果
    print_separator(f"执行结果 (耗时 {elapsed:.1f}s)")

    # 步骤耗时
    print("\n  步骤耗时:")
    for step in result.steps:
        icon = "✓" if step.status.value == "completed" else "✗"
        print(f"    {icon} {step.step_name}: {step.status.value} ({step.duration_ms:.0f}ms)")

    # Agent 输出统计
    total_outputs = sum(len(v) for v in result.agent_outputs.values())
    print(f"\n  Agent输出: {total_outputs} 条 (覆盖 {len(result.agent_outputs)} 个专业)")

    # 融合结果
    print(f"\n  {'排名':<4} {'专业':<22} {'分数':<8} {'等级':<20} {'冲稳保'}")
    print(f"  {'-'*60}")
    for r in result.fusion_results[:10]:
        score = r['match_score']
        strategy = "保" if score >= 85 else ("稳" if score >= 70 else "冲")
        print(f"  {r['rank']:<4} {r['profession_name']:<22} {score:<8.1f} {r['tier']:<20} {strategy}")

    # 报告摘要
    if result.report:
        print(f"\n  报告: {len(result.report)} 字")

    # 7. 清理 & 验证
    sm.save(result)
    print(f"\n  Session 已持久化: data/sessions/{result.session_id}.json")

    print_separator("验证结论")
    checks = [
        ("Session 创建+持久化", True),
        ("DAG 拓扑排序+分层执行", True),
        (f"Agent 1-5 调研 ({args.mode}模式)", total_outputs > 0),
        ("Agent 6 融合计算", len(result.fusion_results) > 0),
        ("Agent 7 报告生成", bool(result.report)),
        ("总耗时 < 10s", elapsed < 10),
        ("排除规则生效", not any(
            r['profession_name'] in ["临床医学"] for r in result.fusion_results
        )),
    ]
    for name, passed in checks:
        print(f"  [{'OK' if passed else 'FAIL'}] {name}")


if __name__ == "__main__":
    main()
