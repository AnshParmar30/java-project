import java.net.URI;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Describes which fields each collection accepts and validates everything the
 * browser sends. Unknown fields are dropped, so the data file stays clean.
 */
final class Schema {
    private Schema() {}

    enum Type { STR, INT, BOOL, DATE, TIME, URL, ENUM, TOPICS }

    record Field(String name, Type type, boolean required, long min, long max, List<String> options) {}

    static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final Pattern DATE_RE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern TIME_RE = Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d");

    /** Order matters: subjects come first so imports can link other records to them. */
    static final Map<String, List<Field>> COLLECTIONS = new LinkedHashMap<>();
    static final List<Field> SETTINGS = List.of(
            num("focus", 1, 180), num("pause", 1, 60), num("goal", 15, 600), num("target", 50, 95));

    static int maxItems(String collection) {
        return collection.equals("sessions") ? 20000 : 1500;
    }

    private static Field text(String n, boolean req, int max) { return new Field(n, Type.STR, req, 0, max, null); }
    private static Field num(String n, long min, long max) { return new Field(n, Type.INT, false, min, max, null); }
    private static Field reqNum(String n, long min, long max) { return new Field(n, Type.INT, true, min, max, null); }
    private static Field flag(String n) { return new Field(n, Type.BOOL, false, 0, 0, null); }
    private static Field date(String n) { return new Field(n, Type.DATE, true, 0, 0, null); }
    private static Field time(String n) { return new Field(n, Type.TIME, true, 0, 0, null); }
    private static Field url(String n) { return new Field(n, Type.URL, true, 0, 500, null); }
    private static Field choice(String n, boolean req, String... opts) { return new Field(n, Type.ENUM, req, 0, 0, List.of(opts)); }
    private static Field topics(String n) { return new Field(n, Type.TOPICS, false, 0, 60, null); }

    static {
        COLLECTIONS.put("subjects", List.of(text("name", true, 40), num("color", 0, 5), topics("topics")));
        COLLECTIONS.put("tasks", List.of(text("title", true, 100), text("subject", false, 40),
                num("minutes", 1, 600), choice("priority", false, "low", "medium", "high"), flag("done")));
        COLLECTIONS.put("exams", List.of(text("name", true, 50), date("date"), text("subjectId", false, 64)));
        COLLECTIONS.put("assignments", List.of(text("name", true, 70), date("due"), text("subjectId", false, 64), flag("done")));
        COLLECTIONS.put("attendance", List.of(text("subjectId", true, 64), date("date"), choice("status", true, "present", "absent")));
        COLLECTIONS.put("cards", List.of(text("question", true, 200), text("answer", true, 300)));
        COLLECTIONS.put("events", List.of(text("title", true, 60),
                choice("day", true, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"), time("time")));
        COLLECTIONS.put("resources", List.of(text("title", true, 60), url("url")));
        COLLECTIONS.put("grades", List.of(text("name", true, 60), reqNum("credits", 1, 12),
                reqNum("gradePoint", 0, 10), num("semester", 1, 12)));
        COLLECTIONS.put("sessions", List.of(date("date"), reqNum("minutes", 1, 600), text("label", false, 40)));
    }

    static String newId() {
        return UUID.randomUUID().toString();
    }

    /** Validates a record for one of the collections. */
    static Map<String, Object> clean(String collection, Map<String, Object> in, boolean create) {
        return cleanFields(COLLECTIONS.get(collection), in, create);
    }

    static Map<String, Object> cleanFields(List<Field> fields, Map<String, Object> in, boolean create) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Field f : fields) {
            Object raw = in.get(f.name());
            if (raw == null) {
                if (create && f.required()) throw bad(f.name(), "is required");
                continue;
            }
            out.put(f.name(), value(f, raw));
        }
        return out;
    }

    private static Object value(Field f, Object raw) {
        String n = f.name();
        switch (f.type()) {
            case STR: {
                if (!(raw instanceof String)) throw bad(n, "must be text");
                String s = tidy((String) raw);
                if (f.required() && s.isEmpty()) throw bad(n, "can't be empty");
                if (s.length() > f.max()) throw bad(n, "is too long (max " + f.max() + " characters)");
                return s;
            }
            case INT: {
                if (!(raw instanceof Number)) throw bad(n, "must be a number");
                double d = ((Number) raw).doubleValue();
                if (d != Math.rint(d)) throw bad(n, "must be a whole number");
                long v = (long) d;
                if (v < f.min() || v > f.max()) throw bad(n, "must be between " + f.min() + " and " + f.max());
                return v;
            }
            case BOOL: {
                if (!(raw instanceof Boolean)) throw bad(n, "must be true or false");
                return raw;
            }
            case DATE: {
                String s = raw instanceof String ? ((String) raw).trim() : "";
                if (!DATE_RE.matcher(s).matches()) throw bad(n, "must be a date like 2026-10-27");
                try {
                    LocalDate.parse(s);
                } catch (Exception e) {
                    throw bad(n, "is not a real date");
                }
                return s;
            }
            case TIME: {
                String s = raw instanceof String ? ((String) raw).trim() : "";
                if (!TIME_RE.matcher(s).matches()) throw bad(n, "must be a time like 14:30");
                return s;
            }
            case URL: {
                String s = raw instanceof String ? tidy((String) raw) : "";
                if (s.isEmpty() || s.length() > f.max()) throw bad(n, "must be a link up to " + f.max() + " characters");
                try {
                    URI u = URI.create(s);
                    String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                    if (!(scheme.equals("http") || scheme.equals("https")) || u.getHost() == null) throw new IllegalArgumentException();
                } catch (IllegalArgumentException e) {
                    throw bad(n, "must be a full web link starting with http:// or https://");
                }
                return s;
            }
            case ENUM: {
                String s = raw instanceof String ? ((String) raw) : "";
                if (!f.options().contains(s)) throw bad(n, "must be one of: " + String.join(", ", f.options()));
                return s;
            }
            case TOPICS: {
                List<Object> list = Json.asList(raw);
                if (list == null) throw bad(n, "must be a list");
                if (list.size() > f.max()) throw bad(n, "can have at most " + f.max() + " items");
                List<Object> out = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                for (Object o : list) {
                    Map<String, Object> m = Json.asMap(o);
                    String name = tidy(m != null ? Json.str(m.get("name"), "") : (o instanceof String ? (String) o : ""));
                    if (name.isEmpty()) continue;
                    if (name.length() > 80) throw bad(n, "has a topic longer than 80 characters");
                    String id = m != null ? Json.str(m.get("id"), "") : "";
                    if (!ID.matcher(id).matches() || !seen.add(id)) {
                        id = newId();
                        seen.add(id);
                    }
                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("id", id);
                    t.put("name", name);
                    t.put("done", m != null && Json.bool(m.get("done")));
                    out.add(t);
                }
                return out;
            }
            default:
                throw bad(n, "is invalid");
        }
    }

    /** Single-line text: control characters become spaces, ends are trimmed. */
    static String tidy(String s) {
        return s.replaceAll("\\p{Cntrl}", " ").trim();
    }

    private static ApiException bad(String field, String problem) {
        String label = field.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase();
        label = Character.toUpperCase(label.charAt(0)) + label.substring(1);
        return new ApiException(400, label + " " + problem + ".");
    }
}
