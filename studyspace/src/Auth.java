import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Password hashing (PBKDF2) and a small login rate limiter. */
final class Auth {
    private Auth() {}

    static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9_]{3,20}");
    private static final int ITERATIONS = 120_000;
    private static final SecureRandom RNG = new SecureRandom();
    private static final int MAX_FAILS = 5;
    private static final long LOCK_MS = 60_000;

    /** key -> {failures, lockedUntilMillis} */
    private static final Map<String, long[]> attempts = new HashMap<>();

    static String newSalt() {
        byte[] b = new byte[16];
        RNG.nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    static String hash(String password, String saltB64) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), Base64.getDecoder().decode(saltB64), ITERATIONS, 256);
            byte[] out = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Password hashing is not available", e);
        }
    }

    static boolean matches(String password, String saltB64, String expectedB64) {
        byte[] a = hash(password, saltB64).getBytes();
        byte[] b = expectedB64.getBytes();
        return MessageDigest.isEqual(a, b);
    }

    static synchronized void checkAllowed(String key) {
        long[] a = attempts.get(key);
        long now = System.currentTimeMillis();
        if (a != null && a[1] > now) {
            long secs = (a[1] - now + 999) / 1000;
            throw new ApiException(429, "Too many wrong attempts. Try again in " + secs + " seconds.");
        }
    }

    static synchronized void failed(String key) {
        long[] a = attempts.computeIfAbsent(key, k -> new long[2]);
        a[0]++;
        if (a[0] >= MAX_FAILS) {
            a[0] = 0;
            a[1] = System.currentTimeMillis() + LOCK_MS;
        }
    }

    static synchronized void succeeded(String key) {
        attempts.remove(key);
    }
}
