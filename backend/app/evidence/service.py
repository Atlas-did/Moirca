"""evidence service(AGENT_02):源质量分级 + 引用格式 + 防幻觉钩子。

职责(任务书 #3/#4/#5):
  - source_quality 分级判定:官方(3)/高信誉媒体(2)/社区(1)/未知(0),
    关键词表或元数据传入,不自动爬;
  - 浓缩摘录模板(主 Agent 只见浓缩,原文完整存库,§c.2):
    [E:{evidence_id}] quote≤200字符 —— 一句话源质量评级;
  - 说明书行内引用语法 [E:evidence_id](兼容脚注式 [^E:...])与文末引用表;
  - claim → evidence 浅层匹配(词面重叠,可后接向量升级),
    供报告生成时标注"该句无证据支持"。

纯函数为主,零网络依赖;不直接触碰 HTTP 层。
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# source_quality 分级(任务书 #4):官方(3)/高信誉媒体(2)/社区(1)/未知(0)
# ---------------------------------------------------------------------------

QUALITY_LEVELS: Dict[str, int] = {
    "official": 3,
    "authoritative": 2,
    "community": 1,
    "unknown": 0,
}
QUALITY_LABELS: Dict[str, str] = {
    "official": "官方",
    "authoritative": "高信誉媒体",
    "community": "社区/低质量",
    "unknown": "未知",
}

# 内置域名关键词表(可被调用方传入的 keywords 覆盖/补充;不自动爬)
DEFAULT_QUALITY_KEYWORDS: Dict[str, List[str]] = {
    "official": [
        "gov.cn", "edu.cn", "moe.gov.cn", "chsi.com.cn", "chsi.cn",
        "eaa", "eea.", "zsb.", "jseea",
    ],
    "authoritative": [
        "xinhuanet.com", "news.cn", "people.com.cn", "cctv.com", "thepaper.cn",
        "caixin.com", "chinanews.com", "gmw.cn", "eol.cn", "gaokao.chsi",
        "cedaily", "yicai.com", "21jingji.com",
    ],
    "community": [
        "zhihu.com", "tieba.baidu.com", "bilibili.com", "xiaohongshu.com",
        "douyin.com", "weibo.com", "kkdaxue", "bbs.",
    ],
}


def quality_level(source_quality: str) -> int:
    """官方=3 / 高信誉媒体=2 / 社区或低质量=1 / 未知=0。"""
    return QUALITY_LEVELS.get(source_quality, 0)


def source_quality_label(source_quality: str) -> str:
    """一句话源质量评级,如 '官方(可信度3/3)',用于浓缩摘录模板。"""
    level = quality_level(source_quality)
    label = QUALITY_LABELS.get(source_quality, QUALITY_LABELS["unknown"])
    return f"{label}(可信度{level}/3)"


def assess_source_quality(
    url: str = "",
    title: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    keywords: Optional[Dict[str, List[str]]] = None,
) -> str:
    """判定 source_quality。

    优先级:metadata 显式声明 > 调用方关键词表 > 内置域名关键词表 > unknown。
    metadata 支持 {"declared": "official"} 或 {"official": true} 形式。
    """
    from .schema import SOURCE_QUALITIES

    if metadata:
        declared = metadata.get("declared") or metadata.get("source_quality")
        if declared in SOURCE_QUALITIES:
            return str(declared)
        for q in SOURCE_QUALITIES:
            if metadata.get(q) is True:
                return q

    haystack = f"{url or ''} {title or ''}".lower()
    tables = []
    if keywords:
        tables.append(keywords)
    tables.append(DEFAULT_QUALITY_KEYWORDS)

    for table in tables:  # 先按调用方表整体判定,再退回内置表
        for q in ("official", "authoritative", "community"):
            for kw in table.get(q, []):
                if kw and kw.lower() in haystack:
                    return q
    return "unknown"


# ---------------------------------------------------------------------------
# 浓缩摘录 / 引用格式(任务书 #3;CONTRACT §c.2)
# ---------------------------------------------------------------------------

QUOTE_DIGEST_CHARS = 200      # §c.2/§h:引用摘录 quote 截 200 字符
DIGEST_MAX_ITEMS = 8          # 浓缩摘录单次最多条数(总量压在 ~2k token)
DIGEST_MAX_CHARS = 4000       # 浓缩摘录总字符硬上限

# 浓缩摘录模板(1–2k token):[E:{evidence_id}] quote + 一句话源质量评级
DIGEST_TEMPLATE = "[E:{eid}] {quote} —— 源质量:{quality} · {url} · 采集于 {fetched_at}"


def render_inline_citation(evidence_id: str) -> str:
    """行内引用语法(CONTRACT §c.2):……结论句……[E:ev_XXXX]"""
    return f"[E:{evidence_id}]"


# 行内引用解析:兼容契约的 [E:ev_xx] 与任务书示例的脚注式 [^E:ev_xx]
_CITATION_RE = re.compile(r"\[\^?E:([A-Za-z0-9_]+)\]")


def extract_citations(text: str) -> List[str]:
    """从说明书文本中按出现顺序抽取引用的 evidence_id(去重保序)。"""
    seen, out = set(), []
    for m in _CITATION_RE.finditer(text or ""):
        eid = m.group(1)
        if eid not in seen:
            seen.add(eid)
            out.append(eid)
    return out


def render_digest(evidences: List[Dict[str, Any]],
                  max_quote_chars: int = QUOTE_DIGEST_CHARS,
                  max_items: int = DIGEST_MAX_ITEMS,
                  max_chars: int = DIGEST_MAX_CHARS) -> str:
    """浓缩摘录模板(喂主 Agent,原文完整存库):

    [E:ev_xx] <quote≤200字符> —— 源质量:官方(可信度3/3) · <url> · 采集于 <ISO时间>
    """
    lines: List[str] = []
    used = 0
    for ev in evidences[:max_items]:
        quote = (ev.get("quote") or "").replace("\n", " ").strip()
        if len(quote) > max_quote_chars:
            quote = quote[:max_quote_chars] + "…"
        line = DIGEST_TEMPLATE.format(
            eid=ev.get("evidence_id", ""),
            quote=quote,
            quality=source_quality_label(ev.get("source_quality") or "unknown"),
            url=ev.get("url", ""),
            fetched_at=ev.get("fetched_at", ""),
        )
        if used + len(line) > max_chars:
            lines.append(f"(…其余 {len(evidences) - len(lines)} 条证据已省略,回查:"
                         "GET /api/evidence/query?task_id=…)")
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines)


def render_references_block(evidences: List[Dict[str, Any]]) -> str:
    """说明书文末引用表(Markdown,可直接拼接输出)。"""
    if not evidences:
        return "## 引用证据\n\n(无)\n"
    lines = ["## 引用证据", ""]
    for ev in evidences:
        locator = ev.get("locator") or {}
        loc_desc = ""
        if isinstance(locator, dict) and locator:
            loc_desc = f",定位:{locator.get('type', '')}={locator.get('value', '')}"
        raw_note = f",旁路原文:{ev['raw_ref']}" if ev.get("raw_ref") else ""
        lines.append(
            f"- [E:{ev['evidence_id']}] 《{ev.get('title') or '无标题'}》 "
            f"{ev.get('url')} — {source_quality_label(ev.get('source_quality') or 'unknown')}"
            f",采集于 {ev.get('fetched_at')}{loc_desc}{raw_note}"
        )
    lines.append("")
    lines.append("_回查原文:GET /api/evidence/{evidence_id};引用语法:[E:{evidence_id}]_")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# 防幻觉钩子(任务书 #5):claim → evidence 浅层匹配
# ---------------------------------------------------------------------------

_LATIN_RE = re.compile(r"[0-9A-Za-z]{2,}")
_CJK_RE = re.compile(r"[一-鿿]+")
# 高频虚词,不计入匹配(防"的/了/是"刷分)
_STOP_CJK = set("的了是在和与及或有为对从被把让向于关于这个那之其本次等很更最也都还很又再就才只")


def _claim_tokens(text: str) -> set:
    """分词:拉丁词(≥2,小写)+ 中文二元组(过滤虚词)。"""
    tokens = set()
    for w in _LATIN_RE.findall(text or ""):
        tokens.add(w.lower())
    for seg in _CJK_RE.findall(text or ""):
        if len(seg) == 1:
            if seg not in _STOP_CJK:
                tokens.add(seg)
            continue
        for i in range(len(seg) - 1):
            bg = seg[i:i + 2]
            if bg[0] in _STOP_CJK and bg[1] in _STOP_CJK:
                continue
            tokens.add(bg)
    return tokens


def _evidence_tokens(ev: Dict[str, Any]) -> set:
    return _claim_tokens(
        f"{ev.get('quote', '')} {ev.get('title', '')} {ev.get('url', '')}"
    )


def match_claim(claim: str, evidences: List[Dict[str, Any]],
                limit: int = 3, min_score: float = 0.2) -> Dict[str, Any]:
    """单条 claim 与候选证据的浅层匹配(词面重叠,可后接向量升级)。

    返回 {claim, supported, best_score, matches:[{evidence_id, score, ...}], note}
    """
    ct = _claim_tokens(claim)
    matches: List[Dict[str, Any]] = []
    if ct:
        scored = []
        for ev in evidences:
            overlap = ct & _evidence_tokens(ev)
            if not overlap:
                continue
            score = len(overlap) / len(ct)
            # 命中 url/title 的 token 权重略高(说明证据页主题相关)
            head = _claim_tokens(f"{ev.get('title', '')} {ev.get('url', '')}")
            boost = len(overlap & head) / len(ct) * 0.3
            scored.append((min(1.0, score + boost), ev))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        for score, ev in scored[:limit]:
            matches.append({
                "evidence_id": ev.get("evidence_id"),
                "score": round(score, 4),
                "quote": (ev.get("quote") or "")[:QUOTE_DIGEST_CHARS],
                "url": ev.get("url"),
                "source_quality": ev.get("source_quality"),
                "source_quality_label": source_quality_label(ev.get("source_quality") or "unknown"),
            })
    supported = bool(matches) and matches[0]["score"] >= min_score
    if not matches:
        note = "候选证据中未找到任何词面重叠"
    elif not supported:
        note = f"最高重合度 {matches[0]['score']} 低于阈值 {min_score},证据支持不足"
    else:
        note = "命中证据"
    return {
        "claim": claim,
        "supported": supported,
        "best_score": matches[0]["score"] if matches else 0.0,
        "matches": matches,
        "note": note,
    }


def match_claims(claims: List[str], evidences: List[Dict[str, Any]],
                 limit: int = 3, min_score: float = 0.2) -> List[Dict[str, Any]]:
    return [match_claim(c, evidences, limit=limit, min_score=min_score) for c in claims]
