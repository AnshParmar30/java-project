import java.time.LocalDate;

/** A short study tip that changes every day. */
final class Tips {
    private Tips() {}

    private static final String[] TIPS = {
        "Review a topic within 24 hours of learning it. You'll remember far more.",
        "Test yourself before you re-read. Recalling an answer beats seeing it again.",
        "Study in 25-minute blocks, then take a real 5-minute break.",
        "Start with the hardest subject while your mind is fresh.",
        "Write the answer from memory first, then check your notes.",
        "Explain a topic out loud as if teaching a friend. Gaps show up fast.",
        "Sleep is part of studying. Memory gets stored overnight.",
        "Put your phone in another room for one focus session.",
        "Break a big chapter into small topics. Small wins keep you going.",
        "Mix subjects across the day instead of one subject for hours.",
        "Past papers are the closest thing to a preview of the exam.",
        "Plan tomorrow's first task tonight. Starting becomes easy.",
        "Mark attendance the same day. Catching up later is harder than it looks.",
        "Mistakes in practice are useful. Note them down and revisit them.",
        "Drink water and stretch between sessions. Your focus will thank you.",
        "Use spaced repetition. Cards you miss come back sooner, cards you know come back later.",
        "Keep your desk clear. Fewer things in sight, fewer excuses to drift.",
        "Finish with a two-line summary of what you learned today.",
        "Study with a deadline. 'Done by 8 pm' beats 'sometime tonight'.",
        "Don't compare your day one to someone else's day one hundred.",
        "Short and daily beats long and rare."
    };

    static String forDate(LocalDate d) {
        return TIPS[d.getDayOfYear() % TIPS.length];
    }
}
