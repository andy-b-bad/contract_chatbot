## Document Search by Description [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#document-search-by-description)

For documents that don’t have metadata, you can use LLM-generated descriptions to help with document selection. This is a lightweight approach that works best with a small number of documents.

### Example Pipeline [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#example-pipeline)

#### PageIndex Tree Generation [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#pageindex-tree-generation)

Upload all documents into PageIndex to get their `doc_id` and tree structure.

#### Description Generation [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#description-generation)

Generate a description for each document based on its PageIndex tree structure and node summaries.

```

prompt = f"""
You are given a table of contents structure of a document.
Your task is to generate a one-sentence description for the document that makes it easy to distinguish from other documents.

Document tree structure: {PageIndex_Tree}

Directly return the description, do not include any other text.
"""
```

#### Search with LLM [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#search-with-llm)

Use an LLM to select relevant documents by comparing the user query against the generated descriptions.

Below is a sample prompt for document selection based on their descriptions:

```

prompt = f"""
You are given a list of documents with their IDs, file names, and descriptions. Your task is to select documents that may contain information relevant to answering the user query.

Query: {query}

Documents: [\
    {\
        "doc_id": "xxx",\
        "doc_name": "xxx",\
        "doc_description": "xxx"\
    }\
]

Response Format:
{{
    "thinking": "<Your reasoning for document selection>",
    "answer": <Python list of relevant doc_ids>, e.g. ['doc_id1', 'doc_id2']. Return [] if no documents are relevant.
}}

Return only the JSON structure, with no additional output.
"""
```

#### Retrieve with PageIndex [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#retrieve-with-pageindex)

Use the PageIndex `doc_id` of the retrieved documents to perform further retrieval via the PageIndex retrieval API.

## 💬 Community & Support [Permalink for this section](https://docs.pageindex.ai/tutorials/doc-search/description\#-community--support)



* * *