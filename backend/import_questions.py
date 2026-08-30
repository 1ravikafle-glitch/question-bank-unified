import json
import sys
import os
from sqlalchemy.orm import Session
import models
import database


def import_questions_from_json(json_file_path: str, db: Session) -> int:
    """Import questions from a JSON file into the database (batch inserts)."""
    print(f"Importing questions from {json_file_path}...")

    if not os.path.exists(json_file_path):
        print(f"Error: File {json_file_path} not found")
        return 0

    try:
        with open(json_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading JSON file {json_file_path}: {e}")
        return 0

    # Handle both list and dict with "questions" key
    if isinstance(data, dict):
        questions_data = data.get("questions", [])
    elif isinstance(data, list):
        questions_data = data
    else:
        print(f"Error: Expected JSON array or object with 'questions' key in {json_file_path}")
        return 0

    batch = []
    imported_count = 0
    skipped_count = 0

    for q in questions_data:
        try:
            # Validate required fields
            qt = q.get("question_text", "").strip()
            ca = q.get("correct_answer", "").strip()

            if not qt or not ca:
                skipped_count += 1
                continue

            options = q.get("options", {})
            if isinstance(options, str):
                try:
                    options = json.loads(options)
                except Exception:
                    options = {}
            if not isinstance(options, dict):
                options = {}
            options = {str(k).strip().lower(): str(v).strip() for k, v in options.items()}

            batch.append(models.Question(
                question_number=q.get("question_number", q.get("id", 0)),
                question_text=qt,
                options=options,
                correct_answer=ca[0].lower(),
                category=q.get("category", "Unknown").strip(),
                difficulty=q.get("difficulty"),
            ))
            imported_count += 1

            # Commit in batches of 500
            if len(batch) >= 500:
                db.add_all(batch)
                db.commit()
                print(f"  Imported {imported_count} questions so far...", file=sys.stderr)
                batch = []

        except Exception as e:
            print(f"Error processing question: {e}", file=sys.stderr)
            skipped_count += 1

    # Final batch
    if batch:
        db.add_all(batch)
        db.commit()

    print(f"Import completed: {imported_count} imported, {skipped_count} skipped")
    return imported_count


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_questions.py <json_file1> [json_file2] ...")
        sys.exit(1)

    db = database.SessionLocal()
    try:
        total_imported = 0
        for json_file in sys.argv[1:]:
            imported = import_questions_from_json(json_file, db)
            total_imported += imported
        print(f"\nTotal questions imported: {total_imported}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
