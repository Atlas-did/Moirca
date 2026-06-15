"""ADI Scoring Engine - evaluates major paths by 4 dimensions: paths, reach, correct, recover"""
import sys, json, os
sys.path.insert(0, '/tmp/gaokao-adi/scripts')

from score_engine import compute_all, load_weights, load_baseline, StudentProfile, MajorInput

WEIGHTS = load_weights()
BASELINE = load_baseline()

def evaluate_majors(user_profile: dict) -> list:
    scores = compute_all(user_profile, BASELINE, WEIGHTS)
    results = []
    for s in scores:
        results.append({
            'major': s.get('major', ''),
            'adi_total': round(s.get('total', 0), 2),
            'grade': s.get('grade', ''),
            'paths': round(s.get('paths', 0), 2),
            'reach': round(s.get('reach', 0), 2),
            'correct': round(s.get('correct', 0), 2),
            'recover': round(s.get('recover', 0), 2),
            'personal_fit': round(s.get('personal_fit', 0), 2),
        })
    return sorted(results, key=lambda x: -x['adi_total'])[:10]
