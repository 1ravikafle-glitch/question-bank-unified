import json
import sys
import os
from sqlalchemy.orm import Session
import models
import database

def import_questions_from_json(json_file_path: str, db: Session):
    """
    Import questions from a JSON file into the database.
    """
    print(f"Importing questions from {json_file_path}...")

    # Check if file exists
    if not os.path.exists(json_file_path):
        print(f"Error: File {json_file_path} not found")
        return 0

    # Load JSON data
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            questions_data = json.load(f)
    except Exception as e:
        print(f"Error loading JSON file {json_file_path}: {e}")
        return 0

    if not isinstance(questions_data, list):
        print(f"Error: Expected JSON array in {json_file_path}")
        return 0

    imported_count = 0
    skipped_count = 0

    for question_data in questions_data:
        try:
            # Validate required fields
            if 'question_number' not in question_data or 'question_text' not in question_data or 'correct_answer' not in question_data:
                print(f"Skipping question missing required fields: {question_data.get('question_number', 'Unknown')}")
                skipped_count += 1
                continue

            # Check if question already exists (same text within the same category,
            # since question_number restarts at 1 in each source document and is
            # NOT globally unique)
            existing = db.query(models.Question).filter(
                models.Question.question_text == question_data['question_text'],
                models.Question.category == question_data.get('category')
            ).first()

            if existing:
                print(f"Question '{question_data['question_text'][:40]}...' already exists in category, skipping")
                skipped_count += 1
                continue

            # Parse options if it's a JSON string
            options_data = question_data.get('options', {})
            if isinstance(options_data, str):
                try:
                    import json as _json
                    options_data = _json.loads(options_data)
                except Exception:
                    options_data = {}
            # Create new question
            question = models.Question(
                question_number=question_data['question_number'],
                question_text=question_data['question_text'],
                options=options_data if isinstance(options_data, dict) else {},
                correct_answer=question_data['correct_answer'].lower(),
                category=question_data.get('category'),  # Use category from JSON if available
                difficulty=question_data.get('difficulty')  # Use difficulty from JSON if available
            )

            db.add(question)
            imported_count += 1

            # Commit in batches to avoid memory issues
            if imported_count % 100 == 0:
                db.commit()
                print(f"Imported {imported_count} questions so far...")

        except Exception as e:
            print(f"Error processing question {question_data.get('question_number', 'Unknown')}: {e}")
            skipped_count += 1
            continue

    # Final commit
    db.commit()

    print(f"Import completed: {imported_count} questions imported, {skipped_count} questions skipped")
    return imported_count

def main():
    if len(sys.argv) < 2:
        print("Usage: python import_questions.py <json_file1> [json_file2] ...")
        print("Example: python import_questions.py /tmp/questions_biodiversity.json /tmp/questions_forest.json")
        sys.exit(1)

    # Create database session
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