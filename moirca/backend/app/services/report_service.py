"""报告生成服务（Markdown 优先，MVP）。

- 有 LLM_API_KEY：根据输入与上下文生成更完整报告
- 无 key：模板化报告，确保接口可联调

报告落盘：backend/data/reports/<report_id>.md
"""

from __future__ import annotations

import datetime as _dt
import os
import uuid
from typing import Any, Dict, Optional

from ..config import Config
from ..models.database import get_connection
from ..utils.llm_client import LLMClient


class ReportService:
    def __init__(self):
        self._client = None

    def _reports_dir(self) -> str:
        base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "reports")
        os.makedirs(base, exist_ok=True)
        return base

    def generate_markdown(
        self,
        profile: Dict[str, Any],
        recommendations: Dict[str, Any],
        simulation: Optional[Dict[str, Any]] = None,
        report_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        report_id = uuid.uuid4().hex
        created_at = _dt.datetime.now(_dt.UTC).isoformat()

        if not Config.LLM_API_KEY:
            md = self._template_report(profile, recommendations, simulation, report_context)
            path = os.path.join(self._reports_dir(), f"{report_id}.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            self._maybe_persist_report(profile, md, recommendations, simulation)
            return {"report_id": report_id, "created_at": created_at, "mode": "template", "path": path, "content_md": md}

        client = LLMClient()
        import json

        rec_text = json.dumps(recommendations, ensure_ascii=False)[:9000]
        sim_text = json.dumps(simulation, ensure_ascii=False)[:9000] if simulation else ""
        ctx_text = json.dumps(report_context, ensure_ascii=False)[:4000] if report_context else ""

        system = (
            "你是高考志愿填报报告生成器。输出必须是 Markdown。"
            "每条推荐都要写清‘为什么’与‘风险’并给出复核清单。"
        )
        user = (
            "请生成一份 Markdown 报告，必须包含这些一级标题：\n"
            "# 摘要\n# 你的画像\n# 推荐清单（冲/稳/保）\n# 风险预警\n# 对比建议\n# 复核清单\n# 灵魂拷问\n# 免责声明\n\n"
            f"用户画像（JSON）：\n{json.dumps(profile, ensure_ascii=False)}\n\n"
            f"推荐结果（JSON）：\n{rec_text}\n\n"
            f"上传/图谱上下文（JSON，可为空）：\n{ctx_text}\n\n"
            f"模拟舆情（可为空，JSON）：\n{sim_text}\n"
        )

        md = client.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.6,
            max_tokens=2200,
        )

        path = os.path.join(self._reports_dir(), f"{report_id}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(md)

        self._maybe_persist_report(profile, md, recommendations, simulation)

        return {"report_id": report_id, "created_at": created_at, "mode": "llm", "path": path, "content_md": md}

    def load_markdown(self, report_id: str) -> str:
        path = os.path.join(self._reports_dir(), f"{report_id}.md")
        if not os.path.exists(path):
            raise FileNotFoundError(report_id)
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def _template_report(
        self,
        profile: Dict[str, Any],
        recommendations: Dict[str, Any],
        simulation: Optional[Dict[str, Any]],
        report_context: Optional[Dict[str, Any]],
    ) -> str:
        rec_items = recommendations.get("recommendations") or []
        top = rec_items[:5]
        lines = []
        lines.append("# 摘要")
        lines.append("（模板报告：未配置 LLM_API_KEY，内容用于联调结构）")
        lines.append("")
        lines.append("# 你的画像")
        lines.append(f"- 省份：{profile.get('province','')}  分数：{profile.get('score','')}  档位：{profile.get('tier') or profile.get('auto_tier') or profile.get('user_tier') or ''}")
        lines.append(f"- 侧重点：{profile.get('priority','')}  排除：{profile.get('exclusion','')}")
        if report_context:
            lines.append("- 上传文档：" + ", ".join(report_context.get("document_ids", []) or []))
        lines.append("")
        lines.append("# 推荐清单（冲/稳/保）")
        for i, item in enumerate(top, 1):
            name = item.get('major') or item.get('profession_name') or ''
            tier = item.get('tier') or item.get('strategy') or ''
            lines.append(f"{i}. {name}（{tier}）- 分数 {item.get('match_score','')} ")
        lines.append("")
        lines.append("# 风险预警")
        lines.append("- 关注滑档/调剂/信息时效/样本偏差等风险；对低置信度条目降级处理。")
        lines.append("")
        lines.append("# 对比建议")
        lines.append("- 若在‘学校 vs 专业’之间摇摆：用目标城市、读研意愿、家庭预算做最终裁决。")
        lines.append("")
        lines.append("# 复核清单")
        lines.append("- 招生章程/招生计划（年份+省份+科类）")
        lines.append("- 专业培养方案/授予学位/转专业政策")
        lines.append("- 就业去向（看中位数而非最高薪）")
        if report_context:
            lines.append("- 结合上传文档与图谱上下文，核对关键字段是否一致")
        lines.append("")
        lines.append("# 灵魂拷问")
        lines.append("- 你更怕‘上不了好学校’还是‘读了不喜欢的专业’？")
        lines.append("- 你能接受为了城市放弃学校层次吗？")
        lines.append("- 你愿意为门槛付出多少（数学/英语/竞赛/实习）？")
        lines.append("")
        lines.append("# 免责声明")
        lines.append("- 本报告仅供参考，最终以官方信息为准。")
        return "\n".join(lines)

    def _maybe_persist_report(self, profile: Dict[str, Any], content_md: str, recommendations: Dict[str, Any], simulation: Optional[Dict[str, Any]]) -> None:
        """如果 profile 中带有 user_id/profile_id，则顺手写入 SQLite reports 表。"""
        user_id = profile.get("user_id")
        profile_id = profile.get("profile_id")
        if not user_id or not profile_id:
            return

        soul_questions = "\n".join([
            "你更怕上不了好学校，还是读了不喜欢的专业？",
            "你愿意为了城市放弃学校层次吗？",
            "你能接受长周期投入吗？",
        ])
        risk_warnings = "\n".join(recommendations.get("warnings", [])[:5])

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO reports (user_id, profile_id, report_type, content_md, soul_questions, risk_warnings)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (str(user_id), int(profile_id), "full", content_md, soul_questions, risk_warnings),
        )
        conn.commit()
        conn.close()


report_service = ReportService()
