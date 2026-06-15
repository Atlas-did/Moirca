"""ADI Scoring API - evaluates major paths after agent debate"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import sys, os, json
from pathlib import Path

# ADI scripts path - look in project directory, fallback to env var
_ADI_DIR = os.environ.get(
    'ADI_SCRIPTS_PATH',
    str(Path(__file__).parent.parent.parent / 'adi_scripts')
)

router = APIRouter()

class ADIRequest(BaseModel):
    answers: dict
    majors: Optional[List[str]] = None

@router.post("/assess")
def adi_assess(req: ADIRequest):
    if not os.path.isdir(_ADI_DIR):
        return {"error": "ADI engine not installed", "majors": {}, "rank": [], "extras": []}

    old_path = list(sys.path)
    old_cwd = os.getcwd()
    try:
        sys.path.insert(0, _ADI_DIR)
        os.chdir(_ADI_DIR)
        from score_engine import compute_all, load_weights, load_baseline
        weights = load_weights()
        baseline = load_baseline()
    except ImportError:
        return {"error": "ADI score_engine not found in scripts path", "majors": {}, "rank": [], "extras": []}
    finally:
        sys.path[:] = old_path
        os.chdir(old_cwd)

    input_data = {"answers": req.answers}
    if req.majors:
        input_data["majors"] = [{"name": m, "rank": i+1, "resource": "C"} for i, m in enumerate(req.majors)]

    result = compute_all(input_data)

    majors = {}
    for name, data in result.get('majors', {}).items():
        majors[name] = {
            "adi_total": round(data.get('total', 0), 1),
            "grade": data.get('grade', ''),
            "paths": round(data.get('paths', 0), 1),
            "reach": round(data.get('reach', 0), 1),
            "correct": round(data.get('correct', 0), 1),
            "recover": round(data.get('recover', 0), 1),
            "personal_fit": round(data.get('personal_fit', 0), 1),
        }

    extras = [{"name": e.get('name',''), "adi_total": round(e.get('total',0),1),
               "grade": e.get('grade','')} for e in result.get('extras', [])]

    return {"majors": majors, "rank": result.get('algorithm_rank', []), "extras": extras}
