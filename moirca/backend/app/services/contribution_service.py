"""
用户贡献数据服务

处理从油猴脚本导出的志愿填报数据：
- 格式验证
- 去重
- 与已有数据交叉比对
- 入库
"""
import json
import hashlib
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict
from dataclasses import dataclass, field

from ..models.database import get_connection
from ..utils.logger import get_logger

logger = get_logger('moirca.services.contribution')


@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    parsed: Optional[Dict] = None


@dataclass
class CrossCheckResult:
    school_code: str
    school_name: str
    matches_public: bool = False
    matches_community: bool = False
    public_score_nearby: Optional[float] = None
    conflict_details: List[str] = field(default_factory=list)
    confidence_boost: float = 0.0


class ContributionService:
    """贡献数据处理服务"""

    REQUIRED_FIELDS = ['province', 'volunteers']
    VOLUNTEER_FIELDS = ['school_code', 'group_code']

    @staticmethod
    def generate_anonymous_id(seed: str = "") -> str:
        """生成匿名用户ID"""
        raw = f"{seed}:{datetime.now().isoformat()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def validate(self, data: dict) -> ValidationResult:
        """验证导出数据的格式和字段完整性"""
        errors = []
        warnings = []

        if not isinstance(data, dict):
            return ValidationResult(valid=False, errors=["数据格式错误：需要 JSON 对象"])

        # 必填字段
        for field in self.REQUIRED_FIELDS:
            if field not in data:
                errors.append(f"缺少必填字段: {field}")

        if errors:
            return ValidationResult(valid=False, errors=errors)

        volunteers = data.get('volunteers', [])
        if not isinstance(volunteers, list) or len(volunteers) == 0:
            errors.append("volunteers 必须是非空数组")

        # 验证每条志愿
        valid_vols = []
        for i, vol in enumerate(volunteers):
            if not isinstance(vol, dict):
                errors.append(f"第 {i+1} 条志愿格式错误")
                continue
            row_errors = []
            for f in self.VOLUNTEER_FIELDS:
                if not vol.get(f):
                    row_errors.append(f"缺少 {f}")
            if row_errors:
                warnings.append(f"第 {i+1} 条志愿: {', '.join(row_errors)}")
            else:
                valid_vols.append(vol)

        if not valid_vols:
            errors.append("没有有效的志愿记录")

        result = ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            parsed=data,
        )
        return result

    def deduplicate(self, volunteers: list, anonymous_id: str, province: str) -> list:
        """去重：检查是否与已有记录重复"""
        conn = get_connection()
        cursor = conn.cursor()

        unique = []
        for vol in volunteers:
            school_code = vol.get('school_code', '')
            group_code = vol.get('group_code', '')
            major_codes = json.dumps(vol.get('major_codes', []))

            # 检查同一匿名用户是否已提交过相同志愿
            cursor.execute(
                """SELECT contribution_id FROM contributed_volunteers
                   WHERE anonymous_id = ? AND province = ?
                   AND school_code = ? AND group_code = ?
                   AND major_codes = ?""",
                (anonymous_id, province, school_code, group_code, major_codes),
            )
            if not cursor.fetchone():
                unique.append(vol)

        conn.close()
        return unique

    def cross_check(self, volunteer: dict, province: str) -> CrossCheckResult:
        """与已有公开数据和社区数据交叉比对"""
        conn = get_connection()
        cursor = conn.cursor()

        school_code = volunteer.get('school_code', '')
        school_name = volunteer.get('school_name', '')
        result = CrossCheckResult(school_code=school_code, school_name=school_name)

        # 1. 与公开分数线比对
        cursor.execute(
            """SELECT lowest_score, lowest_rank, year FROM public_scorelines
               WHERE province = ? AND school = ?
               ORDER BY year DESC LIMIT 3""",
            (province, school_name),
        )
        public_rows = cursor.fetchall()
        if public_rows:
            result.matches_public = True
            result.public_score_nearby = public_rows[0][0] if public_rows else None

        # 2. 与 kkdaxue 社区数据比对
        major_names = volunteer.get('major_names', [])
        if isinstance(major_names, str):
            try:
                major_names = json.loads(major_names)
            except json.JSONDecodeError:
                major_names = [major_names]

        for major in (major_names if isinstance(major_names, list) else []):
            cursor.execute(
                "SELECT COUNT(*) FROM kkdaxue_posts WHERE school = ? AND major LIKE ?",
                (school_name, f'%{major}%'),
            )
            count = cursor.fetchone()[0]
            if count > 0:
                result.matches_community = True
                break

        # 3. 与已有贡献数据比对（共识度）
        cursor.execute(
            """SELECT COUNT(*), AVG(verification_score) FROM contributed_volunteers
               WHERE province = ? AND school_code = ? AND is_verified = 1""",
            (province, school_code),
        )
        existing_count, avg_score = cursor.fetchone()
        if existing_count and existing_count > 0:
            result.confidence_boost = min(10.0, existing_count * 3.0)
            if avg_score and avg_score < 60:
                result.conflict_details.append(
                    f"已有 {existing_count} 条用户贡献数据对此校存在矛盾（均分{avg_score:.0f}）"
                )
            else:
                result.conflict_details.append(
                    f"已有 {existing_count} 条用户贡献数据验证一致"
                )

        # 4. 检测明显异常
        user_score = volunteer.get('user_score') or volunteer.get('score')
        if user_score and result.public_score_nearby:
            diff = abs(float(user_score) - result.public_score_nearby)
            if diff > 50:
                result.conflict_details.append(
                    f"用户分数({user_score})与公开录取分({result.public_score_nearby})差距较大（{diff:.0f}分）"
                )
                result.confidence_boost -= 5.0

        conn.close()
        return result

    def store(
        self,
        data: dict,
        anonymous_id: str,
        cross_check_results: Optional[List[CrossCheckResult]] = None,
    ) -> List[int]:
        """批量写入贡献数据，返回插入的ID列表"""
        conn = get_connection()
        cursor = conn.cursor()

        province = data.get('province', '')
        user_profile = data.get('user_profile', {})
        volunteers = data.get('volunteers', [])
        year = data.get('exported_at', '')
        if year:
            try:
                year = int(year[:4])
            except (ValueError, TypeError):
                year = datetime.now().year
        else:
            year = datetime.now().year

        cross_check_map = {}
        if cross_check_results:
            cross_check_map = {r.school_code: r for r in cross_check_results}

        ids = []
        for vol in volunteers:
            school_code = str(vol.get('school_code', ''))
            cross = cross_check_map.get(school_code)

            cursor.execute(
                """INSERT INTO contributed_volunteers
                   (anonymous_id, province, year, subject_type, user_score, user_rank,
                    school_code, school_name, group_code, major_codes, major_names,
                    adjustment, tier_label, export_json,
                    is_verified, verification_score, verification_notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    anonymous_id,
                    province,
                    year,
                    user_profile.get('subject_type') or data.get('subject_type', ''),
                    user_profile.get('score') or data.get('score'),
                    user_profile.get('rank'),
                    school_code,
                    vol.get('school_name', ''),
                    str(vol.get('group_code', '')),
                    json.dumps(vol.get('major_codes', []), ensure_ascii=False),
                    json.dumps(vol.get('major_names', []), ensure_ascii=False),
                    1 if vol.get('adjustment', True) else 0,
                    vol.get('tier_label', ''),
                    json.dumps(data, ensure_ascii=False),
                    1 if cross and cross.confidence_boost >= 0 else 0,
                    max(0, min(100, 70 + (cross.confidence_boost if cross else 0))),
                    json.dumps(cross.conflict_details, ensure_ascii=False) if cross else None,
                ),
            )
            ids.append(cursor.lastrowid)

        conn.commit()
        conn.close()
        logger.info(f"存储 {len(ids)} 条贡献数据，匿名用户: {anonymous_id}")
        return ids

    def get_stats(self) -> dict:
        """获取全局贡献统计"""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM contributed_volunteers")
        total = cursor.fetchone()[0]

        cursor.execute(
            "SELECT province, COUNT(*) FROM contributed_volunteers GROUP BY province ORDER BY COUNT(*) DESC"
        )
        by_province = {row[0]: row[1] for row in cursor.fetchall()}

        cursor.execute(
            "SELECT COUNT(*) FROM contributed_volunteers WHERE is_verified = 1"
        )
        verified = cursor.fetchone()[0]

        conn.close()
        return {
            'total': total,
            'verified': verified,
            'verification_rate': round(verified / total * 100, 1) if total > 0 else 0,
            'by_province': by_province,
        }

    def get_history(self, anonymous_id: str) -> list:
        """获取某匿名用户的贡献历史"""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """SELECT contribution_id, province, year, school_name,
                      json_extract(major_names, '$[0]') as first_major,
                      is_verified, verification_score, created_at
               FROM contributed_volunteers
               WHERE anonymous_id = ?
               ORDER BY created_at DESC LIMIT 50""",
            (anonymous_id,),
        )
        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'id': r[0],
                'province': r[1],
                'year': r[2],
                'school': r[3],
                'first_major': r[4],
                'verified': bool(r[5]),
                'score': r[6],
                'created_at': r[7],
            }
            for r in rows
        ]


# 单例
contribution_service = ContributionService()
