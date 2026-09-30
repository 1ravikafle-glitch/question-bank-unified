"""Best-effort MCQ extraction from PDF files (user uploads).

Strategy: pull raw page text with pypdf, then run the same line-oriented
grammar the question papers use:
  1. Question text ...        (leading number + dot/paren, may wrap lines)
  a) option / (a) option ...  (letters a-d, several marker styles)
  Answer: c / Ans: (c) ...    (optional; questions without answers are
                               flagged so the importer can skip them)

Returns the same dict shape as docx_parser.extract_questions_and_answers:
  [{question_number, question_text, options:{a:..,b:..,c:..,d:..},
    correct_answer, category}]
so both parsers feed one import path.
"""
import io
import re

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

OPTION_RES = [
    re.compile(r"^\(?([a-dA-D])[.)\]]:?\s+(.*\S)\s*$"),
    re.compile(r"^([a-dA-D])\s*[-–]\s+(.*\S)\s*$"),
]

ANSWER_RES = [
    re.compile(r"(?:answer|ans|correct)[\s:]*\(?([a-dA-D])\)?", re.IGNORECASE),
    re.compile(r"^\[([a-dA-D])\]\s*$"),
]

Q_START_RE = re.compile(r"^(\d{1,4})[.)]\s+(.*\S)\s*$")


def pdf_to_text(file_bytes: bytes, max_pages: int = 200) -> str:
    if PdfReader is None:
        raise RuntimeError("PDF support needs the 'pypdf' package")
    reader = PdfReader(io.BytesIO(file_bytes))
    out = []
    for i, page in enumerate(reader.pages):
        if i >= max_pages:
            break
        try:
            out.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(out)


def parse_mcq_text(text: str, category: str = "Unknown"):
    lines = [ln.strip() for ln in text.replace("\r", "").split("\n")]
    questions = []
    cur = None

    def flush():
        nonlocal cur
        if cur and cur["question_text"] and len(cur["options"]) >= 2:
            questions.append(cur)
        cur = None

    for ln in lines:
        if not ln:
            continue
        m = Q_START_RE.match(ln)
        if m and len(m.group(1)) <= 4:
            flush()
            cur = {
                "question_number": int(m.group(1)),
                "question_text": m.group(2).strip(),
                "options": {},
                "correct_answer": "",
                "category": category,
            }
            continue
        if cur is None:
            continue
        # answer line?
        matched_ans = False
        for arx in ANSWER_RES:
            am = arx.search(ln)
            if am and len(cur["options"]) >= 2:
                cur["correct_answer"] = am.group(1).lower()
                matched_ans = True
                break
        if matched_ans:
            continue
        # option line?
        for orx in OPTION_RES:
            om = orx.match(ln)
            if om:
                cur["options"][om.group(1).lower()] = om.group(2).strip()
                break
        else:
            # continuation of question stem or a wrapped option
            if len(cur["options"]) == 0:
                cur["question_text"] += " " + ln
            else:
                last = sorted(cur["options"].keys())[-1]
                cur["options"][last] += " " + ln
    flush()
    # normalize like the docx path
    for q in questions:
        q["options"] = {str(k).strip().lower(): str(v).strip() for k, v in q["options"].items()}
        q["correct_answer"] = str(q.get("correct_answer") or "").strip().lower()[:1]
        q["question_text"] = " ".join(str(q.get("question_text") or "").split())
    return questions


def extract_questions_and_answers_pdf(file_bytes: bytes, category: str = "Unknown"):
    return parse_mcq_text(pdf_to_text(file_bytes), category)
