(function() {
    const START_DATE = new Date(2025, 3, 3); // April 3, 2025 (Thursday)
    const today = new Date();

    // Calculate days since start
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceStart = Math.floor((today - START_DATE) / msPerDay);

    // If we haven't started yet, no weeks completed
    if (daysSinceStart < 0) return;

    // Find days since last Wednesday (day 3)
    // Each week runs Thu(4) to Wed(3)
    // A week is complete when Wednesday has passed
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 3=Wed, 4=Thu

    // Days since the most recent Wednesday (end of week)
    // If today is Thu(4), last Wed was 1 day ago
    // If today is Wed(3), last Wed was 0 days ago (today)
    // If today is Tue(2), last Wed was 6 days ago
    const daysSinceWed = (dayOfWeek + 4) % 7;

    // The last completed Wednesday
    const lastWednesday = new Date(today);
    lastWednesday.setDate(today.getDate() - daysSinceWed);
    lastWednesday.setHours(23, 59, 59, 999);

    // First week ends April 9, 2025 (first Wednesday after start)
    const firstWeekEnd = new Date(2025, 3, 9, 23, 59, 59, 999);

    // If we haven't completed the first week yet
    if (lastWednesday < firstWeekEnd) return;

    // Calculate completed weeks
    const completedWeeks = Math.floor((lastWednesday - firstWeekEnd) / (7 * msPerDay)) + 1;

    // Apply filled class to completed weeks
    const weeks = document.querySelectorAll('.week');
    const maxToFill = Math.min(completedWeeks, weeks.length);

    for (let i = 0; i < maxToFill; i++) {
        weeks[i].classList.add('filled');
    }
})();
