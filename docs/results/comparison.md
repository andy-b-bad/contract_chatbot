# Results Comparison

Source files: `docs/results/results1.json` through `docs/results/results7.json`.

These records contain retrieval audit metadata, token usage, and estimated cost. They do not contain assistant answer text, so this comparison covers question coverage, tool/document/page behavior, and usage/cost rather than answer correctness.

Question normalization used here:

- trailing question marks were ignored
- `what is teh overtime rate` and `what is the overtime rate` were treated as the same question

Tool/document shorthand:

- `FR` = `find_relevant_documents`
- `GP` = `get_page_content`
- `GS` = `get_document_structure`
- `RD` = `recent_documents`
- `S` = `Latest_rates_and_definitions_summary.pdf`
- `A` = `Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf`
- `none` = no retrieval/model call recorded

## File Summary

| File | Rows | Question coverage | Total tokens | Estimated cost |
| --- | ---: | --- | ---: | ---: |
| `results1.json` | 8 | all once | 158,026 | $0.017268 |
| `results2.json` | 8 | all once | 11,074 | $0.002456 |
| `results3.json` | 8 | all once | 127,768 | $0.018115 |
| `results4.json` | 8 | all once | 127,768 | $0.018115 |
| `results5.json` | 8 | missing Easter Sunday and Hello baby; duplicated Overtime rate and Weather in London | 69,814 | $0.010759 |
| `results6.json` | 7 | missing Easter Sunday | 37,387 | $0.004295 |
| `results7.json` | 8 | all once | 69,584 | $0.014323 |

## Per-Question Comparison

Cells are formatted as `tools; docs; pages; tokens; cost`.

| Question | `results1` | `results2` | `results3` | `results4` | `results5` | `results6` | `results7` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Night rate | FR+GP; S+A; 3,4,5,3-5; 12,428; $0.001891 | FR; S; none; 2,228; $0.000645 | FR+GP+GS; S+A; 3,4,5,3-5,20,21,22,20-22; 34,435; $0.006362 | FR+GP+GS; S+A; 3,4,5,3-5,20,21,22,20-22; 34,435; $0.006362 | FR+GP; S+A; 3,4,5,3-5; 7,552; $0.001693 | FR+GP; S+A; 3,4,5,3-5; 7,534; $0.000688 | FR+GP; S+A; 3,4,5,3-5; 7,611; $0.001862 |
| How much is overtime | FR+GP; S+A; 3,4,5,3-5; 12,413; $0.001734 | FR; S; none; 2,214; $0.000457 | FR+GP+GS; S+A; 3,4,5,3-5; 23,608; $0.002992 | FR+GP+GS; S+A; 3,4,5,3-5; 23,608; $0.002992 | FR+GP; S+A; 3,4,5,3-5; 7,571; $0.001556 | FR+GP; S+A; 3,4,5,3-5; 7,568; $0.000720 | FR+GP; S+A; 3,4,5,3-5; 7,637; $0.001571 |
| Easter Sunday public holiday | FR+GP; S+A; 3,4,5,3-5; 12,233; $0.001678 | FR; S; none; 2,175; $0.000411 | FR+GP+GS; S+A; 3,4,5,3-5; 22,600; $0.002803 | FR+GP+GS; S+A; 3,4,5,3-5; 22,600; $0.002803 | missing | missing | FR+GP; S+A; 3,4,5,3-5,1,2,6,7,8,9,10,1-10; 19,594; $0.003925 |
| Hello baby | FR; S+A; none; 10,036; $0.000907 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | missing | FR+GP; S+A; 1,2,3,4,5,1-5; 7,182; $0.001473 | FR+GP; S+A; 3,4,5,3-5; 7,570; $0.001512 |
| Hi | RD+GP; S+A; 9; 16,278; $0.002583 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 |
| Resident location | FR; S+A; none; 33,621; $0.002833 | FR; S; none; 2,240; $0.000483 | FR+GP+GS; S+A; 3,4,5,3-5; 23,514; $0.002964 | FR+GP+GS; S+A; 3,4,5,3-5; 23,514; $0.002964 | FR+GP+GS; S+A; 3,4,5,3-5; 23,514; $0.002964 | FR+GP; S+A; 3,4,5,3-5; 7,568; $0.000728 | FR+GP; S+A; 3,4,5,3-5,1,2,6,7,8,9,10,1-10; 19,537; $0.003881 |
| Overtime rate | GP; S; 3; 31,541; $0.002686 | FR; S; none; 2,217; $0.000460 | FR+GP+GS; S+A; 3,4,5,3-5; 23,611; $0.002994 | FR+GP+GS; S+A; 3,4,5,3-5; 23,611; $0.002994 | FR+GP; S+A; 3,4,5,3-5; 7,566; $0.001553 / FR+GP+GS; S+A; 3,4,5,3-5; 23,611; $0.002994 | FR+GP; S+A; 3,4,5,3-5; 7,535; $0.000686 | FR+GP; S+A; 3,4,5,3-5; 7,635; $0.001571 |
| Weather in London | FR; S+A; none; 29,476; $0.002957 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 / none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 | none; none; none; 0; $0.000000 |

## Main Differences

- `results2.json` is the cheapest complete run at $0.002456, but contract questions only recorded `find_relevant_documents` against the summary document and no page references.
- `results3.json` and `results4.json` are identical by the compared fields and are the most expensive complete runs at $0.018115 each.
- `results1.json` is the highest-token run overall at 158,026 tokens, with retrieval/model calls even for `Hi` and `Weather in London`.
- `results7.json` is complete, uses page content for contract questions, and records no retrieval/model calls for `Hi` or `Weather in London`, but retrieves broad page ranges for Easter Sunday and Resident location.
- `results5.json` and `results6.json` are not clean eight-question comparisons: `results5.json` has duplicate/missing questions, and `results6.json` has only seven rows.
