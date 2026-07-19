import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeSecureMarkdownUrl } from './markdown-url.js';

type MessageMarkdownProps = {
  children: string;
  onOpenLink(url: string): Promise<void>;
};

export const MessageMarkdown = ({ children, onOpenLink }: MessageMarkdownProps) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    urlTransform={(url) => normalizeSecureMarkdownUrl(url) ?? ''}
    components={{
      a: ({ children: linkChildren, href }) => {
        const safeUrl = normalizeSecureMarkdownUrl(href);
        if (!safeUrl) return <span className="markdown-link-disabled">{linkChildren}</span>;
        return (
          <a
            href={safeUrl}
            onClick={(event) => {
              event.preventDefault();
              void onOpenLink(safeUrl);
            }}
          >
            {linkChildren}
          </a>
        );
      },
      img: ({ alt }) => (
        <span className="markdown-image-placeholder">{alt ? `图片：${alt}` : '图片链接'}</span>
      ),
    }}
  >
    {children}
  </ReactMarkdown>
);
