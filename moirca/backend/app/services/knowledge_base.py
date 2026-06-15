import json, os
from typing import List, Dict

KB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'knowledge_base.json')

def load_prebuilt() -> Dict:
    if not os.path.exists(KB_PATH):
        return {'entries': [], 'tags_idx': {}, 'total': 0}
    with open(KB_PATH) as f:
        return json.load(f)

KB = None

def get_kb():
    global KB
    if KB is None:
        KB = load_prebuilt()
    return KB

def search(query: str, top_k: int = 8) -> List[Dict]:
    kb = get_kb()
    q = query.lower()
    scored = []
    for i, entry in enumerate(kb['entries']):
        score = 0
        text = entry.get('text', '').lower()

        for word in ['计算机', '金融', '医学', '师范', '法学', '考研', '就业', '城市',
                      '985', '211', '双一流', '专业', '本科', '学历', '薪资', '土木',
                      '会计', '建筑', '英语', '人工智能', '芯片', '新能源']:
            if word in q and word in text:
                score += 3

        for tag in entry.get('tags', []):
            if isinstance(tag, str) and tag.lower() in q:
                score += 2

        if any(word in q and word in text[:100] for word in q.split() if len(word) > 2):
            score += 1

        if score > 0:
            text_preview = entry['text'][:500].replace('\n', ' ')
            scored.append((score, text_preview, entry.get('category', ''),
                          entry.get('freshness_warning', ''), entry.get('freshness_note', '')))
    scored.sort(key=lambda x: -x[0])
    seen = set()
    results = []
    for score, text, cat, fw, fn in scored[:top_k]:
        if text not in seen:
            seen.add(text)
            result = {'text': text, 'category': cat, 'relevance': score}
            if fw:
                result['freshness_warning'] = fw
                result['freshness_note'] = fn
            results.append(result)
    return results
