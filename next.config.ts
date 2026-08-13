import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Фидбек умеет прикладывать файл (до 2 МБ) и автоскриншот экрана, оба
      // едут в server action строкой base64. Дефолтный лимит в 1 МБ на это не
      // рассчитан: 5 МБ покрывают вложение (~2.8M символов) плюс скриншот.
      bodySizeLimit: "5mb",
    },
  },
};

// pageExtensions не трогаем: статьи не лежат страницами в app/, их грузит
// динамический импорт по slug из app/(landing)/blog/[slug]/page.tsx. Плагины
// заданы строками, потому что Turbopack не умеет передавать функции через
// границу JS/Rust (rehype-autolink-headings поэтому не используется).
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

export default withMDX(nextConfig);
