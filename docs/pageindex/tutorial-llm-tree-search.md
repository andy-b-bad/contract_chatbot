

## LLM Tree Search [Permalink for this section](https://docs.pageindex.ai/tutorials/tree-search/llm\#llm-tree-search)

A simple strategy is to use an LLM agent to perform tree search. Here is a basic tree search prompt.

```

prompt = f"""
You are given a query and the tree structure of a document.
You need to find all nodes that are likely to contain the answer.

Query: {query}

Document tree structure: {PageIndex_Tree}

Reply in the following JSON format:
{{
  "thinking": <your reasoning about which nodes are relevant>,
  "node_list": [node_id1, node_id2, ...]
}}
"""
```

In our dashboard and retrieval API, we use a combination of LLM tree search and value function-based Monte Carlo Tree Search ( [MCTS](https://en.wikipedia.org/wiki/Monte_Carlo_tree_search)). More details will be released soon.

### Integrating User Preference or Expert Knowledge [Permalink for this section](https://docs.pageindex.ai/tutorials/tree-search/llm\#integrating-user-preference-or-expert-knowledge)

Unlike vector-based RAG where integrating expert knowledge or user preferences requires fine-tuning the embedding model, in PageIndex, you can incorporate user preferences or expert knowledge by simply adding knowledge to the LLM tree search prompt. Here is an example pipeline.

#### Preference Retrieval [Permalink for this section](https://docs.pageindex.ai/tutorials/tree-search/llm\#preference-retrieval)

When a query is received, the system selects the most relevant user preference or expert knowledge snippets from a database or a set of domain-specific rules. This can be done using keyword matching, semantic similarity, or LLM-based relevance search.

#### Tree Search with Preference [Permalink for this section](https://docs.pageindex.ai/tutorials/tree-search/llm\#tree-search-with-preference)

Integrating preferences into the tree search prompt.

**Enhanced Tree Search with Expert Preference Example**

```

prompt = f"""
You are given a question and a tree structure of a document.
You need to find all nodes that are likely to contain the answer.

Query: {query}

Document tree structure:  {PageIndex_Tree}

Expert Knowledge of relevant sections: {Preference}

Reply in the following JSON format:
{{
  "thinking": <reasoning about which nodes are relevant>,
  "node_list": [node_id1, node_id2, ...]
}}
"""
```

**Example Expert Preference**

> If the query mentions EBITDA adjustments, prioritize Item 7 (MD&A) and footnotes in Item 8 (Financial Statements) in 10-K reports.

By integrating user or expert preferences, node search becomes more targeted and effective, leveraging both the document structure and domain-specific insights.

## 💬 Community & Support [Permalink for this section](https://docs.pageindex.ai/tutorials/tree-search/llm\#-community--support)

Contact us if you need any advice on conducting document searches for your use case.

- 🤝 [Join our Discord](https://discord.gg/VuXuf29EUj)
- 📨 [Leave us a message](https://ii2abc2jejf.typeform.com/to/tK3AXl8T)

Last updated onMarch 23, 2026

[Tree Search](https://docs.pageindex.ai/tutorials/tree-search "Tree Search") [Hybrid Tree Search](https://docs.pageindex.ai/tutorials/tree-search/hybrid "Hybrid Tree Search")

* * *