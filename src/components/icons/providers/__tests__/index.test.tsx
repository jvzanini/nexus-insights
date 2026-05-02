/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render } from "@testing-library/react";

import {
  AnthropicIcon,
  GeminiIcon,
  getProviderIcon,
  OpenAIIcon,
  OpenRouterIcon,
} from "@/components/icons/providers";

describe("ProviderIcons", () => {
  it("OpenAIIcon renderiza svg com viewBox 24x24", () => {
    const { container } = render(<OpenAIIcon data-testid="openai" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("AnthropicIcon renderiza svg com viewBox 24x24", () => {
    const { container } = render(<AnthropicIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("GeminiIcon renderiza svg com viewBox 24x24", () => {
    const { container } = render(<GeminiIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("OpenRouterIcon renderiza svg com viewBox 24x24", () => {
    const { container } = render(<OpenRouterIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("aceita className/props extras", () => {
    const { container } = render(<OpenAIIcon className="size-4 text-violet-500" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-4", "text-violet-500");
  });

  it("usa fill=currentColor (compatível com light/dark)", () => {
    const { container } = render(<AnthropicIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("fill", "currentColor");
  });
});

describe("getProviderIcon", () => {
  it("retorna componente para chaves válidas", () => {
    expect(getProviderIcon("openai")).toBe(OpenAIIcon);
    expect(getProviderIcon("anthropic")).toBe(AnthropicIcon);
    expect(getProviderIcon("gemini")).toBe(GeminiIcon);
    expect(getProviderIcon("openrouter")).toBe(OpenRouterIcon);
  });

  it("retorna null para chaves desconhecidas", () => {
    expect(getProviderIcon("xxx")).toBeNull();
    expect(getProviderIcon("")).toBeNull();
    expect(getProviderIcon("OpenAI")).toBeNull();
  });
});
