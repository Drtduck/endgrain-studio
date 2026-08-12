import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpHint } from "./help-hint";
import { useStudio } from "@/lib/store/studio";

describe("HelpHint", () => {
  afterEach(() => {
    act(() => {
      useStudio.getState().setLocale("ru");
    });
  });

  it("клик открывает попап с русским заголовком", async () => {
    render(<HelpHint id="palette" />);
    fireEvent.click(screen.getByTestId("help-palette"));
    const content = await screen.findByTestId("help-content-palette");
    expect(content.textContent ?? "").toContain("Палитра пород");
  });

  it("после смены локали попап показывает английский текст", async () => {
    render(<HelpHint id="palette" />);
    fireEvent.click(screen.getByTestId("help-palette"));
    await screen.findByTestId("help-content-palette");

    act(() => {
      useStudio.getState().setLocale("en");
    });

    const content = await screen.findByTestId("help-content-palette");
    expect(content.textContent ?? "").toContain("Species palette");
  });

  it("у триггера есть aria-label, начинающийся с 'Подсказка:'", () => {
    render(<HelpHint id="palette" />);
    const trigger = screen.getByTestId("help-palette");
    expect(trigger.getAttribute("aria-label") ?? "").toMatch(/^Подсказка:/);
  });
});
