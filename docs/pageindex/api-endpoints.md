## API Endpoints

## 📑 PageIndex API Endpoints [Permalink for this section](https://docs.pageindex.ai/endpoints\#-pageindex-api-endpoints)

[**Document Processing**\\
\\
Upload, process, and manage PDF documents](https://docs.pageindex.ai/endpoints#-pageindex-pdf-processing-api-endpoints) [**Chat API ( _beta_)**\\
\\
Conversational AI over your documents](https://docs.pageindex.ai/endpoints#-pageindex-chat-api-beta) [**Markdown Processing**\\
\\
Convert markdown to tree structures](https://docs.pageindex.ai/endpoints#-markdown-processing-api) [**Retrieval ( _legacy_)**\\
\\
Query and retrieve from processed documents](https://docs.pageindex.ai/endpoints#-pageindex-retrieval-api-legacy)

All endpoints require an `api_key` header. You can get your API key from the [Developer Dashboard](https://dash.pageindex.ai/).

## 🌲 Document Processing API [Permalink for this section](https://docs.pageindex.ai/endpoints\#-document-processing-api)

### Submit Document for Processing [Permalink for this section](https://docs.pageindex.ai/endpoints\#submit-document-for-processing)

- **Endpoint:**`POST``https://api.pageindex.ai/doc/`
- **Description:** Uploads a PDF document for processing. The system automatically processes PageIndex index building, then immediately returns a document identifier (`doc_id`) for subsequent operations.

**Request Body (multipart/form-data):**

- `file` (binary, required): PDF document.

**Example**

```

import requests

api_key = "YOUR_API_KEY"
file_path = "./2023-annual-report.pdf"

with open(file_path, "rb") as file:
    response = requests.post(
        "https://api.pageindex.ai/doc/",
        headers={"api_key": api_key},
        files={"file": file}
    )
```

**Example Response:**

```

{ "doc_id": "pi-abc123def456" }
```

* * *

### Get Processing Status & Results [Permalink for this section](https://docs.pageindex.ai/endpoints\#get-processing-status--results)

- **Endpoint:**`GET``https://api.pageindex.ai/doc/{doc_id}/`
- **Description:** Check processing status and (when complete) get the results for a submitted document.

**Parameters (URL Path):**

- `doc_id` (string, required): Document ID.

**Query Parameters:**

- `type` (string, optional): Result type. Use `"tree"` for tree structure or `"ocr"` for OCR results. If not specified, returns the default result type based on the original processing type.
- `format` (string, optional): For OCR results, specify output format. Use `"page"` (default) for page-based results, `"node"` for node-based results, or `"raw"` for concatenated markdown.
- `summary` (boolean, optional): For tree results, include node summary for each node in response. Default is `false`.

**Example - Get OCR Results:**

```

import requests

api_key = "YOUR_API_KEY"
doc_id = "pi-abc123def456"

# Get OCR results (default, in page format)
response = requests.get(
    f"https://api.pageindex.ai/doc/{doc_id}/?type=ocr",
    headers={"api_key": api_key}
)

# Get OCR results in node format
response = requests.get(
    f"https://api.pageindex.ai/doc/{doc_id}/?type=ocr&format=node",
    headers={"api_key": api_key}
)

# Get OCR results in raw format (concatenated markdown)
response = requests.get(
    f"https://api.pageindex.ai/doc/{doc_id}/?type=ocr&format=raw",
    headers={"api_key": api_key}
)
```

**Example - Get Tree Structure:**

```

import requests

api_key = "YOUR_API_KEY"
doc_id = "pi-abc123def456"

response = requests.get(
    f"https://api.pageindex.ai/doc/{doc_id}/?type=tree",
    headers={"api_key": api_key}
)
```

**Example Response (Tree Processing):**

```

{
  "doc_id": "pi-abc123def456",
  "status": "processing",
  "retrieval_ready": false
}
```

**Example Response (Tree Completed):**

```

{
  "doc_id": "pi-abc123def456",
  "status": "completed",
  "retrieval_ready": true,
  "result": [\
    ...\
    {\
      "title": "Financial Stability",\
      "node_id": "0006",\
      "page_index": 21,\
      "text": "The Federal Reserve maintains financial stability through comprehensive monitoring and regulatory oversight...",\
      "nodes": [\
        {\
          "title": "Monitoring Financial Vulnerabilities",\
          "node_id": "0007",\
          "page_index": 22,\
          "text": "The Federal Reserve's monitoring focuses on identifying and assessing potential risks..."\
        },\
        {\
          "title": "Domestic and International Cooperation and Coordination",\
          "node_id": "0008",\
          "page_index": 28,\
          "text": "In 2023, the Federal Reserve collaborated internationally with central banks and regulatory authorities..."\
        }\
      ]\
    }\
    ...\
  ]
}
```

**Notes:**

- For tree index generation: The `"result"` field contains the hierarchical tree structure.
- For OCR processing: The `"result"` field format depends on the `format` parameter:
  - `"page"` (default): List of page objects, each containing `page_index`, `markdown`, and `images`
  - `"node"`: List of node objects, organized by document structure
  - `"raw"`: Single string containing all markdown content concatenated together
- `page_index` is 1-based (the first page is 1).
- `markdown` contains the recognized text in markdown format.
- `images` is a list of base64-encoded images detected on that page; it may be empty.

* * *

### Get Document Metadata [Permalink for this section](https://docs.pageindex.ai/endpoints\#get-document-metadata)

- **Endpoint:**`GET``https://api.pageindex.ai/doc/{doc_id}/metadata`
- **Description:** Retrieve document metadata including processing status, page count, and creation time.

**Parameters (URL Path):**

- `doc_id` (string, required): Document ID.

**Example:**

```

import requests

api_key = "YOUR_API_KEY"
doc_id = "pi-abc123def456"

response = requests.get(
    f"https://api.pageindex.ai/doc/{doc_id}/metadata",
    headers={"api_key": api_key}
)
```

**Example Response:**

```

{
  "id": "pi-abc123def456",
  "name": "research_paper.pdf",
  "description": "Machine Learning Research Paper",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "pageNum": 42
}
```

* * *

### List Documents [Permalink for this section](https://docs.pageindex.ai/endpoints\#list-documents)

- **Endpoint:**`GET``https://api.pageindex.ai/docs`
- **Description:** Retrieve a paginated list of all documents, ordered by creation date (newest first).

**Query Parameters:**

- `limit` (int, optional): Maximum number of documents to return (1-100). Default: `50`.
- `offset` (int, optional): Number of documents to skip for pagination. Default: `0`.

**Example:**

```

import requests

api_key = "YOUR_API_KEY"

response = requests.get(
    "https://api.pageindex.ai/docs",
    headers={"api_key": api_key},
    params={"limit": 10, "offset": 0}
)
```

**Example Response:**

```

{
  "documents": [\
    {\
      "id": "pi-abc123def456",\
      "name": "research_paper.pdf",\
      "description": "Machine Learning Research Paper",\
      "status": "completed",\
      "createdAt": "2024-01-15T10:30:00.000Z",\
      "pageNum": 42\
    }\
  ],
  "total": 25,
  "limit": 10,
  "offset": 0
}
```

* * *

### Delete a Document [Permalink for this section](https://docs.pageindex.ai/endpoints\#delete-a-document)

- **Endpoint:**`DELETE``https://api.pageindex.ai/doc/{doc_id}/`
- **Description:** Permanently delete a PageIndex document and all its associated data.

**Parameters (URL Path):**

- `doc_id` (string, required): Document ID.

**Example:**

```

import requests

api_key = "YOUR_API_KEY"
doc_id = "pi-abc123def456"

response = requests.delete(
    f"https://api.pageindex.ai/doc/{doc_id}/",
    headers={"api_key": api_key}
)
```

## 💭 Chat API ( _beta_) [Permalink for this section](https://docs.pageindex.ai/endpoints\#-chat-api-beta)

The PageIndex Chat API ( _beta_) provides conversational AI with integrated access to your PageIndex documents.

**Endpoint:**`POST``https://api.pageindex.ai/chat/completions`

### Request [Permalink for this section](https://docs.pageindex.ai/endpoints\#request)

**Parameters**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `messages` | Array | Yes | - | Conversation messages |
| `stream` | Boolean | No | `false` | Enable streaming |
| `doc_id` | String \| Array | No | `null` | The ID(s) of document(s) to select |
| `temperature` | Float | No | `null` | Sampling temperature (0.0 to 1.0). Lower is more deterministic. |
| `enable_citations` | Boolean | No | `false` | Enable inline citations in responses (e.g., `<doc=file.pdf;page=1>`) |

**Authentication**

Include your PageIndex API key in the request header:

```

api_key: YOUR_PAGEINDEX_API_KEY
```

**Example Request Body**

```

{
  "messages": [\
    {\
      "role": "user",\
      "content": "What are the key findings of the first paper?"\
    }\
  ],
  "stream": false
}
```

**Example Request with Document ID**

When you include a `doc_id`, your query is scoped to that specific document. You can pass a single document ID as a string, or multiple IDs as an array.

**Single Document ID:**

```

{
  "doc_id": "pi-123456",
  "messages": [\
    {\
      "role": "user",\
      "content": "What are the key findings of this document?"\
    }\
  ],
  "stream": false
}
```

**Multiple Document IDs:**

```

{
  "doc_id": ["pi-123456", "pi-789012"],
  "messages": [\
    {\
      "role": "user",\
      "content": "Compare these documents"\
    }\
  ],
  "stream": false
}
```

* * *

### Response [Permalink for this section](https://docs.pageindex.ai/endpoints\#response)

#### Non-Streaming Response [Permalink for this section](https://docs.pageindex.ai/endpoints\#non-streaming-response)

```

{
  "id": "chat_completion_id",
  "choices": [\
    {\
      "message": {\
        "role": "assistant",\
        "content": "The key findings are..."\
      },\
      "finish_reason": "end_turn"\
    }\
  ],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801
  }
}
```

#### Streaming Response [Permalink for this section](https://docs.pageindex.ai/endpoints\#streaming-response)

Server-Sent Events (SSE) format:

```

data: {"choices":[{"delta":{"content":"The"}}]}
data: {"choices":[{"delta":{"content":" key"}}]}
data: {"choices":[{"delta":{"content":" findings"}}]}
...
data: [DONE]
```

* * *

### Python Examples [Permalink for this section](https://docs.pageindex.ai/endpoints\#python-examples)

#### Non-Streaming [Permalink for this section](https://docs.pageindex.ai/endpoints\#non-streaming)

```

import requests

response = requests.post(
    "https://api.pageindex.ai/chat/completions",
    headers={
        "api_key": "your-pageindex-api-key",
        "Content-Type": "application/json"
    },
    json={
        "messages": [\
            {"role": "user", "content": "What is the first paper about?"}\
        ]
    }
)

result = response.json()
print(result["choices"][0]["message"]["content"])
```

#### Streaming with Document ID [Permalink for this section](https://docs.pageindex.ai/endpoints\#streaming-with-document-id)

```

import requests
import json

response = requests.post(
    "https://api.pageindex.ai/chat/completions",
    headers={
        "api_key": "your-pageindex-api-key",
        "Content-Type": "application/json"
    },
    json={
        "doc_id": "pi-123456",
        "messages": [\
            {"role": "user", "content": "What are the key findings of this document?"}\
        ],
        "stream": True,
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = line[6:]
            if data == '[DONE]':
                break

            chunk = json.loads(data)
            content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
            if content:
                print(content, end='', flush=True)
```

#### Access Intermediate Data in Streaming [Permalink for this section](https://docs.pageindex.ai/endpoints\#access-intermediate-data-in-streaming)

Track what documents and tools are being accessed in real-time:

```

import requests
import json

response = requests.post(
    "https://api.pageindex.ai/chat/completions",
    headers={
        "api_key": "your-pageindex-api-key",
        "Content-Type": "application/json"
    },
    json={
        "messages": [\
            {"role": "user", "content": "What is the first paper about?"}\
        ],
        "stream": True
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = line[6:]
            if data == '[DONE]':
                break

            chunk = json.loads(data)

            # Get intermediate metadata
            metadata = chunk.get("block_metadata", {})
            if metadata:
                block_type = metadata.get("type")
                block_index = metadata.get("block_index")

                # Tool call started
                if block_type == "mcp_tool_use_start":
                    tool_name = metadata.get("tool_name")
                    server_name = metadata.get("server_name")
                    print(f"\n[Block #{block_index}: Calling {tool_name}]\n")

                # Tool result received
                elif block_type == "mcp_tool_result_start":
                    print(f"\n[Block #{block_index}: Tool result received]\n")

            # Get content
            content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
            if content:
                print(content, end='', flush=True)
```

**Available block types:**

- `text_block_start` / `text_stop` \- Text content
- `mcp_tool_use_start` / `mcp_tool_use_stop` \- PageIndex tool being called
- `mcp_tool_result_start` / `mcp_tool_result_stop` \- PageIndex tool results received

* * *

## 📝 Markdown Processing API [Permalink for this section](https://docs.pageindex.ai/endpoints\#-markdown-processing-api)

### Convert markdown files to PageIndex tree structures without PDF conversion.

### Convert Markdown to Tree [Permalink for this section](https://docs.pageindex.ai/endpoints\#convert-markdown-to-tree)

- **Endpoint:**`POST``https://api.pageindex.ai/markdown/`
- **Description:** Upload a markdown file and convert it directly to a hierarchical tree structure. This endpoint extracts the document structure based on markdown headers (#, ##, ###, etc.) and optionally applies tree thinning and generates summaries.

**Request Body (multipart/form-data):**

_Required Parameters:_

- `file` (binary, required): Markdown document (.md or .markdown files).

_Optional Parameters:_

- `if_add_node_id` (string, optional): Whether to add node IDs. Options: `"yes"` or `"no"`. Default: `"yes"`.
- `if_add_node_summary` (string, optional): Whether to add node summaries. Options: `"yes"` or `"no"`. Default: `"yes"`.
- `if_add_node_text` (string, optional): Whether to include node text content. Options: `"yes"` or `"no"`. Default: `"yes"`.
- `if_add_doc_description` (string, optional): Whether to add document description. Options: `"yes"` or `"no"`. Default: `"no"`.

**Example:**

```

import requests

api_key = "YOUR_API_KEY"

with open("./README.md", "rb") as file:
    response = requests.post(
        "https://api.pageindex.ai/markdown/",
        headers={"api_key": api_key},
        files={"file": file}
    )

result = response.json()
```

**Example Response:**

```

{
  "success": true,
  "doc_name": "README",
  "structure": [\
    {\
      "title": "Getting Started",\
      "node_id": "0000",\
      "summary": "Introduction and setup guide for the API...",\
      "line_num": 1,\
      "nodes": [\
        {\
          "title": "Installation",\
          "node_id": "0001",\
          "summary": "Installation instructions using pip...",\
          "line_num": 5\
        },\
        {\
          "title": "Authentication",\
          "node_id": "0002",\
          "summary": "How to authenticate with the API...",\
          "line_num": 10\
        }\
      ]\
    }\
  ]
}
```

**Notes:**

- Tree thinning can be applied to merge small nodes with their children when token count is below the threshold.
- Node summaries and document descriptions are generated using the specified LLM model.
- The `line_num` field indicates the starting line number of each section in the original markdown file.

* * *
