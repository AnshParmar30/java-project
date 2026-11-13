import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/**
 * All the number crunching lives here: attendance maths, study streaks, the
 * revision planner, level/XP, CGPA, search and CSV export.
 */
final class Analytics {
    private Analytics() {}

    private static final String[] LEVEL_TITLES = {
        "Fresh start", "Page turner", "Note taker", "Deep worker", "Scholar", "Topper", "Legend"
    };

    // ------------------------------------------------------------ small helpers

    @SuppressWarnings("unchecked")
    static List<Object> rawList(Map<String, Object> data, String key) {
        Object o = data.get(key);
        if (o instanceof List) return (List<Object>) o;
        List<Object> l = new ArrayList<>();
        data.put(key, l);
        return l;
    }

    static List<Map<String, Object>> list(Map<String, Object> data, String key) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : rawList(data, key)) {
            Map<String, Object> m = Json.asMap(o);
            if (m != null) out.add(m);
        }
        return out;
    }

    static LocalDate date(Object o) {
        try {
            return LocalDate.parse(Json.str(o, ""));
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static double round1(double d) {
        return Math.round(d * 10.0) / 10.0;
    }

    private static String plural(long n, String one, String many) {
        return n + " " + (n == 1 ? one : many);
    }

    private static String when(long days) {
        if (days < 0) return "was " + (-days) + (days == -1 ? " day ago" : " days ago");
        if (days == 0) return "today";
        if (days == 1) return "tomorrow";
        return "in " + days + " days";
    }

    // ------------------------------------------------------------ dashboard

    static Map<String, Object> dashboard(Map<String, Object> data, LocalDate today) {
        Map<String, Object> settings = Json.asMap(data.get("settings"));
        int goal = (int) Json.lng(settings.get("goal"), 100);
        int target = (int) Json.lng(settings.get("target"), 75);

        List<Map<String, Object>> tasks = list(data, "tasks");
        List<Map<String, Object>> subjects = list(data, "subjects");
        List<Map<String, Object>> exams = list(data, "exams");
        List<Map<String, Object>> assignments = list(data, "assignments");
        List<Map<String, Object>> attendance = list(data, "attendance");
        List<Map<String, Object>> cards = list(data, "cards");
        List<Map<String, Object>> sessions = list(data, "sessions");
        List<Map<String, Object>> grades = list(data, "grades");

        // ---- tasks
        int openTasks = 0, doneTasks = 0, openMinutes = 0;
        for (Map<String, Object> t : tasks) {
            if (Json.bool(t.get("done"))) {
                doneTasks++;
            } else {
                openTasks++;
                openMinutes += (int) Json.lng(t.get("minutes"), 0);
            }
        }

        // ---- syllabus
        int topicsDone = 0, topicsTotal = 0;
        for (Map<String, Object> s : subjects) {
            for (Object o : rawList(s, "topics")) {
                Map<String, Object> t = Json.asMap(o);
                if (t == null) continue;
                topicsTotal++;
                if (Json.bool(t.get("done"))) topicsDone++;
            }
        }

        // ---- study time
        TreeMap<LocalDate, Integer> byDay = new TreeMap<>();
        long totalMinutes = 0;
        for (Map<String, Object> s : sessions) {
            LocalDate d = date(s.get("date"));
            if (d == null) continue;
            int m = (int) Json.lng(s.get("minutes"), 0);
            byDay.merge(d, m, Integer::sum);
            totalMinutes += m;
        }
        int todayMinutes = byDay.getOrDefault(today, 0);

        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int[] week = new int[7];
        int weekTotal = 0;
        for (int i = 0; i < 7; i++) {
            week[i] = byDay.getOrDefault(weekStart.plusDays(i), 0);
            weekTotal += week[i];
        }
        int lastWeekTotal = 0;
        for (int i = 1; i <= 7; i++) lastWeekTotal += byDay.getOrDefault(weekStart.minusDays(i), 0);

        int streak = 0;
        LocalDate cursor = byDay.containsKey(today) ? today : today.minusDays(1);
        while (byDay.getOrDefault(cursor, 0) > 0) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        int longest = 0, run = 0;
        LocalDate prev = null;
        for (LocalDate d : byDay.keySet()) {
            if (byDay.get(d) <= 0) continue;
            run = (prev != null && prev.plusDays(1).equals(d)) ? run + 1 : 1;
            longest = Math.max(longest, run);
            prev = d;
        }

        List<Object> heatmap = new ArrayList<>();
        for (int i = 111; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            heatmap.add(map("d", d.toString(), "m", byDay.getOrDefault(d, 0)));
        }

        Map<String, Object> study = map(
                "totalMinutes", totalMinutes,
                "sessions", sessions.size(),
                "todayMinutes", todayMinutes,
                "goal", goal,
                "goalPct", goal > 0 ? Math.min(100, Math.round(todayMinutes * 100f / goal)) : 0,
                "week", week,
                "weekTotal", weekTotal,
                "lastWeekTotal", lastWeekTotal,
                "streak", streak,
                "longestStreak", longest,
                "streakAtRisk", streak > 0 && !byDay.containsKey(today),
                "heatmap", heatmap);

        // ---- attendance
        Map<String, int[]> counts = new HashMap<>();
        int presentAll = 0, totalAll = 0;
        Set<String> subjectIds = new HashSet<>();
        for (Map<String, Object> s : subjects) subjectIds.add(Json.str(s.get("id"), ""));
        for (Map<String, Object> a : attendance) {
            String sid = Json.str(a.get("subjectId"), "");
            if (!subjectIds.contains(sid)) continue;
            int[] c = counts.computeIfAbsent(sid, k -> new int[2]);
            c[1]++;
            totalAll++;
            if ("present".equals(a.get("status"))) {
                c[0]++;
                presentAll++;
            }
        }
        List<Object> attendanceRows = new ArrayList<>();
        for (Map<String, Object> s : subjects) {
            String sid = Json.str(s.get("id"), "");
            int[] c = counts.getOrDefault(sid, new int[2]);
            attendanceRows.add(attendanceRow(sid, Json.str(s.get("name"), ""), (int) Json.lng(s.get("color"), 0), c[0], c[1], target));
        }
        Map<String, Object> att = map(
                "target", target,
                "overall", map("present", presentAll, "total", totalAll,
                        "pct", totalAll == 0 ? null : (Object) round1(presentAll * 100.0 / totalAll)),
                "subjects", attendanceRows);

        // ---- planner (what to study next)
        List<Map<String, Object>> planner = new ArrayList<>();
        List<Double> scores = new ArrayList<>();
        for (Map<String, Object> s : subjects) {
            List<Map<String, Object>> topics = new ArrayList<>();
            for (Object o : rawList(s, "topics")) {
                Map<String, Object> t = Json.asMap(o);
                if (t != null) topics.add(t);
            }
            int remaining = 0, total = topics.size();
            String next = "";
            for (Map<String, Object> t : topics) {
                if (!Json.bool(t.get("done"))) {
                    remaining++;
                    if (next.isEmpty()) next = Json.str(t.get("name"), "");
                }
            }
            if (remaining == 0) continue;

            String sid = Json.str(s.get("id"), "");
            String sname = Json.str(s.get("name"), "");
            Long days = null;
            String examName = "";
            for (Map<String, Object> e : exams) {
                LocalDate d = date(e.get("date"));
                if (d == null || d.isBefore(today)) continue;
                boolean linked = sid.equals(Json.str(e.get("subjectId"), ""))
                        || (Json.str(e.get("subjectId"), "").isEmpty()
                        && Json.str(e.get("name"), "").toLowerCase().contains(sname.toLowerCase()));
                long diff = ChronoUnit.DAYS.between(today, d);
                if (linked && (days == null || diff < days)) {
                    days = diff;
                    examName = Json.str(e.get("name"), "");
                }
            }

            double score;
            String urgency, message;
            int perDay = 0;
            if (days != null) {
                long available = Math.max(1, days - 1);
                perDay = (int) Math.max(1, Math.ceil(remaining / (double) available));
                score = remaining / (double) available;
                urgency = (score >= 2 || days <= 2) ? "high" : (score >= 0.8 || days <= 7) ? "medium" : "low";
                message = plural(remaining, "topic", "topics") + " left and the exam is " + when(days)
                        + ". Aim for " + plural(perDay, "topic", "topics") + " a day.";
            } else {
                score = remaining * 0.05;
                urgency = "low";
                message = plural(remaining, "topic", "topics") + " left. Add an exam date to get a daily target.";
            }
            planner.add(map(
                    "subjectId", sid, "subject", sname, "color", Json.lng(s.get("color"), 0),
                    "nextTopic", next, "remaining", remaining, "total", total,
                    "daysToExam", days, "exam", examName, "perDay", perDay,
                    "urgency", urgency, "message", message));
            scores.add(score);
        }
        Integer[] order = new Integer[planner.size()];
        for (int i = 0; i < order.length; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> Double.compare(scores.get(b), scores.get(a)));
        List<Object> plannerSorted = new ArrayList<>();
        for (int i : order) plannerSorted.add(planner.get(i));

        // ---- upcoming deadlines
        List<Map<String, Object>> upcoming = new ArrayList<>();
        for (Map<String, Object> e : exams) {
            LocalDate d = date(e.get("date"));
            if (d == null) continue;
            long diff = ChronoUnit.DAYS.between(today, d);
            if (diff < 0) continue;
            upcoming.add(map("type", "exam", "id", e.get("id"), "name", Json.str(e.get("name"), ""),
                    "date", d.toString(), "days", diff, "overdue", false));
        }
        for (Map<String, Object> a : assignments) {
            if (Json.bool(a.get("done"))) continue;
            LocalDate d = date(a.get("due"));
            if (d == null) continue;
            long diff = ChronoUnit.DAYS.between(today, d);
            upcoming.add(map("type", "assignment", "id", a.get("id"), "name", Json.str(a.get("name"), ""),
                    "date", d.toString(), "days", diff, "overdue", diff < 0));
        }
        upcoming.sort(Comparator.comparingLong(m -> (Long) m.get("days")));
        List<Object> upcomingOut = new ArrayList<>(upcoming.subList(0, Math.min(8, upcoming.size())));

        // ---- flashcards
        int due = 0, mastered = 0;
        for (Map<String, Object> c : cards) {
            if (Flashcards.isDue(c, today)) due++;
            if (Json.lng(c.get("box"), 1) >= 4) mastered++;
        }
        long reviews = 0;
        for (Map<String, Object> c : cards) reviews += Json.lng(c.get("reviews"), 0);

        // ---- level / xp
        int presentCount = presentAll;
        long xp = totalMinutes + 10L * doneTasks + 8L * topicsDone + 2L * presentCount + 3L * reviews;
        int level = (int) Math.floor(Math.sqrt(xp / 50.0)) + 1;
        long floor = 50L * (level - 1) * (level - 1);
        long next = 50L * level * level;
        Map<String, Object> lvl = map(
                "xp", xp, "level", level, "title", LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
                "floor", floor, "next", next, "pct", Math.round((xp - floor) * 100f / (next - floor)));

        // ---- grades
        TreeMap<Integer, double[]> sem = new TreeMap<>();
        double points = 0, credits = 0;
        for (Map<String, Object> g : grades) {
            int s = (int) Json.lng(g.get("semester"), 1);
            double cr = Json.lng(g.get("credits"), 0), gp = Json.lng(g.get("gradePoint"), 0);
            double[] a = sem.computeIfAbsent(s, k -> new double[2]);
            a[0] += gp * cr;
            a[1] += cr;
            points += gp * cr;
            credits += cr;
        }
        List<Object> semesters = new ArrayList<>();
        for (Map.Entry<Integer, double[]> e : sem.entrySet()) {
            double[] a = e.getValue();
            semesters.add(map("semester", e.getKey(), "sgpa", a[1] == 0 ? 0 : Math.round(a[0] / a[1] * 100) / 100.0, "credits", (long) a[1]));
        }
        Map<String, Object> gradeOut = map(
                "cgpa", credits == 0 ? null : (Object) (Math.round(points / credits * 100) / 100.0),
                "credits", (long) credits, "semesters", semesters);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", today.toString());
        out.put("tasks", map("open", openTasks, "done", doneTasks, "total", tasks.size(), "openMinutes", openMinutes));
        out.put("syllabus", map("done", topicsDone, "total", topicsTotal,
                "pct", topicsTotal == 0 ? 0 : Math.round(topicsDone * 100f / topicsTotal)));
        out.put("study", study);
        out.put("level", lvl);
        out.put("attendance", att);
        out.put("planner", plannerSorted);
        out.put("upcoming", upcomingOut);
        out.put("cards", map("total", cards.size(), "due", due, "mastered", mastered));
        out.put("grades", gradeOut);
        out.put("tip", Tips.forDate(today));
        return out;
    }

    /** Attendance maths for one subject, including the "how many can I skip" answer. */
    static Map<String, Object> attendanceRow(String id, String name, int color, int present, int total, int target) {
        String status, message;
        int bunk = 0, need = 0;
        Object pct = null;
        if (total == 0) {
            status = "none";
            message = "No classes marked yet.";
        } else {
            pct = round1(present * 100.0 / total);
            if (present * 100 >= target * total) {
                bunk = Math.max(0, (int) Math.floor(present * 100.0 / target - total + 1e-9));
                if (bunk >= 1) {
                    status = "safe";
                    message = "You can skip " + plural(bunk, "more class", "more classes") + " and stay above " + target + "%.";
                } else {
                    status = "edge";
                    message = "Right on the edge. Don't skip the next class.";
                }
            } else {
                int num = target * total - 100 * present;
                int den = 100 - target;
                need = (num + den - 1) / den;
                status = "danger";
                message = "Attend the next " + plural(need, "class", "classes") + " in a row to reach " + target + "%.";
            }
        }
        return map("subjectId", id, "name", name, "color", color, "present", present, "total", total,
                "pct", pct, "status", status, "bunk", bunk, "need", need, "message", message);
    }

    // ------------------------------------------------------------ search

    static List<Object> search(Map<String, Object> data, String query) {
        String q = query.toLowerCase().trim();
        List<Object> out = new ArrayList<>();
        if (q.isEmpty()) return out;

        for (Map<String, Object> t : list(data, "tasks"))
            hit(out, q, "Task", "tasks", t.get("id"), Json.str(t.get("title"), ""), Json.str(t.get("subject"), ""));
        for (Map<String, Object> s : list(data, "subjects")) {
            hit(out, q, "Subject", "subjects", s.get("id"), Json.str(s.get("name"), ""), "");
            for (Object o : rawList(s, "topics")) {
                Map<String, Object> t = Json.asMap(o);
                if (t != null) hit(out, q, "Topic", "subjects", s.get("id"), Json.str(t.get("name"), ""), Json.str(s.get("name"), ""));
            }
        }
        for (Map<String, Object> e : list(data, "exams"))
            hit(out, q, "Exam", "exams", e.get("id"), Json.str(e.get("name"), ""), Json.str(e.get("date"), ""));
        for (Map<String, Object> a : list(data, "assignments"))
            hit(out, q, "Assignment", "exams", a.get("id"), Json.str(a.get("name"), ""), "Due " + Json.str(a.get("due"), ""));
        for (Map<String, Object> c : list(data, "cards"))
            hit(out, q, "Flashcard", "cards", c.get("id"), Json.str(c.get("question"), ""), Json.str(c.get("answer"), ""));
        for (Map<String, Object> e : list(data, "events"))
            hit(out, q, "Timetable", "timetable", e.get("id"), Json.str(e.get("title"), ""), Json.str(e.get("day"), "") + " " + Json.str(e.get("time"), ""));
        for (Map<String, Object> r : list(data, "resources"))
            hit(out, q, "Link", "notes", r.get("id"), Json.str(r.get("title"), ""), Json.str(r.get("url"), ""));
        for (Map<String, Object> g : list(data, "grades"))
            hit(out, q, "Grade", "grades", g.get("id"), Json.str(g.get("name"), ""), "Semester " + Json.lng(g.get("semester"), 1));

        String notes = Json.str(data.get("notes"), "");
        int at = notes.toLowerCase().indexOf(q);
        if (at >= 0 && out.size() < 20) {
            int from = Math.max(0, at - 30), to = Math.min(notes.length(), at + q.length() + 40);
            out.add(map("type", "Note", "view", "notes", "id", "", "title", notes.substring(from, to).replace('\n', ' ').trim(), "detail", ""));
        }
        return out;
    }

    private static void hit(List<Object> out, String q, String type, String view, Object id, String title, String detail) {
        if (out.size() >= 20) return;
        if (title.toLowerCase().contains(q) || detail.toLowerCase().contains(q)) {
            out.add(map("type", type, "view", view, "id", id, "title", title, "detail", detail));
        }
    }

    // ------------------------------------------------------------ export

    static String attendanceCsv(Map<String, Object> data) {
        Map<String, String> names = new HashMap<>();
        for (Map<String, Object> s : list(data, "subjects")) names.put(Json.str(s.get("id"), ""), Json.str(s.get("name"), ""));
        List<Map<String, Object>> rows = new ArrayList<>(list(data, "attendance"));
        rows.sort(Comparator.comparing((Map<String, Object> m) -> Json.str(m.get("date"), "")));
        StringBuilder sb = new StringBuilder("Date,Subject,Status\r\n");
        for (Map<String, Object> a : rows) {
            sb.append(csv(Json.str(a.get("date"), ""))).append(',')
              .append(csv(names.getOrDefault(Json.str(a.get("subjectId"), ""), "(deleted subject)"))).append(',')
              .append(csv(Json.str(a.get("status"), ""))).append("\r\n");
        }
        return sb.toString();
    }

    private static String csv(String s) {
        // Prefix risky leading characters so spreadsheets don't treat the cell as a formula.
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) s = "\"" + s.replace("\"", "\"\"") + "\"";
        return s;
    }
}
