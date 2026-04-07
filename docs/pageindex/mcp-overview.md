

### MCP

## PageIndex MCP for Developers [Permalink for this section](https://docs.pageindex.ai/mcp\#pageindex-mcp-for-developers)

Connect PageIndex to your agent framework or LLM via [MCP (Model Context Protocol)](https://modelcontextprotocol.io/). Works with _Claude Agent SDK_, _Vercel AI SDK_, _LangChain_, _OpenAI Agents SDK_, and any MCP-compatible client.

PageIndex MCP uses API Key authentication for reliable deployment in production. It shares the same [PageIndex API](https://docs.pageindex.ai/endpoints) under the hood, so your existing API key, documents, and plan work seamlessly across both REST and MCP access.

This PageIndex MCP is designed for developer integration in production environments. It does not share files or usage with [PageIndex Chat](https://pageindex.ai/chat), which is designed for end users.

### Integration [Permalink for this section](https://docs.pageindex.ai/mcp\#integration)

1. Go to the PageIndex [Developer Dashboard](https://dash.pageindex.ai/) to create an API Key.
2. Add to your MCP client configuration:

```

{
  "mcpServers": {
    "pageindex": {
      "type": "http",
      "url": "https://api.pageindex.ai/mcp",
      "headers": {
        "Authorization": "Bearer your_api_key"
      }
    }
  }
}
```

### Cookbook: MCP Integration Examples [Permalink for this section](https://docs.pageindex.ai/mcp\#cookbook-mcp-integration-examples)

Step-by-step Jupyter notebooks showing how to connect PageIndex MCP with popular agent frameworks and LLM APIs. Each notebook walks through performing agentic, reasoning-based retrieval with PageIndex from an uploaded PDF.

[Recommended\\
\\
Claude Messages API \\
\\
Anthropic · Claude Sonnet 4.6](https://docs.pageindex.ai/cookbook/mcp/claude-api) [OpenAI Responses API \\
\\
OpenAI · GPT-5.4](https://docs.pageindex.ai/cookbook/mcp/openai-api) [Gemini Interactions API \\
\\
Google · Gemini 2.5 Pro](https://docs.pageindex.ai/cookbook/mcp/gemini-api) [Recommended\\
\\
Claude Agent SDK \\
\\
Anthropic · Claude Sonnet 4.6](https://docs.pageindex.ai/cookbook/mcp/claude-agent-sdk) [OpenAI Agents SDK \\
\\
OpenAI · GPT-5.4](https://docs.pageindex.ai/cookbook/mcp/openai-agents-sdk) [Google ADK \\
\\
Google · Gemini 3.1 Pro](https://docs.pageindex.ai/cookbook/mcp/google-adk) [LangChain / LangGraph \\
\\
LangChain · Claude Sonnet 4.6](https://docs.pageindex.ai/cookbook/mcp/langchain) [DeepAgents \\
\\
LangChain · Claude Sonnet 4.6](https://docs.pageindex.ai/cookbook/mcp/deepagents) [OpenRouter \\
\\
Kimi, DeepSeek, GLM, Qwen, etc.](https://docs.pageindex.ai/cookbook/mcp/openrouter)

See more notebooks and details in the [MCP Integration Cookbook](https://docs.pageindex.ai/cookbook/mcp).

### Open Source [Permalink for this section](https://docs.pageindex.ai/mcp\#open-source)

The PageIndex MCP server is open-source. For more details, visit the PageIndex MCP [GitHub repo](https://github.com/VectifyAI/pageindex-mcp).

## Community & Support [Permalink for this section](https://docs.pageindex.ai/mcp\#community--support)

- [Star us on GitHub](https://github.com/VectifyAI/PageIndex)
- [Join our Discord](https://discord.gg/VuXuf29EUj)
- [Leave us a message](https://ii2abc2jejf.typeform.com/to/tK3AXl8T)

Last updated onMarch 23, 2026

[Pricing](https://docs.pageindex.ai/pricing "[object Object]") [Python SDK](https://docs.pageindex.ai/sdk "[object Object]")

* * *