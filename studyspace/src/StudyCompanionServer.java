import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Smart Study Companion server.
 *
 * - Serves the web app from the "web" folder.
 * - Offers a JSON API under /api/ (accounts, data, analytics, search, export).
 * - Stores everything as JSON files in the "data" folder.
 */
public class StudyCompanionServer {
    private static final Path ROOT = Path.of("web").toAbsolutePath().normalize();
    private static final int MAX_BODY = 1_000_000;
    private static final String COOKIE = "ss_token";
    private static final long COOKIE_SECONDS = 30L * 24 * 3600;
    private static final String CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            + "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; "
            + "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

    private static Store store;

    /** A response that is ready to be written to the browser. */
    private record Resp(int status, String type, byte[] body, Map<String, String> headers) {
        static Resp json(Object o) { return json(200, o); }

        static Resp json(int status, Object o) {
            return new Resp(status, "application/json; charset=utf-8",
                    Json.stringify(o).getBytes(StandardCharsets.UTF_8), Map.of());
        }

        Resp with(String header, String value) {
            Map<String, String> h = new LinkedHashMap<>(headers);
            h.put(header, value);
            return new Resp(status, type, body, h);
        }
    }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        String host = System.getenv().getOrDefault("HOST", "127.0.0.1");
        Path dataDir = Path.of(System.getenv().getOrDefault("DATA_DIR", "data")).toAbsolutePath().normalize();
        store = new Store(dataDir);

        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.createContext("/api/", StudyCompanionServer::handleApi);
        server.createContext("/", StudyCompanionServer::serveStatic);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("Smart Study Companion is running at http://localhost:" + port);
        System.out.println("Your data is saved in: " + dataDir);
    }

    // =====================================================================
    // Static files
    // =====================================================================

    private static void serveStatic(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        if (!method.equals("GET") && !method.equals("HEAD")) {
            send(ex, Resp.json(405, Map.of("error", "Method not allowed")));
            return;
        }
        String requestPath = ex.getRequestURI().getPath();
        if (requestPath.equals("/")) requestPath = "/index.html";
        Path file;
        try {
            file = ROOT.resolve(requestPath.substring(1)).normalize();
        } catch (Exception e) {
            send(ex, plain(404, "Not found"));
            return;
        }
        if (!file.startsWith(ROOT) || !Files.isRegularFile(file)) {
            send(ex, plain(404, "Not found"));
            return;
        }
        send(ex, new Resp(200, mime(file.getFileName().toString().toLowerCase()), Files.readAllBytes(file), Map.of()));
    }

    private static String mime(String name) {
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (name.endsWith(".json")) return "application/json; charset=utf-8";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".ico")) return "image/x-icon";
        if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private static Resp plain(int status, String text) {
        return new Resp(status, "text/plain; charset=utf-8", text.getBytes(StandardCharsets.UTF_8), Map.of());
    }

    // =====================================================================
    // API entry point
    // =====================================================================

    private static void handleApi(HttpExchange ex) throws IOException {
        Resp resp;
        try {
            checkOrigin(ex);
            String method = ex.getRequestMethod();
            String path = ex.getRequestURI().getPath().substring("/api/".length());
            String[] seg = path.isEmpty() ? new String[0] : path.split("/");
            String body = (method.equals("POST") || method.equals("PUT")) ? readBody(ex) : "";
            resp = route(ex, method, seg, parseQuery(ex.getRequestURI().getRawQuery()), body);
        } catch (ApiException e) {
            resp = Resp.json(e.status, Map.of("error", e.getMessage()));
        } catch (Json.JsonException e) {
            resp = Resp.json(400, Map.of("error", "The request was not valid JSON."));
        } catch (Exception e) {
            e.printStackTrace();
            resp = Resp.json(500, Map.of("error", "Something went wrong on the server."));
        }
        send(ex, resp);
    }

    private static Resp route(HttpExchange ex, String method, String[] seg, Map<String, String> q, String body) {
        if (seg.length == 0) throw new ApiException(404, "Not found");
        String r = seg[0];

        if (r.equals("health") && method.equals("GET")) {
            return Resp.json(Map.of("status", "ok", "app", "Smart Study Companion"));
        }
        if (r.equals("register") && method.equals("POST")) return register(body);
        if (r.equals("login") && method.equals("POST")) return login(ex, body);
        if (r.equals("logout") && method.equals("POST")) {
            String token = cookie(ex, COOKIE);
            if (token != null) store.revokeToken(token);
            return Resp.json(Map.of("ok", true)).with("Set-Cookie", cookieHeader("", 0));
        }

        String token = cookie(ex, COOKIE);
        String uid = token == null ? null : store.userIdForToken(token);
        if (uid == null) throw new ApiException(401, "Please log in to continue.");

        synchronized (store) {
            return authed(method, seg, q, body, uid);
        }
    }

    // =====================================================================
    // Accounts
    // =====================================================================

    private static Resp register(String body) {
        Map<String, Object> in = Json.parseObject(body);
        String username = Json.str(in.get("username"), "").trim();
        String password = Json.str(in.get("password"), "");
        if (!Auth.USERNAME.matcher(username).matches())
            throw new ApiException(400, "Username must be 3 to 20 characters: letters, numbers or underscore.");
        if (password.length() < 6 || password.length() > 100)
            throw new ApiException(400, "Password must be 6 to 100 characters.");
        String salt = Auth.newSalt();
        String hash = Auth.hash(password, salt);
        synchronized (store) {
            Map<String, Object> u = store.createUser(username, salt, hash);
            String token = store.newToken((String) u.get("id"));
            return Resp.json(Map.of("username", username)).with("Set-Cookie", cookieHeader(token, COOKIE_SECONDS));
        }
    }

    private static Resp login(HttpExchange ex, String body) {
        Map<String, Object> in = Json.parseObject(body);
        String username = Json.str(in.get("username"), "").trim();
        String password = Json.str(in.get("password"), "");
        String key = username.toLowerCase() + "|" + ex.getRemoteAddress().getAddress().getHostAddress();
        Auth.checkAllowed(key);
        Map<String, Object> u = store.findUser(username);
        boolean ok;
        if (u == null) {
            Auth.hash(password, Auth.newSalt()); // keep timing similar whether or not the user exists
            ok = false;
        } else {
            ok = Auth.matches(password, Json.str(u.get("salt"), ""), Json.str(u.get("hash"), ""));
        }
        if (!ok) {
            Auth.failed(key);
            throw new ApiException(401, "Wrong username or password.");
        }
        Auth.succeeded(key);
        String token = store.newToken((String) u.get("id"));
        return Resp.json(Map.of("username", Json.str(u.get("username"), ""))).with("Set-Cookie", cookieHeader(token, COOKIE_SECONDS));
    }

    private static String cookieHeader(String value, long maxAge) {
        return COOKIE + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + maxAge;
    }

    // =====================================================================
    // Logged-in API
    // =====================================================================

    private static Resp authed(String method, String[] seg, Map<String, String> q, String body, String uid) {
        Map<String, Object> data = store.data(uid);
        String r = seg[0];

        switch (r) {
            case "me":
                return Resp.json(Map.of("username", store.username(uid)));

            case "data": {
                need(method, "GET");
                Map<String, Object> out = new LinkedHashMap<>(data);
                out.put("username", store.username(uid));
                return Resp.json(out);
            }

            case "dashboard":
                need(method, "GET");
                return Resp.json(Analytics.dashboard(data, today(q)));

            case "search":
                need(method, "GET");
                return Resp.json(Analytics.search(data, q.getOrDefault("q", "")));

            case "export": {
                need(method, "GET");
                if ("csv".equals(q.get("format"))) {
                    return new Resp(200, "text/csv; charset=utf-8", Analytics.attendanceCsv(data).getBytes(StandardCharsets.UTF_8), Map.of())
                            .with("Content-Disposition", "attachment; filename=\"attendance.csv\"");
                }
                Map<String, Object> out = new LinkedHashMap<>(data);
                out.put("username", store.username(uid));
                return new Resp(200, "application/json; charset=utf-8", Json.stringify(out).getBytes(StandardCharsets.UTF_8), Map.of())
                        .with("Content-Disposition", "attachment; filename=\"studyspace-backup.json\"");
            }

            case "notes": {
                need(method, "PUT");
                String text = Json.str(Json.parseObject(body).get("text"), null);
                if (text == null) throw new ApiException(400, "Notes must be text.");
                if (text.length() > 20000) throw new ApiException(400, "Notes can be up to 20,000 characters.");
                data.put("notes", text);
                store.save(uid);
                return Resp.json(Map.of("ok", true));
            }

            case "settings": {
                need(method, "PUT");
                Map<String, Object> clean = Schema.cleanFields(Schema.SETTINGS, Json.parseObject(body), false);
                data.put("settings", mergeSettings(data, clean));
                store.save(uid);
                return Resp.json(data.get("settings"));
            }

            case "import":
                need(method, "POST");
                return importData(Json.parseObject(body), data, uid);

            default:
                return collection(method, seg, body, uid, data);
        }
    }

    private static Map<String, Object> mergeSettings(Map<String, Object> data, Map<String, Object> clean) {
        Map<String, Object> s = Json.asMap(data.get("settings"));
        if (s == null) s = new LinkedHashMap<>();
        s.putAll(clean);
        return s;
    }

    private static void need(String method, String expected) {
        if (!method.equals(expected)) throw new ApiException(405, "Method not allowed.");
    }

    private static LocalDate today(Map<String, String> q) {
        String t = q.get("today");
        if (t == null || t.isEmpty()) return LocalDate.now();
        try {
            return LocalDate.parse(t);
        } catch (Exception e) {
            throw new ApiException(400, "Today must be a date like 2026-10-27.");
        }
    }

    // ---------------------------------------------------------------------
    // Generic collection routes: list, create, update, delete (+ card review)
    // ---------------------------------------------------------------------

    private static Resp collection(String method, String[] seg, String body, String uid, Map<String, Object> data) {
        String coll = seg[0];
        if (!Schema.COLLECTIONS.containsKey(coll)) throw new ApiException(404, "Not found");
        List<Object> items = Analytics.rawList(data, coll);
        String id = seg.length > 1 ? seg[1] : null;
        boolean review = seg.length == 3 && coll.equals("cards") && seg[2].equals("review");
        if (seg.length > 3 || (seg.length == 3 && !review)) throw new ApiException(404, "Not found");

        if (id == null) {
            if (method.equals("GET")) return Resp.json(items);
            if (method.equals("POST")) {
                Map<String, Object> item = createItem(coll, Json.parseObject(body), data, null);
                store.save(uid);
                return Resp.json(201, item);
            }
            throw new ApiException(405, "Method not allowed.");
        }

        Map<String, Object> item = find(items, id);
        if (item == null) throw new ApiException(404, "That item no longer exists.");

        if (review) {
            need(method, "POST");
            Map<String, Object> in = Json.parseObject(body);
            LocalDate day;
            try {
                day = LocalDate.parse(Json.str(in.get("today"), LocalDate.now().toString()));
            } catch (Exception e) {
                throw new ApiException(400, "Today must be a date like 2026-10-27.");
            }
            Flashcards.review(item, Json.bool(in.get("known")), day);
            store.save(uid);
            return Resp.json(item);
        }

        switch (method) {
            case "GET":
                return Resp.json(item);
            case "PUT": {
                Map<String, Object> clean = Schema.clean(coll, Json.parseObject(body), false);
                item.putAll(clean);
                checkReferences(coll, item, data);
                store.save(uid);
                return Resp.json(item);
            }
            case "DELETE": {
                items.remove(item);
                if (coll.equals("subjects")) cascadeSubjectDelete(id, data);
                store.save(uid);
                return Resp.json(Map.of("ok", true));
            }
            default:
                throw new ApiException(405, "Method not allowed.");
        }
    }

    /** Validates and stores a new record. Used by create and import. */
    private static Map<String, Object> createItem(String coll, Map<String, Object> in, Map<String, Object> data, String forcedId) {
        List<Object> items = Analytics.rawList(data, coll);
        if (items.size() >= Schema.maxItems(coll))
            throw new ApiException(400, "You've reached the limit of " + Schema.maxItems(coll) + " items here.");
        Map<String, Object> item = Schema.clean(coll, in, true);
        item.put("id", forcedId != null ? forcedId : Schema.newId());
        item.put("created", System.currentTimeMillis());
        prepareNew(coll, item, items);
        checkReferences(coll, item, data);

        if (coll.equals("attendance")) {
            // One record per subject per day: marking again just changes the status.
            for (Object o : items) {
                Map<String, Object> existing = Json.asMap(o);
                if (existing != null
                        && existing.get("subjectId").equals(item.get("subjectId"))
                        && existing.get("date").equals(item.get("date"))) {
                    existing.put("status", item.get("status"));
                    return existing;
                }
            }
        }
        items.add(item);
        return item;
    }

    private static void prepareNew(String coll, Map<String, Object> item, List<Object> existing) {
        switch (coll) {
            case "subjects": {
                item.putIfAbsent("topics", new ArrayList<Object>());
                if (!item.containsKey("color")) {
                    int[] used = new int[6];
                    for (Object o : existing) {
                        Map<String, Object> m = Json.asMap(o);
                        if (m != null) used[(int) Math.floorMod(Json.lng(m.get("color"), 0), 6L)]++;
                    }
                    int best = 0;
                    for (int i = 1; i < 6; i++) if (used[i] < used[best]) best = i;
                    item.put("color", (long) best);
                }
                break;
            }
            case "tasks":
                item.putIfAbsent("subject", "");
                item.putIfAbsent("minutes", 25L);
                item.putIfAbsent("priority", "medium");
                item.putIfAbsent("done", false);
                break;
            case "exams":
                item.putIfAbsent("subjectId", "");
                break;
            case "assignments":
                item.putIfAbsent("subjectId", "");
                item.putIfAbsent("done", false);
                break;
            case "cards":
                item.put("box", 1L);
                item.put("due", "");
                item.put("reviews", 0L);
                item.put("lapses", 0L);
                break;
            case "grades":
                item.putIfAbsent("semester", 1L);
                break;
            case "sessions":
                item.putIfAbsent("label", "");
                break;
            default:
                break;
        }
    }

    /** Makes sure links to subjects point at real subjects. */
    private static void checkReferences(String coll, Map<String, Object> item, Map<String, Object> data) {
        if (!(coll.equals("attendance") || coll.equals("exams") || coll.equals("assignments"))) return;
        String sid = Json.str(item.get("subjectId"), "");
        if (sid.isEmpty() && !coll.equals("attendance")) return;
        if (find(Analytics.rawList(data, "subjects"), sid) == null) {
            if (coll.equals("attendance")) throw new ApiException(400, "Choose a subject that exists.");
            item.put("subjectId", "");
        }
    }

    private static void cascadeSubjectDelete(String id, Map<String, Object> data) {
        Analytics.rawList(data, "attendance").removeIf(o -> {
            Map<String, Object> m = Json.asMap(o);
            return m != null && id.equals(m.get("subjectId"));
        });
        for (String c : List.of("exams", "assignments")) {
            for (Object o : Analytics.rawList(data, c)) {
                Map<String, Object> m = Json.asMap(o);
                if (m != null && id.equals(m.get("subjectId"))) m.put("subjectId", "");
            }
        }
    }

    private static Map<String, Object> find(List<Object> items, String id) {
        for (Object o : items) {
            Map<String, Object> m = Json.asMap(o);
            if (m != null && id.equals(m.get("id"))) return m;
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Import (used to bring over data saved by the earlier, browser-only version)
    // ---------------------------------------------------------------------

    private static Resp importData(Map<String, Object> in, Map<String, Object> data, String uid) {
        int added = 0;
        for (String coll : Schema.COLLECTIONS.keySet()) {
            List<Object> src = Json.asList(in.get(coll));
            if (src == null) continue;
            List<Object> existing = Analytics.rawList(data, coll);
            for (Object o : src) {
                Map<String, Object> m = Json.asMap(o);
                if (m == null || existing.size() >= Schema.maxItems(coll)) continue;
                String id = Json.str(m.get("id"), "");
                if (!Schema.ID.matcher(id).matches()) id = null;
                if (id != null && find(existing, id) != null) continue; // already imported
                try {
                    createItem(coll, m, data, id);
                    added++;
                } catch (ApiException skip) {
                    // skip records that don't pass validation
                }
            }
        }
        String notes = Json.str(in.get("notes"), "");
        if (!notes.isEmpty() && Json.str(data.get("notes"), "").isEmpty() && notes.length() <= 20000) data.put("notes", notes);
        store.save(uid);
        return Resp.json(Map.of("added", added));
    }

    // =====================================================================
    // HTTP helpers
    // =====================================================================

    private static void checkOrigin(HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.equals("null")) return;
        String host = ex.getRequestHeaders().getFirst("Host");
        try {
            String auth = URI.create(origin).getAuthority();
            if (host != null && auth != null && host.equalsIgnoreCase(auth)) return;
        } catch (IllegalArgumentException ignored) {
            // fall through to the error below
        }
        throw new ApiException(403, "Cross-site request blocked.");
    }

    private static String readBody(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            byte[] buf = in.readNBytes(MAX_BODY + 1);
            if (buf.length > MAX_BODY) throw new ApiException(413, "The request is too large.");
            return new String(buf, StandardCharsets.UTF_8);
        }
    }

    private static Map<String, String> parseQuery(String raw) {
        Map<String, String> q = new HashMap<>();
        if (raw == null || raw.isEmpty()) return q;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            String k = eq < 0 ? pair : pair.substring(0, eq);
            String v = eq < 0 ? "" : pair.substring(eq + 1);
            q.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return q;
    }

    private static String cookie(HttpExchange ex, String name) {
        List<String> headers = ex.getRequestHeaders().get("Cookie");
        if (headers == null) return null;
        for (String h : headers) {
            for (String part : h.split(";")) {
                String p = part.trim();
                if (p.startsWith(name + "=")) return p.substring(name.length() + 1);
            }
        }
        return null;
    }

    private static void send(HttpExchange ex, Resp r) throws IOException {
        Headers h = ex.getResponseHeaders();
        h.set("Content-Type", r.type());
        h.set("Cache-Control", "no-store");
        h.set("X-Content-Type-Options", "nosniff");
        h.set("X-Frame-Options", "DENY");
        h.set("Referrer-Policy", "same-origin");
        h.set("Content-Security-Policy", CSP);
        for (Map.Entry<String, String> e : r.headers().entrySet()) h.add(e.getKey(), e.getValue());
        boolean head = ex.getRequestMethod().equals("HEAD");
        if (r.body().length == 0 || head) {
            ex.sendResponseHeaders(r.status(), -1);
        } else {
            ex.sendResponseHeaders(r.status(), r.body().length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(r.body());
            }
        }
        ex.close();
    }
}
