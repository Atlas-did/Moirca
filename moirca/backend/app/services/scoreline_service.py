"""公开分数线/位次服务。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..models.database import get_connection


@dataclass
class ScorelineRecord:
    scoreline_id: str
    province: str
    subject_type: str
    year: int
    school: str
    major: str
    batch: str
    lowest_score: float
    lowest_rank: Optional[int]
    plan_count: Optional[int]
    source: str
    notes: str


class ScorelineService:
    """公开分数线/位次正式数据源。"""

    def __init__(self):
        self._cache: list[ScorelineRecord] | None = None

    def reload(self) -> None:
        self._cache = None

    def _load(self) -> list[ScorelineRecord]:
        if self._cache is not None:
            return self._cache

        conn = get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT scoreline_id, province, subject_type, year, school, major,
                       batch, lowest_score, lowest_rank, plan_count, source, notes
                FROM public_scorelines
                ORDER BY year DESC, lowest_score DESC
                """
            )
            rows = cursor.fetchall()
        except Exception:
            rows = []
        finally:
            conn.close()

        records = [
            ScorelineRecord(
                scoreline_id=row[0],
                province=row[1],
                subject_type=row[2],
                year=int(row[3]),
                school=row[4],
                major=row[5],
                batch=row[6],
                lowest_score=float(row[7]),
                lowest_rank=int(row[8]) if row[8] is not None else None,
                plan_count=int(row[9]) if row[9] is not None else None,
                source=row[10],
                notes=row[11] or "",
            )
            for row in rows
        ]
        self._cache = records
        return records

    def stats(self) -> Dict[str, Any]:
        records = self._load()
        return {
            "total_records": len(records),
            "provinces": sorted(set(r.province for r in records)),
            "years": sorted(set(r.year for r in records), reverse=True),
            "schools": len(set(r.school for r in records)),
            "majors": len(set(r.major for r in records)),
        }

    def search(
        self,
        province: Optional[str] = None,
        subject_type: Optional[str] = None,
        school: Optional[str] = None,
        major: Optional[str] = None,
        year: Optional[int] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        records = self._load()
        items: List[Dict[str, Any]] = []
        for r in records:
            if province and r.province != province:
                continue
            if subject_type and r.subject_type != subject_type:
                continue
            if school and school not in r.school:
                continue
            if major and major not in r.major:
                continue
            if year and r.year != year:
                continue
            items.append(r.__dict__)
        return items[: max(1, min(limit, 100))]

    @staticmethod
    def _pick_closest(candidates: List[Dict[str, Any]], score: float) -> Dict[str, Any]:
        """在候选里选 |score - lowest_score| 最小的一条，并列时取年份更近的。"""

        def _rank_key(item: Dict[str, Any]):
            gap = abs(float(score) - float(item["lowest_score"]))
            return (gap, -int(item.get("year", 0)))

        return dict(min(candidates, key=_rank_key))

    def best_match(
        self,
        score: float,
        province: Optional[str] = None,
        subject_type: Optional[str] = None,
        school: Optional[str] = None,
        major: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """渐进式匹配，避免把无关学校的分数线误挂到推荐上。

        匹配级别:
          - exact: 省份+科类+学校+专业 全命中
          - major: 省份+科类+专业（忽略学校）
          - school: 省份+科类+学校（忽略专业，仅作弱参考）
        任何一级都没有数据时返回 None，绝不退化为全表任取一条。
        """
        levels = (
            ("exact", {"province": province, "subject_type": subject_type, "school": school, "major": major}),
            ("major", {"province": province, "subject_type": subject_type, "major": major}),
            ("school", {"province": province, "subject_type": subject_type, "school": school}),
        )
        for level, filters in levels:
            active = {k: v for k, v in filters.items() if v}
            candidates = self.search(**active, limit=50)
            if not candidates:
                continue
            best = self._pick_closest(candidates, score)
            best["match_level"] = level
            best["score_gap"] = round(float(score) - float(best["lowest_score"]), 2)
            best["match_strength"] = round(max(0.0, 1.0 - abs(best["score_gap"]) / 120.0), 4)
            return best
        return None

    def score_bonus(
        self,
        score: float,
        province: Optional[str] = None,
        subject_type: Optional[str] = None,
        school: Optional[str] = None,
        major: Optional[str] = None,
    ) -> Dict[str, Any]:
        best = self.best_match(score, province=province, subject_type=subject_type, school=school, major=major)
        # 只有精确命中（exact）或专业级命中（major）才给“已校准”加分；
        # 校级命中（school，专业不对）只返回弱参考，不给加分、不宣称“已校准”。
        if not best or best.get("match_level") not in ("exact", "major"):
            return {
                "bonus": 0.0,
                "match_strength": best.get("match_strength", 0.0) if best else 0.0,
                "matched": False,
                "match_level": best.get("match_level") if best else None,
                "best": best,
            }

        closeness = best["match_strength"]
        score_gap = best["score_gap"]
        # 分数越接近，奖励越高；若高于最低线，给予更强加成
        bonus = max(0.0, min(20.0, 6.0 + closeness * 14.0 + max(0.0, score_gap) * 0.04))
        if score < best["lowest_score"]:
            bonus *= 0.6

        return {
            "bonus": round(bonus, 2),
            "match_strength": closeness,
            "matched": True,
            "match_level": best["match_level"],
            "best": best,
        }


scoreline_service = ScorelineService()
