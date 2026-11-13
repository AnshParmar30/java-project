import java.time.LocalDate;
import java.util.Map;

/**
 * Spaced repetition using the Leitner system. A card lives in a box from 1 to 5.
 * Cards you know move up and come back after a longer gap; cards you miss drop
 * back to box 1 and come back right away.
 */
final class Flashcards {
    private Flashcards() {}

    /** Days to wait before a card in box N is due again (index = box). */
    static final int[] GAP_DAYS = {0, 1, 3, 7, 14, 30};
    static final int MAX_BOX = 5;

    static void review(Map<String, Object> card, boolean known, LocalDate today) {
        int box = (int) Json.lng(card.get("box"), 1);
        long reviews = Json.lng(card.get("reviews"), 0) + 1;
        if (known) {
            box = Math.min(MAX_BOX, Math.max(1, box) + 1);
            card.put("due", today.plusDays(GAP_DAYS[box]).toString());
        } else {
            box = 1;
            card.put("due", today.toString());
            card.put("lapses", Json.lng(card.get("lapses"), 0) + 1);
        }
        card.put("box", (long) box);
        card.put("reviews", reviews);
        card.put("lastReview", today.toString());
    }

    static boolean isDue(Map<String, Object> card, LocalDate today) {
        String due = Json.str(card.get("due"), "");
        return due.isEmpty() || due.compareTo(today.toString()) <= 0;
    }
}
