
## 🔧 MCP Tools [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#-mcp-tools)

The `client.tools` layer wraps [PageIndex MCP](https://modelcontextprotocol.io/) capabilities as typed JavaScript methods, designed for building **custom AI agent tool integrations** where you need fine-grained control over tool invocation, parameter handling, and response processing.

💡

If your framework supports MCP natively, you can connect to PageIndex MCP directly — no SDK wrapper needed. See the [MCP](https://docs.pageindex.ai/mcp) page for connection configs with Vercel AI SDK, Claude Agent SDK, OpenAI Agents SDK, LangChain, and more.

### When to Use `client.tools` [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#when-to-use-clienttools)

- You need to **customize tool behavior** — add validation, transform inputs/outputs, filter results, or compose tools into multi-step workflows.
- You want to **mix PageIndex tools with other tools** in a single tool registry for your agent.
- You need **programmatic access** to document reading, search, or folder management outside of a chat/agent context.

Repo caveat for this app: Customize PageIndex tools only for product guardrails, scope/document eligibility, error handling, tracing, and bounded observability. Do not compose custom multi-step retrieval workflows that rank pages or replace PageIndex navigation.

* * *

## Agentic Integration Example [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#agentic-integration-example)

The primary use case for `client.tools` is wrapping PageIndex capabilities as tools for AI agent frameworks. Here’s a complete example using the [Vercel AI SDK](https://sdk.vercel.ai/):

```

import { tool } from "ai";
import { z } from "zod";
import { PageIndexClient } from "@pageindex/sdk";

const client = new PageIndexClient({
  apiKey: "YOUR_API_KEY",
  folderScope: "optional-folder-id",
});

// Wrap PageIndex tools for agentic use
const pageIndexTools = {
  pageindex_find_relevant_documents: tool({
    description: "Search for documents by keyword or semantic query",
    parameters: z.object({
      query: z.string().optional().describe("Search keywords"),
    }),
    execute: async (params) => client.tools.findRelevantDocuments(params),
  }),

  pageindex_get_document_structure: tool({
    description: "Get the hierarchical table of contents for a document",
    parameters: z.object({
      docName: z.string().describe("Document name"),
      waitForCompletion: z.boolean().optional(),
    }),
    execute: async (params) => client.tools.getDocumentStructure(params),
  }),

  pageindex_get_page_content: tool({
    description: "Read text content from specific pages of a document",
    parameters: z.object({
      docName: z.string().describe("Document name"),
      pages: z.string().describe('Page spec: "5", "3,7,10", or "5-10"'),
    }),
    execute: async (params) => client.tools.getPageContent(params),
  }),
};
```

Then pass these tools to your agentic framework:

```

import { streamText } from "ai";

const result = streamText({
  model,
  messages,
  tools: pageIndexTools,
});
```

The AI model will autonomously decide when to search documents, read structure, and fetch page content based on the user’s question.

* * *

## Available Tools [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#available-tools)

### Get Document Structure [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#get-document-structure)

Retrieve the hierarchical table of contents / outline for a processed document.

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| docName | string | yes | Document name | - |
| part | number | no | Part number for large documents (when structure is split across multiple parts) | - |
| waitForCompletion | boolean | no | Wait until processing completes before returning | false |
| folderId | string | no | Folder scope override | - |

**Example**

```

const result = await client.tools.getDocumentStructure({
  docName: "2023-annual-report.pdf",
  waitForCompletion: true,
});

console.log(result.structure);

if (result.total_parts && result.total_parts > 1) {
  const part2 = await client.tools.getDocumentStructure({
    docName: "2023-annual-report.pdf",
    part: 2,
  });
}
```

**Response**

```

{
  "doc_name": "2023-annual-report.pdf",
  "structure": "1. Executive Summary (p.1-3)\n  1.1 Key Findings (p.1)\n  1.2 Recommendations (p.2-3)\n2. Financial Overview (p.4-15)\n  ...",
  "total_parts": 1
}
```

* * *

### Get Page Content [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#get-page-content)

Read text content and image annotations for specific pages.

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| docName | string | yes | Document name | - |
| pages | string | yes | Page specification: single (`"5"`), comma-separated (`"3,7,10"`), or range (`"5-10"`) | - |
| waitForCompletion | boolean | no | Wait until processing completes | false |
| folderId | string | no | Folder scope override | - |

**Example**

```

const result = await client.tools.getPageContent({
  docName: "2023-annual-report.pdf",
  pages: "1-5",
});

for (const page of result.content) {
  console.log(`--- Page ${page.page} ---`);
  console.log(page.text);

  if (page.image_count && page.image_count > 0) {
    console.log(page.image_annotations);
  }
}
```

**Response**

```

{
  "doc_name": "2023-annual-report.pdf",
  "total_pages": 42,
  "requested_pages": 5,
  "returned_pages": 5,
  "content": [\
    {\
      "page": 1,\
      "text": "Executive Summary\n\nThis annual report presents...",\
      "image_count": 1,\
      "image_annotations": [\
        "Figure 1: Revenue growth chart — 2023-annual-report.pdf/images/page1_fig1.png"\
      ]\
    },\
    {\
      "page": 2,\
      "text": "Key Findings\n\n1. Revenue increased by 15%..."\
    }\
  ]
}
```

* * *

### Get Document Image [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#get-document-image)

Retrieve an embedded image as base64-encoded data. Image paths come from `getPageContent()` results.

**Parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| imagePath | string | yes | Image path in format `"<docName>/<imagePath>"`, from `getPageContent()` image annotations |

**Example**

```

const pages = await client.tools.getPageContent({
  docName: "2023-annual-report.pdf",
  pages: "1",
});

const annotation = pages.content[0].image_annotations?.[0];
const imagePath = annotation?.split(" — ")[1];

if (imagePath) {
  const image = await client.tools.getDocumentImage({ imagePath });
  console.log(image.mimeType); // "image/png"

  const buffer = Buffer.from(image.data, "base64");
  writeFileSync("chart.png", buffer);
}
```

* * *

### Recent Documents [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#recent-documents)

List recently created documents with processing status summary.

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| folderId | string | no | Filter by folder ID | - |
| cursor | string | no | Pagination cursor from previous response | - |
| limit | number | no | Maximum documents to return | - |

**Example**

```

const result = await client.tools.recentDocuments({ limit: 10 });

console.log(`Ready: ${result.ready_count}, Processing: ${result.processing_count}`);

for (const doc of result.docs) {
  console.log(`${doc.name} — ${doc.status}`);
}

if (result.has_more) {
  const next = await client.tools.recentDocuments({
    limit: 10,
    cursor: result.next_cursor,
  });
}
```

* * *

### Find Relevant Documents [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#find-relevant-documents)

Search documents by keyword or semantic query.

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| query | string | no | Search keywords | - |
| cursor | string | no | Pagination cursor | - |
| limit | number | no | Maximum results | - |
| folderId | string | no | Filter by folder ID | - |

**Example**

```

const result = await client.tools.findRelevantDocuments({
  query: "annual report 2023",
});

console.log(`Search mode: ${result.search_mode}`); // "keyword" | "smart"

for (const doc of result.docs) {
  console.log(`${doc.name} (${doc.pageNum} pages)`);
}
```

* * *

### Get Document (by Name) [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#get-document-by-name)

Look up a document by name, with optional wait for processing completion.

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| docName | string | yes | Document name | - |
| waitForCompletion | boolean | no | Wait until processing completes | false |
| folderId | string | no | Folder scope override | - |

**Example**

```

const doc = await client.tools.getDocument({
  docName: "2023-annual-report.pdf",
  waitForCompletion: true,
});

console.log(doc.status); // "completed"
```

* * *

### Remove Documents (Batch) [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#remove-documents-batch)

Delete multiple documents by name in a single operation.

**Parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| docNames | string\[\] | yes | Array of document names to delete |
| folderId | string | no | Folder scope override |

**Example**

```

const result = await client.tools.removeDocument({
  docNames: ["old-report.pdf", "draft-v1.pdf"],
});

console.log(`Deleted: ${result.successful}, Failed: ${result.failed}`);
```

* * *

### List Folders [Permalink for this section](https://docs.pageindex.ai/js-sdk/mcp-tools\#list-folders)

Retrieve folders, optionally filtered by parent. For full folder management (creating folders, folder scope, using folders with documents), see [Folders](https://docs.pageindex.ai/js-sdk/folders).

**Parameters**

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| parentFolderId | string | no | `"root"` for root-level only, a specific ID for children, or omit for all | all |

**Example**

```

const result = await client.tools.listFolders({ parentFolderId: "root" });
console.log(`Total folders: ${result.total}`);
```

