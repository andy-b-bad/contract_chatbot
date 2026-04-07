# [DeepSeek Provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#deepseek-provider)

The [DeepSeek](https://www.deepseek.com/) provider offers access to powerful language models through the DeepSeek API.

API keys can be obtained from the [DeepSeek Platform](https://platform.deepseek.com/api_keys).

## [Setup](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#setup)

The DeepSeek provider is available via the `@ai-sdk/deepseek` module. You can install it with:

pnpmnpmyarnbun

```
pnpm add @ai-sdk/deepseek
```

## [Provider Instance](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#provider-instance)

You can import the default provider instance `deepseek` from `@ai-sdk/deepseek`:

```ts
1import { deepseek } from '@ai-sdk/deepseek';
```

For custom configuration, you can import `createDeepSeek` and create a provider instance with your settings:

```ts
1import { createDeepSeek } from '@ai-sdk/deepseek';

2

3const deepseek = createDeepSeek({

4  apiKey: process.env.DEEPSEEK_API_KEY ?? '',

5});
```

You can use the following optional settings to customize the DeepSeek provider instance:

- **baseURL** _string_

Use a different URL prefix for API calls.
The default prefix is `https://api.deepseek.com`.

- **apiKey** _string_

API key that is being sent using the `Authorization` header. It defaults to
the `DEEPSEEK_API_KEY` environment variable.

- **headers** _Record<string,string>_

Custom headers to include in the requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise<Response>_

Custom [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) implementation.


## [Language Models](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#language-models)

You can create language models using a provider instance:

```ts
1import { deepseek } from '@ai-sdk/deepseek';

2import { generateText } from 'ai';

3

4const { text } = await generateText({

5  model: deepseek('deepseek-chat'),

6  prompt: 'Write a vegetarian lasagna recipe for 4 people.',

7});
```

You can also use the `.chat()` or `.languageModel()` factory methods:

```ts
1const model = deepseek.chat('deepseek-chat');

2// or

3const model = deepseek.languageModel('deepseek-chat');
```

DeepSeek language models can be used in the `streamText` function
(see [AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core)).

The following optional provider options are available for DeepSeek models:

- `thinking` _object_

Optional. Controls thinking mode (chain-of-thought reasoning). You can enable thinking mode either by using the `deepseek-reasoner` model or by setting this option.
  - `type`: `'enabled' | 'disabled'` \- Enable or disable thinking mode.

```ts
1import { deepseek, type DeepSeekLanguageModelOptions } from '@ai-sdk/deepseek';

2import { generateText } from 'ai';

3

4const { text, reasoning } = await generateText({

5  model: deepseek('deepseek-chat'),

6  prompt: 'How many "r"s are in the word "strawberry"?',

7  providerOptions: {

8    deepseek: {

9      thinking: { type: 'enabled' },

10    } satisfies DeepSeekLanguageModelOptions,

11  },

12});
```

### [Reasoning](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#reasoning)

DeepSeek has reasoning support for the `deepseek-reasoner` model. The reasoning is exposed through streaming:

```ts
1import { deepseek } from '@ai-sdk/deepseek';

2import { streamText } from 'ai';

3

4const result = streamText({

5  model: deepseek('deepseek-reasoner'),

6  prompt: 'How many "r"s are in the word "strawberry"?',

7});

8

9for await (const part of result.fullStream) {

10  if (part.type === 'reasoning') {

11    // This is the reasoning text

12    console.log('Reasoning:', part.text);

13  } else if (part.type === 'text') {

14    // This is the final answer

15    console.log('Answer:', part.text);

16  }

17}
```

See [AI SDK UI: Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#reasoning) for more details
on how to integrate reasoning into your chatbot.

### [Cache Token Usage](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#cache-token-usage)

DeepSeek provides context caching on disk technology that can significantly reduce token costs for repeated content. You can access the cache hit/miss metrics through the `providerMetadata` property in the response:

```ts
1import { deepseek } from '@ai-sdk/deepseek';

2import { generateText } from 'ai';

3

4const result = await generateText({

5  model: deepseek('deepseek-chat'),

6  prompt: 'Your prompt here',

7});

8

9console.log(result.providerMetadata);

10// Example output: { deepseek: { promptCacheHitTokens: 1856, promptCacheMissTokens: 5 } }
```

The metrics include:

- `promptCacheHitTokens`: Number of input tokens that were cached
- `promptCacheMissTokens`: Number of input tokens that were not cached

For more details about DeepSeek's caching system, see the [DeepSeek caching\\
documentation](https://api-docs.deepseek.com/guides/kv_cache#checking-cache-hit-status).

## [Model Capabilities](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek\#model-capabilities)

| Model | Text Generation | Object Generation | Image Input | Tool Usage | Tool Streaming |
| --- | --- | --- | --- | --- | --- |
| `deepseek-chat` |  |  |  |  |  |
| `deepseek-reasoner` |  |  |  |  |  |

Please see the [DeepSeek\\
docs](https://api-docs.deepseek.com/quick_start/pricing) for a full list of
available models. You can also pass any available provider model ID as a
string if needed.

On this page

[DeepSeek Provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#deepseek-provider)

[Setup](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#setup)

[Provider Instance](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#provider-instance)

[Language Models](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#language-models)

[Reasoning](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#reasoning)

[Cache Token Usage](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#cache-token-usage)

[Model Capabilities](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek#model-capabilities)

