import type { Metadata } from "next";
import { bitter, golos, jetbrains } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endgrain Studio",
  description: "Проект торцевой разделочной доски: узор, распил, материал, себестоимость",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
