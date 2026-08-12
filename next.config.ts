import type { NextConfig } from "next";

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

export default nextConfig;
