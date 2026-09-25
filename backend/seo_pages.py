"""SEO landing pages for the Forestry Loksewa mirror service.

Registered ONLY when SITE_BRAND=loksewa (PSC service keeps its exact
current behavior). All pages are server-rendered HTML so search engines
see title, H1, intro, links and structured data without JavaScript.
Brand strings adapt via SITE_BRAND; canonical/OG URLs use the request
host, so each domain is self-consistent.
"""

import os
import time
import html as _html

SITE_BRAND = os.environ.get("SITE_BRAND", "").strip().lower()
IS_LOKSEWA = SITE_BRAND == "loksewa"

BRAND = "Forestry Loksewa Preparation" if IS_LOKSEWA else "Forestry PSC Preparation"
BRAND_SHORT = "Forestry Loksewa" if IS_LOKSEWA else "Forestry PSC"
CONTACT_EMAIL = "forestrypscpreparation@gmail.com"
OFFICIAL_PSC = "https://psc.gov.np"

INDEX_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
NOINDEX_ROBOTS = "noindex, follow"

# ---------------------------------------------------------------- live stats
_stats_cache = {"at": 0.0, "total": 0, "cats": {}}
STATS_TTL = 600


def get_live_stats():
    """Total + per-category counts from the production database (10-min cache)."""
    now = time.time()
    if now - _stats_cache["at"] < STATS_TTL and _stats_cache["total"]:
        return _stats_cache["total"], _stats_cache["cats"]
    total, cats = 0, {}
    try:
        import models
        from database import SessionLocal

        db = SessionLocal()
        try:
            from sqlalchemy import func

            total = db.query(func.count(models.Question.id)).scalar() or 0
            rows = (
                db.query(models.Question.category, func.count(models.Question.id))
                .group_by(models.Question.category)
                .all()
            )
            cats = { (c or "Uncategorized"): n for c, n in rows }
        finally:
            db.close()
    except Exception:
        pass
    if total:
        _stats_cache.update({"at": now, "total": total, "cats": cats})
    else:
        total, cats = _stats_cache["total"], _stats_cache["cats"]
    return total, cats


def fmt(n):
    return f"{n:,}"


def _cat_count(cats, *names):
    return sum(cats.get(n, 0) for n in names)


# ------------------------------------------------------------------- pages
# Each page: genuine, unique content. {brand} placeholders resolve per service.
PAGES = [
    {
        "slug": "forestry-loksewa",
        "title": "Forestry Loksewa Preparation Nepal | MCQ, Syllabus & Mock Tests",
        "description": "Prepare for Forestry Loksewa in Nepal with forestry MCQs, syllabus, practice questions, mock tests and exam preparation for Ranger, Forester and Forest Officer.",
        "h1": "Forestry Loksewa Preparation Nepal",
        "intro": (
            "Forestry Loksewa Preparation Nepal is your free online platform for Nepal forestry service "
            "examination preparation. Practice thousands of forestry MCQs, review Loksewa forestry exam "
            "syllabus topics, attempt timed mock tests and track your progress — for Ranger Loksewa, "
            "Forester Loksewa, Forest Officer Loksewa and Forest Guard (Ban Rakshak) examinations."
        ),
        "sections": [
            ("Start with Forestry Loksewa MCQs",
             "The fastest way to prepare is daily MCQ practice. Our <a href=\"/forestry-mcq\">forestry MCQ collection</a> "
             "covers silviculture, forest management, biodiversity, soil conservation and forest law. Each question gives "
             "instant right-or-wrong feedback so you learn while you practice."),
            ("Follow the Forestry Loksewa syllabus",
             "Study with direction. The <a href=\"/forestry-loksewa-syllabus\">Forestry Loksewa syllabus guide</a> explains "
             "first-paper and second-paper topics for Ranger, Forester and Officer levels, with links to matching practice sets."),
            ("Test yourself with mock tests",
             "When you are ready, sit a full <a href=\"/forestry-mock-test\">forestry mock test</a> under exam timing. "
             "Wrong answers automatically queue for re-practice, and weekly accuracy reports show exactly where to improve."),
        ],
        "faqs": [
            ("How do I start Forestry Loksewa preparation?",
             "Create a free account with any username and password, then begin with forestry MCQs by subject. Attempt a mock test every week and re-practice every mistake."),
            ("Is Forestry Loksewa preparation on this site free?",
             "Yes. All forestry MCQs, practice sets and mock tests are free, on both mobile and desktop."),
            ("Which posts does this cover?",
             "Ranger Loksewa, Forester Loksewa, Forest Officer Loksewa and Forest Guard (Ban Rakshak) Loksewa preparation."),
        ],
        "related": [
            ("Ranger Loksewa syllabus", "/ranger-loksewa"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
            ("Forestry mock tests", "/forestry-mock-test"),
            ("Forestry question bank", "/forestry-question-bank"),
            ("Silviculture MCQs", "/forestry/silviculture"),
        ],
        "priority": "0.9",
    },
    {
        "slug": "forestry-loksewa-syllabus",
        "title": "Forestry Loksewa Syllabus Nepal | Ranger, Forester & Officer Syllabus",
        "description": "Forestry Loksewa syllabus guide for Nepal: first paper and second paper topics for Ranger, Forester and Forest Officer exams, with matching MCQ practice sets.",
        "h1": "Forestry Loksewa Syllabus Nepal",
        "intro": (
            "This Forestry Loksewa syllabus guide (वन सेवा लोकसेवा पाठ्यक्रम) helps you plan preparation for Nepal "
            "forestry service examinations. The Public Service Commission Nepal publishes the official syllabus — "
            "always verify against the official notice at <a href=\"https://psc.gov.np\" rel=\"noopener\" target=\"_blank\">psc.gov.np</a>. "
            "Below is a preparation-oriented outline of commonly examined areas for Ranger Loksewa, Forester Loksewa "
            "and Forest Officer Loksewa, each linked to matching practice questions."
        ),
        "sections": [
            ("First paper syllabus topics",
             "The first paper of forestry examinations commonly covers general knowledge, current affairs, governance, "
             "aptitude and service-related legislation. Practice with our <a href=\"/forestry-mcq\">forestry MCQ sets</a> "
             "and <a href=\"/forestry-practice-set\">Loksewa practice sets</a> to build speed and accuracy."),
            ("Second paper syllabus topics",
             "The second paper is technical: silviculture, forest management, forest mensuration and survey, watershed "
             "management, biodiversity and wildlife, forest law and policy. Study each subject below, then test yourself: "
             "<a href=\"/forestry/silviculture\">Silviculture</a> · <a href=\"/forestry/forest-management\">Forest Management</a> · "
             "<a href=\"/forestry/wildlife-management\">Wildlife Management</a> · <a href=\"/forestry/forest-mensuration\">Forest Mensuration</a>."),
            ("Ranger and Forester syllabus focus",
             "Ranger Loksewa syllabus and Forester Loksewa syllabus share the same technical core at different depths. "
             "See <a href=\"/ranger-loksewa-syllabus\">Ranger syllabus</a> and <a href=\"/forester-loksewa-syllabus\">Forester syllabus</a> "
             "for level-wise guidance, and <a href=\"/forest-guard-syllabus\">Forest Guard syllabus</a> for Ban Rakshak preparation."),
        ],
        "faqs": [
            ("Where is the official Forestry Loksewa syllabus published?",
             "The official syllabus and notices are published by the Public Service Commission Nepal at psc.gov.np. This page is a preparation guide, not an official document."),
            ("How should I use the syllabus for preparation?",
             "Map every syllabus topic to a practice set, finish all MCQs in a subject before moving on, and revise mistakes weekly with mock tests."),
        ],
        "related": [
            ("Ranger Loksewa syllabus", "/ranger-loksewa-syllabus"),
            ("Forest Officer syllabus", "/forest-officer-syllabus"),
            ("Forestry Loksewa preparation", "/forestry-loksewa-preparation"),
            ("Forestry mock tests", "/forestry-mock-test"),
        ],
        "priority": "0.9",
    },
    {
        "slug": "forestry-loksewa-preparation",
        "title": "How to Prepare for Forestry Loksewa Nepal | Study Plan & Practice",
        "description": "How to prepare for Forestry Loksewa in Nepal: a practical study plan with forestry MCQs, syllabus coverage, mock tests and revision for Ranger, Forester and Officer.",
        "h1": "How to Prepare for Forestry Loksewa",
        "intro": (
            "Wondering how to prepare for Forestry Loksewa or Ranger Loksewa? The method that works is simple: cover the "
            "syllabus subject by subject, practice hundreds of forestry MCQs with instant feedback, sit regular mock tests, "
            "and systematically re-practice every mistake. This page gives you that exact loop, free, for Nepal forestry "
            "service examinations."
        ),
        "sections": [
            ("Step 1 — Learn subject by subject",
             "Work through one forestry subject at a time — <a href=\"/forestry/silviculture\">silviculture</a>, "
             "<a href=\"/forestry/forest-management\">forest management</a>, <a href=\"/forestry/wildlife-management\">wildlife management</a> — "
             "using the <a href=\"/forestry-loksewa-syllabus\">syllabus guide</a> as your checklist."),
            ("Step 2 — Practice forestry MCQs daily",
             "Attempt a <a href=\"/forestry-practice-set\">daily practice set</a> from the <a href=\"/forestry-question-bank\">question bank</a>. "
             "Two focused minutes per question builds the speed the real exam demands."),
            ("Step 3 — Mock tests and revision",
             "Take a weekly <a href=\"/forestry-mock-test\">forestry mock test</a>, review the category-wise analysis, and clear your "
             "mistake queue before the next test. Track it all on your progress page."),
        ],
        "faqs": [
            ("How many months does Forestry Loksewa preparation take?",
             "It depends on your background, but consistent daily MCQ practice plus weekly mock tests over a few months is a proven pattern for Ranger and Forester aspirants."),
            ("How do I prepare for Ranger Loksewa specifically?",
             "Follow the same loop with extra weight on technical forestry subjects. See <a href=\"/ranger-loksewa\">Ranger Loksewa preparation</a>."),
        ],
        "related": [
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
            ("Ranger Loksewa preparation", "/ranger-loksewa"),
            ("Forestry practice sets", "/forestry-practice-set"),
            ("Forest Officer preparation", "/forest-officer-loksewa"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "ranger-loksewa",
        "title": "Ranger Loksewa Nepal | Syllabus, MCQ & Mock Test",
        "description": "Ranger Loksewa Nepal preparation: syllabus guide, Ranger MCQs, practice sets and mock tests for Nepal forest service Ranger examinations.",
        "h1": "Ranger Loksewa Nepal",
        "intro": (
            "Ranger Loksewa (रेञ्जर लोकसेवा) is one of the most competitive Nepal forest service examinations. Prepare with "
            "Ranger-focused forestry MCQs, the <a href=\"/ranger-loksewa-syllabus\">Ranger Loksewa syllabus</a>, "
            "<a href=\"/ranger-mcq\">Ranger practice questions</a> and full <a href=\"/ranger-mock-test\">Ranger mock tests</a> — "
            "free, with instant feedback and mistake revision."
        ),
        "sections": [
            ("Ranger Loksewa syllabus",
             "Start from the official syllabus (verify at psc.gov.np), then use our <a href=\"/ranger-loksewa-syllabus\">Ranger syllabus guide</a> "
             "to convert topics into a study checklist with matching practice sets."),
            ("Ranger MCQs and practice sets",
             "Build accuracy with <a href=\"/ranger-mcq\">Ranger MCQs</a> across silviculture, forest management, mensuration, "
             "watershed and forest law — plus dedicated <a href=\"/forestry-practice-set\">Loksewa practice sets</a>."),
            ("Ranger mock tests",
             "Simulate exam day with timed <a href=\"/ranger-mock-test\">Ranger mock tests</a>. Review every wrong answer the same day; "
             "unrevised mistakes are the costliest marks in Loksewa."),
        ],
        "faqs": [
            ("What subjects matter most for Ranger Loksewa?",
             "Technical forestry subjects — silviculture, forest management, mensuration and survey, watershed management — plus service-related law and general knowledge."),
            ("Are Ranger mock tests free here?",
             "Yes. All Ranger MCQs, practice sets and mock tests on this platform are free."),
        ],
        "related": [
            ("Ranger Loksewa syllabus", "/ranger-loksewa-syllabus"),
            ("Ranger MCQs", "/ranger-mcq"),
            ("Ranger mock tests", "/ranger-mock-test"),
            ("Forester Loksewa", "/forester-loksewa"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
        ],
        "priority": "0.9",
    },
    {
        "slug": "ranger-loksewa-syllabus",
        "title": "Ranger Loksewa Syllabus Nepal | First & Second Paper Guide",
        "description": "Ranger Loksewa syllabus Nepal guide: Ranger first paper and second paper topics, preparation strategy and matching MCQ practice sets.",
        "h1": "Ranger Loksewa Syllabus Nepal",
        "intro": (
            "This Ranger Loksewa syllabus guide (रेञ्जर पाठ्यक्रम) organizes your preparation around first-paper and "
            "second-paper topics. The official Ranger syllabus is published by the Public Service Commission Nepal — confirm "
            "details at <a href=\"https://psc.gov.np\" rel=\"noopener\" target=\"_blank\">psc.gov.np</a>. Use the outline below as a "
            "study checklist linked to practice material."
        ),
        "sections": [
            ("Ranger first paper syllabus",
             "General knowledge, current affairs, governance and aptitude form the first paper. Daily current-affairs reading plus "
             "<a href=\"/forestry-practice-set\">timed practice sets</a> keeps this paper scoring."),
            ("Ranger second paper syllabus",
             "The technical core: silviculture, forest management, forest mensuration, watershed management, biodiversity and "
             "forest legislation. Practice each: <a href=\"/forestry/silviculture\">Silviculture MCQs</a>, "
             "<a href=\"/forestry/forest-management\">Forest Management MCQs</a>, <a href=\"/forestry/wildlife-management\">Wildlife MCQs</a>."),
            ("From syllabus to selection",
             "Finish every topic with MCQs, then prove readiness with <a href=\"/ranger-mock-test\">Ranger mock tests</a> and the "
             "<a href=\"/forestry-question-bank\">full question bank</a>."),
        ],
        "faqs": [
            ("Is this the official Ranger syllabus?",
             "No. This is a preparation guide. The official Ranger Loksewa syllabus is published by the Public Service Commission Nepal."),
        ],
        "related": [
            ("Ranger Loksewa preparation", "/ranger-loksewa"),
            ("Ranger MCQs", "/ranger-mcq"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
            ("Forester syllabus", "/forester-loksewa-syllabus"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "ranger-mcq",
        "title": "Ranger Loksewa MCQ | Practice Questions & Model Sets",
        "description": "Free Ranger Loksewa MCQ practice: Ranger practice questions, model sets and instant answers for Nepal forestry Ranger exam preparation.",
        "h1": "Ranger Loksewa MCQ Practice",
        "intro": (
            "Practice free Ranger Loksewa MCQs drawn from a large forestry question bank. Every Ranger practice question gives "
            "instant feedback, and mistakes queue automatically for revision — the fastest way to raise Ranger exam scores."
        ),
        "sections": [
            ("Ranger model questions by subject",
             "Attempt <a href=\"/forestry/silviculture\">silviculture</a>, <a href=\"/forestry/forest-management\">forest management</a> and "
             "<a href=\"/forestry/wildlife-management\">wildlife management</a> questions, or open the full <a href=\"/forestry-question-bank\">question bank</a>."),
            ("From MCQs to mock tests",
             "When accuracy crosses 80%, move to timed <a href=\"/ranger-mock-test\">Ranger mock tests</a> and track weekly progress."),
        ],
        "faqs": [
            ("How many Ranger MCQs should I practice daily?",
             "A focused set of 25–50 questions daily with same-day mistake revision beats occasional long sessions."),
        ],
        "related": [
            ("Ranger Loksewa", "/ranger-loksewa"),
            ("Ranger mock tests", "/ranger-mock-test"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forestry practice sets", "/forestry-practice-set"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "ranger-mock-test",
        "title": "Ranger Mock Test Nepal | Free Online Forestry Mock Tests",
        "description": "Free Ranger mock test online: timed Forestry Loksewa mock tests with instant results, mistake revision and progress tracking.",
        "h1": "Ranger Mock Test Nepal",
        "intro": (
            "Sit a free Ranger mock test under real exam timing. You get instant scoring, category-wise analysis, automatic "
            "mistake revision queues and weekly progress tracking — everything a Ranger Loksewa aspirant needs on exam day."
        ),
        "sections": [
            ("Before your first mock test",
             "Warm up with <a href=\"/ranger-mcq\">Ranger MCQs</a> and review the <a href=\"/ranger-loksewa-syllabus\">Ranger syllabus</a> so the test measures readiness, not unfamiliarity."),
            ("After the test",
             "Clear your mistake queue, note weak categories, and drill them in the <a href=\"/forestry-question-bank\">question bank</a> before the next mock."),
        ],
        "faqs": [
            ("How often should I take Ranger mock tests?",
             "Weekly during preparation, twice a week in the final month, always with full mistake revision."),
        ],
        "related": [
            ("Forestry mock tests", "/forestry-mock-test"),
            ("Ranger MCQs", "/ranger-mcq"),
            ("Ranger Loksewa", "/ranger-loksewa"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forester-loksewa",
        "title": "Forester Loksewa Nepal | Syllabus, Questions & Practice",
        "description": "Forester Loksewa Nepal preparation: syllabus, Forester MCQs, practice questions and mock tests for Nepal forestry service examinations.",
        "h1": "Forester Loksewa Nepal",
        "intro": (
            "Forester Loksewa preparation demands depth in technical forestry alongside first-paper general studies. Use the "
            "<a href=\"/forester-loksewa-syllabus\">Forester syllabus guide</a>, drill <a href=\"/forester-mcq\">Forester MCQs</a>, "
            "and validate readiness with <a href=\"/forestry-mock-test\">forestry mock tests</a>."
        ),
        "sections": [
            ("Forester syllabus coverage",
             "Map your study to the <a href=\"/forester-loksewa-syllabus\">Forester Loksewa syllabus</a> (verify official text at psc.gov.np), "
             "then practice subject-wise: <a href=\"/forestry/silviculture\">Silviculture</a>, <a href=\"/forestry/forest-mensuration\">Mensuration</a>, "
             "<a href=\"/forestry/forest-management\">Management</a>."),
            ("Forester MCQs and revision",
             "Daily <a href=\"/forester-mcq\">Forester practice questions</a> with instant feedback, plus automatic re-practice of mistakes, "
             "build the accuracy Forest Service selection needs."),
        ],
        "faqs": [
            ("How is Forester Loksewa different from Ranger Loksewa?",
             "Both test technical forestry, with Forester going deeper into theory and management. The preparation loop — syllabus, MCQs, mocks — is the same."),
        ],
        "related": [
            ("Forester syllabus", "/forester-loksewa-syllabus"),
            ("Forester MCQs", "/forester-mcq"),
            ("Ranger Loksewa", "/ranger-loksewa"),
            ("Forest Officer Loksewa", "/forest-officer-loksewa"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forester-loksewa-syllabus",
        "title": "Forester Loksewa Syllabus Nepal | Study Guide & Practice",
        "description": "Forester Loksewa syllabus Nepal: topic-wise study guide with matching MCQ practice for Forester-level Nepal forestry examinations.",
        "h1": "Forester Loksewa Syllabus Nepal",
        "intro": (
            "Plan Forester preparation topic by topic. The official Forester syllabus comes from the Public Service Commission "
            "Nepal (psc.gov.np); this guide turns its commonly examined areas — advanced silviculture, management, mensuration, "
            "watershed, policy — into a checklist with linked practice."
        ),
        "sections": [
            ("Technical depth for Forester level",
             "Go beyond definitions into application: <a href=\"/forestry/silviculture\">silvicultural systems</a>, "
             "<a href=\"/forestry/forest-management\">working plans and yield</a>, <a href=\"/forestry/forest-mensuration\">mensuration methods</a>."),
            ("Prove it with tests",
             "Convert syllabus coverage into marks via <a href=\"/forester-mcq\">Forester MCQs</a> and <a href=\"/forestry-mock-test\">mock tests</a>."),
        ],
        "faqs": [
            ("Is this the official Forester syllabus?",
             "No — a preparation guide. Confirm the official Forester Loksewa syllabus at psc.gov.np."),
        ],
        "related": [
            ("Forester Loksewa", "/forester-loksewa"),
            ("Forester MCQs", "/forester-mcq"),
            ("Ranger syllabus", "/ranger-loksewa-syllabus"),
            ("Forest Officer syllabus", "/forest-officer-syllabus"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forester-mcq",
        "title": "Forester MCQ Nepal | Forestry Practice Questions",
        "description": "Free Forester MCQ practice for Nepal: forestry practice questions with instant answers for Forester Loksewa exam preparation.",
        "h1": "Forester MCQ Practice",
        "intro": (
            "Free Forester MCQs with instant answers. Practice by subject from the <a href=\"/forestry-question-bank\">forestry question bank</a>, "
            "revise mistakes automatically, and step up to <a href=\"/forestry-mock-test\">mock tests</a> as accuracy grows."
        ),
        "sections": [
            ("Practice by subject",
             "<a href=\"/forestry/silviculture\">Silviculture</a> · <a href=\"/forestry/forest-management\">Forest Management</a> · "
             "<a href=\"/forestry/wildlife-management\">Wildlife Management</a> · <a href=\"/forestry/forest-protection\">Forest Protection</a>"),
        ],
        "faqs": [
            ("Are Forester MCQs free?",
             "Yes — every MCQ, practice set and mock test on this platform is free."),
        ],
        "related": [
            ("Forester Loksewa", "/forester-loksewa"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forestry mock tests", "/forestry-mock-test"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forest-officer-loksewa",
        "title": "Forest Officer Loksewa Nepal | Syllabus & Exam Preparation",
        "description": "Forest Officer Loksewa Nepal preparation: syllabus guide, Forest Officer MCQs and exam strategy for Nepal forest service officer examinations.",
        "h1": "Forest Officer Loksewa Nepal",
        "intro": (
            "Forest Officer Loksewa (वन अधिकृत लोकसेवा) is the gazetted officer gateway into the Nepal forestry service. "
            "Officer preparation needs conceptual command over the full forestry syllabus plus precise first-paper scoring. Start with the "
            "<a href=\"/forest-officer-syllabus\">Forest Officer syllabus guide</a>, drill <a href=\"/forest-officer-mcq\">Forest Officer MCQs</a>, "
            "and finish with <a href=\"/forestry-mock-test\">timed mock tests</a>."
        ),
        "sections": [
            ("Officer syllabus strategy",
             "Officer papers reward integrated understanding — policy with practice, ecology with management. Study the "
             "<a href=\"/forest-officer-syllabus\">syllabus guide</a>, verifying official details at psc.gov.np."),
            ("Officer MCQs and mocks",
             "Daily <a href=\"/forest-officer-mcq\">Forest Officer practice questions</a> across all 14 categories, weekly "
             "<a href=\"/forestry-mock-test\">mock tests</a>, and disciplined mistake revision."),
        ],
        "faqs": [
            ("What is the Forest Officer Loksewa exam pattern?",
             "Typically a first paper on general/administrative topics and a technical second paper. Confirm the current pattern in the official PSC notice."),
        ],
        "related": [
            ("Forest Officer syllabus", "/forest-officer-syllabus"),
            ("Forest Officer MCQs", "/forest-officer-mcq"),
            ("Forester Loksewa", "/forester-loksewa"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forest-officer-syllabus",
        "title": "Forest Officer Syllabus Nepal | Loksewa Study Guide",
        "description": "Forest Officer syllabus Nepal (वन अधिकृत पाठ्यक्रम): preparation guide with topic checklist and linked MCQ practice for officer-level exams.",
        "h1": "Forest Officer Syllabus Nepal",
        "intro": (
            "This Forest Officer syllabus guide (वन अधिकृत पाठ्यक्रम) structures officer-level study across policy, management, "
            "ecology and field sciences. It is a preparation aid — the authoritative syllabus is published by the Public Service "
            "Commission Nepal at psc.gov.np."
        ),
        "sections": [
            ("Officer-level topic map",
             "Forest policy and legislation, working-plan management, watershed and climate, biodiversity conservation. Practice: "
             "<a href=\"/forestry/forest-management\">Management</a>, <a href=\"/forestry/wildlife-management\">Wildlife</a>, "
             "<a href=\"/forestry/forest-protection\">Protection & Law</a>."),
            ("Test at officer standard",
             "<a href=\"/forest-officer-mcq\">Officer MCQs</a> then <a href=\"/forestry-mock-test\">mock tests</a>; review every error the same day."),
        ],
        "faqs": [
            ("Is this the official officer syllabus?",
             "No. Always confirm with the official Forest Officer syllabus notice from the Public Service Commission Nepal."),
        ],
        "related": [
            ("Forest Officer Loksewa", "/forest-officer-loksewa"),
            ("Forest Officer MCQs", "/forest-officer-mcq"),
            ("Forester syllabus", "/forester-loksewa-syllabus"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forest-officer-mcq",
        "title": "Forest Officer MCQ Nepal | Practice Questions",
        "description": "Free Forest Officer MCQ practice: officer-level forestry questions with answers for Nepal forest service exam preparation.",
        "h1": "Forest Officer MCQ Practice",
        "intro": (
            "Officer-level forestry MCQs with instant answers — free. Draw from the <a href=\"/forestry-question-bank\">question bank</a>, "
            "revise mistakes automatically, and validate with <a href=\"/forestry-mock-test\">mock tests</a>."
        ),
        "sections": [
            ("Officer practice by subject",
             "<a href=\"/forestry/forest-management\">Forest Management</a> · <a href=\"/forestry/wildlife-management\">Wildlife Management</a> · "
             "<a href=\"/forestry/silviculture\">Silviculture</a> · <a href=\"/forestry/forest-engineering\">Forest Engineering & Utilization</a>"),
        ],
        "faqs": [
            ("Are these enough for officer preparation?",
             "They cover breadth well. Combine daily MCQs with syllabus study and weekly mock tests for complete preparation."),
        ],
        "related": [
            ("Forest Officer Loksewa", "/forest-officer-loksewa"),
            ("Forest Officer syllabus", "/forest-officer-syllabus"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forest-guard-loksewa",
        "title": "Forest Guard Loksewa (Ban Rakshak) | Syllabus & MCQ Practice",
        "description": "Forest Guard Loksewa preparation (वन रक्षक लोकसेवा): syllabus, Ban Rakshak MCQs and practice sets for Nepal forest guard examinations.",
        "h1": "Forest Guard Loksewa (Ban Rakshak)",
        "intro": (
            "Forest Guard Loksewa — Ban Rakshak (वन रक्षक / बन रक्षक) — protects Nepal's forests on the ground. Prepare with the "
            "<a href=\"/forest-guard-syllabus\">Forest Guard syllabus guide</a>, grassroots-level forestry MCQs from the "
            "<a href=\"/forestry-question-bank\">question bank</a>, and regular <a href=\"/forestry-mock-test\">mock tests</a>."
        ),
        "sections": [
            ("Guard syllabus essentials",
             "Forest basics, protection duties, community forestry, fire control and service rules — see the "
             "<a href=\"/forest-guard-syllabus\">detailed syllabus guide</a> (verify official text at psc.gov.np)."),
            ("Guard MCQ practice",
             "Start with <a href=\"/forestry-mcq\">forestry MCQs</a>, focusing on <a href=\"/forestry/forest-protection\">protection</a> and "
             "<a href=\"/forestry/wildlife-management\">wildlife</a> topics guards meet daily."),
        ],
        "faqs": [
            ("What is Ban Rakshak in Nepal Loksewa?",
             "Ban Rakshak (Forest Guard) is the frontline forest protection post in the Nepal forestry service, recruited through Loksewa examinations."),
        ],
        "related": [
            ("Forest Guard syllabus", "/forest-guard-syllabus"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Ranger Loksewa", "/ranger-loksewa"),
            ("Ban Loksewa", "/ban-loksewa"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forest-guard-syllabus",
        "title": "Forest Guard Syllabus Nepal (Ban Rakshak) | Study Guide",
        "description": "Forest Guard syllabus Nepal: Ban Rakshak (वन रक्षक पाठ्यक्रम) preparation guide with linked MCQ practice for forest guard exams.",
        "h1": "Forest Guard Syllabus Nepal",
        "intro": (
            "This Ban Rakshak syllabus guide (वन रक्षक पाठ्यक्रम / बन रक्षक पाठ्यक्रम) lists the areas Forest Guard aspirants must "
            "master. Confirm the official syllabus at psc.gov.np; use this page as your study checklist with linked practice."
        ),
        "sections": [
            ("Guard syllabus topics",
             "Forest and wildlife basics, protection and patrolling, fire management, community forestry, nursery work and service conduct. "
             "Practice: <a href=\"/forestry/forest-protection\">Forest Protection</a>, <a href=\"/forestry/forest-fire-management\">Fire Management</a>, "
             "<a href=\"/forestry/silviculture\">Silviculture basics</a>."),
            ("Practice loop for guards",
             "<a href=\"/forestry-mcq\">Daily MCQs</a> → <a href=\"/forestry-practice-set\">practice sets</a> → <a href=\"/forestry-mock-test\">mock tests</a>."),
        ],
        "faqs": [
            ("Is this the official Ban Rakshak syllabus?",
             "No — a preparation guide. The official Forest Guard syllabus is published by the Public Service Commission Nepal."),
        ],
        "related": [
            ("Forest Guard Loksewa", "/forest-guard-loksewa"),
            ("Ban Loksewa", "/ban-loksewa"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "ban-loksewa",
        "title": "Ban Loksewa (वन लोकसेवा) | Forestry Service Exam Preparation",
        "description": "Ban Loksewa preparation (वन सेवा लोकसेवा तयारी): forestry MCQs, syllabus and mock tests for Nepal ban sewa examinations.",
        "h1": "Ban Loksewa — वन लोकसेवा तयारी",
        "intro": (
            "Ban Loksewa (वन लोकसेवा / वन सेवा लोकसेवा) covers Nepal's forest service examinations — from Ban Rakshak to Ranger, "
            "Forester and Forest Officer. This hub links every preparation resource: <a href=\"/forestry-loksewa-syllabus\">syllabus (पाठ्यक्रम)</a>, "
            "<a href=\"/forestry-mcq\">MCQs (बहुविकल्पीय प्रश्न)</a>, <a href=\"/forestry-mock-test\">mock tests</a> and role-wise guides for "
            "<a href=\"/ranger-loksewa\">Ranger</a>, <a href=\"/forester-loksewa\">Forester</a>, <a href=\"/forest-officer-loksewa\">Officer</a> and "
            "<a href=\"/forest-guard-loksewa\">Guard</a>."
        ),
        "sections": [
            ("Ban Sewa posts and preparation",
             "Each ban sewa post shares the forestry core with different depth. Pick your post guide above, follow its syllabus checklist, "
             "and practice daily from the <a href=\"/forestry-question-bank\">question bank</a>."),
        ],
        "faqs": [
            ("What does Ban Loksewa mean?",
             "Ban (वन) means forest in Nepali. Ban Loksewa refers to Nepal's forestry service examinations conducted through the Public Service Commission."),
        ],
        "related": [
            ("Forestry Loksewa preparation", "/forestry-loksewa"),
            ("Forest Guard Loksewa", "/forest-guard-loksewa"),
            ("Ranger Loksewa", "/ranger-loksewa"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forestry-mcq",
        "title": "Forestry Loksewa MCQ Nepal | Free Practice Questions with Answers",
        "description": "Free Forestry Loksewa MCQ practice: thousands of forestry questions with instant answers, by subject, for Ranger, Forester and Officer exams.",
        "h1": "Forestry Loksewa MCQ Practice",
        "intro": (
            "Practice free forestry MCQs (वन सेवाका बहुविकल्पीय प्रश्न) with instant answers. The bank spans silviculture, forest management, "
            "mensuration, watershed, biodiversity and forest law — attempt by subject, get immediate feedback, and auto-queue mistakes for revision."
        ),
        "sections": [
            ("MCQs by forestry subject",
             "Choose your battleground: <a href=\"/forestry/silviculture\">Silviculture MCQs</a>, "
             "<a href=\"/forestry/forest-management\">Forest Management MCQs</a>, <a href=\"/forestry/wildlife-management\">Wildlife MCQs</a>, "
             "<a href=\"/forestry/forest-mensuration\">Mensuration MCQs</a>, <a href=\"/forestry/forest-protection\">Protection MCQs</a> — "
             "or browse everything in the <a href=\"/forestry-question-bank\">question bank</a>."),
            ("Role-wise MCQ sets",
             "<a href=\"/ranger-mcq\">Ranger MCQs</a> · <a href=\"/forester-mcq\">Forester MCQs</a> · "
             "<a href=\"/forest-officer-mcq\">Forest Officer MCQs</a> · <a href=\"/forestry-practice-set\">daily practice sets</a>"),
        ],
        "faqs": [
            ("Are forestry MCQs really free?",
             "Yes — unlimited free MCQ practice with answers, mistake revision and progress tracking."),
            ("Do MCQs match the Loksewa exam pattern?",
             "Questions follow the one-best-answer MCQ style used in Loksewa forestry papers, with two-minute timed practice available."),
        ],
        "related": [
            ("Forestry question bank", "/forestry-question-bank"),
            ("Forestry mock tests", "/forestry-mock-test"),
            ("Ranger MCQs", "/ranger-mcq"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
        ],
        "priority": "0.9",
    },
    {
        "slug": "forestry-mock-test",
        "title": "Forestry Mock Test Nepal | Free Loksewa Online Test",
        "description": "Free forestry mock test online: timed Loksewa mock tests with instant results, model questions and mistake revision for Nepal forestry exams.",
        "h1": "Forestry Mock Test Nepal",
        "intro": (
            "Take a free forestry mock test (Loksewa online test) under exam timing. Instant scoring, category-wise breakdown, automatic "
            "mistake revision and weekly trends turn every attempt into measurable progress toward Ranger, Forester and Officer selection."
        ),
        "sections": [
            ("How mock tests work here",
             "Sign in free, choose a test, answer under time, and review instantly. Wrong questions queue for re-practice; your accuracy graph "
             "shows readiness per category. Role-focused? Try the <a href=\"/ranger-mock-test\">Ranger mock test</a>."),
            ("Prepare before you test",
             "Cover the <a href=\"/forestry-loksewa-syllabus\">syllabus</a> and warm up with <a href=\"/forestry-mcq\">MCQs</a> and "
             "<a href=\"/forestry-practice-set\">practice sets</a> so each mock measures true readiness."),
        ],
        "faqs": [
            ("How often should I take forestry mock tests?",
             "One full mock weekly during preparation, more frequently in the final month — always with complete mistake revision."),
        ],
        "related": [
            ("Ranger mock tests", "/ranger-mock-test"),
            ("Forestry practice sets", "/forestry-practice-set"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forestry question bank", "/forestry-question-bank"),
        ],
        "priority": "0.9",
    },
    {
        "slug": "forestry-practice-set",
        "title": "Forestry Practice Sets & Model Questions | Loksewa",
        "description": "Forestry practice sets and Loksewa model questions: Ranger model sets, practice questions and daily drills for Nepal forestry exams.",
        "h1": "Forestry Practice Sets & Model Questions",
        "intro": (
            "Daily forestry practice sets and Loksewa model questions keep preparation sharp. Short timed sets from the question bank build "
            "speed; <a href=\"/ranger-mcq\">Ranger model questions</a> and officer sets build depth. Every set ends with instant answers and revision queues."
        ),
        "sections": [
            ("Daily practice routine",
             "One <a href=\"/forestry-mcq\">MCQ set</a> a day, one <a href=\"/forestry-mock-test\">mock test</a> a week, zero pending mistakes. "
             "Browse the <a href=\"/forestry-question-bank\">question bank</a> for set material by category."),
        ],
        "faqs": [
            ("What is a Loksewa practice set?",
             "A curated group of practice questions — often previous-question style — attempted together under time, exactly as this platform's quizzes work."),
        ],
        "related": [
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forestry mock tests", "/forestry-mock-test"),
            ("Ranger MCQs", "/ranger-mcq"),
            ("Forestry question bank", "/forestry-question-bank"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forestry-question-bank",
        "title": "Forestry Question Bank Nepal | Previous & Model Questions",
        "description": "Nepal forestry question bank: thousands of forestry previous questions, model sets and practice MCQs with answers for Loksewa exams.",
        "h1": "Forestry Question Bank Nepal",
        "intro": (
            "The forestry question bank holds thousands of practice questions across all major categories — searchable, filterable, "
            "with answers shown. Use it for forestry previous-question practice, model sets and targeted drilling of weak topics."
        ),
        "sections": [
            ("Browse by category",
             "Jump to <a href=\"/forestry/silviculture\">Silviculture</a>, <a href=\"/forestry/forest-management\">Forest Management</a>, "
             "<a href=\"/forestry/wildlife-management\">Wildlife Management</a> or <a href=\"/forestry/forest-mensuration\">Mensuration & Survey</a> — "
             "live counts shown on each subject page."),
            ("From bank to exam hall",
             "Study in the bank, prove in <a href=\"/forestry-mock-test\">mock tests</a>, following the <a href=\"/forestry-loksewa-syllabus\">syllabus map</a>."),
        ],
        "faqs": [
            ("Does the bank include previous questions?",
             "The bank contains practice and model questions aligned to Loksewa forestry papers, continuously expanded and corrected."),
        ],
        "related": [
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forestry practice sets", "/forestry-practice-set"),
            ("Forestry mock tests", "/forestry-mock-test"),
        ],
        "priority": "0.8",
    },
    {
        "slug": "forestry-loksewa-first-paper",
        "title": "Forestry Loksewa First Paper | Preparation Guide Nepal",
        "description": "Forestry Loksewa first paper preparation: general knowledge, aptitude and service topics with MCQ practice for Nepal forestry exams.",
        "h1": "Forestry Loksewa First Paper",
        "intro": (
            "The Forestry Loksewa first paper tests breadth — general knowledge, current affairs, governance, aptitude and "
            "service-related basics. It is the highest-scoring paper for prepared candidates. Confirm the official paper pattern at "
            "psc.gov.np, then use this guide to prepare."
        ),
        "sections": [
            ("First-paper preparation method",
             "Daily current affairs, weekly revision, and relentless <a href=\"/forestry-practice-set\">timed practice sets</a>. "
             "Build fundamentals with <a href=\"/forestry-mcq\">forestry MCQs</a> and test with <a href=\"/forestry-mock-test\">mock tests</a>."),
        ],
        "faqs": [
            ("How do I score high in the first paper?",
             "Speed plus accuracy: daily timed sets, current-affairs consistency, and zero repeated mistakes."),
        ],
        "related": [
            ("Second paper guide", "/forestry-loksewa-second-paper"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
            ("Forestry practice sets", "/forestry-practice-set"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forestry-loksewa-second-paper",
        "title": "Forestry Loksewa Second Paper | Technical Syllabus & MCQs",
        "description": "Forestry Loksewa second paper preparation: technical forestry syllabus topics with subject-wise MCQ practice for Nepal exams.",
        "h1": "Forestry Loksewa Second Paper",
        "intro": (
            "The Forestry Loksewa second paper is technical forestry — silviculture, management, mensuration, watershed, biodiversity "
            "and forest law. Depth wins here. Study each subject page below, then drill its MCQs to examination standard."
        ),
        "sections": [
            ("Second-paper subjects",
             "<a href=\"/forestry/silviculture\">Silviculture</a> · <a href=\"/forestry/forest-management\">Forest Management</a> · "
             "<a href=\"/forestry/forest-mensuration\">Mensuration & Survey</a> · <a href=\"/forestry/wildlife-management\">Wildlife Management</a> · "
             "<a href=\"/forestry/forest-protection\">Protection & Law</a> · <a href=\"/forestry/forest-engineering\">Engineering & Utilization</a>"),
            ("Prove technical readiness",
             "Subject MCQs first, then full <a href=\"/forestry-mock-test\">mock tests</a>. See the <a href=\"/forestry-loksewa-syllabus\">syllabus map</a>."),
        ],
        "faqs": [
            ("Which subject is hardest in the second paper?",
             "Most aspirants find mensuration and working-plan numericals toughest — drill them early and often."),
        ],
        "related": [
            ("First paper guide", "/forestry-loksewa-first-paper"),
            ("Forestry Loksewa syllabus", "/forestry-loksewa-syllabus"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "priority": "0.7",
    },
    {
        "slug": "forestry/silviculture",
        "title": "Silviculture MCQ Nepal | Forestry Loksewa Practice",
        "description": "Silviculture MCQ practice for Forestry Loksewa: regeneration, tending, systems and nursery questions with answers.",
        "h1": "Silviculture MCQs",
        "intro": (
            "Silviculture — the art and science of growing forests — carries heavy weight in every Forestry Loksewa paper. Practice "
            "regeneration methods, silvicultural systems, tending operations and nursery techniques with instant answers."
        ),
        "sections": [
            ("Key silviculture topics",
             "Natural and artificial regeneration, clear-felling / shelterwood / selection systems, thinning and pruning, plus-tree selection, "
             "nursery and plantation practice — all represented in the question bank."),
        ],
        "faqs": [
            ("How many silviculture questions are in the bank?",
             "The live count is shown in the practice box above, drawn directly from the question bank."),
        ],
        "related": [
            ("Forest Management", "/forestry/forest-management"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Second paper guide", "/forestry-loksewa-second-paper"),
        ],
        "cats": ["Silviculture"],
        "priority": "0.8",
    },
    {
        "slug": "forestry/forest-management",
        "title": "Forest Management MCQ Nepal | Working Plan & Yield Practice",
        "description": "Forest management MCQ practice: working plans, yield regulation, rotation and mensuration-linked questions for Loksewa forestry.",
        "h1": "Forest Management MCQs",
        "intro": (
            "Forest management MCQs test working plans, sustained yield, rotation, growing stock and management objectives — the "
            "analytical core of Forestry Loksewa second papers. Practice with instant feedback and revise every mistake."
        ),
        "sections": [
            ("Key management topics",
             "Working plan preparation, yield tables and regulation, rotation determination, normal forest concept, community and leasehold "
             "forestry provisions — covered across bank categories."),
        ],
        "faqs": [
            ("Are numerical management questions included?",
             "Yes — yield, rotation and growing-stock numericals appear with step-clear answers and instant checking."),
        ],
        "related": [
            ("Silviculture", "/forestry/silviculture"),
            ("Mensuration & Survey", "/forestry/forest-mensuration"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "cats": ["Forest Management"],
        "priority": "0.8",
    },
    {
        "slug": "forestry/forest-mensuration",
        "title": "Forest Mensuration & Survey MCQ | Loksewa Practice",
        "description": "Forest mensuration and survey MCQs: tree measurement, volume tables, sampling and survey methods for Forestry Loksewa.",
        "h1": "Forest Mensuration & Survey MCQs",
        "intro": (
            "Forest mensuration — tree and stand measurement — plus forest survey methods form the numerical backbone of Loksewa forestry "
            "papers. Practice diameter, height, volume and sampling questions drawn from the survey and research question collection."
        ),
        "sections": [
            ("Key mensuration topics",
             "DBH and height measurement, volume equations and tables, stand density and site quality, sampling design, chain and compass "
             "survey basics, maps and GPS use in forestry."),
        ],
        "faqs": [
            ("Where do mensuration questions live in the bank?",
             "Within the Forestry Research & Forest Survey collection — the practice box above shows its live size."),
        ],
        "related": [
            ("Forest Management", "/forestry/forest-management"),
            ("Silviculture", "/forestry/silviculture"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "cats": ["Forestry Research & Forest Survey"],
        "priority": "0.7",
    },
    {
        "slug": "forestry/forest-protection",
        "title": "Forest Protection & Law MCQ Nepal | Loksewa Practice",
        "description": "Forest protection and forest law MCQs: encroachment, offences, fire control and Nepal forest legislation for Loksewa.",
        "h1": "Forest Protection & Law MCQs",
        "intro": (
            "Forest protection MCQs cover offences and penalties, encroachment control, fire prevention, and Nepal's forest legislation and "
            "policy framework — essential for Ranger, Guard and Officer papers alike."
        ),
        "sections": [
            ("Key protection topics",
             "Forest Act and rules concepts, protected-area provisions, community forestry protection roles, fire causes and control, "
             "wildlife crime basics — practiced via the law, policy and management collections."),
        ],
        "faqs": [
            ("Should I memorize Acts for Loksewa?",
             "Understand key provisions and penalties conceptually, then lock them with MCQs — pure rote memorization fades fast."),
        ],
        "related": [
            ("Wildlife Management", "/forestry/wildlife-management"),
            ("Fire Management", "/forestry/forest-fire-management"),
            ("Forest Guard syllabus", "/forest-guard-syllabus"),
        ],
        "cats": ["Forest Law & Policy", "Forest Management"],
        "priority": "0.7",
    },
    {
        "slug": "forestry/forest-engineering",
        "title": "Forest Engineering & Utilization MCQ | Loksewa Practice",
        "description": "Forest engineering and utilization MCQs: harvesting, logging, roads, timber grading and forest products for Loksewa exams.",
        "h1": "Forest Engineering & Utilization MCQs",
        "intro": (
            "Forest engineering and utilization covers harvesting systems, logging, forest roads, timber grading and wood technology — "
            "practiced here through the forest utilization question collection with instant answers."
        ),
        "sections": [
            ("Key engineering topics",
             "Felling and extraction methods, forest road alignment basics, timber measurement and grading, wood seasoning and preservation, "
             "non-timber forest products."),
        ],
        "faqs": [
            ("Is engineering asked in Ranger exams?",
             "Utilization and harvesting concepts appear regularly at Ranger and Forester levels — worth steady practice."),
        ],
        "related": [
            ("Forest Management", "/forestry/forest-management"),
            ("Silviculture", "/forestry/silviculture"),
            ("Forestry MCQs", "/forestry-mcq"),
        ],
        "cats": ["Forest Utilization"],
        "priority": "0.7",
    },
    {
        "slug": "forestry/wildlife-management",
        "title": "Wildlife & Biodiversity MCQ Nepal | Loksewa Practice",
        "description": "Wildlife management and biodiversity MCQs: conservation, protected areas, habitat and species questions for Forestry Loksewa.",
        "h1": "Wildlife & Biodiversity MCQs",
        "intro": (
            "Wildlife management and biodiversity conservation form a major Loksewa block — protected areas, flagship species, habitat "
            "management and conservation policy. Practice the full collection with instant feedback."
        ),
        "sections": [
            ("Key wildlife topics",
             "National parks and reserves, conservation areas, endangered species, habitat components, human-wildlife conflict, "
             "international conventions and Nepal's biodiversity strategy."),
        ],
        "faqs": [
            ("Which protected areas matter most for exams?",
             "All of Nepal's national parks, reserves and conservation areas recur — learn location, flagship species and establishment facts via MCQs."),
        ],
        "related": [
            ("Forest Protection", "/forestry/forest-protection"),
            ("Forestry MCQs", "/forestry-mcq"),
            ("Forest Guard Loksewa", "/forest-guard-loksewa"),
        ],
        "cats": ["Biodiversity & Wildlife Management"],
        "priority": "0.8",
    },
    {
        "slug": "forestry/forest-fire-management",
        "title": "Forest Fire Management MCQ | Loksewa Practice",
        "description": "Forest fire management MCQs: fire types, causes, prevention and control questions for Nepal forestry Loksewa exams.",
        "h1": "Forest Fire Management MCQs",
        "intro": (
            "Forest fire management — types, causes, prevention, detection and suppression — is examined within forest protection and "
            "management. Practice fire-related questions drawn from the management and law collections."
        ),
        "sections": [
            ("Key fire topics",
             "Ground, surface and crown fires; natural vs human causes; fire lines and breaks; suppression tools and safety; community roles "
             "in fire control; post-fire rehabilitation basics."),
        ],
        "faqs": [
            ("How are fire questions asked in Loksewa?",
             "Mostly concept and scenario MCQs — fire behaviour factors, control methods and safety priorities."),
        ],
        "related": [
            ("Forest Protection", "/forestry/forest-protection"),
            ("Forest Management", "/forestry/forest-management"),
            ("Forest Guard syllabus", "/forest-guard-syllabus"),
        ],
        "cats": ["Forest Management", "Forest Law & Policy"],
        "priority": "0.6",
    },
    {
        "slug": "privacy",
        "title": "Privacy Policy | Forestry Loksewa Preparation",
        "description": "Privacy policy: how Forestry Loksewa Preparation handles accounts, practice data and analytics.",
        "h1": "Privacy Policy",
        "intro": "This platform stores only what practice needs: your username, quiz attempts, scores and mistake queues.",
        "sections": [
            ("What we store",
             "Account identifiers you choose, your quiz history and progress statistics. No real names, addresses or payment details are collected — the service is free."),
            ("What we never expose",
             "Individual practice data is never published or indexed. Private pages carry noindex directives and are excluded from the sitemap."),
            ("Contact",
             "Questions about your data? Email forestrypscpreparation@gmail.com."),
        ],
        "faqs": [],
        "related": [("Terms", "/terms"), ("Contact", "/contact"), ("Home", "/")],
        "priority": "0.3",
    },
    {
        "slug": "terms",
        "title": "Terms of Use | Forestry Loksewa Preparation",
        "description": "Terms of use for the free Forestry Loksewa MCQ, syllabus and mock-test platform.",
        "h1": "Terms of Use",
        "intro": "Free preparation resources for Nepal forestry examinations, provided as-is for study purposes.",
        "sections": [
            ("Unofficial preparation material",
             "This is an independent study platform, not an official government website. Official syllabi, notices, vacancies and results come only from the Public Service Commission Nepal (psc.gov.np)."),
            ("Fair use",
             "Practice freely for personal exam preparation. Do not scrape, resell or misrepresent the content."),
        ],
        "faqs": [],
        "related": [("Privacy", "/privacy"), ("Contact", "/contact"), ("Home", "/")],
        "priority": "0.3",
    },
    {
        "slug": "contact",
        "title": "Contact | Forestry Loksewa Preparation",
        "description": "Contact Forestry Loksewa Preparation: corrections, question feedback and support by email.",
        "h1": "Contact",
        "intro": "Found a wrong answer, a typo, or a broken link? Email helps improve the bank for everyone.",
        "sections": [
            ("Email us",
             "Write to forestrypscpreparation@gmail.com with the question number or page URL and the correction. "
             "For official exam notices, always check the Public Service Commission Nepal at psc.gov.np."),
        ],
        "faqs": [],
        "related": [("About the platform", "/about"), ("Privacy", "/privacy"), ("Home", "/")],
        "priority": "0.3",
    },
]

PAGE_INDEX = {p["slug"]: p for p in PAGES}

NAV_LINKS = [
    ("Home", "/"),
    ("Forestry Loksewa", "/forestry-loksewa"),
    ("Syllabus", "/forestry-loksewa-syllabus"),
    ("MCQs", "/forestry-mcq"),
    ("Mock Tests", "/forestry-mock-test"),
    ("Question Bank", "/forestry-question-bank"),
]


# ---------------------------------------------------------------- rendering
def _abs(request, path):
    base = str(request.base_url).rstrip("/")
    return base + path


def _head(page, canonical, robots=INDEX_ROBOTS, extra_jsonld=""):
    faq_json = ""
    if page.get("faqs"):
        items = ", ".join(
            '{"@type": "Question", "name": "%s", "acceptedAnswer": {"@type": "Answer", "text": "%s"}}'
            % (_html.escape(q, quote=True), _html.escape(a, quote=True))
            for q, a in page["faqs"]
        )
        faq_json = (
            '<script type="application/ld+json">{"@context": "https://schema.org", '
            f'"@type": "FAQPage", "mainEntity": [{items}]}}</script>'
        )
    crumbs = ", ".join(
        '{"@type": "ListItem", "position": %d, "name": "%s", "item": "%s"}'
        % (i, _html.escape(label, quote=True), _html.escape(url, quote=True))
        for i, (label, url) in enumerate(page.get("crumbs", []), 1)
    )
    crumb_json = ""
    if crumbs:
        crumb_json = (
            '<script type="application/ld+json">{"@context": "https://schema.org", '
            f'"@type": "BreadcrumbList", "itemListElement": [{crumbs}]}}</script>'
        )
    return f"""<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{_html.escape(page['title'])}</title>
    <meta name="description" content="{_html.escape(page['description'], quote=True)}" />
    <meta name="robots" content="{robots}" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="en_NP" />
    <meta property="og:site_name" content="{_html.escape(BRAND, quote=True)}" />
    <meta property="og:title" content="{_html.escape(page['title'], quote=True)}" />
    <meta property="og:description" content="{_html.escape(page['description'], quote=True)}" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:image" content="{_abs_url_logo(canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{_html.escape(page['title'], quote=True)}" />
    <meta name="twitter:description" content="{_html.escape(page['description'], quote=True)}" />
    <meta name="twitter:image" content="{_abs_url_logo(canonical)}" />
    <meta name="theme-color" content="#12241B" />
    {faq_json}
    {crumb_json}
    {extra_jsonld}"""


def _abs_url_logo(canonical):
    host = canonical.split("/", 3)[:3]
    return "/".join(host) + "/desktop/forestry-logo.png"


def _chrome(title_inner, body_inner, page_label=""):
    nav = "".join(f'<a href="{u}">{l}</a>' for l, u in NAV_LINKS)
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    {title_inner}
    <style>
      :root {{ --bg: #0e1a13; --card: #14241a; --fg: #eef4ee; --mut: #9db3a4; --acc: #4caf7d; --line: #24382c; }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.65; }}
      a {{ color: #7fd6a4; }}
      .wrap {{ max-width: 860px; margin: 0 auto; padding: 0 18px; }}
      header.site {{ border-bottom: 1px solid var(--line); background: #0c1610; }}
      header.site .wrap {{ display: flex; align-items: center; gap: 14px; padding-top: 12px; padding-bottom: 12px; flex-wrap: wrap; }}
      .brand {{ font-weight: 800; color: #fff; text-decoration: none; font-size: 1.02rem; margin-right: auto; display: inline-flex; align-items: center; gap: 10px; }}
      nav.main {{ display: flex; gap: 4px; flex-wrap: wrap; }}
      nav.main a {{ color: var(--mut); text-decoration: none; font-size: .86rem; padding: 6px 10px; border-radius: 8px; }}
      nav.main a:hover {{ color: #fff; background: #1a2c20; }}
      .crumbs {{ font-size: .8rem; color: var(--mut); margin: 16px 0 0; }}
      .crumbs a {{ color: var(--mut); }}
      h1 {{ font-size: 1.7rem; line-height: 1.25; margin: 12px 0 10px; letter-spacing: -.01em; }}
      h2 {{ font-size: 1.2rem; margin: 30px 0 8px; }}
      h3 {{ font-size: 1rem; margin: 20px 0 6px; }}
      p {{ margin: 10px 0; color: #d6e2d8; }}
      .lede {{ font-size: 1.05rem; }}
      .cta-row {{ display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }}
      .btn {{ display: inline-block; background: var(--acc); color: #06210f; font-weight: 700; text-decoration: none; padding: 11px 20px; border-radius: 10px; }}
      .btn.ghost {{ background: transparent; color: #7fd6a4; border: 1px solid var(--acc); }}
      .statbox {{ background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 18px 0; }}
      .faq h3 {{ margin-bottom: 2px; }}
      .rel {{ background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 26px 0; }}
      .rel ul {{ margin: 8px 0 0; padding-left: 20px; }}
      footer.site {{ border-top: 1px solid var(--line); margin-top: 44px; padding: 22px 0 34px; color: var(--mut); font-size: .85rem; }}
      footer.site nav {{ display: flex; gap: 14px; flex-wrap: wrap; margin: 10px 0; }}
      img.logo {{ border-radius: 12px; }}
      @media (max-width: 600px) {{ h1 {{ font-size: 1.4rem; }} }}
    </style>
  </head>
  <body>
    <header class="site"><div class="wrap">
      <a class="brand" href="/"><img class="logo" src="/desktop/forestry-logo.png" alt="{_html.escape(BRAND, quote=True)} logo" width="34" height="34" loading="eager" decoding="async" />{_html.escape(BRAND_SHORT)}</a>
      <nav class="main" aria-label="Main">{nav}</nav>
    </div></header>
    <main class="wrap">
    {body_inner}
    </main>
    <footer class="site"><div class="wrap">
      <strong style="color:#fff">{_html.escape(BRAND)}</strong> — free Forestry Loksewa MCQ, syllabus &amp; mock-test preparation for Nepal.
      <nav aria-label="Footer"><a href="/forestry-loksewa">Forestry Loksewa</a><a href="/forestry-loksewa-syllabus">Syllabus</a><a href="/forestry-mcq">MCQs</a><a href="/forestry-mock-test">Mock Tests</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
      <p>Unofficial preparation platform — not a government website. Official notices &amp; syllabus: <a href="{OFFICIAL_PSC}" rel="noopener" target="_blank">Public Service Commission Nepal</a>. Contact: <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>
      <p>© 2026 {_html.escape(BRAND)}</p>
    </div></footer>
  </body>
</html>"""


def _practice_box(total, cats, page):
    names = page.get("cats") or []
    if names:
        n = _cat_count(cats, *names)
        label = ", ".join(names)
        line = f"<p><strong>{fmt(n)} practice questions</strong> in {html_escape(label)} — free, with instant answers.</p>"
    else:
        line = f"<p><strong>{fmt(total)} forestry questions</strong> across {len(cats)} categories — free, with instant answers.</p>"
    return (
        '<div class="statbox" role="note">'
        f"{line}"
        '<div class="cta-row"><a class="btn" href="/quiz">Start practicing now</a>'
        '<a class="btn ghost" href="/questions">Browse question bank</a></div></div>'
    )


def html_escape(s):
    return _html.escape(s)


def render_page(request, page):
    total, cats = get_live_stats()
    canonical = _abs(request, "/" + page["slug"])
    crumbs = [("Home", _abs(request, "/")), (page["h1"], canonical)]
    page = dict(page, crumbs=crumbs)
    crumb_nav = (
        '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › '
        f"{_html.escape(page['h1'])}</nav>"
    )
    sections = "".join(f"<h2>{_html.escape(h)}</h2><p>{body}</p>" for h, body in page.get("sections", []))
    faq = ""
    if page.get("faqs"):
        items = "".join(
            f"<h3>{_html.escape(q)}</h3><p>{a}</p>" for q, a in page["faqs"]
        )
        faq = f'<section class="faq" aria-label="Frequently asked questions"><h2>Frequently asked questions</h2>{items}</section>'
    rel = "".join(f'<li><a href="{u}">{a}</a></li>' for a, u in page.get("related", []))
    relbox = f'<aside class="rel" aria-label="Related"><strong>Continue preparing</strong><ul>{rel}</ul></aside>' if rel else ""
    body = (
        f"{crumb_nav}<h1>{_html.escape(page['h1'])}</h1>"
        f"<p class=\"lede\">{page['intro']}</p>"
        f"{_practice_box(total, cats, page)}{sections}{faq}{relbox}"
    )
    return _chrome(_head(page, canonical), body)


def render_home(request):
    total, cats = get_live_stats()
    canonical = _abs(request, "/")
    top = sorted(cats.items(), key=lambda kv: -kv[1])[:12]
    cat_links = {
        "Silviculture": "/forestry/silviculture",
        "Forest Management": "/forestry/forest-management",
        "Forestry Research & Forest Survey": "/forestry/forest-mensuration",
        "Biodiversity & Wildlife Management": "/forestry/wildlife-management",
        "Soil Conservation And Watershed Management": "/forestry/forest-management",
        "Forest Utilization": "/forestry/forest-engineering",
        "Forest Law & Policy": "/forestry/forest-protection",
    }
    cards = "".join(
        f'<li><a href="{cat_links.get(c, "/forestry-question-bank")}">{_html.escape(c)}</a> — {fmt(n)} questions</li>'
        for c, n in top
    )
    page = {
        "title": "Forestry Loksewa Preparation Nepal | MCQ, Syllabus & Mock Tests",
        "description": "Prepare for Forestry Loksewa in Nepal with forestry MCQs, syllabus, practice questions, mock tests and exam preparation for Ranger, Forester and Forest Officer.",
    }
    org_json = (
        '<script type="application/ld+json">{"@context": "https://schema.org", "@type": "Organization", '
        f'"name": "{_html.escape(BRAND, quote=True)}", "url": "{canonical}", '
        f'"logo": "{_abs_url_logo(canonical)}", "email": "{CONTACT_EMAIL}"}}</script>'
        '<script type="application/ld+json">{"@context": "https://schema.org", "@type": "WebSite", '
        f'"name": "{_html.escape(BRAND, quote=True)}", "url": "{canonical}", '
        '"potentialAction": {"@type": "SearchAction", '
        f'"target": "{canonical}questions?search={{{{search_term_string}}}}", '
        '"query-input": "required name=search_term_string"}}</script>'
    )
    itemlist = ", ".join(
        '{"@type": "ListItem", "position": %d, "name": "%s", "item": "%s"}'
        % (i, _html.escape(l, quote=True), _html.escape(_abs(request, u), quote=True))
        for i, (l, u) in enumerate(
            [
                ("Forestry Loksewa preparation", "/forestry-loksewa"),
                ("Ranger Loksewa", "/ranger-loksewa"),
                ("Forester Loksewa", "/forester-loksewa"),
                ("Forest Officer Loksewa", "/forest-officer-loksewa"),
                ("Forestry MCQs", "/forestry-mcq"),
                ("Forestry mock tests", "/forestry-mock-test"),
            ],
            1,
        )
    )
    list_json = (
        '<script type="application/ld+json">{"@context": "https://schema.org", "@type": "ItemList", '
        f'"name": "Forestry Loksewa preparation resources", "itemListElement": [{itemlist}]}}</script>'
    )
    body = f"""<h1>Forestry Loksewa Preparation Nepal</h1>
    <p class="lede">Free online preparation for Nepal forestry service examinations — <a href="/forestry-mcq">forestry MCQs</a>,
    <a href="/forestry-loksewa-syllabus">syllabus guidance</a>, <a href="/forestry-practice-set">practice questions</a> and
    <a href="/forestry-mock-test">mock tests</a> for Ranger Loksewa, Forester Loksewa, Forest Officer Loksewa and Forest Guard
    (Ban Rakshak) aspirants. Sign in free and start practicing in under a minute.</p>
    <div class="statbox" role="note"><p><strong>{fmt(total)} forestry questions</strong> across {len(cats)} categories and counting.</p>
    <div class="cta-row"><a class="btn" id="start-btn" href="/desktop">Start practicing free</a><a class="btn ghost" href="/forestry-loksewa-syllabus">View syllabus guide</a></div></div>
    <script>(function(){{var b=document.getElementById('start-btn');if(!b)return;var ua=navigator.userAgent||'';if(/android|iphone|ipad|mobile/i.test(ua))b.setAttribute('href','/mobile');}})();</script>
    <h2>Prepare by post</h2>
    <ul><li><a href="/ranger-loksewa">Ranger Loksewa Nepal</a> — syllabus, MCQs &amp; mock tests</li>
    <li><a href="/forester-loksewa">Forester Loksewa Nepal</a> — syllabus, questions &amp; practice</li>
    <li><a href="/forest-officer-loksewa">Forest Officer Loksewa Nepal</a> — syllabus &amp; exam preparation</li>
    <li><a href="/forest-guard-loksewa">Forest Guard (Ban Rakshak) Loksewa</a> — syllabus &amp; MCQs</li>
    <li><a href="/ban-loksewa">Ban Loksewa — वन लोकसेवा तयारी</a></li></ul>
    <h2>Study by forestry subject</h2>
    <ul>{cards}</ul>
    <h2>How preparation works here</h2>
    <p><strong>Learn</strong> from the <a href="/forestry-loksewa-syllabus">syllabus guide</a>, <strong>practice</strong> daily
    <a href="/forestry-mcq">forestry MCQs</a> with instant feedback, <strong>test</strong> weekly with
    <a href="/forestry-mock-test">mock tests</a>, and <strong>revise</strong> every mistake automatically. Read the full method in
    <a href="/forestry-loksewa-preparation">how to prepare for Forestry Loksewa</a>.</p>
    <section class="faq" aria-label="Frequently asked questions"><h2>Frequently asked questions</h2>
    <h3>Is Forestry Loksewa preparation free here?</h3><p>Yes — MCQs, practice sets, mock tests and progress tracking are all free on mobile and desktop.</p>
    <h3>Which exams are covered?</h3><p>Ranger, Forester, Forest Officer and Forest Guard (Ban Rakshak) examinations of the Nepal forestry service.</p>
    <h3>Where is the official syllabus?</h3><p>Official syllabi and notices are published by the Public Service Commission Nepal. Our guides are preparation aids — always verify at psc.gov.np.</p></section>"""
    crumbs = [("Home", canonical)]
    return _chrome(_head({**page, "crumbs": crumbs}, canonical, extra_jsonld=org_json + list_json), body)


def sitemap_xml(request):
    base = str(request.base_url).rstrip("/")
    urls = [
        ("/" + p["slug"], "weekly", p.get("priority", "0.7")) for p in PAGES
    ]
    items = "".join(
        f"<url><loc>{base}{path or '/'}</loc><changefreq>{fr}</changefreq><priority>{pr}</priority></url>"
        for path, fr, pr in urls
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'


def robots_txt(request):
    base = str(request.base_url).rstrip("/")
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /admin\n"
        "Disallow: /login\n"
        "Disallow: /quiz\n"
        "Disallow: /questions\n"
        "Disallow: /question/\n"
        "Disallow: /progress\n"
        "Disallow: /results\n"
        f"\n# Sitemap for {BRAND}\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )


# Paths served by the React SPA (login-walled app). Everything else 404s.
SPA_PATHS = {
    "", "/", "/login", "/questions", "/quiz", "/quiz/practice-wrong",
    "/results", "/progress", "/admin", "/about", "/mobile", "/desktop",
}
SPA_PREFIXES = ("/mobile/", "/desktop/", "/question/", "/assets/", "/desktop/assets/")
NOINDEX_PREFIXES = (
    "/api/", "/admin", "/login", "/quiz", "/questions", "/question/",
    "/progress", "/results",
)
