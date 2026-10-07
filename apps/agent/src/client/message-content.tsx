import { isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [feedback, setFeedback] = useState("");
  return <button className="text-button copy-button" type="button" aria-label={label} onClick={() => {
    void navigator.clipboard.writeText(text).then(() => setFeedback("已复制"), () => setFeedback("复制失败，请手动选择文本"));
  }}>{feedback || label}</button>;
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ children?: ReactNode; className?: string }>(children) ? children : null;
  const text = typeof code?.props.children === "string" ? code.props.children : "";
  const language = code?.props.className?.replace(/^language-/, "") ?? "代码";
  return <div className="code-block"><div className="code-heading"><span>{language}</span><CopyButton text={text} label="复制代码"/></div><pre>{children}</pre></div>;
}
function MarkdownLink({ node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noopener noreferrer"/>;
}
const components: Components = {
  pre: CodeBlock,
  a: MarkdownLink,
  img: ({ alt }) => <span className="image-placeholder">[图片：{alt || "未加载"}]</span>,
  table: ({ children }: { children?: ReactNode }) => <div className="table-scroll"><table>{children}</table></div>,
};

export function MessageContent({ content, role }: { content: string; role: "user" | "assistant" }) {
  return role === "user" ? <div className="message-content">{content}</div>
    : <div className="message-content markdown"><Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{content}</Markdown></div>;
}
