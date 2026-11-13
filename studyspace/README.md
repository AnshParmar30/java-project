# Studyspace (Smart Study Companion)

Java 17 backend (sirf JDK, koi library nahi) + vanilla JS frontend.

## Run
- Windows: `run.bat` double-click karo, phir http://localhost:8080
- Mac/Linux: `./run.sh`
- Pehli baar Register karo; data `data/` folder me save hota hai.
- Port badalna ho: `set PORT=9000` pehle.

## Java me kya hai
- REST API (`/api/...`), login/register (PBKDF2 hashing, session cookie, rate limit)
- Per-user JSON storage (atomic writes), custom JSON parser
- Analytics: attendance % + bunk calculator, streak, XP/level, heatmap, revision planner, CGPA
- Leitner spaced-repetition flashcards, global search, CSV/JSON export, validation

## Features
Overview, Study plan, Focus timer, Subjects+topics, Exams, Attendance, Timetable, Grades/CGPA, Flashcards, Notes, dark mode, search (`/`).
Purana localStorage data Overview ke banner se import ho jata hai.
