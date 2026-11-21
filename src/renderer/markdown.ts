import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, breaks: true });
// Display link labels without navigation. Keep the paper local and self-contained.
markdown.renderer.rules.link_open = () => '<span class="markdown-link">';
markdown.renderer.rules.link_close = () => '</span>';
markdown.renderer.rules.image = (tokens, index) =>
  markdown.utils.escapeHtml(tokens[index].content);

(window as any).renderMarkdown = (text: string) => markdown.render(String(text || "")).trim();
