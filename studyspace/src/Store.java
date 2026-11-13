import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.*;

/**
 * Keeps everything on disk as plain JSON files inside the data folder:
 * users.json, sessions.json (login tokens) and one u_&lt;id&gt;.json per user.
 * Every public method is synchronized, and the server also locks on the store
 * while it works with a user's data.
 */
final class Store {
    private static final long TOKEN_LIFETIME_MS = 30L * 24 * 3600 * 1000;

    private final Path dir;
    private final Path usersFile;
    private final Path tokensFile;
    private final List<Map<String, Object>> users = new ArrayList<>();
    /** sha256(token) -> {userId, exp} */
    private final Map<String, Map<String, Object>> tokens = new HashMap<>();
    private final Map<String, Map<String, Object>> cache = new HashMap<>();
    private final SecureRandom rng = new SecureRandom();

    Store(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);
        usersFile = dir.resolve("users.json");
        tokensFile = dir.resolve("sessions.json");

        Map<String, Object> u = readJson(usersFile);
        if (u != null) {
            List<Object> list = Json.asList(u.get("users"));
            if (list != null) for (Object o : list) {
                Map<String, Object> m = Json.asMap(o);
                if (m != null) users.add(m);
            }
        }
        Map<String, Object> t = readJson(tokensFile);
        if (t != null) {
            long now = System.currentTimeMillis();
            for (Map.Entry<String, Object> e : t.entrySet()) {
                Map<String, Object> m = Json.asMap(e.getValue());
                if (m != null && Json.lng(m.get("exp"), 0) > now) tokens.put(e.getKey(), m);
            }
        }
    }

    // ------------------------------------------------------------ users

    synchronized Map<String, Object> findUser(String username) {
        for (Map<String, Object> u : users) {
            if (Json.str(u.get("username"), "").equalsIgnoreCase(username)) return u;
        }
        return null;
    }

    synchronized String username(String userId) {
        for (Map<String, Object> u : users) {
            if (userId.equals(u.get("id"))) return Json.str(u.get("username"), "");
        }
        return "";
    }

    synchronized Map<String, Object> createUser(String username, String salt, String hash) {
        if (findUser(username) != null) throw new ApiException(409, "That username is already taken.");
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("id", Schema.newId());
        u.put("username", username);
        u.put("salt", salt);
        u.put("hash", hash);
        u.put("created", System.currentTimeMillis());
        users.add(u);
        Map<String, Object> file = new LinkedHashMap<>();
        file.put("users", users);
        write(usersFile, file);
        return u;
    }

    // ------------------------------------------------------------ login tokens

    synchronized String newToken(String userId) {
        byte[] b = new byte[32];
        rng.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        String token = sb.toString();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", userId);
        m.put("exp", System.currentTimeMillis() + TOKEN_LIFETIME_MS);
        tokens.put(sha256(token), m);
        saveTokens();
        return token;
    }

    synchronized String userIdForToken(String token) {
        Map<String, Object> m = tokens.get(sha256(token));
        if (m == null) return null;
        if (Json.lng(m.get("exp"), 0) < System.currentTimeMillis()) {
            tokens.remove(sha256(token));
            saveTokens();
            return null;
        }
        return Json.str(m.get("userId"), null);
    }

    synchronized void revokeToken(String token) {
        if (tokens.remove(sha256(token)) != null) saveTokens();
    }

    private void saveTokens() {
        write(tokensFile, new LinkedHashMap<String, Object>(tokens));
    }

    // ------------------------------------------------------------ user data

    synchronized Map<String, Object> data(String userId) {
        Map<String, Object> d = cache.get(userId);
        if (d == null) {
            d = readJson(dir.resolve("u_" + userId + ".json"));
            if (d == null) d = new LinkedHashMap<>();
            shape(d);
            cache.put(userId, d);
        }
        return d;
    }

    synchronized void save(String userId) {
        Map<String, Object> d = cache.get(userId);
        if (d != null) write(dir.resolve("u_" + userId + ".json"), d);
    }

    /** Makes sure every expected key exists, so older files keep working. */
    private static void shape(Map<String, Object> d) {
        for (String c : Schema.COLLECTIONS.keySet()) {
            if (!(d.get(c) instanceof List)) d.put(c, new ArrayList<Object>());
        }
        if (!(d.get("notes") instanceof String)) d.put("notes", "");
        Map<String, Object> s = Json.asMap(d.get("settings"));
        if (s == null) s = new LinkedHashMap<>();
        s.putIfAbsent("focus", 25L);
        s.putIfAbsent("pause", 5L);
        s.putIfAbsent("goal", 100L);
        s.putIfAbsent("target", 75L);
        d.put("settings", s);
    }

    // ------------------------------------------------------------ file helpers

    private Map<String, Object> readJson(Path file) {
        if (!Files.isRegularFile(file)) return null;
        try {
            return Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // Never silently throw away someone's data: keep the broken file for inspection.
            Path broken = file.resolveSibling(file.getFileName() + ".corrupt-" + System.currentTimeMillis());
            try {
                Files.move(file, broken);
            } catch (IOException ignored) {
                // nothing more we can do
            }
            System.err.println("Could not read " + file.getFileName() + " (" + e.getMessage() + "). Moved to " + broken.getFileName());
            return null;
        }
    }

    private void write(Path file, Object content) {
        try {
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, Json.stringify(content), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String sha256(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
