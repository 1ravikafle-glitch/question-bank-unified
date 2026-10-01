"""
Reusable parser for extracting MCQ questions + answer keys from .docx files.
Used by both the CLI script (parse_and_categorize.py) and the
admin docx-upload API endpoint (admin_router.py).

Handles multiple source-document formats seen in practice:

1. Options laid out inside 2x2 Word tables between question paragraphs
   (python-docx's `.paragraphs` silently skips table content, so the
   parser walks paragraphs and tables together in true document order).
2. Options as plain paragraph lines using "a]", "a.", "a)" or similar.
3. A trailing answer key as one compact line per block, e.g. "69d 70d 71d"
   (no separator between number and letter).
4. A trailing answer key as one answer per paragraph under an explicit
   "ANSWER KEY" heading, e.g. "1.b" / "2.d" / one per line, which — if
   not specifically detected — would otherwise be misread as new
   questions (since "1.b" also matches a "N. text" question pattern).
"""
import re
from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.table import Table

QUESTION_START_RE = re.compile(r'^\s*(\d+)\.\s*(.*)')
OPTION_LINE_RE = re.compile(r'^\s*([a-d])[\]\.\)]\s*(.*)', re.IGNORECASE)
CELL_OPTION_RE = re.compile(r'^\s*([a-d])[\]\.\)]\s*(.*)', re.IGNORECASE)

# Matches a compact answer-key line like "69d 70d 71d" (no separator)
COMPACT_ANSWER_KEY_LINE_RE = re.compile(r'^(\d+[a-d]\s*)+$', re.IGNORECASE)

# An answer stated inline right under the options of a single question, e.g.
# "Answer: b" / "Ans: (b)" / "Correct answer: c". The PDF parser has always
# supported this; without the same rule here the line was swallowed into
# question_text and the question imported with no answer at all.
INLINE_ANSWER_RE = re.compile(
    r'^\s*(?:answer|ans|correct(?:\s+answer)?|उत्तर)\s*[:\-–]?\s*\(?([a-dA-D])\)?\s*\.?\s*$',
    re.IGNORECASE,
)

# An explicit "ANSWER KEY" / "ANSWERS" heading line, used as a hard,
# reliable split point when present.
ANSWER_KEY_HEADING_RE = re.compile(r'^\s*answers?(\s*key)?\s*:?\s*$', re.IGNORECASE)

# Flexible "number [separator] letter" pair, tolerant of ".", ")", ":",
# "-", or plain whitespace between them (or nothing at all).
FLEXIBLE_ANSWER_PAIR_RE = re.compile(r'(\d+)\s*[\.\)\:\-]?\s*([a-dA-D])\b')


def _iter_block_items(document):
    """Yield Paragraph and Table objects in true document order."""
    parent_elm = document.element.body
    for child in parent_elm.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, document)
        elif child.tag == qn('w:tbl'):
            yield Table(child, document)


def _find_answer_key_paragraph_index(paragraphs_text):
    """
    Return the paragraph index at which the answer key section begins
    (the index right after a heading, or the index of the first matched
    entry for the heuristic fallback), or None if no answer key was found.
    """
    n = len(paragraphs_text)

    # 1) Prefer an explicit heading such as "ANSWER KEY" / "Answers:" —
    #    only search the back half of the document to avoid a stray match.
    for i in range(n // 2, n):
        if ANSWER_KEY_HEADING_RE.match(paragraphs_text[i].strip()):
            return i

    # 2) Fallback: look for a run of compact "NNa" style tokens, and take
    #    the last such match if it's in the back ~30% of the document.
    joined = '\n'.join(paragraphs_text)
    matches = list(re.finditer(r'(\d+[a-d]\s*)+', joined, re.IGNORECASE))
    if matches:
        last_match = matches[-1]
        if last_match.start() > len(joined) * 0.7:
            # Convert character offset back to a paragraph index
            offset = 0
            for idx, line in enumerate(paragraphs_text):
                offset += len(line) + 1  # +1 for the '\n' join
                if offset > last_match.start():
                    return idx

    return None


def extract_questions_and_answers(docx_path_or_file):
    """
    Extract questions and answers from a DOCX file and return a list of dicts:
    [{question_number, question_text, options: {a,b,c,d}, correct_answer}, ...]

    docx_path_or_file: a filesystem path (str) or a file-like object (BytesIO)
    """
    doc = Document(docx_path_or_file)
    paragraphs_text = [p.text for p in doc.paragraphs]

    # Where do real questions start?
    start_idx = 0
    for i, line in enumerate(paragraphs_text):
        if re.match(r'^\s*\d+\.\s', line.strip()):
            start_idx = i
            break

    # Where does the answer key begin? (paragraph index, or None)
    answer_key_para_idx = _find_answer_key_paragraph_index(paragraphs_text)

    answer_key_text = ''
    if answer_key_para_idx is not None:
        answer_key_text = '\n'.join(paragraphs_text[answer_key_para_idx:])
    answer_key = _parse_answer_key(answer_key_text)

    # --- Walk paragraphs + tables together to build questions with options,
    # stopping once we cross into the answer-key section. ---
    questions = []
    current_question = None
    current_options = {}
    question_number = None
    inline_answer = None
    started = False
    para_counter = -1  # tracks index within doc.paragraphs as we walk

    for item in _iter_block_items(doc):
        if isinstance(item, Paragraph):
            para_counter += 1

            if answer_key_para_idx is not None and para_counter >= answer_key_para_idx:
                break

            line = item.text.strip()

            if not started:
                if para_counter >= start_idx and QUESTION_START_RE.match(line):
                    started = True
                else:
                    continue

            if not line:
                continue

            qmatch = QUESTION_START_RE.match(line)
            if qmatch:
                if current_question is not None and question_number is not None:
                    questions.append({
                        'question_number': question_number,
                        'question_text': current_question.strip(),
                        'options': current_options.copy(),
                        'inline_answer': inline_answer,
                    })
                question_number = int(qmatch.group(1))
                current_question = qmatch.group(2)
                current_options = {}
                inline_answer = None
                continue

            omatch = OPTION_LINE_RE.match(line)
            if omatch:
                letter = omatch.group(1).lower()
                current_options[letter] = omatch.group(2).strip()
                continue

            # Inline answer under this question's options. Only trust it once
            # the options are actually there, otherwise "a) ..." style text
            # elsewhere could be misread as an answer.
            amatch = INLINE_ANSWER_RE.match(line)
            if amatch and current_question is not None and len(current_options) >= 2:
                inline_answer = amatch.group(1).lower()
                continue

            # Skip stray compact-answer-key-looking lines; otherwise treat
            # as a continuation of the current question's text.
            if current_question is not None and not COMPACT_ANSWER_KEY_LINE_RE.match(line):
                if current_question.endswith(' ') or current_question == '':
                    current_question += line
                else:
                    current_question += ' ' + line

        elif isinstance(item, Table):
            if answer_key_para_idx is not None and para_counter >= answer_key_para_idx:
                break
            if current_question is None:
                continue
            for row in item.rows:
                for cell in row.cells:
                    ctext = cell.text.strip()
                    cmatch = CELL_OPTION_RE.match(ctext)
                    if cmatch:
                        letter = cmatch.group(1).lower()
                        current_options[letter] = cmatch.group(2).strip()

    if current_question is not None and question_number is not None:
        questions.append({
            'question_number': question_number,
            'question_text': current_question.strip(),
            'options': current_options.copy(),
            'inline_answer': inline_answer,
        })

    for q in questions:
        # A trailing "ANSWER KEY" section wins over an inline answer; that is
        # the authoritative source when both are present.
        q['correct_answer'] = answer_key.get(q['question_number']) or q.pop('inline_answer', None)

    return questions


def _parse_answer_key(text):
    answer_key = {}
    for num_str, letter in FLEXIBLE_ANSWER_PAIR_RE.findall(text):
        answer_key[int(num_str)] = letter.lower()
    return answer_key


def guess_category_from_filename(filename: str) -> str:
    """
    Guess a human-readable category from the uploaded filename.
    Handles common naming patterns like:
      - biodiversity_protected_area_management_Objective.docx
      - Forest_Research_Survey_Objective.docx
      - Silviculture_Practice.docx
      - RangerPracticeQns.docx
    """
    name = filename.lower().replace('_', ' ').replace('-', ' ')

    # Named practice sets (exact patterns, checked first)
    if 'ranger' in name and 'practice' in name:
        return 'RangerPracticeQns'
    elif 'officer' in name and 'practice' in name:
        return 'OfficerPracticeQns'
    elif 'gk' in name and 'practice' in name:
        return 'GKPracticeQns'
    elif 'iq' in name and 'practice' in name:
        return 'IQPracticeQns'

    # Topic-based categories (specific before general)
    if 'biodiversity' in name or 'wildlife' in name:
        return 'Biodiversity & Wildlife Management'
    elif 'forest research' in name or ('research' in name and 'survey' in name):
        return 'Forestry Research & Statistics'
    elif 'silviculture' in name:
        return 'Silviculture'
    elif 'forest management' in name:
        return 'Forest Management'
    elif 'forest utilization' in name:
        return 'Forest Utilization'
    elif 'geography' in name or 'geology' in name:
        return 'Geography & Geology'
    elif 'environment' in name or 'ecology' in name:
        return 'Environment & Ecology'
    elif 'law' in name or 'act' in name or 'policy' in name:
        return 'Forest Law & Policy'
    elif 'forest' in name:
        return 'Forest Management'
    elif 'practice' in name:
        return 'GeneralPracticeQns'

    # Fallback: capitalize first words from filename
    words = name.split()
    if words:
        return ' '.join(w.capitalize() for w in words[:3])
    return 'General'
