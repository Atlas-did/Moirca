"""
NetworkX 本地知识图谱服务

替代 MiroFish 的 Zep Cloud，构建"专业-院校-就业"三方关系图。

节点类型:
  - Profession: 专业（code, name, category, keywords）
  - School: 院校（name, tier, province, city）
  - Career: 就业方向（name, industry, avg_salary）

边类型:
  - OFFERED_BY: 专业 → 院校（某校开设此专业）
  - LEADS_TO: 专业 → 就业（此专业可从事的就业方向）
  - RELATED_TO: 专业 ↔ 专业（相关/同类专业）
  - LOCATED_IN: 院校 → 城市

用途:
  - 为 Agent 6 融合炼金术士提供 ProfessionFeatures
  - 图遍历推荐相关专业
  - 按城市/省份筛选院校
"""
import json
import os
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass

import networkx as nx

from ..agents.agent6_fusion_alchemist import ProfessionFeatures


@dataclass
class SchoolNode:
    name: str
    tier: str = ""         # 985/211/一本/二本/专科
    province: str = ""
    city: str = ""
    is_public: bool = True


@dataclass
class CareerNode:
    name: str
    industry: str = ""
    avg_salary: str = ""   # 描述性（"8-15k"）


class KnowledgeGraph:
    """
    专业-院校-就业 知识图谱

    基于 NetworkX 有向图，支持:
      - 按专业查询关联院校和就业方向
      - 图遍历发现相关专业
      - 导出 ProfessionFeatures 供融合引擎使用
    """

    def __init__(self):
        self.graph = nx.DiGraph()
        self._profession_nodes: Dict[str, ProfessionFeatures] = {}

    # ---- 构建 ----

    def add_profession(self, pf: ProfessionFeatures):
        """添加专业节点"""
        self.graph.add_node(
            pf.code,
            type="Profession",
            name=pf.name,
            category=pf.category,
            discipline=pf.discipline,
            keywords=pf.keywords,
        )
        self._profession_nodes[pf.code] = pf

    def add_school(self, school: SchoolNode):
        """添加院校节点"""
        node_id = f"school:{school.name}"
        self.graph.add_node(
            node_id,
            type="School",
            name=school.name,
            tier=school.tier,
            province=school.province,
            city=school.city,
        )

    def add_career(self, career: CareerNode):
        """添加就业方向节点"""
        node_id = f"career:{career.name}"
        self.graph.add_node(
            node_id,
            type="Career",
            name=career.name,
            industry=career.industry,
            avg_salary=career.avg_salary,
        )

    def link_profession_school(self, prof_code: str, school_name: str):
        """边: 某校开设某专业"""
        self.graph.add_edge(
            prof_code,
            f"school:{school_name}",
            type="OFFERED_BY",
        )

    def link_profession_career(self, prof_code: str, career_name: str):
        """边: 专业 → 就业方向"""
        self.graph.add_edge(
            prof_code,
            f"career:{career_name}",
            type="LEADS_TO",
        )

    def link_related_professions(self, code_a: str, code_b: str):
        """边: 相关专业"""
        self.graph.add_edge(code_a, code_b, type="RELATED_TO")
        self.graph.add_edge(code_b, code_a, type="RELATED_TO")

    # ---- 查询 ----

    def get_profession(self, code: str) -> Optional[ProfessionFeatures]:
        return self._profession_nodes.get(code)

    def get_all_professions(self) -> List[ProfessionFeatures]:
        return list(self._profession_nodes.values())

    def get_schools_for_profession(self, prof_code: str) -> List[str]:
        """查询开设某专业的所有院校"""
        schools = []
        for _, target, data in self.graph.out_edges(prof_code, data=True):
            if data.get("type") == "OFFERED_BY":
                node = self.graph.nodes.get(target, {})
                name = node.get("name", target)
                schools.append(name)
        return schools

    def get_careers_for_profession(self, prof_code: str) -> List[str]:
        """查询某专业的就业方向"""
        careers = []
        for _, target, data in self.graph.out_edges(prof_code, data=True):
            if data.get("type") == "LEADS_TO":
                node = self.graph.nodes.get(target, {})
                careers.append(node.get("name", target))
        return careers

    def get_related_professions(self, prof_code: str, depth: int = 1) -> List[str]:
        """图遍历发现相关专业"""
        related = set()
        frontier = {prof_code}
        for _ in range(depth):
            next_frontier = set()
            for node in frontier:
                for _, target, data in self.graph.out_edges(node, data=True):
                    if data.get("type") == "RELATED_TO":
                        if target not in related and target in self._profession_nodes:
                            related.add(target)
                            next_frontier.add(target)
            frontier = next_frontier
        return list(related)

    def get_stats(self) -> dict:
        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "profession_count": len(self._profession_nodes),
            "school_count": len([n for n, d in self.graph.nodes(data=True) if d.get("type") == "School"]),
            "career_count": len([n for n, d in self.graph.nodes(data=True) if d.get("type") == "Career"]),
        }

    # ---- 初始化默认数据（P0 + kkdaxue 数据扩充）----

    @classmethod
    def build_default(cls) -> "KnowledgeGraph":
        """构建包含核心专业和院校的默认知识图谱"""
        kg = cls()

        # 专业节点（10个核心专业，对应数据库中的示例）
        professions = [
            ProfessionFeatures("080901", "计算机科学与技术", "工学", "计算机类",
                keywords=["编程", "算法", "软件开发", "人工智能"],
                career_paths=["软件工程师", "算法工程师", "全栈开发"],
                skill_requirements=["数据结构", "操作系统", "计算机网络"]),
            ProfessionFeatures("080902", "软件工程", "工学", "计算机类",
                keywords=["软件开发", "项目管理", "测试"],
                career_paths=["软件工程师", "项目经理", "测试工程师"],
                skill_requirements=["软件工程方法", "设计模式", "敏捷开发"]),
            ProfessionFeatures("080703", "通信工程", "工学", "电子信息类",
                keywords=["通信", "信号处理", "5G"],
                career_paths=["通信工程师", "射频工程师", "网络规划"],
                skill_requirements=["信号与系统", "数字信号处理", "通信原理"]),
            ProfessionFeatures("080601", "电气工程及其自动化", "工学", "电气类",
                keywords=["电力系统", "自动化控制", "电网"],
                career_paths=["电气工程师", "电网运维", "自动化工程师"],
                skill_requirements=["电路原理", "电力系统分析", "PLC"]),
            ProfessionFeatures("100201", "临床医学", "医学", "临床医学类",
                keywords=["诊断", "治疗", "手术"],
                career_paths=["医生", "医学研究员", "公共卫生"],
                skill_requirements=["解剖学", "病理学", "药理学"]),
            ProfessionFeatures("120203", "会计学", "管理学", "工商管理类",
                keywords=["财务", "审计", "税务"],
                career_paths=["会计师", "审计师", "财务经理"],
                skill_requirements=["财务会计", "管理会计", "审计学"]),
            ProfessionFeatures("030101", "法学", "法学", "法学类",
                keywords=["法律", "诉讼", "合规"],
                career_paths=["律师", "法务", "公务员"],
                skill_requirements=["宪法", "民法", "刑法"]),
            ProfessionFeatures("050101", "汉语言文学", "文学", "中国语言文学类",
                keywords=["写作", "编辑", "文化研究"],
                career_paths=["编辑", "教师", "文案策划"],
                skill_requirements=["古代文学", "现代汉语", "写作"]),
            ProfessionFeatures("020301", "金融学", "经济学", "金融学类",
                keywords=["投资", "银行", "证券"],
                career_paths=["银行家", "证券分析师", "基金经理"],
                skill_requirements=["微观经济学", "公司金融", "投资学"]),
            ProfessionFeatures("080202", "机械设计制造及其自动化", "工学", "机械类",
                keywords=["机械设计", "制造", "自动化"],
                career_paths=["机械工程师", "制造工程师", "设备工程师"],
                skill_requirements=["机械制图", "材料力学", "机械原理"]),
        ]

        for pf in professions:
            kg.add_profession(pf)

        # 院校节点
        schools = [
            SchoolNode("华南理工大学", "985", "广东", "广州"),
            SchoolNode("中山大学", "985", "广东", "广州"),
            SchoolNode("暨南大学", "211", "广东", "广州"),
            SchoolNode("深圳大学", "一本", "广东", "深圳"),
            SchoolNode("广州大学", "一本", "广东", "广州"),
            SchoolNode("广东工业大学", "一本", "广东", "广州"),
            SchoolNode("东莞理工学院", "二本", "广东", "东莞"),
        ]
        for s in schools:
            kg.add_school(s)

        # 就业方向节点
        careers = [
            CareerNode("软件工程师", "互联网", "8-20k"),
            CareerNode("算法工程师", "AI/大数据", "15-35k"),
            CareerNode("电气工程师", "电力/能源", "8-15k"),
            CareerNode("医生", "医疗", "10-25k"),
            CareerNode("会计师", "财务/审计", "6-15k"),
            CareerNode("律师", "法律", "8-20k"),
            CareerNode("教师", "教育", "5-12k"),
            CareerNode("公务员", "政府", "5-10k"),
        ]
        for c in careers:
            kg.add_career(c)

        # 边: 专业 → 学校开设
        for school_name in ["华南理工大学", "中山大学", "暨南大学", "深圳大学", "广东工业大学"]:
            kg.link_profession_school("080901", school_name)  # 计算机
        for school_name in ["华南理工大学", "中山大学", "深圳大学", "广州大学"]:
            kg.link_profession_school("080902", school_name)  # 软件工程
        for school_name in ["华南理工大学", "暨南大学", "广东工业大学"]:
            kg.link_profession_school("080703", school_name)  # 通信工程
        for school_name in ["华南理工大学", "广东工业大学", "东莞理工学院"]:
            kg.link_profession_school("080601", school_name)  # 电气
        for school_name in ["中山大学", "暨南大学"]:
            kg.link_profession_school("100201", school_name)  # 临床医学

        # 边: 专业 → 就业方向
        kg.link_profession_career("080901", "软件工程师")
        kg.link_profession_career("080901", "算法工程师")
        kg.link_profession_career("080902", "软件工程师")
        kg.link_profession_career("080601", "电气工程师")
        kg.link_profession_career("100201", "医生")
        kg.link_profession_career("120203", "会计师")
        kg.link_profession_career("030101", "律师")
        kg.link_profession_career("050101", "教师")
        kg.link_profession_career("050101", "公务员")

        # 边: 相关专业
        kg.link_related_professions("080901", "080902")  # 计算机 ↔ 软件工程
        kg.link_related_professions("080901", "080703")  # 计算机 ↔ 通信
        kg.link_related_professions("080601", "080202")  # 电气 ↔ 机械

        return kg
