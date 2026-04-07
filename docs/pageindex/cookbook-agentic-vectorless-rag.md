# Agentic RAG with PageIndex MCP + OpenRouter

[PageIndex](https://github.com/VectifyAI/PageIndex) is a vectorless, reasoning-based retrieval framework. It transforms documents into hierarchical tree indexes and uses LLM reasoning to navigate the structure — without chunking, embeddings, or vector databases.

[PageIndex MCP](https://pageindex.ai/mcp) exposes this capability as a set of MCP tools (`get_document_structure`, `get_page_content`, etc.), enabling any MCP-compatible agent to retrieve from your documents.

This notebook demonstrates **agentic RAG** using [OpenRouter](https://openrouter.ai/) — a unified API gateway that provides access to models from many providers. We use the [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) with OpenRouter's OpenAI-compatible API to connect to PageIndex MCP. You can use models such as **Kimi K2.5** (default), **DeepSeek v3.2**, **GLM 5**, **MiniMax M2.5**, **Qwen 3.5**, and more; uncomment any model line in the code to switch.
### Install
%pip install -q --upgrade openai-agents pageindex
### Setup
from pageindex import PageIndexClient

# Get your PageIndex API key from https://dash.pageindex.ai/api-keys
PAGEINDEX_API_KEY = "YOUR_PAGEINDEX_API_KEY"

# Get your OpenRouter API key from https://openrouter.ai/keys
OPENROUTER_API_KEY = "YOUR_OPENROUTER_API_KEY"
### Upload a PDF
import os, requests, time

pi = PageIndexClient(api_key=PAGEINDEX_API_KEY)

pdf_url = "https://arxiv.org/pdf/1706.03762.pdf"  # Attention Is All You Need
pdf_path = os.path.join("../data", pdf_url.split("/")[-1])
os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

if not os.path.exists(pdf_path):
    with open(pdf_path, "wb") as f:
        f.write(requests.get(pdf_url).content)

doc_id = pi.submit_document(pdf_path)["doc_id"]
print(f"Submitted: {doc_id}")

while pi.get_document(doc_id)["status"] != "completed":
    time.sleep(5)
print(f"Ready: {pi.get_document(doc_id)['name']}")
### Ask a question

The OpenAI Agents SDK connects to PageIndex MCP via Streamable HTTP. All API calls are routed through OpenRouter — uncomment any `MODEL` line below to switch models.
from openai import AsyncOpenAI
from agents import Agent, Runner, ItemHelpers, ModelSettings
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from agents.mcp import MCPServerStreamableHttp
from agents.tracing import set_tracing_disabled

set_tracing_disabled(True)

openrouter_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

# Pick a model on OpenRouter
MODEL = "moonshotai/kimi-k2.5"
# MODEL = "deepseek/deepseek-v3.2"
# MODEL = "z-ai/glm-5"
# MODEL = "minimax/minimax-m2.5"
# MODEL = "qwen/qwen3.5-plus-02-15"
# and more ...

model = OpenAIChatCompletionsModel(
    model=MODEL,
    openai_client=openrouter_client,
)

async with MCPServerStreamableHttp(
    name="pageindex",
    params={
        "url": "https://api.pageindex.ai/mcp",
        "headers": {"Authorization": f"Bearer {PAGEINDEX_API_KEY}"},
    },
    cache_tools_list=True,
) as server:
    agent = Agent(
        name="PageIndex RAG Agent",
        model=model,
        instructions="Use the PageIndex MCP tools to answer questions about the user's documents.",
        mcp_servers=[server],
        model_settings=ModelSettings(
            extra_body={"reasoning": {"max_tokens": 2000}},
        ),
    )

    result = Runner.run_streamed(agent, "What are the evaluation methods in the first paper?")
    async for event in result.stream_events():
        if event.type == "run_item_stream_event":
            item = event.item
            if item.type == "reasoning_item":
                # OpenRouter returns reasoning text in content[0].text, not summary
                text = ""
                if item.raw_item.content:
                    text = item.raw_item.content[0].text[:300]
                elif item.raw_item.summary:
                    text = item.raw_item.summary[0].text[:300]
                print(f"[reasoning] {text if text else '(reasoning...)'}...\n")
            elif item.type == "tool_call_item":
                print(f"[tool_use] {item.raw_item.name}({item.raw_item.arguments})\n")
            elif item.type == "tool_call_output_item":
                print(f"[tool_result] {str(item.output)[:200]}...\n")
            elif item.type == "message_output_item":
                print(f"[answer]\n{ItemHelpers.text_message_output(item)}")