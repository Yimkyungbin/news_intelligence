// 단위 테스트용 고정 데이터 (실제 응답 구조를 축약)

export const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example AI Blog</title>
    <link>https://blog.example.com/</link>
    <item>
      <title><![CDATA[Building <b>Agentic AI</b> systems &amp; tools]]></title>
      <link>https://blog.example.com/posts/agentic-ai#top</link>
      <description><![CDATA[<p>Hello <script>alert(1)</script>world &lt;3 &#x41;&#65;</p><img src=x onerror=alert(1)>]]></description>
      <dc:creator>Jane Doe</dc:creator>
      <pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate>
      <category>AI</category>
      <category>Agents</category>
    </item>
    <item>
      <title>Relative link post</title>
      <link>/posts/relative</link>
      <description>${"긴 요약 ".repeat(200)}</description>
    </item>
    <item>
      <title>Unsafe scheme</title>
      <link>javascript:alert(1)</link>
    </item>
    <item>
      <link>https://blog.example.com/no-title</link>
    </item>
  </channel>
</rss>`;

export const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>NVIDIA Technical Blog</title>
  <entry>
    <title type="html">Inference optimization for LLMs</title>
    <link rel="replies" href="https://developer.example.com/posts/1#comments"/>
    <link rel="alternate" type="text/html" href="https://developer.example.com/posts/1"/>
    <id>tag:example,2026:1</id>
    <published>2026-11-08T09:00:00Z</published>
    <updated>2026-11-09T09:00:00Z</updated>
    <author><name>John Roe</name></author>
    <summary type="html">&lt;p&gt;GPU inference tips&lt;/p&gt;</summary>
    <category term="Generative AI"/>
  </entry>
</feed>`;

export const ARXIV = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2611.00001v1</id>
    <title>Retrieval Augmented Generation
      Evaluation at Scale</title>
    <summary>We study RAG evaluation.</summary>
    <published>2026-11-07T18:00:00Z</published>
    <author><name>A. Researcher</name></author>
    <author><name>B. Scientist</name></author>
    <link href="http://arxiv.org/abs/2611.00001v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2611.00001v1" rel="related" type="application/pdf"/>
    <category term="cs.CL"/>
  </entry>
</feed>`;

export const XXE = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>
<rss version="2.0"><channel><item><title>&lol2;</title><link>https://x.example/</link></item></channel></rss>`;

export const HN_STORY = {
  by: "pg",
  descendants: 42,
  id: 50431058,
  score: 321,
  time: 1794268800,
  title: "Show HN: A multi-agent orchestration framework",
  type: "story",
  url: "https://example.org/agents",
};

export const HN_ASK = { by: "someone", id: 50431059, score: 10, time: 1794268800, title: "Ask HN: RAG in production?", type: "story", text: "<p>How do you <i>evaluate</i>?</p>" };

export const GITHUB_SEARCH = {
  total_count: 2,
  items: [
    {
      full_name: "example/agent-kit",
      html_url: "https://github.com/example/agent-kit",
      description: "Toolkit for AI agents",
      stargazers_count: 1500,
      created_at: "2026-10-20T00:00:00Z",
      owner: { login: "example" },
      topics: ["ai-agents", "llm"],
    },
    { full_name: "bad/repo", html_url: "ftp://github.com/bad/repo" },
  ],
};

export const HF_MODELS = [
  { id: "org/open-model-7b", likes: 120, downloads: 50000, pipeline_tag: "text-generation", createdAt: "2026-11-01T00:00:00.000Z", tags: ["transformers", "license:apache-2.0", "llm"] },
  { id: "../../etc/passwd", likes: 1 },
];
