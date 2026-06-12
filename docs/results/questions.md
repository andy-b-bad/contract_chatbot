I have now updated docs/results/questions.md with the cleaned desired-answer benchmark.

Use it only as a gold-standard evaluation specification:
- required facts;
- required source coverage;
- forbidden behaviours;
- approved out-of-scope wording.

Do not use it as:
- historical candidate-answer evidence;
- a production answer lookup table;
- query-specific routing;
- runtime factual authority.

Continue recovering real historical assistant answers from Supabase where available. Where no genuine historical example exists for a defect category, do not invent one and do not relabel a desired answer as historical. Report that fixture category as unavailable.

The offline validator tests should keep these separate:
1. real historical candidate answers from chat_messages;
2. desired-answer requirements from docs/results/questions.md;
3. canonical source evidence from PageIndex fixtures.